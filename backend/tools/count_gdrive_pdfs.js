/**
 * Count PDFs in Google Drive
 */

const { Pool } = require('pg');
const { google } = require('googleapis');
const fs = require('fs');

(async () => {
  try {
    const envContent = fs.readFileSync('.env', 'utf-8');
    const dbUrl = envContent.match(/DATABASE_URL=(.+)/)[1].trim();
    const pool = new Pool({ connectionString: dbUrl });

    // Get Google Drive config
    const result = await pool.query("SELECT value FROM settings WHERE key = $1", ['googleDrive.config']);
    if (!result.rows.length) {
      console.log('No Google Drive config found');
      await pool.end();
      return;
    }

    const config = JSON.parse(result.rows[0].value);
    console.log('Connected as:', config.userEmail);
    console.log('Folder ID:', config.folderId);
    console.log('Enabled:', config.enabled);

    // Get OAuth config
    const oauthResult = await pool.query("SELECT value FROM settings WHERE key = $1", ['googleDrive.oauth']);
    const oauthConfig = JSON.parse(oauthResult.rows[0].value);

    // Setup OAuth client
    const oauth2Client = new google.auth.OAuth2(
      oauthConfig.clientId,
      oauthConfig.clientSecret,
      oauthConfig.redirectUri
    );

    oauth2Client.setCredentials({
      access_token: config.accessToken,
      refresh_token: config.refreshToken
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // List all PDF files in folder
    let totalPDFs = 0;
    let totalSize = 0;
    let pageToken = null;
    let sampleFiles = [];

    console.log('\nScanning Google Drive folder...\n');

    do {
      const response = await drive.files.list({
        q: `'${config.folderId}' in parents and mimeType='application/pdf' and trashed=false`,
        pageSize: 1000,
        pageToken: pageToken,
        fields: 'nextPageToken, files(id, name, size)'
      });

      totalPDFs += response.data.files.length;

      response.data.files.forEach(f => {
        totalSize += parseInt(f.size || 0);
        if (sampleFiles.length < 5) {
          sampleFiles.push(f.name);
        }
      });

      pageToken = response.data.nextPageToken;

      if (totalPDFs % 1000 === 0 && totalPDFs > 0) {
        console.log(`  Scanned ${totalPDFs} files...`);
      }
    } while (pageToken);

    console.log('\n=== GOOGLE DRIVE REPORT ===');
    console.log(`Total PDFs: ${totalPDFs}`);
    console.log(`Total Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('\nSample files:');
    sampleFiles.forEach(f => console.log(`  - ${f}`));

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.log('\nToken expired. Please re-authenticate in Settings > Google Drive');
    }
  }
})();
