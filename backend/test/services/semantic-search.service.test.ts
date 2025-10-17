import { SemanticSearchService } from '../../src/services/semantic-search.service';
import * as dbConfig from '../../src/config/database.config';
import { OpenAI } from 'openai';

// Mock OpenAI at the top level
jest.mock('openai');
const mockedOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>;

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;
  let querySpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear any previous spies and mocks
    jest.restoreAllMocks();

    // Mock OpenAI implementation for each test
    mockedOpenAI.mockImplementation(() => {
      return {
        embeddings: {
          create: jest.fn().mockResolvedValue({
            data: [{ embedding: new Array(1536).fill(0.1) }],
          }),
        },
      } as any;
    });
    
    service = new SemanticSearchService();
  });

  afterEach(() => {
    // Ensure spies are restored after each test
    if (querySpy) {
      querySpy.mockRestore();
    }
  });

  describe('keywordSearch', () => {
    it('should perform a keyword search and return formatted results', async () => {
      const mockRows = [
        { id: '1', title: 'Test Result', source_table: 'test_table', source_id: '1', excerpt: 'Test excerpt', priority: 1 },
      ];
      // Spy on the query method for this specific test
      querySpy = jest.spyOn(dbConfig.lsembPool, 'query').mockResolvedValue({ rows: mockRows } as any);

      const results = await service.keywordSearch('test');
      expect(results).toHaveLength(1);
      // The score calculation is complex, so we just check if it exists
      expect(results[0]).toHaveProperty('score');
      expect(querySpy).toHaveBeenCalled();
    });

    it('should return an empty array on database error', async () => {
      // Spy on the query method and make it reject
      querySpy = jest.spyOn(dbConfig.lsembPool, 'query').mockRejectedValue(new Error('DB Error'));
      
      const results = await service.keywordSearch('test');
      expect(results).toEqual([]);
      expect(querySpy).toHaveBeenCalled();
    });
  });

  describe('semanticSearch', () => {
    it('should fallback to keyword search if no embeddings exist', async () => {
      // Spy on the query method for the embedding check
      querySpy = jest.spyOn(dbConfig.lsembPool, 'query').mockResolvedValue({ rows: [{ count: '0' }] } as any);
      const keywordSearchSpy = jest.spyOn(service, 'keywordSearch').mockResolvedValue([]);
      
      await service.semanticSearch('test');
      
      expect(querySpy).toHaveBeenCalled();
      expect(keywordSearchSpy).toHaveBeenCalledWith('test', 10);
      keywordSearchSpy.mockRestore();
    });

    it('should perform semantic search if embeddings exist', async () => {
        const mockEmbedding = new Array(768).fill(0.1);
        const generateEmbeddingSpy = jest.spyOn(service, 'generateEmbedding').mockResolvedValue(mockEmbedding);
        
        const searchResults = [
            { id: '1', similarity_score: '0.9', keyword_boost: '0.1', excerpt: 'test', title: 'test', source_table: 'test' }
        ];

        // Mock the two query calls inside semanticSearch
        querySpy = jest.spyOn(dbConfig.lsembPool, 'query')
            .mockResolvedValueOnce({ rows: [{ count: '10' }] } as any) // First call for embedding check
            .mockResolvedValueOnce({ rows: searchResults } as any);     // Second call for the actual search

        const results = await service.semanticSearch('test');
        
        expect(results).toHaveLength(1);
        expect(results[0].score).toBe(125); // Math.round((0.9 + 0.1) * 125)
        expect(querySpy).toHaveBeenCalledTimes(2);
        generateEmbeddingSpy.mockRestore();
    });
  });
});
