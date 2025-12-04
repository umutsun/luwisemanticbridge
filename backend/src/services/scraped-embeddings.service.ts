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
import { v4 as uuidv4 } from 'uuid';

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
  private progressRedis: RedisClientType | null = null;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Get Redis client for progress tracking
   */
  private async getProgressRedis(): Promise<RedisClientType> {
    if (this.progressRedis && this.progressRedis.isOpen) {
      return this.progressRedis;
    }

    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      database: 0 // Progress tracking uses DB 0
    };

    if (process.env.REDIS_PASSWORD) {
      (redisConfig as any).password = process.env.REDIS_PASSWORD;
    }

    this.progressRedis = createClient(redisConfig);
    await this.progressRedis.connect();
    return this.progressRedis;
  }

  /**
   * Update progress in Redis
   */
  private async updateProgress(jobId: string, progress: {
    status: 'TRANSFORMING' | 'EMBEDDING' | 'COMPLETED' | 'FAILED';
    stage: string;
    processed: number;
    total: number;
    succeeded?: number;
    failed?: number;
    modelName?: string;
    currentItem?: { id: number; url: string };
    startedAt?: string;
    completedAt?: string;
    error?: string;
  }): Promise<void> {
    try {
      const redis = await this.getProgressRedis();
      const key = `scraped_embeddings_progress:${jobId}`;
      await redis.setex(key, 3600, JSON.stringify(progress)); // 1 hour TTL
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] Failed to update progress:`, error.message);
    }
  }

  /**
   * Initialize Redis connection
   */
  private async getRedisClient(dbNumber: number = 3): Promise<RedisClientType> {
    // Always create fresh connection for new database
    if (this.redis && this.redis.isOpen) {
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
   * Generate embeddings for existing entries
   */
  async generateEmbeddingsForEntries(options: {
    scraperName?: string;
    ids?: number[];
    onlyMissing?: boolean;
  }): Promise<{
    success: boolean;
    jobId: string;
    processed: number;
    succeeded: number;
    failed: number;
    error?: string;
  }> {
    const jobId = uuidv4();
    const startedAt = new Date().toISOString();
    const modelName = 'text-embedding-3-small';

    try {
      let query = 'SELECT id, chunk_text, url FROM scraped_embeddings WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (options.scraperName) {
        query += ` AND scraper_name = $${paramIndex++}`;
        params.push(options.scraperName);
      }

      if (options.ids && options.ids.length > 0) {
        query += ` AND id = ANY($${paramIndex++})`;
        params.push(options.ids);
      }

      if (options.onlyMissing !== false) {
        query += ' AND embedding IS NULL';
      }

      const result = await lsembPool.query(query, params);
      const entries = result.rows;
      const total = entries.length;

      console.log(`[ScrapedEmbeddings] Job ${jobId}: Generating embeddings for ${total} entries`);

      // Initial progress
      await this.updateProgress(jobId, {
        status: 'EMBEDDING',
        stage: 'Starting embedding generation...',
        processed: 0,
        total,
        succeeded: 0,
        failed: 0,
        modelName,
        startedAt
      });

      let succeeded = 0;
      let failed = 0;

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];

        try {
          // Update progress with current item
          await this.updateProgress(jobId, {
            status: 'EMBEDDING',
            stage: `Embedding entry ${i + 1} of ${total}`,
            processed: i,
            total,
            succeeded,
            failed,
            modelName,
            currentItem: { id: entry.id, url: entry.url },
            startedAt
          });

          // Generate embedding
          const embedding = await this.embeddingService.generateEmbedding(entry.chunk_text);

          if (embedding && embedding.length > 0) {
            // Update entry with embedding
            const tokensUsed = Math.ceil(entry.chunk_text.length / 4);
            await lsembPool.query(
              `UPDATE scraped_embeddings
               SET embedding = $1,
                   model_name = $2,
                   tokens_used = $3,
                   updated_at = NOW()
               WHERE id = $4`,
              [`[${embedding.join(',')}]`, modelName, tokensUsed, entry.id]
            );

            succeeded++;
            console.log(`[ScrapedEmbeddings] Job ${jobId}: ✓ Generated embedding for ID ${entry.id} (${succeeded}/${total})`);
          } else {
            failed++;
            console.warn(`[ScrapedEmbeddings] Job ${jobId}: ✗ Failed to generate embedding for ID ${entry.id}: empty result`);
          }
        } catch (error: any) {
          failed++;
          console.error(`[ScrapedEmbeddings] Job ${jobId}: ✗ Error generating embedding for ID ${entry.id}:`, error.message);
        }
      }

      // Final progress
      const completedAt = new Date().toISOString();
      await this.updateProgress(jobId, {
        status: 'COMPLETED',
        stage: 'Embedding generation complete',
        processed: total,
        total,
        succeeded,
        failed,
        modelName,
        startedAt,
        completedAt
      });

      console.log(`[ScrapedEmbeddings] Job ${jobId}: ✓ Complete: ${succeeded} succeeded, ${failed} failed`);

      return {
        success: true,
        jobId,
        processed: total,
        succeeded,
        failed
      };
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] Job ${jobId}: ✗ Failed:`, error.message);

      // Update progress with error
      await this.updateProgress(jobId, {
        status: 'FAILED',
        stage: 'Embedding generation failed',
        processed: 0,
        total: 0,
        modelName,
        startedAt,
        completedAt: new Date().toISOString(),
        error: error.message
      });

      return {
        success: false,
        jobId,
        processed: 0,
        succeeded: 0,
        failed: 0,
        error: error.message
      };
    }
  }

  /**
   * Delete all embeddings for a scraper
   */
  async deleteScraperEmbeddings(scraperName: string): Promise<{
    success: boolean;
    deleted: number;
    error?: string;
  }> {
    try {
      const result = await lsembPool.query(
        'DELETE FROM scraped_embeddings WHERE scraper_name = $1',
        [scraperName]
      );

      console.log(`[ScrapedEmbeddings] ✓ Deleted ${result.rowCount || 0} entries for scraper: ${scraperName}`);

      return {
        success: true,
        deleted: result.rowCount || 0
      };
    } catch (error: any) {
      console.error(`[ScrapedEmbeddings] ✗ Failed to delete embeddings:`, error.message);
      return {
        success: false,
        deleted: 0,
        error: error.message
      };
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
