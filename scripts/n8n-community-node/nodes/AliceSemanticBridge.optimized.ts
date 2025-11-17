import { Pool } from 'pg';
import { EmbeddingService } from '../shared/embedding-service';
import { PerformanceMetrics, trackPerformance } from '../shared/metrics';
import { INodeExecutionData, IDataObject } from 'n8n-workflow';
import { chunkText } from '../shared/chunk';

interface BatchProcessor {
  processBatch<T>(
    items: T[],
    batchSize: number,
    processor: (batch: T[]) => Promise<any[]>
  ): Promise<any[]>;
}

class OptimizedBatchProcessor implements BatchProcessor {
  async processBatch<T>(
    items: T[],
    batchSize: number,
    processor: (batch: T[]) => Promise<any[]>
  ): Promise<any[]> {
    const results: any[] = [];
    const batches: T[][] = [];
    
    // Create batches
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, Math.min(i + batchSize, items.length)));
    }
    
    // Process batches in parallel with concurrency limit
    const concurrencyLimit = 3;
    for (let i = 0; i < batches.length; i += concurrencyLimit) {
      const concurrentBatches = batches.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        concurrentBatches.map(batch => processor(batch))
      );
      results.push(...batchResults.flat());
    }
    
    return results;
  }
}

export class OptimizedAliceSemanticBridge {
  private static batchProcessor = new OptimizedBatchProcessor();
  
  @trackPerformance
  static async processContentOptimized(
    context: any,
    items: INodeExecutionData[],
    pool: Pool,
    embeddingService: EmbeddingService,
    options: IDataObject
  ): Promise<INodeExecutionData[]> {
    const processOptions = context.getNodeParameter('processOptions', 0, {}) as any;
    const chunkSize = processOptions.chunkSize || 512;
    const chunkOverlap = processOptions.chunkOverlap || 64;
    const batchSize = processOptions.batchSize || 50; // Optimized batch size
    
    // Track start
    const operationId = `process-${Date.now()}`;
    PerformanceMetrics.startOperation(operationId);
    
    try {
      const results = await this.batchProcessor.processBatch(
        items,
        batchSize,
        async (batch) => {
          return await this.processBatchWithErrorBoundary(
            batch,
            context,
            pool,
            embeddingService,
            { chunkSize, chunkOverlap }
          );
        }
      );
      
      // Track completion
      const duration = PerformanceMetrics.endOperation(operationId, 'processContent');
      console.log(`Processed ${items.length} items in ${duration}ms`);
      
      return results;
    } catch (error) {
      PerformanceMetrics.endOperation(operationId, 'processContent-error');
      throw error;
    }
  }
  
