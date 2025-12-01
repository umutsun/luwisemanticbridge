/**
 * Unified Embeddings Sync Service
 *
 * Syncs embeddings from document_embeddings and scrape_embeddings to unified_embeddings
 * This enables unified semantic search across all data sources
 */

import { lsembPool } from '../config/database.config';

export interface SyncResult {
  synced: number;
  skipped: number;
  errors: string[];
}

export class UnifiedEmbeddingsSyncService {

  /**
   * Sync a single document embedding to unified_embeddings
   */
  async syncDocumentEmbedding(embeddingId: number): Promise<boolean> {
    try {
      await lsembPool.query(`
        INSERT INTO unified_embeddings (
          source_table, source_id, content, embedding, metadata, created_at
        )
        SELECT
          'document_embeddings' as source_table,
          de.id as source_id,
          de.chunk_text as content,
          de.embedding,
          jsonb_build_object(
            'document_id', de.document_id,
            'model_name', de.model_name,
            'tokens_used', de.tokens_used,
            'document_title', d.title,
            'document_type', d.file_type,
            'chunk_metadata', de.metadata
          ) as metadata,
          de.created_at
        FROM document_embeddings de
        LEFT JOIN documents d ON de.document_id = d.id
        WHERE de.id = $1
        ON CONFLICT (source_table, source_id)
        DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP
      `, [embeddingId]);

      console.log(`[UnifiedSync] Synced document embedding ${embeddingId}`);
      return true;
    } catch (error: any) {
      console.error(`[UnifiedSync] Failed to sync document embedding ${embeddingId}:`, error.message);
      return false;
    }
  }

  /**
   * Sync all document embeddings for a specific document
   */
  async syncDocumentEmbeddings(documentId: number): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

    try {
      // Get all embeddings for this document
      const embeddings = await lsembPool.query(
        'SELECT id FROM document_embeddings WHERE document_id = $1',
        [documentId]
      );

      for (const row of embeddings.rows) {
        const success = await this.syncDocumentEmbedding(row.id);
        if (success) {
          result.synced++;
        } else {
          result.errors.push(`Failed to sync embedding ${row.id}`);
        }
      }

      console.log(`[UnifiedSync] Document ${documentId}: synced ${result.synced} embeddings`);
    } catch (error: any) {
      result.errors.push(error.message);
      console.error(`[UnifiedSync] Error syncing document ${documentId}:`, error.message);
    }

