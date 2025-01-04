const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const express = require('express');
const readline = require('readline');

const CREDENTIALS_PATH = path.join(__dirname, 'client_secret.json');
const TOKEN_PATH = path.join(__dirname, 'token_coin.json');  // Changed the token file name to 'token_coin.json'
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const coinsDataPath = path.join(__dirname, 'coins.json');
let coinsData = loadData(coinsDataPath);
const app = express();
const port = 3000;

// Read the credentials for OAuth
fs.readFile(CREDENTIALS_PATH, (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  authorize(JSON.parse(content), startUpdatingSheet);
});

function loadData(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`Error reading ${filePath}:`, error);
    }
  }
  return {};
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
    prompt: 'consent',
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
  const spreadsheetId = '1H4hxWAJFubIzVsPEHPpgv1Wf8yQL1YVrfiBL3BuGCVw';
  const range = 'Sheet1!A2:B';
  const values = Object.entries(coinsData).map(([name, coins]) => [name, coins]);
  const resource = {
    values: values,
  };

  sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: range,
  }, (err, res) => {
    if (err) {
      console.log('The API returned an error when clearing the sheet:', err);
      return;
    }
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
          console.log('Spreadsheet updated successfully!');
        }
      }
    );
  });
}

function startUpdatingSheet(auth) {
  setInterval(() => {
    coinsData = loadData(coinsDataPath);
    updateSheet(auth);
  }, 10000);  // Every 10 seconds
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
  if (token.expiry_date <= Date.now()) {
    const oAuth2Client = new google.auth.OAuth2();
    oAuth2Client.setCredentials(token);
    refreshTokenIfNeeded(oAuth2Client);
  }
}, 60000);  // Check every minute

// Local server to handle OAuth
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
