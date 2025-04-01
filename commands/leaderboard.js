const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the top 10 users with the highest balance'),

    async execute(interaction) {
        try {
            // Make a POST request to the server to get the leaderboard data
            const response = await axios.post('http://localhost:3000/api/leaderboard');

            const leaderboard = response.data.leaderboard;

            if (!leaderboard || leaderboard.length === 0) {
                return await interaction.reply({
                    content: 'No users found in the leaderboard.',
                    ephemeral: true,
                });
            }

            // Build the leaderboard content
            let leaderboardContents = '';
            leaderboard.forEach(user => {
                leaderboardContents += `${user.rank}. **${user.username}**: <:OctoGold:1324817815470870609> **${user.balance.toLocaleString()}** OctoGold\n`;
            });

            // Create the embed
            const leaderboardEmbed = new EmbedBuilder()
                .setColor(0xffe600)
                .setTitle('Leaderboard - Top 10 Users')
                .setDescription(leaderboardContents)
                .setFooter({
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                });

            // Send the embed as a reply
            await interaction.reply({ embeds: [leaderboardEmbed] });

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.reply({
                content: 'There was an error while fetching the leaderboard.',
                ephemeral: true,
            });
        }
    },
};