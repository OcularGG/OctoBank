const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../classes/User');
const AuditLogService = require('../services/AuditLogService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Transfer OctoGold to another user.')
        .addIntegerOption(option => 
            option
                .setName('amount')
                .setDescription('How much do you want to transfer?')
                .setRequired(true)
        )
        .addUserOption(option =>
            option
                .setName('recipient')
                .setDescription('Who are you transferring to?')
                .setRequired(true)
        ),

    async execute(interaction) {
        try {
            await interaction.deferReply();

            const tipper = interaction.user; 
            const amount = interaction.options.getInteger('amount');
            const recipientMember = interaction.options.getUser('recipient');

            if (amount <= 0) {
                return interaction.editReply('You can only transfer positive amounts.');
            }

            if (tipper === recipientMember) {
                return interaction.editReply('You cannot transfer money to yourself.');
            }

            // Fetch the User instances for both the tipper and recipient
            const tipperUser = await User.fetchUser(tipper.username);
            const recipientUser = await User.fetchUser(recipientMember.username);

            const transferBalance = tipperUser.getBalance();
            if (transferBalance < amount) {
                return interaction.editReply('You don\'t have enough OctoGold to complete the transfer.');
            }

            // Update the balances
            const newTipperBalance = transferBalance - amount;
            const newRecipientBalance = recipientUser.getBalance() + amount;

            // Set the new balances using the User class method
            await User.updateBalance(tipper.username, newTipperBalance);
            await User.updateBalance(recipientMember.username, newRecipientBalance);

            const callbackId = await AuditLogService.getNextCallbackId();

            // Log the action in the audit log
            await AuditLogService.logAudit('Transfer', tipper.username, recipientMember.username, amount, `Received`, callbackId);
            await AuditLogService.logAudit('Transfer', recipientMember.username, tipper.username, amount * -1, `Transfered`, callbackId);
            // Prepare the embed response
            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setTitle('Transfer Confirmation')
                .setDescription(
                    `**${tipper.username}** has transferred ` +
                    `<:OctoGold:1324817815470870609> **${amount.toLocaleString()}** OctoGold to **${recipientMember.username}**.`
                )
                .addFields(
                    { 
                        name: `${tipper.username}'s New Balance`, 
                        value: `<:OctoGold:1324817815470870609> **${newTipperBalance.toLocaleString()}** OctoGold`, 
                        inline: true 
                    },
                    { 
                        name: `${recipientMember.username}'s New Balance`, 
                        value: `<:OctoGold:1324817815470870609> **${newRecipientBalance.toLocaleString()}** OctoGold`, 
                        inline: true 
                    }
                )
                .setFooter({ text: `Transaction ID: ${callbackId}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error executing transfer command:', error);
            await interaction.followUp({ content: 'There was an error processing your transfer.' });
        }
    },
};
