/**
 * Experimental Cache Service
 * Redis-based cache for experimental PDF analysis results
 *
 * Purpose: During experimental phase, cache multiple template/prompt variations
 * for the same document. User can compare versions and pick the best one before
 * saving as template.
 */

import Redis from 'ioredis';

interface ExperimentalResult {
  documentId: string;
  version: string;  // v1, v2, v3, etc.
  template: string;
  metadata: any;    // Full grouped metadata { common: {...}, templateData: {...} }
  analysisSettings: {
    templateId?: string;
    focusKeywords?: string[];
    customPrompt?: string;
    llmProvider?: string;  // gemini, deepseek, claude
    timestamp: string;
  };
}

interface ComparisonResult {
  documentId: string;
  versions: Array<{
    version: string;
    template: string;
    llmProvider: string;
    timestamp: string;
    fieldCount: number;
    quality_score: number;
    metadata: any;
  }>;
}

class ExperimentalCacheService {
  private redis: Redis;
  private readonly CACHE_PREFIX = 'pdf:experimental';
  private readonly CACHE_TTL = 86400 * 7; // 7 days

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times: number) => {
        if (times > 3) {
          console.error('[Experimental Cache] Redis connection failed after 3 retries');
          return null;
        }
        return Math.min(times * 100, 3000);
      }
    });

    this.redis.on('error', (err) => {
      console.error('[Experimental Cache] Redis error:', err);
    });
  }

  /**
   * Save experimental result with version tag
   */
  async saveExperiment(
    documentId: string,
    version: string,
    template: string,
    metadata: any,
    analysisSettings: {
      templateId?: string;
      focusKeywords?: string[];
      customPrompt?: string;
      llmProvider?: string;
    }
  ): Promise<void> {
    const key = `${this.CACHE_PREFIX}:${documentId}:${version}`;

    const experimentData: ExperimentalResult = {
      documentId,
      version,
      template,
      metadata,
      analysisSettings: {
        ...analysisSettings,
        timestamp: new Date().toISOString()
      }
    };

    await this.redis.setex(key, this.CACHE_TTL, JSON.stringify(experimentData));

    // Also add to version list for this document
    const versionsKey = `${this.CACHE_PREFIX}:${documentId}:versions`;
    await this.redis.sadd(versionsKey, version);
    await this.redis.expire(versionsKey, this.CACHE_TTL);

    console.log(`[Experimental Cache] Saved ${documentId} version ${version} (template: ${template})`);
  }

  /**
   * Get specific experiment version
   */
  async getExperiment(documentId: string, version: string): Promise<ExperimentalResult | null> {
    const key = `${this.CACHE_PREFIX}:${documentId}:${version}`;
    const data = await this.redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  /**
   * Get all experiment versions for a document (for comparison)
   */
  async getAllVersions(documentId: string): Promise<ComparisonResult> {
    const versionsKey = `${this.CACHE_PREFIX}:${documentId}:versions`;
    const versions = await this.redis.smembers(versionsKey);

    if (versions.length === 0) {
      return {
        documentId,
        versions: []
      };
    }

    const versionData = await Promise.all(
      versions.map(async (version) => {
        const experiment = await this.getExperiment(documentId, version);
        if (!experiment) return null;

        // Calculate field count
        const templateFields = experiment.metadata?.templateData?.fields || {};
        const fieldCount = Object.keys(templateFields).length;

        return {
          version: experiment.version,
          template: experiment.template,
          llmProvider: experiment.analysisSettings.llmProvider || 'unknown',
          timestamp: experiment.analysisSettings.timestamp,
          fieldCount,
          quality_score: experiment.metadata?.common?.dataQuality?.score || 0,
          metadata: experiment.metadata
        };
      })
    );

    return {
      documentId,
      versions: versionData.filter(v => v !== null) as any[]
    };
  }

  /**
   * Delete specific version
   */
  async deleteVersion(documentId: string, version: string): Promise<void> {
    const key = `${this.CACHE_PREFIX}:${documentId}:${version}`;
    await this.redis.del(key);

    // Remove from version list
    const versionsKey = `${this.CACHE_PREFIX}:${documentId}:versions`;
    await this.redis.srem(versionsKey, version);

    console.log(`[Experimental Cache] Deleted ${documentId} version ${version}`);
  }

  /**
   * Clear all experiments for a document
   */
  async clearDocument(documentId: string): Promise<void> {
    const versionsKey = `${this.CACHE_PREFIX}:${documentId}:versions`;
    const versions = await this.redis.smembers(versionsKey);

    // Delete all version keys
    const keys = versions.map(v => `${this.CACHE_PREFIX}:${documentId}:${v}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    // Delete versions set
    await this.redis.del(versionsKey);

    console.log(`[Experimental Cache] Cleared all experiments for ${documentId}`);
  }

  /**
   * Get next version number for a document
   */
  async getNextVersion(documentId: string): Promise<string> {
    const versionsKey = `${this.CACHE_PREFIX}:${documentId}:versions`;
    const versions = await this.redis.smembers(versionsKey);

    if (versions.length === 0) {
      return 'v1';
    }

    // Extract version numbers (v1 -> 1, v2 -> 2, etc.)
    const versionNumbers = versions
      .map(v => parseInt(v.replace('v', '')))
      .filter(n => !isNaN(n));

    const maxVersion = Math.max(...versionNumbers, 0);
    return `v${maxVersion + 1}`;
  }

  /**
   * Compare two versions side-by-side
   */
  async compareVersions(
    documentId: string,
    version1: string,
    version2: string
  ): Promise<{
    version1: ExperimentalResult | null;
    version2: ExperimentalResult | null;
    differences: {
      fieldDiffs: string[];
      qualityScoreDiff: number;
      templateDiff: boolean;
    };
  }> {
    const exp1 = await this.getExperiment(documentId, version1);
    const exp2 = await this.getExperiment(documentId, version2);

    if (!exp1 || !exp2) {
      return {
        version1: exp1,
        version2: exp2,
        differences: {
          fieldDiffs: [],
          qualityScoreDiff: 0,
          templateDiff: false
        }
      };
    }

    // Find field differences
    const fields1 = Object.keys(exp1.metadata?.templateData?.fields || {});
    const fields2 = Object.keys(exp2.metadata?.templateData?.fields || {});
    const fieldDiffs = fields1.filter(f => !fields2.includes(f))
      .concat(fields2.filter(f => !fields1.includes(f)));

    // Quality score difference
    const score1 = exp1.metadata?.common?.dataQuality?.score || 0;
    const score2 = exp2.metadata?.common?.dataQuality?.score || 0;
    const qualityScoreDiff = score2 - score1;

    // Template difference
    const templateDiff = exp1.template !== exp2.template;

    return {
      version1: exp1,
      version2: exp2,
      differences: {
        fieldDiffs,
        qualityScoreDiff,
        templateDiff
      }
    };
  }

  /**
   * Check if Redis is connected
   */
  async isConnected(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Singleton instance
let instance: ExperimentalCacheService | null = null;

export function getExperimentalCache(): ExperimentalCacheService {
  if (!instance) {
    instance = new ExperimentalCacheService();
  }
  return instance;
}

export default ExperimentalCacheService;
