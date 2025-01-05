const mysql = require('mysql2/promise');
const fs = require('fs');

async function backupCoins() {
    const dbConfig = {
        host: 'db-buf-05.sparkedhost.us',
        port: 3306,
        user: 'u159065_dT0ZxTfNn0',
        password: 'e4!=6PqJ+dFyquGs@OczJcVR',
        database: 's159065_OctoBank'
    };

    console.log('Connecting with username:', dbConfig.user);

    // Check for unexpected characters
    if (/\s/.test(dbConfig.user)) {
        console.error('Error: Username contains unexpected whitespace!');
        return;
    }

    try {
        // Read the coins.json file
        const coinsData = JSON.parse(fs.readFileSync('coins.json', 'utf8'));

        // Connect to the database
        const connection = await mysql.createConnection(dbConfig);

        // Create a table if it doesn't exist and ensure `username` is unique
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS Coins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                balance BIGINT NOT NULL
            )
        `);

        // Insert or update records
        for (const [username, balance] of Object.entries(coinsData)) {
            await connection.execute(
                `INSERT INTO Coins (username, balance) VALUES (?, ?) 
                ON DUPLICATE KEY UPDATE balance = VALUES(balance)`,
                [username, balance]
            );
        }

        console.log('Data has been successfully backed up to the database.');

        // Close the connection
        await connection.end();
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

backupCoins();

module.exports = { backupCoins };

