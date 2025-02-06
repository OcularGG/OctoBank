require('dotenv').config({ path: './secrets.env' });
console.log("Loaded token from .env:", process.env.TOKEN);
console.log("Environment variables loaded:", process.env);

const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const giveaway = require('./giveaway');  // Import the giveaway module

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    commands.push(command);
}

async function checkBotPermissions(guildId, channelId) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.error("Guild not found!");
            return;
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            console.error("Channel not found!");
            return;
        }

        const permissions = channel.permissionsFor(client.user);

        console.log(`Checking bot permissions in channel ${channelId}...`);

        // Checking specific permissions
        const canSendMessages = permissions.has('SEND_MESSAGES');
        const canReact = permissions.has('ADD_REACTIONS');
        const canReadMessages = permissions.has('READ_MESSAGE_HISTORY');
        const canManageMessages = permissions.has('MANAGE_MESSAGES');

        console.log(`Can send messages: ${canSendMessages}`);
        console.log(`Can react: ${canReact}`);
        console.log(`Can read messages: ${canReadMessages}`);
        console.log(`Can manage messages: ${canManageMessages}`);

        // Ensure the bot has all required permissions
        if (!canSendMessages || !canReact || !canReadMessages || !canManageMessages) {
            console.error("Bot does not have all required permissions in this channel.");
            return false; // Indicate missing permissions
        }

        return true; // All required permissions are present
    } catch (error) {
        console.error("Error checking bot permissions:", error);
        return false;
    }
}

async function updateBotStatus() {
    try {
        const [rows] = await db.query('SELECT SUM(balance) AS totalBalance FROM coins');

        if (rows.length > 0 && rows[0].totalBalance !== null) {
            let totalBalance = rows[0].totalBalance;

            totalBalance = Number(totalBalance);

            const formattedTotalOctogold = totalBalance.toLocaleString();

            client.user.setPresence({
                status: 'online',
                activities: [{
                    name: `${formattedTotalOctogold} OctoGold`,
                    type: ActivityType.Watching
                }]
            });

            console.log('Bot status updated successfully.');
        } else {
            console.error('Failed to fetch total balance from database.');
        }
    } catch (error) {
        console.error('Error setting bot presence:', error);
    }
}

const { removeBalancesForRemovedUsers, onUserLeave } = require('./removeBalanceOnLeave');

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    await updateBotStatus();

    try {
        const guildId = '1097537634756214957';
        const giveawayChannelId = '1277998632917925939'; // Provided channel ID

        // Check bot permissions on startup
        await checkBotPermissions(guildId, giveawayChannelId);

        // Other operations (commands, giveaways, etc.)
        await handleCommandsAndGiveaways(guildId);

        // Call the function to remove balances of users not in the guild
        await removeBalancesForRemovedUsers(client, db, guildId);  // Correct way to call the function

        // Set up listener for when users leave the guild
        onUserLeave(client, db);  // Add this line to set up the listener
    } catch (error) {
        console.error('Error during bot startup:', error);
    }
});


async function handleCommandsAndGiveaways(guildId) {
    try {
        const guild = client.guilds.cache.get(guildId);

        if (guild) {
            console.log("Deleting all global commands...");
            await client.application.commands.set([]); 

            const existingCommands = await guild.commands.fetch();
            const existingCommandNames = existingCommands.map(cmd => cmd.name);

            const commandsToRegister = [];
            const commandsToDelete = [];

            for (const command of commands) {
                const commandName = command.data.name;

                if (!existingCommandNames.includes(commandName)) {
                    console.log(`Registering new command: ${commandName}`);
                    commandsToRegister.push(command);
                } else {
                    const existingCommand = existingCommands.find(cmd => cmd.name === commandName);
                    const isSameArguments = existingCommand.options.length === command.data.options.length
                        && existingCommand.options.every((option, index) => {
                            const newOption = command.data.options[index];
                            return option.name === newOption.name && option.description === newOption.description && option.required === newOption.required;
                        });

                    if (!isSameArguments) {
                        console.log(`Command ${commandName} is outdated, deleting and re-registering.`);
                        commandsToDelete.push(existingCommand); 
                        commandsToRegister.push(command);
                    } else {
                        console.log(`Command "${commandName}" up to date`);
                    }
                }
            }

            if (commandsToDelete.length > 0) {
                console.log("Deleting outdated commands...");
                for (const command of commandsToDelete) {
                    await guild.commands.delete(command.id);
                }
            }

            if (commandsToRegister.length > 0) {
                console.log("Registering new commands...");
                for (const command of commandsToRegister) {
                    await guild.commands.create(command.data);
                }
            }

            console.log("Commands registered/updated successfully");
        } else {
            console.log('Guild not found!');
        }

        // Start the giveaway logic when bot is ready
        giveaway.startGiveaways(client);  // Pass `client` to the startGiveaways function

        // Set an interval to run the giveaway every 6 hours (21600000 milliseconds)
        setInterval(async () => {
            await giveaway.startGiveaways(client);  // Ensure that `client` is passed
        }, 21600000);  // 6 hours in milliseconds

    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = commands.find(cmd => cmd.data.name === interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
        await updateBotStatus();
    } catch (error) {
        console.error(error);
        await interaction.editReply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});

client.login(process.env.TOKEN);
