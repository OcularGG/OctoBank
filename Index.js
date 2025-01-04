const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = './coins.json';
const auditLogPath = './audit_log.json';
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');


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
    console.log('Total Octogold calculated:', totalOctogold);
    try {
        await client.user.setPresence({
            status: 'online',
            activities: [{
                name: ` ${totalOctogold} OctoGold`,
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
            .addIntegerOption(option => option.setName('amount').setDescription('Amount to pay').setRequired(true))
            .addStringOption(option => option.setName('users').setDescription('Users to pay, mention multiple users with @').setRequired(true)),
        new SlashCommandBuilder().setName('audit').setDescription('View the transaction audit log'),
        new SlashCommandBuilder().setName('help').setDescription('Show help message'),
        new SlashCommandBuilder().setName('buy').setDescription('Buy something from the guild market').addUserOption(option => option.setName('user').setDescription('User to spend OctoGold').setRequired(true)).addIntegerOption(option => option.setName('amount').setDescription('Amount to spend').setRequired(true)),
        new SlashCommandBuilder().setName('payout').setDescription('Pay out OctoGold to a user (Teller only)').addUserOption(option => option.setName('user').setDescription('User to payout').setRequired(true))
    ];

    try {
        // Fetch the currently registered commands
        const registeredCommands = await client.application.commands.fetch();
        const existingCommandNames = registeredCommands.map(cmd => cmd.name);

        const commandsToRegister = [];
        const commandsToUpdate = [];

        // Loop through each new command
        for (const command of commands) {
            const commandName = command.name;

            // If the command is not registered, add to commandsToRegister
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
                    console.log(`Updating command: ${commandName}`);
                    // Add the existing command ID for updating
                    command.id = existingCommand.id;
                    commandsToUpdate.push(command);
                } else {
                    console.log(`Command "${commandName}" up to date`);
                }
            }
        }

        // Register new commands
        if (commandsToRegister.length > 0) {
            console.log("Registering new commands...");
            await client.application.commands.set(commandsToRegister);
        }

        // Update changed commands
        if (commandsToUpdate.length > 0) {
            console.log("Updating changed commands...");
            for (const command of commandsToUpdate) {
                await client.application.commands.edit(command.id, command.toJSON());
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


    if (commandName === 'balance') {
        const targetUser = args.getUser('user') || interaction.user;
        const balance = coinsData[targetUser.username] || 0;

        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(`[**OctoBank**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}** has <:OctoGold:1324817815470870609> ${balance} OctoGold.`)
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
        const actionMessage = actionType === 'withdraw'
            ? `**${interaction.user.username}** has withdrawn <:OctoGold:1324817815470870609> **${Math.abs(amount)}** OctoGold from **${targetUser.username}**'s wallet.`
            : `**${interaction.user.username}** has deposited <:OctoGold:1324817815470870609> **${Math.abs(amount)}** OctoGold to **${targetUser.username}**'s wallet.`;

        const timestamp = formatTimestamp(new Date());

        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(`${actionLink}\n\n${actionMessage}\n\n${timestamp}`)
            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
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
        const currentBalance = coinsData[targetUsername] || 0;

        if (currentBalance < amount) {
            sendErrorMessage(interaction, `${targetUsername} does not have enough <:OctoGold:1324817815470870609> OctoGold to make this purchase.`);
            return;
        }

        // Subtract the amount from the user's balance
        coinsData[targetUsername] -= amount;

        // Log the transaction to the audit log
        auditLog.push({
            action: 'buy',
            from: interaction.user.username,
            to: targetUser.username,
            amount: -amount, // Negative because it's a subtraction
            timestamp: formatTimestamp(new Date())
        });

        saveData();

        // Create the success message
        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(`**${targetUser.username}** just spent <:OctoGold:1324817815470870609> **${amount}** OctoGold in the guild market!`)
            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
            .setFooter({ text: `Transaction completed by ${interaction.user.username}` });

        interaction.reply({ embeds: [embed] });

        // Update bot status
        await updateBotStatus();
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
                    timestamp: formatTimestamp(new Date())
                });
            }
        }

        actionMessage = actionType === 'withdraw'
            ? `**${interaction.user.username}** has withdrawn <:OctoGold:1324817815470870609> **${Math.abs(amount)}** OctoGold from the following users' wallets:\n${usersList.join('\n')}`
            : `**${interaction.user.username}** has deposited <:OctoGold:1324817815470870609> **${Math.abs(amount)}** OctoGold into the following users' wallets:\n${usersList.join('\n')}`;

        const actionText = actionType === 'withdraw'
            ? '[**Octobank Mass Withdrawal**](https://octobank.ocular-gaming.net/)'
            : '[**Octobank Mass Deposit**](https://octobank.ocular-gaming.net/)';

        const timestamp = formatTimestamp(new Date());

        const embed = createEmbed('Mass Transaction Successful', `${actionText}\n\n${actionMessage}\n\n${timestamp}`);
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
    
        const payoutEmbed = createEmbed(
            'Confirm Payout',
            `**${targetUser.username}** has <:OctoGold:1324817815470870609> ${balance} OctoGold in their bank.\nAre you sure you want to pay them out?`
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
                    `**${targetUser.username}** has successfully received their payout of <:OctoGold:1324817815470870609> ${balance} OctoGold. Their balance is now cleared.`
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
    

    if (commandName === 'help') {
        const helpEmbed = createEmbed(
            'Octobank Command Help',
            `**/balance**: Check your current OctoGold balance\n` +
            `**/pay**: Pay or withdraw OctoGold to a user (Teller only)\n` +
            `**/masspay**: Pay or withdraw OctoGold to multiple users (Teller only)\n` +
            `**/audit**: View the transaction audit log (Teller only)\n` +
            `**/buy**: Spend OctoGold in the guild market (Teller only)\n` +
            `**/payout**: Pay out OctoGold to a user (Teller only)`
        );
        interaction.reply({ embeds: [helpEmbed] });
    }

});
client.login('MTMyNDQzMDIzMTEyOTQyODA4OA.GOc63x.ZUYK4liah20puTginEMJOBG_Li8EUvkOJu4JVk');
