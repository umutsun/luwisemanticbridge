import { lsembPool } from '../server';
import { initializeRedis } from '../config/redis';
import { loggingService } from './logging.service';
import crypto from 'crypto';
import { performance } from 'perf_hooks';

export interface QualityMetrics {
  contentHash: string;
  titleSimilarity: number;
  contentSimilarity: number;
  urlPattern: string;
  publishDate?: string;
  lastSeen: string;
  frequency: number;
  qualityScore: number;
  isDuplicate: boolean;
  isNearDuplicate: boolean;
  freshness: 'fresh' | 'recent' | 'stale' | 'archived';
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  isNearDuplicate: boolean;
  similarity: number;
  originalUrl?: string;
  originalId?: string;
  reason: 'exact_match' | 'content_hash' | 'title_match' | 'content_similarity' | 'url_pattern' | 'none';
}

export interface ContentQualityResult {
  score: number; // 0-100
  issues: Array<{
    type: 'spam' | 'duplicate' | 'low_quality' | 'thin_content' | 'auto_generated';
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
  recommendations: string[];
  shouldBlock: boolean;
}

export class ScraperQualityService {
  private redis: any = null;
  private similarityThreshold = 0.85;
  private nearDuplicateThreshold = 0.70;
  private spamPatterns = new RegExp([
    /click here/gi,
    /buy now/gi,
    /limited time/gi,
    /act now/gi,
    /special offer/gi,
    /free trial/gi,
    /subscribe now/gi,
    /exclusive deal/gi
  ].join('|'), 'i');

  private lowQualityIndicators = [
    'page not found',
    'error 404',
    'access denied',
    'forbidden',
    'coming soon',
    'under construction',
    'no content available',
    'loading...',
    'please enable javascript'
  ];

  constructor() {
    this.initializeService();
  }

  private async initializeService() {
    try {
      this.redis = await initializeRedis();
      if (this.redis && this.redis.status === 'ready') {
        console.log(' Scraper Quality Service initialized with Redis');
      } else {
        console.warn('️ Redis not available, quality service in local mode');
      }
    } catch (error) {
      console.error(' Failed to initialize Scraper Quality Service:', error);
    }
  }

  // Check for duplicate content
  async checkDuplicate(url: string, title: string, content: string): Promise<DuplicateDetectionResult> {
    const startTime = performance.now();

    try {
      // Generate content hash
      const contentHash = this.generateContentHash(content);
      const titleHash = this.generateTitleHash(title);

      // Check exact content hash match
      const existingByHash = await this.findByContentHash(contentHash);
      if (existingByHash) {
        return {
          isDuplicate: true,
          isNearDuplicate: false,
          similarity: 1.0,
          originalUrl: existingByHash.url,
          originalId: existingByHash.id,
          reason: 'content_hash'
        };
      }

      // Check URL pattern duplicates
      const urlPattern = this.extractUrlPattern(url);
      const similarByUrl = await this.findByUrlPattern(urlPattern, url);
      if (similarByUrl && similarByUrl.length > 0) {
        return {
          isDuplicate: true,
          isNearDuplicate: false,
          similarity: 1.0,
          originalUrl: similarByUrl[0].url,
          originalId: similarByUrl[0].id,
          reason: 'url_pattern'
        };
      }

      // Check title similarity
      const similarByTitle = await this.findByTitleSimilarity(title, titleHash);
      if (similarByTitle && similarByTitle.similarity > this.similarityThreshold) {
        return {
          isDuplicate: true,
          isNearDuplicate: false,
          similarity: similarByTitle.similarity,
          originalUrl: similarByTitle.url,
          originalId: similarByTitle.id,
          reason: 'title_match'
        };
      }

      // Check content similarity for near duplicates
      const similarByContent = await this.findByContentSimilarity(content);
      if (similarByContent && similarByContent.similarity > this.nearDuplicateThreshold) {
        return {
          isDuplicate: false,
          isNearDuplicate: true,
          similarity: similarByContent.similarity,
          originalUrl: similarByContent.url,
          originalId: similarByContent.id,
          reason: 'content_similarity'
        };
      }

      // No duplicates found
      return {
        isDuplicate: false,
        isNearDuplicate: false,
        similarity: 0,
        reason: 'none'
      };

    } catch (error) {
      console.error('Duplicate check failed:', error);
      return {
        isDuplicate: false,
        isNearDuplicate: false,
        similarity: 0,
        reason: 'none'
      };
    } finally {
      const processingTime = performance.now() - startTime;
      console.log(` Duplicate check completed in ${processingTime.toFixed(2)}ms`);
    }
  }

