const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../classes/User');
const BalanceService = require('../services/BalanceService');

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
            await interaction.deferReply({ flags: 64 });
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const user = await User.fetchUser(targetUser.username);
            const balance = user.getBalance();
            const formattedBalance = balance.toLocaleString();
            const embed = await BalanceService.createBalanceEmbed(interaction, targetUser, formattedBalance);

            return interaction.editReply({ embeds: [embed], flags: 64 });
        } catch (error) {
            console.error('Error in balance command:', error);

            await interaction.editReply({
                content: 'There was an error fetching the balance.',
                flags: 64,
            });
        }
    },
};
