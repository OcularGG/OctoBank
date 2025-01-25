// Function to check if a user is a member of the guild
async function isUserMemberOfGuild(guild, username) {
    const member = await guild.members.fetch({ query: username, limit: 1 });
    return member.size > 0; // If member exists, it will have a size > 0
}

async function removeBalancesForRemovedUsers(client, db, guildId) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            console.log("Guild not found!");
            return;
        }

        // Query the database for all usernames in the coins table
        const [usersInDatabase] = await db.query('SELECT username FROM coins');

        // Check each user and validate if they are still a member
        for (const user of usersInDatabase) {
            const isMember = await isUserMemberOfGuild(guild, user.username);
            if (!isMember) {
                // Remove balance from the database if the user is no longer in the guild
                await db.query('DELETE FROM coins WHERE username = ?', [user.username]);
                console.log(`Removed balance for user ${user.username} as they are no longer in the guild.`);
            }
        }
    } catch (error) {
        console.error('Error removing balances for users not in the guild:', error);
    }
}

// Listen for when users leave the guild
async function onUserLeave(client, db) {
    client.on('guildMemberRemove', async (member) => {
        try {
            const guildId = member.guild.id; // Get the guild ID where the user left
            const username = member.user.username; // Get the username of the user who left

            // You could log this or take any action you want
            console.log(`${username} has left the guild! Removing balance...`);

            // Remove balance for the user from the database
            await db.query('DELETE FROM coins WHERE username = ?', [username]);

            console.log(`Removed balance for user ${username} as they left the guild.`);
        } catch (error) {
            console.error('Error removing balance when user leaves:', error);
        }
    });
}

// Export the functions correctly
module.exports = { 
    removeBalancesForRemovedUsers,
    onUserLeave 
};
