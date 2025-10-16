import { pool } from '../config/database.config';

interface SearchResult {
  id: string;
  title: string;
  content: string;
  source_table: string;
  similarity_score: number;
  keyword_score?: number;
  combined_score: number;
  metadata?: any;
}

interface HybridSearchOptions {
  query: string;
  maxResults?: number;
  similarityThreshold?: number;
  keywordWeight?: number; // Weight for keyword matching (0-1)
  semanticWeight?: number; // Weight for semantic similarity (0-1)
  enableReranking?: boolean;
  sources?: string[];
}

export class HybridSearchService {
  private static instance: HybridSearchService;

  static getInstance(): HybridSearchService {
    if (!HybridSearchService.instance) {
      HybridSearchService.instance = new HybridSearchService();
    }
    return HybridSearchService.instance;
  }

  /**
   * Perform hybrid search combining semantic and keyword search
   */
  async hybridSearch(options: HybridSearchOptions): Promise<{
    results: SearchResult[];
    searchMeta: {
      query: string;
      semanticCount: number;
      keywordCount: number;
      combinedCount: number;
      searchTime: number;
    };
  }> {
    const startTime = Date.now();
    const {
      query,
      maxResults = 10,
      similarityThreshold = 0.1,
      keywordWeight = 0.3,
      semanticWeight = 0.7,
      enableReranking = true,
      sources = ['unified_embeddings', 'document_embeddings', 'scrape_embeddings', 'message_embeddings']
    } = options;

    // Extract keywords from query
    const keywords = this.extractKeywords(query);

    // Perform semantic search
    const semanticResults = await this.performSemanticSearch(
      query,
      maxResults * 2,
      similarityThreshold,
      sources
    );

    // Perform keyword search
    const keywordResults = await this.performKeywordSearch(
      keywords,
      maxResults * 2,
      sources
    );

    // Combine and score results
    const combinedResults = this.combineResults(
      semanticResults,
      keywordResults,
      keywordWeight,
      semanticWeight
    );

    // Apply re-ranking if enabled
    const finalResults = enableReranking
      ? await this.rerankResults(query, combinedResults.slice(0, maxResults * 2))
      : combinedResults.slice(0, maxResults);

    const searchTime = Date.now() - startTime;

    return {
      results: finalResults.slice(0, maxResults),
      searchMeta: {
        query,
        semanticCount: semanticResults.length,
        keywordCount: keywordResults.length,
        combinedCount: combinedResults.length,
        searchTime
      }
    };
  }

