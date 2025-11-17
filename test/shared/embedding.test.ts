import { EmbeddingService, EmbeddingProvider, EmbeddingConfig, vectorToSqlArray, cosineSimilarity } from '../../shared/embedding';

// Mock dependencies - define mock instance inside the factory
jest.mock('../../src/shared/cache-manager', () => {
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    clear: jest.fn(),
  };
  return {
    CacheManager: {
      getInstance: jest.fn(() => mockCache),
    },
  };
});

jest.mock('../../src/shared/connection-pool', () => {
  return {
    redisPool: {
      getClient: jest.fn(() => ({})),
    },
  };
});

// Mock fetch for API calls
global.fetch = jest.fn();

describe('Embedding Service', () => {
  let embeddingService: EmbeddingService;
  let mockCache: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the singleton instance
    (EmbeddingService as any).instance = undefined;
    embeddingService = EmbeddingService.getInstance();
    
    // Get the mock cache instance from the mocked module
    const { CacheManager } = require('../../src/shared/cache-manager');
    mockCache = CacheManager.getInstance();
  });

  describe('Singleton Pattern', () => {
    test('should return the same instance', () => {
      const instance1 = EmbeddingService.getInstance();
      const instance2 = EmbeddingService.getInstance();
      expect(instance1).toBe(instance2);
    });

    test('should create with default config', () => {
      expect(embeddingService).toBeDefined();
    });
  });

  describe('Local Embedding Generation', () => {
    test('should generate local embeddings', async () => {
      const text = 'test text for embedding';
      const config: EmbeddingConfig = {
        provider: EmbeddingProvider.LOCAL,
        model: 'local-mock',
        enableCache: false,
      };

      const result = await embeddingService.generateEmbedding(text, config);

      expect(result).toEqual({
        embedding: expect.any(Array),
        model: 'local-mock',
        provider: EmbeddingProvider.LOCAL,
        dimensions: 1536,
        tokensUsed: expect.any(Number),
        cost: 0,
        cached: false,
      });

      expect(result.embedding).toHaveLength(1536);
      expect(result.embedding.every(val => val >= -1 && val <= 1)).toBe(true);
    });
  });

  describe('Cache Operations', () => {
    test('should use cache when enabled', async () => {
      const text = 'cached text';
      const cachedResponse = {
        embedding: new Array(1536).fill(0).map((_, i) => (i % 256 - 128) / 128),
        model: 'local-mock',
        provider: EmbeddingProvider.LOCAL,
        dimensions: 1536,
        tokensUsed: Math.ceil(text.length / 4), // Gerçek implementasyonla uyumlu
        cost: 0,
        cached: false,
      };

      mockCache.get.mockResolvedValue(cachedResponse);

      const config: EmbeddingConfig = {
        provider: EmbeddingProvider.LOCAL,
        model: 'local-mock',
        enableCache: true,
      };

      const result = await embeddingService.generateEmbedding(text, config);

      expect(result).toEqual({
        ...cachedResponse,
        cached: true, // Cache'den geldiği için cached: true olmalı
      });
      expect(mockCache.get).toHaveBeenCalledWith(expect.stringContaining('embedding:'));
    });

    test('should cache new embeddings', async () => {
      const text = 'new text';
      const config: EmbeddingConfig = {
        provider: EmbeddingProvider.LOCAL,
        model: 'local-mock',
        enableCache: true,
        cacheTTL: 3600,
      };

      mockCache.get.mockResolvedValue(null);

      const result = await embeddingService.generateEmbedding(text, config);

      expect(mockCache.get).toHaveBeenCalledWith(expect.stringContaining('embedding:'));
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('embedding:'),
        expect.objectContaining({
          embedding: expect.any(Array),
          model: 'local-mock',
          provider: EmbeddingProvider.LOCAL,
          dimensions: 1536,
          tokensUsed: expect.any(Number),
          cost: 0,
          cached: false,
        }),
        3600
      );
    });
  });

  describe('Batch Embeddings', () => {
    test('should process batch embeddings', async () => {
      const texts = ['text1', 'text2', 'text3'];
      const config: EmbeddingConfig = {
        provider: EmbeddingProvider.LOCAL,
        model: 'local-mock',
        enableCache: false,
        batchSize: 2,
      };

      const result = await embeddingService.batchEmbeddings(texts, config);

      expect(result).toEqual({
        embeddings: expect.arrayContaining([
          expect.objectContaining({
            embedding: expect.any(Array),
            model: 'local-mock',
            provider: EmbeddingProvider.LOCAL,
            cached: false,
          }),
        ]),
        totalTokens: expect.any(Number),
        totalCost: 0,
        errors: undefined,
      });

      expect(result.embeddings).toHaveLength(3);
    });

    test('should handle errors in batch processing', async () => {
      const texts = ['text1', 'text2'];
      const config: EmbeddingConfig = {
        provider: EmbeddingProvider.OPENAI,
        model: 'text-embedding-3-small',
        enableCache: false,
      };

      (global.fetch as jest.Mock).mockRejectedValue(new Error('API error'));

      const result = await embeddingService.batchEmbeddings(texts, config);

      expect(result.errors).toBeDefined();
      expect(result.errors).toHaveLength(2);
      expect(result.embeddings).toHaveLength(0);
    });
  });

  describe('Utility Functions', () => {
    test('vectorToSqlArray should convert array to SQL format', () => {
      const vector = [1.0, 2.5, -3.7];
      const result = vectorToSqlArray(vector);
      expect(result).toBe('[1,2.5,-3.7]');
    });

    test('cosineSimilarity should calculate similarity between vectors', () => {
      const vec1 = [1, 0, 0];
      const vec2 = [1, 0, 0];
      const similarity = cosineSimilarity(vec1, vec2);
      expect(similarity).toBeCloseTo(1.0);

      const vec3 = [1, 0, 0];
      const vec4 = [0, 1, 0];
      const similarity2 = cosineSimilarity(vec3, vec4);
      expect(similarity2).toBeCloseTo(0.0);
    });

    test('cosineSimilarity should throw error for different length vectors', () => {
      const vec1 = [1, 2];
      const vec2 = [1, 2, 3];
      expect(() => cosineSimilarity(vec1, vec2)).toThrow('Vectors must have the same length');
    });
  });

  describe('Metrics', () => {
    test('should track metrics', async () => {
      embeddingService.resetMetrics();
      
      const text = 'test text';
      const config: EmbeddingConfig = {
        provider: EmbeddingProvider.LOCAL,
        model: 'local-mock',
        enableCache: false,
      };

      await embeddingService.generateEmbedding(text, config);

      const metrics = embeddingService.getMetrics();
      expect(metrics.tokenCount).toBeGreaterThan(0);
      expect(metrics.totalCost).toBe(0);
    });

    test('should reset metrics', () => {
      embeddingService.resetMetrics();
      const metrics = embeddingService.getMetrics();
      expect(metrics.tokenCount).toBe(0);
      expect(metrics.totalCost).toBe(0);
    });
  });
});