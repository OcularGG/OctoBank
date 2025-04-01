const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Give or withdraw coins from another user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to send coins to or withdraw from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of coins to send or withdraw')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('What is this payment for?')
                .setRequired(true)),

    async execute(interaction) {
        const sender = interaction.user;
        const recipient = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');

        await interaction.deferReply();

        try {
            const tellerRole = interaction.guild.roles.cache.find(role => role.name === "Teller");
            if (!tellerRole || !interaction.member.roles.cache.has(tellerRole.id)) {
                return { success: false, message: 'You must have the "Teller" role to use this command.' };
            }

            const response = await axios.post('http://localhost:3000/api/pay', {
                senderUsername: sender.username,
                recipientUsername: recipient.username,
                amount,
                reason,
            });

            const result = response.data;

            if (!result.success) {
                return interaction.editReply({ content: `❌ Payment failed: ${result.message}` });
            }

            const actionMessage = result.actionType === 'withdraw'
                ? `**${sender.username}** has withdrawn <:OctoGold:1324817815470870609> **${result.formattedAmount}** OctoGold from **${recipient.username}**'s wallet.`
                : `**${sender.username}** has deposited <:OctoGold:1324817815470870609> **${result.formattedAmount}** OctoGold to **${recipient.username}**'s wallet.`;

            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`\n${actionMessage}\n\nReason: **${reason}**`)
                .setAuthor({ name: interaction.client.user.username, iconURL: interaction.client.user.displayAvatarURL() })
                .setFooter({ text: `ID: ${result.callbackId} | Processed by: ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error processing payment:', error);
            return interaction.editReply({ content: '❌ There was an error processing the payment. Please try again later.' });
        }
    },
};