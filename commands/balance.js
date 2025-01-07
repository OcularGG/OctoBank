const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');  // Assuming you have a db.js file for database connection

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Shows the balance of the specified user or your own balance')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user whose balance you want to check')
                .setRequired(false)), // Make this optional

    async execute(interaction) {
        try {
            // Determine the target user (either mentioned user or the sender if no user is mentioned)
            const targetUser = interaction.options.getUser('user') || interaction.user;  // Default to the command caller if no user is mentioned

            // Check if user exists in the database using the username as the key
            const [rows] = await db.query('SELECT balance FROM coins WHERE username = ?', [targetUser.username]);

            if (rows.length === 0) {
                // If the user does not exist, insert them with an initial balance of 0
                await db.query('INSERT INTO coins (username, balance) VALUES (?, ?)', [targetUser.username, 0]);

                // Creating an embed response when balance is 0
                const embed = new EmbedBuilder()
                    .setColor('#ffbf00')
                    .setDescription(`[**OctoBank**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}**, your current balance is <:OctoGold:1324817815470870609> **0** OctoGold.`)
                    .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                    setFooter({ text: ` Balance requested by ${interaction.user.username}`, 
                        iconURL: interaction.user.displayAvatarURL() // Add the user's profile picture in the footer
                    })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: 64 });  // Using flags for ephemeral responses
            }

            // If user exists, send their balance in an embed
            const balance = rows[0].balance;
            const formattedBalance = balance.toLocaleString();

            // Creating an embed response with the user's balance
            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`[**OctoBank**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold.`)
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: ` Balance requested by ${interaction.user.username}`, 
                    iconURL: interaction.user.displayAvatarURL() // Add the user's profile picture in the footer
                })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], flags: 64 });  // Using flags for ephemeral responses
        } catch (error) {
            console.error(error);
            return interaction.reply({
                content: 'There was an error fetching the balance.',
                flags: 64,  // Using flags for ephemeral responses
            });
        }
    },
};
