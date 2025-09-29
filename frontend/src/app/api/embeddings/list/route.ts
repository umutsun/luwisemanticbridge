import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.ASEMB_DB_HOST || process.env.POSTGRES_HOST || 'postgres',
  port: parseInt(process.env.ASEMB_DB_PORT || process.env.POSTGRES_PORT || '5432'),
  database: process.env.ASEMB_DB_NAME || 'asemb',
  user: process.env.ASEMB_DB_USER || process.env.POSTGRES_USER || 'postgres',
  password: process.env.ASEMB_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'Semsiye!22'
});

export async function GET(request: NextRequest) {
  try {
    const limit = request.nextUrl.searchParams.get('limit') || '50';
    
    // Query embeddings table
    const query = `
      SELECT 
        id,
        content,
        metadata,
        created_at,
        CASE 
          WHEN embedding IS NOT NULL THEN array_length(embedding, 1)
          ELSE 0
        END as embedding_size
      FROM embeddings
      ORDER BY created_at DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [parseInt(limit)]);
    
    // Format the response
    const embeddings = result.rows.map(row => ({
      id: row.id,
      content: row.content || '',
      metadata: row.metadata || {},
      created_at: row.created_at,
      embedding_size: row.embedding_size
    }));
    
    return NextResponse.json(embeddings);
  } catch (error) {
    console.error('Failed to fetch embeddings:', error);
    
    // If embeddings table doesn't exist, try chunks table
    try {
      const fallbackQuery = `
        SELECT 
          id,
          content,
          metadata,
          created_at
        FROM chunks
        ORDER BY created_at DESC
        LIMIT 50
      `;
      
      const result = await pool.query(fallbackQuery);
      
      const chunks = result.rows.map(row => ({
        id: row.id,
        content: row.content || '',
        metadata: row.metadata || {},
        created_at: row.created_at
      }));
      
      return NextResponse.json(chunks);
    } catch (fallbackError) {
      console.error('Fallback query also failed:', fallbackError);
      return NextResponse.json([], { status: 200 });
    }
  }
}