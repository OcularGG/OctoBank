const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, ActivityType } = require('discord.js');
const fs = require('fs');
const path = './coins.json';
const auditLogPath = './audit_log.json';
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

require('./SheetsCode.js');

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
        new SlashCommandBuilder().setName('balance').setDescription('Check your current Octogold balance').addUserOption(option => option.setName('user').setDescription('User to check balance of')),
        new SlashCommandBuilder().setName('pay').setDescription('Pay or withdraw Octogold to a user').addUserOption(option => option.setName('user').setDescription('User to pay').setRequired(true)).addIntegerOption(option => option.setName('amount').setDescription('Amount to pay').setRequired(true)),
        new SlashCommandBuilder().setName('masspay').setDescription('Pay or withdraw Octogold to multiple users')
            .addIntegerOption(option => option.setName('amount').setDescription('Amount to pay').setRequired(true))
            .addStringOption(option => option.setName('users').setDescription('Users to pay, mention multiple users with @').setRequired(true)),
        new SlashCommandBuilder().setName('audit').setDescription('View the transaction audit log'),
        new SlashCommandBuilder().setName('help').setDescription('Show help message')
    ];

    const guildId = '1097537634756214957';

    try {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            await guild.commands.set([]);
            console.log("Guild commands cleared for guild");

            await guild.commands.set(commands);
            console.log("Guild commands registered for guild");
        } else {
            console.log("Guild not found!");
        }

        await client.application.commands.set([]);
        console.log("Global commands cleared");

    } catch (error) {
        console.error("Error registering commands:", error);
    }

    await updateBotStatus();
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;
    const args = interaction.options;

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

    if (commandName === 'audit') {
        if (!isTeller(interaction)) {
            sendErrorMessage(interaction, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
            return;
        }

        await interaction.deferReply();

        const chunkSize = 15;
        const auditMessagesChunks = [];
        while (auditLog.length > 0) {
            const chunk = auditLog.splice(0, chunkSize);
            const messages = chunk.map((log) => `**Action:** ${log.action}\n**From:** ${log.from}\n**To:** ${log.to}\n**Amount:** ${log.amount} OctoGold\n**Timestamp:** ${log.timestamp}`);
            auditMessagesChunks.push(messages.join('\n\n'));
        }

        for (const chunk of auditMessagesChunks) {
            const embed = createEmbed('Audit Log', chunk);
            await interaction.followUp({ embeds: [embed] });
        }
    }

    if (commandName === 'help') {
        const helpEmbed = createEmbed(
            'Octobank Command Help',
            `**/balance**: Check your current OctoGold balance\n` +
            `**/pay**: Pay or withdraw OctoGold to a user (Teller only)\n` +
            `**/masspay**: Pay or withdraw OctoGold to multiple users (Teller only)\n` +
            `**/audit**: View the transaction audit log (Teller only)`
        );
        interaction.reply({ embeds: [helpEmbed] });
    }
});

client.login('MTMyNDQzMDIzMTEyOTQyODA4OA.GOc63x.ZUYK4liah20puTginEMJOBG_Li8EUvkOJu4JVk');