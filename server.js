const express = require('express');
const cors = require('cors');
const User = require('./classes/User'); // Import the User class
const LeaderboardService = require('./services/LeaderboardService'); // Import the LeaderboardService
const PaymentService = require('./services/PaymentService'); // Import the PaymentService
const app = express(); // Initialize the Express application
const AuditLogService = require('./services/AuditLogService'); // Import the AuditLogService
const AuditLogDTO = require('./dtos/AuditLogDTO'); // Import the AuditLogDTO
const LootSplitService = require('./services/LootSplitService'); // Import the LootSplitService
app.use(express.json()); // Parse JSON request bodies
app.use(cors()); // Enable CORS

// Endpoint to fetch user balance
app.post('/api/balance', async (req, res) => {
    try {
        const { username } = req.body;

        console.log('Received POST request to /api/balance with username:', username);

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const user = await User.fetchUser(username);

        console.log('Fetched user from database:', user);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.status(200).json({ balance: user.balance });
    } catch (error) {
        console.error('Error fetching user balance:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to fetch leaderboard
app.post('/api/leaderboard', async (req, res) => {
    try {
        console.log('Received POST request to /api/leaderboard');  // Logging the request
        const leaderboardService = new LeaderboardService();
        const leaderboard = await leaderboardService.getLeaderboard();

        if (!leaderboard || leaderboard.length === 0) {
            console.log('Leaderboard is empty');  // Log when leaderboard is empty
            return res.status(200).json({ leaderboard: [] });
        }

        console.log('Fetched from database:', leaderboard);  // Log the fetched leaderboard data
        return res.status(200).json({ leaderboard });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return res.status(500).json({ error: 'Failed to fetch leaderboard.' });
    }
});

// Endpoint to process payment
app.post('/api/pay', async (req, res) => {
    try {
        const { senderUsername, recipientUsername, amount, reason } = req.body;

        console.log('Received POST request to /api/pay with data:', {
            senderUsername,
            recipientUsername,
            amount,
            reason,
        });

        if (!senderUsername || !recipientUsername || !amount || !reason) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        // Call the PaymentService to process the payment
        const result = await PaymentService.processPayment(
            { guild: { roles: { cache: new Map() } }, member: { roles: { cache: new Map() } } },
            amount,
            { username: senderUsername },
            { username: recipientUsername },
            reason
        );

        if (result.success) {
            console.log('Fetched from database:', result); 
            return res.status(200).json({
                success: true,
                message: 'Payment processed successfully.',
                callbackId: result.callbackId,
                actionType: result.actionType,
                formattedAmount: result.formattedAmount,
                newRecipientBalance: result.newRecipientBalance,
            });
        } else {
            console.log('Payment failed:', result.message);
            return res.status(400).json({ success: false, message: result.message });
        }
    } catch (error) {
        console.error('Error processing payment:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});
// Endpoint to process payout using updateBalance User method
app.post('/api/payout', async (req, res) => {
    try {
        const { username, balance, senderUsername } = req.body;

        console.log('Received POST request to /api/payout with data:', { username, balance, senderUsername });

        if (!username || balance == null || !senderUsername) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        const user = await User.fetchUser(username);
        if (!user || user.balance !== balance) {
            return res.status(400).json({ success: false, message: 'User balance mismatch or user not found.' });
        }

        await User.updateBalance(username, 0);

        const callbackIdDTO = await AuditLogService.getNextCallbackId();
        const callbackId = callbackIdDTO.callbackId;

        const auditLogDTO = new AuditLogDTO(
            'payout',
            senderUsername,
            username,
            -balance,
            null,
            callbackId
        );

        await AuditLogService.logAudit(
            auditLogDTO.action,
            auditLogDTO.sender,
            auditLogDTO.target,
            auditLogDTO.amount,
            auditLogDTO.reason,
            auditLogDTO.callbackId
        );

        return res.status(200).json({ success: true, callbackId });
    } catch (error) {
        console.error('Error processing payout:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});
//Call the LootSplitService to process the loot split
app.post('/api/lootsplit', async (req, res) => {
    try {
        const { amount, repairCost, userInput, senderUsername } = req.body;

        console.log('Received POST request to /api/lootsplit with data:', { amount, repairCost, userInput, senderUsername });

        if (!amount ||!userInput || !senderUsername) {
            return res.status(400).json({ success: false, message: 'Missing required fields.' });
        }

        // Initialize LootSplitService
        const lootSplitService = new LootSplitService();

        // Validate the loot split
        const { valid, remainingLoot, message } = lootSplitService.validateLoot(amount, repairCost);
        console.log(`Validation result: valid=${valid}, remainingLoot=${remainingLoot}`);
        if (!valid) {
            return res.status(400).json({ success: false, message });
        }

        // Calculate individual shares
        const individualShare = lootSplitService.calculateShares(remainingLoot, userInput);
        console.log(`Individual share calculated: ${individualShare}`);

        // Generate a callback ID for the transaction
        const callbackIdDTO = await AuditLogService.getNextCallbackId();
        const callbackId = callbackIdDTO.callbackId;

        // Process the loot split
        const { userUpdates, auditLogs } = await lootSplitService.processLootSplit(userInput, individualShare, callbackId, senderUsername);

        // Calculate and update the bank's share
        const botShare = Math.floor(amount * 0.2);
        const bankUpdate = await lootSplitService.updateBankBalance(botShare, callbackId, senderUsername);

        // Return the result
        return res.status(200).json({
            success: true,
            userUpdates,
            bankUpdate,
            remainingLoot,
            individualShare,
            numUsers: userInput.length,
            callbackId,
        });
    } catch (error) {
        console.error('Error processing loot split:', error);
        return res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
