import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { getDatabaseSettings } from '../config/database.config';

dotenv.config();

const router = Router();

// Source Database Pool - will be initialized from settings
let sourcePool: Pool;

// Initialize source database pool from settings
async function initializeSourcePool() {
  try {
    // Close existing pool if any
    if (sourcePool) {
      await sourcePool.end();
      sourcePool = null;
    }

    // Get source database settings using getDatabaseSettings()
    // This function reads database.* keys and combines them into config object
    const dbSettingsResult = await getDatabaseSettings();

    console.log('[Source DB] Database settings result:', dbSettingsResult ? 'Found' : 'Not found');

    if (!dbSettingsResult) {
      throw new Error('Source database not configured. Please configure database settings in Settings > Database.');
    }

    // getDatabaseSettings returns { database: { name, host, user, password, ... } }
    // Unwrap the nested structure
    const dbConfig = dbSettingsResult.database || dbSettingsResult;

    console.log('[Source DB] Config details:', {
      hasName: !!dbConfig.name || !!dbConfig.database,
      hasHost: !!dbConfig.host,
      hasUser: !!dbConfig.user,
      hasPassword: !!dbConfig.password
    });

    // Get database name (could be 'name' or 'database' field)
    const sourceDatabaseName = dbConfig.name || dbConfig.database;

    // Validate required settings
    if (!sourceDatabaseName || !dbConfig.user || !dbConfig.password) {
      throw new Error('Source database not configured. Please configure database settings in Settings > Database.');
    }

    console.log(`[Source DB] ✓ Using database: ${sourceDatabaseName} on ${dbConfig.host}:${dbConfig.port}`);

    // Use config values directly
    const sourceHost = dbConfig.host || '91.99.229.96';
    const sourcePort = dbConfig.port || 5432;
    const sourceUser = dbConfig.user;
    const sourcePassword = dbConfig.password;
    const sourceSsl = dbConfig.ssl || false;

    const config = {
      host: sourceHost,
      port: sourcePort,
      database: sourceDatabaseName, // Source DB from user settings
      user: sourceUser,
      password: sourcePassword,
      ssl: sourceSsl,
      max: 10
    };

    sourcePool = new Pool(config);

    sourcePool.on('connect', () => {
      console.log(`✓ Source database connected: ${config.database}`);
    });

    sourcePool.on('error', (err: any) => {
      console.error('✗ Source database connection error:', err);
    });

    return sourcePool;
  } catch (error: any) {
    console.error('[Source DB] ✗ Failed to initialize source pool:', error.message);
    throw error;
  }
}

// Don't initialize pool on startup - lazy initialization when endpoints are called
// This allows app to start even if source DB is not configured yet
// initializeSourcePool();

/**
 * GET /tables
 * Get all tables from source database
 */
router.get('/tables', async (req: Request, res: Response) => {
  try {
    // Ensure pool is initialized - always reinitialize to get fresh settings
    await initializeSourcePool();

    if (!sourcePool) {
      return res.status(500).json({
        success: false,
        error: 'Source database pool not initialized'
      });
    }

    const query = `
      SELECT
        schemaname as schema,
        tablename as name,
        (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = schemaname AND table_name = tablename) as column_count
      FROM pg_catalog.pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename
    `;

    const result = await sourcePool.query(query);

    // Get row counts for each table
    const tablesWithCounts = await Promise.all(
      result.rows.map(async (table) => {
        try {
          const countQuery = `SELECT COUNT(*) as count FROM "${table.schema}"."${table.name}"`;
          const countResult = await sourcePool.query(countQuery);
          return {
            ...table,
            rowCount: parseInt(countResult.rows[0].count)
          };
        } catch (error) {
          console.error(`Error getting count for ${table.schema}.${table.name}:`, error);
          return {
            ...table,
            rowCount: 0
          };
        }
      })
    );

    res.json({
      success: true,
      tables: tablesWithCounts
    });
  } catch (error: any) {
    console.error('Failed to fetch source tables:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch source tables'
    });
  }
});

/**
 * GET /tables/:tableName/structure
 * Get table structure (columns, types, etc.)
 */
router.get('/tables/:tableName/structure', async (req: Request, res: Response) => {
  try {
    // Ensure pool is initialized
    if (!sourcePool) {
      await initializeSourcePool();
    }

    const { tableName } = req.params;

    const query = `
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position
    `;

    const result = await sourcePool.query(query, [tableName]);

    res.json({
      success: true,
      tableName,
      columns: result.rows
    });
  } catch (error: any) {
    console.error('Failed to fetch table structure:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch table structure'
    });
  }
});

