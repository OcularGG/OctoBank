// pay.js (Command file)
const { SlashCommandBuilder } = require('discord.js');
const PaymentService = require('../services/PaymentService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Give or withdraw coins from another user')
        .addUserOption(option => option.setName('user').setDescription('The user to send coins to or withdraw from').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Amount of coins to send or withdraw').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('What is this payment for?').setRequired(true)),

    async execute(interaction) {
        const sender = interaction.user;
        const recipient = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');

        await interaction.deferReply();

        await PaymentService.processPayment(interaction, amount, sender, recipient, reason);
    },
};
