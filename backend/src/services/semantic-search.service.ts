import { OpenAI } from 'openai';
import { Pool } from 'pg';
import pool, { TABLE_NAMES } from '../config/database';
import { asembPool } from '../server'; // Import asembPool
import dotenv from 'dotenv';

dotenv.config();

export class SemanticSearchService {
  private pool = pool;
  private customerPool: Pool;
  private openai: OpenAI | null = null;
  private useOpenAI: boolean = false;

  constructor() {

    // Initialize customer database pool
    this.customerPool = new Pool({
      connectionString: process.env.RAG_CHATBOT_DATABASE_URL || process.env.CUSTOMER_DB_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot'
    });

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
   * Generate embedding for a text using Google or OpenAI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Try Google embeddings first if API key is available
    if (process.env.GOOGLE_API_KEY) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GOOGLE_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] }
          })
        });

        if (response.ok) {
          const data = await response.json();
          return data.embedding.values;
        }
      } catch (error) {
        console.error('Google embedding generation failed:', error);
      }
    }

    // Fallback to OpenAI
    if (this.useOpenAI && this.openai) {
      try {
        const response = await this.openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: text
        });
        return response.data[0].embedding;
      } catch (error) {
        console.error('OpenAI embedding generation failed:', error);
      }
    }

    // Final fallback to mock embedding
    return this.generateMockEmbedding(text);
  }

  /**
   * Generate mock embedding for demo purposes
   */
  private generateMockEmbedding(text: string): number[] {
    const embedding = new Array(768).fill(0);
    const hash = this.simpleHash(text);

    for (let i = 0; i < 768; i++) {
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
   * Perform keyword search on available tables
   */
  async keywordSearch(query: string, limit: number = 10) {
    const queryId = `keywordSearch_${query.substring(0, 10)}_${Date.now()}`;
    console.time(queryId);
    try {
      let allResults = [];

      // Try to search in unified_embeddings table first
      try {
        const unifiedQuery = `
          SELECT
            id::text as id,
            COALESCE(metadata->>'title', 'Document ' || id) as title,
            metadata->>'table' as source_table,
            source_id::text as source_id,
            LEFT(content, 500) as excerpt,
            1 as priority
          FROM unified_embeddings
          WHERE content ILIKE $1 OR (metadata->>'title') ILIKE $1
          LIMIT $2
        `;
        const unifiedResult = await asembPool.query(unifiedQuery, [
          `%${query}%`,
          limit
        ]);
        allResults = [...allResults, ...unifiedResult.rows];
        console.log(`Found ${unifiedResult.rows.length} results from unified_embeddings`);
      } catch (error) {
        console.error('Error accessing unified_embeddings:', error);
        console.log('unified_embeddings table not accessible, trying other tables...');
      }

      // If no results, try scraped_data table
      if (allResults.length === 0) {
        try {
          const scrapedQuery = `
            SELECT
              id::text as id,
              COALESCE(title, 'Document ' || id) as title,
              'scraped_data' as source_table,
              id::text as source_id,
              COALESCE(LEFT(content, 500), LEFT(description, 500)) as excerpt,
              2 as priority
            FROM scraped_data
            WHERE title ILIKE $1 OR content ILIKE $1 OR description ILIKE $1
            LIMIT $2
          `;
          const scrapedResult = await this.pool.query(scrapedQuery, [
            `%${query}%`,
            limit
          ]);
          allResults = [...allResults, ...scrapedResult.rows];
          console.log(`Found ${scrapedResult.rows.length} results from scraped_data`);
        } catch (error) {
          console.log('scraped_data table not accessible...');
        }
      }

      // If still no results, try documents table
      if (allResults.length === 0) {
        try {
          const documentsQuery = `
            SELECT
              id::text as id,
              COALESCE(title, 'Document ' || id) as title,
              'documents' as source_table,
              id::text as source_id,
              COALESCE(LEFT(content, 500), LEFT(summary, 500)) as excerpt,
              3 as priority
            FROM documents
            WHERE title ILIKE $1 OR content ILIKE $1 OR summary ILIKE $1
            LIMIT $2
          `;
          const documentsResult = await this.pool.query(documentsQuery, [
            `%${query}%`,
            limit
          ]);
          allResults = [...allResults, ...documentsResult.rows];
          console.log(`Found ${documentsResult.rows.length} results from documents`);
        } catch (error) {
          console.log('documents table not accessible...');
        }
      }

      console.timeEnd(queryId);
      return allResults.map(row => ({
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
      // Fallback to unified semantic search
      return this.unifiedSemanticSearch(query, limit);
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
      const embeddingCheck = await asembPool.query(`
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

      // Search in unified_embeddings table with minimum similarity threshold
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
          AND (1 - (ue.embedding <=> $1::vector)) > 0.65  -- 65% minimum similarity threshold
        ORDER BY
          (1 - (ue.embedding <=> $1::vector)) +
          CASE
            WHEN ue.content ILIKE $3 THEN 0.3
            WHEN ue.metadata->>'table' ILIKE $3 THEN 0.2
            ELSE 0
          END DESC
        LIMIT $2
      `;

      console.time(queryId);
      const result = await asembPool.query(searchQuery, [
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
      console.error('Unified semantic search error:', error);
      console.timeEnd(queryId);
      // Fallback to keyword search instead of recursive call
      return this.keywordSearch(query, limit);
    }
  }

  /**
   * Perform hybrid search (keyword + semantic)
   */
  async hybridSearch(query: string, limit: number = 10) {
    try {
      // Try unified semantic search first, as it's the primary source
      const unifiedResults = await this.unifiedSemanticSearch(query, limit);

      if (unifiedResults && unifiedResults.length > 0) {
        console.log(`Found ${unifiedResults.length} results via unified semantic search`);
        return unifiedResults.map((result) => ({
          ...result,
          keyword_score: 0,
          semantic_score: result.score / 100,
          similarity_score: result.score / 100,
          combined_score: result.score / 100,
        }));
      }

      // Fallback to keyword search if no unified results
      console.log('No unified semantic results, falling back to keyword search');
      const keywordResults = await this.keywordSearch(query, limit);

      return keywordResults.map((result) => ({
        ...result,
        keyword_score: result.score / 100,
        semantic_score: 0,
        similarity_score: 0,
        combined_score: result.score / 100,
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
          try {
            searchQuery = `
              SELECT
                id::text as id,
                'SORUCEVAP - ' || LEFT(question, 100) as title,
                'sorucevap' as source_table,
                id::text as source_id,
                LEFT(answer, 500) as excerpt
              FROM ${TABLE_NAMES.SORUCEVAP}
              WHERE question ILIKE $1 OR answer ILIKE $1
              ORDER BY id DESC
              LIMIT $2
            `;
            // Use customerPool for sorucevap
            const result = await this.customerPool.query(searchQuery, [`%${query}%`, limit]);
            return result.rows;
          } catch (error) {
            console.log('SORUCEVAP table not accessible for search');
            return [];
          }
        case 'ozelgeler':
          searchQuery = `
            SELECT 
              id::text as id,
              'ÖZELGE - ' || LEFT(subject, 100) as title,
              'ozelgeler' as source_table,
              id::text as source_id,
              LEFT(content, 500) as excerpt
            FROM ${TABLE_NAMES.OZELGELER}
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
          SELECT 'sorucevap' as source_table, COUNT(*) as count FROM ${TABLE_NAMES.SORUCEVAP}
          UNION ALL
          SELECT 'ozelgeler', COUNT(*) FROM ${TABLE_NAMES.OZELGELER}
          UNION ALL
          SELECT 'makaleler', COUNT(*) FROM ${TABLE_NAMES.MAKALELER}
          UNION ALL
          SELECT 'danistaykararlari', COUNT(*) FROM ${TABLE_NAMES.DANISTAYKARARLARI}
        )
        SELECT * FROM table_counts ORDER BY count DESC
      `;

      let result;
      try {
        // Try customer pool first (where the tables are)
        result = await this.customerPool.query(statsQuery);
      } catch (error) {
        console.log('Could not get stats from customer database:', error.message);
        // Fallback to empty result
        result = { rows: [] };
      }

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
        FROM public."${TABLE_NAMES.SORUCEVAP}"
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
