import { OpenAI } from 'openai';
import pool from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

export class SemanticSearchService {
  private pool = pool;
  private openai: OpenAI | null = null;
  private useOpenAI: boolean = false;

  constructor() {
    
    // Initialize OpenAI
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith('sk-')) {
      try {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        this.useOpenAI = true;
        console.log('✅ OpenAI API initialized');
      } catch (error) {
        console.log('⚠️  OpenAI API initialization failed:', error);
      }
    }
  }

  /**
   * Generate embedding for a text using OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.useOpenAI || !this.openai) {
      return this.generateMockEmbedding(text);
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return this.generateMockEmbedding(text);
    }
  }

  /**
   * Generate mock embedding for demo purposes
   */
  private generateMockEmbedding(text: string): number[] {
    const embedding = new Array(1536).fill(0);
    const hash = this.simpleHash(text);
    
    for (let i = 0; i < 1536; i++) {
      embedding[i] = Math.sin(hash * (i + 1)) * 0.5 + Math.random() * 0.1;
    }
    
    return embedding;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Perform keyword search on multiple tables
   */
  async keywordSearch(query: string, limit: number = 10) {
    const queryId = `keywordSearch_${query.substring(0, 10)}_${Date.now()}`;
    console.time(queryId);
    try {
      // Search in SORUCEVAP table
      const searchQuery = `
        WITH combined_results AS (
          SELECT 
            id::text as id,
            'SORUCEVAP - ' || COALESCE(LEFT(question, 100), '') as title,
            'sorucevap' as source_table,
            id::text as source_id,
            LEFT(answer, 500) as excerpt,
            1 as priority
          FROM public."SORUCEVAP"
          WHERE question ILIKE $1 OR answer ILIKE $1
          
          UNION ALL
          
          SELECT 
            id::text as id,
            'ÖZELGE - ' || COALESCE(LEFT(subject, 100), '') as title,
            'ozelgeler' as source_table,
            id::text as source_id,
            LEFT(content, 500) as excerpt,
            2 as priority
          FROM public."OZELGELER"
          WHERE subject ILIKE $1 OR content ILIKE $1
          
          UNION ALL
          
          SELECT 
            id::text as id,
            'MAKALE - ' || COALESCE(LEFT(title, 100), '') as title,
            'makaleler' as source_table,
            id::text as source_id,
            LEFT(content, 500) as excerpt,
            3 as priority
          FROM public."MAKALELER"
          WHERE title ILIKE $1 OR content ILIKE $1
          
          UNION ALL
          
          SELECT 
            id::text as id,
            'DANIŞTAY - ' || COALESCE(LEFT(subject, 100), '') as title,
            'danistay' as source_table,
            id::text as source_id,
            LEFT(content, 500) as excerpt,
            4 as priority
          FROM public."DANISTAYKARARLARI"
          WHERE subject ILIKE $1 OR content ILIKE $1
        )
        SELECT * FROM combined_results
        ORDER BY priority, id DESC
        LIMIT $2
      `;

      const result = await this.pool.query(searchQuery, [
        `%${query}%`,
        limit
      ]);

      console.timeEnd(queryId);
      return result.rows.map(row => ({
        ...row,
        score: 100 - (row.priority * 10) // Score based on priority
      }));
    } catch (error) {
      console.timeEnd(queryId);
      console.error('Keyword search error:', error);
      return [];
    }
  }

  /**
   * Perform semantic search using rag_data.documents table
   */
  async semanticSearch(query: string, limit: number = 10) {
    const embeddingId = `semanticSearch_embedding_${query.substring(0, 10)}_${Date.now()}`;
    const queryId = `semanticSearch_query_${query.substring(0, 10)}_${Date.now()}`;
    try {
      // Check if rag_data.documents exists and has data
      const embeddingCheck = await this.pool.query(`
        SELECT COUNT(*) as count 
        FROM rag_data.documents 
        WHERE embedding IS NOT NULL
      `);

      const hasEmbeddings = parseInt(embeddingCheck.rows[0].count) > 0;

      if (!hasEmbeddings) {
        console.log('No embeddings in rag_data.documents, using keyword search');
        return this.keywordSearch(query, limit);
      }

      // Generate embedding for query
      console.time(embeddingId);
      const queryEmbedding = await this.generateEmbedding(query);
      console.timeEnd(embeddingId);
      
      // Enhanced semantic search with better metadata
      const searchQuery = `
        SELECT 
          d.id::text as id,
          d.title,
          d.content as excerpt,
          UPPER(d.source_table) as source_table,
          d.source_id,
          d.metadata,
          1 - (d.embedding <=> $1::vector) as similarity_score,
          CASE 
            WHEN d.content ILIKE $3 THEN 0.2
            WHEN d.title ILIKE $3 THEN 0.15
            ELSE 0
          END as keyword_boost
        FROM rag_data.documents d
        WHERE d.embedding IS NOT NULL
          AND (1 - (d.embedding <=> $1::vector)) > 0.5  -- Increased to 50% minimum similarity
        ORDER BY 
          (1 - (d.embedding <=> $1::vector)) + 
          CASE 
            WHEN d.content ILIKE $3 THEN 0.2
            WHEN d.title ILIKE $3 THEN 0.15
            ELSE 0
          END DESC
        LIMIT $2
      `;

      console.time(queryId);
      const result = await this.pool.query(searchQuery, [
        JSON.stringify(queryEmbedding),
        limit,
        `%${query}%`
      ]);
      console.timeEnd(queryId);

      return result.rows.map(row => ({
        ...row,
        score: Math.round((parseFloat(row.similarity_score) + parseFloat(row.keyword_boost)) * 100),
        relevanceScore: parseFloat(row.similarity_score),
        content: row.excerpt
      }));
    } catch (error) {
      console.timeEnd(queryId); // Ensure timer ends on error
      console.error('Semantic search error:', error);
      // Fallback to keyword search
      return this.keywordSearch(query, limit);
    }
  }

  /**
   * Perform semantic search using unified_embeddings table
   */
  async unifiedSemanticSearch(query: string, limit: number = 10) {
    const embeddingId = `unifiedSemanticSearch_embedding_${query.substring(0, 10)}_${Date.now()}`;
    const queryId = `unifiedSemanticSearch_query_${query.substring(0, 10)}_${Date.now()}`;

    try {
      // Check if unified_embeddings exists and has data
      const embeddingCheck = await this.pool.query(`
        SELECT COUNT(*) as count
        FROM unified_embeddings
        WHERE embedding IS NOT NULL
      `);
      const hasEmbeddings = parseInt(embeddingCheck.rows[0].count) > 0;

      if (!hasEmbeddings) {
        console.log('No embeddings in unified_embeddings, falling back to keyword search');
        return this.keywordSearch(query, limit);
      }

      // Generate embedding for query
      console.time(embeddingId);
      const queryEmbedding = await this.generateEmbedding(query);
      console.timeEnd(embeddingId);

      // Search in unified_embeddings table
      const searchQuery = `
        SELECT
          ue.id::text as id,
          ue.content as excerpt,
          ue.metadata->>'table' as source_table,
          ue.source_id,
          1 - (ue.embedding <=> $1::vector) as similarity_score,
          CASE
            WHEN ue.content ILIKE $3 THEN 0.3
            WHEN ue.metadata->>'table' ILIKE $3 THEN 0.2
            ELSE 0
          END as keyword_boost
        FROM unified_embeddings ue
        WHERE ue.embedding IS NOT NULL
          AND ue.source_type = 'database'
        ORDER BY
          similarity_score +
          CASE
            WHEN ue.content ILIKE $3 THEN 0.3
            WHEN ue.metadata->>'table' ILIKE $3 THEN 0.2
            ELSE 0
          END DESC
        LIMIT $2
      `;

      console.time(queryId);
      const result = await this.pool.query(searchQuery, [
        JSON.stringify(queryEmbedding),
        limit,
        `%${query}%`
      ]);
      console.timeEnd(queryId);

      return result.rows.map(row => ({
        ...row,
        title: `${row.source_table} - ID: ${row.source_id}`,
        score: Math.round((parseFloat(row.similarity_score) + parseFloat(row.keyword_boost)) * 100),
        relevanceScore: parseFloat(row.similarity_score),
        content: row.excerpt
      }));
    } catch (error) {
      console.timeEnd(queryId);
      console.error('Unified semantic search error:', error);
      // Fallback to keyword search
      return this.keywordSearch(query, limit);
    }
  }

  /**
   * Perform hybrid search (keyword + semantic)
   */
  async hybridSearch(query: string, limit: number = 10) {
    try {
      // Try semantic search first
      const semanticResults = await this.semanticSearch(query, limit);
      
      if (semanticResults && semanticResults.length > 0) {
        console.log(`Found ${semanticResults.length} results via semantic search from rag_data`);
        return semanticResults.map((result, index) => ({
          ...result,
          keyword_score: 0,
          semantic_score: result.score / 100,
          similarity_score: result.score / 100,
          combined_score: result.score / 100
        }));
      }
      
      // Fallback to keyword search if no semantic results
      console.log('No semantic results, falling back to keyword search');
      const keywordResults = await this.keywordSearch(query, limit);
      
      return keywordResults.map((result, index) => ({
        ...result,
        score: result.score || (100 - (index * 10)), // Preserve existing score or calculate based on index
        keyword_score: 1 - (index * 0.1),
        semantic_score: 0,
        similarity_score: 0,
        combined_score: 1 - (index * 0.1)
      }));
    } catch (error) {
      console.error('Hybrid search error:', error);
      return [];
    }
  }

  /**
   * Get similar documents based on a document ID
   */
  async findSimilarDocuments(documentId: string, limit: number = 5) {
    try {
      // For now, return empty since we don't have a unified documents table
      return [];
    } catch (error) {
      console.error('Find similar documents error:', error);
      return [];
    }
  }

  /**
   * Search by source table
   */
  async searchBySource(sourceTable: string, query: string, limit: number = 10) {
    try {
      let searchQuery = '';
      
      switch(sourceTable.toLowerCase()) {
        case 'sorucevap':
          searchQuery = `
            SELECT 
              id::text as id,
              'SORUCEVAP - ' || LEFT(question, 100) as title,
              'sorucevap' as source_table,
              id::text as source_id,
              LEFT(answer, 500) as excerpt
            FROM public."SORUCEVAP"
            WHERE question ILIKE $1 OR answer ILIKE $1
            ORDER BY id DESC
            LIMIT $2
          `;
          break;
        case 'ozelgeler':
          searchQuery = `
            SELECT 
              id::text as id,
              'ÖZELGE - ' || LEFT(subject, 100) as title,
              'ozelgeler' as source_table,
              id::text as source_id,
              LEFT(content, 500) as excerpt
            FROM public."OZELGELER"
            WHERE subject ILIKE $1 OR content ILIKE $1
            ORDER BY id DESC
            LIMIT $2
          `;
          break;
        default:
          return [];
      }

      const result = await this.pool.query(searchQuery, [
        `%${query}%`,
        limit
      ]);

      return result.rows;
    } catch (error) {
      console.error('Search by source error:', error);
      return [];
    }
  }

  /**
   * Get document statistics
   */
  async getStats() {
    try {
      const statsQuery = `
        WITH table_counts AS (
          SELECT 'SORUCEVAP' as source_table, COUNT(*) as count FROM public."SORUCEVAP"
          UNION ALL
          SELECT 'OZELGELER', COUNT(*) FROM public."OZELGELER"
          UNION ALL
          SELECT 'MAKALELER', COUNT(*) FROM public."MAKALELER"
          UNION ALL
          SELECT 'DANISTAYKARARLARI', COUNT(*) FROM public."DANISTAYKARARLARI"
        )
        SELECT * FROM table_counts ORDER BY count DESC
      `;

      const result = await this.pool.query(statsQuery);
      
      // Get embeddings count
      const embeddingsQuery = `SELECT COUNT(*) as count FROM public.embeddings`;
      const embeddingsResult = await this.pool.query(embeddingsQuery);
      
      const total = result.rows.reduce((sum, row) => sum + parseInt(row.count), 0);
      
      return {
        bySource: result.rows.map(row => ({
          ...row,
          with_embeddings: 0 // We'll update this if needed
        })),
        total: total,
        totalWithEmbeddings: parseInt(embeddingsResult.rows[0].count)
      };
    } catch (error) {
      console.error('Get stats error:', error);
      return {
        bySource: [],
        total: 0,
        totalWithEmbeddings: 0
      };
    }
  }

  /**
   * Get sample documents for testing
   */
  async getSampleDocuments(limit: number = 5) {
    try {
      const query = `
        SELECT 
          id::text as id,
          'SORUCEVAP - ' || LEFT(question, 100) as title,
          'sorucevap' as source_table,
          id::text as source_id,
          LEFT(answer, 200) as excerpt
        FROM public."SORUCEVAP"
        ORDER BY id DESC
        LIMIT $1
      `;

      const result = await this.pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Get sample documents error:', error);
      return [];
    }
  }
}

// Export singleton instance
export const semanticSearch = new SemanticSearchService();
