/**
 * Document Transform Resolvers
 * Handles CSV/JSON document upload, preview, and transformation to source_db
 */

import { GraphQLContext } from '../context';
import { requireAuth } from '../context';
import DocumentTransformService from '../../services/document-transform.service';
// import { GraphQLUpload } from 'graphql-upload'; // Disabled for now
import { createWriteStream } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PubSub } from 'graphql-subscriptions';

const pubsub = new PubSub();

export const documentTransformResolvers = {
  // Upload: GraphQLUpload, // Disabled for now

  Query: {
    /**
     * Get transform document by ID
     */
    transformDocument: async (
      _: any,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const result = await context.pool.query(
        `SELECT * FROM documents WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        throw new Error('Document not found');
      }

      const doc = result.rows[0];
      return {
        id: doc.id,
        filename: doc.filename,
        fileType: doc.file_type,
        fileSize: doc.file_size,
        rowCount: doc.row_count,
        columnHeaders: doc.column_headers,
        parsedData: doc.parsed_data,
        dataQualityScore: doc.data_quality_score,
        transformStatus: doc.transform_status?.toUpperCase() || 'PENDING',
        transformProgress: doc.transform_progress || 0,
        targetTableName: doc.target_table_name,
        sourceDbId: doc.source_db_id,
        transformErrors: doc.transform_errors,
        transformedAt: doc.transformed_at,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      };
    },

    /**
     * List transform documents with filters
     */
    transformDocuments: async (
      _: any,
      {
        limit = 50,
        offset = 0,
        status,
        fileType,
      }: {
        limit?: number;
        offset?: number;
        status?: string;
        fileType?: string;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      let query = 'SELECT * FROM documents WHERE 1=1';
      const params: any[] = [];
      let paramCount = 0;

      if (status) {
        paramCount++;
        query += ` AND transform_status = $${paramCount}`;
        params.push(status.toLowerCase());
      }

      if (fileType) {
        paramCount++;
        query += ` AND file_type = $${paramCount}`;
        params.push(fileType);
      }

      query += ' ORDER BY created_at DESC';

      // Get total count
      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
      const countResult = await context.pool.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // Add pagination
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      params.push(limit);

      paramCount++;
      query += ` OFFSET $${paramCount}`;
      params.push(offset);

      const result = await context.pool.query(query, params);

      const items = result.rows.map((doc) => ({
        id: doc.id,
        filename: doc.filename,
        fileType: doc.file_type,
        fileSize: doc.file_size,
        rowCount: doc.row_count,
        columnHeaders: doc.column_headers,
        parsedData: doc.parsed_data,
        dataQualityScore: doc.data_quality_score,
        transformStatus: doc.transform_status?.toUpperCase() || 'PENDING',
        transformProgress: doc.transform_progress || 0,
        targetTableName: doc.target_table_name,
        sourceDbId: doc.source_db_id,
        transformErrors: doc.transform_errors,
        transformedAt: doc.transformed_at,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      }));

      return {
        items,
        total,
        hasMore: offset + limit < total,
      };
    },

    /**
     * Get document preview
     */
    documentPreview: async (
      _: any,
      { documentId }: { documentId: string },
      context: GraphQLContext
    ) => {
      try {
        console.log(`[GraphQL] documentPreview called with documentId: ${documentId}`);
        // TEMP: Disable auth for testing
        // requireAuth(context);

        const service = new DocumentTransformService(context.pool, context.redis);
        console.log(`[GraphQL] DocumentTransformService created, calling getDocumentPreview...`);

        const preview = await service.getDocumentPreview(parseInt(documentId));
        console.log(`[GraphQL] Preview retrieved successfully`);

        // Log preview structure for debugging
        console.log(`[GraphQL] Preview structure:`, {
          documentId: preview.documentId,
          filename: preview.filename,
          fileType: preview.fileType,
          rowCount: preview.rowCount,
          columnHeadersLength: preview.columnHeaders?.length,
          sampleRowsLength: preview.sampleRows?.length,
          sampleRowsType: typeof preview.sampleRows,
          fieldTypesLength: preview.dataQuality?.fieldTypes?.length,
        });

        // Test JSON serialization
        try {
          const serialized = JSON.stringify(preview);
          console.log(`[GraphQL] Preview serializable: ${serialized.length} bytes`);
        } catch (e: any) {
          console.error(`[GraphQL] Preview NOT serializable:`, e.message);
          throw new Error(`Preview data cannot be serialized: ${e.message}`);
        }

        // Additional validation before returning
        console.log(`[GraphQL] About to return preview...`);
        console.log(`[GraphQL] Preview keys:`, Object.keys(preview));
        console.log(`[GraphQL] sampleRows count:`, preview.sampleRows?.length);
        console.log(`[GraphQL] dataQuality keys:`, preview.dataQuality ? Object.keys(preview.dataQuality) : 'null');

        // Return the preview
        const result = preview;
        console.log(`[GraphQL] Returning result...`);
        return result;
      } catch (error: any) {
        console.error(`[GraphQL] documentPreview error:`, error);
        console.error(`[GraphQL] Error stack:`, error.stack);
        throw new Error(`Failed to get document preview: ${error.message}`);
      }
    },

    /**
     * Get transformation progress
     */
    transformProgress: async (
      _: any,
      { jobId }: { jobId: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const service = new DocumentTransformService(context.pool, context.redis);
      const progress = await service.getTransformProgress(jobId);

      return progress.map((p) => ({
        ...p,
        status: p.status.toUpperCase(),
      }));
    },
  },

  Mutation: {
    // Upload disabled for now - file upload not needed
    // /**
    //  * Upload document
    //  */
    // uploadTransformDocument: async (
    //   _: any,
    //   { file, filename }: { file: any; filename: string },
    //   context: GraphQLContext
    // ) => {
    //   requireAuth(context);
    //   // Implementation...
    // },

    /**
     * Transform documents to source database (batch)
     */
    transformDocumentsToSourceDb: async (
      _: any,
      {
        documentIds,
        sourceDbId,
        tableName,
        batchSize = 100,
        createNewTable = true,
        enableEmbedding = false,
      }: {
        documentIds: string[];
        sourceDbId: string;
        tableName?: string;
        batchSize?: number;
        createNewTable?: boolean;
        enableEmbedding?: boolean;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const service = new DocumentTransformService(context.pool, context.redis);

        const result = await service.transformDocumentsToSourceDb({
          documentIds: documentIds.map((id) => parseInt(id)),
          sourceDbId,
          tableName,
          batchSize,
          createNewTable,
          enableEmbedding,
        });

        return {
          ...result,
          documentsProcessed: documentIds.length,
        };
      } catch (error) {
        console.error('[GraphQL] Transform documents error:', error);
        throw new Error(`Failed to transform documents: ${(error as Error).message}`);
      }
    },

    /**
     * Delete transform document
     */
    deleteTransformDocument: async (
      _: any,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const result = await context.pool.query(
        `DELETE FROM documents WHERE id = $1`,
        [id]
      );

      return result.rowCount > 0;
    },

    /**
     * Update document metadata
     */
    updateDocumentMetadata: async (
      _: any,
      {
        id,
        targetTableName,
        sourceDbId,
      }: {
        id: string;
        targetTableName?: string;
        sourceDbId?: string;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const updates: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      let paramCount = 0;

      if (targetTableName) {
        paramCount++;
        updates.push(`target_table_name = $${paramCount}`);
        params.push(targetTableName);
      }

      if (sourceDbId) {
        paramCount++;
        updates.push(`source_db_id = $${paramCount}`);
        params.push(sourceDbId);
      }

      paramCount++;
      params.push(id);

      await context.pool.query(
        `UPDATE documents SET ${updates.join(', ')} WHERE id = $${paramCount}`,
        params
      );

      // Return updated document
      return documentTransformResolvers.Query.transformDocument(_, { id }, context);
    },
  },

  Subscription: {
    /**
     * Subscribe to transformation progress
     */
    transformProgressUpdates: {
      subscribe: async (_: any, { jobId }: { jobId: string }, context: GraphQLContext) => {
        requireAuth(context);

        // Subscribe to Redis pub/sub
        const subscriber = context.redis.duplicate();
        await subscriber.subscribe(`document_transform_progress:${jobId}`);

        return pubsub.asyncIterator(`TRANSFORM_PROGRESS_${jobId}`);
      },
    },

    /**
     * Subscribe to document status changes
     */
    documentStatusUpdates: {
      subscribe: async (_: any, { documentId }: { documentId: string }, context: GraphQLContext) => {
        requireAuth(context);
        return pubsub.asyncIterator(`DOCUMENT_STATUS_${documentId}`);
      },
    },
  },
};

export default documentTransformResolvers;
