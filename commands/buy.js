const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const AuditLogService = require('../services/AuditLogService');
const User = require('../classes/User');
const AuditLogDTO = require('../dtos/AuditLogDTO');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Allow a user to purchase an item using their OctoGold.')
        .addUserOption(option => option.setName('user').setDescription('User to buy for').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount of OctoGold to spend').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('What is this for?').setRequired(true)),
    
    async execute(interaction) {

        await interaction.deferReply();

        const sender = interaction.user;
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');
        const targetUsername = targetUser.username;

        const tellerRole = interaction.guild.roles.cache.find(role => role.name === "Teller");
        if (!tellerRole || !interaction.member.roles.cache.has(tellerRole.id)) {
            return interaction.editReply({ content: 'You must have the "Teller" role to use this command.' });
        }

        if (isNaN(amount) || amount <= 0) {
            return interaction.editReply('Invalid command usage! Example: `/buy @user 100`');
        }

        const targetUserObj = await User.fetchUser(targetUsername);
        const currentBalance = targetUserObj.balance;

        const formattedAmount = amount.toLocaleString();

        if (currentBalance < amount) {
            const amountToGoNegative = (amount - currentBalance).toLocaleString();

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
                ephemeral: false,
            });

            const filter = (buttonInteraction) => buttonInteraction.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({
                filter,
                time: 60000,
            });

            collector.on('collect', async (buttonInteraction) => {
                const callbackId = await AuditLogService.getNextCallbackId();

                if (buttonInteraction.customId === 'yes') {
                    try {
                        const newBalance = currentBalance - amount;
                        await User.updateBalance(targetUsername, newBalance);

                        const auditLogDTO = new AuditLogDTO(
                            'buy',
                            sender.username,
                            targetUsername,
                            -amount,
                            reason,
                            callbackId
                        );

                        await AuditLogService.logAudit(
                            auditLogDTO.action,
                            auditLogDTO.sender,
                            auditLogDTO.target,
                            auditLogDTO.amount,
                            auditLogDTO.reason,
                            auditLogDTO.callbackId
                        );

                        const formattedNewBalance = newBalance.toLocaleString();

                        const successEmbed = new EmbedBuilder()
                            .setColor('#ffbf00')
                            .setDescription(`**${targetUsername}** just spent <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold in the guild market!\n\nTheir new total is <:OctoGold:1324817815470870609> **${formattedNewBalance}** OctoGold!`)
                            .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                            .setFooter({ text: `Transaction completed by ${sender.username} | Callback ID: ${callbackId}` });

                        await buttonInteraction.update({ embeds: [successEmbed], components: [] });

                    } catch (error) {
                        console.error('Error processing purchase:', error);
                        interaction.editReply('An error occurred while processing the purchase. Please try again later.');
                    }
                } else if (buttonInteraction.customId === 'no') {

                    const cancelEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription(`The purchase by **${targetUsername}** has been cancelled.`);

                    await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
                }
                collector.stop();
            });
            return;
        }

        const callbackIdDTO = await AuditLogService.getNextCallbackId();
        const callbackId = callbackIdDTO.callbackId;
        
        try {
            const newBalance = currentBalance - amount;
            await User.updateBalance(targetUsername, newBalance);

            const auditLogDTO = new AuditLogDTO(
                'buy',
                sender.username,
                targetUsername,
                -amount,
                reason,
                callbackId
            );

            await AuditLogService.logAudit(
                auditLogDTO.action,
                auditLogDTO.sender,
                auditLogDTO.target,
                auditLogDTO.amount,
                auditLogDTO.reason,
                auditLogDTO.callbackId
            );

            const formattedNewBalance = newBalance.toLocaleString();

            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`**${targetUsername}** just spent <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold in the guild market!\n\nTheir new total is <:OctoGold:1324817815470870609> **${formattedNewBalance}** OctoGold!`)
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: `ID: ${callbackId} | Transaction completed by ${sender.username} `, iconURL: interaction.user.displayAvatarURL() });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error processing purchase:', error);
            return interaction.editReply('An error occurred while processing the purchase. Please try again later.');
        }
    },
};