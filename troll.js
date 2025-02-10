// troll.js
module.exports = (client) => {
    client.on('messageCreate', (message) => {
        // Ignore messages from bots (including the bot itself)
        if (message.author.bot) return;

        // Check if the bot is mentioned in the message
        if (message.mentions.has(client.user)) {
            // Only respond if the user has the specific userID
            if (message.author.id === '854948541742317578') {
                message.reply('Do I look like I want to be pinged by you? Can’t you see I’m counting OctoGold here? smh');
            }
        }
    });
};
