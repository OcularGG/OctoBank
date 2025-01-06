const { EmbedBuilder } = require('discord.js');

module.exports = async (client, interaction, coinsData) => {
    console.log('Processing balance command...');

    // Check if the interaction has already been deferred or replied
    if (!interaction.deferred && !interaction.replied) {
        console.log('Deferring interaction...');
        await interaction.deferReply();  // Defer the interaction if it's not already deferred or replied to
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const balance = coinsData[targetUser.username] || 0;
    const formattedBalance = balance.toLocaleString();

    const embed = new EmbedBuilder()
        .setColor('#ffbf00')
        .setDescription(`[**OctoBank**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold.`)
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });

    try {
        console.log('Sending balance embed...');
        // Use editReply instead of followUp to handle deferred interactions
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('Error sending balance embed:', error);
        // If an error happens, send an ephemeral error message
        await interaction.editReply({ content: 'There was an error fetching the balance. Please try again later.', ephemeral: true });
    }
};
