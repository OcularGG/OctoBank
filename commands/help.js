const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

function createHelpEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#ffbf00')
        .setTitle(title)
        .setDescription(description)
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
        const helpEmbed = createHelpEmbed(
            'Octobank Command Help',
            `Here are the available commands:\n\n` +
            `${generalHelp}\n\n` +
            `---\n\n`
        );

        // Send the help embed with all command info
        interaction.reply({ embeds: [helpEmbed] });
    }
};
