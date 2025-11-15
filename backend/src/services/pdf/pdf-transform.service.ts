/**
 * PDF Transform Service
 * Transforms PDF metadata to user's source database (like CSV transform)
 */

import { Pool } from 'pg';
import { lsembPool } from '../../config/database.config';
import { PDFMetadata } from './metadata-extractor.service';

export type TableStructure = 'entity-based' | 'document-based';

export interface TransformConfig {
  documentIds: string[];
  sourceDbId: string;
  tableName: string;
  tableStructure: TableStructure;
  createNewTable?: boolean;
}

export interface TransformProgress {
  current: number;
  total: number;
  percentage: number;
  rowsInserted: number;
  currentDocument?: string;
  status: 'processing' | 'completed' | 'error';
  error?: string;
}

export interface TransformResult {
  jobId: string;
  tableName: string;
  rowsInserted: number;
  documentsProcessed: number;
  status: 'success' | 'partial' | 'failed';
  errors?: string[];
}

class PDFTransformService {
  /**
   * Get source database connection
   */
  private async getSourceDbConnection(sourceDbId: string): Promise<Pool> {
    try {
      // For localhost development, use environment variables or source API connection
      // In production, fetch from settings table
      const pool = new Pool({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: sourceDbId || process.env.POSTGRES_DB || 'scriptus_lsemb',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'Semsiye!22',
        ssl: false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });

      // Test connection
      await pool.query('SELECT 1');

      console.log(`[PDF Transform] Connected to source database: ${sourceDbId}`);

      return pool;
    } catch (error) {
      console.error('[PDF Transform] Error connecting to source database:', error);
      throw new Error(`Failed to connect to source database: ${error.message}`);
    }
  }