  // Analyze content quality
  async analyzeQuality(url: string, title: string, content: string, metadata?: any): Promise<ContentQualityResult> {
    const issues: any[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check content length
    const contentLength = content.length;
    if (contentLength < 500) {
      issues.push({
        type: 'thin_content',
        severity: 'high',
        description: 'Content is too short'
      });
      score -= 30;
      recommendations.push('Content should be at least 500 characters');
    } else if (contentLength < 1000) {
      issues.push({
        type: 'thin_content',
        severity: 'medium',
        description: 'Content is relatively short'
      });
      score -= 15;
    }

    // Check for spam indicators
    const spamMatches = content.match(this.spamPatterns);
    if (spamMatches && spamMatches.length > 5) {
      issues.push({
        type: 'spam',
        severity: 'high',
        description: 'Content contains spam indicators'
      });
      score -= 40;
      recommendations.push('Remove spam-like marketing language');
    } else if (spamMatches && spamMatches.length > 2) {
      issues.push({
        type: 'spam',
        severity: 'medium',
        description: 'Content may contain spam indicators'
      });
      score -= 20;
    }

    // Check for low quality indicators
    const lowerContent = content.toLowerCase();
    const hasLowQualityIndicators = this.lowQualityIndicators.some(indicator =>
      lowerContent.includes(indicator.toLowerCase())
    );

    if (hasLowQualityIndicators) {
      issues.push({
        type: 'low_quality',
        severity: 'high',
        description: 'Content appears to be an error or placeholder page'
      });
      score -= 50;
      recommendations.push('Skip error and placeholder pages');
    }

    // Check title quality
    if (title.length < 10) {
      issues.push({
        type: 'low_quality',
        severity: 'medium',
        description: 'Title is too short'
      });
      score -= 10;
      recommendations.push('Use descriptive titles (10+ characters)');
    }

    // Check for auto-generated content
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length;

    if (avgSentenceLength > 100) {
      issues.push({
        type: 'auto_generated',
        severity: 'medium',
        description: 'Sentences are unusually long (possible auto-generated content)'
      });
      score -= 15;
      recommendations.push('Review for auto-generated content');
    }

    // Check for duplicate sentences
    const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()));
    if (uniqueSentences.size < sentences.length * 0.7) {
      issues.push({
        type: 'low_quality',
        severity: 'medium',
        description: 'Content contains repetitive sentences'
      });
      score -= 20;
      recommendations.push('Reduce repetitive content');
    }

    // Check keyword density
    const words = content.toLowerCase().split(/\s+/);
    const wordCount = words.length;
    const wordFreq = new Map<string, number>();

    words.forEach(word => {
      if (word.length > 3) {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
      }
    });

    const maxWordFreq = Math.max(...wordFreq.values());
    const maxDensity = (maxWordFreq / wordCount) * 100;

    if (maxDensity > 10) {
      issues.push({
        type: 'spam',
        severity: 'medium',
        description: 'Keyword density is too high'
      });
      score -= 15;
      recommendations.push('Reduce keyword stuffing');
    }

    // Ensure score doesn't go below 0
    score = Math.max(0, score);

    // Determine if content should be blocked
    const shouldBlock = score < 30 || issues.some(i => i.severity === 'high' && i.type === 'spam');

    if (!recommendations.length && score > 80) {
      recommendations.push('Content quality is good');
    }

    return {
      score,
      issues,
      recommendations,
      shouldBlock
    };
  }

