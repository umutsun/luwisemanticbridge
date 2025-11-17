/**
 * Alice Semantic Bridge - Enhanced Embeddings Service
 * @author Gemini (AI Integration Lead)
 */

import { createHash } from 'crypto';
import { IExecuteFunctions } from 'n8n-workflow';
import { ASBError, ErrorType, retryWithBackoff, callOpenAIWithRetry } from './error-handling';
import { CacheManager } from '../src/shared/cache-manager';
import { redisPool } from '../src/shared/connection-pool';

// Provider types
export enum EmbeddingProvider {
  OPENAI = 'openai',
  COHERE = 'cohere',
  HUGGINGFACE = 'huggingface',
  LOCAL = 'local'
}

// Model configurations
export interface EmbeddingModel {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  maxTokens: number;
  costPer1kTokens?: number;
}

export const EMBEDDING_MODELS: Record<string, EmbeddingModel> = {
  'text-embedding-3-small': {
    provider: EmbeddingProvider.OPENAI,
    model: 'text-embedding-3-small',
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.00002
  },
  'text-embedding-3-large': {
    provider: EmbeddingProvider.OPENAI,
    model: 'text-embedding-3-large',
    dimensions: 3072,
    maxTokens: 8191,
    costPer1kTokens: 0.00013
  },
  'text-embedding-ada-002': {
    provider: EmbeddingProvider.OPENAI,
    model: 'text-embedding-ada-002',
    dimensions: 1536,
    maxTokens: 8191,
    costPer1kTokens: 0.0001
  },
  'embed-english-v3.0': {
    provider: EmbeddingProvider.COHERE,
    model: 'embed-english-v3.0',
    dimensions: 1024,
    maxTokens: 512,
    costPer1kTokens: 0.00013
  },
  'embed-multilingual-v3.0': {
    provider: EmbeddingProvider.COHERE,
    model: 'embed-multilingual-v3.0',
    dimensions: 1024,
    maxTokens: 512,
    costPer1kTokens: 0.00013
  }
};

// Embedding service configuration
export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  batchSize?: number;
  cacheTTL?: number;
  enableCache?: boolean;
  enableCompression?: boolean;
  timeout?: number;
}

// Embedding request/response types
export interface EmbeddingRequest {
  text: string;
  model?: string;
  metadata?: Record<string, any>;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  provider: EmbeddingProvider;
  dimensions: number;
  tokensUsed?: number;
  cost?: number;
  cached: boolean;
}

export interface BatchEmbeddingResponse {
  embeddings: EmbeddingResponse[];
  totalTokens: number;
  totalCost: number;
  errors?: Array<{ index: number; error: string }>;
}

/**
 * Enhanced Embedding Service with multi-provider support
 */
export class EmbeddingService {
  private static instance: EmbeddingService;
  private cache: CacheManager;
  private redisClient: any;
  private config: EmbeddingConfig;
  private tokenCount: number = 0;
  private totalCost: number = 0;
  
  private constructor(config: EmbeddingConfig) {
    this.config = config;
    this.cache = CacheManager.getInstance();
    this.redisClient = redisPool.getClient('cache');
  }
  
  static getInstance(config?: EmbeddingConfig): EmbeddingService {
    if (!EmbeddingService.instance) {
      if (!config) {
        config = {
          provider: EmbeddingProvider.OPENAI,
          model: 'text-embedding-3-small',
          enableCache: true,
          cacheTTL: 3600,
          batchSize: 100,
          timeout: 30000
        };
      }
      EmbeddingService.instance = new EmbeddingService(config);
    }
    return EmbeddingService.instance;
  }
  
  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(
    text: string,
    options?: Partial<EmbeddingConfig>
  ): Promise<EmbeddingResponse> {
    const config = { ...this.config, ...options };
    
    // Check cache first
    if (config.enableCache) {
      const cached = await this.getCachedEmbedding(text, config.model);
      if (cached) {
        return {
          ...cached,
          cached: true
        };
      }
    }
    
    // Generate new embedding
    let response: EmbeddingResponse;
    
    switch (config.provider) {
      case EmbeddingProvider.OPENAI:
        response = await this.generateOpenAIEmbedding(text, config);
        break;
      case EmbeddingProvider.COHERE:
        response = await this.generateCohereEmbedding(text, config);
        break;
      case EmbeddingProvider.HUGGINGFACE:
        response = await this.generateHuggingFaceEmbedding(text, config);
        break;
      case EmbeddingProvider.LOCAL:
        response = await this.generateLocalEmbedding(text, config);
        break;
      default:
        throw new ASBError(
          `Unsupported embedding provider: ${config.provider}`,
          ErrorType.VALIDATION_ERROR
        );
    }
    
    // Cache the result
    if (config.enableCache) {
      await this.cacheEmbedding(text, response, config.cacheTTL);
    }
    
    // Update metrics
    this.tokenCount += response.tokensUsed || 0;
    this.totalCost += response.cost || 0;
    
    return response;
  }
  
