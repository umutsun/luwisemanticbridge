/**
 * Data Pipeline Resolvers
 * Scraped data analysis, table suggestion, and migration
 */

import { GraphQLContext } from '../context';
import { requireAuth, requireAdmin } from '../context';
import dataAnalysisService from '../../services/data-analysis.service';
import TableCreationService from '../../services/table-creation.service';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const dataPipelineResolvers = {
  Query: {
    /**
     * Analyze scraped data structure and quality
     */
    analyzeScrapedData: async (
      _: any,
      {
        source,
        projectKey,
        options,
      }: {
        source: string;
        projectKey: string;
        options?: any;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        // Read scraped data file
        let data: any[];

        // Check if source is a file path
        if (existsSync(source)) {
          const fileContent = readFileSync(source, 'utf-8');

          // Detect file type and parse
          if (source.endsWith('.json')) {
            data = JSON.parse(fileContent);
          } else if (source.endsWith('.csv')) {
            // Simple CSV parsing
            const lines = fileContent.split('\n').filter(l => l.trim());
            if (lines.length < 2) throw new Error('CSV file must have at least 2 lines (header + data)');

            const headers = lines[0].split(',').map(h => h.trim());
            data = lines.slice(1).map(line => {
              const values = line.split(',').map(v => v.trim());
              const row: any = {};
              headers.forEach((header, i) => {
                row[header] = values[i] || null;
              });
              return row;
            });
          } else {
            throw new Error('Unsupported file format. Use JSON or CSV.');
          }
        } else {
          // Assume source is JSON string
          try {
            data = JSON.parse(source);
          } catch (e) {
            throw new Error('Invalid JSON data');
          }
        }

        // Validate data
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('Data must be a non-empty array');
        }

        // Run analysis
        const analysis = await dataAnalysisService.analyzeScrapedData(
          data,
          source,
          projectKey,
          options || {}
        );

        return {
          ...analysis,
          analyzedBy: context.user?.email,
        };
      } catch (error) {
        console.error('[GraphQL] analyzeScrapedData error:', error);
        throw new Error(`Data analysis failed: ${(error as Error).message}`);
      }
    },

    /**
     * Get table schema suggestion based on analysis
     */
    suggestTableSchema: async (
      _: any,
      {
        dataAnalysisId,
        targetDb,
        customizations,
      }: {
        dataAnalysisId: string;
        targetDb?: string;
        customizations?: any;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        // Get analysis from cache
        const analysis = dataAnalysisService.getAnalysis(dataAnalysisId);

        if (!analysis) {
          throw new Error('Data analysis not found or expired');
        }

        // Generate table name (use entity name or default)
        const entityName =
          analysis.detectedEntities[0]?.name || 'scraped_data';
        let tableName = customizations?.tableName || entityName.toLowerCase();

        // Sanitize table name
        tableName = tableName.replace(/[^a-z0-9_]/g, '_');

        // Build column definitions
        const columns = analysis.fieldTypes.map((field) => {
          // Apply customizations if provided
          const customType = customizations?.columnTypes?.find(
            (ct: any) => ct.columnName === field.fieldName
          );

          return {
            name: field.fieldName.replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
            type: customType?.sqlType || field.suggestedSQLType,
            nullable: customType?.nullable !== undefined ? customType.nullable : field.nullable,
            defaultValue: customType?.defaultValue,
            isPrimaryKey: field.isPrimaryKey,
            isUnique: field.isUnique,
            isForeignKey: false,
            references: null,
            comment: null,
          };
        });

        // Ensure primary key exists
        let primaryKeyColumn = columns.find((c) => c.isPrimaryKey);
        if (!primaryKeyColumn) {
          // Add auto-increment ID
          columns.unshift({
            name: 'id',
            type: 'SERIAL',
            nullable: false,
            defaultValue: null,
            isPrimaryKey: true,
            isUnique: true,
            isForeignKey: false,
            references: null,
            comment: 'Auto-generated primary key',
          });
          primaryKeyColumn = columns[0];
        }

        // Build indexes
        const indexes = [
          {
            name: `${tableName}_pkey`,
            columns: [primaryKeyColumn.name],
            type: 'BTREE' as const,
            unique: true,
          },
          // Add indexes for unique columns
          ...columns
            .filter((c) => c.isUnique && !c.isPrimaryKey)
            .map((c) => ({
              name: `${tableName}_${c.name}_key`,
              columns: [c.name],
              type: 'BTREE' as const,
              unique: true,
            })),
        ];

        // Build constraints
        const constraints = [
          {
            name: `${tableName}_pkey`,
            type: 'PRIMARY_KEY' as const,
            columns: [primaryKeyColumn.name],
            definition: `PRIMARY KEY (${primaryKeyColumn.name})`,
          },
        ];

        // Generate CREATE TABLE SQL
        const createTableSQL = generateCreateTableSQL(
          tableName,
          columns,
          constraints
        );

        // Estimate size
        const avgRowSize = columns.reduce((sum, col) => {
          if (col.type.includes('INTEGER')) return sum + 4;
          if (col.type.includes('BIGINT')) return sum + 8;
          if (col.type.includes('VARCHAR')) {
            const size = parseInt(col.type.match(/\d+/)?.[0] || '255');
            return sum + size / 2; // Assume 50% utilization
          }
          return sum + 100; // Default for TEXT, JSONB, etc.
        }, 0);
        const estimatedSize = `${((avgRowSize * analysis.rowCount) / 1024 / 1024).toFixed(2)} MB`;

        // Check for conflicts with existing tables
        const conflicts = await checkSchemaConflicts(
          tableName,
          columns,
          targetDb || 'default',
          context
        );

        // Generate warnings and recommendations
        const warnings: string[] = [];
        const recommendations: string[] = [];

        if (analysis.dataQualityScore < 0.7) {
          warnings.push(
            `Low data quality score: ${(analysis.dataQualityScore * 100).toFixed(0)}%`
          );
          recommendations.push('Review and fix data quality issues before importing');
        }

        if (analysis.issues.some((i) => i.severity === 'ERROR')) {
          warnings.push('Data contains errors that must be fixed');
        }

        const isValid = conflicts.length === 0 && !warnings.some((w) => w.includes('must be fixed'));

        return {
          id: `schema_${dataAnalysisId}`,
          dataAnalysisId,
          tableName,
          columns,
          primaryKey: primaryKeyColumn.name,
          indexes,
          constraints,
          createTableSQL,
          estimatedSize,
          conflicts,
          warnings,
          recommendations,
          isValid,
          validationErrors: isValid ? [] : ['Schema has conflicts or critical issues'],
        };
      } catch (error) {
        console.error('[GraphQL] suggestTableSchema error:', error);
        throw new Error(`Schema suggestion failed: ${(error as Error).message}`);
      }
    },

    /**
     * Get existing tables in client database
     */
    existingTables: async (
      _: any,
      {
        clientDb,
        schema = 'public',
        includeSystemTables = false,
      }: {
        clientDb?: string;
        schema?: string;
        includeSystemTables?: boolean;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        // Use settings to get client DB connection
        // For now, use the same pool (assume client DB = current DB)
        const query = `
          SELECT
            table_schema as schema,
            table_name as name,
            (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
          FROM information_schema.tables t
          WHERE table_schema = $1
            ${includeSystemTables ? '' : "AND table_type = 'BASE TABLE'"}
          ORDER BY table_name
        `;

        const result = await context.pool.query(query, [schema]);

        // Get detailed info for each table
        const tables = await Promise.all(
          result.rows.map(async (row: any) => {
            // Get columns
            const colResult = await context.pool.query(
              `SELECT
                column_name as name,
                data_type as type,
                is_nullable = 'YES' as nullable,
                column_default as default_value,
                (SELECT COUNT(*) > 0 FROM information_schema.key_column_usage
                 WHERE table_name = $1 AND column_name = c.column_name
                 AND constraint_name LIKE '%_pkey') as is_primary_key
              FROM information_schema.columns c
              WHERE table_schema = $1 AND table_name = $2
              ORDER BY ordinal_position`,
              [schema, row.name]
            );

            // Get indexes
            const idxResult = await context.pool.query(
              `SELECT
                indexname as name,
                indexdef
              FROM pg_indexes
              WHERE schemaname = $1 AND tablename = $2`,
              [schema, row.name]
            );

            // Get row count (expensive, so make it optional)
            let rowCount = null;
            try {
              const countResult = await context.pool.query(
                `SELECT COUNT(*) as count FROM ${schema}.${row.name} LIMIT 1000`
              );
              rowCount = parseInt(countResult.rows[0].count);
            } catch (e) {
              // Ignore errors (table might not be accessible)
            }

            return {
              schema: row.schema,
              name: row.name,
              rowCount,
              sizeInBytes: null, // TODO: Get actual size
              columns: colResult.rows.map((col: any) => ({
                name: col.name,
                type: col.type,
                nullable: col.nullable,
                defaultValue: col.default_value,
                isPrimaryKey: col.is_primary_key,
                isUnique: false, // TODO: Check unique constraints
                comment: null,
              })),
              indexes: idxResult.rows.map((idx: any) => ({
                name: idx.name,
                columns: extractColumnsFromIndexDef(idx.indexdef),
                type: 'BTREE',
                unique: idx.indexdef.includes('UNIQUE'),
              })),
              foreignKeys: [], // TODO: Get foreign keys
              createdAt: null,
              lastModified: null,
            };
          })
        );

        return tables;
      } catch (error) {
        console.error('[GraphQL] existingTables error:', error);
        throw new Error(`Failed to fetch tables: ${(error as Error).message}`);
      }
    },

    /**
     * Get specific table details
     */
    tableDetails: async (
      _: any,
      {
        clientDb,
        tableName,
        schema = 'public',
      }: {
        clientDb?: string;
        tableName: string;
        schema?: string;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        // Call existingTables and filter for specific table
        const tables = await dataPipelineResolvers.Query.existingTables(
          _,
          { clientDb, schema, includeSystemTables: false },
          context
        );

        const table = tables.find((t: any) => t.name === tableName);

        if (!table) {
          throw new Error(`Table '${tableName}' not found`);
        }

        return table;
      } catch (error) {
        console.error('[GraphQL] tableDetails error:', error);
        throw new Error(`Failed to fetch table details: ${(error as Error).message}`);
      }
    },

    /**
     * Get data analysis by ID
     */
    dataAnalysis: async (
      _: any,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const analysis = dataAnalysisService.getAnalysis(id);

      if (!analysis) {
        throw new Error('Data analysis not found or expired');
      }

      return analysis;
    },

    /**
     * List all data analyses for a project
     */
    dataAnalyses: async (
      _: any,
      {
        projectKey,
        limit = 20,
        offset = 0,
      }: {
        projectKey: string;
        limit?: number;
        offset?: number;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      // TODO: Store analyses in database for persistence
      // For now, return empty list (in-memory cache only)

      return {
        items: [],
        total: 0,
        hasMore: false,
      };
    },
  },

  Mutation: {
    /**
     * Create table from analyzed data schema
     */
    createTableFromData: async (
      _: any,
      {
        schemaId,
        targetDb,
        importData = true,
      }: {
        schemaId: string;
        targetDb?: string;
        importData?: boolean;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const startTime = Date.now();
      const errors: string[] = [];
      const warnings: string[] = [];

      try {
        // Parse schema ID to get dataAnalysisId
        // Format: schema_{dataAnalysisId}
        const dataAnalysisId = schemaId.replace('schema_', '');

        // Get analysis from cache
        const analysis = dataAnalysisService.getAnalysis(dataAnalysisId);
        if (!analysis) {
          throw new Error('Data analysis not found or expired. Please re-analyze the data.');
        }

        // Get suggested schema (re-generate it)
        const schemaResult = await dataPipelineResolvers.Query.suggestTableSchema(
          _,
          { dataAnalysisId, targetDb },
          context
        );

        if (!schemaResult.isValid) {
          errors.push(...schemaResult.validationErrors);
          return {
            success: false,
            tableName: schemaResult.tableName,
            rowsInserted: 0,
            errors,
            warnings: schemaResult.warnings,
            executionTime: (Date.now() - startTime) / 1000,
            tableSchema: schemaResult,
          };
        }

        // Initialize table creation service
        const tableCreationService = new TableCreationService(context.pool, context.redis);

        // Read source data for insertion
        let sourceData: any[] = [];
        if (importData) {
          if (existsSync(analysis.source)) {
            const fileContent = readFileSync(analysis.source, 'utf-8');

            if (analysis.source.endsWith('.json')) {
              sourceData = JSON.parse(fileContent);
            } else if (analysis.source.endsWith('.csv')) {
              const lines = fileContent.split('\n').filter(l => l.trim());
              const headers = lines[0].split(',').map(h => h.trim());
              sourceData = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim());
                const row: any = {};
                headers.forEach((header, i) => { row[header] = values[i] || null; });
                return row;
              });
            }
          } else {
            // Source is JSON string
            try {
              sourceData = JSON.parse(analysis.source);
            } catch (e) {
              warnings.push('Could not parse source data for import');
              importData = false;
            }
          }
        }

        // Create table and populate
        const result = await tableCreationService.createAndPopulateTable(
          schemaResult.tableName,
          schemaResult.columns,
          schemaResult.constraints,
          schemaResult.indexes,
          sourceData,
          { importData, batchSize: 100 }
        );

        const executionTime = (Date.now() - startTime) / 1000;

        return {
          success: result.success,
          tableName: schemaResult.tableName,
          rowsInserted: result.rowsInserted,
          errors: [...errors, ...result.errors],
          warnings: [...warnings, ...result.warnings],
          executionTime,
          tableSchema: schemaResult,
        };
      } catch (error) {
        console.error('[GraphQL] createTableFromData error:', error);
        errors.push(`Table creation failed: ${(error as Error).message}`);

        return {
          success: false,
          tableName: '',
          rowsInserted: 0,
          errors,
          warnings,
          executionTime: (Date.now() - startTime) / 1000,
          tableSchema: null,
        };
      }
    },

    /**
     * Insert data into existing table
     */
    insertDataIntoTable: async (
      _: any,
      {
        tableName,
        dataAnalysisId,
        targetDb,
        batchSize = 100,
      }: {
        tableName: string;
        dataAnalysisId: string;
        targetDb?: string;
        batchSize?: number;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const startTime = Date.now();

      try {
        // Get analysis from cache
        const analysis = dataAnalysisService.getAnalysis(dataAnalysisId);
        if (!analysis) {
          throw new Error('Data analysis not found or expired');
        }

        // Read source data
        let sourceData: any[] = [];
        if (existsSync(analysis.source)) {
          const fileContent = readFileSync(analysis.source, 'utf-8');

          if (analysis.source.endsWith('.json')) {
            sourceData = JSON.parse(fileContent);
          } else if (analysis.source.endsWith('.csv')) {
            const lines = fileContent.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(h => h.trim());
            sourceData = lines.slice(1).map(line => {
              const values = line.split(',').map(v => v.trim());
              const row: any = {};
              headers.forEach((header, i) => { row[header] = values[i] || null; });
              return row;
            });
          }
        }

        // Get table columns
        const tableInfo = await dataPipelineResolvers.Query.tableDetails(
          _,
          { tableName, schema: 'public' },
          context
        );

        if (!tableInfo) {
          throw new Error(`Table '${tableName}' not found`);
        }

        // Initialize service and insert data
        const tableCreationService = new TableCreationService(context.pool, context.redis);
        const result = await tableCreationService.insertDataIntoTable(
          tableName,
          sourceData,
          tableInfo.columns,
          { batchSize }
        );

        const executionTime = (Date.now() - startTime) / 1000;

        return {
          success: result.rowsInserted > 0,
          rowsInserted: result.rowsInserted,
          rowsFailed: result.rowsFailed,
          errors: result.errors,
          executionTime,
        };
      } catch (error) {
        console.error('[GraphQL] insertDataIntoTable error:', error);

        return {
          success: false,
          rowsInserted: 0,
          rowsFailed: 0,
          errors: [`Data insertion failed: ${(error as Error).message}`],
          executionTime: (Date.now() - startTime) / 1000,
        };
      }
    },

    /**
     * Complete pipeline: analyze -> create -> populate
     */
    createAndPopulateTable: async (
      _: any,
      {
        source,
        projectKey,
        tableName,
        targetDb,
        embedAfterInsert = false,
      }: {
        source: string;
        projectKey: string;
        tableName?: string;
        targetDb?: string;
        embedAfterInsert?: boolean;
      },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const startTime = Date.now();
      const errors: string[] = [];
      const warnings: string[] = [];

      try {
        console.log('[GraphQL] Starting complete pipeline:', { source, projectKey, tableName });

        // Step 1: Analyze data
        const analysis = await dataPipelineResolvers.Query.analyzeScrapedData(
          _,
          { source, projectKey, options: {} },
          context
        );

        console.log('[GraphQL] Analysis complete:', {
          id: analysis.id,
          rowCount: analysis.rowCount,
          columnCount: analysis.columnCount,
        });

        // Step 2: Get schema suggestion
        const customizations = tableName ? { tableName } : undefined;
        const schema = await dataPipelineResolvers.Query.suggestTableSchema(
          _,
          { dataAnalysisId: analysis.id, targetDb, customizations },
          context
        );

        if (!schema.isValid) {
          errors.push(...schema.validationErrors);
          return {
            success: false,
            tableName: schema.tableName,
            rowsInserted: 0,
            errors,
            warnings: schema.warnings,
            executionTime: (Date.now() - startTime) / 1000,
            tableSchema: schema,
          };
        }

        console.log('[GraphQL] Schema suggestion complete:', {
          tableName: schema.tableName,
          columnCount: schema.columns.length,
        });

        // Step 3: Create table
        const createResult = await dataPipelineResolvers.Mutation.createTableFromData(
          _,
          { schemaId: schema.id, targetDb, importData: true },
          context
        );

        if (!createResult.success) {
          return createResult;
        }

        console.log('[GraphQL] Table created and populated:', {
          tableName: createResult.tableName,
          rowsInserted: createResult.rowsInserted,
        });

        // Step 4: Embed (if requested)
        if (embedAfterInsert && createResult.rowsInserted > 0) {
          warnings.push('Embedding not yet implemented');
          // TODO: Trigger embedding process
        }

        return createResult;
      } catch (error) {
        console.error('[GraphQL] createAndPopulateTable error:', error);
        errors.push(`Pipeline failed: ${(error as Error).message}`);

        return {
          success: false,
          tableName: '',
          rowsInserted: 0,
          errors,
          warnings,
          executionTime: (Date.now() - startTime) / 1000,
          tableSchema: null,
        };
      }
    },
  },
};

