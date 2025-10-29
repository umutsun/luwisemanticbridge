/**
 * Document Resolvers
 * GraphQL resolvers for document operations
 */

import { GraphQLContext } from '../context';
import { requireAuth, requireAdmin } from '../context';

export const documentResolvers = {
  Query: {
    /**
     * Get all documents
     */
    documents: async (
      _: any,
      { limit = 20, offset = 0 }: { limit?: number; offset?: number },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `SELECT id, title, content, source, metadata, created_at, updated_at,
                  transform_status, transform_progress, target_table_name,
                  transformed_at, last_transform_row_count, column_count,
                  row_count, column_headers, original_filename, upload_count
           FROM documents
           ORDER BY created_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );

        const countResult = await context.pool.query(
          `SELECT COUNT(*) as total FROM documents`
        );

        const total = parseInt(countResult.rows[0].total, 10);

        return {
          items: result.rows.map((row) => ({
            id: row.id,
            title: row.title,
            content: row.content,
            source: row.source,
            metadata: row.metadata,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            transformStatus: row.transform_status,
            transformProgress: row.transform_progress,
            targetTableName: row.target_table_name,
            transformedAt: row.transformed_at,
            lastTransformRowCount: row.last_transform_row_count,
            columnCount: row.column_count,
            rowCount: row.row_count,
            columnHeaders: row.column_headers,
            originalFilename: row.original_filename,
            uploadCount: row.upload_count,
          })),
          total,
          hasMore: offset + limit < total,
        };
      } catch (error) {
        console.error('[GraphQL] Documents query error:', error);
        throw new Error('Failed to fetch documents');
      }
    },

    /**
     * Get single document
     */
    document: async (
      _: any,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        // Use DataLoader (N+1 prevention)
        const document = await context.dataloaders.documentLoader.load(id);
        return document;
      } catch (error) {
        console.error('[GraphQL] Document query error:', error);
        throw new Error('Document not found');
      }
    },

    /**
     * Search documents
     */
    searchDocuments: async (
      _: any,
      { query, limit = 10 }: { query: string; limit?: number },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `SELECT id, title, content, source, metadata, created_at, updated_at,
                  transform_status, transform_progress, target_table_name,
                  transformed_at, last_transform_row_count, column_count,
                  row_count, column_headers, original_filename, upload_count
           FROM documents
           WHERE title ILIKE $1 OR content ILIKE $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [`%${query}%`, limit]
        );

        return result.rows.map((row) => ({
          id: row.id,
          title: row.title,
          content: row.content,
          source: row.source,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          transformStatus: row.transform_status,
          transformProgress: row.transform_progress,
          targetTableName: row.target_table_name,
          transformedAt: row.transformed_at,
          lastTransformRowCount: row.last_transform_row_count,
          columnCount: row.column_count,
          rowCount: row.row_count,
          columnHeaders: row.column_headers,
          originalFilename: row.original_filename,
          uploadCount: row.upload_count,
        }));
      } catch (error) {
        console.error('[GraphQL] Search documents error:', error);
        throw new Error('Document search failed');
      }
    },
  },

  Mutation: {
    /**
     * Upload document
     */
    uploadDocument: async (
      _: any,
      { input }: { input: any },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `INSERT INTO documents (title, content, source, metadata, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id, title, content, source, metadata, created_at, updated_at`,
          [input.title, input.content, input.source || null, input.metadata || {}]
        );

        const document = result.rows[0];

        return {
          id: document.id,
          title: document.title,
          content: document.content,
          source: document.source,
          metadata: document.metadata,
          createdAt: document.created_at,
          updatedAt: document.updated_at,
        };
      } catch (error) {
        console.error('[GraphQL] Upload document error:', error);
        throw new Error('Failed to upload document');
      }
    },

    /**
     * Update document
     */
    updateDocument: async (
      _: any,
      { input }: { input: any },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        // Check if document exists first
        const checkResult = await context.pool.query(
          `SELECT id FROM documents WHERE id = $1`,
          [input.id]
        );

        if (checkResult.rows.length === 0) {
          throw new Error('Document not found');
        }

        // Build update query
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (input.title) {
          updates.push(`title = $${paramIndex++}`);
          values.push(input.title);
        }

        if (input.content) {
          updates.push(`content = $${paramIndex++}`);
          values.push(input.content);
        }

        if (input.metadata) {
          updates.push(`metadata = $${paramIndex++}`);
          values.push(input.metadata);
        }

        updates.push(`updated_at = NOW()`);
        values.push(input.id);

        const result = await context.pool.query(
          `UPDATE documents
           SET ${updates.join(', ')}
           WHERE id = $${paramIndex}
           RETURNING id, title, content, source, metadata, created_at, updated_at`,
          values
        );

        const document = result.rows[0];

        // Clear DataLoader cache
        context.dataloaders.documentLoader.clear(input.id);

        return {
          id: document.id,
          title: document.title,
          content: document.content,
          source: document.source,
          metadata: document.metadata,
          createdAt: document.created_at,
          updatedAt: document.updated_at,
        };
      } catch (error) {
        console.error('[GraphQL] Update document error:', error);
        throw new Error('Failed to update document');
      }
    },

    /**
     * Delete document
     */
    deleteDocument: async (
      _: any,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `DELETE FROM documents WHERE id = $1 RETURNING id`,
          [id]
        );

        if (result.rows.length === 0) {
          throw new Error('Document not found');
        }

        // Clear DataLoader cache
        context.dataloaders.documentLoader.clear(id);

        return true;
      } catch (error) {
        console.error('[GraphQL] Delete document error:', error);
        throw new Error('Failed to delete document');
      }
    },
  },

  Document: {
    /**
     * Get document embeddings (lazy loading)
     */
    embeddings: async (parent: any, _: any, context: GraphQLContext) => {
      try {
        const embeddings = await context.dataloaders.embeddingLoader.load(
          parent.id
        );
        return embeddings || [];
      } catch (error) {
        console.error('[GraphQL] Document embeddings error:', error);
        return [];
      }
    },
  },
};

export default documentResolvers;
