const { SlashCommandBuilder, EmbedBuilder, Colors } = require('discord.js');  // Import EmbedBuilder & Colors
const db = require('../db'); // Assuming you have a db.js file for database connection

// Function to log the action in the auditlog table
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
    // Ensure we add 1 to the maximum callback value and parse it to an integer
    const maxCallbackId = parseInt(result[0]?.maxCallbackId || '0', 10);
    return maxCallbackId + 1; // Increment the callbackId by 1
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Give or withdraw coins from another user')
        .addUserOption(option => option.setName('user').setDescription('The user to send coins to or withdraw from').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount of coins to send or withdraw').setRequired(true)),

    async execute(interaction) {
        // Acknowledge the interaction and defer the reply to prevent timeout
        await interaction.deferReply();

        const sender = interaction.user;
        const recipient = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        // Check if the sender has the "Teller" role
        const tellerRole = interaction.guild.roles.cache.find(role => role.name === "Teller");
        if (!tellerRole || !interaction.member.roles.cache.has(tellerRole.id)) {
            return interaction.editReply({ content: 'You must have the "Teller" role to use this command.' });
        }

        // Ensure amount is not zero
        if (amount === 0) {
            return interaction.editReply({ content: 'The amount must be greater than or less than zero.' });
        }

        const connection = await db.getConnection();

        try {
            // Get the next callback ID
            const callbackId = await getNextCallbackId();
            console.log(`Next callback ID: ${callbackId}`); // Debugging statement to log the callbackId

            // Start a transaction
            await connection.beginTransaction();

            // Fetch recipient's balance
            const [recipientRows] = await connection.query('SELECT balance FROM coins WHERE username = ?', [recipient.username]);
            if (recipientRows.length === 0) {
                // If the recipient doesn't exist, insert them with an initial balance of 0
                await connection.query('INSERT INTO coins (username, balance) VALUES (?, ?)', [recipient.username, 0]);
            }

            const recipientBalance = recipientRows[0]?.balance || 0;

            // If the amount is negative (withdraw), check if the recipient has enough balance
            if (amount < 0 && recipientBalance + amount < 0) {
                return interaction.editReply({ content: 'The recipient does not have enough coins to withdraw that amount.' });
            }

            // Update the recipient's balance (give or withdraw)
            const newRecipientBalance = recipientBalance + amount;
            await connection.query('UPDATE coins SET balance = ? WHERE username = ?', [newRecipientBalance, recipient.username]);

            // Log the action in the auditlog table for this transaction
            await logAudit(amount < 0 ? 'withdraw' : 'deposit', sender.username, recipient.username, amount, callbackId);

            // Commit the transaction
            await connection.commit();

            // Define action type and link
            const actionType = amount < 0 ? 'withdraw' : 'deposit';
            const actionLink = actionType === 'withdraw'
                ? '[**OctoBank Withdrawal**](https://octobank.ocular-gaming.net/)'
                : '[**OctoBank Deposit**](https://octobank.ocular-gaming.net/)';

            const formattedAmount = Math.abs(amount).toLocaleString();
            const actionMessage = actionType === 'withdraw'
                ? `**${sender.username}** has withdrawn <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold from **${recipient.username}**'s wallet.`
                : `**${sender.username}** has deposited <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold to **${recipient.username}**'s wallet.`;

            // Create the embed
            const embed = new EmbedBuilder()
    .setColor('#ffbf00') // Gold color
    .setDescription(`${actionLink}\n\n${actionMessage}`)
    .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
    .setFooter({
        text: `ID: ${callbackId} | Processed by: ${interaction.user.username}`, 
        iconURL: interaction.user.displayAvatarURL()  // Add the user's avatar to the footer
    })
    .setTimestamp();

            // Reply to the sender with the embed
            return interaction.editReply({
                embeds: [embed],  // Send the embed with the message
            });
        } catch (error) {
            console.error(error);
            // Rollback in case of error
            await connection.rollback();
            return interaction.editReply({ content: 'There was an error processing the transaction.' });
        } finally {
            // Release the connection back to the pool
            connection.release();
        }
    },
};
