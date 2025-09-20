#!/usr/bin/env node

/**
 * Embedding Progress Cleanup Script
 *
 * This script cleans up inconsistent embedding progress data between:
 * - Redis cache
 * - Database progress table
 * - Actual embedding tables
 */

const { Redis } = require('ioredis');
const { Pool } = require('pg');
require('dotenv').config();

// Configuration
const config = {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    db: process.env.REDIS_DB || 2
  },
  database: {
    host: process.env.ASEMB_DB_HOST || '91.99.229.96',
    port: process.env.ASEMB_DB_PORT || 5432,
    database: process.env.ASEMB_DB_NAME || 'postgres',
    user: process.env.ASEMB_DB_USER || 'postgres',
    password: process.env.ASEMB_DB_PASSWORD
  }
};

class EmbeddingCleanup {
  constructor() {
    this.redis = new Redis(config.redis);
    this.pool = new Pool(config.database);

    this.progressKeys = [
      'embedding:progress',
      'embedding:status',
      'embedding:stats',
      'embedding:current:*',
      'embedding:batch:*'
    ];

    this.cleanupResults = {
      redisKeys: 0,
      dbRecords: 0,
      inconsistencies: 0,
      timestamp: new Date().toISOString()
    };
  }

  async log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
  }

  async cleanupRedis() {
    this.log('🧹 Starting Redis cleanup...');

    try {
      // Delete specific progress keys
      for (const pattern of this.progressKeys) {
        if (pattern.includes('*')) {
          // Handle wildcard patterns
          const keys = await this.redis.keys(pattern);
          if (keys.length > 0) {
            await this.redis.del(...keys);
            this.cleanupResults.redisKeys += keys.length;
            this.log(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
          }
        } else {
          // Handle exact keys
          const exists = await this.redis.exists(pattern);
          if (exists) {
            await this.redis.del(pattern);
            this.cleanupResults.redisKeys += 1;
            this.log(`Deleted key: ${pattern}`);
          }
        }
      }

      this.log(`✅ Redis cleanup completed. Deleted ${this.cleanupResults.redisKeys} keys`);
    } catch (error) {
      this.log(`❌ Redis cleanup failed: ${error.message}`, 'ERROR');
    }
  }

  async cleanupDatabase() {
    this.log('🗄️ Starting database cleanup...');

    try {
      // Clean up embedding_progress table
      const result = await this.pool.query(`
        DELETE FROM embedding_progress
        WHERE status IN ('completed', 'failed', 'cancelled')
        OR created_at < NOW() - INTERVAL '24 hours'
        RETURNING id
      `);

      this.cleanupResults.dbRecords = result.rowCount;
      this.log(`Deleted ${result.rowCount} old progress records`);

      // Reset any inconsistent progress
      await this.pool.query(`
        UPDATE embedding_progress
        SET status = 'pending',
            processed = 0,
            updated_at = NOW()
        WHERE status = 'processing'
        AND updated_at < NOW() - INTERVAL '1 hour'
      `);

      this.log('Reset stale processing records');
    } catch (error) {
      this.log(`❌ Database cleanup failed: ${error.message}`, 'ERROR');
    }
  }

  async checkConsistency() {
    this.log('🔍 Checking consistency between systems...');

    try {
      // Get actual embedding counts
      const embeddingResult = await this.pool.query(`
        SELECT source_table, COUNT(*) as actual_count
        FROM unified_embeddings
        GROUP BY source_table
      `);

      const actualCounts = {};
      embeddingResult.rows.forEach(row => {
        actualCounts[row.source_table] = parseInt(row.actual_count);
      });

      // Get progress table counts
      const progressResult = await this.pool.query(`
        SELECT table_name, processed as reported_count
        FROM embedding_progress
        WHERE status IN ('processing', 'completed')
      `);

      // Check for inconsistencies
      for (const row of progressResult.rows) {
        const tableName = row.table_name;
        const reported = parseInt(row.reported_count);
        const actual = actualCounts[tableName] || 0;

        if (reported !== actual) {
          this.cleanupResults.inconsistencies++;
          this.log(
            `Inconsistency found for ${tableName}: reported=${reported}, actual=${actual}`,
            'WARN'
          );
        }
      }

      this.log(`Found ${this.cleanupResults.inconsistencies} inconsistencies`);
    } catch (error) {
      this.log(`❌ Consistency check failed: ${error.message}`, 'ERROR');
    }
  }

  async generateReport() {
    this.log('\n📊 Cleanup Report');
    this.log('================');
    this.log(`Timestamp: ${this.cleanupResults.timestamp}`);
    this.log(`Redis keys deleted: ${this.cleanupResults.redisKeys}`);
    this.log(`DB records cleaned: ${this.cleanupResults.dbRecords}`);
    this.log(`Inconsistencies found: ${this.cleanupResults.inconsistencies}`);
    this.log('================\n');

    // Save report to database
    try {
      await this.pool.query(`
        INSERT INTO embedding_history (event_type, details, created_at)
        VALUES ('cleanup', $1, NOW())
      `, [JSON.stringify(this.cleanupResults)]);

      this.log('Report saved to database');
    } catch (error) {
      this.log(`Failed to save report: ${error.message}`, 'WARN');
    }
  }

  async run() {
    this.log('🚀 Starting embedding progress cleanup...');

    try {
      // Execute cleanup steps
      await this.cleanupRedis();
      await this.cleanupDatabase();
      await this.checkConsistency();
      await this.generateReport();

      this.log('✅ Cleanup completed successfully!');

      // Print summary
      console.log('\nSummary:');
      console.log('- Redis cache cleared');
      console.log('- Old progress records removed');
      console.log('- Stale processes reset');
      console.log('- Consistency check completed');

    } catch (error) {
      this.log(`❌ Cleanup failed: ${error.message}`, 'ERROR');
      process.exit(1);
    } finally {
      // Close connections
      await this.redis.quit();
      await this.pool.end();
    }
  }
}

// Execute if run directly
if (require.main === module) {
  const cleanup = new EmbeddingCleanup();
  cleanup.run().catch(console.error);
}

module.exports = EmbeddingCleanup;