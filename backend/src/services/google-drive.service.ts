/**
 * Google Drive Integration Service
 *
 * Uses OAuth 2.0 user authentication for easy access.
 * Users simply click "Connect with Google" to authorize.
 * OAuth credentials can be configured from Settings UI.
 */

import { google, drive_v3, sheets_v4 } from 'googleapis';
import pool from '../config/database';
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';
import contextualDocumentProcessor from './contextual-document-processor.service';
import { normalizeTurkishChars, generateTableName } from '../utils/text-utils';
import importJobService from './import-job.service';

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface GoogleDriveConfig {
  accessToken?: string;
  refreshToken?: string;
  tokenExpiry?: number;
  userEmail?: string;
  folderId: string;
  enabled: boolean;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  webViewLink?: string;
  iconLink?: string;
}

class GoogleDriveService {
  private drive: drive_v3.Drive | null = null;
  private sheets: sheets_v4.Sheets | null = null;
  private config: GoogleDriveConfig | null = null;
  private oauth2Client: any = null;
  private oauthCredentials: OAuthCredentials | null = null;

  /**
   * Load OAuth credentials from database
   */
  async loadOAuthCredentials(): Promise<OAuthCredentials | null> {
    try {
      const result = await pool.query(
        "SELECT value FROM settings WHERE key = 'googleDrive.oauth'"
      );

      if (result.rows.length === 0) {
        return null;
      }

      const value = result.rows[0].value;
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (error) {
      console.error('[GoogleDrive] Failed to load OAuth credentials:', error);
      return null;
    }
  }

  /**
   * Save OAuth credentials to database
   */
  async saveOAuthCredentials(credentials: OAuthCredentials): Promise<void> {
    await pool.query(
      `INSERT INTO settings (key, value, category)
       VALUES ('googleDrive.oauth', $1, 'integrations')
       ON CONFLICT (key)
       DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(credentials)]
    );

    this.oauthCredentials = credentials;
    await this.initOAuth2Client();
  }

  /**
   * Initialize OAuth2 client from database credentials
   */
  private async initOAuth2Client(): Promise<void> {
    if (!this.oauthCredentials) {
      this.oauthCredentials = await this.loadOAuthCredentials();
    }

    if (this.oauthCredentials?.clientId && this.oauthCredentials?.clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(
        this.oauthCredentials.clientId,
        this.oauthCredentials.clientSecret,
        this.oauthCredentials.redirectUri
      );
    } else {
      this.oauth2Client = null;
    }
  }

  /**
   * Get OAuth configuration status
   */
  async getOAuthConfig(): Promise<{ configured: boolean; clientId?: string; redirectUri?: string }> {
    if (!this.oauthCredentials) {
      this.oauthCredentials = await this.loadOAuthCredentials();
    }

    return {
      configured: !!(this.oauthCredentials?.clientId && this.oauthCredentials?.clientSecret),
      clientId: this.oauthCredentials?.clientId || undefined,
      redirectUri: this.oauthCredentials?.redirectUri || undefined
    };
  }

  /**
   * Generate OAuth authorization URL
   */
  async getAuthUrl(): Promise<string> {
    await this.initOAuth2Client();

    if (!this.oauth2Client) {
      throw new Error('OAuth2 client not configured. Please configure Client ID and Client Secret in Settings.');
    }

    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent' // Force consent to always get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async handleCallback(code: string): Promise<{ success: boolean; email?: string; error?: string }> {
    await this.initOAuth2Client();

    if (!this.oauth2Client) {
      return { success: false, error: 'OAuth2 client not configured' };
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Get user email
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email;

      // Save tokens to database
      const existingConfig = await this.getConfig();
      const newConfig: GoogleDriveConfig = {
        ...existingConfig,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || existingConfig?.refreshToken,
        tokenExpiry: tokens.expiry_date,
        userEmail: email || undefined,
        folderId: existingConfig?.folderId || '',
        enabled: true
      };

      await this.saveConfig(newConfig);

      return { success: true, email: email || undefined };
    } catch (error: any) {
      console.error('[GoogleDrive] OAuth callback error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Initialize Google Drive client with OAuth tokens
   */
  async initialize(): Promise<boolean> {
    try {
      // Initialize OAuth2 client first
      await this.initOAuth2Client();

      // Load config from database
      const configResult = await pool.query(
        "SELECT value FROM settings WHERE key = 'googleDrive.config'"
      );

      if (configResult.rows.length === 0) {
        console.log('[GoogleDrive] No configuration found in database');
        return false;
      }

      const configValue = configResult.rows[0].value;
      this.config = typeof configValue === 'string' ? JSON.parse(configValue) : configValue;

      if (!this.config?.enabled || !this.config?.accessToken) {
        console.log('[GoogleDrive] Service not enabled or not connected');
        return false;
      }

      if (!this.oauth2Client) {
        console.log('[GoogleDrive] OAuth2 client not configured');
        return false;
      }

      // Set credentials
      this.oauth2Client.setCredentials({
        access_token: this.config.accessToken,
        refresh_token: this.config.refreshToken,
        expiry_date: this.config.tokenExpiry
      });

      // Handle token refresh
      this.oauth2Client.on('tokens', async (tokens: any) => {
        if (tokens.access_token) {
          const currentConfig = await this.getConfig();
          if (currentConfig) {
            currentConfig.accessToken = tokens.access_token;
            if (tokens.refresh_token) {
              currentConfig.refreshToken = tokens.refresh_token;
            }
            if (tokens.expiry_date) {
              currentConfig.tokenExpiry = tokens.expiry_date;
            }
            await this.saveConfig(currentConfig);
          }
        }
      });

      // Initialize Drive API
      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      // Initialize Sheets API for spreadsheet access
      this.sheets = google.sheets({ version: 'v4', auth: this.oauth2Client });

      console.log('[GoogleDrive] Service initialized successfully');
      return true;
    } catch (error: any) {
      console.error('[GoogleDrive] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<{ success: boolean; message: string; email?: string; folderName?: string }> {
    try {
      if (!this.drive) {
        const initialized = await this.initialize();
        if (!initialized) {
          return { success: false, message: 'Google Drive not connected. Please connect with Google.' };
        }
      }

      // Get user info
      const about = await this.drive!.about.get({ fields: 'user' });
      const email = about.data.user?.emailAddress;

      // Try to access the configured folder
      if (this.config?.folderId) {
        try {
          const folder = await this.drive!.files.get({
            fileId: this.config.folderId,
            fields: 'id, name'
          });
          return {
            success: true,
            message: 'Connection successful',
            email,
            folderName: folder.data.name || undefined
          };
        } catch (folderError: any) {
          return {
            success: true,
            message: 'Connected but folder not accessible. Please check the folder ID.',
            email
          };
        }
      }

      return {
        success: true,
        message: 'Connected successfully (no folder configured)',
        email
      };
    } catch (error: any) {
      // Check if token expired
      if (error.message?.includes('invalid_grant') || error.message?.includes('Token has been expired')) {
        return {
          success: false,
          message: 'Connection expired. Please reconnect with Google.'
        };
      }
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }

  /**
   * Disconnect Google Drive
   */
  async disconnect(): Promise<void> {
    try {
      if (this.oauth2Client && this.config?.accessToken) {
        try {
          await this.oauth2Client.revokeToken(this.config.accessToken);
        } catch (e) {
          // Token might already be invalid
        }
      }

      // Clear config
      const newConfig: GoogleDriveConfig = {
        accessToken: undefined,
        refreshToken: undefined,
        tokenExpiry: undefined,
        userEmail: undefined,
        folderId: '',
        enabled: false
      };
      await this.saveConfig(newConfig);

      this.drive = null;
      console.log('[GoogleDrive] Disconnected successfully');
    } catch (error: any) {
      console.error('[GoogleDrive] Disconnect error:', error.message);
    }
  }

  /**
   * List files in the configured folder or root
   */
  async listFiles(options?: {
    pageSize?: number;
    pageToken?: string;
    mimeTypes?: string[];
    folderId?: string;
  }): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Google Drive not connected');
      }
    }

    const targetFolderId = options?.folderId || this.config?.folderId;

    // Build query
    let query = 'trashed = false';

    if (targetFolderId) {
      query = `'${targetFolderId}' in parents and ${query}`;
    }

    // Filter by mime types if specified
    if (options?.mimeTypes && options.mimeTypes.length > 0) {
      const mimeQuery = options.mimeTypes.map(m => `mimeType = '${m}'`).join(' or ');
      query += ` and (${mimeQuery})`;
    } else {
      // Default: only get documents we can process
      query += ` and (
        mimeType = 'application/pdf' or
        mimeType = 'application/vnd.google-apps.document' or
        mimeType = 'application/vnd.google-apps.spreadsheet' or
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or
        mimeType = 'application/msword' or
        mimeType = 'application/vnd.ms-excel' or
        mimeType = 'text/plain' or
        mimeType = 'text/csv' or
        mimeType = 'application/json' or
        mimeType = 'text/markdown' or
        mimeType = 'application/vnd.google-apps.folder'
      )`;
    }

    const response = await this.drive!.files.list({
      q: query,
      pageSize: options?.pageSize || 50,
      pageToken: options?.pageToken,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink)',
      orderBy: 'folder,modifiedTime desc'
    });

    const files: DriveFile[] = (response.data.files || []).map(file => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      size: parseInt(file.size || '0', 10),
      modifiedTime: file.modifiedTime!,
      webViewLink: file.webViewLink || undefined,
      iconLink: file.iconLink || undefined
    }));

    return {
      files,
      nextPageToken: response.data.nextPageToken || undefined
    };
  }

  /**
   * Download a file from Google Drive
   */
  async downloadFile(fileId: string): Promise<{ content: Buffer; name: string; mimeType: string }> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Google Drive not connected');
      }
    }

    // Get file metadata
    const metadata = await this.drive!.files.get({
      fileId,
      fields: 'id, name, mimeType, size'
    });

    const mimeType = metadata.data.mimeType!;
    const name = metadata.data.name!;

    // Handle Google Spreadsheet files - use Sheets API for proper data with headers
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      console.log('[GoogleDrive] Downloading Google Spreadsheet via Sheets API:', name);
      const csvContent = await this.downloadSpreadsheetAsCSV(fileId);
      return {
        content: Buffer.from(csvContent, 'utf-8'),
        name: this.addExportExtension(name, 'text/csv'),
        mimeType: 'text/csv'
      };
    }

    // Handle other Google Docs files (need to export)
    if (mimeType.startsWith('application/vnd.google-apps.')) {
      const exportMimeType = this.getExportMimeType(mimeType);
      const response = await this.drive!.files.export(
        { fileId, mimeType: exportMimeType },
        { responseType: 'arraybuffer' }
      );
      return {
        content: Buffer.from(response.data as ArrayBuffer),
        name: this.addExportExtension(name, exportMimeType),
        mimeType: exportMimeType
      };
    }

    // Regular file download - always use arraybuffer for proper encoding handling
    const response = await this.drive!.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    let content = Buffer.from(response.data as ArrayBuffer);

    // For text files, detect and convert encoding to UTF-8
    if (mimeType.startsWith('text/') || mimeType.includes('csv')) {
      content = this.ensureUTF8Encoding(content);
    }

    return {
      content,
      name,
      mimeType
    };
  }

  /**
   * Download Google Spreadsheet data using Sheets API
   * Returns CSV string with headers guaranteed
   */
  private async downloadSpreadsheetAsCSV(spreadsheetId: string): Promise<string> {
    if (!this.sheets) {
      throw new Error('Sheets API not initialized');
    }

    try {
      // Get spreadsheet metadata to find first sheet
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties'
      });

      const firstSheet = spreadsheet.data.sheets?.[0];
      const sheetName = firstSheet?.properties?.title || 'Sheet1';

      console.log(`[GoogleDrive] Reading sheet: ${sheetName}`);

      // Get all values from the sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: sheetName,
        valueRenderOption: 'FORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });

      const values = response.data.values;
      if (!values || values.length === 0) {
        console.log('[GoogleDrive] Spreadsheet is empty');
        return '';
      }

      console.log(`[GoogleDrive] Read ${values.length} rows, ${values[0]?.length || 0} columns`);

      // Convert to CSV format
      const csvRows = values.map(row => {
        return row.map(cell => {
          const cellStr = String(cell ?? '');
          // Escape quotes and wrap in quotes if contains comma, quote, or newline
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',');
      });

      const csvContent = csvRows.join('\n');
      console.log(`[GoogleDrive] Generated CSV: ${csvContent.length} chars, first row: ${csvRows[0]?.substring(0, 100)}`);

      return csvContent;
    } catch (error: any) {
      console.error('[GoogleDrive] Failed to read spreadsheet:', error.message);
      // Fallback to export API
      console.log('[GoogleDrive] Falling back to export API...');
      const response = await this.drive!.files.export(
        { fileId: spreadsheetId, mimeType: 'text/csv' },
        { responseType: 'arraybuffer' }
      );
      const buffer = Buffer.from(response.data as ArrayBuffer);
      return this.ensureUTF8Encoding(buffer).toString('utf-8');
    }
  }

  /**
   * Ensure buffer is properly encoded as UTF-8
   * Handles Turkish characters and various source encodings
   */
  private ensureUTF8Encoding(buffer: Buffer): Buffer {
    // Strip BOM if present
    let cleanBuffer = buffer;
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      cleanBuffer = buffer.slice(3);
    } else if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
      cleanBuffer = buffer.slice(2);
    } else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
      cleanBuffer = buffer.slice(2);
    }

    // Detect encoding
    const detected = jschardet.detect(cleanBuffer);
    const encoding = detected.encoding || 'UTF-8';
    const confidence = detected.confidence || 0;

    console.log(`[GoogleDrive] Encoding detected: ${encoding} (confidence: ${(confidence * 100).toFixed(1)}%)`);

    // Map encoding names
    const encodingMap: Record<string, string> = {
      'ascii': 'utf-8',
      'ASCII': 'utf-8',
      'UTF-8': 'utf-8',
      'ISO-8859-1': 'iso-8859-1',
      'ISO-8859-9': 'iso-8859-9',
      'windows-1252': 'win1252',
      'windows-1254': 'win1254',
      'WINDOWS-1252': 'win1252',
      'WINDOWS-1254': 'win1254',
    };

    const normalizedEncoding = encodingMap[encoding] || encoding.toLowerCase();

    // If detected as UTF-8 or ASCII with high confidence, try it first but verify
    if ((normalizedEncoding === 'utf-8' || normalizedEncoding === 'ascii') && confidence > 0.8) {
      const utf8Result = cleanBuffer.toString('utf-8');
      // Check for broken characters that indicate wrong encoding
      const hasBrokenChars = /[\uFFFD�]|Ã¼|Ã¶|Ã§|Ã°|Ä±|Å|Ä|Ãœ|Å|Ã‡|Ã–|Ä°/.test(utf8Result);
      if (!hasBrokenChars) {
        console.log('[GoogleDrive] UTF-8 decode successful, no broken characters');
        return cleanBuffer;
      }
      console.log('[GoogleDrive] UTF-8 has broken characters, trying Turkish encodings...');
    }

    // Try detected encoding first
    try {
      if (iconv.encodingExists(normalizedEncoding)) {
        const decoded = iconv.decode(cleanBuffer, normalizedEncoding);
        if (/[üşğıöçÜŞĞİÖÇ]/.test(decoded) && !/[\uFFFD�]/.test(decoded)) {
          console.log(`[GoogleDrive] Successfully decoded with ${normalizedEncoding}`);
          return Buffer.from(decoded, 'utf-8');
        }
      }
    } catch (e) {
      // Continue to fallbacks
    }

    // Try Turkish encodings as fallback
    for (const enc of ['win1254', 'iso-8859-9', 'win1252', 'iso-8859-1']) {
      try {
        if (iconv.encodingExists(enc)) {
          const decoded = iconv.decode(cleanBuffer, enc);
          if (!decoded.includes('�') && !decoded.includes('\uFFFD')) {
            const hasTurkish = /[üşğıöçÜŞĞİÖÇ]/.test(decoded);
            const hasBroken = /Ã¼|Ã¶|Ã§|Ã°|Ä±|Å|Ä/.test(decoded);
            if (hasTurkish && !hasBroken) {
              console.log(`[GoogleDrive] Successfully decoded with fallback: ${enc}`);
              return Buffer.from(decoded, 'utf-8');
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    // Return as-is if nothing works
    return cleanBuffer;
  }

  /**
   * Get export MIME type for Google Docs files
   */
  private getExportMimeType(googleMimeType: string): string {
    const exportMap: Record<string, string> = {
      'application/vnd.google-apps.document': 'application/pdf',
      'application/vnd.google-apps.spreadsheet': 'text/csv',
      'application/vnd.google-apps.presentation': 'application/pdf',
      'application/vnd.google-apps.drawing': 'application/pdf'
    };
    return exportMap[googleMimeType] || 'application/pdf';
  }

  /**
   * Add appropriate extension for exported files
   */
  private addExportExtension(name: string, mimeType: string): string {
    const extMap: Record<string, string> = {
      'application/pdf': '.pdf',
      'text/csv': '.csv',
      'text/plain': '.txt'
    };
    const ext = extMap[mimeType] || '.pdf';
    if (!name.toLowerCase().endsWith(ext)) {
      return name + ext;
    }
    return name;
  }

  /**
   * Get upload directory for documents (same logic as documents.routes.ts)
   */
  private getUploadDirectory(): string {
    const uploadDir = process.env.DOCUMENTS_PATH || process.env.UPLOAD_DIR || './docs';
    const normalizedPath = uploadDir.replace(/\//g, path.sep);

    let fullPath: string;
    if (path.isAbsolute(normalizedPath)) {
      fullPath = normalizedPath;
    } else {
      // Go up one level from backend to project root
      fullPath = path.join(process.cwd(), '..', normalizedPath);
    }

    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`[GoogleDrive] Created documents directory: ${fullPath}`);
    }

    return fullPath;
  }

  /**
   * Import files with job tracking and progress updates (recommended for large imports)
   * Returns job ID immediately, processing continues in Python Celery worker
   */
  async importFilesWithProgress(fileIds: string[], userId?: string): Promise<{
    jobId: number;
    totalFiles: number;
  }> {
    // Create job
    const job = await importJobService.createJob({
      userId,
      jobType: 'google_drive',
      totalFiles: fileIds.length,
      metadata: { fileIds }
    });

    // Enqueue job to Python Celery worker (don't await)
    this.enqueuePythonImport(job.id, fileIds).catch(error => {
      console.error(`[GoogleDrive] Failed to enqueue job ${job.id}:`, error);
      importJobService.updateJobStatus(job.id, 'failed');
    });

    return {
      jobId: job.id,
      totalFiles: fileIds.length
    };
  }

  /**
   * Enqueue import job to Python Celery worker
   * Delegates processing to Python microservice for better performance
   */
  private async enqueuePythonImport(jobId: number, fileIds: string[]): Promise<void> {
    try {
      // Get OAuth credentials from config
      const config = await this.getConfig();
      if (!config || !this.oauth2Client) {
        throw new Error('Google Drive not connected');
      }

      // Get current token (may refresh automatically)
      const tokens = this.oauth2Client.credentials;
      if (!tokens.access_token) {
        throw new Error('No access token available');
      }

      // Prepare credentials dict for Python
      const credentialsDict = {
        token: tokens.access_token,
        refresh_token: tokens.refresh_token || config.refreshToken,
        token_uri: 'https://oauth2.googleapis.com/token',
        client_id: this.oauthCredentials?.clientId,
        client_secret: this.oauthCredentials?.clientSecret,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      };

      // Get docs directory
      const docsDir = this.getUploadDirectory();

      // Call Python microservice to enqueue Celery task
      const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8002';
      const response = await fetch(`${pythonServiceUrl}/api/python/import/google-drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          file_ids: fileIds,
          credentials: credentialsDict,
          docs_dir: docsDir
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python service error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`[GoogleDrive] Job ${jobId} enqueued to Python worker, task ID: ${result.task_id}`);
    } catch (error: any) {
      console.error(`[GoogleDrive] Failed to enqueue Python import:`, error.message);
      throw error;
    }
  }