  /**
   * Generate embeddings for multiple texts
   */
  async batchEmbeddings(
    texts: string[],
    options?: Partial<EmbeddingConfig>
  ): Promise<BatchEmbeddingResponse> {
    const config = { ...this.config, ...options };
    const batchSize = config.batchSize || 100;
    const results: EmbeddingResponse[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    let totalTokens = 0;
    let totalCost = 0;
    
    // Process in batches
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, Math.min(i + batchSize, texts.length));
      
      // Check cache for each text
      const toProcess: Array<{ index: number; text: string }> = [];
      
      for (let j = 0; j < batch.length; j++) {
        const globalIndex = i + j;
        const text = batch[j];
        
        if (config.enableCache) {
          const cached = await this.getCachedEmbedding(text, config.model);
          if (cached) {
            results[globalIndex] = { ...cached, cached: true };
            continue;
          }
        }
        
        toProcess.push({ index: globalIndex, text });
      }
      
      // Process uncached texts
      if (toProcess.length > 0) {
        try {
          const batchResponses = await this.processBatch(
            toProcess.map(item => item.text),
            config
          );
          
          for (let k = 0; k < toProcess.length; k++) {
            const item = toProcess[k];
            const response = batchResponses[k];
            
            if (response) {
              results[item.index] = response;
              totalTokens += response.tokensUsed || 0;
              totalCost += response.cost || 0;
              
              // Cache the result
              if (config.enableCache) {
                await this.cacheEmbedding(item.text, response, config.cacheTTL);
              }
            }
          }
        } catch (error) {
          // Record errors for this batch
          for (const item of toProcess) {
            errors.push({
              index: item.index,
              error: (error as Error).message
            });
          }
        }
      }
    }
    
