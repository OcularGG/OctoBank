const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');  // Assuming you have a db.js file for database connection

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
        .setName('masspay')
        .setDescription('Give or withdraw coins from multiple users')
        .addIntegerOption(option => option.setName('amount').setDescription('Amount of coins to send or withdraw').setRequired(true))
        .addStringOption(option => option.setName('users').setDescription('The users to send coins to or withdraw from (mention multiple users)').setRequired(true)),

    async execute(interaction) {
        // Acknowledge the interaction and defer the reply to prevent timeout
        await interaction.deferReply({ flags: 64 }); // Ephemeral and prevents timeout

        const amount = interaction.options.getInteger('amount');
        const userInput = interaction.options.getString('users');
        const sender = interaction.user.username;

        // Split the userInput string into an array of mentioned users
        const mentionedUsers = userInput.match(/<@!?(\d+)>/g); // Regex to match user mentions, e.g., <@123456789>

        if (!mentionedUsers || mentionedUsers.length === 0) {
            return interaction.editReply({ content: 'Please mention at least one user.' });
        }

        // Check if amount is 0
        if (amount === 0) {
            return interaction.editReply({ content: 'The amount must be greater than or less than zero.' });
        }

        // Ensure the mentioned users are valid and format them properly
        const users = mentionedUsers.map(user => user.replace(/<@!?(\d+)>/, '$1'));

        const connection = await db.getConnection();
        const failedUsers = []; // Array to store users that failed the transaction
        const usersList = []; // Array to store successfully processed users for display

        try {
            // Get the next callback ID
            const callbackId = await getNextCallbackId();

            // Convert callbackId to integer (parseInt())
            const parsedCallbackId = parseInt(callbackId, 10);

            // Start a transaction
            await connection.beginTransaction();

            // Iterate over all mentioned users
            for (const userId of users) {
                const user = await interaction.client.users.fetch(userId);

                try {
                    // Fetch the recipient's balance
                    const [recipientRows] = await connection.query('SELECT balance FROM coins WHERE username = ?', [user.username]);
                    if (recipientRows.length === 0) {
                        // If the recipient doesn't exist, insert them with an initial balance of 0
                        await connection.query('INSERT INTO coins (username, balance) VALUES (?, ?)', [user.username, 0]);
                    }

                    const recipientBalance = recipientRows[0]?.balance || 0;

                    // Update the recipient's balance (give or withdraw)
                    const newRecipientBalance = recipientBalance + amount;
                    await connection.query('UPDATE coins SET balance = ? WHERE username = ?', [newRecipientBalance, user.username]);

                    usersList.push(user.username); // Add to list of successfully processed users

                    // Log the action in the auditlog table for each user with the callback ID
                    await logAudit(amount < 0 ? 'withdraw' : 'deposit', sender, user.username, amount, parsedCallbackId);

                } catch (err) {
                    console.error(err);
                    failedUsers.push(userId); // Add to list of failed users
                }
            }

            // Commit the transaction
            await connection.commit();

            // Prepare the embed message
            const actionType = amount < 0 ? 'withdraw' : 'deposit';
            const formattedAmount = Math.abs(amount).toLocaleString();
            let actionMessage = actionType === 'withdraw'
                ? `**${interaction.user.username}** has withdrawn <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold from the following users' wallets:\n${usersList.join('\n')}`
                : `**${interaction.user.username}** has deposited <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold into the following users' wallets:\n${usersList.join('\n')}`;

            // Add failed users to the message if any
            if (failedUsers.length > 0) {
                actionMessage += `\n\n⚠️ Could not process transactions for the following users:\n${failedUsers
                    .map((id) => `<@${id}>`)
                    .join('\n')}`;
            }

            const actionText = actionType === 'withdraw'
                ? '[**Octobank Mass Withdrawal**](https://octobank.ocular-gaming.net/)'
                : '[**Octobank Mass Deposit**](https://octobank.ocular-gaming.net/)';

            // Create the embed with the updated information
            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setTitle('Mass Transaction Successful')
                .setDescription(`${actionText}\n\n${actionMessage}`)
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: `Command ID: ${parsedCallbackId}` }) // Add the parsed callback ID at the bottom of the embed
                .setTimestamp();

            // Send the embed as a reply
            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            // Rollback in case of error
            await connection.rollback();
            return interaction.editReply({ content: 'There was an error processing the mass transaction.' }); // Ephemeral response
        } finally {
            // Release the connection back to the pool
            connection.release();
        }
    },
};
