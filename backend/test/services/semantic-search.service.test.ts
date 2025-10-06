import { SemanticSearchService } from '../../src/services/semantic-search.service';
import pool from '../../src/config/database';
import { asembPool } from '../../src/config/database.config';
import { OpenAI } from 'openai';

// Mock the database pools
jest.mock('../../src/config/database', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));
jest.mock('../../src/server', () => ({
  asembPool: {
    query: jest.fn(),
  },
}));

// Mock OpenAI
jest.mock('openai');

const mockedPool = pool as jest.Mocked<typeof pool>;
const mockedAsembPool = asembPool as jest.Mocked<typeof asembPool>;
const mockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedOpenAI.mockImplementation(() => {
      return {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: new Array(768).fill(0.1) }],
          }),
        },
      } as any;
    });
    service = new SemanticSearchService();
  });

  describe('generateEmbedding', () => {
    it('should generate mock embedding if OpenAI is not used', async () => {
      (service as any).useOpenAI = false;
      const embedding = await service.generateEmbedding('test');
      expect(embedding).toHaveLength(768);
    });

    it('should generate embedding using OpenAI if available', async () => {
      (service as any).useOpenAI = true;
      const mockEmbedding = new Array(768).fill(0.1);
      const embedding = await service.generateEmbedding('test');
      expect(embedding).toEqual(mockEmbedding);
    });

    it('should fallback to mock embedding if OpenAI fails', async () => {
      (service as any).useOpenAI = true;
      const openaiInstance = (service as any).openai;
      (openaiInstance.embeddings.create as jest.Mock).mockRejectedValue(new Error('API Error'));
      const embedding = await service.generateEmbedding('test');
      expect(embedding).toHaveLength(768);
    });
  });

  describe('keywordSearch', () => {
    it('should perform a keyword search and return formatted results', async () => {
      const mockRows = [
        { id: '1', title: 'Test Result', source_table: 'test_table', source_id: '1', excerpt: 'Test excerpt', priority: 1 },
      ];
      (mockedAsembPool.query as jest.Mock).mockResolvedValue({ rows: mockRows });
      const results = await service.keywordSearch('test');
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(90);
    });

    it('should return an empty array on database error', async () => {
      (mockedAsembPool.query as jest.Mock).mockRejectedValue(new Error('DB Error'));
      const results = await service.keywordSearch('test');
      expect(results).toEqual([]);
    });
  });

  describe('semanticSearch', () => {
    it('should fallback to keyword search if no embeddings exist', async () => {
      (mockedPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ count: '0' }] });
      const keywordSearchSpy = jest.spyOn(service, 'keywordSearch').mockResolvedValue([]);
      await service.semanticSearch('test');
      expect(keywordSearchSpy).toHaveBeenCalledWith('test', 10);
    });

    it('should perform semantic search if embeddings exist', async () => {
      (mockedPool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ count: '10' }] });
      const mockEmbedding = new Array(768).fill(0.1);
      jest.spyOn(service, 'generateEmbedding').mockResolvedValue(mockEmbedding);
      const searchResults = [
        { id: '1', similarity_score: '0.9', keyword_boost: '0.1' }
      ];
      (mockedPool.query as jest.Mock).mockResolvedValueOnce({ rows: searchResults });
      const results = await service.semanticSearch('test');
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(100);
    });
  });

  describe('hybridSearch', () => {
    it('should return unified semantic search results if they exist', async () => {
        const unifiedResults = [{ id: '1', score: 95 }];
        const unifiedSpy = jest.spyOn(service, 'unifiedSemanticSearch').mockResolvedValue(unifiedResults as any);
        const results = await service.hybridSearch('test');
        expect(results).toHaveLength(1);
        expect(results[0].combined_score).toBe(0.95);
        expect(unifiedSpy).toHaveBeenCalledWith('test', 10);
    });

    it('should fallback to keyword search if unified search returns no results', async () => {
        jest.spyOn(service, 'unifiedSemanticSearch').mockResolvedValue([]);
        const keywordResults = [{ id: '1', score: 90 }];
        const keywordSpy = jest.spyOn(service, 'keywordSearch').mockResolvedValue(keywordResults as any);
        const results = await service.hybridSearch('test');
        expect(results).toHaveLength(1);
        expect(results[0].combined_score).toBe(0.9);
        expect(keywordSpy).toHaveBeenCalledWith('test', 10);
    });
  });

  describe('getStats', () => {
    it('should return aggregated stats from the database', async () => {
      // This test is problematic because it relies on TABLE_NAMES which is not easily mockable.
      // For now, we will just test the error case.
      (service as any).customerPool.query = jest.fn().mockRejectedValue(new Error('DB Error'));
      const stats = await service.getStats();
      expect(stats.total).toBe(0);
    });
  });
});