const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

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

            // Prepare embed content by awaiting each action's revert process
            const embedContent = [];
            for (const row of rows) {
                const { sender, target, amount } = row;

                // Revert the balance of the target user and get the new balance
                await handleRevert(target, -amount, callbackId, interaction);

                // Get the current balance after revert
                const [recipientRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [target]);
                const currentBalance = recipientRows.length > 0 ? recipientRows[0].balance : 0;

                // Push formatted content for each user to embedContent
                embedContent.push(`**Target:** ${target}\n**Action:** Reverted <:OctoGold:1324817815470870609> ${Math.abs(amount).toLocaleString()} OctoGold\n**New Balance:** <:OctoGold:1324817815470870609> ${currentBalance.toLocaleString()} OctoGold\n`);
            }

            // Join all the embed content and split it into multiple embeds if necessary
            const content = embedContent.join('\n');
            const lines = content.split('\n');
            const LINES_PER_EMBED = 25;
            let currentIndex = 0;
            let isFirstEmbed = true;

            while (currentIndex < lines.length) {
                const chunk = lines.slice(currentIndex, currentIndex + LINES_PER_EMBED).join('\n');
                currentIndex += LINES_PER_EMBED;

                const embed = new EmbedBuilder()
                    .setColor('#ffbf00')
                    .setDescription(chunk)
                    .setAuthor({
                        name: interaction.client.user.username,
                        iconURL: interaction.client.user.displayAvatarURL()
                    })
                    .setFooter({
                        text: `Transaction processed by ${interaction.user.username}`,
                        iconURL: interaction.user.displayAvatarURL()
                    })
                    .setTimestamp();

                // First embed uses editReply, others use followUp
                if (isFirstEmbed) {
                    await interaction.editReply({ embeds: [embed] });
                    isFirstEmbed = false;
                } else {
                    await interaction.followUp({ embeds: [embed] });
                }
            }

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
