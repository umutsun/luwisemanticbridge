/**
 * System Metrics Service
 * Real-time system resource monitoring for dashboard
 * Enhanced with accurate CPU measurement, real disk stats, and network I/O
 */

import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Pool } from 'pg';

const execAsync = promisify(exec);

interface CpuInfo {
  usage: number;
  cores: number;
  loadAvg: number[];
  model: string;
  speed: number; // MHz
}

interface NetworkInfo {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  bytesInPerSec: number;
  bytesOutPerSec: number;
}

interface MemoryInfo {
  used: number;
  total: number;
  free: number;
  percentage: number;
  heapUsed: number;
  heapTotal: number;
}

interface DiskInfo {
  used: number;
  total: number;
  free: number;
  percentage: number;
  mountPoint: string;
  filesystem: string;
}

interface ProcessInfo {
  uptime: number;
  pid: number;
  nodeVersion: string;
  platform: string;
}

interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  uptime?: number;
  memory?: number;
  cpu?: number;
  port?: number;
  lastCheck?: Date;
}

interface PipelineStatus {
  name: string;
  type: 'embedding' | 'crawler' | 'migration' | 'indexing';
  status: 'running' | 'paused' | 'completed' | 'error' | 'idle';
  progress?: number;
  current?: number;
  total?: number;
  speed?: number;
  eta?: string;
  startedAt?: Date;
  error?: string;
}

interface DatabaseStats {
  connectionPool: {
    total: number;
    idle: number;
    waiting: number;
  };
  size: string;
  tables: number;
  embeddings: number;
  documents: number;
}

interface RedisStats {
  connected: boolean;
  usedMemory: string;
  totalKeys: number;
  hitRate: number;
}

interface PerformanceMetrics {
  avgResponseTime: number;  // milliseconds
  dailyQueries: number;
  cacheHitRate: number;     // percentage
  totalDocuments: number;
}

export interface SystemMetrics {
  timestamp: Date;
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo;
  network: NetworkInfo;
  process: ProcessInfo;
  services: ServiceStatus[];
  pipelines: PipelineStatus[];
  database: DatabaseStats;
  redis: RedisStats;
  performance: PerformanceMetrics;
}

export class SystemMetricsService {
  private pool: Pool;
  private redis: any;
  private lastCpuInfo: os.CpuInfo[] | null = null;
  private lastCpuTime: number = 0;
  private lastNetworkStats: { bytesIn: number; bytesOut: number; packetsIn: number; packetsOut: number; time: number } | null = null;

  constructor(pool: Pool, redis?: any) {
    this.pool = pool;
    this.redis = redis;
    // Initialize CPU sampling
    this.lastCpuInfo = os.cpus();
    this.lastCpuTime = Date.now();
  }

  /**
   * Get CPU usage percentage with accurate measurement
   * Uses delta between two CPU time samples for real usage
   */
  getCpuUsage(): CpuInfo {
    const currentCpus = os.cpus();
    const loadAvg = os.loadavg();
    const now = Date.now();

    let usage = 0;

    // Calculate real CPU usage from time deltas
    if (this.lastCpuInfo && this.lastCpuTime) {
      const timeDelta = now - this.lastCpuTime;

      if (timeDelta > 0) {
        let totalIdleDelta = 0;
        let totalTickDelta = 0;

        for (let i = 0; i < currentCpus.length; i++) {
          const currentCpu = currentCpus[i];
          const lastCpu = this.lastCpuInfo[i];

          if (lastCpu) {
            const currentTotal = currentCpu.times.user + currentCpu.times.nice +
                                currentCpu.times.sys + currentCpu.times.idle + currentCpu.times.irq;
            const lastTotal = lastCpu.times.user + lastCpu.times.nice +
                             lastCpu.times.sys + lastCpu.times.idle + lastCpu.times.irq;

            const idleDelta = currentCpu.times.idle - lastCpu.times.idle;
            const totalDelta = currentTotal - lastTotal;

            totalIdleDelta += idleDelta;
            totalTickDelta += totalDelta;
          }
        }

        if (totalTickDelta > 0) {
          usage = Math.round(((totalTickDelta - totalIdleDelta) / totalTickDelta) * 100);
          usage = Math.max(0, Math.min(100, usage));
        }
      }
    }

    // Update last sample
    this.lastCpuInfo = currentCpus;
    this.lastCpuTime = now;

    // Get CPU model and speed
    const firstCpu = currentCpus[0];
    const model = firstCpu?.model || 'Unknown';
    const speed = firstCpu?.speed || 0;

    return {
      usage,
      cores: currentCpus.length,
      loadAvg,
      model: model.trim(),
      speed
    };
  }

