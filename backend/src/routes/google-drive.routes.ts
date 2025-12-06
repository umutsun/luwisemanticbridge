/**
 * Google Drive Integration Routes
 *
 * OAuth 2.0 based authentication for easy user access.
 */

import { Router, Request, Response } from 'express';
import { googleDriveService } from '../services/google-drive.service';
import { authenticateToken } from '../middleware/auth.middleware';
import importJobService from '../services/import-job.service';

const router = Router();

/**
 * Get OAuth configuration status
 */
router.get('/oauth-config', authenticateToken, async (req: Request, res: Response) => {
  try {
    const oauthConfig = await googleDriveService.getOAuthConfig();
    const publicConfig = await googleDriveService.getPublicConfig();

    res.json({
      oauthConfigured: oauthConfig.configured,
      clientId: oauthConfig.clientId,
      redirectUri: oauthConfig.redirectUri,
      ...publicConfig
    });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Get OAuth config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Save OAuth credentials
 */
router.post('/oauth-config', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { clientId, clientSecret, redirectUri } = req.body;

    if (!clientId || !clientSecret || !redirectUri) {
      return res.status(400).json({ error: 'clientId, clientSecret, and redirectUri are required' });
    }

    await googleDriveService.saveOAuthCredentials({
      clientId,
      clientSecret,
      redirectUri
    });

    res.json({ success: true, message: 'OAuth credentials saved successfully' });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Save OAuth config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get Google Drive configuration
 */
router.get('/config', authenticateToken, async (req: Request, res: Response) => {
  try {
    const publicConfig = await googleDriveService.getPublicConfig();
    const oauthConfig = await googleDriveService.getOAuthConfig();

    res.json({
      config: publicConfig,
      oauthConfigured: oauthConfig.configured,
      clientId: oauthConfig.clientId,
      redirectUri: oauthConfig.redirectUri
    });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Get config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get OAuth authorization URL
 */
router.get('/auth-url', authenticateToken, async (req: Request, res: Response) => {
  try {
    const authUrl = await googleDriveService.getAuthUrl();
    res.json({ authUrl });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Get auth URL error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * OAuth callback handler
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, error: oauthError } = req.query;

    if (oauthError) {
      // Redirect to settings with error
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/dashboard/settings?tab=advanced&drive_error=${encodeURIComponent(oauthError as string)}`);
    }

    if (!code || typeof code !== 'string') {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      return res.redirect(`${frontendUrl}/dashboard/settings?tab=advanced&drive_error=no_code`);
    }

    const result = await googleDriveService.handleCallback(code);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    if (result.success) {
      res.redirect(`${frontendUrl}/dashboard/settings?tab=advanced&drive_connected=true&drive_email=${encodeURIComponent(result.email || '')}`);
    } else {
      res.redirect(`${frontendUrl}/dashboard/settings?tab=advanced&drive_error=${encodeURIComponent(result.error || 'unknown_error')}`);
    }
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/dashboard/settings?tab=advanced&drive_error=${encodeURIComponent(error.message)}`);
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
 * Disconnect Google Drive
 */
router.post('/disconnect', authenticateToken, async (req: Request, res: Response) => {
  try {
    await googleDriveService.disconnect();
    res.json({ success: true, message: 'Disconnected from Google Drive' });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Disconnect error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update folder ID
 */
router.post('/folder', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { folderId } = req.body;

    if (folderId !== undefined) {
      await googleDriveService.updateFolderId(folderId);
    }

    res.json({ success: true, message: 'Folder ID updated' });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Update folder error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List files from Google Drive folder
 */
router.get('/files', authenticateToken, async (req: Request, res: Response) => {
  try {
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const pageToken = req.query.pageToken as string || undefined;
    const folderId = req.query.folderId as string || undefined;

    const result = await googleDriveService.listFiles({ pageSize, pageToken, folderId });
    res.json(result);
  } catch (error: any) {
    console.error('[GoogleDrive Routes] List files error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Import selected files from Google Drive with progress tracking (recommended)
 * Returns job ID immediately, processes files in background
 */
router.post('/import-with-progress', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { fileIds } = req.body;
    const userId = (req as any).user?.userId;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'fileIds array is required' });
    }

    const result = await googleDriveService.importFilesWithProgress(fileIds, userId);

    res.json({
      success: true,
      jobId: result.jobId,
      totalFiles: result.totalFiles,
      message: 'Import started in background. Use WebSocket or polling to track progress.'
    });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Import with progress error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Import selected files from Google Drive (legacy, synchronous)
 * For large files, use /import-with-progress instead
 */
router.post('/import', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { fileIds } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return res.status(400).json({ error: 'fileIds array is required' });
    }

    // For large imports, recommend using /import-with-progress
    if (fileIds.length > 5) {
      return res.status(400).json({
        error: 'For imports with more than 5 files, please use /import-with-progress endpoint for better reliability and progress tracking'
      });
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
 * Get import job status
 */
router.get('/import-job/:jobId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const job = await importJobService.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Get job error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all import jobs for current user
 */
router.get('/import-jobs', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const limit = parseInt(req.query.limit as string) || 20;

    const jobs = userId
      ? await importJobService.getUserJobs(userId, limit)
      : await importJobService.getActiveJobs();

    res.json({ jobs });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Get jobs error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Cancel an import job
 */
router.post('/import-job/:jobId/cancel', authenticateToken, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    await importJobService.cancelJob(jobId);

    res.json({ success: true, message: 'Job cancelled' });
  } catch (error: any) {
    console.error('[GoogleDrive Routes] Cancel job error:', error);
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
