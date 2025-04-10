// troll.js
module.exports = (client) => {
    client.on('messageCreate', (message) => {
        if (message.author.bot) return;

        if (message.mentions.has(client.user)) {
            if (message.author.id === '854948541742317578') {
                message.reply('Do I look like I want to be pinged by you? Can’t you see I’m counting OctoGold here? smh');
            }
        }
    });
};
