/**
 * GraphQL DataLoaders
 * N+1 query problemini çözmek için DataLoader pattern
 */

import DataLoader from 'dataloader';
import { Pool } from 'pg';

/**
 * DataLoader tipleri
 */
export interface DataLoaders {
  documentLoader: DataLoader<string, any>;
  userLoader: DataLoader<string, any>;
  embeddingLoader: DataLoader<string, any>;
  chatMessageLoader: DataLoader<string, any>;
}

/**
 * DataLoader'ları oluştur
 * Her request için yeni instance oluşturulur
 */
export function createDataLoaders(pool: Pool): DataLoaders {
  return {
    /**
     * Document loader
     * Batch olarak dokümanları yükler
     */
    documentLoader: new DataLoader(async (ids: readonly string[]) => {
      try {
        const result = await pool.query(
          `SELECT id, title, content, source, metadata, created_at, updated_at,
                  transform_status, transform_progress, target_table_name,
                  transformed_at, last_transform_row_count, column_count,
                  row_count, column_headers, original_filename, upload_count
           FROM documents
           WHERE id = ANY($1)`,
          [ids]
        );

        const docMap = new Map(result.rows.map((d) => [d.id, d]));
        return ids.map((id) => docMap.get(id) || null);
      } catch (error) {
        console.error('[DataLoader] Document load error:', error);
        return ids.map(() => null);
      }
    }),

    /**
     * User loader
     * Batch olarak kullanıcıları yükler
     */
    userLoader: new DataLoader(async (ids: readonly string[]) => {
      try {
        const result = await pool.query(
          `SELECT id, email, name, role, created_at
           FROM users
           WHERE id = ANY($1)`,
          [ids]
        );

        const userMap = new Map(result.rows.map((u) => [u.id, u]));
        return ids.map((id) => userMap.get(id) || null);
      } catch (error) {
        console.error('[DataLoader] User load error:', error);
        return ids.map(() => null);
      }
    }),

    /**
     * Embedding loader
     * Batch olarak embedding'leri yükler
     */
    embeddingLoader: new DataLoader(async (documentIds: readonly string[]) => {
      try {
        const result = await pool.query(
          `SELECT document_id, embedding, metadata
           FROM embeddings
           WHERE document_id = ANY($1)`,
          [documentIds]
        );

        // Group by document_id
        const embeddingMap = new Map<string, any[]>();
        result.rows.forEach((row) => {
          const list = embeddingMap.get(row.document_id) || [];
          list.push(row);
          embeddingMap.set(row.document_id, list);
        });

        return documentIds.map((id) => embeddingMap.get(id) || []);
      } catch (error) {
        console.error('[DataLoader] Embedding load error:', error);
        return documentIds.map(() => []);
      }
    }),

    /**
     * Chat message loader
     * Batch olarak chat mesajlarını yükler
     */
    chatMessageLoader: new DataLoader(async (ids: readonly string[]) => {
      try {
        const result = await pool.query(
          `SELECT id, conversation_id, content, role, user_id, created_at
           FROM chat_messages
           WHERE id = ANY($1)`,
          [ids]
        );

        const messageMap = new Map(result.rows.map((m) => [m.id, m]));
        return ids.map((id) => messageMap.get(id) || null);
      } catch (error) {
        console.error('[DataLoader] Chat message load error:', error);
        return ids.map(() => null);
      }
    }),
  };
}

/**
 * DataLoader utilities
 */
export const DataLoaderUtils = {
  /**
   * Cache'i temizle
   */
  clearAll(loaders: DataLoaders) {
    Object.values(loaders).forEach((loader) => loader.clearAll());
  },

  /**
   * Belirli bir key için cache'i temizle
   */
  clear(loaders: DataLoaders, loaderName: keyof DataLoaders, key: string) {
    loaders[loaderName].clear(key);
  },

  /**
   * Prime cache with data
   */
  prime(
    loaders: DataLoaders,
    loaderName: keyof DataLoaders,
    key: string,
    value: any
  ) {
    loaders[loaderName].prime(key, value);
  },
};

export default createDataLoaders;
