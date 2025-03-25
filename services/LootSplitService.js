const db = require('../db');
const AuditLogService = require('./AuditLogService');
const User = require('../classes/User');
const AuditLogDTO = require('../dtos/AuditLogDTO');

class LootSplitService {
    constructor(interaction, amount, repairCost, userInput) {
        this.interaction = interaction;
        this.sender = interaction.user;
        this.amount = amount;
        this.repairCost = repairCost;
        this.userInput = userInput;
    }

    validateLoot() {
        const botShare = Math.floor(this.amount * 0.2);
        const remainingLoot = this.amount - botShare - this.repairCost;

        if (remainingLoot <= 0) {
            if (this.amount > 0) {
                return { valid: false, message: 'The repair cost is too high for the guild to buy this split, please do an item split instead.' };
            } else {
                return { valid: false, message: 'The loot is not worth anything, sorry.' };
            }
        }

        return { valid: true, remainingLoot };
    }

    calculateShares(remainingLoot, uniqueUsers) {
        const individualShare = Math.floor(remainingLoot / uniqueUsers.length);
        return individualShare;
    }

    parseUsers() {
        const mentionedUsers = this.userInput.match(/<@!?(\d+)>/g)?.map((mention) => mention.replace(/[<@!>]/g, '')) || [];
        if (mentionedUsers.length === 0) {
            throw new Error('No valid users mentioned to split the loot with!');
        }

        return [...new Set(mentionedUsers)]; 
    }

    async processLootSplit(uniqueUsers, individualShare, callbackId) {
        const userUpdates = [];
        const auditLogs = [];
    
        for (const userId of uniqueUsers) {
            const targetUser = await this.interaction.guild.members.fetch(userId);
            if (!targetUser) continue;
    
            const username = targetUser.user.username;
            const user = await User.fetchUser(username);
            const newBalance = user.balance + individualShare;
    
            await User.updateBalance(username, newBalance);
        
            const auditLogDTO = new AuditLogDTO(
                'lootsplit',
                this.sender.username,
                username,
                individualShare,
                null,
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
    
            userUpdates.push({ username, coins: newBalance });
            auditLogs.push(auditLogDTO);
        }
    
        return { userUpdates, auditLogs };
    }

    async updateBankBalance(botShare, callbackId) {
        const bankUsername = 'OctoBank';
        const bankUser = await User.fetchUser(bankUsername);
        const newBankBalance = bankUser.balance + botShare;

        await User.updateBalance(bankUsername, newBankBalance);

        const auditLogDTO = new AuditLogDTO(
            'lootsplit',
            this.sender.username,
            bankUsername,
            botShare,
            null,
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

        return { username: bankUsername, coins: newBankBalance };
    }
}

module.exports = LootSplitService;