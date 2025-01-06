const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = './coins.json';
const auditLogPath = './audit_log.json';
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const mysql = require('mysql2/promise');
const dbConfig = {
    host: 'db-buf-05.sparkedhost.us',
    port: 3306,
    user: 'u159065_dT0ZxTfNn0',
    password: 'e4!=6PqJ+dFyquGs@OczJcVR',
    database: 's159065_OctoBank'
};


// Create a connection pool
const pool = mysql.createPool(dbConfig);

// Declare coinsData globally
let coinsData = {};  // Initialize coinsData

// Function to load data from the database
async function loadData(tableName) {
    try {
        const [rows] = await pool.query(`SELECT * FROM ${tableName}`);
        console.log(`Data loaded from ${tableName}:`, rows);
        return rows;
    } catch (error) {
        console.error(`Error loading data from ${tableName}:`, error);
        return [];
    }
}

// Function to save data to the database
async function saveData(tableName, data) {
    try {
        // Ensure data is an array
        if (!Array.isArray(data)) {
            throw new Error('Invalid data format: data must be an array of records.');
        }

        // Iterate over the data and save each record
        for (const record of data) {
            // Validate that each record has the required fields
            if (!record.username || typeof record.coins === 'undefined') {
                throw new Error(`Invalid record: ${JSON.stringify(record)} - Each record must have 'username' and 'coins'.`);
            }

            // Execute the query
            await pool.query(
                `INSERT INTO ${tableName} (username, balance) VALUES (?, ?) 
                 ON DUPLICATE KEY UPDATE balance = ?`,
                [record.username, record.coins, record.coins]
            );
        }

        console.log(`Data successfully saved to ${tableName}.`);
    } catch (error) {
        console.error(`Error saving data to ${tableName}:`, error);
    }
}


// Define the `saveAuditLog` function to store audit logs
async function saveAuditLog(action, sender, target, amount) {
    try {
        // Format timestamp correctly for the database
        const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Execute the query
        const query = `
            INSERT INTO AuditLog (action, sender, target, amount, timestamp)
            VALUES (?, ?, ?, ?, ?)
        `;
        await pool.query(query, [action, sender, target, amount, timestamp]);

        console.log('Audit log saved successfully.');
    } catch (error) {
        // Handle and log error
        console.error('Error saving audit log:', error);

        // Additional debugging to help pinpoint issues
        if (error.code) {
            console.error(`Error code: ${error.code}`);
        }
        if (error.sqlMessage) {
            console.error(`SQL Message: ${error.sqlMessage}`);
        }
        if (error.sql) {
            console.error(`SQL Query: ${error.sql}`);
        }
    }
}

// Load coins data from the database (ensures it's available)
async function loadCoinsData() {
    const data = await loadData('Coins');
    coinsData = data.reduce((acc, record) => {
        acc[record.username] = record.balance;
        return acc;
    }, {}); // Create a coinsData object from the rows
}

// Initialize coins data when the bot starts
client.once('ready', async () => {
    await loadCoinsData();  // Load data from DB on bot start
    console.log('Bot is ready!');
});

// Check if the user is a "Teller" based on their role
function isTeller(interaction) {
    return interaction.member.roles.cache.some(role => role.name === 'Teller');
}

// Create an embedded message
function createEmbed(title, description, color = '#ffbf00') {
    return new EmbedBuilder()
        .setColor(color)
        .setDescription(description)
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
}

// Send error message as an embed
function sendErrorMessage(interaction, error) {
    const embed = createEmbed('Error', error);
    interaction.reply({ embeds: [embed], ephemeral: true });
}

// Handle coin transactions between users
async function handleTransaction(interaction, targetUser, amount, action) {
    const username = targetUser.username;
    coinsData[username] = coinsData[username] || 0;
    coinsData[username] += amount;

    // Save the audit log to the database
    await saveAuditLog(action, interaction.user.username, targetUser.username, amount);

    // Save the updated coins data to the database
    await saveData('Coins', Object.entries(coinsData).map(([username, coins]) => ({ username, coins })));

    // Update the bot's status
    await updateBotStatus();
}

// Format the timestamp
function formatTimestamp(date) {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleString('en-GB', options).replace(',', '');
}

