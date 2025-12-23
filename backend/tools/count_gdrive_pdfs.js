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

    console.log('\nScanning Google Drive folder and subfolders...\n');

    // Recursive function to scan folder and subfolders
    async function scanFolder(folderId, folderName = 'Root', depth = 0) {
      const indent = '  '.repeat(depth);
      let stats = { pdfs: 0, folders: 0, others: 0, size: 0, samples: [] };

      // Get all files in this folder
      let pageToken = null;
      do {
        const response = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          pageSize: 1000,
          pageToken: pageToken,
          fields: 'nextPageToken, files(id, name, mimeType, size)'
        });

        for (const file of response.data.files) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            stats.folders++;
            // Recursively scan subfolder
            const subStats = await scanFolder(file.id, file.name, depth + 1);
            stats.pdfs += subStats.pdfs;
            stats.size += subStats.size;
            stats.samples.push(...subStats.samples);
          } else if (file.mimeType === 'application/pdf') {
            stats.pdfs++;
            stats.size += parseInt(file.size || 0);
            if (stats.samples.length < 10) {
              stats.samples.push(`${folderName}/${file.name}`);
            }
          } else {
            stats.others++;
          }
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

      if (depth <= 1) {
        console.log(`${indent}📁 ${folderName}: ${stats.pdfs} PDFs, ${stats.folders} subfolders, ${stats.others} other files`);
      }

      return stats;
    }

    const stats = await scanFolder(config.folderId, 'Root');

    console.log('\n=== GOOGLE DRIVE REPORT (ALL FOLDERS) ===');
    console.log(`Total PDFs: ${stats.pdfs}`);
    console.log(`Total Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    if (stats.samples.length > 0) {
      console.log('\nSample PDF files:');
      stats.samples.slice(0, 10).forEach(f => console.log(`  - ${f}`));
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('invalid_grant')) {
      console.log('\nToken expired. Please re-authenticate in Settings > Google Drive');
    }
  }
})();
