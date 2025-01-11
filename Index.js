require('dotenv').config({ path: './secrets.env' });console.log("Loaded token from .env:", process.env.TOKEN);
console.log("Environment variables loaded:", process.env);

const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('./db'); 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
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

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    await updateBotStatus();

    try {
        const guildId = '1097537634756214957';
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
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = commands.find(cmd => cmd.data.name === interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);

        await updateBotStatus();

    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});

client.login(process.env.TOKEN); 
