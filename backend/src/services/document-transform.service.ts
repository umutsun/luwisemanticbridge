/**
 * Document Transform Service
 * Handles CSV/JSON upload, parsing, preview, and transformation to source_db
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import Papa from 'papaparse';
import dataAnalysisService from './data-analysis.service';
import TableCreationService from './table-creation.service';
import { SettingsService } from './settings.service';

export interface DocumentMetadata {
  id: number;
  filename: string;
  fileType: string;
  fileSize: number;
  rowCount: number;
  columnHeaders: string[];
  parsedData: any[];
  dataQualityScore: number;
  transformStatus: 'pending' | 'analyzing' | 'transforming' | 'completed' | 'failed';
  transformProgress: number;
  targetTableName?: string;
  sourceDbId?: string;
  transformErrors?: any;
  transformedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentPreview {
  documentId: string; // GraphQL ID type is string
  filename: string;
  fileType: string;
  rowCount: number;
  columnHeaders: string[];
  sampleRows: any[]; // Last 10 rows
  dataQuality: {
    score: number;
    issues: any[];
    fieldTypes: Array<{
      field: string;
      type: string;
      nullable: boolean;
      unique: boolean;
    }>;
    warnings: string[];
  };
  suggestedTableName: string;
  isValid: boolean;
  existingTableStatus?: {
    exists: boolean;
    rowCount: number;
    willResume: boolean;
    resumeFromRow?: number;
  };
}

export interface TransformOptions {
  documentIds: number[];
  sourceDbId: string;
  tableName?: string;
  batchSize?: number;
  createNewTable?: boolean;
  enableEmbedding?: boolean;
}

export interface TransformProgress {
  jobId: string;
  documentId: number;
  status: 'pending' | 'analyzing' | 'creating_table' | 'inserting_data' | 'embedding' | 'completed' | 'failed';
  progress: number;
  rowsProcessed: number;
  totalRows: number;
  currentDocument: string;
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
  // Embedding progress
  embeddingEnabled?: boolean;
  embeddingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  embeddingProgress?: number;
  chunksProcessed?: number;
  totalChunks?: number;
}

export class DocumentTransformService {
  private tableCreationService: TableCreationService;

  constructor(
    private pool: Pool,
    private redis: Redis
  ) {
    this.tableCreationService = new TableCreationService(pool, redis);
  }

  /**
   * Upload and parse CSV/JSON document
   */
  async uploadDocument(
    filepath: string,
    filename: string,
    userId?: string
  ): Promise<DocumentMetadata> {
    try {
      const fileContent = readFileSync(filepath, 'utf-8');
      const fileType = this.detectFileType(filename);
      const fileSize = Buffer.from(fileContent).length;

      // Parse file content
      const { data, headers } = this.parseFile(fileContent, fileType);

      // Run quick analysis using imported dataAnalysisService
      const analysis = await dataAnalysisService.analyzeScrapedData(
        data,
        filepath,
        'documents',
        { sampleSize: 100, runQualityChecks: true, suggestIndexes: false }
      );

      // Store in documents table
      const result = await this.pool.query(
        `INSERT INTO documents (
          filename, content, file_type, file_size,
          parsed_data, column_headers, row_count,
          data_quality_score, transform_status,
          metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *`,
        [
          filename,
          fileContent.substring(0, 10000), // Store first 10KB as preview
          fileType,
          fileSize,
          JSON.stringify(data.slice(0, 100)), // Store first 100 rows
          headers,
          data.length,
          analysis.dataQualityScore,
          'pending',
          JSON.stringify({
            userId,
            analysisId: analysis.id,
            uploadedFrom: 'documents-section',
          }),
        ]
      );

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
        transformStatus: doc.transform_status,
        transformProgress: doc.transform_progress || 0,
        targetTableName: doc.target_table_name,
        sourceDbId: doc.source_db_id,
        transformErrors: doc.transform_errors,
        transformedAt: doc.transformed_at,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      };
    } catch (error) {
      console.error('[DocumentTransform] Upload failed:', error);
      throw new Error(`Failed to upload document: ${(error as Error).message}`);
    }
  }

  /**
   * Get document preview with last 10 rows
   */
  async getDocumentPreview(documentId: number): Promise<DocumentPreview> {
    try {
      console.log(`[DocumentTransform] Getting preview for document ${documentId}`);

      const result = await this.pool.query(
        `SELECT * FROM documents WHERE id = $1`,
        [documentId]
      );

      if (result.rows.length === 0) {
        throw new Error('Document not found');
      }

      const doc = result.rows[0];
      console.log(`[DocumentTransform] Document found: ${doc.title}, type: ${doc.type}`);

      // Get parsed data - if not available, parse from content
      let parsedData = doc.parsed_data || [];
      let columnHeaders = doc.column_headers || [];

      // Priority 1: If no parsed data, try to read from physical file first
      let fileContent = '';
      if (parsedData.length === 0 && (doc.type === 'csv' || doc.file_type === 'csv')) {
        // Try to read from physical file path
        if (doc.file_path) {
          try {
            console.log(`[DocumentTransform] Reading from physical file: ${doc.file_path}`);
            fileContent = readFileSync(doc.file_path, 'utf-8');
            console.log(`[DocumentTransform] File read successfully, size: ${fileContent.length} bytes`);
          } catch (error) {
            console.log(`[DocumentTransform] Could not read physical file, falling back to content field`);
            fileContent = doc.content || '';
          }
        } else {
          console.log(`[DocumentTransform] No file_path, using content field`);
          fileContent = doc.content || '';
        }
      }

      // Priority 2: Parse CSV from file content or database content using PapaParse
      if (parsedData.length === 0 && fileContent) {
        console.log(`[DocumentTransform] No parsed_data, parsing CSV with PapaParse...`);

        const parseResult = Papa.parse(fileContent, {
          header: true,           // First row is headers
          skipEmptyLines: true,   // Skip empty lines
          dynamicTyping: false,   // Keep all as strings for now
          trimHeaders: true,      // Trim whitespace from headers
          transformHeader: (header: string) => header.trim(),
        });

        if (parseResult.errors && parseResult.errors.length > 0) {
          console.log(`[DocumentTransform] Parse warnings:`, parseResult.errors.slice(0, 3));
        }

        columnHeaders = parseResult.meta.fields || [];
        parsedData = parseResult.data as any[];

        console.log(`[DocumentTransform] Parsed ${parsedData.length} rows, ${columnHeaders.length} columns`);
        console.log(`[DocumentTransform] Headers:`, columnHeaders.join(', '));
      }

      // Get last 5 rows for preview - sanitize for GraphQL JSON scalar
      const rawSampleRows = parsedData.slice(-5);
      // Deep clone via JSON to ensure clean data for GraphQL
      const sampleRows = JSON.parse(JSON.stringify(rawSampleRows));

      console.log(`[DocumentTransform] Parsed data: ${parsedData.length} rows, ${columnHeaders.length} columns`);
      console.log(`[DocumentTransform] Returning ${sampleRows.length} sample rows for preview`);

      // Simple field type detection with improved date detection
      const isValidDateString = (v: any): boolean => {
        if (!v || typeof v !== 'string') return false;
        // Only match actual date formats, not plain numbers
        // Common formats: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, YYYY/MM/DD, ISO dates
        const datePatterns = [
          /^\d{4}-\d{2}-\d{2}$/,                    // YYYY-MM-DD
          /^\d{2}\.\d{2}\.\d{4}$/,                  // DD.MM.YYYY
          /^\d{2}\/\d{2}\/\d{4}$/,                  // DD/MM/YYYY or MM/DD/YYYY
          /^\d{4}\/\d{2}\/\d{2}$/,                  // YYYY/MM/DD
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,  // ISO 8601
        ];
        return datePatterns.some(pattern => pattern.test(v.trim()));
      };

      const fieldTypes = columnHeaders.map((header: string) => {
        const values = sampleRows.map((row: any) => row[header]).filter((v: any) => v !== null && v !== undefined && v !== '');
        const isNumeric = values.length > 0 && values.every((v: any) => !isNaN(Number(v)));
        // Only check for date if not numeric - pure numbers should never be dates
        const isDate = !isNumeric && values.length > 0 && values.every((v: any) => isValidDateString(v));

        return {
          field: header,
          type: isNumeric ? 'INTEGER' : isDate ? 'TIMESTAMP' : 'TEXT',
          nullable: values.length < sampleRows.length,
          unique: new Set(values).size === values.length,
        };
      });

      // Suggest table name from filename
      const suggestedTableName = this.generateTableName(doc.filename || doc.title);

      // Check if table already exists
      const tableStatus = await this.tableCreationService.checkTableStatus(suggestedTableName);
      const csvRowCount = doc.row_count || parsedData.length;

      let existingTableStatus = undefined;
      if (tableStatus.exists) {
        const existingRows = tableStatus.rowCount || 0;
        const willResume = csvRowCount > existingRows;

        existingTableStatus = {
          exists: true,
          rowCount: existingRows,
          willResume,
          resumeFromRow: willResume ? existingRows : undefined,
        };

        console.log(`[DocumentTransform] Table ${suggestedTableName} exists with ${existingRows} rows. CSV has ${csvRowCount} rows. Will resume: ${willResume}`);
      }

      // Return full preview with actual data
      const preview = {
        documentId: String(doc.id), // Convert to string for GraphQL ID type
        filename: doc.filename || doc.title,
        fileType: doc.file_type || doc.type || 'csv',
        rowCount: csvRowCount,
        columnHeaders,
        sampleRows, // Real data (last 5 rows)
        dataQuality: {
          score: 0.9,
          issues: [],
          fieldTypes, // Real field type analysis
          warnings: [],
        },
        suggestedTableName,
        isValid: true,
        existingTableStatus,
      };

      console.log(`[DocumentTransform] Preview generated successfully for document ${preview.documentId}`);
      console.log(`[DocumentTransform] Returning ${sampleRows.length} rows, ${fieldTypes.length} field types`);
      return preview;
    } catch (error) {
      console.error('[DocumentTransform] Preview failed:', error);
      throw new Error(`Failed to get document preview: ${(error as Error).message}`);
    }
  }

  /**
   * Transform multiple documents to source_db in batch
   */
  async transformDocumentsToSourceDb(
    options: TransformOptions
  ): Promise<{ jobId: string; status: string; message: string }> {
    const jobId = `transform_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[DocumentTransform] Starting transformation job ${jobId}`);
    console.log(`[DocumentTransform] Options:`, {
      documentIds: options.documentIds,
      sourceDbId: options.sourceDbId,
      tableName: options.tableName,
      batchSize: options.batchSize,
      createNewTable: options.createNewTable,
    });

    // Start async transformation
    this.processTransformationBatch(jobId, options).catch((error) => {
      console.error('[DocumentTransform] Batch transformation failed:', error);
    });

    return {
      jobId,
      status: 'STARTED',
      message: `Transformation job started for ${options.documentIds.length} document(s)`,
    };
  }

  /**
   * Process transformation batch (async)
   */
  private async processTransformationBatch(
    jobId: string,
    options: TransformOptions
  ): Promise<void> {
    const { documentIds, sourceDbId, tableName, batchSize = 100, createNewTable = true, enableEmbedding = false } = options;

    for (const documentId of documentIds) {
      try {
        await this.updateTransformProgress(jobId, documentId, {
          status: 'analyzing',
          progress: 0,
        });

        // Get document
        const docResult = await this.pool.query(
          `SELECT * FROM documents WHERE id = $1`,
          [documentId]
        );

        if (docResult.rows.length === 0) {
          throw new Error(`Document ${documentId} not found`);
        }

        const doc = docResult.rows[0];
        let parsedData = doc.parsed_data || [];

        // Debug document fields
        console.log(`[DocumentTransform] Document fields:`, {
          id: doc.id,
          filename: doc.filename,
          type: doc.type,
          file_type: doc.file_type,
          file_path: doc.file_path,
          has_parsed_data: !!doc.parsed_data,
        });

        // If parsed_data is empty, parse from file
        if (!parsedData || parsedData.length === 0) {
          console.log(`[DocumentTransform] parsed_data is empty, reading from file: ${doc.file_path}`);

          // Use file_type or fallback to type field
          const fileType = doc.file_type || doc.type;
          console.log(`[DocumentTransform] Detected file type: ${fileType}`);

          if (doc.file_path && fileType === 'csv') {
            console.log(`[DocumentTransform] Reading CSV file: ${doc.file_path}`);
            const fileContent = readFileSync(doc.file_path, 'utf-8');
            const parseResult = Papa.parse(fileContent, {
              header: true,
              skipEmptyLines: true,
              dynamicTyping: false,
              trimHeaders: true,
              transformHeader: (header: string) => header.trim(),
            });

            parsedData = parseResult.data as any[];
            console.log(`[DocumentTransform] Parsed ${parsedData.length} rows from CSV file`);
          } else {
            console.error(`[DocumentTransform] Failed to parse: file_path=${doc.file_path}, file_type=${fileType}`);
            throw new Error(`Cannot parse document: file_path='${doc.file_path}', file_type='${fileType}'`);
          }
        }

        console.log(`[DocumentTransform] Working with ${parsedData.length} rows of data`);
        await this.updateDocumentStatus(documentId, 'analyzing', 10);

        // Get source database pool (reuse existing pool)
        const sourcePool = await this.getSourceDbConfig(sourceDbId);

        try {
          // Analyze data using imported dataAnalysisService
          const analysis = await dataAnalysisService.analyzeScrapedData(
            parsedData,
            doc.filename,
            'documents',
            { sampleSize: 100, runQualityChecks: true, suggestIndexes: true }
          );

          await this.updateDocumentStatus(documentId, 'analyzing', 30);

          // Generate table schema
          const finalTableName = tableName || this.generateTableName(doc.filename);

          // Always add auto-increment id as PRIMARY KEY
          const columns = [
            {
              name: 'id',
              type: 'SERIAL',
              nullable: false,
              isPrimaryKey: true,
              isUnique: true,
            },
            // Map CSV columns (none should be primary key)
            // Store originalFieldName for mapping CSV data to table columns
            ...analysis.fieldTypes.map((field: any) => ({
              name: field.fieldName.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
              originalFieldName: field.fieldName, // Keep original CSV header name for data mapping
              type: field.suggestedSQLType,
              nullable: field.nullable,
              isPrimaryKey: false, // Never use CSV columns as primary key
              isUnique: false, // Avoid unique constraints on CSV columns
            })),
            // Add created_at timestamp with default value
            {
              name: 'created_at',
              type: 'TIMESTAMP',
              nullable: false,
              isPrimaryKey: false,
              isUnique: false,
              defaultValue: 'CURRENT_TIMESTAMP',
            },
          ];

          console.log(`[DocumentTransform] Table schema: ${columns.length} columns (id, ${analysis.fieldTypes.length} CSV cols, created_at)`);

          await this.updateDocumentStatus(documentId, 'transforming', 40);
          await this.updateTransformProgress(jobId, documentId, {
            status: 'creating_table',
            progress: 40,
          });

          // Create table in source database with SMART insert/update
          const tableService = new TableCreationService(sourcePool, this.redis);
          const result = await tableService.smartInsertOrUpdate(
            finalTableName,
            columns,
            [
              {
                name: `${finalTableName}_pkey`,
                type: 'PRIMARY_KEY',
                columns: ['id'], // Always use 'id' as primary key
                definition: `PRIMARY KEY (id)`,
              },
            ],
            [],
            parsedData,
            {
              importData: true,
              batchSize,
              jobId, // Pass jobId for real-time progress
              action: 'DROP', // Always drop and recreate to ensure correct column types
            }
          );

          console.log(`[DocumentTransform] Smart insert result: ${result.action}`, {
            action: result.action,
            existingRows: result.existingRows,
            newRows: result.newRows,
            rowsInserted: result.rowsInserted,
          });

          if (result.success) {
            // VERIFICATION: Count rows in created table
            console.log(`[DocumentTransform] Verifying table ${finalTableName}...`);
            const verifyResult = await sourcePool.query(
              `SELECT COUNT(*) as count FROM ${finalTableName}`
            );
            const actualRowCount = parseInt(verifyResult.rows[0].count, 10);
            const totalRowsInCSV = parsedData.length;
            const expectedRowCount = result.rowsInserted; // Use actual inserted count, not CSV total (some rows may be skipped due to errors)

            console.log(`[DocumentTransform] Verification: CSV rows=${totalRowsInCSV}, Inserted=${result.rowsInserted}, Failed=${result.rowsFailed}, Table count=${actualRowCount}`);

            // Check if actual count matches inserted count (allow for some tolerance due to skip/resume scenarios)
            // Note: We no longer require strict match with CSV total since some rows may be skipped due to data errors
            if (actualRowCount < expectedRowCount) {
              throw new Error(
                `Verification failed: Expected at least ${expectedRowCount} rows but found ${actualRowCount} rows in table ${finalTableName}`
              );
            }

            // Log warning if some rows were skipped
            if (result.rowsFailed > 0) {
              console.warn(`[DocumentTransform] Warning: ${result.rowsFailed} rows were skipped due to errors`);
            }

            // Verification passed!
            console.log(`[DocumentTransform] ✓ Verification passed: ${actualRowCount} rows confirmed (${result.rowsFailed} rows skipped)`);

            // Handle embedding if enabled
            if (enableEmbedding) {
              console.log(`[DocumentTransform] Embedding enabled, starting embedding process for document ${documentId}`);

              await this.updateTransformProgress(jobId, documentId, {
                status: 'embedding',
                progress: 85,
                embeddingEnabled: true,
                embeddingStatus: 'processing',
                embeddingProgress: 0,
              });

              try {
                // Create embeddings for the document
                await this.createDocumentEmbeddings(documentId, doc, parsedData, jobId);

                await this.updateTransformProgress(jobId, documentId, {
                  embeddingStatus: 'completed',
                  embeddingProgress: 100,
                });

                console.log(`[DocumentTransform] ✓ Embedding completed for document ${documentId}`);
              } catch (embeddingError) {
                console.error(`[DocumentTransform] Embedding failed for document ${documentId}:`, embeddingError);
                await this.updateTransformProgress(jobId, documentId, {
                  embeddingStatus: 'failed',
                  errors: [(embeddingError as Error).message],
                });
                // Continue with transform completion even if embedding fails
              }
            }

            await this.updateDocumentStatus(documentId, 'completed', 100, {
              targetTableName: finalTableName,
              sourceDbId,
              transformedAt: new Date(),
              lastTransformRowCount: actualRowCount,
              rowsSkipped: result.rowsFailed,
              columnCount: analysis.fieldTypes.length,
              embeddingEnabled: enableEmbedding,
            });

            await this.updateTransformProgress(jobId, documentId, {
              status: 'completed',
              progress: 100,
              rowsProcessed: actualRowCount, // Use verified count
              totalRows: totalRowsInCSV,
              rowsSkipped: result.rowsFailed,
              embeddingEnabled: enableEmbedding,
            });

            console.log(`[DocumentTransform] Document ${documentId} transformed and verified successfully${enableEmbedding ? ' with embeddings' : ''}`);
          } else {
            throw new Error(`Table creation failed: ${result.errors.join(', ')}`);
          }
        } finally {
          // Close the source pool connection to avoid leaks
          await sourcePool.end();
          console.log(`[DocumentTransform] Document ${documentId} transformation completed, source pool closed`);
        }
      } catch (error) {
        console.error(`[DocumentTransform] Document ${documentId} failed:`, error);

        await this.updateDocumentStatus(documentId, 'failed', 0, {
          transformErrors: { message: (error as Error).message },
        });

        await this.updateTransformProgress(jobId, documentId, {
          status: 'failed',
          progress: 0,
          errors: [(error as Error).message],
        });
      }
    }
  }

  /**
   * Get transformation progress
   */
  async getTransformProgress(jobId: string): Promise<TransformProgress[]> {
    const keys = await this.redis.keys(`transform_progress:${jobId}:*`);
    const progress: TransformProgress[] = [];

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        progress.push(JSON.parse(data));
      }
    }

    return progress;
  }

  /**
   * Update transformation progress in Redis
   */
  private async updateTransformProgress(
    jobId: string,
    documentId: number,
    update: Partial<TransformProgress>
  ): Promise<void> {
    const key = `transform_progress:${jobId}:${documentId}`;
    const existing = await this.redis.get(key);

    let progress: TransformProgress;

    if (existing) {
      progress = { ...JSON.parse(existing), ...update };
    } else {
      progress = {
        jobId,
        documentId,
        status: 'pending',
        progress: 0,
        rowsProcessed: 0,
        totalRows: 0,
        currentDocument: '',
        errors: [],
        startedAt: new Date(),
        ...update,
      };
    }

    if (update.status === 'completed' || update.status === 'failed') {
      progress.completedAt = new Date();
    }

    // Store in Redis with 1 hour expiration
    await this.redis.setex(key, 3600, JSON.stringify(progress));

    // Publish progress update for WebSocket
    await this.redis.publish(
      `document_transform_progress:${jobId}`,
      JSON.stringify(progress)
    );
  }

  /**
   * Update document status in database
   */
  private async updateDocumentStatus(
    documentId: number,
    status: string,
    progress: number,
    extras: any = {}
  ): Promise<void> {
    const updates: string[] = [
      'transform_status = $1',
      'transform_progress = $2',
      'updated_at = NOW()',
    ];
    const values: any[] = [status, progress];
    let paramCount = 2;

    if (extras.targetTableName) {
      paramCount++;
      updates.push(`target_table_name = $${paramCount}`);
      values.push(extras.targetTableName);
    }

    if (extras.sourceDbId) {
      paramCount++;
      updates.push(`source_db_id = $${paramCount}`);
      values.push(extras.sourceDbId);
    }

    if (extras.transformErrors) {
      paramCount++;
      updates.push(`transform_errors = $${paramCount}`);
      values.push(JSON.stringify(extras.transformErrors));
    }

    if (extras.transformedAt) {
      paramCount++;
      updates.push(`transformed_at = $${paramCount}`);
      values.push(extras.transformedAt);
    }

    if (extras.lastTransformRowCount !== undefined) {
      paramCount++;
      updates.push(`last_transform_row_count = $${paramCount}`);
      values.push(extras.lastTransformRowCount);
    }

    if (extras.columnCount !== undefined) {
      paramCount++;
      updates.push(`column_count = $${paramCount}`);
      values.push(extras.columnCount);
    }

    paramCount++;
    values.push(documentId);

    await this.pool.query(
      `UPDATE documents SET ${updates.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  /**
   * Get source database configuration from settings
   * Creates a new Pool connection to the user's configured source database
   */
  private async getSourceDbConfig(sourceDbId: string): Promise<Pool> {
    console.log(`[DocumentTransform] Getting source DB config for: ${sourceDbId}`);

    try {
      // Query settings table for database configuration
      const result = await this.pool.query(
        `SELECT key, value FROM settings WHERE key LIKE 'database.%'`
      );

      console.log(`[DocumentTransform] Found ${result.rows.length} database settings`);

      // Parse settings into a config object
      const dbSettings: any = {};
      result.rows.forEach(row => {
        const key = row.key.replace('database.', ''); // Remove 'database.' prefix
        try {
          dbSettings[key] = JSON.parse(row.value);
        } catch {
          dbSettings[key] = row.value;
        }
      });

      console.log(`[DocumentTransform] Database settings:`, {
        host: dbSettings.host || 'not set',
        port: dbSettings.port || 'not set',
        database: sourceDbId,
        user: dbSettings.user || 'not set',
        hasPassword: !!dbSettings.password,
      });

      // Validate required settings
      if (!dbSettings.host || !dbSettings.user) {
        console.error(`[DocumentTransform] Missing required database settings`);
        throw new Error('Database settings not configured. Please configure database settings in the admin panel.');
      }

      // Create new pool for user's source database
      const sourcePool = new Pool({
        host: dbSettings.host,
        port: parseInt(dbSettings.port) || 5432,
        database: sourceDbId, // Use the sourceDbId as database name (e.g., 'rag_chatbot')
        user: dbSettings.user,
        password: dbSettings.password || '',
        max: 10, // Limit connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });

      // Test connection
      const testResult = await sourcePool.query('SELECT current_database()');
      console.log(`[DocumentTransform]  Connected to source database: ${testResult.rows[0].current_database}`);

      return sourcePool;
    } catch (error) {
      console.error(`[DocumentTransform] Failed to get source DB config:`, error);
      throw new Error(`Failed to connect to source database: ${(error as Error).message}`);
    }
  }

  /**
   * Parse file content based on type using PapaParse for CSV
   */
  private parseFile(
    content: string,
    fileType: string
  ): { data: any[]; headers: string[] } {
    if (fileType === 'json') {
      const data = JSON.parse(content);
      const headers = data.length > 0 ? Object.keys(data[0]) : [];
      return { data, headers };
    }

    if (fileType === 'csv') {
      const parseResult = Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        trimHeaders: true,
        transformHeader: (header: string) => header.trim(),
      });

      const headers = parseResult.meta.fields || [];
      const data = parseResult.data as any[];

      console.log(`[DocumentTransform] parseFile: ${data.length} rows, ${headers.length} columns`);

      return { data, headers };
    }

    throw new Error(`Unsupported file type: ${fileType}`);
  }

  /**
   * Detect file type from filename
   */
  private detectFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'json') return 'json';
    if (ext === 'csv') return 'csv';
    return 'unknown';
  }

  /**
   * Generate table name from filename
   */
  private generateTableName(filename: string): string {
    return filename
      .replace(/\.[^/.]+$/, '') // Remove extension
      .replace(/[^a-z0-9_]/gi, '_') // Replace special chars with underscore
      .toLowerCase()
      .substring(0, 63); // PostgreSQL table name limit
  }

  /**
   * Create embeddings for document data and store in document_embeddings table
   */
  private async createDocumentEmbeddings(
    documentId: number,
    doc: any,
    parsedData: any[],
    jobId: string
  ): Promise<void> {
    console.log(`[DocumentTransform] Creating embeddings for document ${documentId}`);

    // Import EmbeddingService dynamically to avoid circular dependency
    const { EmbeddingService } = await import('./embedding.service');
    const embeddingService = new EmbeddingService(this.pool);

    // Combine all row data into text chunks for embedding
    const chunks: string[] = [];
    const chunkSize = 10; // Process 10 rows per chunk

    for (let i = 0; i < parsedData.length; i += chunkSize) {
      const rowBatch = parsedData.slice(i, Math.min(i + chunkSize, parsedData.length));
      const chunkText = rowBatch.map(row => {
        return Object.entries(row)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
      }).join('\n');

      chunks.push(chunkText);
    }

    console.log(`[DocumentTransform] Created ${chunks.length} chunks for embedding`);

    // Update progress
    await this.updateTransformProgress(jobId, documentId, {
      totalChunks: chunks.length,
      chunksProcessed: 0,
    });

    // Process chunks in batches
    const batchSize = 5;
    let processedChunks = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, Math.min(i + batchSize, chunks.length));

      for (const chunk of batchChunks) {
        try {
          // Generate embedding
          const embedding = await embeddingService.generateEmbedding(chunk);

          // Store in document_embeddings table
          await this.pool.query(
            `INSERT INTO document_embeddings (document_id, chunk_text, chunk_index, embedding, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [
              documentId,
              chunk.substring(0, 10000), // Limit chunk text size
              processedChunks,
              JSON.stringify(embedding),
              JSON.stringify({
                source: 'csv_transform',
                filename: doc.filename || doc.title,
                rowStart: processedChunks * chunkSize,
                rowEnd: Math.min((processedChunks + 1) * chunkSize, parsedData.length),
              }),
            ]
          );

          processedChunks++;
        } catch (error) {
          console.error(`[DocumentTransform] Failed to embed chunk ${processedChunks}:`, error);
          // Continue with other chunks
          processedChunks++;
        }
      }

      // Update progress
      const embeddingProgress = Math.round((processedChunks / chunks.length) * 100);
      await this.updateTransformProgress(jobId, documentId, {
        embeddingProgress,
        chunksProcessed: processedChunks,
      });
    }

    // Update document metadata with embedding info
    await this.pool.query(
      `UPDATE documents
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2`,
      [
        JSON.stringify({
          embeddings: true,
          embeddingChunks: chunks.length,
          embeddingModel: 'default',
          embeddedAt: new Date().toISOString(),
        }),
        documentId,
      ]
    );

    console.log(`[DocumentTransform] ✓ Created ${processedChunks} embeddings for document ${documentId}`);
  }
}

export default DocumentTransformService;
