const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function createHelpEmbed(description, bot, user) {
    return new EmbedBuilder()
        .setColor('#ffbf00')
        .setDescription(description)  // Only set the description
        .setAuthor({
            name: bot.user.username,  // Bot's name
            iconURL: bot.user.displayAvatarURL(),  // Bot's avatar
        })
        .setFooter({
            text: `Requested by: ${user.username}`,  // User who requested the help
            iconURL: user.displayAvatarURL()  // User's avatar in the footer
        })
        .setTimestamp();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays the list of available commands and their descriptions'),

    async execute(interaction) {
        // General Command Help
        const generalHelp = `**/balance**: Check your current OctoGold balance\n` +
                            `**/pay**: Pay or withdraw OctoGold to a user (Teller only)\n` +
                            `**/masspay**: Pay or withdraw OctoGold to multiple users (Teller only)\n` +
                            `**/buy**: Spend OctoGold in the guild market (Teller only)\n` +
                            `**/payout**: Pay out OctoGold to a user (Teller only)\n` +
                            `**/lootsplit**: Lootsplit calculator`;

        // Create the embed with no title, just description, and include the bot's name, avatar, and user's avatar in the footer
        const helpEmbed = createHelpEmbed(generalHelp, interaction.client, interaction.user);

        // Send the help embed with all command info
        interaction.reply({ embeds: [helpEmbed] });
    }
};