  // Track content freshness
  async updateFreshness(url: string, publishDate?: string): Promise<string> {
    const now = new Date();
    let freshness: string;

    if (!publishDate) {
      // Use last seen time
      const lastSeen = await this.getLastSeen(url);
      const daysSinceLastSeen = lastSeen
        ? (now.getTime() - new Date(lastSeen).getTime()) / (1000 * 60 * 60 * 24)
        : 0;

      if (daysSinceLastSeen < 1) {
        freshness = 'fresh';
      } else if (daysSinceLastSeen < 7) {
        freshness = 'recent';
      } else if (daysSinceLastSeen < 30) {
        freshness = 'stale';
      } else {
        freshness = 'archived';
      }
    } else {
      // Use publish date
      const pubDate = new Date(publishDate);
      const daysSincePublish = (now.getTime() - pubDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSincePublish < 1) {
        freshness = 'fresh';
      } else if (daysSincePublish < 7) {
        freshness = 'recent';
      } else if (daysSincePublish < 30) {
        freshness = 'stale';
      } else {
        freshness = 'archived';
      }
    }

    // Update in database
    await this.updateContentMetadata(url, {
      lastSeen: now.toISOString(),
      freshness
    });

    // Update in cache
    if (this.redis) {
      await this.redis.hset('scraper:quality:freshness', url, JSON.stringify({
        freshness,
        lastSeen: now.toISOString(),
        publishDate
      }));
      await this.redis.expire(`scraper:quality:freshness:${url}`, 86400 * 30); // 30 days
    }

    return freshness;
  }

