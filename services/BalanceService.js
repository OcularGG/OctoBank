const { EmbedBuilder } = require('discord.js');

class BalanceService {
    static async createBalanceEmbed(interaction, targetUser, formattedBalance) {
        try {
            const requester = interaction.user;         
            const embed = new EmbedBuilder()
                .setColor('#ffbf00')
                .setDescription(`[**OctoBank**](https://octobank.ocular-gaming.net/)\n\n**${targetUser.username}** has <:OctoGold:1324817815470870609> **${formattedBalance}** OctoGold.`)
                .setAuthor({
                    name: requester.username, 
                    iconURL: requester.displayAvatarURL({ dynamic: true }) 
                })
                .setFooter({ text: `Balance requested by ${requester.username}`, iconURL: requester.displayAvatarURL({ dynamic: true }) })
                .setTimestamp();

            return embed;
        } catch (error) {
            console.error('Error creating balance embed:', error);
            throw error;
        }
    }
}

module.exports = BalanceService;
