// leaderboard.js
const { SlashCommandBuilder } = require('discord.js');
const db = require('../db'); 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the top 10 users with the highest balance'),

    async execute(interaction) {
        try {
          
            const query = `SELECT * FROM coins WHERE username != 'OctoBank' ORDER BY balance DESC LIMIT 10`;

          
            const [rows] = await db.execute(query); 

           
            let leaderboardContents = "";
            rows.forEach((row, index) => {
                leaderboardContents += `${index + 1}. **${row.username}**: <:OctoGold:1324817815470870609> **${row.balance.toLocaleString()}** OctoGold\n`;
            });

            const leaderboardEmbed = {
                color: 0xffe600,
                title: 'Leaderboard - Top 10 Users',
                description: leaderboardContents,
                footer: {
                    text: `Requested by ${interaction.user.username}`,
                    icon_url: interaction.user.avatarURL(),
                },
            };

            
            await interaction.reply({ embeds: [leaderboardEmbed] });

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.reply({ content: 'There was an error while fetching the leaderboard.', ephemeral: true });
        }
    }
};
