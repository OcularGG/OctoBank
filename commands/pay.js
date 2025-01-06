const { EmbedBuilder } = require('discord.js');

module.exports = async (client, interaction, coinsData, sendErrorMessage, saveData, saveAuditLog, updateBotStatus) => {
    console.log('Processing Pay command...');
   
    if (!interaction.deferred && !interaction.replied) {
        console.log('Deferring interaction...');
        await interaction.deferReply();  // Defer the interaction if it's not already deferred or replied to
    }

    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    // Validate input
    if (!targetUser || isNaN(amount)) {
        sendErrorMessage(interaction, 'Invalid command usage! Example: `/pay @user 100`');
        return;
    }

    const actionType = amount < 0 ? 'withdraw' : 'deposit';
    const actionLink = actionType === 'withdraw'
        ? '[**OctoBank Withdrawal**](https://octobank.ocular-gaming.net/)'
        : '[**OctoBank Deposit**](https://octobank.ocular-gaming.net/)';

    const username = targetUser.username;

    // Update coinsData and save to database
    coinsData[username] = (coinsData[username] || 0) + amount;

    try {
        // Save updated balance to database
        await saveData('Coins', [{ username, coins: coinsData[username] }]);

        // Log transaction in the audit log
        await saveAuditLog(actionType, interaction.user.username, username, amount);

        // Prepare response message
        const formattedAmount = Math.abs(amount).toLocaleString();
        const actionMessage = actionType === 'withdraw'
            ? `**${interaction.user.username}** has withdrawn <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold from **${username}**'s wallet.`
            : `**${interaction.user.username}** has deposited <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold to **${username}**'s wallet.`;

        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(`${actionLink}\n\n${actionMessage}`)
            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        // Send the response after processing
        await interaction.editReply({ embeds: [embed] });

        // Update bot status
        await updateBotStatus();
    } catch (error) {
        console.error('Error processing pay command:', error);
        sendErrorMessage(interaction, 'An error occurred while processing the transaction. Please try again later.');
    }
};