  /**
   * Create table in source database
   */
  private async createTable(
    sourceDb: Pool,
    tableName: string,
    tableStructure: TableStructure
  ): Promise<void> {
    let createTableSQL: string;

    if (tableStructure === 'entity-based') {
      // Entity-based: 1 row per entity
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          source_document_id INTEGER,
          document_name VARCHAR(255),
          entity_type VARCHAR(50),
          entity_value TEXT,
          confidence FLOAT DEFAULT 0.9,
          context TEXT,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
    } else {
      // Document-based: 1 row per PDF
      createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          source_document_id INTEGER,
          filename VARCHAR(255),
          summary TEXT,
          keywords TEXT[],
          topics TEXT[],
          category VARCHAR(100),
          language VARCHAR(10),
          entities JSONB,
          data_quality_score INTEGER,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
    }

    await sourceDb.query(createTableSQL);

    // Create indexes
    await sourceDb.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_source_doc
      ON ${tableName}(source_document_id)
    `);

    if (tableStructure === 'entity-based') {
      await sourceDb.query(`
        CREATE INDEX IF NOT EXISTS idx_${tableName}_entity_type
        ON ${tableName}(entity_type)
      `);
      await sourceDb.query(`
        CREATE INDEX IF NOT EXISTS idx_${tableName}_entity_value
        ON ${tableName} USING gin(to_tsvector('english', entity_value))
      `);
    }

    console.log(`[PDF Transform] Created table: ${tableName} (${tableStructure})`);
  }

  /**
   * Transform documents to source database
   */
  async transformToSourceDb(
    config: TransformConfig,
    progressCallback?: (progress: TransformProgress) => void
  ): Promise<TransformResult> {
    const jobId = require('crypto').randomUUID();
    let sourceDb: Pool | null = null;

    try {
      console.log(`[PDF Transform] Starting job ${jobId}`);
      console.log(`[PDF Transform] Config:`, config);

      // Get source database connection
      sourceDb = await this.getSourceDbConnection(config.sourceDbId);

      // Create table if needed
      if (config.createNewTable) {
        await this.createTable(sourceDb, config.tableName, config.tableStructure);
      }

      // Get documents with metadata
      const documentsResult = await lsembPool.query(
        `SELECT id, title, content, metadata
         FROM documents
         WHERE id = ANY($1::int[])`,
        [config.documentIds]
      );

      const documents = documentsResult.rows;
      let totalRowsInserted = 0;
      const errors: string[] = [];

      console.log(`[PDF Transform] Processing ${documents.length} documents`);

      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];

        try {
          // Report progress
          if (progressCallback) {
            progressCallback({
              current: i + 1,
              total: documents.length,
              percentage: ((i + 1) / documents.length) * 100,
              rowsInserted: totalRowsInserted,
              currentDocument: doc.title,
              status: 'processing'
            });
          }

          const metadata: PDFMetadata = doc.metadata?.analysis;

          if (!metadata) {
            errors.push(`Document ${doc.id} has no metadata analysis`);
            continue;
          }

          let rowsInserted = 0;

          if (config.tableStructure === 'entity-based') {
            // Insert multiple rows (one per entity)
            rowsInserted = await this.insertEntityBased(
              sourceDb,
              config.tableName,
              doc.id,
              doc.title,
              metadata
            );
          } else {
            // Insert single row per document
            rowsInserted = await this.insertDocumentBased(
              sourceDb,
              config.tableName,
              doc.id,
              doc.title,
              metadata
            );
          }

          totalRowsInserted += rowsInserted;

          console.log(`[PDF Transform] Document ${doc.title}: ${rowsInserted} rows inserted`);

        } catch (error) {
          console.error(`[PDF Transform] Error processing ${doc.title}:`, error);
          errors.push(`${doc.title}: ${error.message}`);
        }
      }

      // Complete
      if (progressCallback) {
        progressCallback({
          current: documents.length,
          total: documents.length,
          percentage: 100,
          rowsInserted: totalRowsInserted,
          status: 'completed'
        });
      }

      console.log(`[PDF Transform] Job ${jobId} complete: ${totalRowsInserted} rows inserted`);

      return {
        jobId,
        tableName: config.tableName,
        rowsInserted: totalRowsInserted,
        documentsProcessed: documents.length,
        status: errors.length === 0 ? 'success' : errors.length < documents.length ? 'partial' : 'failed',
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      console.error('[PDF Transform] Error:', error);

      if (progressCallback) {
        progressCallback({
          current: 0,
          total: config.documentIds.length,
          percentage: 0,
          rowsInserted: 0,
          status: 'error',
          error: error.message
        });
      }

      throw error;
    } finally {
      // Close source database connection
      if (sourceDb) {
        await sourceDb.end();
        console.log('[PDF Transform] Source database connection closed');
      }
    }
  }

  /**
   * Insert entity-based rows
   */
  private async insertEntityBased(
    sourceDb: Pool,
    tableName: string,
    documentId: number,
    documentName: string,
    metadata: PDFMetadata
  ): Promise<number> {
    let rowsInserted = 0;
    const entities = metadata.entities || {};
    const stats = metadata.statistics || {};

    // Insert entities (people, organizations, locations, etc.)
    for (const [entityType, values] of Object.entries(entities)) {
      if (Array.isArray(values) && values.length > 0) {
        for (const value of values) {
          await sourceDb.query(
            `INSERT INTO ${tableName}
             (source_document_id, document_name, entity_type, entity_value, confidence, context)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              documentId,
              documentName,
              entityType.toUpperCase(),
              value,
              0.9,
              JSON.stringify({
                document_category: metadata.category,
                language: metadata.language,
                source: 'pdf_analysis'
              })
            ]
          );
          rowsInserted++;
        }
      }
    }

    // Insert statistical data as entities
    if (stats.pageCount) {
      await sourceDb.query(
        `INSERT INTO ${tableName}
         (source_document_id, document_name, entity_type, entity_value, confidence, context)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          documentId,
          documentName,
          'STATISTICS',
          JSON.stringify({ type: 'page_count', value: stats.pageCount }),
          1.0,
          JSON.stringify({ source: 'pdf_stats' })
        ]
      );
      rowsInserted++;
    }

    if (stats.wordCount) {
      await sourceDb.query(
        `INSERT INTO ${tableName}
         (source_document_id, document_name, entity_type, entity_value, confidence, context)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          documentId,
          documentName,
          'STATISTICS',
          JSON.stringify({ type: 'word_count', value: stats.wordCount }),
          1.0,
          JSON.stringify({ source: 'pdf_stats' })
        ]
      );
      rowsInserted++;
    }

    // Insert keywords as entities
    if (metadata.keywords && metadata.keywords.length > 0) {
      for (const keyword of metadata.keywords) {
        await sourceDb.query(
          `INSERT INTO ${tableName}
           (source_document_id, document_name, entity_type, entity_value, confidence, context)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            documentId,
            documentName,
            'KEYWORD',
            keyword,
            0.8,
            JSON.stringify({ source: 'pdf_analysis' })
          ]
        );
        rowsInserted++;
      }
    }

    // Insert topics as entities
    if (metadata.topics && metadata.topics.length > 0) {
      for (const topic of metadata.topics) {
        await sourceDb.query(
          `INSERT INTO ${tableName}
           (source_document_id, document_name, entity_type, entity_value, confidence, context)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            documentId,
            documentName,
            'TOPIC',
            topic,
            0.8,
            JSON.stringify({ source: 'pdf_analysis' })
          ]
        );
        rowsInserted++;
      }
    }

    // Insert summary as entity
    if (metadata.summary) {
      await sourceDb.query(
        `INSERT INTO ${tableName}
         (source_document_id, document_name, entity_type, entity_value, confidence, context)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          documentId,
          documentName,
          'SUMMARY',
          metadata.summary,
          1.0,
          JSON.stringify({
            category: metadata.category,
            language: metadata.language,
            source: 'pdf_analysis'
          })
        ]
      );
      rowsInserted++;
    }

    return rowsInserted;
  }

  /**
   * Insert document-based row
   */
  private async insertDocumentBased(
    sourceDb: Pool,
    tableName: string,
    documentId: number,
    filename: string,
    metadata: PDFMetadata
  ): Promise<number> {
    await sourceDb.query(
      `INSERT INTO ${tableName}
       (source_document_id, filename, summary, keywords, topics, category,
        language, entities, data_quality_score, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        documentId,
        filename,
        metadata.summary,
        metadata.keywords || [],
        metadata.topics || [],
        metadata.category,
        metadata.language,
        JSON.stringify(metadata.entities || {}),
        metadata.dataQuality?.score || 0,
        JSON.stringify({
          hasStructuredData: metadata.dataQuality?.hasStructuredData,
          tableCount: metadata.dataQuality?.tableCount,
          source: 'gemini_analysis'
        })
      ]
    );

    return 1; // One row inserted
  }

  /**
   * Preview transform data before executing
   */
  async previewTransform(
    documentIds: string[],
    tableStructure: TableStructure
  ): Promise<{
    columns: string[];
    sampleRows: any[];
    totalRows: number;
  }> {
    // Get documents with metadata
    const documentsResult = await lsembPool.query(
      `SELECT id, title, metadata
       FROM documents
       WHERE id = ANY($1::int[])
       LIMIT 5`,
      [documentIds]
    );

    const sampleRows: any[] = [];
    let totalRows = 0;

    for (const doc of documentsResult.rows) {
      const metadata: PDFMetadata = doc.metadata?.analysis;
      if (!metadata) continue;

      if (tableStructure === 'entity-based') {
        // Count all entities
        const entities = metadata.entities || {};
        for (const values of Object.values(entities)) {
          if (Array.isArray(values)) {
            totalRows += values.length;
          }
        }

        // Sample rows
        if (metadata.entities?.organizations?.[0]) {
          sampleRows.push({
            document_name: doc.title,
            entity_type: 'ORGANIZATION',
            entity_value: metadata.entities.organizations[0],
            confidence: 0.9
          });
        }
        if (metadata.entities?.money?.[0]) {
          sampleRows.push({
            document_name: doc.title,
            entity_type: 'MONEY',
            entity_value: metadata.entities.money[0],
            confidence: 0.95
          });
        }
      } else {
        // Document-based
        totalRows++;
        sampleRows.push({
          filename: doc.title,
          summary: metadata.summary?.substring(0, 100) + '...',
          category: metadata.category,
          keywords: metadata.keywords?.slice(0, 3).join(', ')
        });
      }
    }

    const columns = tableStructure === 'entity-based'
      ? ['document_name', 'entity_type', 'entity_value', 'confidence']
      : ['filename', 'summary', 'category', 'keywords'];

    return {
      columns,
      sampleRows: sampleRows.slice(0, 5),
      totalRows
    };
  }
}

export default new PDFTransformService();
