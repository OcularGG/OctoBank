const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
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

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

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
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});


client.login('MTMyNTU0OTAyMDM1Mjg3NjY0NQ.G6v1IW.h5wWEbcWaRTipcvZAOKQc8hCWWVzC77KdbGsL4');
