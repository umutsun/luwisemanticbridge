import { getPool } from '../../../shared/db';
import { Pool, PoolClient } from 'pg';

// Mock dependencies
jest.mock('../../../shared/db');

const mockGetPool = getPool as jest.MockedFunction<typeof getPool>;

describe('API Health Integration Tests', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Database Health', () => {
    it('should return healthy when database connection is successful', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkDatabaseHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.connection).toBe('healthy');
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return unhealthy when database connection fails', async () => {
      const error = new Error('Connection failed');
      const mockPool = {
        connect: jest.fn().mockRejectedValue(error)
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkDatabaseHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Connection failed');
    });

    it('should return unhealthy when database query fails', async () => {
      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error('Query failed')),
        release: jest.fn()
      };
      
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkDatabaseHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Query failed');
    });

    it('should return unhealthy when client release fails', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn().mockImplementation(() => {
          throw new Error('Release failed');
        })
      };
      
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkDatabaseHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Release failed');
    });
  });

  describe('Pool Health', () => {
    it('should return healthy when pool is available', async () => {
      const mockPool = {
        connect: jest.fn().mockResolvedValue({
          query: jest.fn().mockResolvedValue({ rows: [] }),
          release: jest.fn()
        })
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkPoolHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.pool).toBe('available');
      expect(mockPool.connect).toHaveBeenCalled();
    });

    it('should return unhealthy when pool connection fails', async () => {
      const mockPool = {
        connect: jest.fn().mockRejectedValue(new Error('Pool connection failed'))
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkPoolHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Pool connection failed');
    });
  });

  describe('Statistics Health', () => {
    it('should return healthy when statistics can be retrieved', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // chunks count
          .mockResolvedValueOnce({ rows: [{ source_id: 'source1' }] }) // sources
          .mockResolvedValueOnce({ rows: [{ size: '1048576' }] }) // storage size
          .mockResolvedValueOnce({ rows: [{ idx_scan: '10' }] }) // index health
          .mockResolvedValueOnce({ rows: [{ avg_ms: '50' }] }), // performance
        release: jest.fn()
      };
      
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkStatisticsHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.statistics).toEqual({
        documents: 1,
        chunks: 100,
        sources: ['source1'],
        storage_mb: 1,
        index_health: 'healthy',
        performance: {
          avg_search_ms: 50,
          avg_insert_ms: 0,
          cache_hit_rate: 0
        }
      });
    });

    it('should return unhealthy when statistics retrieval fails', async () => {
      const mockClient = {
        query: jest.fn().mockRejectedValue(new Error('Statistics failed')),
        release: jest.fn()
      };
      
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkStatisticsHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Statistics failed');
    });
  });

  describe('Combined Health Check', () => {
    it('should return healthy when all checks pass', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkOverallHealth();
      
      expect(result.status).toBe('healthy');
      expect(result.checks.database).toBe('healthy');
      expect(result.checks.pool).toBe('healthy');
      expect(result.checks.statistics).toBe('healthy');
    });

    it('should return unhealthy when any check fails', async () => {
      const mockPool = {
        connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const result = await checkOverallHealth();
      
      expect(result.status).toBe('unhealthy');
      expect(result.checks.database).toBe('unhealthy');
      expect(result.checks.pool).toBe('unhealthy');
      expect(result.checks.statistics).toBe('unhealthy');
    });

    it('should include response time in overall health check', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn()
      };
      
      const mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient)
      };
      
      mockGetPool.mockReturnValue(mockPool as any);

      const startTime = Date.now();
      const result = await checkOverallHealth();
      const endTime = Date.now();

      expect(result.status).toBe('healthy');
      expect(result.responseTime).toBeGreaterThan(0);
      expect(result.responseTime).toBeLessThan(endTime - startTime + 10); // Allow small margin
    });
  });
});

// Helper functions for testing
async function checkDatabaseHealth() {
  try {
    const pool = getPool({} as any, { host: 'localhost', port: 5432, database: 'test', user: 'postgres' });
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return { status: 'healthy', connection: 'healthy' };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function checkPoolHealth() {
  try {
    const pool = getPool({} as any, { host: 'localhost', port: 5432, database: 'test', user: 'postgres' });
    await pool.connect();
    return { status: 'healthy', pool: 'available' };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function checkStatisticsHealth() {
  try {
    const pool = getPool({} as any, { host: 'localhost', port: 5432, database: 'test', user: 'postgres' });
    const client = await pool.connect();
    
    // Mock statistics queries
    const chunksRes = await client.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM embeddings');
    const chunks = parseInt(chunksRes.rows[0]?.count || '0', 10);
    
    const sourcesRes = await client.query<{ source_id: string }>('SELECT DISTINCT source_id::text AS source_id FROM embeddings');
    const sources = sourcesRes.rows.map(r => r.source_id);
    
    const storageRes = await client.query<{ size: string }>('SELECT pg_database_size(current_database())::text AS size');
    const storage_mb = parseInt(storageRes.rows[0]?.size || '0', 10) / (1024 * 1024);
    
    const indexRes = await client.query('SELECT idx_scan FROM pg_stat_user_indexes WHERE schemaname = \'public\' LIMIT 1');
    const index_health = indexRes.rows.length > 0 ? 'healthy' : 'degraded';
    
    const perfRes = await client.query('SELECT AVG(execution_time_ms)::text AS avg_ms FROM queries LIMIT 1');
    const avg_search_ms = perfRes.rows[0]?.avg_ms ? parseFloat(perfRes.rows[0].avg_ms) : 0;
    
    client.release();
    
    return {
      status: 'healthy',
      statistics: {
        documents: sources.length,
        chunks,
        sources,
        storage_mb: Number(storage_mb.toFixed(2)),
        index_health: index_health as 'healthy' | 'degraded' | 'critical',
        performance: {
          avg_search_ms,
          avg_insert_ms: 0,
          cache_hit_rate: 0
        }
      }
    };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function checkOverallHealth() {
  const startTime = Date.now();
  
  const [databaseHealth, poolHealth, statisticsHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkPoolHealth(),
    checkStatisticsHealth()
  ]);
  
  const endTime = Date.now();
  const responseTime = endTime - startTime;
  
  const allHealthy = databaseHealth.status === 'healthy' && 
                     poolHealth.status === 'healthy' && 
                     statisticsHealth.status === 'healthy';
  
  return {
    status: allHealthy ? 'healthy' : 'unhealthy',
    checks: {
      database: databaseHealth.status,
      pool: poolHealth.status,
      statistics: statisticsHealth.status
    },
    responseTime,
    timestamp: new Date().toISOString()
  };
}