  /**
   * Extract keywords from query using simple TF-IDF approach
   */
  private extractKeywords(query: string): string[] {
    // Simple keyword extraction - can be enhanced with NLP libraries
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'among', 'merhaba', 'nedir', 'nasıl', 'neden', 'ne', 'hangi', 'kaç', 'nerede',
      'ne zaman', 'mi', 'mı', 'mu', 'mü'
    ]);

    // Normalize and split query
    const words = query
      .toLowerCase()
      .replace(/[^\w\sğüşöçİĞÜŞÖÇ]/g, ' ') // Keep Turkish characters
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    // Calculate term frequency
    const termFreq = new Map<string, number>();
    words.forEach(word => {
      termFreq.set(word, (termFreq.get(word) || 0) + 1);
    });

    // Return keywords sorted by frequency
    return Array.from(termFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Perform semantic vector search
   */
  private async performSemanticSearch(
    query: string,
    maxResults: number,
    threshold: number,
    sources: string[]
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const source of sources) {
      try {
        const queryEmbedding = await this.generateEmbedding(query);
        if (!queryEmbedding) continue;

        const sourceTable = this.getTableName(source);
        const queryText = `
          SELECT
            id,
            title,
            content,
            '${source}' as source_table,
            1 - (embedding <=> $1::vector) as similarity_score,
            metadata,
            0 as keyword_score,
            (1 - (embedding <=> $1::vector)) as combined_score
          FROM ${sourceTable}
          WHERE 1 - (embedding <=> $1::vector) > $2
          ORDER BY similarity_score DESC
          LIMIT $3
        `;

        const { rows } = await pool.query(queryText, [
          `[${queryEmbedding.join(',')}]`,
          threshold,
          maxResults
        ]);

        results.push(...rows);
      } catch (error) {
        console.error(`Semantic search error for ${source}:`, error);
      }
    }

    return results;
  }

  /**
   * Perform keyword-based search
   */
  private async performKeywordSearch(
    keywords: string[],
    maxResults: number,
    sources: string[]
  ): Promise<SearchResult[]> {
    if (keywords.length === 0) return [];

    const results: SearchResult[] = [];

    for (const source of sources) {
      try {
        const sourceTable = this.getTableName(source);

        // Build keyword search query
        const keywordConditions = keywords.map((keyword, index) => {
          return `(LOWER(content) LIKE $${index * 2 + 1} OR LOWER(title) LIKE $${index * 2 + 2})`;
        }).join(' OR ');

        const keywordParams: string[] = [];
        keywords.forEach(keyword => {
          keywordParams.push(`%${keyword}%`, `%${keyword}%`);
        });

        const queryText = `
          SELECT
            id,
            title,
            content,
            '${source}' as source_table,
            0 as similarity_score,
            metadata,
            ${keywords.length} as keyword_score,
            ${keywords.length} as combined_score
          FROM ${sourceTable}
          WHERE ${keywordConditions}
          LIMIT $${keywordParams.length + 1}
        `;

        const { rows } = await pool.query(queryText, [...keywordParams, maxResults]);

        // Calculate keyword relevance score
        const scoredRows = rows.map(row => {
          const content = (row.content + ' ' + row.title).toLowerCase();
          const keywordScore = keywords.reduce((score, keyword) => {
            const matches = (content.match(new RegExp(keyword, 'g')) || []).length;
            return score + matches;
          }, 0);

          return {
            ...row,
            keyword_score: keywordScore,
            combined_score: keywordScore
          };
        });

        results.push(...scoredRows);
      } catch (error) {
        console.error(`Keyword search error for ${source}:`, error);
      }
    }

    return results;
  }

  /**
   * Combine semantic and keyword results
   */
  private combineResults(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
    keywordWeight: number,
    semanticWeight: number
  ): SearchResult[] {
    const combinedMap = new Map<string, SearchResult>();

    // Add semantic results
    semanticResults.forEach(result => {
      const key = `${result.source_table}:${result.id}`;
      result.combined_score = result.similarity_score * semanticWeight;
      combinedMap.set(key, result);
    });

    // Add or merge keyword results
    keywordResults.forEach(result => {
      const key = `${result.source_table}:${result.id}`;
      const existing = combinedMap.get(key);

      if (existing) {
        // Merge scores
        existing.combined_score += (result.keyword_score || 0) * keywordWeight;
        existing.keyword_score = result.keyword_score;
      } else {
        // Add new result
        result.combined_score = (result.keyword_score || 0) * keywordWeight;
        combinedMap.set(key, result);
      }
    });

    // Convert to array and sort by combined score
    return Array.from(combinedMap.values())
      .sort((a, b) => b.combined_score - a.combined_score);
  }

  /**
   * Re-rank results based on query relevance
   */
  private async rerankResults(
    query: string,
    results: SearchResult[]
  ): Promise<SearchResult[]> {
    // Simple re-ranking based on:
    // 1. Exact phrase matches
    // 2. Title vs content relevance
    // 3. Source priority

    const queryTerms = query.toLowerCase().split(/\s+/);

    return results.map(result => {
      const titleLower = result.title.toLowerCase();
      const contentLower = result.content.toLowerCase();

      // Calculate re-ranking score
      let rerankScore = 0;

      // Exact phrase match bonus
      if (contentLower.includes(query.toLowerCase()) || titleLower.includes(query.toLowerCase())) {
        rerankScore += 2;
      }

      // Term coverage bonus
      const coverage = queryTerms.filter(term =>
        contentLower.includes(term) || titleLower.includes(term)
      ).length / queryTerms.length;
      rerankScore += coverage;

      // Title match bonus
      const titleMatch = queryTerms.filter(term => titleLower.includes(term)).length;
      rerankScore += titleMatch * 0.5;

      // Source priority
      const sourcePriority = {
        'unified_embeddings': 1.0,
        'document_embeddings': 0.9,
        'scrape_embeddings': 0.8,
        'message_embeddings': 0.7
      };
      rerankScore *= sourcePriority[result.source_table as keyof typeof sourcePriority] || 0.5;

      // Combine with original score
      result.combined_score = result.combined_score * 0.7 + rerankScore * 0.3;

      return result;
    }).sort((a, b) => b.combined_score - a.combined_score);
  }

  /**
   * Generate embedding for query (simplified)
   */
  private async generateEmbedding(query: string): Promise<number[] | null> {
    // This would integrate with OpenAI/Google embedding API
    // For now, return mock embedding
    return new Array(1536).fill(0).map(() => Math.random());
  }

  /**
   * Map source names to table names
   */
  private getTableName(source: string): string {
    const tableMap: { [key: string]: string } = {
      'unified_embeddings': 'unified_embeddings',
      'document_embeddings': 'document_embeddings',
      'scrape_embeddings': 'scrape_embeddings',
      'message_embeddings': 'message_embeddings'
    };
    return tableMap[source] || source;
  }
}

export default HybridSearchService.getInstance();