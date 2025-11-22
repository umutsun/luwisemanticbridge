/**
 * Embedding Migration Service
 * Phase 2: Safe data consolidation to unified_embeddings
 * Date: 2025-01-22
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface MigrationStats {
  tableName: string;
  totalRecords: number;
  migratedRecords: number;
  skippedRecords: number;
  errors: number;
}

export interface MigrationReport {
  started: Date;
  completed: Date;
  duration: number;
  stats: MigrationStats[];
  totalMigrated: number;
  totalSkipped: number;
  totalErrors: number;
  success: boolean;
  backupTable?: string;
}

export class EmbeddingMigrationService {
  private pool: Pool;
  private report: MigrationReport;

  constructor(pool: Pool) {
    this.pool = pool;
    this.report = {
      started: new Date(),
      completed: new Date(),
      duration: 0,
      stats: [],
      totalMigrated: 0,
      totalSkipped: 0,
      totalErrors: 0,
      success: false
    };
  }

  /**
   * Run full migration for all embedding tables
   */
  async runFullMigration(dryRun: boolean = true): Promise<MigrationReport> {
    logger.info(`Starting embedding migration (dryRun: ${dryRun})`);
    this.report.started = new Date();

    const client = await this.pool.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Create backup if not dry run
      if (!dryRun) {
        await this.createBackup(client);
      }

      // Migrate each table
      const tables = [
        'document_embeddings',
        'message_embeddings',
        'scrape_embeddings',
        'chunks'
      ];

      for (const table of tables) {
        const stats = await this.migrateTable(client, table, dryRun);
        this.report.stats.push(stats);
        this.report.totalMigrated += stats.migratedRecords;
        this.report.totalSkipped += stats.skippedRecords;
        this.report.totalErrors += stats.errors;
      }

      // Commit or rollback
      if (dryRun || this.report.totalErrors > 0) {
        await client.query('ROLLBACK');
        logger.info('Migration rolled back (dry run or errors)');
      } else {
        await client.query('COMMIT');
        logger.info('Migration committed successfully');
        this.report.success = true;
      }

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Migration failed:', error);
      throw error;
    } finally {
      client.release();
    }

    // Calculate duration
    this.report.completed = new Date();
    this.report.duration = this.report.completed.getTime() - this.report.started.getTime();

    return this.report;
  }

  /**
   * Create backup of unified_embeddings
   */
  private async createBackup(client: any): Promise<void> {
    const backupTable = `unified_embeddings_backup_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

    logger.info(`Creating backup table: ${backupTable}`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${backupTable} AS
      SELECT * FROM unified_embeddings
    `);

    this.report.backupTable = backupTable;
  }

  /**
   * Migrate a single table to unified_embeddings
   */
  private async migrateTable(
    client: any,
    tableName: string,
    dryRun: boolean
  ): Promise<MigrationStats> {
    logger.info(`Migrating table: ${tableName}`);

    const stats: MigrationStats = {
      tableName,
      totalRecords: 0,
      migratedRecords: 0,
      skippedRecords: 0,
      errors: 0
    };

    try {
      // Get total records
      const countResult = await client.query(`SELECT COUNT(*) FROM ${tableName}`);
      stats.totalRecords = parseInt(countResult.rows[0].count);

      // Build migration query based on table
      const migrationQuery = this.buildMigrationQuery(tableName);

      if (dryRun) {
        // In dry run, just count what would be migrated
        const dryQuery = migrationQuery.replace('INSERT INTO', '-- INSERT INTO')
          .replace(/SELECT[\s\S]*FROM/, 'SELECT COUNT(*) FROM');

        const result = await client.query(dryQuery);
        stats.migratedRecords = parseInt(result.rows[0].count || 0);
        stats.skippedRecords = stats.totalRecords - stats.migratedRecords;

      } else {
        // Execute actual migration
        const result = await client.query(migrationQuery);
        stats.migratedRecords = result.rowCount || 0;
        stats.skippedRecords = stats.totalRecords - stats.migratedRecords;
      }

      logger.info(`${tableName}: Migrated ${stats.migratedRecords}, Skipped ${stats.skippedRecords}`);

    } catch (error) {
      logger.error(`Error migrating ${tableName}:`, error);
      stats.errors++;
    }

    return stats;
  }

  /**
   * Build migration query for specific table
   */
  private buildMigrationQuery(tableName: string): string {
    switch (tableName) {
      case 'document_embeddings':
        return `
          INSERT INTO unified_embeddings (
            source_table, source_type, source_id, source_name,
            content, embedding, metadata,
            created_at, updated_at, tokens_used, model_used, embedding_provider
          )
          SELECT
            'documents' as source_table,
            COALESCE(d.file_type, 'document') as source_type,
            de.document_id::text as source_id,
            COALESCE(d.title, 'Document ' || de.document_id) as source_name,
            de.content,
            de.embedding,
            COALESCE(de.metadata, '{}'::jsonb) as metadata,
            de.created_at,
            COALESCE(de.updated_at, de.created_at) as updated_at,
            COALESCE(de.tokens_used, 0) as tokens_used,
            COALESCE(de.model_used, 'text-embedding-ada-002') as model_used,
            COALESCE(de.embedding_provider, 'openai') as embedding_provider
          FROM document_embeddings de
          LEFT JOIN documents d ON de.document_id = d.id
          WHERE NOT EXISTS (
            SELECT 1 FROM unified_embeddings ue
            WHERE ue.source_table = 'documents'
              AND ue.source_id = de.document_id::text
          )
        `;

      case 'message_embeddings':
        return `
          INSERT INTO unified_embeddings (
            source_table, source_type, source_id, source_name,
            content, embedding, metadata,
            created_at, updated_at, tokens_used, model_used, embedding_provider
          )
          SELECT
            'messages' as source_table,
            'message' as source_type,
            me.message_id::text as source_id,
            COALESCE(c.name, 'Message ' || me.message_id) as source_name,
            COALESCE(me.content, m.content, '') as content,
            me.embedding,
            COALESCE(
              me.metadata,
              jsonb_build_object(
                'conversation_id', me.conversation_id,
                'user_id', me.user_id
              )
            ) as metadata,
            me.created_at,
            COALESCE(me.updated_at, me.created_at) as updated_at,
            COALESCE(me.tokens_used, 0) as tokens_used,
            COALESCE(me.model_used, 'text-embedding-ada-002') as model_used,
            COALESCE(me.embedding_provider, 'openai') as embedding_provider
          FROM message_embeddings me
          LEFT JOIN messages m ON me.message_id = m.id
          LEFT JOIN conversations c ON m.conversation_id = c.id
          WHERE NOT EXISTS (
            SELECT 1 FROM unified_embeddings ue
            WHERE ue.source_table = 'messages'
              AND ue.source_id = me.message_id::text
          )
        `;

      case 'scrape_embeddings':
        return `
          INSERT INTO unified_embeddings (
            source_table, source_type, source_id, source_name,
            content, embedding, metadata,
            created_at, updated_at, tokens_used, model_used, embedding_provider
          )
          SELECT
            'scrapes' as source_table,
            'webpage' as source_type,
            se.url as source_id,
            COALESCE(se.title, se.url) as source_name,
            se.content,
            se.embedding,
            COALESCE(
              se.metadata,
              jsonb_build_object(
                'url', se.url,
                'title', se.title,
                'crawl_id', se.crawl_id
              )
            ) as metadata,
            se.created_at,
            COALESCE(se.updated_at, se.created_at) as updated_at,
            COALESCE(se.tokens_used, 0) as tokens_used,
            COALESCE(se.model_used, 'text-embedding-ada-002') as model_used,
            COALESCE(se.embedding_provider, 'openai') as embedding_provider
          FROM scrape_embeddings se
          WHERE NOT EXISTS (
            SELECT 1 FROM unified_embeddings ue
            WHERE ue.source_table = 'scrapes'
              AND ue.source_id = se.url
          )
        `;

      case 'chunks':
        return `
          INSERT INTO unified_embeddings (
            source_table, source_type, source_id, source_name,
            content, embedding, metadata,
            created_at, updated_at, tokens_used, model_used, embedding_provider
          )
          SELECT
            'chunks' as source_table,
            'chunk' as source_type,
            c.id::text as source_id,
            COALESCE(
              d.title || ' - Chunk ' || c.chunk_index,
              'Document ' || c.document_id || ' - Chunk ' || c.chunk_index
            ) as source_name,
            c.chunk_text as content,
            c.embedding,
            jsonb_build_object(
              'document_id', c.document_id,
              'chunk_index', c.chunk_index,
              'document_table', c.document_table,
              'original_metadata', c.metadata
            ) as metadata,
            c.created_at,
            COALESCE(c.updated_at, c.created_at) as updated_at,
            0 as tokens_used,
            'text-embedding-ada-002' as model_used,
            'openai' as embedding_provider
          FROM chunks c
          LEFT JOIN documents d ON c.document_id = d.id
          WHERE c.document_table = 'documents'
            AND c.embedding IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM unified_embeddings ue
              WHERE ue.source_table = 'chunks'
                AND ue.source_id = c.id::text
            )
        `;

      default:
        throw new Error(`Unknown table: ${tableName}`);
    }
  }

  /**
   * Get migration status without running migration
   */
  async getMigrationStatus(): Promise<any> {
    const result = await this.pool.query(`
      WITH status AS (
        SELECT
          'unified_embeddings' as table_name,
          COUNT(*) as count,
          COUNT(DISTINCT source_table) as source_tables,
          pg_size_pretty(pg_total_relation_size('unified_embeddings')) as size
        FROM unified_embeddings

        UNION ALL

        SELECT 'document_embeddings', COUNT(*), 1,
               pg_size_pretty(pg_total_relation_size('document_embeddings'))
        FROM document_embeddings

        UNION ALL

        SELECT 'message_embeddings', COUNT(*), 1,
               pg_size_pretty(pg_total_relation_size('message_embeddings'))
        FROM message_embeddings

        UNION ALL

        SELECT 'scrape_embeddings', COUNT(*), 1,
               pg_size_pretty(pg_total_relation_size('scrape_embeddings'))
        FROM scrape_embeddings

        UNION ALL

        SELECT 'chunks', COUNT(*), 1,
               pg_size_pretty(pg_total_relation_size('chunks'))
        FROM chunks
      )
      SELECT * FROM status
      ORDER BY table_name
    `);

    return {
      tables: result.rows,
      recommendation: this.getMigrationRecommendation(result.rows)
    };
  }

  /**
   * Get migration recommendation based on current state
   */
  private getMigrationRecommendation(tables: any[]): string {
    const unified = tables.find(t => t.table_name === 'unified_embeddings');
    const others = tables.filter(t => t.table_name !== 'unified_embeddings');

    const totalOthers = others.reduce((sum, t) => sum + parseInt(t.count), 0);

    if (totalOthers === 0) {
      return 'Migration complete! All data is in unified_embeddings.';
    }

    if (unified.count > totalOthers * 0.9) {
      return 'Migration mostly complete. Run migration to consolidate remaining records.';
    }

    return `Migration recommended: ${totalOthers} records in legacy tables can be consolidated.`;
  }

  /**
   * Create backward-compatible views
   */
  async createCompatibilityViews(): Promise<void> {
    logger.info('Creating backward compatibility views');

    await this.pool.query(`
      -- Document embeddings view
      CREATE OR REPLACE VIEW v_document_embeddings AS
      SELECT
        source_id::int as document_id,
        content,
        embedding,
        metadata,
        created_at,
        updated_at,
        tokens_used,
        model_used,
        embedding_provider
      FROM unified_embeddings
      WHERE source_table = 'documents';

      -- Message embeddings view
      CREATE OR REPLACE VIEW v_message_embeddings AS
      SELECT
        source_id::int as message_id,
        (metadata->>'conversation_id')::int as conversation_id,
        (metadata->>'user_id')::int as user_id,
        content,
        embedding,
        metadata,
        created_at,
        updated_at,
        tokens_used,
        model_used,
        embedding_provider
      FROM unified_embeddings
      WHERE source_table = 'messages';

      -- Scrape embeddings view
      CREATE OR REPLACE VIEW v_scrape_embeddings AS
      SELECT
        source_id as url,
        source_name as title,
        (metadata->>'crawl_id')::int as crawl_id,
        content,
        embedding,
        metadata,
        created_at,
        updated_at,
        tokens_used,
        model_used,
        embedding_provider
      FROM unified_embeddings
      WHERE source_table = 'scrapes';
    `);

    logger.info('Compatibility views created successfully');
  }
}

// Export singleton instance
let migrationService: EmbeddingMigrationService | null = null;

export function getMigrationService(pool: Pool): EmbeddingMigrationService {
  if (!migrationService) {
    migrationService = new EmbeddingMigrationService(pool);
  }
  return migrationService;
}