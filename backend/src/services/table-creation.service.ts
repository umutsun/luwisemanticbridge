/**
 * Table Creation Service
 * Handles table creation and data insertion in source_db
 */

import { Pool, PoolClient } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

export interface TableCreationOptions {
  targetDb?: string;
  importData?: boolean;
  batchSize?: number;
}

export interface TableCreationProgress {
  jobId: string;
  status: 'PENDING' | 'CREATING_TABLE' | 'INSERTING_DATA' | 'COMPLETED' | 'FAILED';
  tableName: string;
  progress: number;
  rowsInserted: number;
  totalRows: number;
  currentBatch?: number;
  totalBatches?: number;
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
}

export class TableCreationService {
  constructor(
    private pool: Pool,
    private redis: Redis
  ) {}

  /**
   * Check if table exists and get metadata
   */
  async checkTableStatus(tableName: string): Promise<{
    exists: boolean;
    rowCount?: number;
    columns?: Array<{ name: string; type: string; nullable: boolean }>;
    lastModified?: Date;
  }> {
    const client = await this.pool.connect();

    try {
      // Check if table exists
      const tableExistsResult = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )
      `, [tableName]);

      const exists = tableExistsResult.rows[0].exists;

      if (!exists) {
        return { exists: false };
      }

      // Get row count
      const rowCountResult = await client.query(`
        SELECT COUNT(*) as count FROM ${tableName}
      `);
      const rowCount = parseInt(rowCountResult.rows[0].count, 10);

      // Get column information
      const columnsResult = await client.query(`
        SELECT
          column_name as name,
          data_type as type,
          is_nullable as nullable
        FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      const columns = columnsResult.rows.map(row => ({
        name: row.name,
        type: row.type,
        nullable: row.nullable === 'YES'
      }));

      console.log(`[TableCreation] Table "${tableName}" exists with ${rowCount} rows and ${columns.length} columns`);

      return {
        exists: true,
        rowCount,
        columns,
      };

    } catch (error) {
      console.error('[TableCreation] Error checking table status:', error);
      return { exists: false };
    } finally {
      client.release();
    }
  }

  /**
   * Create table from schema suggestion
   */
  async createTableFromSchema(
    tableName: string,
    columns: any[],
    constraints: any[],
    indexes: any[],
    options: TableCreationOptions = {}
  ): Promise<{ success: boolean; errors: string[] }> {
    const client = await this.pool.connect();
    const errors: string[] = [];

    try {
      await client.query('BEGIN');

      // Log current database
      const dbResult = await client.query('SELECT current_database()');
      console.log(`[TableCreation] Current database: ${dbResult.rows[0].current_database}`);

      // Generate CREATE TABLE SQL
      const createTableSQL = this.generateCreateTableSQL(tableName, columns, constraints);

      console.log(`[TableCreation] Creating table: ${tableName}`);
      console.log(`[TableCreation] SQL: ${createTableSQL}`);

      // Check if table exists
      const checkTableSQL = `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = $1`;
      const existsResult = await client.query(checkTableSQL, [tableName]);

      if (existsResult.rows.length > 0) {
        console.warn(`[TableCreation] Table ${tableName} already exists! Dropping it first...`);
        await client.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
        console.log(`[TableCreation] Dropped existing table: ${tableName}`);
      }

      await client.query(createTableSQL);

      // Create indexes
      for (const index of indexes) {
        if (index.name.includes('_pkey')) continue; // Skip primary key index (auto-created)

        try {
          const indexSQL = this.generateCreateIndexSQL(tableName, index);
          console.log(`[TableCreation] Creating index: ${index.name}`);
          await client.query(indexSQL);
        } catch (error) {
          const errMsg = `Failed to create index ${index.name}: ${(error as Error).message}`;
          console.error(`[TableCreation] ${errMsg}`);
          errors.push(errMsg);
        }
      }

      await client.query('COMMIT');

      console.log(`[TableCreation] Table ${tableName} created successfully`);
      return { success: true, errors };
    } catch (error) {
      await client.query('ROLLBACK');
      const errMsg = `Table creation failed: ${(error as Error).message}`;
      console.error(`[TableCreation] ${errMsg}`);
      errors.push(errMsg);
      return { success: false, errors };
    } finally {
      client.release();
    }
  }

  /**
   * Convert Turkish date format (DD.MM.YYYY) to PostgreSQL format (YYYY-MM-DD)
   */
  private convertDateFormat(value: any, columnType: string): any {
    if (!value || typeof value !== 'string') return value;
    if (!columnType.toLowerCase().includes('date') && !columnType.toLowerCase().includes('timestamp')) return value;

    // Check if value is in Turkish date format: DD.MM.YYYY
    const turkishDatePattern = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
    const match = value.match(turkishDatePattern);

    if (match) {
      const [, day, month, year] = match;
      // Convert to ISO format: YYYY-MM-DD
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return value;
  }

  /**
   * Insert data into table with batch processing
   */
  async insertDataIntoTable(
    tableName: string,
    data: any[],
    columns: any[],
    options: {
      batchSize?: number;
      jobId?: string;
      resumeFromRow?: number; // For resume: offset for progress calculation
      totalRowsInCSV?: number; // For resume: total rows in original CSV
    } = {}
  ): Promise<{ rowsInserted: number; rowsFailed: number; errors: string[] }> {
    const batchSize = options.batchSize || 100;
    const jobId = options.jobId || uuidv4();
    const resumeFromRow = options.resumeFromRow || 0;
    const totalRowsInCSV = options.totalRowsInCSV || data.length;

    let rowsInserted = 0;
    let rowsFailed = 0;
    const errors: string[] = [];

    // Update progress in Redis (with resume support)
    await this.updateProgress(jobId, {
      status: 'INSERTING_DATA',
      progress: Math.round((resumeFromRow / totalRowsInCSV) * 100),
      rowsInserted: resumeFromRow,
      totalRows: totalRowsInCSV,
      currentBatch: Math.ceil(resumeFromRow / batchSize),
      totalBatches: Math.ceil(totalRowsInCSV / batchSize),
    });

    const client = await this.pool.connect();

    try {
      // Get column names (exclude auto-generated columns: SERIAL, and columns with DEFAULT values)
      const dataColumns = columns.filter(c => c.type !== 'SERIAL' && !c.defaultValue);
      const columnNames = dataColumns.map(c => c.name);

      console.log(`[TableCreation] Insert columns (${columnNames.length}):`, columnNames);

      // Debug: Log column mapping info for first row
      if (data.length > 0) {
        const firstRow = data[0];
        const rowKeys = Object.keys(firstRow);
        console.log(`[TableCreation] First row keys from CSV (${rowKeys.length}):`, rowKeys);
        console.log(`[TableCreation] Column mapping info:`, dataColumns.map(c => ({
          name: c.name,
          originalFieldName: c.originalFieldName || 'N/A'
        })));
      }

      // Process in batches
      for (let i = 0; i < data.length; i += batchSize) {
        // Check if job was paused
        if (jobId) {
          const currentProgress = await this.redis.get(`table_creation:${jobId}`);
          if (currentProgress) {
            const parsed = JSON.parse(currentProgress);
            if (parsed.status === 'CANCELLED') {
              console.log(`[TableCreation] Job ${jobId} was paused, stopping insert`);
              break;
            }
          }
        }

        const batch = data.slice(i, Math.min(i + batchSize, data.length));

        try {
          await client.query('BEGIN');

          for (let rowIdx = 0; rowIdx < batch.length; rowIdx++) {
            const row = batch[rowIdx];
            const savepointName = `sp_row_${rowIdx}`;

            try {
              // Create savepoint before each row to handle errors gracefully
              await client.query(`SAVEPOINT ${savepointName}`);

              // Build INSERT statement
              const values: any[] = [];
              const placeholders: string[] = [];

              dataColumns.forEach((column, idx) => {
                const colName = column.name;
                // Use originalFieldName if available, fallback to column name for case-insensitive match
                const originalFieldName = column.originalFieldName;

                let dataKey: string | undefined;

                if (originalFieldName) {
                  // Direct match using original CSV header name
                  dataKey = Object.keys(row).find(k => k === originalFieldName);
                }

                if (!dataKey) {
                  // Fallback: case-insensitive match on column name
                  dataKey = Object.keys(row).find(
                    k => k.toLowerCase() === colName.toLowerCase()
                  );
                }

                if (!dataKey) {
                  // Fallback 2: normalize and compare (handle spaces/special chars)
                  const normalizedColName = colName.replace(/_/g, ' ').toLowerCase();
                  dataKey = Object.keys(row).find(
                    k => k.toLowerCase() === normalizedColName ||
                         k.replace(/[^a-z0-9]/gi, '_').toLowerCase() === colName
                  );
                }

                if (dataKey !== undefined) {
                  // Get column type for date conversion
                  const columnType = column.type || 'TEXT';

                  // Convert Turkish dates to PostgreSQL format
                  const convertedValue = this.convertDateFormat(row[dataKey], columnType);
                  values.push(convertedValue);
                  placeholders.push(`$${idx + 1}`);
                } else {
                  values.push(null);
                  placeholders.push(`$${idx + 1}`);
                }
              });

              const insertSQL = `
                INSERT INTO ${tableName} (${columnNames.join(', ')})
                VALUES (${placeholders.join(', ')})
              `;

              await client.query(insertSQL, values);
              // Release savepoint on success
              await client.query(`RELEASE SAVEPOINT ${savepointName}`);
              rowsInserted++;
            } catch (rowError) {
              // Rollback to savepoint on error - this keeps the transaction alive
              await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
              rowsFailed++;
              const errMsg = `Row ${i + rowIdx}: ${(rowError as Error).message}`;
              errors.push(errMsg);
              console.error(`[TableCreation] ${errMsg}`);
            }
          }

          await client.query('COMMIT');

          // Update progress with detailed info (resume-aware)
          const totalInserted = resumeFromRow + rowsInserted;
          const progress = Math.round((totalInserted / totalRowsInCSV) * 100);
          const currentBatch = Math.ceil(totalInserted / batchSize);
          const totalBatches = Math.ceil(totalRowsInCSV / batchSize);

          await this.updateProgress(jobId, {
            status: 'INSERTING_DATA',
            progress,
            rowsInserted: totalInserted,
            totalRows: totalRowsInCSV,
            currentBatch,
            totalBatches,
          });

          console.log(`[TableCreation] Progress: ${progress}% | Batch ${currentBatch}/${totalBatches} | Rows ${totalInserted}/${totalRowsInCSV}`);
        } catch (batchError) {
          await client.query('ROLLBACK');
          const errMsg = `Batch ${i}-${i + batchSize} failed: ${(batchError as Error).message}`;
          errors.push(errMsg);
          console.error(`[TableCreation] ${errMsg}`);
        }
      }

      return { rowsInserted, rowsFailed, errors };
    } finally {
      client.release();
    }
  }

  /**
   * Smart insert/update: Check if table exists and handle accordingly
   * Returns action taken: CREATED | APPENDED | REPLACED | SKIPPED
   */
  async smartInsertOrUpdate(
    tableName: string,
    columns: any[],
    constraints: any[],
    indexes: any[],
    data: any[],
    options: TableCreationOptions & {
      jobId?: string;
      action?: 'AUTO' | 'APPEND' | 'REPLACE' | 'DROP';
    } = {}
  ): Promise<{
    success: boolean;
    action: 'CREATED' | 'APPENDED' | 'REPLACED' | 'DROPPED' | 'SKIPPED';
    rowsInserted: number;
    rowsFailed: number;
    existingRows?: number;
    newRows?: number;
    errors: string[];
    warnings: string[];
  }> {
    const jobId = options.jobId || uuidv4();
    const action = options.action || 'AUTO';
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if table exists
      const tableStatus = await this.checkTableStatus(tableName);

      // Case 1: Table doesn't exist - create and populate
      if (!tableStatus.exists) {
        console.log(`[SmartInsert] Table "${tableName}" doesn't exist. Creating...`);

        const result = await this.createAndPopulateTable(
          tableName,
          columns,
          constraints,
          indexes,
          data,
          { ...options, jobId }
        );

        return {
          ...result,
          action: 'CREATED',
          newRows: data.length,
        };
      }

      // Case 2: Table exists - decide action
      const existingRowCount = tableStatus.rowCount || 0;
      const newDataRowCount = data.length;

      console.log(`[SmartInsert] Table "${tableName}" exists with ${existingRowCount} rows. CSV has ${newDataRowCount} rows.`);

      // AUTO mode: Intelligent decision
      if (action === 'AUTO') {
        if (newDataRowCount <= existingRowCount) {
          console.log(`[SmartInsert] CSV has same or fewer rows. Skipping insert.`);
          return {
            success: true,
            action: 'SKIPPED',
            rowsInserted: 0,
            rowsFailed: 0,
            existingRows: existingRowCount,
            newRows: 0,
            errors: [],
            warnings: [`Table already has ${existingRowCount} rows, CSV has ${newDataRowCount}. No action taken.`],
          };
        }

        // CSV has more rows - append only new ones
        console.log(`[SmartInsert] CSV has ${newDataRowCount - existingRowCount} new rows. Appending...`);

        const newRows = data.slice(existingRowCount); // Get only new rows

        const insertResult = await this.insertDataIntoTable(
          tableName,
          newRows,
          columns,
          {
            batchSize: options.batchSize,
            jobId,
            resumeFromRow: existingRowCount, // Resume from where we left off
            totalRowsInCSV: newDataRowCount, // Total rows in CSV
          }
        );

        return {
          success: insertResult.rowsInserted > 0,
          action: 'APPENDED',
          rowsInserted: insertResult.rowsInserted,
          rowsFailed: insertResult.rowsFailed,
          existingRows: existingRowCount,
          newRows: newRows.length,
          errors: insertResult.errors,
          warnings,
        };
      }

      // APPEND mode: Always append new rows
      if (action === 'APPEND') {
        const newRows = data.slice(existingRowCount);

        if (newRows.length === 0) {
          return {
            success: true,
            action: 'SKIPPED',
            rowsInserted: 0,
            rowsFailed: 0,
            existingRows: existingRowCount,
            newRows: 0,
            errors: [],
            warnings: ['No new rows to append'],
          };
        }

        const insertResult = await this.insertDataIntoTable(
          tableName,
          newRows,
          columns,
          { batchSize: options.batchSize, jobId }
        );

        return {
          success: true,
          action: 'APPENDED',
          rowsInserted: insertResult.rowsInserted,
          rowsFailed: insertResult.rowsFailed,
          existingRows: existingRowCount,
          newRows: newRows.length,
          errors: insertResult.errors,
          warnings,
        };
      }

      // REPLACE mode: Truncate and insert all
      if (action === 'REPLACE') {
        console.log(`[SmartInsert] REPLACE mode: Truncating table "${tableName}"...`);

        const client = await this.pool.connect();
        try {
          await client.query(`TRUNCATE TABLE ${tableName} RESTART IDENTITY`);
          console.log(`[SmartInsert] Table truncated successfully`);
        } finally {
          client.release();
        }

        const insertResult = await this.insertDataIntoTable(
          tableName,
          data,
          columns,
          { batchSize: options.batchSize, jobId }
        );

        return {
          success: true,
          action: 'REPLACED',
          rowsInserted: insertResult.rowsInserted,
          rowsFailed: insertResult.rowsFailed,
          existingRows: existingRowCount,
          newRows: data.length,
          errors: insertResult.errors,
          warnings: [`Replaced ${existingRowCount} existing rows with ${data.length} new rows`],
        };
      }

      // DROP mode: Drop table and recreate
      if (action === 'DROP') {
        console.log(`[SmartInsert] DROP mode: Dropping and recreating table "${tableName}"...`);

        const result = await this.createAndPopulateTable(
          tableName,
          columns,
          constraints,
          indexes,
          data,
          { ...options, jobId }
        );

        return {
          ...result,
          action: 'DROPPED',
          existingRows: existingRowCount,
          newRows: data.length,
        };
      }

      // Shouldn't reach here
      return {
        success: false,
        action: 'SKIPPED',
        rowsInserted: 0,
        rowsFailed: 0,
        errors: ['Invalid action specified'],
        warnings: [],
      };

    } catch (error) {
      console.error('[SmartInsert] Error:', error);
      return {
        success: false,
        action: 'SKIPPED',
        rowsInserted: 0,
        rowsFailed: 0,
        errors: [(error as Error).message],
        warnings: [],
      };
    }
  }

  /**
   * Complete pipeline: create table and insert data
   */
  async createAndPopulateTable(
    tableName: string,
    columns: any[],
    constraints: any[],
    indexes: any[],
    data: any[],
    options: TableCreationOptions & { jobId?: string } = {}
  ): Promise<{
    success: boolean;
    rowsInserted: number;
    rowsFailed: number;
    errors: string[];
    warnings: string[];
  }> {
    const jobId = options.jobId || uuidv4(); // Use provided jobId or generate new one
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Initialize progress
      await this.updateProgress(jobId, {
        status: 'CREATING_TABLE',
        progress: 0,
        rowsInserted: 0,
        totalRows: data.length,
      });

      // Step 1: Create table
      const createResult = await this.createTableFromSchema(
        tableName,
        columns,
        constraints,
        indexes,
        options
      );

      if (!createResult.success) {
        errors.push(...createResult.errors);
        await this.updateProgress(jobId, { status: 'FAILED' });
        return {
          success: false,
          rowsInserted: 0,
          rowsFailed: 0,
          errors,
          warnings: createResult.errors,
        };
      }

      if (createResult.errors.length > 0) {
        warnings.push(...createResult.errors);
      }

      // Step 2: Insert data (if requested)
      let rowsInserted = 0;
      let rowsFailed = 0;

      if (options.importData && data.length > 0) {
        const insertResult = await this.insertDataIntoTable(
          tableName,
          data,
          columns,
          { batchSize: options.batchSize, jobId }
        );

        rowsInserted = insertResult.rowsInserted;
        rowsFailed = insertResult.rowsFailed;
        errors.push(...insertResult.errors);
      }

      // Complete
      await this.updateProgress(jobId, {
        status: 'COMPLETED',
        progress: 100,
        rowsInserted,
      });

      const executionTime = (Date.now() - startTime) / 1000;
      console.log(`[TableCreation] Pipeline completed in ${executionTime}s`);

      return {
        success: true,
        rowsInserted,
        rowsFailed,
        errors,
        warnings,
      };
    } catch (error) {
      await this.updateProgress(jobId, { status: 'FAILED' });
      errors.push(`Pipeline failed: ${(error as Error).message}`);
      console.error('[TableCreation] Pipeline error:', error);

      return {
        success: false,
        rowsInserted: 0,
        rowsFailed: 0,
        errors,
        warnings,
      };
    }
  }

  /**
   * Update progress in Redis
   */
  private async updateProgress(
    jobId: string,
    update: Partial<Omit<TableCreationProgress, 'jobId' | 'tableName' | 'startedAt'>>
  ): Promise<void> {
    const key = `table_creation:${jobId}`;
    const existing = await this.redis.get(key);

    let progress: TableCreationProgress;

    if (existing) {
      progress = { ...JSON.parse(existing), ...update };
    } else {
      progress = {
        jobId,
        tableName: '',
        status: 'PENDING',
        progress: 0,
        rowsInserted: 0,
        totalRows: 0,
        errors: [],
        startedAt: new Date(),
        ...update,
      };
    }

    if (update.status === 'COMPLETED' || update.status === 'FAILED') {
      progress.completedAt = new Date();
    }

    // Store in Redis with 1 hour expiration
    await this.redis.setex(key, 3600, JSON.stringify(progress));

    // Publish progress update
    await this.redis.publish(`table_creation_progress:${jobId}`, JSON.stringify(progress));
  }

  /**
   * Get progress from Redis
   */
  async getProgress(jobId: string): Promise<TableCreationProgress | null> {
    const key = `table_creation:${jobId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Generate CREATE TABLE SQL
   */
  private generateCreateTableSQL(
    tableName: string,
    columns: any[],
    constraints: any[]
  ): string {
    const columnDefs = columns.map((col) => {
      let def = `  ${col.name} ${col.type}`;
      if (!col.nullable) def += ' NOT NULL';
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
      if (col.comment) def += ` -- ${col.comment}`;
      return def;
    });

    const constraintDefs = constraints.map(
      (c) => `  CONSTRAINT ${c.name} ${c.definition}`
    );

    const allDefs = [...columnDefs, ...constraintDefs];

    return `CREATE TABLE ${tableName} (\n${allDefs.join(',\n')}\n);`;
  }

  /**
   * Generate CREATE INDEX SQL
   */
  private generateCreateIndexSQL(tableName: string, index: any): string {
    const uniqueKeyword = index.unique ? 'UNIQUE ' : '';
    const usingClause = index.type && index.type !== 'BTREE' ? ` USING ${index.type}` : '';

    return `CREATE ${uniqueKeyword}INDEX ${index.name} ON ${tableName}${usingClause} (${index.columns.join(', ')});`;
  }
}

export default TableCreationService;