    return result;
  }

  /**
   * Sync a single scrape embedding to unified_embeddings
   */
  async syncScrapeEmbedding(embeddingId: string): Promise<boolean> {
    try {
      await lsembPool.query(`
        INSERT INTO unified_embeddings (
          source_table, source_id, content, embedding, metadata, created_at
        )
        SELECT
          'scrape_embeddings' as source_table,
          se.id::text as source_id,
          se.content,
          se.embedding,
          jsonb_build_object(
            'source_url', se.source_url,
            'title', se.title,
            'category', se.category,
            'project_id', se.project_id,
            'site_id', se.site_id,
            'chunk_index', se.chunk_index,
            'total_chunks', se.total_chunks,
            'scrape_metadata', se.metadata
          ) as metadata,
          se.created_at
        FROM scrape_embeddings se
        WHERE se.id = $1
        ON CONFLICT (source_table, source_id)
        DO UPDATE SET
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          metadata = EXCLUDED.metadata,
          updated_at = CURRENT_TIMESTAMP
      `, [embeddingId]);

      console.log(`[UnifiedSync] Synced scrape embedding ${embeddingId}`);
      return true;
    } catch (error: any) {
      console.error(`[UnifiedSync] Failed to sync scrape embedding ${embeddingId}:`, error.message);
      return false;
    }
  }

  /**
   * Sync all scrape embeddings for a specific URL
   */
  async syncScrapeEmbeddingsByUrl(sourceUrl: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

    try {
      const embeddings = await lsembPool.query(
        'SELECT id FROM scrape_embeddings WHERE source_url = $1',
        [sourceUrl]
      );

      for (const row of embeddings.rows) {
        const success = await this.syncScrapeEmbedding(row.id);
        if (success) {
          result.synced++;
        } else {
          result.errors.push(`Failed to sync embedding ${row.id}`);
        }
      }

      console.log(`[UnifiedSync] URL ${sourceUrl}: synced ${result.synced} embeddings`);
    } catch (error: any) {
      result.errors.push(error.message);
      console.error(`[UnifiedSync] Error syncing URL ${sourceUrl}:`, error.message);
    }

    return result;
  }

  /**
   * Sync all scrape embeddings for a project
   */
  async syncScrapeEmbeddingsByProject(projectId: string): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

    try {
      const embeddings = await lsembPool.query(
        'SELECT id FROM scrape_embeddings WHERE project_id = $1',
        [projectId]
      );

      for (const row of embeddings.rows) {
        const success = await this.syncScrapeEmbedding(row.id);
        if (success) {
          result.synced++;
        } else {
          result.errors.push(`Failed to sync embedding ${row.id}`);
        }
      }

      console.log(`[UnifiedSync] Project ${projectId}: synced ${result.synced} embeddings`);
    } catch (error: any) {
      result.errors.push(error.message);
      console.error(`[UnifiedSync] Error syncing project ${projectId}:`, error.message);
    }

    return result;
  }

  /**
   * Bulk sync all unsynced document embeddings
   */
  async syncAllDocumentEmbeddings(): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

    try {
      // Find document embeddings not in unified_embeddings
      const unsynced = await lsembPool.query(`
        SELECT de.id
        FROM document_embeddings de
        LEFT JOIN unified_embeddings ue ON ue.source_table = 'document_embeddings' AND ue.source_id = de.id::text
        WHERE ue.id IS NULL
      `);

      console.log(`[UnifiedSync] Found ${unsynced.rows.length} unsynced document embeddings`);

      for (const row of unsynced.rows) {
        const success = await this.syncDocumentEmbedding(row.id);
        if (success) {
          result.synced++;
        } else {
          result.errors.push(`Failed to sync embedding ${row.id}`);
        }
      }

      console.log(`[UnifiedSync] Bulk sync completed: ${result.synced} synced, ${result.errors.length} errors`);
    } catch (error: any) {
      result.errors.push(error.message);
      console.error('[UnifiedSync] Bulk sync error:', error.message);
    }

    return result;
  }

  /**
   * Bulk sync all unsynced scrape embeddings
   */
  async syncAllScrapeEmbeddings(): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, skipped: 0, errors: [] };

    try {
      // Find scrape embeddings not in unified_embeddings
      const unsynced = await lsembPool.query(`
        SELECT se.id
        FROM scrape_embeddings se
        LEFT JOIN unified_embeddings ue ON ue.source_table = 'scrape_embeddings' AND ue.source_id = se.id::text
        WHERE ue.id IS NULL
      `);

      console.log(`[UnifiedSync] Found ${unsynced.rows.length} unsynced scrape embeddings`);

      for (const row of unsynced.rows) {
        const success = await this.syncScrapeEmbedding(row.id);
        if (success) {
          result.synced++;
        } else {
          result.errors.push(`Failed to sync embedding ${row.id}`);
        }
      }

      console.log(`[UnifiedSync] Bulk sync completed: ${result.synced} synced, ${result.errors.length} errors`);
    } catch (error: any) {
      result.errors.push(error.message);
      console.error('[UnifiedSync] Bulk sync error:', error.message);
    }

    return result;
  }

  /**
   * Get sync statistics
   */
  async getStats(): Promise<{
    document_embeddings: { total: number; synced: number; unsynced: number };
    scrape_embeddings: { total: number; synced: number; unsynced: number };
    unified_embeddings: { total: number; by_source: Record<string, number> };
  }> {
    try {
      // Document embeddings stats
      const docTotal = await lsembPool.query('SELECT COUNT(*) as count FROM document_embeddings');
      const docSynced = await lsembPool.query(`
        SELECT COUNT(*) as count FROM unified_embeddings WHERE source_table = 'document_embeddings'
      `);

      // Scrape embeddings stats
      const scrapeTotal = await lsembPool.query('SELECT COUNT(*) as count FROM scrape_embeddings');
      const scrapeSynced = await lsembPool.query(`
        SELECT COUNT(*) as count FROM unified_embeddings WHERE source_table = 'scrape_embeddings'
      `);

      // Unified embeddings stats
      const unifiedTotal = await lsembPool.query('SELECT COUNT(*) as count FROM unified_embeddings');
      const bySource = await lsembPool.query(`
        SELECT source_table, COUNT(*) as count FROM unified_embeddings GROUP BY source_table
      `);

      const sourceMap: Record<string, number> = {};
      bySource.rows.forEach(row => {
        sourceMap[row.source_table] = parseInt(row.count);
      });

      return {
        document_embeddings: {
          total: parseInt(docTotal.rows[0].count),
          synced: parseInt(docSynced.rows[0].count),
          unsynced: parseInt(docTotal.rows[0].count) - parseInt(docSynced.rows[0].count)
        },
        scrape_embeddings: {
          total: parseInt(scrapeTotal.rows[0].count),
          synced: parseInt(scrapeSynced.rows[0].count),
          unsynced: parseInt(scrapeTotal.rows[0].count) - parseInt(scrapeSynced.rows[0].count)
        },
        unified_embeddings: {
          total: parseInt(unifiedTotal.rows[0].count),
          by_source: sourceMap
        }
      };
    } catch (error: any) {
      console.error('[UnifiedSync] Error getting stats:', error.message);
      return {
        document_embeddings: { total: 0, synced: 0, unsynced: 0 },
        scrape_embeddings: { total: 0, synced: 0, unsynced: 0 },
        unified_embeddings: { total: 0, by_source: {} }
      };
    }
  }

  /**
   * Remove unified embeddings for deleted source records
   */
  async cleanupOrphanedEmbeddings(): Promise<{ removed: number }> {
    try {
      // Remove document embeddings that no longer exist
      const docResult = await lsembPool.query(`
        DELETE FROM unified_embeddings ue
        WHERE ue.source_table = 'document_embeddings'
        AND NOT EXISTS (
          SELECT 1 FROM document_embeddings de WHERE de.id::text = ue.source_id
        )
      `);

      // Remove scrape embeddings that no longer exist
      const scrapeResult = await lsembPool.query(`
        DELETE FROM unified_embeddings ue
        WHERE ue.source_table = 'scrape_embeddings'
        AND NOT EXISTS (
          SELECT 1 FROM scrape_embeddings se WHERE se.id::text = ue.source_id
        )
      `);

      const removed = (docResult.rowCount || 0) + (scrapeResult.rowCount || 0);
      console.log(`[UnifiedSync] Cleanup: removed ${removed} orphaned embeddings`);

      return { removed };
    } catch (error: any) {
      console.error('[UnifiedSync] Cleanup error:', error.message);
      return { removed: 0 };
    }
  }
}

export const unifiedEmbeddingsSync = new UnifiedEmbeddingsSyncService();
