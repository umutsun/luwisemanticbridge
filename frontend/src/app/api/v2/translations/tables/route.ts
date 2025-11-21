import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

// Database configuration
const pgConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'lsemb',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
};

export async function GET(request: NextRequest) {
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    
    // Get all user tables (excluding system tables)
    const result = await pg.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count,
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name AND data_type IN ('text', 'varchar', 'char')) as text_column_count
      FROM information_schema.tables t 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('spatial_ref_sys', 'geometry_columns', 'raster_columns', 'pgvector_stat')
      ORDER BY table_name
    `);
    
    const tables = result.rows.map(row => ({
      name: row.table_name,
      columnCount: parseInt(row.column_count),
      textColumnCount: parseInt(row.text_column_count),
      canTranslate: parseInt(row.text_column_count) > 0
    }));
    
    return NextResponse.json({
      success: true,
      tables
    });
  } catch (error) {
    console.error('Error getting tables:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    await pg.end();
  }
}