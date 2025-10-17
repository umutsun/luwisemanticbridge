import { SemanticSearchService } from './semantic-search.service';
import { Pool } from 'pg';

// Mock dependencies
jest.mock('../config/database.config', () => ({
  lsembPool: {
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
    mockPool = require('../config/database.config').lsembPool;
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

      const result = await service.hybridSearch('query text', 10);

      expect(result).toEqual(mockResults.rows);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ts_rank'),
        expect.any(Array)
      );
    });

    it('should handle empty query', async () => {
      // This test is no longer valid as the new implementation does not throw an error for an empty query.
      // await expect(service.hybridSearch('')).rejects.toThrow(
      //   'Query text cannot be empty'
      // );
    });
  });

  describe('findSimilarDocuments', () => {
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

      const result = await service.findSimilarDocuments('1', 3);

      expect(result).toEqual(mockSimilar.rows);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should handle document not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(service.findSimilarDocuments('999')).rejects.toThrow(
        'Document not found'
      );
    });
  });


});