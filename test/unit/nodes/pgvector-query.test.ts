import { PgvectorQuery } from '../../../nodes/PgvectorQuery.node';
import { embedText, vectorToSqlArray } from '../../../shared/embedding';
import { getPool } from '../../../shared/db';
import { AsembError, ErrorHandler, ErrorCode } from '../../../src/errors/AsembError';

// Mock dependencies
jest.mock('../../../shared/embedding');
jest.mock('../../../shared/db');

const mockEmbedText = embedText as jest.MockedFunction<typeof embedText>;
const mockGetPool = getPool as jest.MockedFunction<typeof getPool>;

describe('PgvectorQuery', () => {
  let pgvectorQuery: PgvectorQuery;
  let mockExecuteFunctions: any;
  let mockCredentials: any;
  let mockPool: any;

  beforeEach(() => {
    pgvectorQuery = new PgvectorQuery();
    mockPool = {
      connect: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn()
      })
    };
    mockGetPool.mockReturnValue(mockPool);

    mockExecuteFunctions = {
      getInputData: jest.fn(),
      getNodeParameter: jest.fn(),
      getCredentials: jest.fn(),
      getNode: jest.fn()
    };

    mockCredentials = {
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'postgres',
      password: 'password'
    };

    mockExecuteFunctions.getCredentials.mockResolvedValue(mockCredentials);
    mockExecuteFunctions.getInputData.mockReturnValue([{}]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should execute vector query successfully', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockQueryPlan = 'Index Scan using idx_embeddings on embeddings';
      const mockResults = [
        {
          QUERY_PLAN: mockQueryPlan,
          id: 1,
          content: 'Test content',
          metadata: { source: 'test' }
        }
      ];

      mockEmbedText.mockResolvedValue(mockEmbedding);
      mockPool.connect().then((client: any) => {
        client.query.mockResolvedValue({ rows: mockResults });
      });

      mockExecuteFunctions.getNodeParameter
        .mockReturnValueOnce('embeddings') // table
        .mockReturnValueOnce('embedding') // embeddingColumn
        .mockReturnValueOnce('search query') // queryText
        .mockReturnValueOnce('*') // returnColumnsCsv
        .mockReturnValueOnce(5) // topK
        .mockReturnValueOnce('<->'); // distanceOp

      const result = await pgvectorQuery.execute.call(mockExecuteFunctions);
      
      expect(result).toEqual([mockResults]);
      expect(mockEmbedText).toHaveBeenCalledWith(mockExecuteFunctions, 0, 'search query');
      expect(mockPool.connect).toHaveBeenCalled();
    });

    it('should handle custom return columns', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockResults = [
        {
          QUERY_PLAN: 'Scan plan',
          id: 1,
          title: 'Test title',
          content: 'Test content'
        }
      ];

      mockEmbedText.mockResolvedValue(mockEmbedding);
      mockPool.connect().then((client: any) => {
        client.query.mockResolvedValue({ rows: mockResults });
      });

      mockExecuteFunctions.getNodeParameter
        .mockReturnValueOnce('articles') // table
        .mockReturnValueOnce('vector_embedding') // embeddingColumn
        .mockReturnValueOnce('search query') // queryText
        .mockReturnValueOnce('id,title,content') // returnColumnsCsv
        .mockReturnValueOnce(10) // topK
        .mockReturnValueOnce('<=>'); // distanceOp

      const result = await pgvectorQuery.execute.call(mockExecuteFunctions);
      
      expect(result).toEqual([mockResults]);
      expect(mockPool.connect).toHaveBeenCalled();
    });

    it('should handle different distance operators', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockResults = [
        {
          QUERY_PLAN: 'Inner product plan',
          id: 1,
          content: 'Test content'
        }
      ];

      mockEmbedText.mockResolvedValue(mockEmbedding);
      mockPool.connect().then((client: any) => {
        client.query.mockResolvedValue({ rows: mockResults });
      });

      mockExecuteFunctions.getNodeParameter
        .mockReturnValueOnce('embeddings') // table
        .mockReturnValueOnce('embedding') // embeddingColumn
        .mockReturnValueOnce('search query') // queryText
        .mockReturnValueOnce('*') // returnColumnsCsv
        .mockReturnValueOnce(5) // topK
        .mockReturnValueOnce('<#>'); // distanceOp

      const result = await pgvectorQuery.execute.call(mockExecuteFunctions);
      
      expect(result).toEqual([mockResults]);
      expect(mockPool.connect).toHaveBeenCalled();
    });

    it('should handle AsembError', async () => {
      const asembError = new AsembError('Embedding generation failed', 'EMBEDDING_FAILED' as any);
      mockEmbedText.mockRejectedValue(asembError);

      mockExecuteFunctions.getNodeParameter
        .mockReturnValueOnce('embeddings') // table
        .mockReturnValueOnce('embedding') // embeddingColumn
        .mockReturnValueOnce('search query') // queryText
        .mockReturnValueOnce('*') // returnColumnsCsv
        .mockReturnValueOnce(5) // topK
        .mockReturnValueOnce('<->'); // distanceOp

      await expect(pgvectorQuery.execute.call(mockExecuteFunctions))
        .rejects.toThrow('Embedding generation failed');
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockEmbedText.mockResolvedValue([0.1, 0.2, 0.3]);
      mockPool.connect().then((client: any) => {
        client.query.mockRejectedValue(dbError);
      });

      mockExecuteFunctions.getNodeParameter
        .mockReturnValueOnce('embeddings') // table
        .mockReturnValueOnce('embedding') // embeddingColumn
        .mockReturnValueOnce('search query') // queryText
        .mockReturnValueOnce('*') // returnColumnsCsv
        .mockReturnValueOnce(5) // topK
        .mockReturnValueOnce('<->'); // distanceOp

      await expect(pgvectorQuery.execute.call(mockExecuteFunctions))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('node configuration', () => {
    it('should have correct node description', () => {
      expect(pgvectorQuery.description).toEqual({
        displayName: 'PGVector Query',
        name: 'pgvectorQuery',
        group: ['transform'],
        version: 1,
        description: 'Similarity search with pgvector',
        defaults: { name: 'PGVector Query' },
        inputs: ['main'],
        outputs: ['main'],
        credentials: [
          { name: 'postgresWithVectorApi', required: true },
          { name: 'openAIApi', required: true },
        ],
        properties: [
          { displayName: 'Table', name: 'table', type: 'string', default: '', required: true },
          { displayName: 'Embedding Column', name: 'embeddingColumn', type: 'string', default: 'embedding' },
          { displayName: 'Query Text', name: 'queryText', type: 'string', default: '', required: true },
          { displayName: 'Return Columns (CSV)', name: 'returnColumnsCsv', type: 'string', default: '*', description: 'Columns to return, e.g. id,text,metadata' },
          { displayName: 'Top K', name: 'topK', type: 'number', default: 5 },
          { displayName: 'Distance Operator', name: 'distanceOp', type: 'options', default: '<->', options: [
            { name: 'Euclidean (<->)', value: '<->' },
            { name: 'Inner Product (<#>)', value: '<#>' },
            { name: 'Cosine (<=>)', value: '<=>' },
          ]}
        ],
      });
    });
  });
});