    return {
      embeddings: results,
      totalTokens,
      totalCost,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  /**
   * Generate OpenAI embeddings
   */
  private async generateOpenAIEmbedding(
    text: string,
    config: EmbeddingConfig
  ): Promise<EmbeddingResponse> {
    const model = EMBEDDING_MODELS[config.model] || EMBEDDING_MODELS['text-embedding-3-small'];
    
    return callOpenAIWithRetry(async () => {
      const response = await fetch(
        `${config.baseUrl || 'https://api.openai.com'}/v1/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            input: text,
            model: model.model,
            encoding_format: 'float'
          }),
          signal: AbortSignal.timeout(config.timeout || 30000)
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new ASBError(
          `OpenAI API error: ${error}`,
          ErrorType.PROCESSING_ERROR,
          { metadata: { status: response.status } }
        );
      }
      
      const data: any = await response.json();
      const embedding = data.data[0].embedding;
      const usage = data.usage;
      
      return {
        embedding,
        model: model.model,
        provider: EmbeddingProvider.OPENAI,
        dimensions: embedding.length,
        tokensUsed: usage?.total_tokens,
        cost: usage ? (usage.total_tokens / 1000) * (model.costPer1kTokens || 0) : 0,
        cached: false
      };
    });
  }
  
  /**
   * Generate Cohere embeddings
   */
  private async generateCohereEmbedding(
    text: string,
    config: EmbeddingConfig
  ): Promise<EmbeddingResponse> {
    const model = EMBEDDING_MODELS[config.model] || EMBEDDING_MODELS['embed-english-v3.0'];
    
    const response = await fetch(
      `${config.baseUrl || 'https://api.cohere.ai'}/v1/embed`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          texts: [text],
          model: model.model,
          input_type: 'search_document',
          truncate: 'END'
        }),
        signal: AbortSignal.timeout(config.timeout || 30000)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new ASBError(
        `Cohere API error: ${error}`,
        ErrorType.PROCESSING_ERROR,
        {}
      );
    }
    
    const data: any = await response.json();
    const embedding = data.embeddings[0];
    
    return {
      embedding,
      model: model.model,
      provider: EmbeddingProvider.COHERE,
      dimensions: embedding.length,
      tokensUsed: data.meta?.billed_units?.input_tokens,
      cost: data.meta?.billed_units?.input_tokens 
        ? (data.meta.billed_units.input_tokens / 1000) * (model.costPer1kTokens || 0)
        : 0,
      cached: false
    };
  }
  
  /**
   * Generate HuggingFace embeddings
   */
  private async generateHuggingFaceEmbedding(
    text: string,
    config: EmbeddingConfig
  ): Promise<EmbeddingResponse> {
    const response = await fetch(
      `${config.baseUrl || 'https://api-inference.huggingface.co'}/models/${config.model}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          inputs: text,
          options: { wait_for_model: true }
        }),
        signal: AbortSignal.timeout(config.timeout || 30000)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new ASBError(
        `HuggingFace API error: ${error}`,
        ErrorType.PROCESSING_ERROR,
        {}
      );
    }
    
    const embedding: any = await response.json();
    
    return {
      embedding: Array.isArray(embedding) ? embedding : embedding[0],
      model: config.model,
      provider: EmbeddingProvider.HUGGINGFACE,
      dimensions: embedding.length,
      cached: false
    };
  }
  
  /**
   * Generate local embeddings (mock for testing)
   */
  private async generateLocalEmbedding(
    text: string,
    config: EmbeddingConfig
  ): Promise<EmbeddingResponse> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Generate deterministic mock embedding based on text hash
    const hash = createHash('sha256').update(text).digest();
    const dimensions = 1536;
    const embedding = new Array(dimensions);
    
    for (let i = 0; i < dimensions; i++) {
      // Use hash bytes to generate pseudo-random values
      const byte = hash[i % hash.length];
      embedding[i] = (byte - 128) / 128; // Normalize to [-1, 1]
    }
    
    return {
      embedding,
      model: 'local-mock',
      provider: EmbeddingProvider.LOCAL,
      dimensions,
      tokensUsed: Math.ceil(text.length / 4),
      cost: 0,
      cached: false
    };
  }
  
