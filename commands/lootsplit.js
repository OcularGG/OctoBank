const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lootsplit')
        .setDescription('Split loot among users after subtracting repair cost')
        .addIntegerOption(option => option.setName('amount').setDescription('Total loot amount').setRequired(true))
        .addIntegerOption(option => option.setName('repaircost').setDescription('Repair cost to subtract').setRequired(true))
        .addStringOption(option => option.setName('users').setDescription('Users to split the loot with').setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const amount = interaction.options.getInteger('amount');
        const repairCost = interaction.options.getInteger('repaircost');
        const userInput = interaction.options.getString('users');

        const tellerRole = interaction.guild.roles.cache.find(role => role.name === "Teller");
        if (!tellerRole || !interaction.member.roles.cache.has(tellerRole.id)) {
            return interaction.editReply({ content: 'You must have the "Teller" role to use this command.' });
        }

        try {
            const mentionedUsers = userInput.match(/<@!?(\d+)>/g)?.map((mention) => mention.replace(/[<@!>]/g, '')) || [];
            const parsedUserIds = [...new Set(mentionedUsers)]; // Deduplicate user IDs

            if (parsedUserIds.length === 0) {
                return interaction.editReply({ content: 'No valid users mentioned to split the loot with!' });
            }

            const parsedUsers = await Promise.all(
                parsedUserIds.map(async (userId) => {
                    const targetUser = await interaction.guild.members.fetch(userId);
                    return targetUser.user.username;
                })
            );

            const response = await axios.post('http://localhost:3000/api/lootsplit', {
                amount,
                repairCost,
                userInput: parsedUsers,
                senderUsername: interaction.user.username,
            });

            const result = response.data;

            if (!result.success) {
                return interaction.editReply({ content: `❌ Loot split failed: ${result.message}` });
            }

            const embedContent = generateEmbedContent(
                result.userUpdates,
                result.bankUpdate,
                amount,
                repairCost,
                result.remainingLoot,
                result.individualShare,
                result.numUsers,
                result.callbackId
            );

            await sendEmbeds(interaction, embedContent, result.callbackId);
        } catch (error) {
            console.error('Error processing loot split:', error);
            return interaction.editReply({ content: 'There was an error processing the loot split. Please try again later.' });
        }
    },
};

function generateEmbedContent(userUpdates, bankUpdate, amount, repairCost, userShare, individualShare, numUsers, callbackId) {
    const lootsplitDecemil = (userShare / amount) * 100;
    const lootsplitPercentage = lootsplitDecemil.toFixed(2) + "%";
    let userDetails = userUpdates.map((user) =>
        `**${user.username}** received <:OctoGold:1324817815470870609> **${user.coins.toLocaleString()}** OctoGold, and now has <:OctoGold:1324817815470870609> **${user.coins.toLocaleString()}** OctoGold`
    ).join('\n');

    return `
**Loot Split**
<:OctoGold:1324817815470870609> **${amount.toLocaleString()}** OctoGold is being split.

__**Repair:**__ <:OctoGold:1324817815470870609> **${repairCost.toLocaleString()}** OctoGold
__**Guild Tax:**__ <:OctoGold:1324817815470870609> **${Math.floor(amount * 0.2).toLocaleString()}** OctoGold
__**Being Split:**__ <:OctoGold:1324817815470870609> **${userShare.toLocaleString()}** (${lootsplitPercentage}) OctoGold to **${numUsers}** players. Each share is worth <:OctoGold:1324817815470870609> **${individualShare.toLocaleString()}** OctoGold.

${userDetails}
    `;
}

async function sendEmbeds(interaction, embedContent, callbackId) {
    const lines = embedContent.split('\n');
    const LINES_PER_EMBED = 20;
    let currentIndex = 0;
    let isFirstEmbed = true;

    while (currentIndex < lines.length) {
        const chunk = lines.slice(currentIndex, currentIndex + LINES_PER_EMBED).join('\n');
        currentIndex += LINES_PER_EMBED;

        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(chunk)
            .setAuthor({
                name: interaction.client.user.username,
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setFooter({
                text: `ID: ${callbackId} | Transaction processed by ${interaction.user.username}`,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTimestamp();

        if (isFirstEmbed) {
            await interaction.editReply({ embeds: [embed] });
            isFirstEmbed = false;
        } else {
            await interaction.followUp({ embeds: [embed] });
        }
    }
}