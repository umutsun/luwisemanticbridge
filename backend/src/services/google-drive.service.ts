/**
 * Google Drive Integration Service
 *
 * Uses Service Account authentication for server-side access.
 * Folder must be shared with the service account email.
 */

import { google, drive_v3 } from 'googleapis';
import pool from '../config/database';
import * as fs from 'fs';
import * as path from 'path';

interface GoogleDriveConfig {
  serviceAccountJson: string; // JSON string of service account credentials
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
  private config: GoogleDriveConfig | null = null;

  /**
   * Initialize Google Drive client with service account
   */
  async initialize(): Promise<boolean> {
    try {
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

      if (!this.config?.enabled || !this.config?.serviceAccountJson) {
        console.log('[GoogleDrive] Service not enabled or missing credentials');
        return false;
      }

      // Parse service account JSON
      const credentials = typeof this.config.serviceAccountJson === 'string'
        ? JSON.parse(this.config.serviceAccountJson)
        : this.config.serviceAccountJson;

      // Create JWT auth client
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      });

      // Initialize Drive API
      this.drive = google.drive({ version: 'v3', auth });

      console.log('[GoogleDrive] Service initialized successfully');
      return true;
    } catch (error: any) {
      console.error('[GoogleDrive] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Test connection with service account
   */
  async testConnection(): Promise<{ success: boolean; message: string; email?: string; folderName?: string }> {
    try {
      if (!this.drive) {
        const initialized = await this.initialize();
        if (!initialized) {
          return { success: false, message: 'Failed to initialize Google Drive service' };
        }
      }

      // Get service account info
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
            success: false,
            message: `Connected but cannot access folder. Make sure to share the folder with ${email}`,
            email
          };
        }
      }

      return {
        success: true,
        message: 'Connection successful (no folder configured)',
        email
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`
      };
    }
  }

  /**
   * List files in the configured folder
   */
  async listFiles(options?: {
    pageSize?: number;
    pageToken?: string;
    mimeTypes?: string[];
  }): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Google Drive service not initialized');
      }
    }

    if (!this.config?.folderId) {
      throw new Error('No folder ID configured');
    }

    // Build query
    let query = `'${this.config.folderId}' in parents and trashed = false`;

    // Filter by mime types if specified
    if (options?.mimeTypes && options.mimeTypes.length > 0) {
      const mimeQuery = options.mimeTypes.map(m => `mimeType = '${m}'`).join(' or ');
      query += ` and (${mimeQuery})`;
    } else {
      // Default: only get documents we can process
      query += ` and (
        mimeType = 'application/pdf' or
        mimeType = 'application/vnd.google-apps.document' or
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or
        mimeType = 'application/msword' or
        mimeType = 'text/plain' or
        mimeType = 'text/csv' or
        mimeType = 'application/json' or
        mimeType = 'text/markdown'
      )`;
    }

    const response = await this.drive!.files.list({
      q: query,
      pageSize: options?.pageSize || 50,
      pageToken: options?.pageToken,
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink, iconLink)',
      orderBy: 'modifiedTime desc'
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
        throw new Error('Google Drive service not initialized');
      }
    }

    // Get file metadata
    const metadata = await this.drive!.files.get({
      fileId,
      fields: 'id, name, mimeType, size'
    });

    const mimeType = metadata.data.mimeType!;
    const name = metadata.data.name!;

    // Handle Google Docs files (need to export)
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

    // Regular file download
    const response = await this.drive!.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    return {
      content: Buffer.from(response.data as ArrayBuffer),
      name,
      mimeType
    };
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
   * Import files from Google Drive to documents table
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
        // Download file
        const { content, name, mimeType } = await this.downloadFile(fileId);

        // Determine file type
        const fileType = this.getFileType(mimeType, name);

        // Convert content to text for storage
        let textContent = '';
        if (mimeType === 'application/pdf') {
          // For PDFs, store as base64 for now (will be processed later)
          textContent = `[PDF Binary - ${content.length} bytes]`;
        } else {
          textContent = content.toString('utf-8');
        }

        // Check if already imported (by google_drive_id)
        const existingDoc = await pool.query(
          "SELECT id FROM documents WHERE metadata->>'google_drive_id' = $1",
          [fileId]
        );

        if (existingDoc.rows.length > 0) {
          // Update existing document
          await pool.query(
            `UPDATE documents SET
              content = $1,
              updated_at = CURRENT_TIMESTAMP,
              metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{google_drive_updated}', to_jsonb(NOW()::text))
            WHERE metadata->>'google_drive_id' = $2`,
            [textContent, fileId]
          );
          result.importedDocs.push({
            id: existingDoc.rows[0].id,
            name,
            driveId: fileId
          });
        } else {
          // Create new document
          const insertResult = await pool.query(
            `INSERT INTO documents (title, content, file_type, file_size, source, processing_status, metadata)
             VALUES ($1, $2, $3, $4, 'google_drive', 'pending', $5)
             RETURNING id`,
            [
              name,
              textContent,
              fileType,
              content.length,
              JSON.stringify({
                google_drive_id: fileId,
                google_drive_mime: mimeType,
                imported_at: new Date().toISOString()
              })
            ]
          );
          result.importedDocs.push({
            id: insertResult.rows[0].id,
            name,
            driveId: fileId
          });
        }

        // If PDF, save the actual file for processing
        if (mimeType === 'application/pdf') {
          const docsDir = path.join(process.cwd(), 'docs');
          if (!fs.existsSync(docsDir)) {
            fs.mkdirSync(docsDir, { recursive: true });
          }
          const safeName = name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const filePath = path.join(docsDir, safeName);
          fs.writeFileSync(filePath, content);

          // Update document with file path
          await pool.query(
            `UPDATE documents SET
              metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{file_path}', to_jsonb($1))
            WHERE metadata->>'google_drive_id' = $2`,
            [filePath, fileId]
          );
        }

        result.success++;
        console.log(`[GoogleDrive] Imported: ${name}`);
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

    // Reinitialize if enabled
    if (config.enabled) {
      await this.initialize();
    } else {
      this.drive = null;
    }
  }

  /**
   * Get current configuration
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
