require('dotenv').config();  // Load environment variables from .env file
const { Client, Intents, EmbedBuilder } = require('discord.js');
const db = require('./db');  // Assuming you have a db.js file for database connection
const cron = require('node-cron'); // For scheduling the giveaways

// Prize pool values
const PRIZES = [1000000, 750000, 500000, 250000];

// Store the giveaway message ID globally (you can also store this in a database)
let giveawayMessageId = null;

// Function to log the action in the audit log
async function logAudit(action, sender, target, amount, callbackId) {
    const query = `
        INSERT INTO auditlog (action, sender, target, amount, callback)
        VALUES (?, ?, ?, ?, ?);
    `;
    try {
        await db.query(query, [action, sender, target, amount, callbackId]);
    } catch (error) {
        console.error('Error logging audit:', error);
    }
}

// Function to get the next callback ID
async function getNextCallbackId() {
    const query = 'SELECT MAX(callback) AS maxCallbackId FROM auditlog';
    const [result] = await db.query(query);
    const maxCallbackId = parseInt(result[0]?.maxCallbackId || '0', 10);
    return maxCallbackId + 1; // Increment the callbackId by 1
}

// Function to choose a random winner from the reactions
async function chooseWinner(reactions, message, prize) {
    const users = await message.reactions.cache.get(reactions).users.fetch();
    const nonBotUsers = Array.from(users.filter(user => !user.bot).values()); // Convert to array
    if (nonBotUsers.length === 0) {
        return null; // No valid users to choose from
    }
    // Choose a random user using the method you suggested
    const winner = nonBotUsers[Math.floor(Math.random() * nonBotUsers.length)];
    return winner;
}

// Function to send the giveaway message and handle winner selection
async function startGiveaways(client) {
    try {
        const channel = await client.channels.fetch('1277998632917925939'); // Channel ID for the giveaway
        if (!channel) return console.error("Channel not found");

        // Send the giveaway message as an embed
        const prize = PRIZES[Math.floor(Math.random() * PRIZES.length)]; // Use native JavaScript for random prize selection
        const giveawayEmbed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setTitle('🎉 **GIVEAWAY TIME!** 🎉')
            .setDescription(`React to this message to enter the giveaway!\nThe prize is **${prize.toLocaleString()}** OctoGold!`)
            .setFooter({ text: `Good luck! 🎉`, iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const giveawayMessage = await channel.send({ embeds: [giveawayEmbed] });

        // Store the message ID for future reference
        giveawayMessageId = giveawayMessage.id;

        // Add the reaction options
        await giveawayMessage.react('🎉'); // Reaction for entering

        // Wait for 3 hours (10,800,000 milliseconds) before selecting a winner
        setTimeout(async () => {
            // Retrieve the message using the stored message ID
            const giveawayMessage = await channel.messages.fetch(giveawayMessageId);
            if (!giveawayMessage) {
                console.error("Giveaway message not found!");
                return;
            }

            const winner = await chooseWinner('🎉', giveawayMessage, prize);
            if (winner) {
                // Award the prize to the winner
                const winnerUsername = winner.username;
                const [recipientRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [winnerUsername]);
                const recipientBalance = recipientRows.length > 0 ? recipientRows[0].balance : 0;

                // Calculate new balance
                const newRecipientBalance = recipientBalance + prize;
                await db.query('INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?', [winnerUsername, newRecipientBalance, newRecipientBalance]);

                // Log the giveaway in the audit log
                const callbackId = await getNextCallbackId();
                await logAudit('giveaway', 'System', winnerUsername, prize, callbackId);

                // Send the embed message to announce the winner
                const winnerEmbed = new EmbedBuilder()
                    .setColor('#ffbf00')
                    .setTitle('🎉 Giveaway Winner! 🎉')
                    .setDescription(`${winnerUsername} has won **${prize.toLocaleString()}** OctoGold! 🎉`)
                    .setFooter({ text: `Prize awarded by the system`, iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                await channel.send({ embeds: [winnerEmbed] });
            } else {
                // If no valid users reacted
                await channel.send('No valid entries for this giveaway. No winner was selected.');
            }
        }, 10800000); // 3 hours (10,800,000 milliseconds)

    } catch (error) {
        console.error('Error during giveaway process:', error);
    }
}

// Export the giveaway function for use in other files
module.exports = { startGiveaways };