/**
 * Helper: Generate CREATE TABLE SQL
 */
function generateCreateTableSQL(
  tableName: string,
  columns: any[],
  constraints: any[]
): string {
  const columnDefs = columns.map((col) => {
    let def = `  ${col.name} ${col.type}`;
    if (!col.nullable) def += ' NOT NULL';
    if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
    return def;
  });

  const constraintDefs = constraints.map(
    (c) => `  CONSTRAINT ${c.name} ${c.definition}`
  );

  const allDefs = [...columnDefs, ...constraintDefs];

  return `CREATE TABLE ${tableName} (\n${allDefs.join(',\n')}\n);`;
}

/**
 * Helper: Check for schema conflicts
 */
async function checkSchemaConflicts(
  tableName: string,
  columns: any[],
  targetDb: string,
  context: GraphQLContext
): Promise<any[]> {
  const conflicts: any[] = [];

  try {
    // Check if table already exists
    const result = await context.pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name = $1`,
      [tableName]
    );

    if (result.rows.length > 0) {
      conflicts.push({
        type: 'TABLE_EXISTS',
        description: `Table '${tableName}' already exists`,
        affectedObject: tableName,
        resolution: 'Choose a different table name or drop existing table',
        severity: 'ERROR',
      });
    }
  } catch (error) {
    // Ignore query errors
  }

  return conflicts;
}

/**
 * Helper: Extract column names from index definition
 */
function extractColumnsFromIndexDef(indexdef: string): string[] {
  const match = indexdef.match(/\((.*?)\)/);
  if (!match) return [];

  return match[1].split(',').map((col) => col.trim());
}

export default dataPipelineResolvers;
