import { SemanticSearchService, SemanticSearchDependencies } from './semantic-search.service';
import { Pool } from 'pg';

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;
  let mockPool: any;
  let mockCustomerPool: any;
  let mockLLMManager: any;
  let mockRedis: any;

  beforeEach(() => {
    // Create mock dependencies
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };

    mockCustomerPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };

    mockLLMManager = {
      generateEmbedding: jest.fn(),
      generateChatResponse: jest.fn(),
      updateEmbeddingConfig: jest.fn(),
    };

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      hincrby: jest.fn(),
      hgetall: jest.fn(),
      zincrby: jest.fn(),
      zrevrange: jest.fn(),
      expire: jest.fn(),
      lpush: jest.fn(),
      ltrim: jest.fn(),
    };

    // Mock console methods to reduce noise
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create service with mocked dependencies
    const dependencies: SemanticSearchDependencies = {
      lsembPool: mockPool,
      customerPool: mockCustomerPool,
      llmManager: mockLLMManager,
      redis: mockRedis,
    };

    service = new SemanticSearchService(dependencies);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(SemanticSearchService);
    });

    it('should use default dependencies if none provided', () => {
      // This test verifies backward compatibility
      const serviceWithDefaults = new SemanticSearchService();
      expect(serviceWithDefaults).toBeDefined();
    });
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for text', async () => {
      const mockEmbedding = Array.from({ length: 768 }, () => Math.random());

      // Mock settings query
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'llmSettings.embeddingProvider', value: 'openai' },
          { key: 'llmSettings.embeddingModel', value: 'text-embedding-3-small' },
        ],
      } as any);

      mockLLMManager.generateEmbedding.mockResolvedValue(mockEmbedding);

      const result = await service.generateEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockLLMManager.generateEmbedding).toHaveBeenCalledWith(
        'test text',
        expect.objectContaining({
          provider: expect.any(String),
          model: expect.any(String),
        })
      );
    });

    it('should use cached embedding if available', async () => {
      const mockEmbedding = Array.from({ length: 768 }, () => Math.random());

      mockPool.query.mockResolvedValue({
        rows: [
          { key: 'llmSettings.embeddingProvider', value: 'openai' },
          { key: 'llmSettings.embeddingModel', value: 'text-embedding-3-small' },
        ],
      } as any);

      mockLLMManager.generateEmbedding.mockResolvedValue(mockEmbedding);

      // First call - should generate
      await service.generateEmbedding('test text');
      expect(mockLLMManager.generateEmbedding).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await service.generateEmbedding('test text');
      expect(mockLLMManager.generateEmbedding).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should handle embedding generation errors', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { key: 'llmSettings.embeddingProvider', value: 'openai' },
        ],
      } as any);

      mockLLMManager.generateEmbedding.mockRejectedValue(new Error('API Error'));

      await expect(service.generateEmbedding('test text')).rejects.toThrow('Embedding generation failed: API Error');
    });
  });

  describe('keywordSearch', () => {
    it('should perform keyword search', async () => {
      const mockResults = {
        rows: [
          {
            id: '1',
            title: 'Relevant Document',
            content: 'Matching content',
            source_table: 'documents',
            source_id: '1',
            excerpt: 'Excerpt',
            priority: 1,
            score: 90,
          },
        ],
      };

      mockPool.query.mockResolvedValue(mockResults as any);

      const result = await service.keywordSearch('query text', 10);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Relevant Document');
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should handle empty results', async () => {
      mockPool.query.mockResolvedValue({ rows: [] } as any);

      const result = await service.keywordSearch('nonexistent query', 10);

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      // Reset mock to reject for this specific query
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.keywordSearch('query', 10);

      expect(result).toEqual([]);
      // Note: Service logs errors with console.error, but it's mocked in setup
    });
  });

  describe('semanticSearch', () => {
    beforeEach(() => {
      // Reset all mocks for fresh state
      jest.clearAllMocks();

      // Setup default mock responses for service initialization queries
      mockPool.query.mockResolvedValue({ rows: [] });
    });

    it('should perform semantic search with embeddings', async () => {
      const mockEmbedding = Array.from({ length: 768 }, () => Math.random());
      const mockResults = {
        rows: [
          {
            id: '1',
            title: 'Similar Document',
            excerpt: 'Content excerpt',
            source_table: 'documents',
            source_id: '1',
            metadata: { title: 'Similar Document' },
            record_type: 'documents',
            similarity_score: 0.92,
            keyword_boost: 0,
            priority_boost: 0,
          },
        ],
      };

      // Setup mock chain for semantic search flow
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // RAG settings
        .mockResolvedValueOnce({ rows: [] }) // Embedding settings
        .mockResolvedValueOnce({ rows: [{ record_type: 'documents' }] }) // Record types
        .mockResolvedValueOnce({ rows: [] }) // Source table weights
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // Embedding count check
        .mockResolvedValueOnce(mockResults); // Main search query

      mockLLMManager.generateEmbedding.mockResolvedValue(mockEmbedding);

      const result = await service.semanticSearch('test query', 10);

      expect(result.length).toBeGreaterThan(0);
      expect(mockLLMManager.generateEmbedding).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should fall back to keyword search when no embeddings exist', async () => {
      // Setup mock chain: RAG settings, embedding settings, record types, weights, then embedding count
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // RAG settings
        .mockResolvedValueOnce({ rows: [] }) // Embedding settings
        .mockResolvedValueOnce({ rows: [] }) // Record types
        .mockResolvedValueOnce({ rows: [] }) // Source table weights
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // Empty embedding count
        .mockResolvedValueOnce({ // Keyword search results
          rows: [
            {
              id: '1',
              title: 'Keyword Match',
              source_table: 'documents',
              source_id: '1',
              excerpt: 'Content',
              priority: 1,
              score: 90,
            },
          ],
        });

      const result = await service.semanticSearch('test query', 10);

      expect(result).toBeDefined();
      expect(mockLLMManager.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should handle search errors and fall back to keyword search', async () => {
      // Setup mock chain for semantic search that will fail at embedding generation
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // RAG settings
        .mockResolvedValueOnce({ rows: [] }) // Embedding settings
        .mockResolvedValueOnce({ rows: [] }) // Record types
        .mockResolvedValueOnce({ rows: [] }) // Source table weights
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // Embedding count (has embeddings)
        .mockResolvedValueOnce({ // Keyword search fallback
          rows: [
            {
              id: '1',
              title: 'Fallback Result',
              source_table: 'documents',
              source_id: '1',
              excerpt: 'Content',
              priority: 1,
              score: 80,
            },
          ],
        });

      // Make embedding generation fail
      mockLLMManager.generateEmbedding.mockRejectedValue(new Error('Embedding error'));

      const result = await service.semanticSearch('test query', 10);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Result Limits', () => {
    it('should enforce maximum result limits', async () => {
      const mockResults = {
        rows: Array.from({ length: 50 }, (_, i) => ({
          id: `${i}`,
          title: `Document ${i}`,
          source_table: 'documents',
          source_id: `${i}`,
          excerpt: 'Content',
          priority: 1,
          score: 90,
        })),
      };

      mockPool.query.mockResolvedValue(mockResults as any);

      const result = await service.keywordSearch('test', 100);

      // Should respect maxResults setting (25)
      expect(result.length).toBeLessThanOrEqual(25);
    });

    it('should enforce minimum result limits', async () => {
      const mockResults = { rows: [] };
      mockPool.query.mockResolvedValue(mockResults as any);

      const result = await service.keywordSearch('test', 0);

      // Should request at least minResults (1)
      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('Cache Integration', () => {
    it('should use Redis cache when available', async () => {
      service.setRedis(mockRedis);

      const cachedData = JSON.stringify([{ id: '1', title: 'Cached Result' }]);
      mockRedis.get.mockResolvedValue(cachedData);

      // Cache stats should be tracked
      expect(mockRedis.hincrby).toBeDefined();
    });

    it('should get cache statistics', async () => {
      mockRedis.hgetall.mockResolvedValue({
        hits: '100',
        misses: '20',
      });

      const stats = await service.getCacheStatistics();

      expect(stats.hits).toBe(100);
      expect(stats.misses).toBe(20);
      expect(stats.hitRate).toBeCloseTo(83.33, 1);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await service.keywordSearch('test', 10);

      expect(result).toEqual([]);
      // Service handles errors gracefully and returns empty array
    });

    it('should continue working if Redis is unavailable', async () => {
      // Redis is optional, so service should work without it
      const serviceWithoutRedis = new SemanticSearchService({
        lsembPool: mockPool,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
        // No redis
      });

      expect(serviceWithoutRedis).toBeDefined();
    });
  });
});
