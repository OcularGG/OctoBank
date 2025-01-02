const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const express = require('express');
const readline = require('readline');
const CREDENTIALS_PATH = path.join(__dirname, 'client_secret.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const coinsDataPath = path.join(__dirname, 'coins.json');
let coinsData = loadData(coinsDataPath);
const app = express();
const port = 3000;
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
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  app.get('/oauth2callback', (req, res) => {
    const code = req.query.code;
    if (code) {
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.log('Error retrieving access token', err);
        oAuth2Client.setCredentials(token);
        fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
          if (err) return console.log(err);
          console.log('Token stored to', TOKEN_PATH);
        });
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
  const spreadsheetId = 'YOUR_SPREADSHEETID';
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
  }, 10000);
}
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
