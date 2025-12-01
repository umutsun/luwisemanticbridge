/**
 * Embeddings Sync Routes
 *
 * API endpoints for syncing embeddings to unified_embeddings table
 * and generating embeddings for scraped content
 */

import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { unifiedEmbeddingsSync } from '../services/unified-embeddings-sync.service';
import { scrapeEmbeddingService } from '../services/scrape-embedding.service';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/v2/embeddings-sync/stats
 * Get embedding sync statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await unifiedEmbeddingsSync.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    console.error('[EmbeddingsSync] Stats error:', error);
    res.status(500).json({
      error: error.message || 'Failed to get stats'
    });
  }
});

/**
 * POST /api/v2/embeddings-sync/documents
 * Sync all document embeddings to unified_embeddings
 */
router.post('/documents', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('[EmbeddingsSync] Starting document embeddings sync...');
    const result = await unifiedEmbeddingsSync.syncAllDocumentEmbeddings();

    res.json({
      success: true,
      message: 'Document embeddings synced',
      result
    });
  } catch (error: any) {
    console.error('[EmbeddingsSync] Document sync error:', error);
    res.status(500).json({
      error: error.message || 'Failed to sync document embeddings'
    });
  }
});

/**
 * POST /api/v2/embeddings-sync/documents/:documentId
 * Sync a specific document's embeddings
 */
router.post('/documents/:documentId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { documentId } = req.params;
    console.log(`[EmbeddingsSync] Syncing document ${documentId} embeddings...`);

    const result = await unifiedEmbeddingsSync.syncDocumentEmbeddings(parseInt(documentId));

    res.json({
      success: true,
      message: `Document ${documentId} embeddings synced`,
      result
    });
  } catch (error: any) {
    console.error('[EmbeddingsSync] Document sync error:', error);
    res.status(500).json({
      error: error.message || 'Failed to sync document embeddings'
    });
  }
});

/**
 * POST /api/v2/embeddings-sync/scrapes
 * Sync all scrape embeddings to unified_embeddings
 */
router.post('/scrapes', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('[EmbeddingsSync] Starting scrape embeddings sync...');
    const result = await unifiedEmbeddingsSync.syncAllScrapeEmbeddings();

    res.json({
      success: true,
      message: 'Scrape embeddings synced',
      result
    });
  } catch (error: any) {
    console.error('[EmbeddingsSync] Scrape sync error:', error);
    res.status(500).json({
      error: error.message || 'Failed to sync scrape embeddings'
    });
  }
});

/**
 * POST /api/v2/embeddings-sync/scrapes/generate
 * Generate embeddings for scraped content that doesn't have embeddings yet
 */
router.post('/scrapes/generate', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { projectId, category, limit = 100 } = req.body;

    console.log('[EmbeddingsSync] Generating embeddings for scraped content...');

    // Find scraped content without embeddings
    let query = `
      SELECT sc.id, sc.content, sc.url, sc.title, sc.category, sc.project_id, sc.site_id
      FROM scraped_content sc
      LEFT JOIN scrape_embeddings se ON se.source_url = sc.url
      WHERE se.id IS NULL
        AND sc.content IS NOT NULL
        AND LENGTH(sc.content) > 50
    `;
    const params: any[] = [];

    if (projectId) {
      params.push(projectId);
      query += ` AND sc.project_id = $${params.length}`;
    }

    if (category) {
      params.push(category);
      query += ` AND sc.category = $${params.length}`;
    }

    params.push(limit);
    query += ` LIMIT $${params.length}`;

    const contentResult = await lsembPool.query(query, params);
    console.log(`[EmbeddingsSync] Found ${contentResult.rows.length} scraped items without embeddings`);

    const results = {
      processed: 0,
      failed: 0,
      synced: 0,
      errors: [] as string[]
    };

    for (const content of contentResult.rows) {
      try {
        // Generate and save embedding
        const embeddingIds = await scrapeEmbeddingService.processAndSaveChunks(
          content.content,
          {
            content: content.content,
            sourceUrl: content.url,
            title: content.title,
            category: content.category,
            projectId: content.project_id,
            siteId: content.site_id,
            metadata: {
              scraped_content_id: content.id
            }
          }
        );

        results.processed++;

        // Sync to unified_embeddings
        for (const embeddingId of embeddingIds) {
          const syncOk = await unifiedEmbeddingsSync.syncScrapeEmbedding(embeddingId);
          if (syncOk) results.synced++;
        }

        console.log(`[EmbeddingsSync] Processed: ${content.title || content.url} (${embeddingIds.length} chunks)`);

      } catch (error: any) {
        results.failed++;
        results.errors.push(`${content.url}: ${error.message}`);
        console.error(`[EmbeddingsSync] Failed to process ${content.url}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: 'Scrape embeddings generated',
      results
    });
  } catch (error: any) {
    console.error('[EmbeddingsSync] Generate error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate scrape embeddings'
    });
  }
});

/**
 * POST /api/v2/embeddings-sync/scrapes/url
 * Generate embeddings for a specific URL's content
 */
router.post('/scrapes/url', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { url, content, title, category, projectId, siteId } = req.body;

    if (!url || !content) {
      return res.status(400).json({
        error: 'URL and content are required'
      });
    }

    console.log(`[EmbeddingsSync] Generating embeddings for URL: ${url}`);

    // Generate and save embedding
    const embeddingIds = await scrapeEmbeddingService.processAndSaveChunks(
      content,
      {
        content,
        sourceUrl: url,
        title,
        category,
        projectId,
        siteId
      }
    );

    // Sync to unified_embeddings
    let syncedCount = 0;
    for (const embeddingId of embeddingIds) {
      const syncOk = await unifiedEmbeddingsSync.syncScrapeEmbedding(embeddingId);
      if (syncOk) syncedCount++;
    }

    res.json({
      success: true,
      message: 'Embeddings generated for URL',
      url,
      embeddingIds,
      syncedToUnified: syncedCount
    });
  } catch (error: any) {
    console.error('[EmbeddingsSync] URL embedding error:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate embeddings for URL'
    });
  }
});

/**
 * POST /api/v2/embeddings-sync/cleanup
 * Remove orphaned embeddings from unified_embeddings
 */
router.post('/cleanup', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('[EmbeddingsSync] Cleaning up orphaned embeddings...');
    const result = await unifiedEmbeddingsSync.cleanupOrphanedEmbeddings();

    res.json({
      success: true,
      message: 'Cleanup completed',
      removed: result.removed
    });
  } catch (error: any) {
    console.error('[EmbeddingsSync] Cleanup error:', error);
    res.status(500).json({
      error: error.message || 'Failed to cleanup embeddings'
    });
  }
});

/**
 * POST /api/v2/embeddings-sync/all
 * Sync all embeddings (both documents and scrapes)
 */
router.post('/all', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('[EmbeddingsSync] Starting full sync...');

    const docResult = await unifiedEmbeddingsSync.syncAllDocumentEmbeddings();
    const scrapeResult = await unifiedEmbeddingsSync.syncAllScrapeEmbeddings();

    res.json({
      success: true,
      message: 'Full sync completed',
      documents: docResult,
      scrapes: scrapeResult,
      total: {
        synced: docResult.synced + scrapeResult.synced,
        errors: docResult.errors.length + scrapeResult.errors.length
      }
    });
  } catch (error: any) {
    console.error('[EmbeddingsSync] Full sync error:', error);
    res.status(500).json({
      error: error.message || 'Failed to sync all embeddings'
    });
  }
});

export default router;
