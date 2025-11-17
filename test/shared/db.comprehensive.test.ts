import { Pool } from 'pg';
import { INode } from 'n8n-workflow';
import { 
  getPool, 
  deleteBySourceId, 
  getStatistics, 
  cleanupOrphaned,
  DeleteBySourceResult,
  StatisticsResult,
  CleanupResult
} from '../../shared/db';

// Mock pg module
jest.mock('pg', () => {
  const mockPool = {
    connect: jest.fn(),
    on: jest.fn(),
    query: jest.fn(),
    end: jest.fn(),
  };
  return {
    Pool: jest.fn(() => mockPool),
  };
});

describe('Database Module - Comprehensive Tests', () => {
  let mockNode: INode;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockNode = {
      id: 'test-node',
      name: 'Test Node',
      type: 'test',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    } as unknown as INode;

    // Setup mock pool and client
    mockPool = new (require('pg').Pool)();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
      connect: jest.fn(),
    };
    
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe('getPool', () => {
    test('should return a pool instance', () => {
      const creds = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      const pool = getPool(mockNode, creds);
      expect(pool).toBeDefined();
      expect(pool).toHaveProperty('connect');
      expect(pool).toHaveProperty('query');
    });

    test('should reuse pool for same credentials', () => {
      const creds = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
      };

      const pool1 = getPool(mockNode, creds);
      const pool2 = getPool(mockNode, creds);

      expect(pool1).toBe(pool2);
    });

    test('should handle SSL configuration', () => {
      const creds = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        ssl: true,
      };

      const pool = getPool(mockNode, creds);
      expect(pool).toBeDefined();
    });
  });

  describe('deleteBySourceId', () => {
    test('should delete embeddings by source ID', async () => {
      const sourceId = 'test-source-123';
      
      // Mock the database responses
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] }) // Count query
        .mockResolvedValueOnce({ rows: [] }) // chunks_cache exists check
        .mockResolvedValueOnce({}) // Delete embeddings
        .mockResolvedValueOnce({}); // COMMIT

      const result: DeleteBySourceResult = await deleteBySourceId(mockPool, sourceId);

      expect(result).toEqual({
        deleted: 5,
        chunks_removed: 0
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT COUNT(*)::text AS count FROM embeddings WHERE source_id = $1',
        [sourceId]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM embeddings WHERE source_id = $1',
        [sourceId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    test('should handle errors and rollback', async () => {
      const sourceId = 'test-source-123';
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(deleteBySourceId(mockPool, sourceId)).rejects.toThrow('Failed to delete by sourceId: Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getStatistics', () => {
    test('should return database statistics', async () => {
      // Mock responses for all the queries
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // chunks count
        .mockResolvedValueOnce({ rows: [{ source_id: 'source1' }, { source_id: 'source2' }] }) // sources
        .mockResolvedValueOnce({ rows: [{ size: '104857600' }] }) // storage size
        .mockResolvedValueOnce({ rows: [{ idx_scan: '100' }, { idx_scan: '50' }] }) // index health
        .mockResolvedValueOnce({ rows: [{ avg_ms: '12.5' }] }); // query performance

      // Mock tableExists and functionExists
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('information_schema.tables')) {
          return { rows: [{ exists: true }] };
        }
        if (query.includes('pg_proc')) {
          return { rows: [{ exists: false }] };
        }
        return { rows: [] };
      });

      const result: StatisticsResult = await getStatistics(mockPool);

      expect(result).toEqual({
        documents: 2,
        chunks: 100,
        sources: ['source1', 'source2'],
        storage_mb: 100,
        index_health: 'healthy',
        performance: {
          avg_search_ms: 12.5,
          avg_insert_ms: 0,
          cache_hit_rate: 0
        }
      });
    });

    test('should handle workspace filtering', async () => {
      const workspace = 'test-workspace';
      
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ count: '50' }] })
        .mockResolvedValueOnce({ rows: [{ source_id: 'source1' }] })
        .mockResolvedValueOnce({ rows: [{ size: '52428800' }] })
        .mockResolvedValueOnce({ rows: [{ idx_scan: '100' }] })
        .mockResolvedValueOnce({ rows: [{ avg_ms: '10.0' }] });

      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('information_schema.tables')) {
          return { rows: [{ exists: true }] };
        }
        return { rows: [] };
      });

      const result = await getStatistics(mockPool, workspace);

      expect(result.documents).toBe(1);
      expect(result.chunks).toBe(50);
      expect(result.storage_mb).toBe(50);
    });
  });

  describe('cleanupOrphaned', () => {
    test('should cleanup orphaned records in dry run mode', async () => {
      // Mock orphaned embeddings
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'emb1' }, { id: 'emb2' }]
      });

      // Mock chunks_cache table exists
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('information_schema.tables') && query.includes('chunks_cache')) {
          return { rows: [{ exists: true }] };
        }
        if (query.includes('chunks_cache')) {
          return { rows: [{ id: 'chunk1' }] };
        }
        if (query.includes('pg_proc')) {
          return { rows: [{ exists: false }] };
        }
        return { rows: [] };
      });

      const result: CleanupResult = await cleanupOrphaned(mockPool, { dryRun: true });

      expect(result).toEqual({
        orphaned_chunks: 1,
        orphaned_embeddings: 2,
        cleaned: false,
        details: expect.arrayContaining([
          'Found 2 orphaned embeddings',
          'Found 1 orphaned cached chunks',
          'Dry run - no changes made'
        ])
      });

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should actually cleanup orphaned records', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ id: 'emb1' }] }) // orphaned embeddings
        .mockResolvedValueOnce({ rows: [{ id: 'chunk1' }] }); // orphaned chunks

      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('information_schema.tables')) {
          return { rows: [{ exists: true }] };
        }
        if (query.includes('pg_proc')) {
          return { rows: [{ exists: false }] };
        }
        return { rows: [] };
      });

      const result = await cleanupOrphaned(mockPool, { dryRun: false });

      expect(result.cleaned).toBe(true);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('Helper Functions', () => {
    test('tableExists should return true for existing table', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ exists: true }] });
      
      // We need to test the internal helper function
      // For now, we'll test through the public API that uses it
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('information_schema.tables')) {
          return { rows: [{ exists: true }] };
        }
        return { rows: [] };
      });

      const result = await getStatistics(mockPool);
      expect(result).toBeDefined();
    });

    test('functionExists should return false for non-existent function', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ exists: false }] });
      
      mockClient.query.mockImplementation(async (query: string) => {
        if (query.includes('pg_proc')) {
          return { rows: [{ exists: false }] };
        }
        return { rows: [] };
      });

      const result = await cleanupOrphaned(mockPool, { dryRun: true });
      expect(result).toBeDefined();
    });
  });
});