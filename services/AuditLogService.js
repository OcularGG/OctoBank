const db = require('../db');
const AuditLogDTO = require('../dtos/AuditLogDTO');
const CallbackIdDTO = require('../dtos/CallbackIdDTO');
class AuditLogService {
    static async logAudit(action, sender, target, amount, reason, callbackId) {
        const auditLogDTO = new AuditLogDTO(action, sender, target, amount, reason, callbackId);
        const query = `
            INSERT INTO auditlog (action, sender, target, amount, reason, callback)
            VALUES (?, ?, ?, ?, ?, ?);
        `;
        try {
            await db.query(query, [
                auditLogDTO.action,
                auditLogDTO.sender,
                auditLogDTO.target,
                auditLogDTO.amount,
                auditLogDTO.reason,
                auditLogDTO.callbackId
            ]);
        } catch (error) {
            console.error('Error logging audit:', error);
        }
    }

    static async updateAuditLogReason(callbackId, newReason) {
        const query = 'UPDATE auditlog SET reason = ? WHERE callback = ?';
        try {
            const [result] = await db.query(query, [newReason, callbackId]);
            return result; 
        } catch (error) {
            console.error('Error updating audit log reason:', error);
            throw error; 
        }
    }

    static async getByCallbackId(callbackId) {
        const query = 'SELECT * FROM auditlog WHERE callback = ?';
        try {
            const [rows] = await db.query(query, [callbackId]);
            return rows.map(row => new AuditLogDTO(row.action, row.sender, row.target, row.amount, row.reason, row.callback));
        } catch (error) {
            console.error('Error querying actions by callbackId:', error);
            throw new Error('Failed to fetch actions by callbackId');
        }
    }

    static async getNextCallbackId() {
        const query = 'SELECT MAX(callback) AS maxCallbackId FROM auditlog';
        const [result] = await db.query(query);
        const maxCallbackId = parseInt(result[0]?.maxCallbackId || '0', 10);
        return new CallbackIdDTO(maxCallbackId + 1);
    }
}

module.exports = AuditLogService;