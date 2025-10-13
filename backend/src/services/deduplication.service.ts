import { lsembPool } from '../config/database.config';
import crypto from 'crypto';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingId?: string;
  similarity?: number;
  reason?: 'exact_url_match' | 'content_hash_match' | 'similarity_threshold';
}

export interface ScrapedContent {
  url: string;
  title?: string;
  content?: string;
  description?: string;
  metadata?: any;
}

export class DeduplicationService {
  private static instance: DeduplicationService;

  static getInstance(): DeduplicationService {
    if (!DeduplicationService.instance) {
      DeduplicationService.instance = new DeduplicationService();
    }
    return DeduplicationService.instance;
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    // Normalize content: remove extra whitespace, lowercase
    const normalized = content
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    return crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex');
  }

  /**
   * Check if URL has been scraped before
   */
  async checkUrlDuplicate(url: string): Promise<DuplicateCheckResult> {
    const client = await lsembPool.connect();
    try {
      const result = await client.query(
        'SELECT id FROM scraped_pages WHERE url = $1 LIMIT 1',
        [url]
      );

      if (result.rows.length > 0) {
        return {
          isDuplicate: true,
          existingId: result.rows[0].id,
          reason: 'exact_url_match'
        };
      }

      return { isDuplicate: false };
    } finally {
      client.release();
    }
  }

  /**
   * Check for content duplicates using hash and similarity
   */
  async checkContentDuplicate(
    title?: string,
    content?: string,
    description?: string,
    threshold: number = 0.9
  ): Promise<DuplicateCheckResult> {
    if (!title && !content) {
      return { isDuplicate: false };
    }

    const client = await lsembPool.connect();
    try {
      // Generate hash for combined content
      const combinedContent = `${title || ''} ${description || ''}`;
      if (combinedContent.length > 50) {
        const contentHash = this.generateContentHash(combinedContent);

        // Check for exact hash match
        const hashResult = await client.query(
          `SELECT id, url FROM scraped_pages
           WHERE metadata->>'content_hash' = $1
           LIMIT 1`,
          [contentHash]
        );

        if (hashResult.rows.length > 0) {
          return {
            isDuplicate: true,
            existingId: hashResult.rows[0].id,
            reason: 'content_hash_match'
          };
        }
      }

      // Check for similarity based on title
      if (title && title.length > 20) {
        const similarityResult = await client.query(
          `SELECT id, url, title,
           CASE
             WHEN LOWER(title) = LOWER($1) THEN 1.0
             WHEN LOWER(title) LIKE '%' || LOWER($1) || '%' THEN 0.8
             ELSE 0.0
           END as similarity
           FROM scraped_pages
           WHERE title IS NOT NULL
           HAVING similarity >= $2
           LIMIT 1`,
          [title, threshold]
        );

        if (similarityResult.rows.length > 0) {
          return {
            isDuplicate: true,
            existingId: similarityResult.rows[0].id,
            similarity: similarityResult.rows[0].similarity,
            reason: 'similarity_threshold'
          };
        }
      }

      return { isDuplicate: false };
    } finally {
      client.release();
    }
  }

  /**
   * Comprehensive duplicate check before scraping
   */
  async checkDuplicate(
    url: string,
    title?: string,
    content?: string,
    description?: string
  ): Promise<DuplicateCheckResult> {
    // 1. Check exact URL match first
    const urlCheck = await this.checkUrlDuplicate(url);
    if (urlCheck.isDuplicate) {
      return urlCheck;
    }

    // 2. Check content similarity
    return this.checkContentDuplicate(title, content, description);
  }

