//payout.js
const { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const User = require('../classes/User');
const AuditLogService = require('../services/AuditLogService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('payout')
        .setDescription('Pay out coins to a specific user')
        .addUserOption(option => option.setName('user').setDescription('The user to pay out to').setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        if (!interaction.member.roles.cache.some(role => role.name === 'Teller')) {
            return interaction.editReply({ content: 'You do not have permission to use this command. Only users with the "Teller" role can use it.' });
        }

        const targetUser = interaction.options.getUser('user');
        if (!targetUser) {
            return interaction.editReply({ content: 'Please mention a user to pay out to.' });
        }

        const username = targetUser.username;

        try {
            const user = await User.fetchUser(username);
            const balance = user.getBalance();

            if (balance <= 0) {
                return interaction.editReply({ content: `**${username}** has no OctoGold to pay out.` });
            }

            const formattedBalance = balance.toLocaleString();

            const callbackId = await AuditLogService.getNextCallbackId();

            const payoutEmbed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setTitle('Confirm Payout')
                .setDescription(`**${username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold in their bank.\nAre you sure you want to pay them out?`)
                .setFooter({ text: 'Once completed, this payout cannot be undone.' });

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
                embeds: [payoutEmbed],
                components: [row],
            });

            const filter = (buttonInteraction) => buttonInteraction.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({
                filter,
                time: 120000,
            });

            collector.on('collect', async (buttonInteraction) => {
                await buttonInteraction.deferUpdate();

                if (buttonInteraction.customId === 'yes') {
                    try {
                        const newBalance = balance - balance;
                        await User.updateBalance(username, newBalance);

                        await AuditLogService.logAudit('payout', interaction.user.username, username, -balance, null, callbackId);

                        const successEmbed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('Payout Complete')
                            .setDescription(`**${username}** has successfully received their payout of <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold. Their balance is now cleared.`)
                            .setFooter({ text: `Transaction completed by ${interaction.user.username} | Callback ID: ${callbackId}` });

                        await interaction.editReply({ embeds: [successEmbed], components: [] });

                    } catch (error) {
                        console.error('Error processing payout:', error);
                        return interaction.editReply({ content: 'An error occurred while processing the payout. Please try again later.' });
                    }
                } else if (buttonInteraction.customId === 'no') {
                    try {
                        await AuditLogService.logAudit('payout_cancelled', interaction.user.username, username, 0, 'Payout cancelled', callbackId);

                        const cancelEmbed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('Payout Cancelled')
                            .setDescription(`The payout to **${username}** has been cancelled.`);

                        await interaction.editReply({ embeds: [cancelEmbed], components: [] });
                    } catch (error) {
                        console.error('Error handling cancellation:', error);
                        return interaction.editReply({ content: 'An error occurred while handling the cancellation. Please try again later.' });
                    }
                }

                collector.stop();
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    const timeoutEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Payout Timeout')
                        .setDescription('The payout request has expired due to inactivity.');

                    interaction.editReply({ embeds: [timeoutEmbed], components: [] });
                }
            });
        } catch (error) {
            console.error('Error processing payout:', error);
            return interaction.editReply({ content: 'There was an error fetching the user or processing the payout.' });
        }
    },
};
