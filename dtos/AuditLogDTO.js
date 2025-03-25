const AuditLogService = require('../services/AuditLogService');

class AuditLogDTO {
    constructor(action, sender, target, amount, reason, callbackId) {
        this.action = action;
        this.sender = sender;
        this.target = target;
        this.amount = amount;
        this.reason = reason;
        this.callbackId = callbackId;
    }

    async log() {
        await AuditLogService.logAudit(
            this.action,
            this.sender,
            this.target,
            this.amount,
            this.reason,
            this.callbackId
        );
    }

    static async create(action, sender, target, amount, reason) {
        const callbackIdDTO = await AuditLogService.getNextCallbackId();
        const callbackId = callbackIdDTO.callbackId;

        return new AuditLogDTO(action, sender, target, amount, reason, callbackId);
    }
}

module.exports = AuditLogDTO;