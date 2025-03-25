const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const LootSplitService = require('../services/LootSplitService');
const AuditLogService = require('../services/AuditLogService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lootsplit')
        .setDescription('Split loot among users after subtracting repair cost')
        .addIntegerOption(option => option.setName('amount').setDescription('Total loot amount').setRequired(true))
        .addIntegerOption(option => option.setName('repaircost').setDescription('Repair cost to subtract').setRequired(true))
        .addStringOption(option => option.setName('users').setDescription('Users to split the loot with').setRequired(true)),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const amount = interaction.options.getInteger('amount');
            const repairCost = interaction.options.getInteger('repaircost');
            const userInput = interaction.options.getString('users');

            const tellerRole = interaction.guild.roles.cache.find(role => role.name === "Teller");
            if (!tellerRole || !interaction.member.roles.cache.has(tellerRole.id)) {
                return interaction.editReply({ content: 'You must have the "Teller" role to use this command.' });
            }

            const lootSplitService = new LootSplitService(interaction, amount, repairCost, userInput);

            const { valid, remainingLoot, message } = lootSplitService.validateLoot();
            if (!valid) return interaction.editReply(message);

            const uniqueUsers = lootSplitService.parseUsers();
            const individualShare = lootSplitService.calculateShares(remainingLoot, uniqueUsers);

            const callbackIdDTO = await AuditLogService.getNextCallbackId();
            const callbackId = callbackIdDTO.callbackId;

            const { userUpdates, auditLogs } = await lootSplitService.processLootSplit(uniqueUsers, individualShare, callbackId);

            const botShare = Math.floor(amount * 0.2);
            const bankUpdate = await lootSplitService.updateBankBalance(botShare, callbackId);

            const embedContent = generateEmbedContent(userUpdates, bankUpdate, amount, repairCost, remainingLoot, individualShare, uniqueUsers.length, callbackId);
            await sendEmbeds(interaction, embedContent, callbackId);

        } catch (error) {
            console.error('Error executing loot split command:', error);
            await interaction.editReply({ content: 'There was an error processing your request.' });
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
