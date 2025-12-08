import { DocumentProcessorService, DocumentProcessorDependencies } from './document-processor.service';
import { Pool } from 'pg';
import OpenAI from 'openai';

describe('DocumentProcessorService', () => {
  let service: DocumentProcessorService;
  let mockPool: any;
  let mockOpenAI: any;

  beforeEach(async () => {
    // Create mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };

    // Create mock OpenAI
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
      embeddings: {
        create: jest.fn(),
      },
    };

    // Mock console methods to reduce noise
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Create service with mocked dependencies
    const dependencies: DocumentProcessorDependencies = {
      pool: mockPool,
      openai: mockOpenAI,
    };

    service = new DocumentProcessorService(dependencies);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(DocumentProcessorService);
    });

    it('should use default dependencies if none provided', () => {
      // This test verifies backward compatibility
      const serviceWithDefaults = new DocumentProcessorService();
      expect(serviceWithDefaults).toBeDefined();
    });

    it('should accept null OpenAI client', () => {
      const serviceWithoutOpenAI = new DocumentProcessorService({
        pool: mockPool,
        openai: null,
      });
      expect(serviceWithoutOpenAI).toBeDefined();
    });
  });

  describe('getOpenAIClient', () => {
    it('should return existing OpenAI client if already initialized', async () => {
      // Access private method via type assertion for testing
      const getClient = (service as any).getOpenAIClient.bind(service);

      const client = await getClient();
      expect(client).toBe(mockOpenAI);
      expect(mockPool.query).not.toHaveBeenCalled(); // Should not query DB
    });

    it('should fetch API key from database if OpenAI client not initialized', async () => {
      // Create service without OpenAI
      const serviceWithoutOpenAI = new DocumentProcessorService({
        pool: mockPool,
        openai: null,
      });

      // Mock database response
      mockPool.query.mockResolvedValueOnce({
        rows: [{ value: 'test-api-key' }],
      });

      const getClient = (serviceWithoutOpenAI as any).getOpenAIClient.bind(serviceWithoutOpenAI);
      const client = await getClient();

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT value FROM settings WHERE key = $1',
        ['openai.apiKey']
      );
      expect(client).toBeDefined();
    });

    it('should handle missing API key gracefully', async () => {
      const serviceWithoutOpenAI = new DocumentProcessorService({
        pool: mockPool,
        openai: null,
      });

      // Mock empty database response
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const getClient = (serviceWithoutOpenAI as any).getOpenAIClient.bind(serviceWithoutOpenAI);
      const client = await getClient();

      expect(client).toBeNull();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const serviceWithoutOpenAI = new DocumentProcessorService({
        pool: mockPool,
        openai: null,
      });

      // Mock database error
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const getClient = (serviceWithoutOpenAI as any).getOpenAIClient.bind(serviceWithoutOpenAI);
      const client = await getClient();

      expect(client).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection failed'));

      // Test that errors don't crash the service
      await expect(async () => {
        const getClient = (service as any).getOpenAIClient.bind(service);
        await getClient();
      }).not.toThrow();
    });

    it('should continue working if OpenAI is unavailable', () => {
      const serviceWithoutOpenAI = new DocumentProcessorService({
        pool: mockPool,
        // No openai
      });

      expect(serviceWithoutOpenAI).toBeDefined();
    });
  });

  describe('Dependency Injection', () => {
    it('should use injected pool instead of default', async () => {
      // Create service without OpenAI to force it to query the pool
      const serviceWithoutOpenAI = new DocumentProcessorService({
        pool: mockPool,
        openai: null,
      });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const getClient = (serviceWithoutOpenAI as any).getOpenAIClient.bind(serviceWithoutOpenAI);
      await getClient();

      // Should use injected pool, not default
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should use injected OpenAI client', async () => {
      const getClient = (service as any).getOpenAIClient.bind(service);
      const client = await getClient();

      // Should return injected client
      expect(client).toBe(mockOpenAI);
    });
  });
});