/**
 * POST /tables/create
 * Create a new table in source database
 */
router.post('/tables/create', async (req: Request, res: Response) => {
  console.log('[Source DB] === CREATE TABLE REQUEST RECEIVED ===');
  console.log('[Source DB] Request body:', JSON.stringify(req.body, null, 2));

  try {
    // Ensure pool is initialized
    console.log('[Source DB] Checking pool...');
    if (!sourcePool) {
      console.log('[Source DB] Pool not initialized, initializing...');
      await initializeSourcePool();
    }
    console.log('[Source DB] Pool ready');

    const { tableName, columns } = req.body;

    console.log('[Source DB] tableName:', tableName);
    console.log('[Source DB] columns:', JSON.stringify(columns, null, 2));

    if (!tableName || !columns || !Array.isArray(columns)) {
      console.log('[Source DB] VALIDATION FAILED - tableName:', !!tableName, 'columns:', !!columns, 'isArray:', Array.isArray(columns));
      return res.status(400).json({
        success: false,
        error: 'Table name and columns are required'
      });
    }

    // Build CREATE TABLE statement
    console.log('[Source DB] Building column definitions...');

    // Filter out system columns that are automatically added
    const systemColumns = ['id', 'created_at', 'updated_at'];
    const filteredColumns = columns.filter((col: any) =>
      !systemColumns.includes(col.columnName?.toLowerCase())
    );
    console.log(`[Source DB] Filtered ${columns.length - filteredColumns.length} system columns`);

    const columnDefs = filteredColumns.map((col: any, idx: number) => {
      console.log(`[Source DB] Column ${idx}:`, col);
      // Replace VARCHAR(255) with TEXT for crawler data - content can be much longer
      let sqlType = col.sqlType;
      if (sqlType === 'VARCHAR(255)') {
        sqlType = 'TEXT';
        console.log(`[Source DB] Column ${idx}: Upgraded VARCHAR(255) to TEXT`);
      }
      let def = `"${col.columnName}" ${sqlType}`;
      // Don't add NOT NULL for crawler data - data may have null values
      // if (!col.nullable) def += ' NOT NULL';
      if (col.isPrimaryKey) def += ' PRIMARY KEY';
      // Add UNIQUE constraint for URL field to prevent duplicates
      if (col.columnName.toLowerCase() === 'url' || col.originalField?.toLowerCase() === 'url') {
        def += ' UNIQUE';
      }
      console.log(`[Source DB] Column ${idx} def:`, def);
      return def;
    }).join(', ');

    console.log('[Source DB] All column defs:', columnDefs);

    const createQuery = `
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id SERIAL PRIMARY KEY,
        ${columnDefs},
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    console.log(`[Source DB] Creating table ${tableName} in database...`);
    console.log(`[Source DB] Query:`, createQuery);

    const dbInfo = await sourcePool.query('SELECT current_database()');
    console.log(`[Source DB] Connected to database: ${dbInfo.rows[0].current_database}`);

    await sourcePool.query(createQuery);

    console.log(`[Source DB] ✓ Table ${tableName} created successfully`);

    res.json({
      success: true,
      message: `Table ${tableName} created successfully in database: ${dbInfo.rows[0].current_database}`
    });
  } catch (error: any) {
    console.error('[Source DB] ✗ Failed to create table');
    console.error('[Source DB] Error message:', error.message);
    console.error('[Source DB] Error code:', error.code);
    console.error('[Source DB] Error detail:', error.detail);
    console.error('[Source DB] Error hint:', error.hint);
    console.error('[Source DB] Error stack:', error.stack);
    console.error('[Source DB] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create table',
      code: error.code || '',
      details: error.detail || error.hint || ''
    });
  }
});

/**
 * Generate MD5 hash of content for change detection
 * Handles Turkish characters and UTF-8 encoding properly
 */
function generateContentHash(content: string): string {
  const crypto = require('crypto');
  // Normalize content: trim whitespace, normalize unicode (NFC form for Turkish chars)
  const normalizedContent = (content || '')
    .normalize('NFC')  // Normalize unicode characters (important for Turkish: İ, ı, ş, ğ, ü, ö, ç)
    .trim();
  return crypto.createHash('md5').update(normalizedContent, 'utf8').digest('hex');
}

/**
 * POST /tables/:tableName/insert
 * Insert data into source table with smart upsert (content hash based)
 * - New URL → INSERT
 * - Existing URL + content changed → UPDATE
 * - Existing URL + same content → SKIP (no unnecessary writes)
 */
router.post('/tables/:tableName/insert', async (req: Request, res: Response) => {
  try {
    // Ensure pool is initialized
    if (!sourcePool) {
      await initializeSourcePool();
    }

    const { tableName } = req.params;
    const { data, columnMappings } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Data array is required'
      });
    }

    // Log database connection info
    const dbInfo = await sourcePool.query('SELECT current_database()');
    console.log(`[Source DB] Inserting into table ${tableName} in database: ${dbInfo.rows[0].current_database}`);

    const client = await sourcePool.connect();

    try {
      await client.query('BEGIN');

      // Check if content_hash column exists, if not add it
      const columnCheck = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'content_hash'
      `, [tableName]);

      if (columnCheck.rows.length === 0) {
        console.log(`[Source DB] Adding content_hash column to ${tableName}`);
        await client.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS content_hash TEXT`);
      }

      let insertedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const row of data) {
        let columns = Object.keys(row);

        // Skip empty rows - they cause SQL syntax errors
        if (columns.length === 0) {
          console.log('[Source DB] Skipping empty row');
          skippedCount++;
          continue;
        }

        // Generate content hash from content field (or title+content if no content)
        const contentForHash = row.content || row.title || JSON.stringify(row);
        const contentHash = generateContentHash(contentForHash);

        // Add content_hash to the row
        row.content_hash = contentHash;
        columns = Object.keys(row);

        // Convert arrays and objects to JSON strings for PostgreSQL
        const values = Object.values(row).map(value => {
          if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
            return JSON.stringify(value);
          }
          return value;
        });

        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

        // Check if URL column exists for duplicate prevention
        const hasUrlColumn = columns.some(c => c.toLowerCase() === 'url');
        // Exclude url, content_hash, updated_at, created_at from update set (updated_at set manually)
        const updateColumns = columns.filter(c =>
          !['url', 'content_hash', 'updated_at', 'created_at'].includes(c.toLowerCase())
        );

        let insertQuery;
        if (hasUrlColumn && updateColumns.length > 0) {
          // Smart upsert: Only update if content_hash is different
          // WHERE clause checks if hash changed - if same, no update happens
          const updateSet = updateColumns
            .map(c => `"${c}" = EXCLUDED."${c}"`)
            .join(', ');

          insertQuery = `
            INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
            VALUES (${placeholders})
            ON CONFLICT ("url") DO UPDATE SET
              ${updateSet},
              content_hash = EXCLUDED.content_hash,
              updated_at = CURRENT_TIMESTAMP
            WHERE "${tableName}".content_hash IS DISTINCT FROM EXCLUDED.content_hash
            RETURNING (xmax = 0) AS inserted, (xmax != 0) AS updated
          `;
        } else {
          // No URL column, just skip duplicates
          insertQuery = `
            INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
            VALUES (${placeholders})
            ON CONFLICT DO NOTHING
          `;
        }

        const result = await client.query(insertQuery, values);

        // Determine if it was insert, update, or skip
        if (result.rowCount && result.rowCount > 0) {
          if (hasUrlColumn && result.rows.length > 0) {
            if (result.rows[0].inserted) {
              insertedCount += 1;
            } else if (result.rows[0].updated) {
              updatedCount += 1;
            }
          } else {
            insertedCount += result.rowCount;
          }
        } else {
          // No rows affected = content unchanged, skip
          skippedCount += 1;
        }
      }

      await client.query('COMMIT');

      console.log(`✅ Insert summary - Inserted: ${insertedCount}, Updated: ${updatedCount}, Skipped (unchanged): ${skippedCount}`);

      res.json({
        success: true,
        message: `Inserted ${insertedCount} new records, updated ${updatedCount} changed records, skipped ${skippedCount} unchanged`,
        insertedCount,
        updatedCount,
        skippedCount,
        totalProcessed: insertedCount + updatedCount + skippedCount
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Failed to insert data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to insert data'
    });
  }
});

/**
 * POST /chunk-laws
 * Chunk law documents into individual articles (Madde)
 * Proxies to Python service
 */
router.post('/chunk-laws', async (req: Request, res: Response) => {
  try {
    const { sourceTable = 'vergilex_mevzuat_kanunlar', dryRun = false, limit } = req.body;

    const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8003';

    const response = await fetch(`${pythonUrl}/api/python/embedding/chunk-laws`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_table: sourceTable, dry_run: dryRun, limit })
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Failed to chunk laws:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to chunk laws'
    });
  }
});

/**
 * GET /chunk-laws/status
 * Get chunking job status
 */
router.get('/chunk-laws/status', async (req: Request, res: Response) => {
  try {
    const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8003';

    const response = await fetch(`${pythonUrl}/api/python/embedding/chunk-laws/status`);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get status'
    });
  }
});

export default router;
