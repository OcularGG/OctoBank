const db = require('../db');

class AuditLogService {
    static async logAudit(action, sender, target, amount, reason, callbackId) {
        const query = `
            INSERT INTO auditlog (action, sender, target, amount, reason, callback)
            VALUES (?, ?, ?, ?, ?, ?);
        `;
        try {
            await db.query(query, [action, sender, target, amount, reason, callbackId]);
        } catch (error) {
            console.error('Error logging audit:', error);
        }
    }

    static async updateAuditLogReason(auditLogId, newReason) {
        const query = 'UPDATE auditlog SET reason = ? WHERE id = ?';
        try {
            await db.query(query, [newReason, auditLogId]);
        } catch (error) {
            console.error('Error updating audit log reason:', error);
        }
    }

    static async getByCallbackId(callbackId) {
        const query = 'SELECT * FROM auditlog WHERE callback = ?';
        try {
            const [rows] = await db.query(query, [callbackId]);
            return rows; 
        } catch (error) {
            console.error('Error querying actions by callbackId:', error);
            throw new Error('Failed to fetch actions by callbackId');
        }
    }

    static async getNextCallbackId() {
        const query = 'SELECT MAX(callback) AS maxCallbackId FROM auditlog';
        const [result] = await db.query(query);
        const maxCallbackId = parseInt(result[0]?.maxCallbackId || '0', 10);
        return maxCallbackId + 1;
    }
}

module.exports = AuditLogService;
