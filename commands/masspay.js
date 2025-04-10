const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const AuditLogService = require('../services/AuditLogService');
const User = require('../classes/User');
const AuditLogDTO = require('../dtos/AuditLogDTO');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('masspay')
        .setDescription('Give or withdraw coins from multiple users')
        .addIntegerOption(option => option.setName('amount').setDescription('Amount of coins to send or withdraw').setRequired(true))
        .addStringOption(option => option.setName('users').setDescription('The users to send coins to or withdraw from (mention multiple users)').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for the masspay').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();

        const amount = interaction.options.getInteger('amount');
        const userInput = interaction.options.getString('users');
        const sender = interaction.user.username;
        const reason = interaction.options.getString('reason');
        const mentionedUsers = userInput.match(/<@!?(\d+)>/g);

        if (!mentionedUsers || mentionedUsers.length === 0) {
            return interaction.editReply({ content: 'Please mention at least one user.' });
        }

        if (amount <= 0) {
            return interaction.editReply({ content: 'The amount must be greater than zero.' });
        }

        const users = mentionedUsers.map(user => user.replace(/<@!?(\d+)>/, '$1'));

        const connection = await db.getConnection();
        const failedUsers = [];
        const usersList = [];

        try {

            const callbackIdDTO = await AuditLogService.getNextCallbackId();
            const callbackId = callbackIdDTO.callbackId;
            const parsedCallbackId = parseInt(callbackId, 10);

            await connection.beginTransaction();

            for (const userId of users) {
                const user = await interaction.client.users.fetch(userId);

                try {
                    const recipient = await User.fetchUser(user.username);
                    const newRecipientBalance = recipient.balance + amount;
                    await User.updateBalance(user.username, newRecipientBalance);

                    usersList.push({
                        username: user.username,
                        amount: Math.abs(amount).toLocaleString(),
                        balance: newRecipientBalance.toLocaleString(),
                    });

                    const auditLogDTO = new AuditLogDTO(
                        amount < 0 ? 'withdraw' : 'deposit',
                        sender,
                        user.username,
                        amount,
                        reason,
                        parsedCallbackId
                    );

                    await AuditLogService.logAudit(
                        auditLogDTO.action,
                        auditLogDTO.sender,
                        auditLogDTO.target,
                        auditLogDTO.amount,
                        auditLogDTO.reason,
                        auditLogDTO.callbackId
                    );

                } catch (err) {
                    console.error(err);
                    failedUsers.push(userId);
                }
            }

            await connection.commit();

            const actionType = amount < 0 ? 'withdraw' : 'deposit';
            const formattedAmount = Math.abs(amount).toLocaleString();
            let actionMessage = actionType === 'withdraw'
                ? `**${interaction.user.username}** has withdrawn <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold from the following users' wallets:\n\n**${usersList.map(u => `${u.username}`).join('\n')}**`
                : `**${interaction.user.username}** has deposited <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold into the following users' wallets:\n\n**${usersList.map(u => `${u.username}`).join('\n')}**`;

            usersList.forEach(user => {
                actionMessage += `\n**${user.username}** received <:OctoGold:1324817815470870609> **${user.amount}** OctoGold, and now has <:OctoGold:1324817815470870609> **${user.balance}** OctoGold`;
            });

            if (failedUsers.length > 0) {
                actionMessage += `\n\n⚠️ Could not process transactions for the following users:\n${failedUsers
                    .map((id) => `<@${id}>`)
                    .join('\n')}`;
            }

            const actionText = actionType === 'withdraw'
                ? '[**Octobank**](https://octobank.ocular-gaming.net/)'
                : '[**Octobank**](https://octobank.ocular-gaming.net/)';

            const embed = new EmbedBuilder()
                .setColor('#25963d')
                .setTitle('Mass Transaction Successful')
                .setDescription(`${actionText}\n\n${actionMessage}`)
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: `ID: ${parsedCallbackId} | Transaction processed by ${interaction.user.username}`, 
                        iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await connection.rollback();

            const errorEmbed = new EmbedBuilder()
                .setColor('#f81f18')
                .setTitle('Error Processing Transaction')
                .setDescription('There was an error processing the mass transaction.')
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: `Transaction failed | Processed by ${interaction.user.username}`, 
                        iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.editReply({ embeds: [errorEmbed] });
        } finally {
            connection.release();
        }
    },
};