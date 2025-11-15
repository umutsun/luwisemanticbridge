/**
 * PgAI-Enhanced Migration Service
 * Uses pgai for automatic embeddings and pgvectorscale for optimization
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

interface MigrationOptions {
  tableName: string;
  columns: string[];
  batchSize?: number;
  embeddingModel?: string;
  useParallel?: boolean;
  usePgAI?: boolean;
  usePgVectorScale?: boolean;
}

interface MigrationStats {
  totalRows: number;
  processedRows: number;
  skippedRows: number;
  errors: number;
  tokensUsed: number;
  estimatedCost: number;
  startTime: Date;
  endTime?: Date;
  averageSpeed?: number; // rows per second
}

export class PgAIMigrationService extends EventEmitter {
  private sourcePool: Pool;
  private targetPool: Pool;
  private stats: Map<string, MigrationStats> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(sourcePool: Pool, targetPool: Pool) {
    super();
    this.sourcePool = sourcePool;
    this.targetPool = targetPool;
  }

  /**
   * Check if pgai is installed and configured
   */
  async checkPgAIStatus(): Promise<{
    installed: boolean;
    configured: boolean;
    vectorizers: string[];
  }> {
    try {
      // Check if pgai extension is installed
      const extResult = await this.targetPool.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'pgai'
        ) as installed
      `);

      if (!extResult.rows[0].installed) {
        return {
          installed: false,
          configured: false,
          vectorizers: []
        };
      }

      // Check for vectorizers
      const vectorizerResult = await this.targetPool.query(`
        SELECT id, implementation, config
        FROM pgai.vectorizers
        WHERE active = true
      `);

      return {
        installed: true,
        configured: vectorizerResult.rows.length > 0,
        vectorizers: vectorizerResult.rows.map(r => r.id)
      };
    } catch (error) {
      logger.error('Error checking pgai status:', error);
      return {
        installed: false,
        configured: false,
        vectorizers: []
      };
    }
  }

  /**
   * Check if pgvectorscale is installed
   */
  async checkPgVectorScaleStatus(): Promise<boolean> {
    try {
      const result = await this.targetPool.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vectorscale'
        ) as installed
      `);
      return result.rows[0].installed;
    } catch {
      return false;
    }
  }

  /**
   * Create optimized index using pgvectorscale
   */
  async createOptimizedIndex(tableName: string, vectorColumn: string = 'embedding'): Promise<void> {
    const pgvectorscaleInstalled = await this.checkPgVectorScaleStatus();

    if (pgvectorscaleInstalled) {
      logger.info('Creating DiskANN index with pgvectorscale...');

      // Create DiskANN index for better performance
      await this.targetPool.query(`
        CREATE INDEX IF NOT EXISTS idx_${tableName}_${vectorColumn}_diskann
        ON ${tableName}
        USING diskann (${vectorColumn})
        WITH (num_neighbors = 50, search_list_size = 100);
      `);

      logger.info(' DiskANN index created for optimal performance');
    } else {
      // Fall back to regular ivfflat index
      logger.info('Creating standard ivfflat index...');

      await this.targetPool.query(`
        CREATE INDEX IF NOT EXISTS idx_${tableName}_${vectorColumn}_ivfflat
        ON ${tableName}
        USING ivfflat (${vectorColumn} vector_cosine_ops)
        WITH (lists = 100);
      `);
    }
  }

  /**
   * Migrate with pgai automatic embeddings
   */
  async migrateWithPgAI(
    migrationId: string,
    options: MigrationOptions
  ): Promise<MigrationStats> {
    const stats: MigrationStats = {
      totalRows: 0,
      processedRows: 0,
      skippedRows: 0,
      errors: 0,
      tokensUsed: 0,
      estimatedCost: 0,
      startTime: new Date()
    };

    this.stats.set(migrationId, stats);
    const abortController = new AbortController();
    this.abortControllers.set(migrationId, abortController);

    try {
      const pgaiStatus = await this.checkPgAIStatus();

      if (!pgaiStatus.installed) {
        throw new Error('pgai is not installed. Please install it first.');
      }

      if (!pgaiStatus.configured) {
        // Configure pgai with OpenAI
        logger.info('Configuring pgai vectorizer...');

        // Get OpenAI API key from settings
        const settingsResult = await this.targetPool.query(`
          SELECT value FROM settings WHERE key = 'openai.apiKey'
        `);

        if (settingsResult.rows.length === 0) {
          throw new Error('OpenAI API key not found in settings');
        }

        const apiKey = JSON.parse(settingsResult.rows[0].value).apiKey;

        // Create vectorizer
        await this.targetPool.query(`
          SELECT pgai.create_vectorizer(
            'openai_embeddings',
            'openai',
            '{
              "api_key": "${apiKey}",
              "model": "${options.embeddingModel || 'text-embedding-3-large'}",
              "dimensions": 3072
            }'::json
          );
        `);
      }

      // Create target table with pgai trigger
      await this.targetPool.query(`
        CREATE TABLE IF NOT EXISTS unified_embeddings_pgai (
          id SERIAL PRIMARY KEY,
          source_table VARCHAR(255),
          source_id VARCHAR(255),
          content TEXT,
          embedding vector(3072),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          tokens_used INTEGER DEFAULT 0
        );
      `);

      // Add pgai trigger for automatic embedding generation
      await this.targetPool.query(`
        CREATE OR REPLACE TRIGGER auto_embed_trigger
        AFTER INSERT OR UPDATE OF content ON unified_embeddings_pgai
        FOR EACH ROW
        EXECUTE FUNCTION pgai.embedding_trigger(
          vectorizer := 'openai_embeddings',
          source_column := 'content',
          target_column := 'embedding'
        );
      `);

      // Get total row count
      const countResult = await this.sourcePool.query(
        `SELECT COUNT(*) as total FROM ${options.tableName}`
      );
      stats.totalRows = parseInt(countResult.rows[0].total);

      this.emit('progress', {
        migrationId,
        status: 'processing',
        progress: 0,
        message: `Starting migration of ${stats.totalRows} rows with pgai...`
      });

      // Process in batches
      const batchSize = options.batchSize || 100;
      let offset = 0;

      while (offset < stats.totalRows && !abortController.signal.aborted) {
        // Get batch of data
        const batchResult = await this.sourcePool.query(`
          SELECT ${options.columns.join(', ')}
          FROM ${options.tableName}
          LIMIT ${batchSize}
          OFFSET ${offset}
        `);

        // Insert batch - pgai will automatically generate embeddings
        for (const row of batchResult.rows) {
          try {
            const content = options.columns
              .map(col => row[col])
              .filter(val => val)
              .join(' ');

            if (!content.trim()) {
              stats.skippedRows++;
              continue;
            }

            await this.targetPool.query(`
              INSERT INTO unified_embeddings_pgai (
                source_table, source_id, content, metadata
              ) VALUES ($1, $2, $3, $4)
              ON CONFLICT (source_table, source_id) DO UPDATE
              SET content = EXCLUDED.content,
                  updated_at = CURRENT_TIMESTAMP
            `, [
              options.tableName,
              row.id || offset + stats.processedRows,
              content,
              JSON.stringify(row)
            ]);

            stats.processedRows++;

            // Estimate tokens (rough calculation)
            stats.tokensUsed += Math.ceil(content.length / 4);
          } catch (error) {
            logger.error(`Error processing row: ${error}`);
            stats.errors++;
          }
        }

        offset += batchSize;

        const progress = Math.round((offset / stats.totalRows) * 100);
        this.emit('progress', {
          migrationId,
          status: 'processing',
          progress,
          processedRows: stats.processedRows,
          totalRows: stats.totalRows,
          errors: stats.errors,
          message: `Processing... ${stats.processedRows}/${stats.totalRows} rows`
        });
      }

      // Create optimized index
      if (options.usePgVectorScale) {
        await this.createOptimizedIndex('unified_embeddings_pgai', 'embedding');
      }

      stats.endTime = new Date();
      stats.averageSpeed = stats.processedRows /
        ((stats.endTime.getTime() - stats.startTime.getTime()) / 1000);

      // Estimate cost (OpenAI ada-002: $0.0001 per 1K tokens)
      stats.estimatedCost = (stats.tokensUsed / 1000) * 0.0001;

      this.emit('complete', {
        migrationId,
        stats,
        message: `Migration completed: ${stats.processedRows} rows processed`
      });

      return stats;

    } catch (error) {
      logger.error('Migration error:', error);
      this.emit('error', {
        migrationId,
        error: error.message,
        stats
      });
      throw error;
    } finally {
      this.abortControllers.delete(migrationId);
    }
  }

  /**
   * Migrate with parallel processing (without pgai)
   */
  async migrateWithParallel(
    migrationId: string,
    options: MigrationOptions
  ): Promise<MigrationStats> {
    const stats: MigrationStats = {
      totalRows: 0,
      processedRows: 0,
      skippedRows: 0,
      errors: 0,
      tokensUsed: 0,
      estimatedCost: 0,
      startTime: new Date()
    };

    // Use Python service for parallel embedding generation
    const pythonServiceUrl = 'http://localhost:8001/api/python/embeddings/batch';

    try {
      // Get total count
      const countResult = await this.sourcePool.query(
        `SELECT COUNT(*) as total FROM ${options.tableName}`
      );
      stats.totalRows = parseInt(countResult.rows[0].total);

      // Process in larger batches for parallel processing
      const batchSize = options.batchSize || 500;
      let offset = 0;

      while (offset < stats.totalRows) {
        const batchResult = await this.sourcePool.query(`
          SELECT ${options.columns.join(', ')}
          FROM ${options.tableName}
          LIMIT ${batchSize}
          OFFSET ${offset}
        `);

        // Prepare texts for batch embedding
        const texts = batchResult.rows.map(row =>
          options.columns
            .map(col => row[col])
            .filter(val => val)
            .join(' ')
        );

        // Call Python service for batch embeddings
        const response = await fetch(pythonServiceUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            texts,
            model: options.embeddingModel || 'text-embedding-3-large'
          })
        });

        if (!response.ok) {
          throw new Error(`Python service error: ${response.statusText}`);
        }

        const embeddings = await response.json();

        // Store embeddings in database
        for (let i = 0; i < batchResult.rows.length; i++) {
          const row = batchResult.rows[i];
          const embedding = embeddings.embeddings[i];

          await this.targetPool.query(`
            INSERT INTO unified_embeddings (
              source_table, source_id, content, embedding, metadata, tokens_used
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (source_table, source_id) DO UPDATE
            SET embedding = EXCLUDED.embedding,
                updated_at = CURRENT_TIMESTAMP
          `, [
            options.tableName,
            row.id || offset + i,
            texts[i],
            `[${embedding.join(',')}]`,
            JSON.stringify(row),
            Math.ceil(texts[i].length / 4)
          ]);

          stats.processedRows++;
          stats.tokensUsed += Math.ceil(texts[i].length / 4);
        }

        offset += batchSize;

        this.emit('progress', {
          migrationId,
          progress: Math.round((offset / stats.totalRows) * 100),
          processedRows: stats.processedRows,
          totalRows: stats.totalRows
        });
      }

      stats.endTime = new Date();
      stats.averageSpeed = stats.processedRows /
        ((stats.endTime.getTime() - stats.startTime.getTime()) / 1000);
      stats.estimatedCost = (stats.tokensUsed / 1000) * 0.0001;

      return stats;

    } catch (error) {
      logger.error('Parallel migration error:', error);
      throw error;
    }
  }

  /**
   * Stop a migration
   */
  async stopMigration(migrationId: string): Promise<void> {
    const controller = this.abortControllers.get(migrationId);
    if (controller) {
      controller.abort();
      this.emit('stopped', { migrationId });
    }
  }

  /**
   * Get migration statistics
   */
  getMigrationStats(migrationId: string): MigrationStats | undefined {
    return this.stats.get(migrationId);
  }

  /**
   * Get all migration statistics
   */
  getAllStats(): Map<string, MigrationStats> {
    return this.stats;
  }
}