  /**
   * Import files from Google Drive to documents table (legacy, synchronous)
   * Uses the same processing pipeline as regular file uploads (contextualDocumentProcessor)
   * @deprecated Use importFilesWithProgress for better UX with large imports
   */
  async importFiles(fileIds: string[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
    importedDocs: Array<{ id: number; name: string; driveId: string }>;
  }> {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      importedDocs: [] as Array<{ id: number; name: string; driveId: string }>
    };

    for (const fileId of fileIds) {
      try {
        // Download file from Google Drive
        const { content, name, mimeType } = await this.downloadFile(fileId);
        console.log(`[GoogleDrive] Downloaded: ${name} (${content.length} bytes, ${mimeType})`);

        // Determine file type
        const fileType = this.getFileType(mimeType, name);

        // Save file to physical storage first (like regular upload)
        const docsDir = this.getUploadDirectory();
        // Normalize Turkish characters to ASCII and sanitize filename
        const normalizedName = normalizeTurkishChars(name);
        const safeName = normalizedName
          .replace(/[^\w\s\-_.]/g, '_')  // Replace special chars with underscore
          .replace(/\s+/g, '_')           // Replace spaces with underscore
          .replace(/_+/g, '_');           // Remove consecutive underscores
        const filePath = path.join(docsDir, safeName);

        // Write file to disk
        fs.writeFileSync(filePath, content);
        console.log(`[GoogleDrive] Saved to disk: ${filePath}`);

        // Process file using contextual document processor (same as regular upload)
        let processedDoc;
        try {
          processedDoc = await contextualDocumentProcessor.processFile(filePath, name, mimeType);
          console.log(`[GoogleDrive] Processed: ${name} - ${processedDoc.content?.length || 0} chars`);
        } catch (processingError: any) {
          console.error(`[GoogleDrive] Processing error for ${name}:`, processingError.message);
          // Fallback - read as text if possible
          processedDoc = {
            title: name,
            content: mimeType.startsWith('text/') ? content.toString('utf-8') : '',
            chunks: [],
            metadata: {
              processingError: processingError.message
            }
          };
        }

        // Check if already imported (by google_drive_id) and get file_size for resume logic
        const existingDoc = await pool.query(
          "SELECT id, file_size FROM documents WHERE metadata->>'google_drive_id' = $1",
          [fileId]
        );

        const metadata = {
          google_drive_id: fileId,
          google_drive_mime: mimeType,
          source: 'google_drive',
          imported_at: new Date().toISOString(),
          ...processedDoc.metadata
        };

        let docId: number;

        if (existingDoc.rows.length > 0) {
          const existingFileSize = existingDoc.rows[0].file_size;
          const newFileSize = content.length;

          // Resume logic: Skip if file sizes match (already fully imported)
          if (existingFileSize === newFileSize) {
            docId = existingDoc.rows[0].id;
            console.log(`[GoogleDrive] Skipping ${name} - already imported with same size (${existingFileSize} bytes)`);

            result.importedDocs.push({
              id: docId,
              name,
              driveId: fileId
            });
            result.success++;
            continue; // Skip to next file
          }

          // File size differs - update (resume incomplete import or file changed)
          console.log(`[GoogleDrive] Updating ${name} - size mismatch (existing: ${existingFileSize}, new: ${newFileSize})`);
          docId = existingDoc.rows[0].id;
          await pool.query(
            `UPDATE documents SET
              content = $1,
              file_path = $2,
              file_size = $3,
              processing_status = $4,
              updated_at = CURRENT_TIMESTAMP,
              metadata = $5
            WHERE id = $6`,
            [
              processedDoc.content,
              filePath,
              content.length,
              'completed',
              JSON.stringify(metadata),
              docId
            ]
          );
          console.log(`[GoogleDrive] Updated existing document: ${name} (id: ${docId})`);
        } else {
          // Create new document
          const insertResult = await pool.query(
            `INSERT INTO documents (title, content, file_type, file_size, file_path, processing_status, metadata)
             VALUES ($1, $2, $3, $4, $5, 'completed', $6)
             RETURNING id`,
            [
              name,
              processedDoc.content,
              fileType,
              content.length,
              filePath,
              JSON.stringify(metadata)
            ]
          );
          docId = insertResult.rows[0].id;
          console.log(`[GoogleDrive] Created new document: ${name} (id: ${docId})`);
        }

        result.importedDocs.push({
          id: docId,
          name,
          driveId: fileId
        });

        result.success++;
        console.log(`[GoogleDrive] Successfully imported: ${name}`);
      } catch (error: any) {
        result.failed++;
        result.errors.push(`${fileId}: ${error.message}`);
        console.error(`[GoogleDrive] Failed to import ${fileId}:`, error.message);
      }
    }

    return result;
  }

