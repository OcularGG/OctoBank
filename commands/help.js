const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function createHelpEmbed(description, bot, user) {
    return new EmbedBuilder()
        .setColor('#ffbf00')
        .setDescription(description)
        .setAuthor({
            name: bot.user.username,
            iconURL: bot.user.displayAvatarURL()
        })
        .setFooter({
            text: `Requested by: ${user.username}`,
            iconURL: user.displayAvatarURL()
        })
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays the list of available commands and their descriptions'),

    async execute(interaction) {
        const generalHelp = `**/balance**: Check your current OctoGold balance\n` +
                            `**/transfer**: Transfer OctoGold between users\n` +
                            `**/pay**: Pay or withdraw OctoGold to a user (Teller only)\n` +
                            `**/masspay**: Pay or withdraw OctoGold to multiple users (Teller only)\n` +
                            `**/buy**: Spend OctoGold in the guild market (Teller only)\n` +
                            `**/payout**: Pay out OctoGold to a user (Teller only)\n` +
                            `**/lootsplit**: Lootsplit calculator (Teller only)`;

        const helpEmbed = createHelpEmbed(generalHelp, interaction.client, interaction.user);

        interaction.reply({ embeds: [helpEmbed] });
    }
};
