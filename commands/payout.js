const { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../db');  // Assuming you have a db.js file for database connection

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
    const maxCallbackId = parseInt(result[0]?.maxCallbackId || '0', 10);
    return maxCallbackId + 1; // Increment the callbackId by 1
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('payout')
        .setDescription('Pay out coins to a specific user')
        .addUserOption(option => option.setName('user').setDescription('The user to pay out to').setRequired(true)),

    async execute(interaction) {
        // Acknowledge the interaction and defer the reply to prevent timeout
        await interaction.deferReply(); // Use flags for ephemeral replies

        // Check if the user has the 'Teller' role
        if (!interaction.member.roles.cache.some(role => role.name === 'Teller')) {
            return interaction.editReply({ content: 'You do not have permission to use this command. Only users with the "Teller" role can use it.' });
        }

        const targetUser = interaction.options.getUser('user');
        if (!targetUser) {
            return interaction.editReply({ content: 'Please mention a user to pay out to.' });
        }

        const username = targetUser.username;

        // Retrieve the user's balance from the database
        const [rows] = await db.query('SELECT balance FROM coins WHERE username = ?', [username]);
        const balance = rows.length > 0 ? rows[0].balance : 0;

        if (balance <= 0) {
            return interaction.editReply({ content: `**${username}** has no OctoGold to pay out.` });
        }

        const formattedBalance = balance.toLocaleString();

        // Generate a unique callback ID for logging
        const callbackId = await getNextCallbackId();

        // Create the confirmation embed
        const payoutEmbed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setTitle('Confirm Payout')
            .setDescription(`**${username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold in their bank.\nAre you sure you want to pay them out?`)
            .setFooter({ text: 'Once completed, this payout cannot be undone.' });

        // Create buttons for confirmation
        const yesButton = new ButtonBuilder()
            .setCustomId('yes')
            .setLabel('Yes')
            .setStyle(ButtonStyle.Success);

        const noButton = new ButtonBuilder()
            .setCustomId('no')
            .setLabel('No')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(yesButton, noButton);

        // Send the embed and buttons to the user
        await interaction.editReply({
            embeds: [payoutEmbed],
            components: [row],
        });

        // Set up the filter and collector for button interactions
        const filter = (buttonInteraction) => buttonInteraction.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({
            filter,
            time: 60000, // Buttons expire after 1 minute
        });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId === 'yes') {
                try {
                    // Update the user's balance (reduce by the payout amount)
                    await db.query('UPDATE coins SET balance = balance - ? WHERE username = ?', [balance, username]);

                    // Log the payout action in the auditlog table with the negative amount
                    await logAudit('payout', interaction.user.username, username, -balance, callbackId);

                    // Create the success message embed
                    const successEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('Payout Complete')
                        .setDescription(`**${username}** has successfully received their payout of <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold. Their balance is now cleared.`)
                        .setFooter({ text: `Transaction completed by ${interaction.user.username} | Callback ID: ${callbackId}` }); 
                    await buttonInteraction.update({ embeds: [successEmbed], components: [] });

                } catch (error) {
                    console.error('Error processing payout:', error);
                    return interaction.editReply({ content: 'An error occurred while processing the payout. Please try again later.' });
                }
            } else if (buttonInteraction.customId === 'no') {
                // Log the canceled payout action in the auditlog table
                await logAudit('payout_cancelled', interaction.user.username, username, 0, callbackId);

                // Cancel the payout
                const cancelEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('Payout Cancelled')
                    .setDescription(`The payout to **${username}** has been cancelled.`);

                await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
            }

            collector.stop(); // Stop the collector after a button is pressed
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('Payout Timeout')
                    .setDescription('The payout request has expired due to inactivity.');

                interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            }
        });
    },
};
