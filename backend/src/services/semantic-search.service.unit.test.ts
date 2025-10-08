import { SemanticSearchService } from './semantic-search.service';
import { Pool } from 'pg';

// Mock dependencies
jest.mock('../config/database.config', () => ({
  asembPool: {
    query: jest.fn(),
  },
}));

jest.mock('openai', () => ({
  OpenAI: jest.fn().mockImplementation(() => ({
    embeddings: {
      create: jest.fn(),
    },
  })),
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
  }));
});

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    service = new SemanticSearchService();
    mockPool = require('../config/database.config').asembPool;
    jest.clearAllMocks();
  });

  describe('generateEmbedding', () => {
    it('should generate embedding for text', async () => {
      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const mockOpenAI = require('openai').OpenAI;
      mockOpenAI.mock.instances[0].embeddings.create.mockResolvedValue({
        data: [{ embedding: mockEmbedding }],
      });

      const result = await service.generateEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockOpenAI.mock.instances[0].embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input: 'test text',
      });
    });

    it('should handle embedding generation errors', async () => {
      const mockOpenAI = require('openai').OpenAI;
      mockOpenAI.mock.instances[0].embeddings.create.mockRejectedValue(
        new Error('API Error')
      );

      await expect(service.generateEmbedding('test text')).rejects.toThrow(
        'API Error'
      );
    });
  });

  describe('searchDocuments', () => {
    it('should search similar documents', async () => {
      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());
      const mockResults = {
        rows: [
          {
            id: 1,
            title: 'Test Document',
            content: 'Test content',
            similarity: 0.95,
          },
        ],
      };

      mockPool.query.mockResolvedValue(mockResults);

      const result = await service.searchDocuments(mockEmbedding, {
        limit: 5,
        threshold: 0.8,
      });

      expect(result).toEqual(mockResults.rows);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        expect.arrayContaining([mockEmbedding, 0.8, 5])
      );
    });

    it('should return empty results when no documents found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.searchDocuments([]);

      expect(result).toEqual([]);
    });

    it('should use default parameters when options not provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await service.searchDocuments([]);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 10'),
        expect.any(Array)
      );
    });
  });

  describe('hybridSearch', () => {
    it('should perform hybrid search with text and embeddings', async () => {
      const mockResults = {
        rows: [
          {
            id: 1,
            title: 'Relevant Document',
            content: 'Matching content',
            text_score: 0.8,
            semantic_score: 0.9,
            combined_score: 0.85,
          },
        ],
      };

      mockPool.query.mockResolvedValue(mockResults);

      const result = await service.hybridSearch('query text', {
        weightText: 0.3,
        weightSemantic: 0.7,
      });

      expect(result).toEqual(mockResults.rows);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ts_rank'),
        expect.any(Array)
      );
    });

    it('should handle empty query', async () => {
      await expect(service.hybridSearch('')).rejects.toThrow(
        'Query text cannot be empty'
      );
    });
  });

  describe('getSimilarDocuments', () => {
    it('should get documents similar to a given document ID', async () => {
      const mockDocument = {
        rows: [
          {
            embedding: Array.from({ length: 1536 }, () => Math.random()),
          },
        ],
      };

      const mockSimilar = {
        rows: [
          {
            id: 2,
            title: 'Similar Document',
            similarity: 0.92,
          },
        ],
      };

      mockPool.query
        .mockResolvedValueOnce(mockDocument)
        .mockResolvedValueOnce(mockSimilar);

      const result = await service.getSimilarDocuments(1, { limit: 3 });

      expect(result).toEqual(mockSimilar.rows);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should handle document not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(service.getSimilarDocuments(999)).rejects.toThrow(
        'Document not found'
      );
    });
  });

  describe('updateDocumentEmbedding', () => {
    it('should update embedding for a document', async () => {
      const mockEmbedding = Array.from({ length: 1536 }, () => Math.random());
      mockPool.query.mockResolvedValue({ rows: [{ id: 1 }] });

      const result = await service.updateDocumentEmbedding(1, 'new content');

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining([mockEmbedding, 1])
      );
    });

    it('should handle update errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await expect(
        service.updateDocumentEmbedding(1, 'content')
      ).rejects.toThrow('Database error');
    });
  });
});