async function getTotalCoins() {
    try {
        // Create a connection to the database
        const connection = await mysql.createConnection(dbConfig);

        // Query to calculate the total value of coins
        const [rows] = await connection.execute('SELECT SUM(balance) AS total_coins FROM Coins');

        // Close the connection
        await connection.end();

        // Extract and return the total_coins value
        const totalCoins = rows[0].total_coins || 0; // Default to 0 if null
        console.log(`Total coins: ${totalCoins}`);
        return totalCoins;
    } catch (error) {
        console.error('Error fetching total coins:', error);
        throw error; // Re-throw the error for further handling if necessary
    }
}

// Update the bot's status with the total OctoGold
async function updateBotStatus() {
    getTotalCoins().then(total => {
        console.log('Total coins value:', total);
    }).catch(err => {
        console.error('Error:', err);
    });
    const totalOctogold = Object.values(coinsData).reduce((sum, balance) => sum + balance, 0);

    const formattedTotalOctogold = totalOctogold.toLocaleString();  // Format with commas
    console.log('Total Octogold calculated:', formattedTotalOctogold);

    try {
        await client.user.setPresence({
            status: 'online',
            activities: [{
                name: `${formattedTotalOctogold} OctoGold`,
                type: ActivityType.Watching
            }]
        });
        console.log('Bot status updated successfully.');
    } catch (error) {
        console.error('Error setting bot presence:', error);
    }
}


