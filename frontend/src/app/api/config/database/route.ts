import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { Pool } from 'pg';

const CONFIG_FILE = path.join(process.cwd(), 'database-config.json');

// Get current database configuration from settings
export async function GET() {
  try {
    // Connect to ASEMB database to get settings
    const asembPool = new Pool({
      host: process.env.ASEMB_DB_HOST || process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.ASEMB_DB_PORT || process.env.POSTGRES_PORT || '5432'),
      database: process.env.ASEMB_DB_NAME || 'asemb',
      user: process.env.ASEMB_DB_USER || process.env.POSTGRES_USER || 'postgres',
      password: process.env.ASEMB_DB_PASSWORD || process.env.POSTGRES_PASSWORD,
      max: 1
    });

    let config = null;
    let status = 'disconnected';
    let source = 'settings';

    try {
      // Get source database settings from ASEMB settings table
      const result = await asembPool.query(`
        SELECT value FROM settings WHERE key = 'source_database'
      `);

      if (result.rows.length > 0) {
        config = result.rows[0].value;

        // Test connection to source database
        const sourcePool = new Pool({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.username,
          password: config.password,
          ssl: config.sslMode === 'require' ? { rejectUnauthorized: false } : false,
          max: 1
        });

        try {
          await sourcePool.query('SELECT 1');
          status = 'connected';
        } catch (error) {
          status = 'disconnected';
        } finally {
          await sourcePool.end();
        }
      }
    } catch (error) {
      console.error('Error reading settings from database:', error);

      // Fallback to file-based config
      try {
        const fs = await import('fs/promises');
        const configData = await fs.readFile(CONFIG_FILE, 'utf-8');
        config = JSON.parse(configData);
        source = 'file';

        // Test the connection
        const pool = new Pool({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.username,
          password: config.password,
          ssl: config.sslMode === 'require' ? { rejectUnauthorized: false } : false,
          max: 1
        });

        try {
          await pool.query('SELECT 1');
          status = 'connected';
        } catch (error) {
          status = 'disconnected';
        } finally {
          await pool.end();
        }
      } catch (fileError) {
        // Last resort - use environment variables
        config = {
          host: process.env.CUSTOMER_DB_HOST || process.env.POSTGRES_HOST || 'postgres',
          port: parseInt(process.env.CUSTOMER_DB_PORT || process.env.POSTGRES_PORT || '5432'),
          database: process.env.CUSTOMER_DB_NAME || 'rag_chatbot',
          username: process.env.CUSTOMER_DB_USER || process.env.POSTGRES_USER || 'postgres',
          password: process.env.CUSTOMER_DB_PASSWORD || process.env.POSTGRES_PASSWORD,
          schema: 'public',
          sslMode: 'disable' as const,
          poolSize: 20
        };
        source = 'environment';
      }
    } finally {
      await asembPool.end();
    }

    return NextResponse.json({
      config,
      status,
      source
    });
  } catch (error) {
    console.error('Error getting database config:', error);
    return NextResponse.json(
      { error: 'Failed to get database configuration' },
      { status: 500 }
    );
  }
}

// Save database configuration to settings
export async function POST(request: NextRequest) {
  try {
    const config = await request.json();

    // Validate required fields
    const required = ['host', 'port', 'database', 'username'];
    for (const field of required) {
      if (!config[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Generate connection string
    config.connectionString = `postgresql://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`;

    // Connect to ASEMB database to save settings
    const asembPool = new Pool({
      host: process.env.ASEMB_DB_HOST || process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.ASEMB_DB_PORT || process.env.POSTGRES_PORT || '5432'),
      database: process.env.ASEMB_DB_NAME || 'asemb',
      user: process.env.ASEMB_DB_USER || process.env.POSTGRES_USER || 'postgres',
      password: process.env.ASEMB_DB_PASSWORD || process.env.POSTGRES_PASSWORD,
      max: 1
    });

    try {
      // Save to ASEMB settings table
      await asembPool.query(`
        INSERT INTO settings (key, value, category, description)
        VALUES ('source_database', $1, 'database', 'Source database connection settings')
        ON CONFLICT (key)
        DO UPDATE SET
          value = $1,
          updated_at = CURRENT_TIMESTAMP
      `, [JSON.stringify(config)]);

      // Also save to file as backup
      const fs = await import('fs/promises');
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');

      return NextResponse.json({
        success: true,
        message: 'Database configuration saved successfully',
        savedTo: 'settings'
      });
    } catch (error) {
      console.error('Error saving to database:', error);

      // Fallback to file only
      const fs = await import('fs/promises');
      await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');

      return NextResponse.json({
        success: true,
        message: 'Database configuration saved to file (database save failed)',
        savedTo: 'file'
      });
    } finally {
      await asembPool.end();
    }
  } catch (error) {
    console.error('Error saving database config:', error);
    return NextResponse.json(
      { error: 'Failed to save database configuration' },
      { status: 500 }
    );
  }
}