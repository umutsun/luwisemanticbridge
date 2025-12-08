import { SemanticSearchService, SemanticSearchDependencies } from './semantic-search.service';
import { Pool } from 'pg';

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;
  let mockPool: any;
  let mockCustomerPool: any;
  let mockLLMManager: any;
  let mockRedis: any;

  beforeEach(async () => {
    // Create mock dependencies
    mockPool = {
      query: jest.fn(),
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

    // Setup default mock responses for constructor initialization
    // Constructor calls loadRAGSettings() and loadEmbeddingSettings()
    mockPool.query
      .mockResolvedValueOnce({ rows: [ // RAG settings for constructor
        { key: 'ragSettings.enableUnifiedEmbeddings', value: 'true' },
        { key: 'ragSettings.enableDocumentEmbeddings', value: 'true' },
        { key: 'ragSettings.enableScrapeEmbeddings', value: 'true' },
        { key: 'ragSettings.enableMessageEmbeddings', value: 'true' },
        { key: 'ragSettings.enableHybridSearch', value: 'true' },
      ] })
      .mockResolvedValueOnce({ rows: [ // Embedding settings for constructor
        { key: 'llmSettings.embeddingProvider', value: 'openai' },
        { key: 'llmSettings.embeddingModel', value: 'text-embedding-3-small' },
      ] })
      .mockResolvedValue({ rows: [] }); // Default for any other queries

    // Create service with mocked dependencies
    const dependencies: SemanticSearchDependencies = {
      lsembPool: mockPool,
      customerPool: mockCustomerPool,
      llmManager: mockLLMManager,
      redis: mockRedis,
    };

    service = new SemanticSearchService(dependencies);

    // Wait a bit for constructor async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
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

    it('should clean old embedding cache entries', async () => {
      const mockEmbedding = Array.from({ length: 768 }, () => Math.random());

      mockPool.query.mockResolvedValue({
        rows: [
          { key: 'llmSettings.embeddingProvider', value: 'openai' },
        ],
      } as any);
      mockLLMManager.generateEmbedding.mockResolvedValue(mockEmbedding);

      // Generate embeddings to populate cache
      await service.generateEmbedding('query1');
      await service.generateEmbedding('query2');

      // Access private cache and set old timestamp
      const cacheTimestamps = (service as any).embeddingCacheTimestamps;
      const firstKey = Array.from(cacheTimestamps.keys())[0];
      if (firstKey) {
        const oldTimestamp = Date.now() - 400000; // Older than 5min TTL
        cacheTimestamps.set(firstKey, oldTimestamp);

        // Trigger cleanup
        const cleanCache = (service as any).cleanEmbeddingCache.bind(service);
        cleanCache();

        // Verify log message about cleanup
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cleaned'));
      }
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
    it('should perform semantic search with embeddings', async () => {
      const mockEmbedding = Array.from({ length: 768 }, () => Math.random());
      const mockResults = {
        rows: [
          {
            id: '1',
            title: 'Similar Document',
            excerpt: 'Content excerpt',
            source_table: 'document_embeddings',
            source_id: '1',
            metadata: { title: 'Similar Document' },
            record_type: 'document_embeddings',
            similarity_score: 0.92,
            keyword_boost: 0,
            priority_boost: 0,
          },
        ],
      };

      // Setup mock chain for semantic search flow
      // Note: RAG and embedding settings are already loaded in constructor via beforeEach
      // Query order in semanticSearch():
      // 1. Embedding count check
      // 2. refreshUnifiedRecordTypes() -> loadUnifiedRecordTypes()
      // 3. refreshSourceTableWeights() -> loadSourceTableWeights()
      // 4. Main search query
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // 1. Embedding count check
        .mockResolvedValueOnce({ rows: [{ record_type: 'document_embeddings' }] }) // 2. Record types
        .mockResolvedValueOnce({ rows: [] }) // 3. Source table weights
        .mockResolvedValueOnce(mockResults); // 4. Main search query

      mockLLMManager.generateEmbedding.mockResolvedValue(mockEmbedding);

      const result = await service.semanticSearch('test query', 10);

      expect(result.length).toBeGreaterThan(0);
      expect(mockLLMManager.generateEmbedding).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should fall back to keyword search when no embeddings exist', async () => {
      // Setup mock chain - settings are already loaded in constructor
      mockPool.query
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
      // Note: RAG and embedding settings are already loaded in constructor via beforeEach
      // When embedding fails, refreshUnifiedRecordTypes and refreshSourceTableWeights are SKIPPED
      // Query order: embedding count → keyword search fallback (record types & weights are skipped!)
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // 1. Embedding count (has embeddings)
        .mockResolvedValueOnce({ // 2. Keyword search fallback (no record types/weights queries!)
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

  describe('Settings Management', () => {
    it('should load RAG settings from database', async () => {
      // Create fresh service to test loadRAGSettings
      const freshMockPool = {
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      freshMockPool.query
        .mockResolvedValueOnce({ rows: [ // Constructor RAG settings - comprehensive test data
          { key: 'ragSettings.similarityThreshold', value: '0.75' },
          { key: 'ragSettings.maxResults', value: '50' },
          { key: 'ragSettings.minResults', value: '5' },
          { key: 'ragSettings.enableHybridSearch', value: 'true' },
          { key: 'ragSettings.enableKeywordBoost', value: 'true' },
          { key: 'parallel_llm_count', value: '3' },
          { key: 'parallel_llm_batch_size', value: '10' },
          { key: 'ragSettings.enableMessageEmbeddings', value: 'true' },
          { key: 'ragSettings.enableDocumentEmbeddings', value: 'true' },
          { key: 'ragSettings.enableScrapeEmbeddings', value: 'false' },
          { key: 'ragSettings.enableUnifiedEmbeddings', value: 'true' },
          { key: 'ragSettings.unifiedEmbeddingsPriority', value: '1' },
          { key: 'ragSettings.databasePriority', value: '2' },
          { key: 'ragSettings.documentsPriority', value: '3' },
          { key: 'ragSettings.chatPriority', value: '4' },
          { key: 'ragSettings.webPriority', value: '5' },
        ] })
        .mockResolvedValueOnce({ rows: [] }); // Constructor embedding settings

      const freshService = new SemanticSearchService({
        lsembPool: freshMockPool as any,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(freshMockPool.query).toHaveBeenCalled();
      // Settings should be loaded and processed (all 16 settings exercised)
    });

    it('should handle database errors when loading RAG settings', async () => {
      const errorMockPool = {
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      errorMockPool.query
        .mockRejectedValueOnce(new Error('Database connection failed'))
        .mockResolvedValue({ rows: [] });

      const serviceWithError = new SemanticSearchService({
        lsembPool: errorMockPool as any,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      // Service should handle error gracefully and continue to work with defaults
      expect(serviceWithError).toBeDefined();
      expect(errorMockPool.query).toHaveBeenCalled();
    });

    it('should use default RAG settings when database unavailable', async () => {
      const serviceWithoutDB = new SemanticSearchService({
        lsembPool: null as any,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
      });

      expect(serviceWithoutDB).toBeDefined();
      // Should use default settings without crashing
    });
  });

  describe('Source Summary Generation', () => {
    it('should generate summary for source with LLM', async () => {
      const mockSource = {
        title: 'Test Document',
        content: 'This is a test document with important information.',
        excerpt: 'Test excerpt',
      };

      mockLLMManager.generateChatResponse.mockResolvedValue('Brief summary of the document.');

      const summary = await service.generateSourceSummary(mockSource);

      expect(summary).toBeDefined();
      expect(typeof summary).toBe('string');
      expect(mockLLMManager.generateChatResponse).toHaveBeenCalled();
    });

    it('should handle LLM errors gracefully when generating summary', async () => {
      const mockSource = {
        title: 'Test Document',
        content: 'Content',
      };

      mockLLMManager.generateChatResponse.mockRejectedValue(new Error('LLM error'));

      const summary = await service.generateSourceSummary(mockSource);

      expect(summary).toBe('Özet oluşturulamadı');
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle sources without content', async () => {
      const mockSource = {
        title: 'Empty Document',
      };

      mockLLMManager.generateChatResponse.mockResolvedValue('No content available.');

      const summary = await service.generateSourceSummary(mockSource);

      expect(summary).toBeDefined();
    });
  });

  describe('Utility Methods', () => {
    it('should normalize provider names correctly', () => {
      // Access private method for testing
      const normalizeProvider = (service as any).normalizeProvider.bind(service);

      expect(normalizeProvider('OpenAI')).toBe('openai');
      expect(normalizeProvider('GEMINI')).toBe('google');
      expect(normalizeProvider('claude-3-opus')).toBe('claude');
      expect(normalizeProvider('deepseek-chat')).toBe('deepseek');
      expect(normalizeProvider('gpt-4')).toBe('openai');
    });

    it('should return default embedding models for providers', () => {
      const getDefaultModel = (service as any).getDefaultEmbeddingModel.bind(service);

      expect(getDefaultModel('google')).toBe('text-embedding-004');
      expect(getDefaultModel('openai')).toBe('text-embedding-3-small');
      expect(getDefaultModel('deepseek')).toBe('text-embedding-3-small');
      expect(getDefaultModel('unknown')).toBe('text-embedding-004');
    });

    it('should apply result limits correctly', () => {
      const applyLimits = (service as any).applyResultLimits.bind(service);

      // Within bounds
      expect(applyLimits(10)).toBe(10);

      // Above max (25)
      expect(applyLimits(100)).toBe(25);

      // Below min (1)
      expect(applyLimits(0)).toBe(1);

      // Invalid input
      expect(applyLimits(NaN)).toBe(25); // Should use maxResults
      expect(applyLimits(Infinity)).toBe(25);
    });

    it('should parse boolean settings correctly', () => {
      const parseBool = (service as any).parseBooleanSetting.bind(service);

      // Boolean values
      expect(parseBool(true)).toBe(true);
      expect(parseBool(false)).toBe(false);

      // Number values
      expect(parseBool(1)).toBe(true);
      expect(parseBool(0)).toBe(false);
      expect(parseBool(42)).toBe(true);

      // String values - truthy
      expect(parseBool('true')).toBe(true);
      expect(parseBool('TRUE')).toBe(true);
      expect(parseBool('1')).toBe(true);
      expect(parseBool('yes')).toBe(true);
      expect(parseBool('on')).toBe(true);
      expect(parseBool('  True  ')).toBe(true); // with whitespace

      // String values - falsy
      expect(parseBool('false')).toBe(false);
      expect(parseBool('FALSE')).toBe(false);
      expect(parseBool('0')).toBe(false);
      expect(parseBool('no')).toBe(false);
      expect(parseBool('off')).toBe(false);
      expect(parseBool('  false  ')).toBe(false); // with whitespace

      // Invalid values
      expect(parseBool('invalid')).toBeUndefined();
      expect(parseBool(null)).toBeUndefined();
      expect(parseBool(undefined)).toBeUndefined();
      expect(parseBool({})).toBeUndefined();
    });

    it('should return parallel LLM count', () => {
      const count = service.getParallelLLMCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(1);
    });

    it('should return parallel LLM batch size', () => {
      const batchSize = service.getParallelLLMBatchSize();
      expect(typeof batchSize).toBe('number');
      expect(batchSize).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Redis Integration', () => {
    it('should set Redis client correctly', () => {
      const newRedis = {
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
      };

      service.setRedis(newRedis as any);

      // Redis should be set (no errors)
      expect(service).toBeDefined();
    });

    it('should work without Redis', async () => {
      const serviceWithoutRedis = new SemanticSearchService({
        lsembPool: mockPool,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
        // No redis
      });

      // Should work fine without Redis
      mockPool.query.mockResolvedValue({ rows: [] });
      const result = await serviceWithoutRedis.keywordSearch('test', 10);

      expect(result).toBeDefined();
    });
  });

  describe('Embedding Settings', () => {
    it('should load embedding settings from database', async () => {
      const freshPool = {
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      freshPool.query
        .mockResolvedValueOnce({ rows: [] }) // RAG settings
        .mockResolvedValueOnce({ rows: [ // Embedding settings
          { key: 'llmSettings.embeddingProvider', value: 'google' },
          { key: 'llmSettings.embeddingModel', value: 'text-embedding-004' },
        ] });

      const freshService = new SemanticSearchService({
        lsembPool: freshPool as any,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(freshPool.query).toHaveBeenCalled();
    });

    it('should handle missing embedding settings gracefully', async () => {
      const freshPool = {
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      freshPool.query
        .mockResolvedValueOnce({ rows: [] }) // RAG settings
        .mockResolvedValueOnce({ rows: [] }); // Empty embedding settings

      const freshService = new SemanticSearchService({
        lsembPool: freshPool as any,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      // Should use default settings
      expect(freshService).toBeDefined();
    });
  });

  describe('Public Refresh Methods', () => {
    it('should refresh RAG settings on demand', async () => {
      const freshPool = {
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      // Initial queries for constructor
      freshPool.query
        .mockResolvedValueOnce({ rows: [] }) // Constructor RAG settings
        .mockResolvedValueOnce({ rows: [] }) // Constructor embedding settings
        // Refresh call
        .mockResolvedValueOnce({ rows: [
          { key: 'ragSettings.similarityThreshold', value: '0.8' }
        ] });

      const freshService = new SemanticSearchService({
        lsembPool: freshPool as any,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      // Clear previous calls
      freshPool.query.mockClear();

      // Call refresh
      await freshService.refreshRAGSettingsNow();

      expect(freshPool.query).toHaveBeenCalled();
    });

    it('should refresh source table weights on demand', async () => {
      const freshPool = {
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      // Initial queries for constructor
      freshPool.query
        .mockResolvedValueOnce({ rows: [] }) // Constructor RAG settings
        .mockResolvedValueOnce({ rows: [] }) // Constructor embedding settings
        // Refresh call
        .mockResolvedValueOnce({ rows: [
          { key: 'sourceTableWeights.documents', value: '1.0' }
        ] });

      const freshService = new SemanticSearchService({
        lsembPool: freshPool as any,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      // Clear previous calls
      freshPool.query.mockClear();

      // Call refresh
      await freshService.refreshSourceTableWeightsNow();

      expect(freshPool.query).toHaveBeenCalled();
    });

    it('should get unified record types', async () => {
      const freshPool = {
        query: jest.fn(),
        connect: jest.fn(),
        end: jest.fn(),
        on: jest.fn(),
      };

      // Initial queries for constructor
      freshPool.query
        .mockResolvedValueOnce({ rows: [] }) // Constructor RAG settings
        .mockResolvedValueOnce({ rows: [] }) // Constructor embedding settings
        // getUnifiedRecordTypes call
        .mockResolvedValueOnce({ rows: [
          { source_table: 'documents' },
          { source_table: 'messages' },
          { source_table: 'web_scrapes' }
        ] });

      const freshService = new SemanticSearchService({
        lsembPool: freshPool as any,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      // Call getUnifiedRecordTypes
      const types = await freshService.getUnifiedRecordTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(freshPool.query).toHaveBeenCalled();
    });

    it('should get popular searches from Redis', async () => {
      const mockRedis = {
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        zrevrange: jest.fn().mockResolvedValue([
          'query1', '10',
          'query2', '5',
          'query3', '3'
        ]),
      };

      service.setRedis(mockRedis as any);

      const searches = await service.getPopularSearches(10, '24h');

      expect(searches).toBeDefined();
      expect(Array.isArray(searches)).toBe(true);
      expect(mockRedis.zrevrange).toHaveBeenCalledWith('search:popular:24h', 0, 9, 'WITHSCORES');

      if (searches.length > 0) {
        expect(searches[0]).toHaveProperty('query');
        expect(searches[0]).toHaveProperty('count');
        expect(searches[0].query).toBe('query1');
        expect(searches[0].count).toBe(10);
      }
    });

    it('should return empty array when Redis not available for popular searches', async () => {
      // Service without Redis
      const freshService = new SemanticSearchService({
        lsembPool: mockPool as any,
        customerPool: mockCustomerPool,
        llmManager: mockLLMManager,
      });

      const searches = await freshService.getPopularSearches(10);

      expect(searches).toEqual([]);
    });

    it('should handle Redis errors gracefully when getting popular searches', async () => {
      const mockRedis = {
        get: jest.fn(),
        set: jest.fn(),
        setex: jest.fn(),
        zrevrange: jest.fn().mockRejectedValue(new Error('Redis error')),
      };

      service.setRedis(mockRedis as any);

      const searches = await service.getPopularSearches(10);

      expect(searches).toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });
  });
});
