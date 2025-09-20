#!/usr/bin/env node

/**
 * Embedding State Verification Script
 *
 * This script verifies the current state of embedding progress
 * and helps identify inconsistencies.
 */

const { Redis } = require('ioredis');
const { Pool } = require('pg');
require('dotenv').config();

class EmbeddingVerifier {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      db: process.env.REDIS_DB || 2
    });

    this.pool = new Pool({
      host: process.env.ASEMB_DB_HOST || '91.99.229.96',
      port: process.env.ASEMB_DB_PORT || 5432,
      database: process.env.ASEMB_DB_NAME || 'postgres',
      user: process.env.ASEMB_DB_USER || 'postgres',
      password: process.env.ASEMB_DB_PASSWORD
    });
  }

  async log(message, type = 'INFO') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
  }

  async checkRedisState() {
    this.log('🔍 Checking Redis state...');

    const redisState = {
      progressKeys: [],
      hasActiveProgress: false
    };

    // Check for progress keys
    const patterns = [
      'embedding:progress',
      'embedding:status',
      'embedding:*'
    ];

    for (const pattern of patterns) {
      const keys = await this.redis.keys(pattern);
      redisState.progressKeys.push(...keys);

      for (const key of keys) {
        try {
          const value = await this.redis.get(key);
          const parsed = JSON.parse(value);

          if (parsed.status === 'processing' || parsed.status === 'completed') {
            redisState.hasActiveProgress = true;
            this.log(`Active progress in Redis: ${key} = ${parsed.status}`, 'WARN');
          }

          this.log(`${key}: ${JSON.stringify(parsed, null, 2)}`, 'DEBUG');
        } catch (e) {
          this.log(`${key}: ${value}`, 'DEBUG');
        }
      }
    }

    return redisState;
  }

  async checkDatabaseState() {
    this.log('🔍 Checking database state...');

    const dbState = {
      totalEmbeddings: 0,
      embeddingsBySource: {},
      progressRecords: [],
      hasStaleProgress: false
    };

    // Check unified_embeddings
    try {
      const result = await this.pool.query(`
        SELECT
          source_table,
          COUNT(*) as count,
          MIN(created_at) as earliest,
          MAX(created_at) as latest
        FROM unified_embeddings
        GROUP BY source_table
        ORDER BY count DESC
      `);

      dbState.embeddingsBySource = {};
      let total = 0;

      result.rows.forEach(row => {
        const count = parseInt(row.count);
        dbState.embeddingsBySource[row.source_table] = {
          count: count,
          earliest: row.earliest,
          latest: row.latest
        };
        total += count;
      });

      dbState.totalEmbeddings = total;
      this.log(`Total embeddings in database: ${total}`);
    } catch (error) {
      this.log(`Error checking embeddings: ${error.message}`, 'ERROR');
    }

    // Check progress table
    try {
      const progressResult = await this.pool.query(`
        SELECT
          table_name,
          status,
          processed,
          total,
          created_at,
          updated_at,
          NOW() - updated_at as age
        FROM embedding_progress
        ORDER BY updated_at DESC
      `);

      dbState.progressRecords = progressResult.rows;

      // Check for stale progress
      const staleThreshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
      for (const record of progressResult.rows) {
        if (record.status === 'processing' && new Date(record.updated_at) < staleThreshold) {
          dbState.hasStaleProgress = true;
          this.log(
            `Stale progress found: ${record.table_name} (updated ${record.age} ago)`,
            'WARN'
          );
        }
      }
    } catch (error) {
      this.log(`Error checking progress table: ${error.message}`, 'ERROR');
    }

    return dbState;
  }

  async identifyIssues(redisState, dbState) {
    this.log('🔍 Identifying issues...');

    const issues = [];

    // Issue 1: Redis has progress but no embeddings
    if (redisState.hasActiveProgress && dbState.totalEmbeddings === 0) {
      issues.push({
        type: 'CRITICAL',
        message: 'Redis shows active progress but no embeddings in database'
      });
    }

    // Issue 2: Stale progress records
    if (dbState.hasStaleProgress) {
      issues.push({
        type: 'WARNING',
        message: 'Found stale progress records in database'
      });
    }

    // Issue 3: Progress in Redis but not in DB
    if (redisState.progressKeys.length > 0 && dbState.progressRecords.length === 0) {
      issues.push({
        type: 'WARNING',
        message: 'Redis has progress keys but database progress table is empty'
      });
    }

    // Report issues
    if (issues.length === 0) {
      this.log('✅ No issues found!');
    } else {
      this.log(`\n🚨 Found ${issues.length} issues:`);
      issues.forEach(issue => {
        this.log(`[${issue.type}] ${issue.message}`);
      });
    }

    return issues;
  }

  async generateRecommendations(issues, redisState, dbState) {
    this.log('\n💡 Recommendations:');

    const recommendations = [];

    if (issues.some(i => i.type === 'CRITICAL')) {
      recommendations.push('1. Run cleanup script: node scripts/cleanup-embedding-progress.js');
      recommendations.push('2. Restart embedding process from scratch');
    }

    if (redisState.progressKeys.length > 0) {
      recommendations.push('3. Clear Redis cache if inconsistencies persist');
    }

    if (dbState.hasStaleProgress) {
      recommendations.push('4. Reset stale progress records in database');
    }

    if (dbState.totalEmbeddings === 0) {
      recommendations.push('5. Check embedding service configuration');
      recommendations.push('6. Verify database connections');
    }

    recommendations.forEach(rec => this.log(`   ${rec}`));
  }

  async run() {
    this.log('🚀 Starting embedding state verification...');

    try {
      // Check current states
      const redisState = await this.checkRedisState();
      const dbState = await this.checkDatabaseState();

      // Identify issues
      const issues = await this.identifyIssues(redisState, dbState);

      // Generate recommendations
      await this.generateRecommendations(issues, redisState, dbState);

      this.log('\n✅ Verification completed!');

    } catch (error) {
      this.log(`❌ Verification failed: ${error.message}`, 'ERROR');
      process.exit(1);
    } finally {
      await this.redis.quit();
      await this.pool.end();
    }
  }
}

// Execute if run directly
if (require.main === module) {
  const verifier = new EmbeddingVerifier();
  verifier.run().catch(console.error);
}

module.exports = EmbeddingVerifier;