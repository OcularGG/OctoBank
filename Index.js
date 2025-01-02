const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = './coins.json';
const auditLogPath = './audit_log.json';
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
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
function isTeller(message) {
    return message.member.roles.cache.some(role => role.name === 'Teller');
}
function createEmbed(title, description, color = '#ffbf00') {
    return new EmbedBuilder()
        .setColor(color)
        .setDescription(description)
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
}
function sendErrorMessage(message, error) {
    const embed = createEmbed('Error', error);
    message.channel.send({ embeds: [embed] });
}
function handleTransaction(message, targetUser, amount, action) {
    const username = targetUser.username;
    coinsData[username] = coinsData[username] || 0;
    coinsData[username] += amount;
    auditLog.push({
        action,
        from: message.author.username,
        to: targetUser.username,
        amount,
        timestamp: new Date().toISOString()
    });
    saveData();
}
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();
    if (command === '/balance') {
        const targetUser = message.mentions.users.first() || message.author;
        const balance = coinsData[targetUser.username] || 0;
        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(`[**OctoBank Deposit**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}** has ${balance} coins.`)
            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
        message.channel.send({ embeds: [embed] });
    }
    if (command === '/pay') {
        if (!isTeller(message)) {
            sendErrorMessage(message, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
            return;
        }
        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!targetUser || isNaN(amount)) {
            sendErrorMessage(message, 'Invalid command usage! Example: `/pay @user 100`');
            return;
        }
        const actionType = amount < 0 ? 'withdraw' : 'deposit';
        const actionLink = actionType === 'withdraw' ? '[**OctoBank Withdrawal**](https://octobank.ocular-gaming.net/)' : '[**OctoBank Deposit**](https://octobank.ocular-gaming.net/)';
        handleTransaction(message, targetUser, amount, actionType);
        const actionMessage = actionType === 'withdraw' 
            ? `**${message.author.username}** has withdrawn **${Math.abs(amount)}** Octogold from **${targetUser.username}**'s wallet.` 
            : `**${message.author.username}** has deposited **${Math.abs(amount)}** Octogold to **${targetUser.username}**'s wallet.`;
        const embed = new EmbedBuilder()
            .setColor('#ffbf00')
            .setDescription(`${actionLink}\n\n${actionMessage}`)
            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() });
        message.channel.send({ embeds: [embed] });
        saveData();
    }
    if (command === '/masspay') {
        if (!isTeller(message)) {
            sendErrorMessage(message, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
            return;
        }
        const amount = parseInt(args[1]);
        const mentionedUsers = [...message.mentions.users.values()];
        if (isNaN(amount) || amount === 0 || mentionedUsers.length === 0) {
            sendErrorMessage(message, 'Invalid command usage! Example: `/masspay 100 @user1 @user2 @user3`');
            return;
        }
        let actionMessage;
        let actionType = amount < 0 ? 'withdraw' : 'deposit';
        let usersList = [];
        mentionedUsers.forEach(targetUser => {
            const username = targetUser.username;
            coinsData[username] = coinsData[username] || 0;
            coinsData[username] += amount;
            usersList.push(`**${targetUser.username}**`);
            auditLog.push({
                action: actionType === 'withdraw' ? 'masswithdraw' : 'masspay',
                from: message.author.username,
                to: targetUser.username,
                amount,
                timestamp: new Date().toISOString()
            });
        });
        actionMessage = `**${message.author.username}** has ${actionType === 'withdraw' ? 'withdrawn' : 'deposited'} **${Math.abs(amount)}** to the following members' wallets....:\n${usersList.join('\n')}`;
        const actionText = actionType === 'withdraw' 
            ? '[**Octobank Mass Withdrawal**](https://octobank.ocular-gaming.net/)' 
            : '[**Octobank Mass Deposit**](https://octobank.ocular-gaming.net/)';
        const embed = createEmbed('Mass Transaction Successful', `${actionText}\n\n${actionMessage}`);
        message.channel.send({ embeds: [embed] });
        saveData();
    }
    if (command === '/audit') {
        if (!isTeller(message)) {
            sendErrorMessage(message, 'You do not have permission to use this command. Only users with the "Teller" role can use it.');
            return;
        }
        const auditMessages = auditLog.length ? auditLog.map((log, index) => `${index + 1}. **${log.from}** ${log.action} ${log.amount} coins to **${log.to}** on ${log.timestamp}`).join('\n') : 'No transactions have been recorded.';
        const embed = createEmbed('Audit Log', auditMessages);
        message.channel.send({ embeds: [embed] });
    }
    if (command === '/help') {
        const subcommand = args[1]?.toLowerCase();
        let helpMessage = '**Available Commands:**\n' +
            '`/help` - Show this help message.\n' +
            '`/balance` - Check your current coin balance.\n' +
            '`/pay @user amount` - Pay or withdraw coins to a user (Teller role required).\n' +
            '`/masspay amount @user1 @user2 ...` - Pay or withdraw coins to multiple users (Teller role required).\n' +
            '`/audit` - View the transaction audit log (Teller role required).';
        const commandHelp = {
            'pay': '**/pay Command Help:**\nUsage: `/pay @user amount`\nExample: `/pay **@JohnDoe** 100`',
            'masspay': '**/masspay Command Help:**\nUsage: `/masspay amount @user1 @user2 ...`\nExample: `/masspay 50 **@JohnDoe** **@JaneDoe**`',
            'balance': '**/balance Command Help:**\nUsage: `/balance`\nExample: `/balance`',
            'audit': '**/audit Command Help:**\nUsage: `/audit`\nExample: `/audit`'
        };
        helpMessage = subcommand && commandHelp[subcommand] || helpMessage;
        const embed = createEmbed('Help', helpMessage);
        message.channel.send({ embeds: [embed] });
    }
});
client.once('ready', () => {
    console.log('Bot is ready!');
});
client.login('MTMyNDQzMDIzMTEyOTQyODA4OA.G241EN.ANQwAXmGXX4WT8OMQKtzyKXdVY3lWdXovh_bPE');