  /**
   * Process batch of texts
   */
  private async processBatch(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<EmbeddingResponse[]> {
    switch (config.provider) {
      case EmbeddingProvider.OPENAI:
        return this.processBatchOpenAI(texts, config);
      case EmbeddingProvider.COHERE:
        return this.processBatchCohere(texts, config);
      default:
        // Fall back to sequential processing
        const results: EmbeddingResponse[] = [];
        for (const text of texts) {
          const response = await this.generateEmbedding(text, config);
          results.push(response);
        }
        return results;
    }
  }
  
  /**
   * Process batch with OpenAI
   */
  private async processBatchOpenAI(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<EmbeddingResponse[]> {
    const model = EMBEDDING_MODELS[config.model] || EMBEDDING_MODELS['text-embedding-3-small'];
    
    return callOpenAIWithRetry(async () => {
      const response = await fetch(
        `${config.baseUrl || 'https://api.openai.com'}/v1/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          body: JSON.stringify({
            input: texts,
            model: model.model,
            encoding_format: 'float'
          }),
          signal: AbortSignal.timeout(config.timeout || 30000)
        }
      );
      
      if (!response.ok) {
        const error = await response.text();
        throw new ASBError(
          `OpenAI batch API error: ${error}`,
          ErrorType.PROCESSING_ERROR,
          { metadata: { status: response.status } }
        );
      }
      
      const data: any = await response.json();
      const usage = data.usage;
      const costPerEmbedding = usage 
        ? (usage.total_tokens / texts.length / 1000) * (model.costPer1kTokens || 0)
        : 0;
      
      return data.data.map((item: any) => ({
        embedding: item.embedding,
        model: model.model,
        provider: EmbeddingProvider.OPENAI,
        dimensions: item.embedding.length,
        tokensUsed: usage ? Math.ceil(usage.total_tokens / texts.length) : undefined,
        cost: costPerEmbedding,
        cached: false
      }));
    });
  }
  
  /**
   * Process batch with Cohere
   */
  private async processBatchCohere(
    texts: string[],
    config: EmbeddingConfig
  ): Promise<EmbeddingResponse[]> {
    const model = EMBEDDING_MODELS[config.model] || EMBEDDING_MODELS['embed-english-v3.0'];
    
    const response = await fetch(
      `${config.baseUrl || 'https://api.cohere.ai'}/v1/embed`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          texts,
          model: model.model,
          input_type: 'search_document',
          truncate: 'END'
        }),
        signal: AbortSignal.timeout(config.timeout || 30000)
      }
    );
    
    if (!response.ok) {
      const error = await response.text();
      throw new ASBError(
        `Cohere batch API error: ${error}`,
        ErrorType.PROCESSING_ERROR,
        { metadata: { status: response.status } }
      );
    }
    
    const data: any = await response.json();
    const tokensPerText = data.meta?.billed_units?.input_tokens 
      ? Math.ceil(data.meta.billed_units.input_tokens / texts.length)
      : undefined;
    
    return data.embeddings.map((embedding: number[]) => ({
      embedding,
      model: model.model,
      provider: EmbeddingProvider.COHERE,
      dimensions: embedding.length,
      tokensUsed: tokensPerText,
      cost: tokensPerText 
        ? (tokensPerText / 1000) * (model.costPer1kTokens || 0)
        : 0,
      cached: false
    }));
  }
  
  /**
   * Get cached embedding
   */
  private async getCachedEmbedding(
    text: string,
    model: string
  ): Promise<EmbeddingResponse | null> {
    const key = this.generateCacheKey(text, model);
    const cached = await this.cache.get<EmbeddingResponse>(key);
    return cached;
  }
  
  /**
   * Cache embedding
   */
  private async cacheEmbedding(
    text: string,
    response: EmbeddingResponse,
    ttl?: number
  ): Promise<void> {
    const key = this.generateCacheKey(text, response.model);
    await this.cache.set(key, response, ttl || 3600);
  }
  
  /**
   * Generate cache key
   */
  private generateCacheKey(text: string, model: string): string {
    const hash = createHash('sha256')
      .update(`${text}:${model}`)
      .digest('hex')
      .substring(0, 16);
    return `embedding:${model}:${hash}`;
  }
  
  /**
   * Get service metrics
   */
  getMetrics() {
    return {
      tokenCount: this.tokenCount,
      totalCost: this.totalCost,
      averageCostPerToken: this.tokenCount > 0 
        ? this.totalCost / this.tokenCount 
        : 0
    };
  }
  
  /**
   * Reset metrics
   */
  resetMetrics() {
    this.tokenCount = 0;
    this.totalCost = 0;
  }
}

/**
 * Helper function for N8N nodes
 */
export async function embedTextForNode(
  thisArg: IExecuteFunctions,
  itemIndex: number,
  text: string,
  options?: Partial<EmbeddingConfig>
): Promise<number[]> {
  // Get credentials from N8N
  const creds = await thisArg.getCredentials('openAIApi').catch(() => null);
  
  const config: EmbeddingConfig = {
    provider: EmbeddingProvider.OPENAI,
    model: 'text-embedding-3-small',
    apiKey: creds?.apiKey as string,
    baseUrl: creds?.baseUrl as string,
    enableCache: true,
    ...options
  };
  
  const service = EmbeddingService.getInstance(config);
  const response = await service.generateEmbedding(text, config);
  
  return response.embedding;
}

// Alias for backward compatibility
export const embedText = embedTextForNode;

/**
 * Format embedding for PostgreSQL vector type
 */
export function vectorToSqlArray(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Export singleton instance
export const embeddingService = EmbeddingService.getInstance();