// Add event listener to ensure the bot is ready and operational
client.once('ready', () => {
    console.log(`${client.user.tag} is now online!`);
});


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

            interaction.reply({ embeds: [embed] });

            // Update bot status
            await updateBotStatus();
        } catch (error) {
            console.error('Error processing pay command:', error);
            sendErrorMessage(interaction, 'An error occurred while processing the transaction. Please try again later.');
        }
    }



    if (commandName === 'buy') {
        if (!isTeller(interaction)) {
            sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
            return;
        }

        const targetUser = args.getUser('user');
        const amount = args.getInteger('amount');

        // Validate input
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

        const formattedAmount = amount.toLocaleString();
        const formattedCurrentBalance = currentBalance.toLocaleString();

        // Check if the user will go negative after the purchase
        if (currentBalance < amount) {
            const amountToGoNegative = (amount - currentBalance).toLocaleString();

            const warningEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setDescription(`**Warning:** **${targetUsername}** is about to go into the negative by <:OctoGold:1324817815470870609> **${amountToGoNegative}** OctoGold! Are you sure you want to proceed?`);

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
                time: 60000,
            });

            collector.on('collect', async (buttonInteraction) => {
                if (buttonInteraction.customId === 'yes') {
                    try {
                        // Deduct the amount and save to database
                        coinsData[targetUsername] -= amount;
                        await saveData('Coins', [{ username: targetUsername, coins: coinsData[targetUsername] }]);

                        // Log the transaction in the audit log
                        await saveAuditLog('buy', interaction.user.username, targetUsername, -amount);

                        // Success message
                        const successEmbed = new EmbedBuilder()
                            .setColor('#ffbf00')
                            .setDescription(`**${targetUsername}** just spent <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold in the guild market!`)
                            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
                            .setFooter({ text: `Transaction completed by ${interaction.user.username}` });

                        await buttonInteraction.update({ embeds: [successEmbed], components: [] });
                        await updateBotStatus();
                    } catch (error) {
                        console.error('Error processing purchase:', error);
                        sendErrorMessage(interaction, 'An error occurred while processing the purchase. Please try again later.');
                    }
                } else if (buttonInteraction.customId === 'no') {
                    // Cancel the transaction
                    const cancelEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setDescription(`The purchase by **${targetUsername}** has been cancelled.`);

                    await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
                }
                collector.stop();
            });

            return;
        }

        try {
            // If user has enough balance, process purchase
            coinsData[targetUsername] -= amount;
            await saveData('Coins', [{ username: targetUsername, coins: coinsData[targetUsername] }]);

            // Log the transaction in the audit log
            await saveAuditLog('buy', interaction.user.username, targetUsername, -amount);

            // Success message
            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`**${targetUsername}** just spent <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold in the guild market!`)
                .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
                .setFooter({ text: `Transaction completed by ${interaction.user.username}` });

            interaction.reply({ embeds: [embed] });
            await updateBotStatus();
        } catch (error) {
            console.error('Error processing purchase:', error);
            sendErrorMessage(interaction, 'An error occurred while processing the purchase. Please try again later.');
        }
    }


    if (commandName === 'masspay') {
        if (!isTeller(interaction)) {
            sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
            return;
        }
    
        await interaction.deferReply();
    
        const amount = args.getInteger('amount');
        const userInput = args.getString('users');
    
        // Validate input
        if (isNaN(amount) || amount === 0 || !userInput) {
            await interaction.editReply({ content: 'Invalid command usage! Example: `/masspay 100 @user1 @user2 @user3`' });
            return;
        }
    
        const mentionRegex = /<@!?(\d+)>/g;
        const mentionedUserIds = [];
        let match;
        while ((match = mentionRegex.exec(userInput)) !== null) {
            mentionedUserIds.push(match[1]);
        }
    
        if (mentionedUserIds.length === 0) {
            await interaction.editReply({ content: 'No valid user mentions found! Example: `/masspay 100 @user1 @user2 @user3`' });
            return;
        }
    
        let usersList = [];
        const transactions = [];
        const failedUsers = [];
        const actionType = amount < 0 ? 'withdraw' : 'deposit';
    
        try {
            for (const userId of mentionedUserIds) {
                const targetUser = await interaction.guild.members.fetch(userId).catch(() => null);
                if (targetUser) {
                    const username = targetUser.user.username;
                    coinsData[username] = coinsData[username] || 0;
                    coinsData[username] += amount;
    
                    // Save the transaction for database update
                    transactions.push({
                        username,
                        coins: coinsData[username],
                    });
    
                    // Log the transaction for audit log
                    await saveAuditLog(
                        actionType === 'withdraw' ? 'masswithdraw' : 'masspay',
                        interaction.user.username,
                        username,
                        amount
                    );
    
                    usersList.push(`**${username}**`);
                } else {
                    failedUsers.push(userId); // Track failed users
                }
            }
    
            // Save all transactions to the database
            if (transactions.length > 0) {
                await saveData('Coins', transactions);
            }
    
            const formattedAmount = Math.abs(amount).toLocaleString();
            let actionMessage = actionType === 'withdraw'
                ? `**${interaction.user.username}** has withdrawn <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold from the following users' wallets:\n${usersList.join('\n')}`
                : `**${interaction.user.username}** has deposited <:OctoGold:1324817815470870609> **${formattedAmount}** OctoGold into the following users' wallets:\n${usersList.join('\n')}`;
    
            if (failedUsers.length > 0) {
                actionMessage += `\n\n⚠️ Could not process transactions for the following users:\n${failedUsers
                    .map((id) => `<@${id}>`)
                    .join('\n')}`;
            }
    
            const actionText = actionType === 'withdraw'
                ? '[**Octobank Mass Withdrawal**](https://octobank.ocular-gaming.net/)'
                : '[**Octobank Mass Deposit**](https://octobank.ocular-gaming.net/)';
    
            const embed = createEmbed('Mass Transaction Successful', `${actionText}\n\n${actionMessage}`);
            embed.setTimestamp(); // This automatically sets the timestamp
    
            await interaction.editReply({ embeds: [embed] });
            await updateBotStatus();
        } catch (error) {
            console.error('Error processing masspay:', error);
            await interaction.editReply({ content: 'An error occurred while processing the mass payment. Please try again later.' });
        }
    }
    



    if (commandName === 'payout') {
        if (!isTeller(interaction)) {
            return sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
        }

        const targetUser = args.getUser('user');
        if (!targetUser) {
            return sendErrorMessage(interaction, 'Please mention a user to pay out to.');
        }

        const username = targetUser.username;
        const balance = coinsData[username] || 0;

        if (balance <= 0) {
            return sendErrorMessage(interaction, `**${username}** has no OctoGold to pay out.`);
        }

        const formattedBalance = balance.toLocaleString();

        const payoutEmbed = createEmbed(
            'Confirm Payout',
            `**${username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold in their bank.\nAre you sure you want to pay them out?`
        ).setFooter({ text: 'Once completed, this payout cannot be undone.' });

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
            ephemeral: true,
        });

        const filter = (buttonInteraction) => buttonInteraction.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({
            filter,
            time: 60000, // Buttons expire after 1 minute
        });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId === 'yes') {
                try {
                    // Zero out the user's balance
                    coinsData[username] = 0;

                    // Save the updated balance to the database
                    await saveData('Coins', [{ username, coins: 0 }]);

                    // Log the payout transaction in the audit log
                    await saveAuditLog('payout', interaction.user.username, username, balance);

                    // Send success message
                    const successEmbed = createEmbed(
                        'Payout Complete',
                        `**${username}** has successfully received their payout of <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold. Their balance is now cleared.`
                    );

                    await buttonInteraction.update({ embeds: [successEmbed], components: [] });

                    // Update bot status
                    await updateBotStatus();
                } catch (error) {
                    console.error('Error processing payout:', error);
                    sendErrorMessage(interaction, 'An error occurred while processing the payout. Please try again later.');
                }
            } else if (buttonInteraction.customId === 'no') {
                // Cancel the payout
                const cancelEmbed = createEmbed(
                    'Payout Cancelled',
                    `The payout to **${username}** has been cancelled.`
                );

                await buttonInteraction.update({ embeds: [cancelEmbed], components: [] });
            }

            collector.stop(); // Stop the collector after a button is pressed
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                const timeoutEmbed = createEmbed(
                    'Payout Timeout',
                    'The payout request has expired due to inactivity.'
                );
                interaction.editReply({ embeds: [timeoutEmbed], components: [] });
            }
        });
    }

    if (commandName === 'lootsplit') {
        if (!isTeller(interaction)) {
            return sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
        }
    
        await interaction.deferReply(); // Defer the interaction to prevent expiration
    
        const amount = args.getInteger('amount'); // Total loot amount
        const repairCost = args.getInteger('repaircost'); // Repair cost to subtract
        const userInput = args.getString('users'); // Users to split the loot with (as a string)
    
        // Validate inputs
        if (isNaN(amount) || isNaN(repairCost) || amount <= 0 || repairCost < 0) {
            return interaction.editReply('Invalid command usage! Example: `/lootsplit 100 10 @user1 @user2 @user3`');
        }
    
        // Calculate the remaining loot after subtracting repair cost
        const remainingLoot = amount - repairCost;
        if (remainingLoot <= 0) {
            return interaction.editReply('The loot after subtracting the repair cost must be greater than 0.');
        }
    
        // Calculate the bot's 20% share (rounded down)
        const botShare = Math.floor(remainingLoot * 0.2);
        const userShare = remainingLoot - botShare;
    
        // Parse the userInput string into an array of users
        const mentionedUsers = userInput.match(/<@!?(\d+)>/g)?.map((mention) => mention.replace(/[<@!>]/g, '')) || [];
    
        if (mentionedUsers.length === 0) {
            return interaction.editReply('No valid users mentioned to split the loot with!');
        }
    
        // Calculate how much each user gets (rounded down)
        const individualShare = Math.floor(userShare / mentionedUsers.length);
    
        let userDetails = ""; // Store user split details
        const userUpdates = [];
        const auditLogs = [];
    
        for (const userId of mentionedUsers) {
            const targetUser = await interaction.guild.members.fetch(userId);
            if (!targetUser) continue;
    
            const username = targetUser.user.username;
            coinsData[username] = coinsData[username] || 0;
            coinsData[username] += individualShare;
    
            userUpdates.push({ username, coins: coinsData[username] });
            auditLogs.push({ action: 'lootsplit', sender: interaction.user.username, target: username, amount: individualShare });
    
            const balanceTotal = coinsData[username].toLocaleString();
            userDetails += `- **${username}** received <:OctoGold:1324817815470870609> **${individualShare.toLocaleString()}** OctoGold, and now has <:OctoGold:1324817815470870609> **${balanceTotal}** OctoGold\n`;
        }
    
        coinsData['OctoBank'] = coinsData['OctoBank'] || 0;
        coinsData['OctoBank'] += botShare;
    
        userUpdates.push({ username: 'OctoBank', coins: coinsData['OctoBank'] });
        auditLogs.push({ action: 'lootsplit', sender: interaction.user.username, target: 'OctoBank', amount: botShare });
    
        try {
            await saveData('Coins', userUpdates);
            for (const log of auditLogs) {
                await saveAuditLog(log.action, log.sender, log.target, log.amount);
            }
        } catch (error) {
            console.error('Error saving loot split data:', error);
            return interaction.editReply('An error occurred while processing the loot split.');
        }
    
        const formattedAmount = amount.toLocaleString();
        const formattedRepairCost = repairCost.toLocaleString();
        const formattedBotShare = botShare.toLocaleString();
        const formattedRemainingLoot = userShare.toLocaleString();
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
    
        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(actionMessage)
            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
            .setTimestamp()
            .setFooter({ text: `Transaction processed by ${interaction.user.username}` });
    
        interaction.editReply({ embeds: [embed] });
    
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
client.login('MTMyNDQzMDIzMTEyOTQyODA4OA.GxVrxA.WjoApui9d9bi0iB5HJJaB8ewVBwWNPQZjpTkxc');
