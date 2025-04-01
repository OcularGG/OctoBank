const User = require('../classes/User');
const AuditLogService = require('./AuditLogService');
const AuditLogDTO = require('../dtos/AuditLogDTO');

class LootSplitService {
    validateLoot(amount, repairCost) {
        if (isNaN(amount) || isNaN(repairCost)) {
            console.error(`Invalid values detected: amount=${amount}, repairCost=${repairCost}`);
            return { valid: false, message: 'Invalid amount or repair cost provided.' };
        }
    
        const botShare = Math.floor(amount * 0.2);
        const remainingLoot = amount - botShare - repairCost;
    
        if (remainingLoot <= 0) {
            if (amount > 0) {
                return { valid: false, message: 'The repair cost is too high for the guild to buy this split, please do an item split instead.' };
            } else {
                return { valid: false, message: 'The loot is not worth anything, sorry.' };
            }
        }
    
        console.log(`Validated loot: remainingLoot=${remainingLoot}, botShare=${botShare}`);
        return { valid: true, remainingLoot };
    }

    calculateShares(remainingLoot, uniqueUsers) {
        if (uniqueUsers.length === 0) {
            throw new Error('No users to split the loot with.');
        }

        const individualShare = Math.floor(remainingLoot / uniqueUsers.length);
        console.log(`Calculated individual share: ${individualShare}, remaining loot: ${remainingLoot}, number of users: ${uniqueUsers.length}`);
        return individualShare;
    }

    async processLootSplit(userInput, individualShare, callbackId, senderUsername) {
        const userUpdates = [];
        const auditLogs = [];

        for (const username of userInput) {
            try {
                console.log(`Processing loot split for user: ${username}, individual share: ${individualShare}`);
                const user = await User.fetchUser(username);

                if (!user) {
                    console.error(`User not found: ${username}`);
                    continue;
                }

                if (isNaN(individualShare) || isNaN(user.balance)) {
                    console.error(`Invalid values detected: individualShare=${individualShare}, user.balance=${user.balance}`);
                    continue;
                }

                const newBalance = user.balance + individualShare;
                console.log(`New balance for user ${username}: ${newBalance}`);

                await User.updateBalance(username, newBalance);

                const auditLogDTO = new AuditLogDTO(
                    'lootsplit',
                    senderUsername,
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
            } catch (error) {
                console.error(`Error processing loot split for user: ${username}`, error);
            }
        }

        return { userUpdates, auditLogs };
    }

    async updateBankBalance(botShare, callbackId, senderUsername) {
        const bankUsername = 'OctoBank';
        const bankUser = await User.fetchUser(bankUsername);
        const newBankBalance = bankUser.balance + botShare;

        await User.updateBalance(bankUsername, newBankBalance);

        const auditLogDTO = new AuditLogDTO(
            'lootsplit',
            senderUsername,
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