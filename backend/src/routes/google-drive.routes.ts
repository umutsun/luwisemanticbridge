/**
 * Google Drive Integration Routes
 */

import { Router, Request, Response } from 'express';
import { googleDriveService } from '../services/google-drive.service';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

/**
 * Get Google Drive configuration
 */
router.get('/config', authenticateToken, async (req: Request, res: Response) => {
  try {
    const config = await googleDriveService.getConfig();

    // Mask the service account JSON for security
    if (config?.serviceAccountJson) {
      try {
        const parsed = typeof config.serviceAccountJson === 'string'
          ? JSON.parse(config.serviceAccountJson)
          : config.serviceAccountJson;
        config.serviceAccountJson = JSON.stringify({
          type: parsed.type,
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          // Mask private key
          private_key: '••••••••'
        });
      } catch {
        config.serviceAccountJson = '••••••••';
      }
    }

    res.json({ config });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Get config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Save Google Drive configuration
 */
router.post('/config', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { serviceAccountJson, folderId, enabled } = req.body;

    // Validate service account JSON
    if (serviceAccountJson && serviceAccountJson !== '••••••••') {
      try {
        const parsed = JSON.parse(serviceAccountJson);
        if (!parsed.client_email || !parsed.private_key) {
          return res.status(400).json({
            error: 'Invalid service account JSON. Must contain client_email and private_key.'
          });
        }
      } catch (e) {
        return res.status(400).json({ error: 'Invalid JSON format for service account credentials' });
      }
    }

    // Get existing config to preserve service account if not updated
    const existingConfig = await googleDriveService.getConfig();

    const config = {
      serviceAccountJson: (serviceAccountJson && serviceAccountJson !== '••••••••')
        ? serviceAccountJson
        : existingConfig?.serviceAccountJson || '',
      folderId: folderId || existingConfig?.folderId || '',
      enabled: enabled ?? existingConfig?.enabled ?? false
    };

    await googleDriveService.saveConfig(config);

    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Save config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test Google Drive connection
 */
router.post('/test', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await googleDriveService.testConnection();
    res.json(result);
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Test connection error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * List files from Google Drive folder
 */
router.get('/files', authenticateToken, async (req: Request, res: Response) => {
  try {
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const pageToken = req.query.pageToken as string || undefined;

    const result = await googleDriveService.listFiles({ pageSize, pageToken });
    res.json(result);
  } catch (error: any) {
    console.error('[GoogleDrive Routes] List files error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Import selected files from Google Drive
 */
router.post('/import', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'fileIds array is required' });
    }

    const result = await googleDriveService.importFiles(fileIds);

    res.json({
      success: true,
      imported: result.success,
      failed: result.failed,
      errors: result.errors,
      documents: result.importedDocs
    });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Import error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Extract folder ID from URL
 */
router.post('/extract-folder-id', authenticateToken, (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const folderId = (googleDriveService.constructor as any).extractFolderId(url);
    res.json({ folderId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
