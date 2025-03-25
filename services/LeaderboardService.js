const User = require('../classes/User');
const db = require('../db');
const LeaderboardEntryDTO = require('../dtos/LeaderboardEntryDTO');
class LeaderboardService {
    async getLeaderboard() {
        try {
            const query = `SELECT username, balance FROM coins WHERE username != 'OctoBank' ORDER BY balance DESC LIMIT 10`;            
            const [rows] = await db.query(query);
            if (rows.length === 0) {
                return [];
            }
    
            const leaderboard = await Promise.all(
                rows.map(async (row, index) => {
                    const user = await User.fetchUser(row.username);
                    return new LeaderboardEntryDTO(
                        index + 1,
                        user.username,
                        user.balance
                    );
                })
            );
    
            return leaderboard;
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            throw new Error('Failed to fetch leaderboard');
        }
    }
}

module.exports = LeaderboardService;
