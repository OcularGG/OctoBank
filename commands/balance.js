const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

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

            // Make a POST request to the server to get the balance
            const response = await axios.post('http://localhost:3000/api/balance', {
                username: targetUser.username,
            });

            const balance = response.data.balance;
            const formattedBalance = balance.toLocaleString();

            // Create the embed directly in the command
            const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(`[**OctoBank**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold.`)
            .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
            .setFooter({ text: `Balance requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

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