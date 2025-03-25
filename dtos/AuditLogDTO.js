class AuditLogDTO {
    constructor(action, sender, target, amount, reason, callbackId) {
        this.action = action;
        this.sender = sender;
        this.target = target;
        this.amount = amount;
        this.reason = reason;
        this.callbackId = callbackId;
    }
}

module.exports = AuditLogDTO;