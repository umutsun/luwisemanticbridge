/**
 * Scraped Embeddings Service
 *
 * Manages embeddings from web crawler data stored in Redis
 * - Reads crawler data from Redis (crawl4ai format)
 * - Transforms and normalizes Turkish characters
 * - Stores in scraped_embeddings table
 * - Supports batch processing
 */

import { createClient, RedisClientType } from 'redis';
import { lsembPool } from '../config/database.config';
import { normalizeTurkishChars } from '../utils/text-utils';
import { EmbeddingService } from './embedding.service';

export interface CrawlerData {
  url: string;
  title?: string;
  content: string;
  metadata?: Record<string, any>;
  crawled_at?: string;
}

export interface ScrapedEmbeddingOptions {
  scraperName: string;
  urls?: string[];          // Specific URLs to process
  generateEmbedding?: boolean; // Generate embeddings (default: false, user will do from UI)
  sourceTable?: string;     // Optional: link to source DB table
  redisDb?: number;         // Redis database number (default: 3)
}

export interface ScrapedEmbeddingResult {
  success: boolean;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  error?: string;
  urls?: string[];
}

class ScrapedEmbeddingsService {
  private embeddingService: EmbeddingService;
  private redis: RedisClientType | null = null;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Initialize Redis connection
   */
  private async getRedisClient(dbNumber: number = 3): Promise<RedisClientType> {
    if (this.redis && this.redis.isOpen) {
      // Check if we need to change database
      const currentDb = await this.redis.clientInfo().then(info => {
        const match = info.match(/db=(\d+)/);
        return match ? parseInt(match[1]) : 0;
      }).catch(() => dbNumber);

      if (currentDb === dbNumber) {
        return this.redis;
      }

      await this.redis.quit();
    }

    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST || '91.99.229.96',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      database: dbNumber
    };

    if (process.env.REDIS_PASSWORD) {
      (redisConfig as any).password = process.env.REDIS_PASSWORD;
    }

