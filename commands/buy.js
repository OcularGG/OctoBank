const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
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
    const maxCallbackId = parseInt(result[0]?.maxCallbackId || '0', 10);
    return maxCallbackId + 1; // Increment the callbackId by 1
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Allow a user to purchase an item using their OctoGold.')
        .addUserOption(option => option.setName('user').setDescription('User to buy for').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount of OctoGold to spend').setRequired(true)),

    async execute(interaction) {
        // Acknowledge the interaction and defer the reply to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        const sender = interaction.user;
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const targetUsername = targetUser.username;

        // Check if the user has the "Teller" role
        const tellerRole = interaction.guild.roles.cache.find(role => role.name === "Teller");
        if (!tellerRole || !interaction.member.roles.cache.has(tellerRole.id)) {
            return interaction.editReply({ content: 'You must have the "Teller" role to use this command.' });
        }

        // Validate input
        if (isNaN(amount) || amount <= 0) {
            return interaction.editReply('Invalid command usage! Example: `/buy @user 100`');
        }

        // Retrieve the target user's balance from the database
        const [recipientRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [targetUsername]);
        const currentBalance = recipientRows.length > 0 ? recipientRows[0].balance : 0;

        // Format amount for display
        const formattedAmount = amount.toLocaleString();

        // Check if the user has enough balance to make the purchase
        if (currentBalance < amount) {
            const amountToGoNegative = (amount - currentBalance).toLocaleString();

            // Create a warning embed with confirmation buttons
            const warningEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`**Warning:** **${targetUsername}** is about to go into the negative by <:OctoGold:1324817815470870609> **${amountToGoNegative}** OctoGold! Are you sure you want to proceed?`);

            const yesButton = new ButtonBuilder()
                .setCustomId('yes')
                .setLabel('Yes')
                .setStyle(ButtonStyle.Success);

            const noButton = new ButtonBuilder()
                .setCustomId('no')
                .setLabel('No')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(yesButton, noButton);

            await interaction.editReply({
                embeds: [warningEmbed],
                components: [row],
                ephemeral: true,
            });

            // Collect user response (Yes/No)
            const filter = (buttonInteraction) => buttonInteraction.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({
                filter,
                time: 60000, // 60 seconds to respond
            });

            collector.on('collect', async (buttonInteraction) => {
                const callbackId = await getNextCallbackId();

                if (buttonInteraction.customId === 'yes') {
                    try {
                        // Deduct the amount from the target user's balance
                        const newBalance = currentBalance - amount;
                        await db.query('INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?', [targetUsername, newBalance, newBalance]);

                        // Log the action in the audit log
                        await logAudit('buy', sender.username, targetUsername, -amount, callbackId);

                        // Send success message
                        const successEmbed = new EmbedBuilder()
                            .setColor('#ffbf00')
                            .setDescription(`**${targetUsername}** just spent <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold in the guild market!`)
                            .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                            .setFooter({ text: `Transaction completed by ${sender.username} | Callback ID: ${callbackId}` });  // Add Callback ID here

                        await buttonInteraction.update({ embeds: [successEmbed], components: [] });

                    } catch (error) {
                        console.error('Error processing purchase:', error);
                        interaction.editReply('An error occurred while processing the purchase. Please try again later.');
                    }
                } else if (buttonInteraction.customId === 'no') {
                    // Cancel the transaction
                    const cancelEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription(`The purchase by **${targetUsername}** has been cancelled.`);

                    await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
                }
                collector.stop();
            });
            return;
        }

        // If user has enough balance, process the purchase
        const callbackId = await getNextCallbackId();
        try {
            const newBalance = currentBalance - amount;
            await db.query('INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?', [targetUsername, newBalance, newBalance]);

            // Log the action in the audit log
            await logAudit('buy', sender.username, targetUsername, -amount, callbackId);

            // Success message
            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`**${targetUsername}** just spent <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold in the guild market!`)
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: `Transaction completed by ${sender.username} | Callback ID: ${callbackId}` }); 

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error processing purchase:', error);
            return interaction.editReply('An error occurred while processing the purchase. Please try again later.');
        }
    },
};
