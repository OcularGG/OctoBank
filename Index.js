const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = './coins.json';
const auditLogPath = './audit_log.json';
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
require('./SheetsCode.js');
require('./audit_log_compiler.js')

let coinsData = loadData(path, {});
let auditLog = loadData(auditLogPath, []);

function loadData(filePath, defaultData) {
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            console.error(`Error reading ${filePath}:`, error);
        }
    } else {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
    return defaultData;
}

function saveData() {
    fs.writeFileSync(path, JSON.stringify(coinsData, null, 2));
    fs.writeFileSync(auditLogPath, JSON.stringify(auditLog, null, 2));
}

function isTeller(interaction) {
    return interaction.member.roles.cache.some(role => role.name === 'Teller');
}

function createEmbed(title, description, color = '#ffbf00') {
    return new EmbedBuilder()
        .setColor(color)
        .setDescription(description)
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
}

function sendErrorMessage(interaction, error) {
    const embed = createEmbed('Error', error);
    interaction.reply({ embeds: [embed], ephemeral: true });
}

function handleTransaction(interaction, targetUser, amount, action) {
    const username = targetUser.username;
    coinsData[username] = coinsData[username] || 0;
    coinsData[username] += amount;
    auditLog.push({
        action,
        from: interaction.user.username,
        to: targetUser.username,
        amount,
        timestamp: formatTimestamp(new Date())
    });
    saveData();
    updateBotStatus();
}

function formatTimestamp(date) {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleString('en-GB', options).replace(',', '');
}

async function updateBotStatus() {
    let totalOctogold = Object.values(coinsData).reduce((sum, balance) => sum + balance, 0);

    const formattedTotalOctogold = totalOctogold.toLocaleString();
    console.log('Total Octogold calculated:', formattedTotalOctogold);
    try {
        await client.user.setPresence({
            status: 'online',
            activities: [{
                name: ` ${formattedTotalOctogold} OctoGold`,
                type: ActivityType.Watching
            }]
        });
        console.log('Bot status updated successfully.');
    } catch (error) {
        console.error('Error setting bot presence:', error);
    }
}

client.once('ready', async () => {
    console.log('Bot is ready!');

    const commands = [
        new SlashCommandBuilder().setName('balance').setDescription('Check your current OctoGold balance').addUserOption(option => option.setName('user').setDescription('User to check balance of')),
        new SlashCommandBuilder().setName('pay').setDescription('Pay or withdraw OctoGold to a user').addUserOption(option => option.setName('user').setDescription('User to pay').setRequired(true)).addIntegerOption(option => option.setName('amount').setDescription('Amount to pay').setRequired(true)),
        new SlashCommandBuilder().setName('masspay').setDescription('Pay or withdraw OctoGold to multiple users')
            .addIntegerOption(option => option.setName('amount').setDescription('Amount to pay or withdraw').setRequired(true))  // Amount option
            .addStringOption(option => option.setName('users').setDescription('Users to pay, mention multiple users with @').setRequired(true)),  // Users option
        new SlashCommandBuilder().setName('lootsplit').setDescription('Loot split calculator')
            .addIntegerOption(option => option.setName('amount').setDescription('Amount to pay').setRequired(true))
            .addIntegerOption(option => option.setName('repaircost').setDescription('Repair cost to subtract').setRequired(true))
            .addStringOption(option => option.setName('users').setDescription('Users to pay, mention multiple users with @').setRequired(true)),
        new SlashCommandBuilder().setName('audit').setDescription('View the transaction audit log'),
        new SlashCommandBuilder().setName('help').setDescription('Show help message'),
        new SlashCommandBuilder().setName('buy').setDescription('Buy something from the guild market').addUserOption(option => option.setName('user').setDescription('User to spend OctoGold').setRequired(true)).addIntegerOption(option => option.setName('amount').setDescription('Amount to spend').setRequired(true)),
        new SlashCommandBuilder().setName('payout').setDescription('Pay out OctoGold to a user (Teller only)').addUserOption(option => option.setName('user').setDescription('User to payout').setRequired(true))
    ];

    try {
        const guildId = '1097537634756214957'; // The guild ID where you want to register commands
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error("Guild not found.");
            return;
        }

        // Delete all global commands at startup (for testing or full reset)
        console.log("Deleting all global commands...");
        await client.application.commands.set([]);

        // Fetch the currently registered commands for the specific guild
        const registeredCommands = await guild.commands.fetch();
        const existingCommandNames = registeredCommands.map(cmd => cmd.name);

        const commandsToRegister = [];
        const commandsToDelete = [];

        // Loop through each new command
        for (const command of commands) {
            const commandName = command.name;

            // If the command is not registered, add it to commandsToRegister
            if (!existingCommandNames.includes(commandName)) {
                console.log(`Registering new command: ${commandName}`);
                commandsToRegister.push(command);
            } else {
                // Compare only the options (arguments) with the existing ones
                const existingCommand = registeredCommands.find(cmd => cmd.name === commandName);

                const isSameArguments = existingCommand.options.length === command.options.length
                    && existingCommand.options.every((option, index) => {
                        const newOption = command.options[index];
                        return option.name === newOption.name && option.description === newOption.description && option.required === newOption.required;
                    });

                if (!isSameArguments) {
                    console.log(`Command ${commandName} is outdated, deleting and re-registering.`);
                    commandsToDelete.push(existingCommand);  // Mark the outdated command for deletion
                    commandsToRegister.push(command);  // Re-register the new command
                } else {
                    console.log(`Command "${commandName}" up to date`);
                }
            }
        }

        // Delete outdated commands
        if (commandsToDelete.length > 0) {
            console.log("Deleting outdated commands...");
            for (const command of commandsToDelete) {
                await guild.commands.delete(command.id);
            }
        }

        // Register new commands for the guild
        if (commandsToRegister.length > 0) {
            console.log("Registering new commands...");
            for (const command of commandsToRegister) {
                await guild.commands.create(command);
            }
        }

        console.log("Commands registered/updated successfully");

    } catch (error) {
        console.error("Error registering commands:", error);
    }

    await updateBotStatus();
});