  /**
   * Get memory usage
   */
  getMemoryUsage(): MemoryInfo {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const heapUsed = process.memoryUsage().heapUsed;
    const heapTotal = process.memoryUsage().heapTotal;

    return {
      used: Math.round(usedMem / 1024 / 1024), // MB
      total: Math.round(totalMem / 1024 / 1024), // MB
      free: Math.round(freeMem / 1024 / 1024), // MB
      percentage: Math.round((usedMem / totalMem) * 100),
      heapUsed: Math.round(heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(heapTotal / 1024 / 1024) // MB
    };
  }

  /**
   * Get real disk usage using system commands
   * Falls back to database size estimation if commands fail
   */
  async getDiskUsage(): Promise<DiskInfo> {
    const isLinux = process.platform === 'linux';
    const isWindows = process.platform === 'win32';

    // Try to get real disk stats
    if (isLinux) {
      try {
        // Get disk usage for /var/www or root partition
        const { stdout } = await execAsync("df -B1 /var/www 2>/dev/null || df -B1 / | tail -1");
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const parts = lastLine.split(/\s+/);

        if (parts.length >= 6) {
          const filesystem = parts[0];
          const total = parseInt(parts[1]) || 0;
          const used = parseInt(parts[2]) || 0;
          const free = parseInt(parts[3]) || 0;
          const percentage = parseInt(parts[4]?.replace('%', '')) || 0;
          const mountPoint = parts[5] || '/';

          return {
            used: Math.round(used / 1024 / 1024), // MB
            total: Math.round(total / 1024 / 1024), // MB
            free: Math.round(free / 1024 / 1024), // MB
            percentage,
            mountPoint,
            filesystem
          };
        }
      } catch (err) {
        console.error('Error getting disk usage via df:', err);
      }
    } else if (isWindows) {
      try {
        // Windows: Get disk usage via WMIC
        const { stdout } = await execAsync('wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:csv');
        const lines = stdout.trim().split('\n').filter(l => l.trim());
        if (lines.length >= 2) {
          const parts = lines[1].split(',');
          if (parts.length >= 3) {
            const freeSpace = parseInt(parts[1]) || 0;
            const totalSize = parseInt(parts[2]) || 0;
            const usedSpace = totalSize - freeSpace;

            return {
              used: Math.round(usedSpace / 1024 / 1024),
              total: Math.round(totalSize / 1024 / 1024),
              free: Math.round(freeSpace / 1024 / 1024),
              percentage: totalSize > 0 ? Math.round((usedSpace / totalSize) * 100) : 0,
              mountPoint: 'C:',
              filesystem: 'NTFS'
            };
          }
        }
      } catch (err) {
        console.error('Error getting Windows disk usage:', err);
      }
    }

    // Fallback: estimate from database size
    try {
      const result = await this.pool.query(`
        SELECT pg_database_size(current_database()) as db_size
      `);
      const dbSize = parseInt(result.rows[0]?.db_size || 0);

      return {
        used: Math.round(dbSize / 1024 / 1024),
        total: 100 * 1024, // 100GB estimate
        free: (100 * 1024) - Math.round(dbSize / 1024 / 1024),
        percentage: Math.round((dbSize / (100 * 1024 * 1024 * 1024)) * 100),
        mountPoint: 'unknown',
        filesystem: 'postgres'
      };
    } catch {
      return {
        used: 0,
        total: 100 * 1024,
        free: 100 * 1024,
        percentage: 0,
        mountPoint: 'unknown',
        filesystem: 'unknown'
      };
    }
  }

  /**
   * Get network I/O statistics
   */
  async getNetworkStats(): Promise<NetworkInfo> {
    const isLinux = process.platform === 'linux';
    const now = Date.now();

    let bytesIn = 0;
    let bytesOut = 0;
    let packetsIn = 0;
    let packetsOut = 0;

    if (isLinux) {
      try {
        // Read network stats from /proc/net/dev
        const { stdout } = await execAsync("cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1");
        const line = stdout.trim();
        if (line) {
          // Format: Interface: bytes packets errs drop fifo frame compressed multicast | bytes packets ...
          const parts = line.split(/\s+/).filter(p => p);
          if (parts.length >= 11) {
            bytesIn = parseInt(parts[1]) || 0;
            packetsIn = parseInt(parts[2]) || 0;
            bytesOut = parseInt(parts[9]) || 0;
            packetsOut = parseInt(parts[10]) || 0;
          }
        }
      } catch (err) {
        console.error('Error getting network stats:', err);
      }
    }

    // Calculate per-second rates
    let bytesInPerSec = 0;
    let bytesOutPerSec = 0;

    if (this.lastNetworkStats) {
      const timeDelta = (now - this.lastNetworkStats.time) / 1000; // seconds
      if (timeDelta > 0) {
        bytesInPerSec = Math.round((bytesIn - this.lastNetworkStats.bytesIn) / timeDelta);
        bytesOutPerSec = Math.round((bytesOut - this.lastNetworkStats.bytesOut) / timeDelta);
        // Prevent negative values on counter reset
        if (bytesInPerSec < 0) bytesInPerSec = 0;
        if (bytesOutPerSec < 0) bytesOutPerSec = 0;
      }
    }

    // Update last sample
    this.lastNetworkStats = { bytesIn, bytesOut, packetsIn, packetsOut, time: now };

    return {
      bytesIn,
      bytesOut,
      packetsIn,
      packetsOut,
      bytesInPerSec,
      bytesOutPerSec
    };
  }

  /**
   * Get process info
   */
  getProcessInfo(): ProcessInfo {
    return {
      uptime: process.uptime(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  /**
   * Get active pipelines status
   */
  async getPipelinesStatus(): Promise<PipelineStatus[]> {
    const pipelines: PipelineStatus[] = [];

    // Check embedding progress from Redis
    if (this.redis) {
      try {
        const embeddingProgress = await this.redis.get('embedding:progress');
        if (embeddingProgress) {
          const progress = JSON.parse(embeddingProgress);
          if (progress.status && progress.status !== 'idle') {
            const elapsed = progress.startTime ? (Date.now() - progress.startTime) / 1000 : 0;
            const speed = elapsed > 0 ? (progress.current - (progress.initialEmbedded || 0)) / elapsed : 0;
            const remaining = progress.total - progress.current;
            const etaSeconds = speed > 0 ? remaining / speed : 0;

            pipelines.push({
              name: 'Embedding Migration',
              type: 'embedding',
              status: progress.status as any,
              progress: progress.percentage || 0,
              current: progress.current || 0,
              total: progress.total || 0,
              speed: Math.round(speed * 60), // per minute
              eta: etaSeconds > 0 ? this.formatEta(etaSeconds) : undefined,
              startedAt: progress.startTime ? new Date(progress.startTime) : undefined,
              error: progress.error
            });
          }
        }

        // Check for active crawlers
        const crawlerKeys = await this.redis.keys('crawler:*:status');
        for (const key of crawlerKeys) {
          try {
            const crawlerStatus = await this.redis.get(key);
            if (crawlerStatus) {
              const status = JSON.parse(crawlerStatus);
              pipelines.push({
                name: status.name || key.replace('crawler:', '').replace(':status', ''),
                type: 'crawler',
                status: status.status || 'unknown',
                progress: status.progress || 0,
                current: status.current || 0,
                total: status.total || 0,
                startedAt: status.startedAt ? new Date(status.startedAt) : undefined
              });
            }
          } catch {}
        }

        // Check batch analyze status
        const batchAnalyze = await this.redis.get('batch:analyze:progress');
        if (batchAnalyze) {
          const batch = JSON.parse(batchAnalyze);
          if (batch.status && batch.status !== 'idle' && batch.status !== 'completed') {
            pipelines.push({
              name: 'Batch Analysis',
              type: 'indexing',
              status: batch.status as any,
              progress: batch.percentage || 0,
              current: batch.current || 0,
              total: batch.total || 0,
              startedAt: batch.startedAt ? new Date(batch.startedAt) : undefined
            });
          }
        }
      } catch (err) {
        console.error('Error getting pipeline status from Redis:', err);
      }
    }

    // Check database for migration status
    try {
      const migrationResult = await this.pool.query(`
        SELECT * FROM embedding_progress
        WHERE status IN ('processing', 'pending', 'paused')
        ORDER BY started_at DESC
        LIMIT 5
      `);

      for (const row of migrationResult.rows) {
        // Avoid duplicates with Redis data
        const exists = pipelines.find(p =>
          p.type === 'embedding' && p.status === row.status
        );

        if (!exists) {
          pipelines.push({
            name: row.document_type || 'Database Migration',
            type: 'migration',
            status: row.status as any,
            progress: row.total_chunks > 0
              ? Math.round((row.processed_chunks / row.total_chunks) * 100)
              : 0,
            current: row.processed_chunks || 0,
            total: row.total_chunks || 0,
            startedAt: row.started_at,
            error: row.error_message
          });
        }
      }
    } catch (err) {
      // Table might not exist
    }

    // If no active pipelines, add an idle status
    if (pipelines.length === 0) {
      pipelines.push({
        name: 'Embedding Pipeline',
        type: 'embedding',
        status: 'idle'
      });
    }

    return pipelines;
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    try {
      const [sizeResult, tableResult, embResult, docResult] = await Promise.all([
        this.pool.query(`SELECT pg_database_size(current_database()) as db_size`),
        this.pool.query(`
          SELECT COUNT(*) as count FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `),
        this.pool.query(`SELECT COUNT(*) as count FROM unified_embeddings`).catch(() => ({ rows: [{ count: 0 }] })),
        this.pool.query(`SELECT COUNT(*) as count FROM documents`).catch(() => ({ rows: [{ count: 0 }] }))
      ]);

      const dbSize = parseInt(sizeResult.rows[0]?.db_size || 0);
      const formattedSize = dbSize > 1073741824
        ? `${(dbSize / 1073741824).toFixed(2)} GB`
        : `${(dbSize / 1048576).toFixed(2)} MB`;

      return {
        connectionPool: {
          total: (this.pool as any).totalCount || 0,
          idle: (this.pool as any).idleCount || 0,
          waiting: (this.pool as any).waitingCount || 0
        },
        size: formattedSize,
        tables: parseInt(tableResult.rows[0]?.count || 0),
        embeddings: parseInt(embResult.rows[0]?.count || 0),
        documents: parseInt(docResult.rows[0]?.count || 0)
      };
    } catch {
      return {
        connectionPool: { total: 0, idle: 0, waiting: 0 },
        size: '0 MB',
        tables: 0,
        embeddings: 0,
        documents: 0
      };
    }
  }

  /**
   * Get Redis statistics
   */
  async getRedisStats(): Promise<RedisStats> {
    if (!this.redis || this.redis.status !== 'ready') {
      return {
        connected: false,
        usedMemory: '0 MB',
        totalKeys: 0,
        hitRate: 0
      };
    }

    try {
      const [info, dbsize, hits, misses] = await Promise.all([
        this.redis.info('memory'),
        this.redis.dbsize(),
        this.redis.get('cache:hits'),
        this.redis.get('cache:misses')
      ]);

      const memMatch = info.match(/used_memory_human:(.+)/);
      const usedMemory = memMatch ? memMatch[1].trim() : '0 MB';

      const totalHits = parseInt(hits || '0');
      const totalMisses = parseInt(misses || '0');
      const totalRequests = totalHits + totalMisses;
      const hitRate = totalRequests > 0 ? Math.round((totalHits / totalRequests) * 100) : 0;

      return {
        connected: true,
        usedMemory,
        totalKeys: dbsize,
        hitRate
      };
    } catch {
      return {
        connected: false,
        usedMemory: '0 MB',
        totalKeys: 0,
        hitRate: 0
      };
    }
  }

  /**
   * Get performance metrics from Redis
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    let avgResponseTime = 0;
    let dailyQueries = 0;
    let cacheHitRate = 0;
    let totalDocuments = 0;

    // Get document count from database
    try {
      const docResult = await this.pool.query(`SELECT COUNT(*) as count FROM documents`);
      totalDocuments = parseInt(docResult.rows[0]?.count || 0);
    } catch {
      totalDocuments = 0;
    }

    if (this.redis && this.redis.status === 'ready') {
      try {
        // Get daily query count
        const queryCount = await this.redis.get(`stats:daily_queries:${today}`);
        dailyQueries = parseInt(queryCount || '0');

        // Get average response time from last 100 requests
        const responseTimes = await this.redis.lrange('stats:response_times', 0, 99);
        if (responseTimes && responseTimes.length > 0) {
          const times = responseTimes.map((t: string) => parseFloat(t));
          avgResponseTime = Math.round(times.reduce((a: number, b: number) => a + b, 0) / times.length);
        }

        // Get cache hit rate
        const [hits, misses] = await Promise.all([
          this.redis.get('cache:hits'),
          this.redis.get('cache:misses')
        ]);
        const totalHits = parseInt(hits || '0');
        const totalMisses = parseInt(misses || '0');
        const totalRequests = totalHits + totalMisses;
        cacheHitRate = totalRequests > 0 ? Math.round((totalHits / totalRequests) * 100) : 0;
      } catch (err) {
        console.error('Error getting performance metrics from Redis:', err);
      }
    }

    return {
      avgResponseTime,
      dailyQueries,
      cacheHitRate,
      totalDocuments
    };
  }

  /**
   * Get services status
   */
  async getServicesStatus(): Promise<ServiceStatus[]> {
    const services: ServiceStatus[] = [];

    // Backend service (self)
    services.push({
      name: 'Backend API',
      status: 'running',
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      port: parseInt(process.env.API_PORT || '8083')
    });

    // Check Python service
    try {
      const pythonPort = process.env.PYTHON_SERVICE_PORT || '8001';
      const response = await fetch(`http://localhost:${pythonPort}/health`, {
        signal: AbortSignal.timeout(2000)
      });
      services.push({
        name: 'Python Services',
        status: response.ok ? 'running' : 'error',
        port: parseInt(pythonPort)
      });
    } catch {
      services.push({
        name: 'Python Services',
        status: 'stopped',
        port: parseInt(process.env.PYTHON_SERVICE_PORT || '8001')
      });
    }

    // Database status
    try {
      await this.pool.query('SELECT 1');
      services.push({
        name: 'PostgreSQL',
        status: 'running'
      });
    } catch {
      services.push({
        name: 'PostgreSQL',
        status: 'error'
      });
    }

    // Redis status
    if (this.redis) {
      services.push({
        name: 'Redis',
        status: this.redis.status === 'ready' ? 'running' : 'error'
      });
    }

    return services;
  }

  /**
   * Get all system metrics
   */
  async getAllMetrics(): Promise<SystemMetrics> {
    const [disk, network, pipelines, database, redis, services, performance] = await Promise.all([
      this.getDiskUsage(),
      this.getNetworkStats(),
      this.getPipelinesStatus(),
      this.getDatabaseStats(),
      this.getRedisStats(),
      this.getServicesStatus(),
      this.getPerformanceMetrics()
    ]);

    return {
      timestamp: new Date(),
      cpu: this.getCpuUsage(),
      memory: this.getMemoryUsage(),
      disk,
      network,
      process: this.getProcessInfo(),
      services,
      pipelines,
      database,
      redis,
      performance
    };
  }

  /**
   * Format ETA from seconds to human readable
   */
  private formatEta(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  /**
   * Set Redis instance (for late initialization)
   */
  setRedis(redis: any): void {
    this.redis = redis;
  }
}

export default SystemMetricsService;
