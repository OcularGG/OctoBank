const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const AuditLogService = require('../services/AuditLogService');
const User = require('../classes/User');
const db = require('../db');
module.exports = {
    data: new SlashCommandBuilder()
        .setName('revert')
        .setDescription('Reverts all actions based on a given callback ID.')
        .addIntegerOption(option => option.setName('callback_id').setDescription('Callback ID of the actions to revert').setRequired(true)),

    async execute(interaction) {
        const callbackId = interaction.options.getInteger('callback_id');

        try {
            await interaction.deferReply();

            const rows = await AuditLogService.getByCallbackId(callbackId);

            if (rows.length === 0) {
                return interaction.followUp({ content: `No actions found with callback ID: ${callbackId}`, ephemeral: true });
            }

            const embedContent = [];
            for (const row of rows) {
                const { sender, target, amount, reason, id } = row;
                if (reason && reason.toLowerCase() === 'reverted') {
                    return interaction.followUp({
                        content: `The action with callback ID: ${callbackId} has already been reverted.`,
                        ephemeral: true
                    });
                }

                await handleRevert(target, -amount, callbackId, interaction);

                await AuditLogService.updateAuditLogReason(id, 'reverted');

                await logReversionAction(interaction.user.username, target, amount, callbackId);

                const targetUser = await User.fetchUser(target);
                const currentBalance = targetUser.getBalance();

                embedContent.push(`**Target:** ${target}\n**Action:** Reverted <:OctoGold:1324817815470870609> ${Math.abs(amount).toLocaleString()} OctoGold\n**New Balance:** <:OctoGold:1324817815470870609> ${currentBalance.toLocaleString()} OctoGold\n`);
            }

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

async function handleRevert(target, amount, callbackId, interaction) {
    const targetUser = await User.fetchUser(target);
    const currentBalance = targetUser.getBalance();
    const newBalance = currentBalance + amount;

    await User.updateBalance(target, newBalance);
}

async function logReversionAction(sender, target, amount, callbackId) {
    const newCallbackId = await AuditLogService.getNextCallbackId();

    try {
        await AuditLogService.logAudit('revert', sender, target, -amount, null, newCallbackId);
    } catch (error) {
        console.error('Error logging reversion action:', error);
    }
}
