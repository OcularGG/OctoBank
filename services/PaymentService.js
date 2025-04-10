const AuditLogService = require('./AuditLogService');
const User = require('../classes/User');
const AuditLogDTO = require('../dtos/AuditLogDTO');
const db = require('../db');
class PaymentService {
    static async processPayment(interaction, amount, sender, recipient, reason) {
        const connection = await db.getConnection();

        try {
            if (amount === 0) {
                return { success: false, message: 'The amount must be greater than zero.' };
            }

            const recipientUser = await User.fetchUser(recipient.username);
            const recipientBalance = recipientUser.balance;

            if (amount < 0 && recipientBalance + amount < 0) {
                return { success: false, message: 'The recipient does not have enough coins to withdraw that amount.' };
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

            return {
                success: true,
                callbackId,
                actionType: amount < 0 ? 'withdraw' : 'deposit',
                formattedAmount: Math.abs(amount).toLocaleString(),
                newRecipientBalance,
            };
        } catch (error) {
            console.error(error);
            await connection.rollback();
            throw new Error('There was an error processing the transaction.');
        } finally {
            connection.release();
        }
    }
}

module.exports = PaymentService;