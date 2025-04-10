const db = require('../db');
const User = require('../classes/User');

class TransferService {
    static async transferOctoGold(tipperUsername, recipientUsername, amount) {
        try {
            const [tipperRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [tipperUsername]);
            const tipperBalance = tipperRows.length > 0 ? tipperRows[0].balance : 0;

            if (tipperBalance < amount) {
                throw new Error('Insufficient funds.');
            }

            const [recipientRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [recipientUsername]);
            const recipientBalance = recipientRows.length > 0 ? recipientRows[0].balance : 0;

            const newTipperBalance = tipperBalance - amount;
            const newRecipientBalance = recipientBalance + amount;

            await db.query(
                'INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?',
                [tipperUsername, newTipperBalance, newTipperBalance]
            );
            await db.query(
                'INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?',
                [recipientUsername, newRecipientBalance, newRecipientBalance]
            );

            return {
                newTipperBalance,
                newRecipientBalance,
            };
        } catch (error) {
            console.error('Error during transfer:', error);
            throw new Error('Transfer failed.');
        }
    }
}

module.exports = TransferService;
