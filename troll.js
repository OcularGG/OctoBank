// troll.js
module.exports = (client) => {
    client.on('messageCreate', (message) => {
        // Ignore messages from bots (including the bot itself)
        if (message.author.bot) return;

        // Check if the bot is mentioned in the message
        if (message.mentions.has(client.user)) {
            message.reply('Do i look like I want to be pinged by you? Cant you see im counting OctoGold here? smh');
        }
    });
};
