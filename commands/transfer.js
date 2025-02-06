const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

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

async function getNextCallbackId() {
    const query = 'SELECT MAX(callback) AS maxCallbackId FROM auditlog';
    const [result] = await db.query(query);
    const maxCallbackId = parseInt(result[0]?.maxCallbackId || '0', 10);
    return maxCallbackId + 1;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Transfer OctoGold to another user.')
        .addIntegerOption(option => 
            option
                .setName('amount')
                .setDescription('How much do you want to transfer?')
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName('recipient')
                .setDescription('Who are you transfering to?')
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const tipper = interaction.user; 
            const amount = interaction.options.getInteger('amount');
            const recipientMember = interaction.options.getUser('recipient');

            if (amount <= 0) {
                return interaction.editReply('You can only Transfer positive amounts.');
            }

            if (tipper == recipientMember){
                return interaction.editReply('You cant transfer money to yourself.');
            }

            const [transferRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [tipper.username]);
            const transferBalance = transferRows.length > 0 ? transferRows[0].balance : 0;

            if (transferBalance < amount) {
                return interaction.editReply('You dont have enough money to do this transfer');
            }

            const [recipientRows] = await db.query('SELECT balance FROM coins WHERE username = ?', [recipientMember.username]);
            const recipientBalance = recipientRows.length > 0 ? recipientRows[0].balance : 0;

            const newTransferBalance = transferBalance - amount;
            const newRecipientBalance = recipientBalance + amount;

            await db.query(
                'INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?',
                [tipper.username, newTransferBalance, newTransferBalance]
            );
            await db.query(
                'INSERT INTO coins (username, balance) VALUES (?, ?) ON DUPLICATE KEY UPDATE balance = ?',
                [recipientMember.username, newRecipientBalance, newRecipientBalance]
            );

            const callbackId = await getNextCallbackId();
            await logAudit('Transfer', tipper.username, recipientMember.username, amount, callbackId);

            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setTitle('Transfer Confirmation')
                .setDescription(
                    `**${tipper.username}** has transfered ` +
                    `**${amount.toLocaleString()}** OctoGold to **${recipientMember.username}**.`
                )
                .addFields(
                    { 
                        name: `${tipper.username}'s New Balance`, 
                        value: `${newTransferBalance.toLocaleString()} OctoGold`, 
                        inline: true 
                    },
                    { 
                        name: `${recipientMember.username}'s New Balance`, 
                        value: `${newRecipientBalance.toLocaleString()} OctoGold`, 
                        inline: true 
                    }
                )
                .setFooter({ text: `Transaction ID: ${callbackId}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error executing transfer command:', error);
            await interaction.followUp({ content: 'There was an error processing your transfer.' });
        }
    },
};
