class UserLeaveService {
    constructor(client, db) {
        this.client = client;
        this.db = db;
    }

    async isUserMemberOfGuild(guild, username) {
        const member = await guild.members.fetch({ query: username, limit: 1 });
        return member.size > 0;
    }

    async removeBalancesForRemovedUsers(guildId) {
        try {
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                console.log("Guild not found!");
                return;
            }

            const [usersInDatabase] = await this.db.query('SELECT username FROM coins');

            for (const user of usersInDatabase) {
                const isMember = await this.isUserMemberOfGuild(guild, user.username);
                if (!isMember) {
                    await this.db.query('DELETE FROM coins WHERE username = ?', [user.username]);
                    console.log(`Removed balance for user ${user.username} as they are no longer in the guild.`);
                }
            }
        } catch (error) {
            console.error('Error removing balances for users not in the guild:', error);
        }
    }

    onUserLeave() {
        this.client.on('guildMemberRemove', async (member) => {
            try {
                const guildId = member.guild.id;
                const username = member.user.username;

                console.log(`${username} has left the guild! Removing balance...`);

                await this.db.query('DELETE FROM coins WHERE username = ?', [username]);

                console.log(`Removed balance for user ${username} as they left the guild.`);
            } catch (error) {
                console.error('Error removing balance when user leaves:', error);
            }
        });
    }
}

module.exports = UserLeaveService;
