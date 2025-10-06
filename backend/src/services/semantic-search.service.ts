import { OpenAI } from 'openai';
import { Pool } from 'pg';
import pool, { TABLE_NAMES } from '../config/database';
import { asembPool } from '../config/database.config'; // Import asembPool
import dotenv from 'dotenv';

dotenv.config();

interface EmbeddingSettings {
  provider: string;
  model: string;
  openaiApiKey?: string;
  googleApiKey?: string;
}

export class SemanticSearchService {
  private pool = pool;
  private customerPool: Pool;
  private openai: OpenAI | null = null;
  private useOpenAI: boolean = false;
  private embeddingSettings: EmbeddingSettings = {
    provider: 'openai',
    model: 'text-embedding-ada-002'
  };

  constructor() {

    // Initialize customer database pool
    this.customerPool = new Pool({
      connectionString: process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'asemb'}`
    });

    // Initialize embedding providers asynchronously (fire and forget)
    // We'll handle the async initialization in the generateEmbedding method
    this.initializeEmbeddingProviders().catch(error => {
      console.error('Failed to initialize embedding providers:', error);
    });
  }

  /**
   * Load embedding settings from database and initialize providers
   */
  private async loadEmbeddingSettings(): Promise<void> {
    try {
      const result = await asembPool.query(
        'SELECT key, value FROM settings WHERE key IN ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        [
          'embedding_provider', 'embedding_model', 'openai_api_key', 'google_api_key',
          'llmSettings.embeddingProvider', 'llmSettings.embeddingModel',
          'embeddings.provider', 'embeddings.model', 'openai.apiKey', 'google.apiKey'
        ]
      );

      const settings = result.rows.reduce((acc: any, row: any) => {
        // Map different key formats to a consistent naming scheme
        if (row.key === 'embedding_provider' || row.key === 'llmSettings.embeddingProvider' || row.key === 'embeddings.provider') {
          acc.embeddingprovider = row.value;
        } else if (row.key === 'embedding_model' || row.key === 'llmSettings.embeddingModel' || row.key === 'embeddings.model') {
          acc.embeddingmodel = row.value;
        } else if (row.key === 'openai_api_key' || row.key === 'openai.apiKey') {
          acc.openaiapi = row.value;
        } else if (row.key === 'google_api_key' || row.key === 'google.apiKey') {
          acc.googleapi = row.value;
        } else {
          // Fallback for other keys
          const key = row.key.replace('_key', '').replace('.', '');
          acc[key] = row.value;
        }
        return acc;
      }, {});

      this.embeddingSettings = {
        provider: settings.embeddingprovider || 'google',
        model: settings.embeddingmodel || 'text-embedding-004',
        openaiApiKey: settings.openaiapi || process.env.OPENAI_API_KEY,
        googleApiKey: settings.googleapi || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
      };

      console.log('✅ Embedding settings loaded:', {
        provider: this.embeddingSettings.provider,
        model: this.embeddingSettings.model,
        hasGoogleKey: !!this.embeddingSettings.googleApiKey,
        hasOpenAIKey: !!this.embeddingSettings.openaiApiKey
      });
    } catch (error) {
      console.warn('⚠️ Failed to load embedding settings from database, using defaults:', error);
      // Fallback to environment variables
      this.embeddingSettings = {
        provider: process.env.EMBEDDING_PROVIDER || 'google',
        model: process.env.EMBEDDING_MODEL || 'text-embedding-004',
        openaiApiKey: process.env.OPENAI_API_KEY,
        googleApiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
      };
    }
  }

  /**
   * Initialize embedding providers based on settings
   */
  private async initializeEmbeddingProviders(): Promise<void> {
    await this.loadEmbeddingSettings();

    // Initialize OpenAI if available
    if (this.embeddingSettings.openaiApiKey && this.embeddingSettings.openaiApiKey.startsWith('sk-')) {
      try {
        this.openai = new OpenAI({
          apiKey: this.embeddingSettings.openaiApiKey
        });
        this.useOpenAI = true;
        console.log('✅ OpenAI API initialized for embeddings');
      } catch (error) {
        console.log('⚠️  OpenAI API initialization failed:', error);
      }
    } else {
      this.useOpenAI = false;
      console.log('📝 OpenAI API key not available');
    }
  }

  /**
   * Refresh embedding settings (call this when settings are updated)
   */
  async refreshEmbeddingSettings(): Promise<void> {
    await this.initializeEmbeddingProviders();
  }

  /**
   * Generate embedding for a text using configured provider
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Always refresh settings to ensure we have the latest
    await this.loadEmbeddingSettings();

    console.log(`🎯 Using embedding provider: ${this.embeddingSettings.provider}, model: ${this.embeddingSettings.model} (reloaded)`);

    // Use Google embeddings if configured as provider
    if (this.embeddingSettings.provider === 'google' && this.embeddingSettings.googleApiKey) {
      try {
        const model = this.embeddingSettings.model === 'text-embedding-004' ? 'text-embedding-004' : 'text-embedding-004';
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${this.embeddingSettings.googleApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${model}`,
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

    // Use OpenAI embeddings if configured as provider
    if (this.embeddingSettings.provider === 'openai' && this.useOpenAI && this.openai) {
      try {
        const model = this.embeddingSettings.model || 'text-embedding-ada-002';
        const response = await this.openai.embeddings.create({
          model: model,
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
   * Perform keyword search on available tables with enhanced error handling
   */
  async keywordSearch(query: string, limit: number = 10) {
    const queryId = `keywordSearch_${query.substring(0, 10)}_${Date.now()}`;
    console.time(queryId);
    try {
      let allResults: any[] = [];

      // Search in all customer database tables with better distribution
      const tables = [
        { name: TABLE_NAMES.SORUCEVAP, type: 'sorucevap', priority: 1 },
        { name: TABLE_NAMES.OZELGELER, type: 'ozelgeler', priority: 2 },
        { name: TABLE_NAMES.MAKALELER, type: 'makaleler', priority: 3 },
        { name: TABLE_NAMES.DANISTAYKARARLARI, type: 'danistaykararlari', priority: 4 }
      ];

      for (const table of tables) {
        try {
          let searchQuery = '';
          
          if (table.type === 'sorucevap') {
            searchQuery = `
              SELECT
                id::text as id,
                'SORUCEVAP - ' || LEFT(question, 100) as title,
                'sorucevap' as source_table,
                id::text as source_id,
                LEFT(answer, 500) as excerpt,
                ${table.priority} as priority
              FROM ${table.name}
              WHERE question ILIKE $1 OR answer ILIKE $1
              ORDER BY id DESC
              LIMIT $2
            `;
          } else if (table.type === 'ozelgeler') {
            searchQuery = `
              SELECT 
                id::text as id,
                'ÖZELGE - ' || LEFT(subject, 100) as title,
                'ozelgeler' as source_table,
                id::text as source_id,
                LEFT(content, 500) as excerpt,
                ${table.priority} as priority
              FROM ${table.name}
              WHERE subject ILIKE $1 OR content ILIKE $1
              ORDER BY id DESC
              LIMIT $2
            `;
          } else if (table.type === 'makaleler') {
            searchQuery = `
              SELECT 
                id::text as id,
                'MAKALE - ' || LEFT(baslik, 100) as title,
                'makaleler' as source_table,
                id::text as source_id,
                LEFT(icerik, 500) as excerpt,
                ${table.priority} as priority
              FROM ${table.name}
              WHERE baslik ILIKE $1 OR icerik ILIKE $1
              ORDER BY id DESC
              LIMIT $2
            `;
          } else if (table.type === 'danistaykararlari') {
            searchQuery = `
              SELECT 
                id::text as id,
                'DANIŞTAY - ' || LEFT(konu, 100) as title,
                'danistaykararlari' as source_table,
                id::text as source_id,
                LEFT(karar, 500) as excerpt,
                ${table.priority} as priority
              FROM ${table.name}
              WHERE konu ILIKE $1 OR karar ILIKE $1
              ORDER BY id DESC
              LIMIT $2
            `;
          }

          const result = await this.customerPool.query(searchQuery, [
            `%${query}%`,
            Math.ceil(limit / tables.length) // Distribute limit among tables
          ]);
          
          allResults = [...allResults, ...result.rows];
          console.log(`Found ${result.rows.length} results from ${table.name}`);
        } catch (error) {
          console.log(`${table.name} table not accessible for search`);
        }
      }

      // Also try unified_embeddings table if available
      try {
        if (asembPool) {
          const unifiedQuery = `
            SELECT
              id::text as id,
              COALESCE(metadata->>'title', 'Document ' || id) as title,
              metadata->>'table' as source_table,
              source_id::text as source_id,
              LEFT(content, 500) as excerpt,
              5 as priority
            FROM unified_embeddings
            WHERE content ILIKE $1 OR (metadata->>'title') ILIKE $1
            LIMIT $2
          `;
          const unifiedResult = await asembPool.query(unifiedQuery, [
            `%${query}%`,
            Math.ceil(limit / 2)
          ]);
          allResults = [...allResults, ...unifiedResult.rows];
          console.log(`Found ${unifiedResult.rows.length} results from unified_embeddings`);
        }
      } catch (error) {
        console.log('unified_embeddings table not accessible...');
      }

      console.timeEnd(queryId);
      
      // Sort by priority first, then by relevance score
      const sortedResults = allResults.sort((a, b) => {
        // Primary sort: by priority (lower number = higher priority)
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        // Secondary sort: by title/content relevance
        const queryLower = query.toLowerCase();
        const aTitle = (a.title || '').toLowerCase();
        const bTitle = (b.title || '').toLowerCase();
        const aExcerpt = (a.excerpt || '').toLowerCase();
        const bExcerpt = (b.excerpt || '').toLowerCase();

        // Check if query appears in title or excerpt
        const aRelevance = (aTitle.includes(queryLower) ? 2 : 0) +
                           (aExcerpt.includes(queryLower) ? 1 : 0);
        const bRelevance = (bTitle.includes(queryLower) ? 2 : 0) +
                           (bExcerpt.includes(queryLower) ? 1 : 0);

        return bRelevance - aRelevance;
      }).slice(0, limit);
      
      return sortedResults.map(row => ({
        ...row,
        score: Math.max(90, 100 - (row.priority * 8)) // Score based on priority, minimum 90
      }));
    } catch (error) {
      console.timeEnd(queryId);
      console.error('Keyword search error:', error);
      return [];
    }
  }

  /**
   * Perform semantic search using unified_embeddings table
   */
  async semanticSearch(query: string, limit: number = 10) {
    const embeddingId = `semanticSearch_embedding_${query.substring(0, 10)}_${Date.now()}`;
    const queryId = `semanticSearch_query_${query.substring(0, 10)}_${Date.now()}`;
    try {
      // Check if asembPool is available and unified_embeddings has data
      if (!asembPool) {
        console.log('❌ asembPool not available, using keyword search');
        return this.keywordSearch(query, limit);
      }

      const embeddingCheck = await asembPool.query(`
        SELECT COUNT(*) as count
        FROM unified_embeddings
        WHERE embedding IS NOT NULL
      `);

      const hasEmbeddings = parseInt(embeddingCheck.rows[0].count) > 0;

      if (!hasEmbeddings) {
        console.log('No embeddings in unified_embeddings, using keyword search');
        return this.keywordSearch(query, limit);
      }

      // Generate embedding for query
      console.time(embeddingId);
      const queryEmbedding = await this.generateEmbedding(query);
      console.timeEnd(embeddingId);
      
      // Enhanced semantic search using unified_embeddings
      const searchQuery = `
        SELECT
          ue.id::text as id,
          COALESCE(ue.metadata->>'title', ue.content::text) as title,
          ue.content as excerpt,
          COALESCE(ue.metadata->>'table', 'unknown') as source_table,
          ue.source_id,
          ue.metadata,
          1 - (ue.embedding <=> $1::vector) as similarity_score,
          CASE
            WHEN ue.content ILIKE $3 THEN 0.15
            WHEN ue.metadata->>'title' ILIKE $3 THEN 0.1
            ELSE 0
          END as keyword_boost
        FROM unified_embeddings ue
        WHERE ue.embedding IS NOT NULL
          AND (1 - (ue.embedding <=> $1::vector)) > 0.3  -- 30% minimum similarity threshold (increased from 5%)
        ORDER BY
          (1 - (ue.embedding <=> $1::vector)) +
          CASE
            WHEN ue.content ILIKE $3 THEN 0.15
            WHEN ue.metadata->>'title' ILIKE $3 THEN 0.1
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
        score: Math.round((parseFloat(row.similarity_score) + parseFloat(row.keyword_boost)) * 125), // Increased multiplier
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
   * Perform semantic search using unified_embeddings table with enhanced error handling
   */
  async unifiedSemanticSearch(query: string, limit: number = 10) {
    const embeddingId = `unifiedSemanticSearch_embedding_${query.substring(0, 10)}_${Date.now()}`;
    const queryId = `unifiedSemanticSearch_query_${query.substring(0, 10)}_${Date.now()}`;

    try {
      // Check if asembPool is available and connected
      if (!asembPool) {
        console.error('❌ asembPool is not available');
        return this.keywordSearch(query, limit);
      }

      // Check if unified_embeddings exists and has data
      const embeddingCheck = await asembPool.query(`
        SELECT COUNT(*) as count
        FROM unified_embeddings
        WHERE embedding IS NOT NULL
      `);
      const hasEmbeddings = parseInt(embeddingCheck.rows[0].count) > 0;

      if (!hasEmbeddings) {
        console.log('⚠️ No embeddings in unified_embeddings, falling back to keyword search');
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
          ue.source_table,
          ue.source_id,
          1 - (ue.embedding <=> $1::vector) as similarity_score,
          CASE
            WHEN ue.content ILIKE $3 THEN 0.2
            WHEN ue.source_table ILIKE $3 THEN 0.15
            ELSE 0
          END as keyword_boost
        FROM unified_embeddings ue
        WHERE ue.embedding IS NOT NULL
          AND (1 - (ue.embedding <=> $1::vector)) > 0.3  -- 30% minimum similarity threshold (increased from 5%)
        ORDER BY
          (1 - (ue.embedding <=> $1::vector)) +
          CASE
            WHEN ue.content ILIKE $3 THEN 0.2
            WHEN ue.source_table ILIKE $3 THEN 0.15
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
        title: row.source_table ? `${row.source_table} - ID: ${row.source_id}` : `Document - ID: ${row.source_id}`,
        score: Math.round((parseFloat(row.similarity_score) + parseFloat(row.keyword_boost)) * 125), // Increased multiplier
        relevanceScore: parseFloat(row.similarity_score),
        content: row.excerpt
      }));
    } catch (error) {
      console.error('❌ Unified semantic search error:', error);
      console.timeEnd(queryId);

      // Check if this is a connection issue
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        if (errorMessage.includes('connection') || errorMessage.includes('timeout') || errorMessage.includes('pool')) {
          console.log('⚠️ Database connection issue detected, using keyword search fallback');
        } else {
          console.log('⚠️ Database query error, using keyword search fallback');
        }
      }

      // Fallback to keyword search instead of recursive call
      return this.keywordSearch(query, limit);
    }
  }

  /**
   * Perform hybrid search (keyword + semantic) with enhanced error handling
   */
  async hybridSearch(query: string, limit: number = 10) {
    const searchId = `hybridSearch_${query.substring(0, 10)}_${Date.now()}`;
    console.time(searchId);

    try {
      console.log(`Starting hybrid search for: "${query}"`);
      
      // Get results from all sources with better distribution
      let allResults: any[] = [];
      
      // 1. Try unified semantic search first
      try {
        const unifiedResults = await this.unifiedSemanticSearch(query, Math.ceil(limit / 2));
        if (unifiedResults && unifiedResults.length > 0) {
          console.log(`✅ Found ${unifiedResults.length} results via unified semantic search`);
          allResults = [...allResults, ...unifiedResults.map((result) => ({
            ...result,
            keyword_score: 0,
            semantic_score: result.score / 100,
            similarity_score: result.score / 100,
            combined_score: result.score / 100,
            source_type: 'unified'
          }))];
        }
      } catch (error) {
        console.log('Unified semantic search failed, continuing with other sources');
      }
      
      // 2. Add keyword search results from all tables
      try {
        const keywordResults = await this.keywordSearch(query, Math.ceil(limit / 2));
        if (keywordResults && keywordResults.length > 0) {
          console.log(`✅ Found ${keywordResults.length} results via keyword search`);
          allResults = [...allResults, ...keywordResults.map((result) => ({
            ...result,
            keyword_score: result.score / 100,
            semantic_score: 0,
            similarity_score: 0,
            combined_score: result.score / 100,
            source_type: 'keyword'
          }))];
        }
      } catch (error) {
        console.log('Keyword search failed, continuing with other sources');
      }
      
      // 3. If still no results, try direct table searches
      if (allResults.length === 0) {
        console.log('No results from unified or keyword search, trying direct table searches');
        
        const tables = [
          { name: TABLE_NAMES.SORUCEVAP, type: 'sorucevap' },
          { name: TABLE_NAMES.OZELGELER, type: 'ozelgeler' },
          { name: TABLE_NAMES.MAKALELER, type: 'makaleler' },
          { name: TABLE_NAMES.DANISTAYKARARLARI, type: 'danistaykararlari' }
        ];
        
        for (const table of tables) {
          try {
            const sourceResults = await this.searchBySource(table.type, query, 5);
            if (sourceResults && sourceResults.length > 0) {
              console.log(`Found ${sourceResults.length} results from ${table.name}`);
              allResults = [...allResults, ...sourceResults.map((result) => ({
                ...result,
                score: result.score || 70, // Default score for direct search
                keyword_score: 0.7,
                semantic_score: 0,
                similarity_score: 0,
                combined_score: 0.7,
                source_type: 'direct'
              }))];
            }
          } catch (error) {
            console.log(`Direct search on ${table.name} failed`);
          }
        }
      }
      
      // Sort by combined score and limit results
      const sortedResults = allResults
        .sort((a, b) => b.combined_score - a.combined_score)
        .slice(0, limit);
      
      console.timeEnd(searchId);
      console.log(`Returning ${sortedResults.length} hybrid search results`);
      
      return sortedResults;
    } catch (error) {
      console.timeEnd(searchId);
      console.error('❌ Hybrid search error:', error);

      // Last resort fallback - return empty results but don't crash
      console.log('⚠️ All search methods failed, returning empty results');
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
        case 'makaleler':
          searchQuery = `
            SELECT 
              id::text as id,
              'MAKALE - ' || LEFT(baslik, 100) as title,
              'makaleler' as source_table,
              id::text as source_id,
              LEFT(icerik, 500) as excerpt
            FROM ${TABLE_NAMES.MAKALELER}
            WHERE baslik ILIKE $1 OR icerik ILIKE $1
            ORDER BY id DESC
            LIMIT $2
          `;
          break;
        case 'danistaykararlari':
          searchQuery = `
            SELECT 
              id::text as id,
              'DANIŞTAY - ' || LEFT(konu, 100) as title,
              'danistaykararlari' as source_table,
              id::text as source_id,
              LEFT(karar, 500) as excerpt
            FROM ${TABLE_NAMES.DANISTAYKARARLARI}
            WHERE konu ILIKE $1 OR karar ILIKE $1
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
        if (error instanceof Error) {
          console.log('Could not get stats from customer database:', error.message);
        } else {
          console.log('An unknown error occurred while getting stats from the customer database.');
        }
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
