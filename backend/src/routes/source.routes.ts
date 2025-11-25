import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { SettingsService } from '../services/settings.service';

dotenv.config();

const router = Router();
const settingsService = new SettingsService();

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

    // Get source database settings from 'database' category
    // Settings are stored as nested object: { database: { name, host, user, password, ... } }
    let sourceDatabaseName: string | null = null;
    let sourceHost: string | null = null;
    let sourcePort: number | null = null;
    let sourceUser: string | null = null;
    let sourcePassword: string | null = null;
    let sourceSsl: boolean = false;

    try {
      // Read database settings as category (returns nested object)
      const dbSettings = await settingsService.getSettings('database');

      console.log('[Source DB] Database settings:', {
        hasSettings: !!dbSettings,
        keys: dbSettings ? Object.keys(dbSettings) : []
      });

      if (dbSettings && dbSettings.database) {
        // Settings are nested under 'database' key
        const config = dbSettings.database;
        sourceDatabaseName = config.name;
        sourceHost = config.host || process.env.POSTGRES_HOST || '91.99.229.96';
        sourcePort = config.port || parseInt(process.env.POSTGRES_PORT || '5432');
        sourceUser = config.user;
        sourcePassword = config.password;
        sourceSsl = config.ssl || false;
      }

      // Validate required settings
      if (!sourceDatabaseName || !sourceUser || !sourcePassword) {
        throw new Error('Source database not configured. Please configure database settings in Settings > Database.');
      }

      console.log(`[Source DB] Using database from settings: ${sourceDatabaseName} on ${sourceHost}:${sourcePort}`);
    } catch (settingsError: any) {
      console.error('[Source DB] Failed to get database settings:', settingsError.message);
      throw new Error('Source database not configured. Please configure database settings in Settings > Database.');
    }

    const config = {
      host: sourceHost!,
      port: sourcePort || 5432,
      database: sourceDatabaseName!, // Source DB from user settings
      user: sourceUser!,
      password: sourcePassword!,
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
  } catch (error) {
    console.error('Failed to initialize source pool:', error);
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
  try {
    // Ensure pool is initialized
    if (!sourcePool) {
      await initializeSourcePool();
    }

    const { tableName, columns } = req.body;

    if (!tableName || !columns || !Array.isArray(columns)) {
      return res.status(400).json({
        success: false,
        error: 'Table name and columns are required'
      });
    }

    // Build CREATE TABLE statement
    const columnDefs = columns.map((col: any) => {
      let def = `"${col.columnName}" ${col.sqlType}`;
      // Don't add NOT NULL for crawler data - data may have null values
      // if (!col.nullable) def += ' NOT NULL';
      if (col.isPrimaryKey) def += ' PRIMARY KEY';
      // Add UNIQUE constraint for URL field to prevent duplicates
      if (col.columnName.toLowerCase() === 'url' || col.originalField?.toLowerCase() === 'url') {
        def += ' UNIQUE';
      }
      return def;
    }).join(', ');

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
    console.error('[Source DB] ✗ Failed to create table:', error.message);
    console.error('[Source DB] Error details:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create table',
      details: error.detail || error.hint || ''
    });
  }
});

/**
 * POST /tables/:tableName/insert
 * Insert data into source table
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

      let insertedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const row of data) {
        const columns = Object.keys(row);

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
        const updateColumns = columns.filter(c => c.toLowerCase() !== 'url');

        let insertQuery;
        if (hasUrlColumn && updateColumns.length > 0) {
          // ON CONFLICT UPDATE: Update existing records with new data
          // Use RETURNING xmax to detect if it was an update or insert
          const updateSet = updateColumns
            .map(c => `"${c}" = EXCLUDED."${c}"`)
            .join(', ');

          insertQuery = `
            INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')})
            VALUES (${placeholders})
            ON CONFLICT ("url") DO UPDATE SET
              ${updateSet},
              updated_at = CURRENT_TIMESTAMP
            RETURNING (xmax = 0) AS inserted
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
          if (hasUrlColumn && updateColumns.length > 0 && result.rows.length > 0) {
            // Check xmax to distinguish between insert and update
            if (result.rows[0].inserted) {
              insertedCount += 1;
            } else {
              updatedCount += 1;
            }
          } else {
            insertedCount += result.rowCount;
          }
        } else {
          skippedCount += 1;
        }
      }

      await client.query('COMMIT');

      console.log(` Insert summary - Inserted: ${insertedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`);

      res.json({
        success: true,
        message: `Inserted ${insertedCount} new records, updated ${updatedCount} existing records, skipped ${skippedCount} duplicates`,
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

export default router;
