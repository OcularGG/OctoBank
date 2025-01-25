const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Shows the balance of the specified user or your own balance')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user whose balance you want to check')
                .setRequired(false)),

    async execute(interaction) {
        try {

            const targetUser = interaction.options.getUser('user') || interaction.user; 

            await interaction.deferReply({ flags: 64 });

            const [rows] = await db.query('SELECT balance FROM coins WHERE username = ?', [targetUser.username]);

            if (rows.length === 0) {
                await db.query('INSERT INTO coins (username, balance) VALUES (?, ?)', [targetUser.username, 0]);

                const embed = new EmbedBuilder()
                    .setColor('#ffbf00')
                    .setDescription(`[**OctoBank**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}**'s current balance is <:OctoGold:1324817815470870609> **0** OctoGold.`)
                    .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                    .setFooter({ text: `Balance requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed], flags: 64 });
            }

            const balance = rows[0].balance;
            const formattedBalance = balance.toLocaleString();

            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`[**OctoBank**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold.`)
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: `Balance requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed], flags: 64 });
        } catch (error) {
            console.error(error);
            return interaction.editReply({
                content: 'There was an error fetching the balance.',
                flags: 64, 
            });
        }
    },
};
