const db = require('../db');
const UserDTO = require('../dtos/UserDTO');

class User {
    #username;
    #balance;

    constructor(username, balance = 0) {
        this.#username = username;
        this.#balance = balance;
    }

    getUsername() {
        return this.#username;
    }

    getBalance() {
        return this.#balance;
    }

    setBalance(balance) {
        this.#balance = balance;
    }

    static async fetchUser(username) {
        const [rows] = await db.query('SELECT balance FROM coins WHERE username = ?', [username]);
        if (rows.length === 0) {
            await db.query('INSERT INTO coins (username, balance) VALUES (?, ?)', [username, 0]);
            return new UserDTO(username, 0);
        }
        return new UserDTO(username, rows[0].balance);
    }

    static async updateBalance(username, newBalance) {
        const query = 'UPDATE coins SET balance = ? WHERE username = ?';
        try {
            await db.query(query, [newBalance, username]);
        } catch (error) {
            console.error('Error updating balance:', error);
            throw new Error('Error updating balance');
        }
    }
}

module.exports = User;
