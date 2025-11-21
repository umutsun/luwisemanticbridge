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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { table, limit = 5 } = body;
    
    if (!table) {
      return NextResponse.json(
        {
          success: false,
          error: 'Table name is required'
        },
        { status: 400 }
      );
    }
    
    const pg = new Client(pgConfig);
    await pg.connect();
    
    try {
      // Get table structure
      const structureResult = await pg.query(`
        SELECT column_name, data_type, is_nullable, character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = $1 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [table]);
      
      // Get sample data
      const dataResult = await pg.query(`
        SELECT * FROM "${table}" 
        LIMIT $1
      `, [parseInt(limit)]);
      
      // Get total row count
      const countResult = await pg.query(`
        SELECT COUNT(*) as total_rows FROM "${table}"
      `);
      
      return NextResponse.json({
        success: true,
        table: {
          name: table,
          structure: structureResult.rows,
          sampleData: dataResult.rows,
          totalRows: parseInt(countResult.rows[0].total_rows),
          previewLimit: parseInt(limit)
        }
      });
    } finally {
      await pg.end();
    }
  } catch (error) {
    console.error('Error previewing table:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}