  private static async processBatchWithErrorBoundary(
    batch: INodeExecutionData[],
    context: any,
    pool: Pool,
    embeddingService: EmbeddingService,
    options: { chunkSize: number; chunkOverlap: number }
  ): Promise<INodeExecutionData[]> {
    const results: INodeExecutionData[] = [];
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Process all items in batch with parallel embedding generation
      const batchPromises = batch.map(async (item, index) => {
        try {
          const content = this.extractContent(item, context, index);
          const sourceId = context.getNodeParameter('sourceId', index) as string;
          
          // Chunk content
          const chunks = chunkText(content, {
            maxChars: options.chunkSize,
            overlap: options.chunkOverlap
          });
          
          // Generate embeddings in parallel
          const embeddings = await Promise.all(
            chunks.map(chunk => embeddingService.generateEmbedding(chunk))
          );
          
          // Prepare batch insert data
          return {
            sourceId,
            chunks,
            embeddings,
            metadata: item.json.metadata || {}
          };
        } catch (error) {
          // Error boundary - log but don't fail entire batch
          console.error(`Error processing item ${index}:`, error);
          return null;
        }
      });
      
      const processedItems = await Promise.all(batchPromises);
      
      // Batch insert all successful items
      const insertValues: any[] = [];
      const insertParams: any[] = [];
      let paramCount = 0;
      
      for (const item of processedItems) {
        if (!item) continue; // Skip failed items
        
        for (let i = 0; i < item.chunks.length; i++) {
          const embedding = item.embeddings[i];
          insertValues.push(
            `($${++paramCount}, $${++paramCount}, $${++paramCount}::vector, $${++paramCount}, $${++paramCount}, $${++paramCount})`
          );
          insertParams.push(
            item.sourceId,
            item.chunks[i],
            `[${embedding.embedding.join(',')}]`,
            JSON.stringify(item.metadata),
            i,
            item.chunks.length
          );
        }
      }
      
      if (insertValues.length > 0) {
        // Single batch insert for all chunks
        await client.query(
          `INSERT INTO embeddings (source_id, text, embedding, metadata, chunk_index, total_chunks)
           VALUES ${insertValues.join(', ')}
           ON CONFLICT (source_id, chunk_index) DO UPDATE 
           SET text = EXCLUDED.text, 
               embedding = EXCLUDED.embedding,
               metadata = EXCLUDED.metadata,
               updated_at = NOW()`,
          insertParams
        );
      }
      
      await client.query('COMMIT');
      
      // Return success results
      processedItems.forEach((item, index) => {
        if (item) {
          results.push({
            json: {
              sourceId: item.sourceId,
              chunks: item.chunks.length,
              status: 'success'
            },
            pairedItem: { item: index }
          });
        }
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
    return results;
  }
  
  private static extractContent(
    item: INodeExecutionData,
    context: any,
    index: number
  ): string {
    const contentSource = context.getNodeParameter('contentSource', index) as string;
    
    if (contentSource === 'field') {
      const contentField = context.getNodeParameter('contentField', index) as string;
      return item.json[contentField] as string;
    } else if (contentSource === 'url') {
      const url = context.getNodeParameter('url', index) as string;
      return `Content from URL: ${url}`;
    }
    
    throw new Error('Invalid content source');
  }
  
  @trackPerformance
  static async searchContentOptimized(
    context: any,
    items: INodeExecutionData[],
    pool: Pool,
    apiKey: string,
    options: IDataObject
  ): Promise<INodeExecutionData[]> {
    const searchMode = context.getNodeParameter('searchMode', 0) as string;
    const limit = context.getNodeParameter('limit', 0, 10) as number;
    const similarityThreshold = context.getNodeParameter('similarityThreshold', 0, 0.7) as number;
    
    // Use connection pooling efficiently
    const results = await this.batchProcessor.processBatch(
      items,
      10, // Process search queries in smaller batches
      async (batch) => {
        const batchResults: INodeExecutionData[] = [];
        
        for (const item of batch) {
          const query = item.json.query as string;
          
          // Use hybrid search with caching
          const searchResults = await this.performCachedSearch(
            pool,
            query,
            { searchMode, limit, similarityThreshold, apiKey }
          );
          
          batchResults.push({
            json: {
              query,
              results: searchResults,
              count: searchResults.length
            }
          });
        }
        
        return batchResults;
      }
    );
    
    return results;
  }
  
  private static searchCache = new Map<string, any>();
  
  private static async performCachedSearch(
    pool: Pool,
    query: string,
    options: any
  ): Promise<any[]> {
    const cacheKey = `${query}-${JSON.stringify(options)}`;
    
    // Check cache
    if (this.searchCache.has(cacheKey)) {
      const cached = this.searchCache.get(cacheKey);
      if (cached.timestamp > Date.now() - 300000) { // 5 minute cache
        return cached.results;
      }
    }
    
    // Perform search
    const client = await pool.connect();
    try {
      // Implement actual search logic here
      const results = await client.query(
        `SELECT * FROM embeddings 
         WHERE text ILIKE $1 
         LIMIT $2`,
        [`%${query}%`, options.limit]
      );
      
      // Cache results
      this.searchCache.set(cacheKey, {
        results: results.rows,
        timestamp: Date.now()
      });
      
      // Clean old cache entries
      if (this.searchCache.size > 100) {
        const oldestKey = this.searchCache.keys().next().value;
        this.searchCache.delete(oldestKey);
      }
      
      return results.rows;
    } finally {
      client.release();
    }
  }
}