  /**
   * Save scraped content with deduplication metadata
   */
  async saveScrapedContent(
    data: ScrapedContent,
    embeddings?: number[],
    jobId?: string
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const client = await lsembPool.connect();
    try {
      // Generate content hash
      const contentHash = data.content ?
        this.generateContentHash(data.content) : null;

      // Prepare metadata
      const metadata = {
        ...data.metadata,
        content_hash: contentHash,
        scraped_at: new Date().toISOString(),
        job_id: jobId
      };

      // Insert new record
      const result = await client.query(`
        INSERT INTO scraped_pages (
          url, title, content, description, metadata,
          scraped_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id
      `, [
        data.url,
        data.title || null,
        data.content || null,
        data.description || null,
        JSON.stringify(metadata)
      ]);

      const pageId = result.rows[0].id;

      // Save embeddings if provided
      if (embeddings && embeddings.length > 0) {
        await this.saveEmbeddings(pageId, data.content || '', embeddings);
      }

      return { success: true, id: pageId };
    } catch (error: any) {
      console.error('Error saving scraped content:', error);
      return {
        success: false,
        error: error.message || 'Database error'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Save embeddings with duplicate check
   */
  async saveEmbeddings(
    sourceId: string,
    content: string,
    embeddings: number[],
    sourceType: string = 'scraped_page'
  ): Promise<boolean> {
    const client = await lsembPool.connect();
    try {
      // Check for duplicate embeddings
      const embeddingStr = `[${embeddings.join(',')}]`;
      const duplicateCheck = await client.query(`
        SELECT id FROM embeddings
        WHERE source_id = $1 AND source_type = $2
        LIMIT 1
      `, [sourceId, sourceType]);

      if (duplicateCheck.rows.length > 0) {
        console.log(`Embeddings already exist for ${sourceType} ${sourceId}`);
        return true;
      }

      // Insert new embeddings
      await client.query(`
        INSERT INTO embeddings (
          source_type, source_id, content, embedding, metadata
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        sourceType,
        sourceId,
        content,
        embeddings, // Will be automatically converted to vector
        JSON.stringify({
          created_at: new Date().toISOString(),
          embedding_length: embeddings.length
        })
      ]);

      return true;
    } catch (error: any) {
      console.error('Error saving embeddings:', error);
      return false;
    } finally {
      client.release();
    }
  }

  /**
   * Get duplicate statistics
   */
  async getDuplicateStats(projectId?: string): Promise<{
    totalScraped: number;
    duplicatesPrevented: number;
    duplicatesByType: Record<string, number>;
  }> {
    const client = await lsembPool.connect();
    try {
      // Get total scraped
      const totalResult = await client.query(`
        SELECT COUNT(*) as total FROM scraped_pages
      `);

      // Get duplicates prevented (from activity log)
      const duplicatesResult = await client.query(`
        SELECT
          COUNT(*) as prevented,
          details->>'reason' as reason
        FROM activity_log
        WHERE operation_type = 'scrape'
        AND status = 'skipped'
        AND error_message LIKE '%duplicate%'
        GROUP BY details->>'reason'
      `);

      return {
        totalScraped: parseInt(totalResult.rows[0]?.total || '0'),
        duplicatesPrevented: duplicatesResult.rows.reduce(
          (sum, row) => sum + parseInt(row.prevented || '0'),
          0
        ),
        duplicatesByType: duplicatesResult.rows.reduce((acc, row) => {
          acc[row.reason || 'unknown'] = parseInt(row.prevented || '0');
          return acc;
        }, {} as Record<string, number>)
      };
    } finally {
      client.release();
    }
  }

  /**
   * Log duplicate prevention
   */
  async logDuplicatePrevention(
    url: string,
    reason: string,
    existingId?: string
  ): Promise<void> {
    const client = await lsembPool.connect();
    try {
      await client.query(`
        INSERT INTO activity_log (
          operation_type, source_url, status, details, error_message
        ) VALUES ($1, $2, 'skipped', $3, $4)
      `, [
        'scrape',
        url,
        JSON.stringify({
          reason: 'duplicate',
          type: reason,
          existing_id: existingId,
          timestamp: new Date().toISOString()
        }),
        `Duplicate content detected: ${reason}${existingId ? ` (ID: ${existingId})` : ''}`
      ]);
    } catch (error) {
      console.error('Error logging duplicate prevention:', error);
    } finally {
      client.release();
    }
  }
}

export const deduplicationService = DeduplicationService.getInstance();