  /**
   * Get file type from MIME type
   */
  private getFileType(mimeType: string, name: string): string {
    const mimeMap: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/msword': 'doc',
      'text/plain': 'txt',
      'text/csv': 'csv',
      'application/json': 'json',
      'text/markdown': 'md'
    };

    if (mimeMap[mimeType]) {
      return mimeMap[mimeType];
    }

    // Fall back to extension
    const ext = path.extname(name).toLowerCase().replace('.', '');
    return ext || 'unknown';
  }

  /**
   * Save configuration to database
   */
  async saveConfig(config: GoogleDriveConfig): Promise<void> {
    await pool.query(
      `INSERT INTO settings (key, value, category)
       VALUES ('googleDrive.config', $1, 'integrations')
       ON CONFLICT (key)
       DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [JSON.stringify(config)]
    );

    this.config = config;

    // Reinitialize if enabled and has tokens
    if (config.enabled && config.accessToken) {
      await this.initialize();
    } else {
      this.drive = null;
    }
  }

  /**
   * Get current configuration (masked)
   */
  async getConfig(): Promise<GoogleDriveConfig | null> {
    try {
      const result = await pool.query(
        "SELECT value FROM settings WHERE key = 'googleDrive.config'"
      );

      if (result.rows.length === 0) {
        return null;
      }

      const value = result.rows[0].value;
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (error) {
      console.error('[GoogleDrive] Failed to get config:', error);
      return null;
    }
  }

  /**
   * Get public config (without sensitive data)
   */
  async getPublicConfig(): Promise<{
    connected: boolean;
    userEmail?: string;
    folderId?: string;
    enabled: boolean;
  }> {
    const config = await this.getConfig();
    return {
      connected: !!(config?.accessToken),
      userEmail: config?.userEmail,
      folderId: config?.folderId,
      enabled: config?.enabled ?? false
    };
  }

  /**
   * Update folder ID
   */
  async updateFolderId(folderId: string): Promise<void> {
    const config = await this.getConfig();
    if (config) {
      config.folderId = folderId;
      await this.saveConfig(config);
    }
  }

  /**
   * Extract folder ID from various URL formats
   */
  static extractFolderId(input: string): string {
    // Already a folder ID
    if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) {
      return input;
    }

    // Google Drive folder URL patterns
    const patterns = [
      /\/folders\/([a-zA-Z0-9_-]+)/,
      /id=([a-zA-Z0-9_-]+)/,
      /\/d\/([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return input; // Return as-is if no pattern matches
  }
}

export const googleDriveService = new GoogleDriveService();
export default googleDriveService;