  // Get content metrics
  async getContentMetrics(url: string): Promise<QualityMetrics | null> {
    try {
      if (this.redis) {
        const cached = await this.redis.hget('scraper:quality:metrics', url);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Get from database
      const result = await lsembPool.query(`
        SELECT
          id,
          url,
          title,
          content_hash,
          publish_date,
          created_at,
          updated_at,
          llm_analysis->>'qualityScore' as llm_quality_score,
          (
            SELECT COUNT(*)
            FROM scrape_embeddings se2
            WHERE se2.url = scrape_embeddings.url
            AND se2.id != scrape_embeddings.id
          ) as duplicate_count
        FROM scrape_embeddings
        WHERE url = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [url]);

      if (result.rows.length === 0) return null;

      const row = result.rows[0];
      const freshness = await this.updateFreshness(url, row.publish_date);

      const metrics: QualityMetrics = {
        contentHash: row.content_hash,
        titleSimilarity: 0, // Would need comparison
        contentSimilarity: 0, // Would need comparison
        urlPattern: this.extractUrlPattern(url),
        publishDate: row.publish_date,
        lastSeen: row.updated_at,
        frequency: parseInt(row.duplicate_count) + 1,
        qualityScore: row.llm_quality_score || 0,
        isDuplicate: false, // Would need check
        isNearDuplicate: false, // Would need check
        freshness
      };

      // Cache metrics
      if (this.redis) {
        await this.redis.hset('scraper:quality:metrics', url, JSON.stringify(metrics));
        await this.redis.expire(`scraper:quality:metrics:${url}`, 3600); // 1 hour
      }

      return metrics;
    } catch (error) {
      console.error('Failed to get content metrics:', error);
      return null;
    }
  }

  // Find similar content for updates
  async findSimilarForUpdate(url: string, hours: number = 24): Promise<Array<{
    url: string;
    id: string;
    similarity: number;
    lastUpdated: string;
  }>> {
    try {
      const result = await lsembPool.query(`
        WITH target AS (
          SELECT content_hash, title, embedding
          FROM scrape_embeddings
          WHERE url = $1
          ORDER BY created_at DESC
          LIMIT 1
        )
        SELECT
          se.url,
          se.id,
          se.updated_at as last_updated,
          CASE
            WHEN se.content_hash = t.content_hash THEN 1.0
            WHEN se.title % t.title > 0.8 THEN 0.9
            ELSE (
              SELECT (se.embedding <=> t.embedding) as similarity
              ORDER BY similarity DESC
              LIMIT 1
            )
          END as similarity
        FROM scrape_embeddings se, target t
        WHERE se.url != $1
          AND se.updated_at > NOW() - INTERVAL '${hours} hours'
          AND (
            se.content_hash = t.content_hash
            OR se.title % t.title > 0.5
          )
        ORDER BY similarity DESC
        LIMIT 10
      `, [url]);

      return result.rows.map(row => ({
        url: row.url,
        id: row.id,
        similarity: 1 - parseFloat(row.similarity), // Convert distance to similarity
        lastUpdated: row.last_updated
      }));
    } catch (error) {
      console.error('Failed to find similar content:', error);
      return [];
    }
  }

  // Private helper methods
  private generateContentHash(content: string): string {
    // Normalize content (remove whitespace, lowercase)
    const normalized = content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();

    return crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex');
  }

  private generateTitleHash(title: string): string {
    const normalized = title
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();

    return crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex');
  }

  private extractUrlPattern(url: string): string {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p);

    // Remove numeric IDs and dates from path
    const cleanedParts = pathParts.map(part =>
      /^\d+$/.test(part) || /^\d{4}-\d{2}-\d{2}/.test(part) ? '{id}' : part
    );

    return `${urlObj.protocol}//${urlObj.hostname}/${cleanedParts.join('/')}`;
  }

  private async findByContentHash(hash: string): Promise<any> {
    try {
      const result = await lsembPool.query(
        'SELECT id, url, created_at FROM scrape_embeddings WHERE content_hash = $1 LIMIT 1',
        [hash]
      );
      return result.rows[0] || null;
    } catch (error) {
      console.error('Failed to find by content hash:', error);
      return null;
    }
  }

  private async findByUrlPattern(pattern: string, excludeUrl: string): Promise<any[]> {
    try {
      const result = await lsembPool.query(`
        SELECT id, url, created_at
        FROM scrape_embeddings
        WHERE url LIKE $1 AND url != $2
        ORDER BY created_at DESC
        LIMIT 5
      `, [`${pattern}%`, excludeUrl]);

      return result.rows;
    } catch (error) {
      console.error('Failed to find by URL pattern:', error);
      return [];
    }
  }

  private async findByTitleSimilarity(title: string, titleHash: string): Promise<any> {
    try {
      const result = await lsembPool.query(`
        SELECT id, url, title, similarity(title, $1) as similarity
        FROM scrape_embeddings
        WHERE title % $1
        ORDER BY similarity DESC
        LIMIT 1
      `, [title]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Failed to find by title similarity:', error);
      return null;
    }
  }

  private async findByContentSimilarity(content: string): Promise<any> {
    // This would require embedding the content and searching
    // For now, return null
    return null;
  }

  private async getLastSeen(url: string): Promise<string | null> {
    try {
      if (this.redis) {
        const cached = await this.redis.hget('scraper:quality:last_seen', url);
        if (cached) return cached;
      }

      const result = await lsembPool.query(
        'SELECT updated_at FROM scrape_embeddings WHERE url = $1 ORDER BY updated_at DESC LIMIT 1',
        [url]
      );

      return result.rows[0]?.updated_at || null;
    } catch (error) {
      console.error('Failed to get last seen:', error);
      return null;
    }
  }

  private async updateContentMetadata(url: string, metadata: any): Promise<void> {
    try {
      await lsembPool.query(`
        UPDATE scrape_embeddings
        SET
          metadata = metadata || $2::jsonb,
          updated_at = CURRENT_TIMESTAMP
        WHERE url = $1
      `, [url, JSON.stringify(metadata)]);
    } catch (error) {
      console.error('Failed to update content metadata:', error);
    }
  }

  // Public API methods
  async getQualityStats(days: number = 7): Promise<any> {
    try {
      const result = await lsembPool.query(`
        SELECT
          COUNT(*) as total_processed,
          COUNT(CASE WHEN (llm_analysis->>'qualityScore')::float > 0.7 THEN 1 END) as high_quality,
          COUNT(CASE WHEN (llm_analysis->>'qualityScore')::float BETWEEN 0.3 AND 0.7 THEN 1 END) as medium_quality,
          COUNT(CASE WHEN (llm_analysis->>'qualityScore')::float < 0.3 THEN 1 END) as low_quality,
          AVG((llm_analysis->>'qualityScore')::float) as avg_quality_score,
          COUNT(DISTINCT content_hash) as unique_content,
          COUNT(*) - COUNT(DISTINCT content_hash) as duplicates
        FROM scrape_embeddings
        WHERE created_at > NOW() - INTERVAL '${days} days'
      `);

      const stats = result.rows[0];

      return {
        ...stats,
        duplicateRate: stats.total_processed > 0
          ? (stats.duplicates / stats.total_processed) * 100
          : 0,
        uniquenessRate: stats.total_processed > 0
          ? (stats.unique_content / stats.total_processed) * 100
          : 0
      };
    } catch (error) {
      console.error('Failed to get quality stats:', error);
      return null;
    }
  }
}

export const scraperQualityService = new ScraperQualityService();
export default scraperQualityService;