    this.redis = createClient(redisConfig);
    await this.redis.connect();
    console.log(`[ScrapedEmbeddings] Connected to Redis DB ${dbNumber}`);
    return this.redis;
  }

  /**
   * Get all URLs for a specific crawler from Redis
   */
  async getCrawlerUrls(scraperName: string, redisDb: number = 3): Promise<string[]> {
    try {
      const redis = await this.getRedisClient(redisDb);
      const pattern = `crawl4ai:${scraperName}:*`;

      const keys = await redis.keys(pattern);

      // Filter out _init keys and extract URLs
      const urls = keys
        .filter(key => !key.endsWith(':_init'))
        .map(key => key.replace(`crawl4ai:${scraperName}:`, ''));

      console.log(`[ScrapedEmbeddings] Found ${urls.length} URLs for crawler: ${scraperName}`);
      return urls;
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] Failed to get crawler URLs:`, error.message);
      return [];
    }
  }

  /**
   * Get crawler data from Redis
   */
  async getCrawlerData(
    scraperName: string,
    url: string,
    redisDb: number = 3
  ): Promise<CrawlerData | null> {
    try {
      const redis = await this.getRedisClient(redisDb);
      const key = `crawl4ai:${scraperName}:${url}`;

      const data = await redis.get(key);
      if (!data) {
        console.warn(`[ScrapedEmbeddings] No data found for key: ${key}`);
        return null;
      }

      const parsed = JSON.parse(data);

      // Handle different crawl4ai response formats
      let content = '';
      if (parsed.markdown) {
        content = parsed.markdown;
      } else if (parsed.content) {
        content = parsed.content;
      } else if (parsed.html) {
        content = parsed.html;
      }

      return {
        url,
        title: parsed.title || '',
        content: content || '',
        metadata: {
          ...parsed.metadata,
          links: parsed.links,
          media: parsed.media,
          crawled_at: parsed.crawled_at || new Date().toISOString()
        },
        crawled_at: parsed.crawled_at
      };
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] Failed to get crawler data for ${url}:`, error.message);
      return null;
    }
  }

  /**
   * Check if URL already exists in scraped_embeddings
   */
  private async urlExists(url: string): Promise<boolean> {
    const result = await lsembPool.query(
      'SELECT id FROM scraped_embeddings WHERE url = $1',
      [url]
    );
    return result.rows.length > 0;
  }

  /**
   * Insert or update scraped embedding
   */
  private async upsertEmbedding(
    scraperName: string,
    data: CrawlerData,
    embedding: number[] | null,
    modelName: string,
    tokensUsed: number,
    sourceTable?: string
  ): Promise<'inserted' | 'updated' | 'skipped'> {
    try {
      // Normalize Turkish characters in content
      const normalizedContent = normalizeTurkishChars(data.content);
      const normalizedTitle = data.title ? normalizeTurkishChars(data.title) : '';

      const metadata = {
        ...data.metadata,
        title: normalizedTitle,
        original_title: data.title,
        crawled_at: data.crawled_at
      };

      const query = `
        INSERT INTO scraped_embeddings (
          scraper_name,
          url,
          chunk_text,
          embedding,
          metadata,
          model_name,
          tokens_used,
          source_table,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (url) DO UPDATE SET
          chunk_text = EXCLUDED.chunk_text,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          model_name = EXCLUDED.model_name,
          tokens_used = EXCLUDED.tokens_used,
          source_table = EXCLUDED.source_table,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;

      const result = await lsembPool.query(query, [
        scraperName,
        data.url,
        normalizedContent,
        embedding ? `[${embedding.join(',')}]` : null,
        JSON.stringify(metadata),
        modelName,
        tokensUsed,
        sourceTable || null
      ]);

      return result.rows[0].inserted ? 'inserted' : 'updated';
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] Failed to upsert embedding for ${data.url}:`, error.message);
      return 'skipped';
    }
  }

  /**
   * Process crawler data into scraped_embeddings
   */
  async processScraperData(options: ScrapedEmbeddingOptions): Promise<ScrapedEmbeddingResult> {
    try {
      console.log(`[ScrapedEmbeddings] Processing scraper: ${options.scraperName}`);
      console.log(`[ScrapedEmbeddings] Generate embeddings: ${options.generateEmbedding || false}`);

      const redisDb = options.redisDb || 3;

      // Get URLs to process
      let urls: string[];
      if (options.urls && options.urls.length > 0) {
        urls = options.urls;
      } else {
        urls = await this.getCrawlerUrls(options.scraperName, redisDb);
      }

      if (urls.length === 0) {
        return {
          success: false,
          processed: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          error: 'No URLs found to process'
        };
      }

      console.log(`[ScrapedEmbeddings] Processing ${urls.length} URLs`);

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      const processedUrls: string[] = [];

      for (const url of urls) {
        try {
          // Get crawler data from Redis
          const crawlerData = await this.getCrawlerData(options.scraperName, url, redisDb);
          if (!crawlerData || !crawlerData.content) {
            console.warn(`[ScrapedEmbeddings] Skipping ${url} - no content`);
            skipped++;
            continue;
          }

          // Generate embedding if requested
          let embedding: number[] | null = null;
          let modelName = 'none';
          let tokensUsed = 0;

          if (options.generateEmbedding) {
            embedding = await this.embeddingService.generateEmbedding(crawlerData.content);
            if (embedding && embedding.length > 0) {
              modelName = 'text-embedding-3-small'; // From embedding service
              // Rough token estimation: ~4 chars per token
              tokensUsed = Math.ceil(crawlerData.content.length / 4);
            }
          }

          // Upsert into scraped_embeddings
          const result = await this.upsertEmbedding(
            options.scraperName,
            crawlerData,
            embedding,
            modelName,
            tokensUsed,
            options.sourceTable
          );

          if (result === 'inserted') {
            inserted++;
            processedUrls.push(url);
          } else if (result === 'updated') {
            updated++;
            processedUrls.push(url);
          } else {
            skipped++;
          }

          // Log progress every 10 items
          if ((inserted + updated + skipped) % 10 === 0) {
            console.log(`[ScrapedEmbeddings] Progress: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);
          }
        } catch (error: any) {
          console.error(`[ScrapedEmbeddings] Error processing ${url}:`, error.message);
          skipped++;
        }
      }

      console.log(`[ScrapedEmbeddings] ✓ Processing complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);

      return {
        success: true,
        processed: urls.length,
        inserted,
        updated,
        skipped,
        urls: processedUrls
      };
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] ✗ Processing failed:`, error.message);
      return {
        success: false,
        processed: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        error: error.message
      };
    }
  }

  /**
   * Get scraped embeddings by scraper name
   */
  async getEmbeddingsByScraperName(
    scraperName: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<any[]> {
    try {
      const result = await lsembPool.query(
        `SELECT
          id,
          scraper_name,
          url,
          chunk_text,
          metadata,
          created_at,
          updated_at,
          model_name,
          tokens_used,
          source_table,
          CASE WHEN embedding IS NOT NULL THEN true ELSE false END as has_embedding
        FROM scraped_embeddings
        WHERE scraper_name = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
        [scraperName, limit, offset]
      );

      return result.rows;
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] Failed to get embeddings:`, error.message);
      return [];
    }
  }

  /**
   * Get all unique scraper names
   */
  async getScraperNames(): Promise<string[]> {
    try {
      const result = await lsembPool.query(
        `SELECT DISTINCT scraper_name FROM scraped_embeddings ORDER BY scraper_name`
      );
      return result.rows.map(row => row.scraper_name);
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] Failed to get scraper names:`, error.message);
      return [];
    }
  }

  /**
   * Get statistics for a scraper
   */
  async getScraperStats(scraperName: string): Promise<any> {
    try {
      const result = await lsembPool.query(
        `SELECT
          COUNT(*) as total_entries,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
          COUNT(CASE WHEN embedding IS NULL THEN 1 END) as without_embeddings,
          SUM(tokens_used) as total_tokens,
          MIN(created_at) as first_entry,
          MAX(created_at) as last_entry
        FROM scraped_embeddings
        WHERE scraper_name = $1`,
        [scraperName]
      );

      return result.rows[0];
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] Failed to get stats:`, error.message);
      return null;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis && this.redis.isOpen) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}

export const scrapedEmbeddingsService = new ScrapedEmbeddingsService();
export default scrapedEmbeddingsService;
