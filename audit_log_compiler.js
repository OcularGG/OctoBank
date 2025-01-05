const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const express = require('express');
const readline = require('readline');

// Update the path to use 'client_secret_audit.json' instead of 'client_secret.json'
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret_audit.json');
const TOKEN_PATH = path.join(__dirname, 'audit_token.json');  // Changed to 'audit_token.json'
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auditLogPath = path.join(__dirname, 'audit_log.json');
let auditLogData = loadAuditLog(auditLogPath);
const app = express();
const port = 3002;

// Read the credentials for OAuth
fs.readFile(CREDENTIALS_PATH, (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  authorize(JSON.parse(content), startUpdatingSheet);
});

function loadAuditLog(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
    }
  }
  return [];
}

function organizeAuditLogData(data) {
  // Organize the data to present it in a user-friendly format
  return data.map(entry => {
    return {
      Action: entry.action,
      From: entry.from,
      To: entry.to,
      Amount: entry.amount,
      Timestamp: new Date(entry.timestamp).toLocaleString(),
    };
  });
}

function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Read the token from the file
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);  // If no token, get a new one
    oAuth2Client.setCredentials(JSON.parse(token));  // Set the credentials if token exists
    callback(oAuth2Client);  // Proceed to update the sheet
  });
}

function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',  // This ensures that we get a refresh_token
    scope: SCOPES,
    prompt: 'consent',  // Adding 'consent' to always prompt the user for consent
  });
  console.log('Authorize this app by visiting this url:', authUrl);

  app.get('/oauth2callback', (req, res) => {
    const code = req.query.code;
    if (code) {
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.log('Error retrieving access token', err);

        // Store the token in the file, including refresh_token
        oAuth2Client.setCredentials(token);
        fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
          if (err) return console.log(err);
          console.log('Token stored to', TOKEN_PATH);
        });

        // Call the function to start updating the sheet
        callback(oAuth2Client);
        res.send('Authorization successful! You can close this window now.');
      });
    }
  });

  console.log('Please visit the following URL to authorize the app:');
  console.log(authUrl);
}

function updateSheet(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = '17WWGXBa1rzX8gKzyBC1iT00w2xEJdxsJLRpPAELnNi0';  // Use your spreadsheet ID here
  const range = 'Sheet1!A2:E';  // Adjust the range as needed
  const organizedData = organizeAuditLogData(auditLogData);
  const values = organizedData.map(entry => [
    entry.Action,
    entry.From,
    entry.To,
    entry.Amount,
    entry.Timestamp
  ]);

  const resource = {
    values: values,
  };

  // Clear the range before updating
  sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: range,
  }, (err, res) => {
    if (err) {
      console.log('The API returned an error when clearing the sheet:', err);
      return;
    }
    console.log('Sheet cleared successfully:', res.status);

    // Update the sheet with new data
    sheets.spreadsheets.values.update(
      {
        spreadsheetId,
        range: range,
        valueInputOption: 'RAW',
        resource: resource,
      },
      (err, res) => {
        if (err) {
          console.log('The API returned an error when updating the sheet:', err);
        } else {
          console.log('Spreadsheet updated successfully!', res.status);
        }
      }
    );
  });
}

function startUpdatingSheet(auth) {
  setInterval(() => {
    auditLogData = loadAuditLog(auditLogPath);
    console.log('Loaded audit log data:', auditLogData); // Debugging log
    updateSheet(auth);
  }, 60000);  // Every 60 seconds
}

// Refresh the token when it expires
function refreshTokenIfNeeded(oAuth2Client) {
  const token = oAuth2Client.credentials;

  if (token && token.expiry_date <= Date.now()) {
    console.log("Token has expired, refreshing...");
    oAuth2Client.refreshAccessToken((err, tokens) => {
      if (err) {
        console.log("Error refreshing token", err);
        return;
      }
      oAuth2Client.setCredentials(tokens);
      fs.writeFile(TOKEN_PATH, JSON.stringify(tokens), (err) => {
        if (err) return console.log("Error saving new token", err);
        console.log("Refreshed token saved.");
      });
    });
  }
}

// Periodically check if the token needs refreshing
setInterval(() => {
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  const oAuth2Client = new google.auth.OAuth2();
  oAuth2Client.setCredentials(token);

  if (token.expiry_date <= Date.now()) {
    refreshTokenIfNeeded(oAuth2Client);
  }
}, 60000);  // Check every minute

// Local server to handle OAuth
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
