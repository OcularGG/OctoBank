const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const LeaderboardService = require('../services/LeaderboardService'); // Import the service

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the top 10 users with the highest balance'),

    async execute(interaction) {
        try {
            const leaderboardService = new LeaderboardService();
            const leaderboard = await leaderboardService.getLeaderboard(interaction.client.db);

            if (leaderboard.length === 0) {
                return await interaction.reply({
                    content: 'No users found in the leaderboard.',
                    ephemeral: true,
                });
            }

            let leaderboardContents = '';
            leaderboard.forEach(user => {
                leaderboardContents += `${user.rank}. **${user.username}**: <:OctoGold:1324817815470870609> **${user.balance.toLocaleString()}** OctoGold\n`;
            });

            const leaderboardEmbed = new EmbedBuilder()
                .setColor(0xffe600)
                .setTitle('Leaderboard - Top 10 Users')
                .setDescription(leaderboardContents)
                .setFooter({
                    text: `Requested by ${interaction.user.username}`,
                    iconURL: interaction.user.avatarURL(),
                });

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
