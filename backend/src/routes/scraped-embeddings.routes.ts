/**
 * Scraped Embeddings Routes
 *
 * API endpoints for managing web crawler data embeddings
 */

import { Router, Request, Response } from 'express';
import { scrapedEmbeddingsService } from '../services/scraped-embeddings.service';

const router = Router();

/**
 * POST /process
 * Process crawler data from Redis into scraped_embeddings table
 *
 * Body:
 * - scraperName: string (required) - Name of the crawler (e.g., 'yeditepe_crawler')
 * - urls: string[] (optional) - Specific URLs to process, if empty processes all
 * - generateEmbedding: boolean (optional) - Generate embeddings (default: false)
 * - sourceTable: string (optional) - Link to source DB table
 * - redisDb: number (optional) - Redis database number (default: 3)
 */
router.post('/process', async (req: Request, res: Response) => {
  try {
    const { scraperName, urls, generateEmbedding, sourceTable, redisDb } = req.body;

    if (!scraperName) {
      return res.status(400).json({
        success: false,
        error: 'scraperName is required'
      });
    }

    console.log(`[Scraped Embeddings API] Processing scraper: ${scraperName}`);
    console.log(`[Scraped Embeddings API] Generate embeddings: ${generateEmbedding || false}`);
    console.log(`[Scraped Embeddings API] URLs: ${urls?.length || 'all'}`);

    const result = await scrapedEmbeddingsService.processScraperData({
      scraperName,
      urls,
      generateEmbedding: generateEmbedding || false,
      sourceTable,
      redisDb: redisDb || 3
    });

    if (result.success) {
      console.log(`[Scraped Embeddings API] ✓ Processing complete: ${result.inserted} inserted, ${result.updated} updated`);
      res.json(result);
    } else {
      console.log(`[Scraped Embeddings API] ✗ Processing failed: ${result.error}`);
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error('[Scraped Embeddings API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /scrapers
 * Get all unique scraper names from scraped_embeddings table
 */
router.get('/scrapers', async (req: Request, res: Response) => {
  try {
    const scrapers = await scrapedEmbeddingsService.getScraperNames();

    res.json({
      success: true,
      scrapers
    });
  } catch (error: any) {
    console.error('[Scraped Embeddings API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /scrapers/:scraperName/stats
 * Get statistics for a specific scraper
 */
router.get('/scrapers/:scraperName/stats', async (req: Request, res: Response) => {
  try {
    const { scraperName } = req.params;

    const stats = await scrapedEmbeddingsService.getScraperStats(scraperName);

    if (!stats) {
      return res.status(404).json({
        success: false,
        error: 'Scraper not found'
      });
    }

    res.json({
      success: true,
      scraper: scraperName,
      stats
    });
  } catch (error: any) {
    console.error('[Scraped Embeddings API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /scrapers/:scraperName/embeddings
 * Get embeddings for a specific scraper
 *
 * Query params:
 * - limit: number (default: 100)
 * - offset: number (default: 0)
 */
router.get('/scrapers/:scraperName/embeddings', async (req: Request, res: Response) => {
  try {
    const { scraperName } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const embeddings = await scrapedEmbeddingsService.getEmbeddingsByScraperName(
      scraperName,
      limit,
      offset
    );

    res.json({
      success: true,
      scraper: scraperName,
      count: embeddings.length,
      limit,
      offset,
      embeddings
    });
  } catch (error: any) {
    console.error('[Scraped Embeddings API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /scrapers/:scraperName/urls
 * Get all URLs for a specific scraper from Redis
 *
 * Query params:
 * - redisDb: number (default: 3)
 */
router.get('/scrapers/:scraperName/urls', async (req: Request, res: Response) => {
  try {
    const { scraperName } = req.params;
    const redisDb = parseInt(req.query.redisDb as string) || 3;

    console.log(`[Scraped Embeddings API] Getting URLs for scraper: ${scraperName} from Redis DB ${redisDb}`);

    const urls = await scrapedEmbeddingsService.getCrawlerUrls(scraperName, redisDb);

    res.json({
      success: true,
      scraper: scraperName,
      count: urls.length,
      urls
    });
  } catch (error: any) {
    console.error('[Scraped Embeddings API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /scrapers/:scraperName/urls/:url/data
 * Get crawler data for a specific URL from Redis
 *
 * Query params:
 * - redisDb: number (default: 3)
 */
router.get('/scrapers/:scraperName/urls/:encodedUrl/data', async (req: Request, res: Response) => {
  try {
    const { scraperName, encodedUrl } = req.params;
    const url = decodeURIComponent(encodedUrl);
    const redisDb = parseInt(req.query.redisDb as string) || 3;

    console.log(`[Scraped Embeddings API] Getting data for URL: ${url}`);

    const data = await scrapedEmbeddingsService.getCrawlerData(scraperName, url, redisDb);

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'Data not found for URL'
      });
    }

    res.json({
      success: true,
      scraper: scraperName,
      url,
      data
    });
  } catch (error: any) {
    console.error('[Scraped Embeddings API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
