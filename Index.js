const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('./db'); // Assuming your DB connection file is named 'db.js'
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

// Register each command dynamically
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    commands.push(command);  // Push the entire command object, not just the data
}

// Function to update the bot's status with the total balance
async function updateBotStatus() {
    try {
        // Query to get the total balance of all users
        const [rows] = await db.query('SELECT SUM(balance) AS totalBalance FROM coins');

        if (rows.length > 0 && rows[0].totalBalance !== null) {
            let totalBalance = rows[0].totalBalance;

            // Ensure totalBalance is a valid number (this also works if it's a BIGINT)
            totalBalance = Number(totalBalance);

            // Format the total balance to make it more readable (e.g., with commas)
            const formattedTotalOctogold = totalBalance.toLocaleString();

            // Set the bot's presence (status message) to show the total balance
            await client.user.setPresence({
                status: 'online',
                activities: [{
                    name: `${formattedTotalOctogold} OctoGold`, // Display the formatted total balance
                    type: ActivityType.Watching // Type of activity being displayed
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

    // Update the bot's status with the total balance
    await updateBotStatus();

    try {
        const guildId = '1097537634756214957'; // Replace this with the ID of the server you want to register commands in
        const guild = client.guilds.cache.get(guildId);

        if (guild) {
            // Delete all global commands at startup (optional)
            console.log("Deleting all global commands...");
            await client.application.commands.set([]); // This will delete all global commands

            // Fetch existing commands in the guild
            const existingCommands = await guild.commands.fetch();
            const existingCommandNames = existingCommands.map(cmd => cmd.name);

            const commandsToRegister = [];
            const commandsToDelete = [];

            // Loop through each new command and compare with the registered ones
            for (const command of commands) {
                const commandName = command.data.name;

                // If the command is not registered, add it to commandsToRegister
                if (!existingCommandNames.includes(commandName)) {
                    console.log(`Registering new command: ${commandName}`);
                    commandsToRegister.push(command);
                } else {
                    // Compare the options (arguments) with the existing ones
                    const existingCommand = existingCommands.find(cmd => cmd.name === commandName);

                    const isSameArguments = existingCommand.options.length === command.data.options.length
                        && existingCommand.options.every((option, index) => {
                            const newOption = command.data.options[index];
                            return option.name === newOption.name && option.description === newOption.description && option.required === newOption.required;
                        });

                    if (!isSameArguments) {
                        console.log(`Command ${commandName} is outdated, deleting and re-registering.`);
                        commandsToDelete.push(existingCommand);  // Mark outdated command for deletion
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

// Interaction handling
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = commands.find(cmd => cmd.data.name === interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);  // Execute the command

        // After command execution, update the bot's status with the total balance
        await updateBotStatus();  // This ensures the bot's status is updated after every command

    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});

client.login('MTMyNDQzMDIzMTEyOTQyODA4OA.GxVrxA.WjoApui9d9bi0iB5HJJaB8ewVBwWNPQZjpTkxc'); // Replace with your actual bot token
