const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db'); // Assuming you have a db.js file for database connection

// Function to log the action in the auditlog table
async function logAudit(action, sender, target, amount, callbackId) {
    const query = `
        INSERT INTO auditlog (action, sender, target, amount, callback)
        VALUES (?, ?, ?, ?, ?);
    `;
    try {
        await db.query(query, [action, sender, target, amount, callbackId]);
    } catch (error) {
        console.error('Error logging audit:', error);
    }
}

// Function to get the next callback ID
async function getNextCallbackId() {
    const query = 'SELECT MAX(callback) AS maxCallbackId FROM auditlog';
    const [result] = await db.query(query);
    // Ensure we add 1 to the maximum callback value and parse it to an integer
    const maxCallbackId = parseInt(result[0]?.maxCallbackId || '0', 10);
    return maxCallbackId + 1; // Increment the callbackId by 1
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lootsplit')
        .setDescription('Split loot among users after subtracting repair cost')
        .addIntegerOption(option => option.setName('amount').setDescription('Total loot amount').setRequired(true))
        .addIntegerOption(option => option.setName('repaircost').setDescription('Repair cost to subtract').setRequired(true))
        .addStringOption(option => option.setName('users').setDescription('Users to split the loot with').setRequired(true)),

    async execute(interaction) {
        try {
            // Acknowledge the interaction and defer the reply to prevent timeout
            await interaction.deferReply(); // Removed ephemeral flag to make it visible to everyone

            const sender = interaction.user;
            const amount = interaction.options.getInteger('amount'); // Total loot amount
            const repairCost = interaction.options.getInteger('repaircost'); // Repair cost to subtract
            const userInput = interaction.options.getString('users'); // Users to split the loot with (as a string)

            // Check if the user has the "Teller" role
            const tellerRole = interaction.guild.roles.cache.find(role => role.name === "Teller");
            if (!tellerRole || !interaction.member.roles.cache.has(tellerRole.id)) {
                return interaction.editReply({ content: 'You must have the "Teller" role to use this command.' });
            }

            // Validate inputs
            if (isNaN(amount) || isNaN(repairCost) || amount <= 0 || repairCost < 0) {
                return interaction.editReply('Invalid command usage! Example: `/lootsplit 100 10 @user1 @user2 @user3`');
            }

            // Calculate the remaining loot after subtracting repair cost
            const remainingLoot = amount - repairCost;
            if (remainingLoot <= 0) {
                return interaction.editReply('The loot after subtracting the repair cost must be greater than 0.');
            }

            // Calculate the bot's 20% share (rounded down)
            const botShare = Math.floor(remainingLoot * 0.2);
            const userShare = remainingLoot - botShare;

            // Parse the userInput string into an array of user IDs
            const mentionedUsers = userInput.match(/<@!?(\d+)>/g)?.map((mention) => mention.replace(/[<@!>]/g, '')) || [];
            if (mentionedUsers.length === 0) {
                return interaction.editReply('No valid users mentioned to split the loot with!');
            }

            // Calculate how much each user gets (rounded down)
            const individualShare = Math.floor(userShare / mentionedUsers.length);

            let userDetails = ""; // Store user split details
            const userUpdates = [];
            const auditLogs = [];

            // Generate the callbackId once before the loop
            const callbackId = await getNextCallbackId();

            // Process each mentioned user
            for (const userId of mentionedUsers) {
                const targetUser = await interaction.guild.members.fetch(userId);
                if (!targetUser) continue;

                const username = targetUser.user.username;
                // Retrieve or initialize the recipient's balance in the database
                const [recipientRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [username]);
                const recipientBalance = recipientRows.length > 0 ? recipientRows[0].balance : 0;

                // Update the recipient's balance with the individual share
                const newRecipientBalance = recipientBalance + individualShare;
                
                // Update or insert the recipient's balance
                await db.query('INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?', [username, newRecipientBalance, newRecipientBalance]);

                // Log the action in the auditlog table for this user
                await logAudit('lootsplit', sender.username, username, individualShare, callbackId);

                userUpdates.push({ username, coins: newRecipientBalance });
                auditLogs.push({ action: 'lootsplit', sender: sender.username, target: username, amount: individualShare, callbackId });

                const balanceTotal = newRecipientBalance.toLocaleString();
                userDetails += `**${username}** received <:OctoGold:1324817815470870609> **${individualShare.toLocaleString()}** OctoGold, and now has <:OctoGold:1324817815470870609> **${balanceTotal}** OctoGold\n`;
            }

            // Update the bank's balance (20% share for OctoBank)
            const [bankRows] = await db.query('SELECT balance FROM coins WHERE username = ?', ['OctoBank']);
            const bankBalance = bankRows.length > 0 ? bankRows[0].balance : 0;
            const newBankBalance = bankBalance + botShare;

            // Update or insert the bank's balance
            await db.query('INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?', ['OctoBank', newBankBalance, newBankBalance]);

            // Log the bank's share
            await logAudit('lootsplit', sender.username, 'OctoBank', botShare, callbackId);

            userUpdates.push({ username: 'OctoBank', coins: newBankBalance });
            auditLogs.push({ action: 'lootsplit', sender: sender.username, target: 'OctoBank', amount: botShare, callbackId });

            // Constructing the embed content
            const embedContent = `
**Loot Split**
<:OctoGold:1324817815470870609> **${amount.toLocaleString()}** OctoGold is being split.

__**Repair:**__ <:OctoGold:1324817815470870609> **${repairCost.toLocaleString()}** OctoGold
__**Guild Tax:**__ <:OctoGold:1324817815470870609> **${botShare.toLocaleString()}** OctoGold
__**Being Split:**__ <:OctoGold:1324817815470870609> **${remainingLoot.toLocaleString()}** OctoGold to **${mentionedUsers.length}** players. Each share is worth <:OctoGold:1324817815470870609> **${individualShare.toLocaleString()}** OctoGold.

${userDetails}
`;

            // Maximum embed description size (Discord limit)
            const MAX_EMBED_SIZE = 4096;
            const embeds = [];

            let currentEmbedContent = embedContent.trim();

            // Split content into multiple embeds if necessary
            while (currentEmbedContent.length > MAX_EMBED_SIZE) {
                const lastLineBreak = currentEmbedContent.lastIndexOf('\n', MAX_EMBED_SIZE);
                const splitPoint = lastLineBreak === -1 ? MAX_EMBED_SIZE : lastLineBreak;

                const embedContentSlice = currentEmbedContent.slice(0, splitPoint);
                embeds.push(new EmbedBuilder()
                    .setColor('#ffbf00')
                    .setDescription(embedContentSlice)
                    .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                    .setFooter({ 
                        text: `ID: ${callbackId} | Transaction processed by ${interaction.user.username}`, 
                        iconURL: interaction.user.displayAvatarURL() // Add the user's profile picture in the footer
                    })
                    .setTimestamp()
                );

                currentEmbedContent = currentEmbedContent.slice(splitPoint).trim();
            }

            // Add the remaining content as the final embed
            if (currentEmbedContent.length > 0) {
                embeds.push(new EmbedBuilder()
                    .setColor('#ffbf00')
                    .setDescription(currentEmbedContent)
                    .setAuthor({ 
                        name: interaction.client.user.username, 
                        iconURL: interaction.client.user.displayAvatarURL() 
                    })
                    .setFooter({ 
                        text: `ID: ${callbackId} | Transaction processed by ${interaction.user.username}`, 
                        iconURL: interaction.user.displayAvatarURL() // Add the user's profile picture in the footer
                    })
                    .setTimestamp()
                );
            }
            

            // Send all the embeds at once
            await interaction.editReply({ embeds }); // This will make the reply visible to everyone
        } catch (error) {
            console.error('Error executing loot split command:', error);
            await interaction.followUp({ content: 'There was an error processing your request.' });
        }
    },
};