client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;
    const args = interaction.options;

    // Ensure only users from the specified guild can use commands
    const allowedGuildId = '1097537634756214957';
    if (interaction.guildId !== allowedGuildId) {
        return sendErrorMessage(interaction, 'You are not allowed to use commands outside the authorized guild.');
    }

    // Handle the command here...



    if (commandName === 'balance') {
        const targetUser = args.getUser('user') || interaction.user;
        const balance = coinsData[targetUser.username] || 0;
        const formattedBalance = balance.toLocaleString();

        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(`[**OctoBank**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold.`)
            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
        interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'pay') {
        if (!isTeller(interaction)) {
            sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
            return;
        }
    
        const targetUser = args.getUser('user');
        const amount = args.getInteger('amount');
        if (!targetUser || isNaN(amount)) {
            sendErrorMessage(interaction, 'Invalid command usage! Example: `/pay @user 100`');
            return;
        }
    
        const actionType = amount < 0 ? 'withdraw' : 'deposit';
        const actionLink = actionType === 'withdraw' ? '[**OctoBank Withdrawal**](https://octobank.ocular-gaming.net/)' : '[**OctoBank Deposit**](https://octobank.ocular-gaming.net/)';
        handleTransaction(interaction, targetUser, amount, actionType);
    
        const formattedAmount = Math.abs(amount).toLocaleString();
    
        const actionMessage = actionType === 'withdraw'
            ? `**${interaction.user.username}** has withdrawn <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold from **${targetUser.username}**'s wallet.`
            : `**${interaction.user.username}** has deposited <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold to **${targetUser.username}**'s wallet.`;
    
        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(`${actionLink}\n\n${actionMessage}`)
            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
            .setTimestamp();  // Automatically sets the current timestamp
    
        interaction.reply({ embeds: [embed] });
        saveData();
    }
    

    if (commandName === 'buy') {
        if (!isTeller(interaction)) {
            sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
            return;
        }
    
        const targetUser = args.getUser('user');
        const amount = args.getInteger('amount');
    
        if (!targetUser || isNaN(amount)) {
            sendErrorMessage(interaction, 'Invalid command usage! Example: `/buy @user 100`');
            return;
        }
    
        if (amount <= 0) {
            sendErrorMessage(interaction, 'The amount must be greater than 0.');
            return;
        }
    
        const targetUsername = targetUser.username;
        let currentBalance = coinsData[targetUsername] || 0;
    
        // Format the amount and current balance for display
        const formattedAmount = amount.toLocaleString();
        const formattedCurrentBalance = currentBalance.toLocaleString();
    
        // Check if the user will go negative after the purchase
        if (currentBalance < amount) {
            const amountToGoNegative = (amount - currentBalance).toLocaleString();
    
            // If so, create a warning message
            const warningEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`**Warning:** **${targetUser.username}** is about to go into the negative by <:OctoGold:1324817815470870609> **${amountToGoNegative}** OctoGold! Are you sure you want to proceed?`);
    
            const yesButton = new ButtonBuilder()
                .setCustomId('yes')
                .setLabel('Yes')
                .setStyle(ButtonStyle.Success);
    
            const noButton = new ButtonBuilder()
                .setCustomId('no')
                .setLabel('No')
                .setStyle(ButtonStyle.Danger);
    
            const row = new ActionRowBuilder().addComponents(yesButton, noButton);
    
            await interaction.reply({
                embeds: [warningEmbed],
                components: [row],
                ephemeral: true,
            });
    
            const filter = (buttonInteraction) => buttonInteraction.user.id === interaction.user.id;
            const collector = interaction.channel.createMessageComponentCollector({
                filter,
                time: 60000, // 1 minute for the user to respond
            });
    
            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.customId === 'yes') {
                    // Proceed with the transaction, even though the user goes negative
                    coinsData[targetUsername] -= amount; // Update the balance
    
                    // Log the transaction to the audit log
                    auditLog.push({
                        action: 'buy',
                        from: interaction.user.username,
                        to: targetUser.username,
                        amount: -amount, // Negative because it's a subtraction
                        timestamp: formatTimestamp(new Date()),
                    });
    
                    saveData();
    
                    // Success message
                    const successEmbed = new EmbedBuilder()
                        .setColor('#ffbf00')
                        .setDescription(`**${targetUser.username}** just spent <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold in the guild market!`)
                        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
                        .setFooter({ text: `Transaction completed by ${interaction.user.username}` });
    
                    await buttonInteraction.update({ embeds: [successEmbed], components: [] });
    
                } else if (buttonInteraction.customId === 'no') {
                    // Cancel the transaction
                    const cancelEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription(`The purchase by **${targetUser.username}** has been cancelled.`);
    
                    await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
                }
    
                collector.stop(); // Stop the collector after the user has responded
            });
    
        } else {
            // If the user can afford the purchase, proceed as usual
            coinsData[targetUsername] -= amount;
    
            // Log the transaction to the audit log
            auditLog.push({
                action: 'buy',
                from: interaction.user.username,
                to: targetUser.username,
                amount: -amount, // Negative because it's a subtraction
                timestamp: formatTimestamp(new Date()),
            });
    
            saveData();
    
            // Success message
            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`**${targetUser.username}** just spent <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold in the guild market!`)
                .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
                .setFooter({ text: `Transaction completed by ${interaction.user.username}` });
    
            interaction.reply({ embeds: [embed] });
    
            // Update bot status
            await updateBotStatus();
        }
    }
    
    
    if (commandName === 'masspay') {
        if (!isTeller(interaction)) {
            sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
            return;
        }
    
        const amount = args.getInteger('amount');
        const userInput = args.getString('users');
        if (isNaN(amount) || amount === 0 || !userInput) {
            sendErrorMessage(interaction, 'Invalid command usage! Example: `/masspay 100 @user1 @user2 @user3`');
            return;
        }
    
        const mentionRegex = /<@!?(\d+)>/g;
        const mentionedUserIds = [];
        let match;
        while ((match = mentionRegex.exec(userInput)) !== null) {
            mentionedUserIds.push(match[1]);
        }
    
        if (mentionedUserIds.length === 0) {
            sendErrorMessage(interaction, 'No valid user mentions found! Example: `/masspay 100 @user1 @user2 @user3`');
            return;
        }
    
        let actionMessage;
        let actionType = amount < 0 ? 'withdraw' : 'deposit';
        let usersList = [];
        for (const userId of mentionedUserIds) {
            const targetUser = await interaction.guild.members.fetch(userId);
            if (targetUser) {
                const username = targetUser.user.username;
                coinsData[username] = coinsData[username] || 0;
                coinsData[username] += amount;
                usersList.push(`**${targetUser.user.username}**`);
                auditLog.push({
                    action: actionType === 'withdraw' ? 'masswithdraw' : 'masspay',
                    from: interaction.user.username,
                    to: targetUser.user.username,
                    amount,
                    timestamp: formatTimestamp(new Date())  // This is where timestamp was manually set
                });
            }
        }
    
        const formattedAmount = Math.abs(amount).toLocaleString();
    
        actionMessage = actionType === 'withdraw'
            ? `**${interaction.user.username}** has withdrawn <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold from the following users' wallets:\n${usersList.join('\n')}`
            : `**${interaction.user.username}** has deposited <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold into the following users' wallets:\n${usersList.join('\n')}`;
    
        const actionText = actionType === 'withdraw'
            ? '[**Octobank Mass Withdrawal**](https://octobank.ocular-gaming.net/)'
            : '[**Octobank Mass Deposit**](https://octobank.ocular-gaming.net/)';
    
        const embed = createEmbed('Mass Transaction Successful', `${actionText}\n\n${actionMessage}`);
        embed.setTimestamp();  // This automatically sets the timestamp
    
        interaction.reply({ embeds: [embed] });
        saveData();
    }
    
    
    if (commandName === 'payout') {
        if (!isTeller(interaction)) {
            return sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
        }
    
        const targetUser = args.getUser('user');
        if (!targetUser) {
            return sendErrorMessage(interaction, 'Please mention a user to pay out to.');
        }
    
        const balance = coinsData[targetUser.username] || 0;

        const formattedBalance = balance.toLocaleString();
    
        const payoutEmbed = createEmbed(
            'Confirm Payout',
            `**${targetUser.username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold in their bank.\nAre you sure you want to pay them out?`
        ).setFooter({text: 'Once completed, this payout cannot be undone.'});
    
        const yesButton = new ButtonBuilder()
            .setCustomId('yes')
            .setLabel('Yes')
            .setStyle(ButtonStyle.Success);
    
        const noButton = new ButtonBuilder()
            .setCustomId('no')
            .setLabel('No')
            .setStyle(ButtonStyle.Danger);
    
        const row = new ActionRowBuilder().addComponents(yesButton, noButton);
    
        await interaction.reply({
            embeds: [payoutEmbed],
            components: [row],
            ephemeral: true
        });
    
        const filter = (buttonInteraction) => buttonInteraction.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({
            filter,
            time: 60000, // Buttons now expire after 1 minute (60000ms)
        });
    
        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId === 'yes') {
                // Payout the user
                coinsData[targetUser.username] = 0; // Zero out the balance
                auditLog.push({
                    action: 'payout',
                    from: interaction.user.username,
                    to: targetUser.username,
                    amount: balance, // Log the payout amount
                    timestamp: formatTimestamp(new Date())
                });
    
                saveData();
    
                const successEmbed = createEmbed(
                    'Payout Complete',
                    `**${targetUser.username}** has successfully received their payout of <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold. Their balance is now cleared.`
                );
    
                await buttonInteraction.update({ embeds: [successEmbed], components: [] });
            } else if (buttonInteraction.customId === 'no') {
                // Cancel payout
                const cancelEmbed = createEmbed(
                    'Payout Cancelled',
                    `The payout to **${targetUser.username}** has been cancelled.`
                );
    
                await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
            }
    
            collector.stop(); // Stop the collector after a button is pressed
    
            // Update the bot status after the payout transaction (successful or cancelled)
            await updateBotStatus();
        });
    
        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = createEmbed(
                    'Payout Timeout',
                    'The payout request has expired due to inactivity.'
                );
                interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            }
    
            // Update the bot status after timeout
            updateBotStatus();
        });
    }
    if (commandName === 'lootsplit') {
        if (!isTeller(interaction)) {
            return sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
        }
    
        const amount = args.getInteger('amount'); // Total loot amount
        const repairCost = args.getInteger('repaircost'); // Repair cost to subtract
        const userInput = args.getString('users'); // Users to split the loot with (as a string)
    
        // Validate inputs
        if (isNaN(amount) || isNaN(repairCost) || amount <= 0 || repairCost < 0) {
            return sendErrorMessage(interaction, 'Invalid command usage! Example: `/lootsplit 100 10 @user1 @user2 @user3`');
        }
    
        // Calculate the remaining loot after subtracting repair cost
        const remainingLoot = amount - repairCost;
        if (remainingLoot <= 0) {
            return sendErrorMessage(interaction, 'The loot after subtracting the repair cost must be greater than 0.');
        }
    
        // Calculate the bot's 20% share (rounded down)
        const botShare = Math.floor(remainingLoot * 0.2);
        const userShare = Math.floor(remainingLoot * 0.8);
    
        // Parse the userInput string into an array of users
        const mentionedUsers = userInput.split(/\s+/); // Split by spaces or any whitespace
    
        if (mentionedUsers.length === 0) {
            return sendErrorMessage(interaction, 'No users mentioned to split the loot with!');
        }
    
        // Calculate how much each user gets (rounded down)
        const individualShare = Math.floor(userShare / mentionedUsers.length);
    
        // Prepare the response message
        let userDetails = ""; // Store user split details
    
        // Distribute loot among mentioned users
        for (const userId of mentionedUsers) {
            const user = interaction.guild.members.cache.get(userId.replace(/[<@!>]/g, '')); // Extract user ID
            if (!user) continue; // Skip if user is not found
    
            const username = user.user.username;
            coinsData[username] = coinsData[username] || 0;
            coinsData[username] += individualShare;
    
            // Log the transaction in the audit for this specific user
            auditLog.push({
                action: 'lootsplit',
                from: interaction.user.username,
                to: user.username,
                amount: individualShare,
                timestamp: Math.floor(Date.now() / 1000) // Use Unix timestamp in seconds
            });
    
            // Add user to the details list with bold username and formatted share
            const balanceTotal = coinsData[username];
            userDetails += `- **${username}** received <:OctoGold:1324817815470870609> **${individualShare.toLocaleString()}** OctoGold, and now has <:OctoGold:1324817815470870609> **${balanceTotal.toLocaleString()}** OctoGold\n`;
        }
    
        // Add the bot's share to the bot's balance (OctoBank)
        coinsData['OctoBank'] = coinsData['OctoBank'] || 0;
        coinsData['OctoBank'] += botShare;
    
        // Log the bot's transaction
        auditLog.push({
            action: 'lootsplit',
            from: interaction.user.username,
            to: 'OctoBank',  // Bot's username
            amount: botShare,
            timestamp: Math.floor(Date.now() / 1000) // Use Unix timestamp in seconds
        });
    
        // Save the updated data (coins and audit log)
        saveData();
    
        const formattedAmount = Math.abs(amount).toLocaleString();
        const formattedRepairCost = Math.abs(repairCost).toLocaleString();
        const formattedBotShare = botShare.toLocaleString();
        const formattedRemainingLoot = (remainingLoot - botShare).toLocaleString();
        const individualShareFormatted = individualShare.toLocaleString();
    
        const actionMessage = `
            **Loot Split**
            <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold is being split.\n
            __**Repair:**__ <:OctoGold:1324817815470870609> **${formattedRepairCost}** OctoGold
            __**Guild Tax:**__ <:OctoGold:1324817815470870609> **${formattedBotShare}** OctoGold
            __**Being Split:**__ <:OctoGold:1324817815470870609> **${formattedRemainingLoot}** OctoGold to **${mentionedUsers.length}** players. Each share is worth <:OctoGold:1324817815470870609> **${individualShareFormatted}** OctoGold.\n
            **Share Details:**
            ${userDetails}
        `;
    
        // Define the timestamp before sending the message
        const timestamp = Math.floor(Date.now() / 1000);
    
        // Function to send embed messages (splitting if necessary)
        const sendEmbed = (content) => {
            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(content)
                .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
                .setTimestamp()  // Automatically adds the timestamp to the embed
                .setFooter({
                    text: `Submitted by ${interaction.user.username} `, // Use short date and time format
                });
    
            interaction.reply({ embeds: [embed] });
        };
    
        // Check if the content exceeds the 6000 character limit
        if (actionMessage.length > 6000) {
            const firstEmbedContent = actionMessage.slice(0, 6000); // First part of the message
            const secondEmbedContent = actionMessage.slice(6000); // Remaining part of the message
    
            // Send the first embed
            sendEmbed(firstEmbedContent);
    
            // Send the second embed with a slight delay
            setTimeout(() => {
                sendEmbed(secondEmbedContent);
            }, 1000); // Add a slight delay to avoid rate limit errors
        } else {
            // Send a single embed if it's under the character limit
            sendEmbed(actionMessage);
        }
    
        // Update bot status after the transaction
        await updateBotStatus();
    }
    
    
    
    
    
    if (commandName === 'help') {
        const helpEmbed = createEmbed(
            'Octobank Command Help',
            `**/balance**: Check your current OctoGold balance\n` +
            `**/pay**: Pay or withdraw OctoGold to a user (Teller only)\n` +
            `**/masspay**: Pay or withdraw OctoGold to multiple users (Teller only)\n` +
            `**/audit**: View the transaction audit log (Teller only)\n` +
            `**/buy**: Spend OctoGold in the guild market (Teller only)\n` +
            `**/payout**: Pay out OctoGold to a user (Teller only)\n` +
            `**/lootsplit**: Lootsplit calculator`
        );
        interaction.reply({ embeds: [helpEmbed] });
    }

});
client.login('MTMyNDQzMDIzMTEyOTQyODA4OA.GOc63x.ZUYK4liah20puTginEMJOBG_Li8EUvkOJu4JVk');
