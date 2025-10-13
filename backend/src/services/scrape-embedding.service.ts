import { lsembPool } from '../config/database.config';
import { getEmbeddingProvider } from './embedding.service';

export interface ScrapeEmbeddingData {
  content: string;
  sourceUrl: string;
  title?: string;
  category?: string;
  projectId?: string;
  siteId?: string;
  chunkIndex?: number;
  totalChunks?: number;
  metadata?: Record<string, any>;
}

export class ScrapeEmbeddingService {
  private provider: any;

  constructor() {
    this.provider = getEmbeddingProvider();
  }

  async generateAndSaveEmbedding(data: ScrapeEmbeddingData): Promise<string> {
    try {
      // Generate embedding
      const embedding = await this.provider.generateEmbedding(data.content);

      // Save to scrape_embeddings table
      const result = await lsembPool.query(`
        INSERT INTO scrape_embeddings
        (content, embedding, metadata, source_url, title, category,
         project_id, site_id, chunk_index, total_chunks, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        data.content,
        `[${embedding.join(',')}]`, // Convert to vector format
        JSON.stringify(data.metadata || {}),
        data.sourceUrl,
        data.title || null,
        data.category || null,
        data.projectId || null,
        data.siteId || null,
        data.chunkIndex || 0,
        data.totalChunks || 1
      ]);

      console.log(`[SCRAPE_EMBEDDING] Saved embedding for: ${data.title || data.sourceUrl}`);
      return result.rows[0].id;

    } catch (error: any) {
      console.error('[SCRAPE_EMBEDDING] Error:', error);
      throw error;
    }
  }

  async processAndSaveChunks(
    content: string,
    metadata: ScrapeEmbeddingData,
    chunkSize: number = 1000,
    chunkOverlap: number = 200
  ): Promise<string[]> {
    // Simple text chunking
    const chunks = this.chunkText(content, chunkSize, chunkOverlap);
    const embeddingIds: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkData: ScrapeEmbeddingData = {
        ...metadata,
        content: chunks[i],
        chunkIndex: i,
        totalChunks: chunks.length,
        metadata: {
          ...metadata.metadata,
          isChunk: true,
          chunkInfo: {
            index: i,
            total: chunks.length,
            size: chunks[i].length
          }
        }
      };

      const id = await this.generateAndSaveEmbedding(chunkData);
      embeddingIds.push(id);
    }

    // Update statistics
    await this.updateStatistics(metadata.projectId, metadata.category, chunks.length);

    return embeddingIds;
  }

  private chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

      // Try to break at sentence boundary
      if (end < text.length) {
        const lastSentence = Math.max(
          chunk.lastIndexOf('. '),
          chunk.lastIndexOf('! '),
          chunk.lastIndexOf('? '),
          chunk.lastIndexOf('\n\n')
        );

        if (lastSentence > chunkSize * 0.7) {
          chunk = chunk.slice(0, lastSentence + 1);
        }
      }

      chunks.push(chunk.trim());
      start = Math.max(start + chunk.length - overlap, chunks.reduce((sum, c) => sum + c.length, 0));
    }

    return chunks.filter(c => c.length > 50); // Filter out very small chunks
  }

  private async updateStatistics(projectId?: string, category?: string, chunkCount: number = 0) {
    try {
      await lsembPool.query(`
        INSERT INTO scrape_statistics
        (project_id, date, total_chunks, categories_processed)
        VALUES ($1, CURRENT_DATE, $2, ARRAY[$3])
        ON CONFLICT (project_id, date)
        DO UPDATE SET
          total_chunks = scrape_statistics.total_chunks + EXCLUDED.total_chunks,
          categories_processed = array_cat(
            DISTINCT scrape_statistics.categories_processed,
            EXCLUDED.categories_processed
          ),
          updated_at = CURRENT_TIMESTAMP
      `, [projectId, chunkCount, category]);
    } catch (error) {
      console.error('[SCRAPE_EMBEDDING] Statistics update error:', error);
    }
  }

  async searchSimilar(
    query: string,
    category?: string,
    projectId?: string,
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<any[]> {
    try {
      // Generate embedding for query
      const queryEmbedding = await this.provider.generateEmbedding(query);
      const vectorString = `[${queryEmbedding.join(',')}]`;

      // Build WHERE clause
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [vectorString, limit, threshold];

      if (category) {
        conditions.push('category = $' + (params.length + 1));
        params.push(category);
      }

      if (projectId) {
        conditions.push('project_id = $' + (params.length + 1));
        params.push(projectId);
      }

      const sql = `
        SELECT
          id,
          content,
          title,
          source_url,
          category,
          metadata,
          chunk_index,
          total_chunks,
          created_at,
          1 - (embedding <=> $1::vector) as similarity
        FROM scrape_embeddings
        WHERE ${conditions.join(' AND ')}
          AND 1 - (embedding <=> $1::vector) > $3
        ORDER BY similarity DESC
        LIMIT $2
      `;

      const result = await lsembPool.query(sql, params);
      return result.rows;

    } catch (error: any) {
      console.error('[SCRAPE_EMBEDDING] Search error:', error);
      throw error;
    }
  }

  async getStatistics(projectId?: string, days: number = 30): Promise<any> {
    try {
      const result = await lsembPool.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total_embeddings,
          COUNT(DISTINCT category) as unique_categories,
          COUNT(DISTINCT project_id) as unique_projects,
          AVG(array_length(string_to_array(content, ' '), 1)) as avg_content_length
        FROM scrape_embeddings
        WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
          ${projectId ? 'AND project_id = $1' : ''}
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, projectId ? [projectId] : []);

      return result.rows;
    } catch (error) {
      console.error('[SCRAPE_EMBEDDING] Statistics error:', error);
      throw error;
    }
  }
}

export const scrapeEmbeddingService = new ScrapeEmbeddingService();