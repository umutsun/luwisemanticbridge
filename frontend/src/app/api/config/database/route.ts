import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { Pool } from 'pg';

const CONFIG_FILE = path.join(process.cwd(), 'database-config.json');

// Get current database configuration
export async function GET() {
  try {
    // Try to read config file
    let config = null;
    let status = 'disconnected';
    
    try {
      const fs = await import('fs/promises');
      const configData = await fs.readFile(CONFIG_FILE, 'utf-8');
      config = JSON.parse(configData);
      
      // Test current connection
      if (config) {
        const pool = new Pool({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.username,
          password: config.password,
          ssl: config.sslMode === 'require' ? { rejectUnauthorized: false } : false,
          max: config.poolSize || 20
        });
        
        try {
          await pool.query('SELECT 1');
          status = 'connected';
        } catch (error) {
          status = 'disconnected';
        } finally {
          await pool.end();
        }
      }
    } catch (error) {
      // Use environment variables as fallback
      const envConfig = {
        host: process.env.ASEMB_DB_HOST || process.env.POSTGRES_HOST || 'postgres',
        port: parseInt(process.env.ASEMB_DB_PORT || process.env.POSTGRES_PORT || '5432'),
        database: process.env.ASEMB_DB_NAME || 'asemb',
        username: process.env.ASEMB_DB_USER || process.env.POSTGRES_USER || 'postgres',
        password: process.env.ASEMB_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'Semsiye!22',
        schema: process.env.DB_SCHEMA || 'public',
        sslMode: 'disable' as const,
        poolSize: parseInt(process.env.DB_POOL_SIZE || '20')
      };
      
      // Parse DATABASE_URL if available
      if (process.env.DATABASE_URL) {
        const url = new URL(process.env.DATABASE_URL);
        envConfig.host = url.hostname;
        envConfig.port = parseInt(url.port || '5432');
        envConfig.database = url.pathname.slice(1);
        envConfig.username = url.username;
        envConfig.password = decodeURIComponent(url.password);
      }
      
      config = envConfig;
    }
    
    return NextResponse.json({
      config,
      status,
      source: config ? 'file' : 'environment'
    });
  } catch (error) {
    console.error('Error getting database config:', error);
    return NextResponse.json(
      { error: 'Failed to get database configuration' },
      { status: 500 }
    );
  }
}

// Save database configuration
export async function POST(request: NextRequest) {
  try {
    const config = await request.json();
    
    // Validate required fields
    const required = ['host', 'port', 'database', 'username', 'schema'];
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
    
    // Save to file
    const fs = await import('fs/promises');
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');

    // Also update .env.local for Next.js
    const envPath = path.join(process.cwd(), '.env.local');
    let envContent = '';

    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch (error) {
      // File doesn't exist, create new
    }
    
    // Update or add DATABASE_URL
    const envLines = envContent.split('\n');
    const dbUrlIndex = envLines.findIndex(line => line.startsWith('DATABASE_URL='));
    const newDbUrl = `DATABASE_URL=${config.connectionString}`;
    
    if (dbUrlIndex >= 0) {
      envLines[dbUrlIndex] = newDbUrl;
    } else {
      envLines.push(newDbUrl);
    }
    
    // Add other DB settings
    const dbSettings = {
      DB_HOST: config.host,
      DB_PORT: config.port,
      DB_NAME: config.database,
      DB_USER: config.username,
      DB_PASSWORD: config.password,
      DB_SCHEMA: config.schema,
      DB_POOL_SIZE: config.poolSize
    };
    
    for (const [key, value] of Object.entries(dbSettings)) {
      const index = envLines.findIndex(line => line.startsWith(`${key}=`));
      const newLine = `${key}=${value}`;
      
      if (index >= 0) {
        envLines[index] = newLine;
      } else {
        envLines.push(newLine);
      }
    }
    
    await fs.writeFile(envPath, envLines.join('\n'), 'utf-8');
    
    return NextResponse.json({
      success: true,
      message: 'Database configuration saved successfully'
    });
  } catch (error) {
    console.error('Error saving database config:', error);
    return NextResponse.json(
      { error: 'Failed to save database configuration' },
      { status: 500 }
    );
  }
}