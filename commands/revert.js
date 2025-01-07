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
    const maxCallbackId = parseInt(result[0]?.maxCallbackId || '0', 10);
    return maxCallbackId + 1; // Increment the callbackId by 1
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('revert')
        .setDescription('Reverts all actions based on a given callback ID.')
        .addIntegerOption(option => option.setName('callback_id').setDescription('Callback ID of the actions to revert').setRequired(true)),

    async execute(interaction) {
        const callbackId = interaction.options.getInteger('callback_id');

        try {
            // Defer the reply to allow time for the processing of the revert action
            await interaction.deferReply();

            // Query the audit log to find all actions by callbackId
            const [rows] = await db.query('SELECT * FROM auditlog WHERE callback = ?', [callbackId]);

            if (rows.length === 0) {
                return interaction.followUp({ content: `No actions found with callback ID: ${callbackId}`, ephemeral: true });
            }

            // Revert the balances for all affected users and prepare embed data
            const embedFields = [];
            const actions = [];

            for (const row of rows) {
                const { sender, target, amount } = row;

                // Revert the balance of the target user
                await handleRevert(target, -amount, callbackId, interaction);

                // Get the current balance after revert
                const [recipientRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [target]);
                const currentBalance = recipientRows.length > 0 ? recipientRows[0].balance : 0;

                // Create the embed field for the user
                embedFields.push({
                    name: target,
                    value: `**Action**: Reverted <:OctoGold:1324817815470870609> ${Math.abs(amount).toLocaleString()} OctoGold\n` +
                           `**New Balance**: <:OctoGold:1324817815470870609> ${currentBalance.toLocaleString()} OctoGold`
                });
            }

            // Create the success embed
            const successEmbed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`The actions with callback ID: **${callbackId}** have been successfully reverted.`)
                .addFields(...embedFields)
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: `Reversion processed by ${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.followUp({ embeds: [successEmbed] });

        } catch (error) {
            console.error('Error processing revert:', error);
            return interaction.followUp({
                content: 'An error occurred while trying to revert the actions. Please try again later.',
                ephemeral: true
            });
        }
    },
};

// General revert handler based on the amount
async function handleRevert(target, amount, callbackId, interaction) {
    // Adjust the balance of the target (sender or recipient) based on the amount
    const [recipientRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [target]);
    const currentBalance = recipientRows.length > 0 ? recipientRows[0].balance : 0;

    // Revert the balance (add or subtract the amount)
    const newBalance = currentBalance + amount;
    await db.query('INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?', [target, newBalance, newBalance]);

    // Log the revert action in the audit log
    const revertCallbackId = await getNextCallbackId();
    await logAudit('revert', interaction.user.username, target, amount, revertCallbackId);
}
