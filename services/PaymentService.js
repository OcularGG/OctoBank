const { EmbedBuilder } = require('discord.js');
const BalanceService = require('./BalanceService');
const AuditLogService = require('./AuditLogService');
const User = require('../classes/User');
const AuditLogDTO = require('../dtos/AuditLogDTO');
const db = require('../db');

class PaymentService {
    static async processPayment(interaction, amount, sender, recipient, reason) {
        const connection = await db.getConnection();

        try {
            const tellerRole = interaction.guild.roles.cache.find(role => role.name === "Teller");
            if (!tellerRole || !interaction.member.roles.cache.has(tellerRole.id)) {
                return interaction.editReply({ content: 'You must have the "Teller" role to use this command.' });
            }

            if (amount === 0) {
                return interaction.editReply({ content: 'The amount must be greater than zero.' });
            }

            const recipientUser = await User.fetchUser(recipient.username);
            const recipientBalance = recipientUser.balance;

            if (amount < 0 && recipientBalance + amount < 0) {
                return interaction.editReply({ content: 'The recipient does not have enough coins to withdraw that amount.' });
            }

            const newRecipientBalance = recipientBalance + amount;

            await User.updateBalance(recipient.username, newRecipientBalance);
            
            const callbackIdDTO = await AuditLogService.getNextCallbackId();
            const callbackId = callbackIdDTO.callbackId;

            const auditLogDTO = new AuditLogDTO(
                amount < 0 ? 'withdraw' : 'deposit',
                sender.username,
                recipient.username,
                amount,
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

            const actionType = amount < 0 ? 'withdraw' : 'deposit';
            const formattedAmount = Math.abs(amount).toLocaleString();
            const actionMessage = actionType === 'withdraw'
                ? `**${sender.username}** has withdrawn <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold from **${recipient.username}**'s wallet.`
                : `**${sender.username}** has deposited <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold to **${recipient.username}**'s wallet.`;

            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`\n${actionMessage}\n\nReason: **${reason}**`)
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: `ID: ${callbackId} | Processed by: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await connection.rollback();
            return interaction.editReply({ content: 'There was an error processing the transaction.' });
        } finally {
            connection.release();
        }
    }
}

module.exports = PaymentService;