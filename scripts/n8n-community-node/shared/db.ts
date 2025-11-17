import { Pool, PoolClient } from 'pg';
import type { INode } from 'n8n-workflow';

// Use a Map to store pools, keyed by a unique identifier for the credentials.
// This allows for multiple different database connections to be pooled.
const pools = new Map<string, Pool>();

// Define a type for the credentials to make the code clearer.
interface PgCreds {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  ssl?: boolean;
}

export function getPool(node: INode, creds: PgCreds): Pool {
  // Create a unique key for the connection pool based on the credentials.
  const key = `${creds.user}:${creds.host}:${creds.port}:${creds.database}`;
  let pool = pools.get(key);

  if (!pool) {
    // If a pool for these credentials doesn't exist, create one.
    pool = new Pool({
      host: creds.host,
      port: creds.port,
      database: creds.database,
      user: creds.user,
      password: creds.password,
      ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
      max: 20, // Max number of clients in the pool
      idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
      connectionTimeoutMillis: 2000, // How long to wait for a client to connect
    });
    pools.set(key, pool);

    // Add an error listener to the pool. This is important for handling
    // errors on idle clients and preventing the application from crashing.
    pool.on('error', (err) => {
      console.error(`Unexpected error on idle client in pool ${key}`, err);
      // On error, remove the faulty pool. It will be recreated on the next request.
      pools.delete(key);
    });
  }

  return pool;
}

// --- Phase 3: Manage Operations ---

export interface DeleteBySourceOptions {
  cascade?: boolean;
}

export interface DeleteBySourceResult {
  deleted: number;
  chunks_removed: number; // mapped to rows removed from chunks_cache
}

export async function deleteBySourceId(
  pool: Pool,
  sourceId: string,
  options: DeleteBySourceOptions = { cascade: true },
): Promise<DeleteBySourceResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Count rows to be deleted from embeddings
    const countRes = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM embeddings WHERE source_id = $1',
      [sourceId],
    );
    const toDelete = parseInt(countRes.rows[0]?.count || '0', 10);

    let chunksRemoved = 0;

    if (options.cascade) {
      // Remove any cached chunks for this source if the table exists
      const cacheExists = await tableExists(client, 'chunks_cache');
      if (cacheExists) {
        const delCache = await client.query(
          'DELETE FROM chunks_cache WHERE source_id = $1 RETURNING id',
          [sourceId],
        );
        chunksRemoved = delCache.rowCount || 0;
      }
    }

    // Delete embeddings for the source
    await client.query('DELETE FROM embeddings WHERE source_id = $1', [sourceId]);

    await client.query('COMMIT');

    return { deleted: toDelete, chunks_removed: chunksRemoved };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw new Error(`Failed to delete by sourceId: ${err?.message || String(err)}`);
  } finally {
    client.release();
  }
}

export type IndexHealth = 'healthy' | 'degraded' | 'critical';

export interface StatisticsResult {
  documents: number; // number of sources participating
  chunks: number; // number of embeddings (content chunks)
  sources: string[]; // distinct source IDs
  storage_mb: number; // total DB/storage usage (approx)
  index_health: IndexHealth;
  performance: {
    avg_search_ms: number;
    avg_insert_ms: number;
    cache_hit_rate: number;
  };
}

export async function getStatistics(pool: Pool, workspace?: string): Promise<StatisticsResult> {
  const client = await pool.connect();
  try {
    // Embeddings (chunks) count with optional workspace metadata filter
    const chunksQuery = workspace
      ? "SELECT COUNT(*)::text AS count FROM embeddings WHERE metadata->>'workspace' = $1"
      : 'SELECT COUNT(*)::text AS count FROM embeddings';
    const chunksParams = workspace ? [workspace] : [];
    const chunksRes = await client.query<{ count: string }>(chunksQuery, chunksParams);
    const chunks = parseInt(chunksRes.rows[0]?.count || '0', 10);

    // Distinct sources from embeddings (respects workspace filter)
    const sourcesQuery = workspace
      ? "SELECT DISTINCT source_id::text AS source_id FROM embeddings WHERE metadata->>'workspace' = $1"
      : 'SELECT DISTINCT source_id::text AS source_id FROM embeddings';
    const sourcesRes = await client.query<{ source_id: string }>(sourcesQuery, chunksParams);
    const sources = sourcesRes.rows.map((r) => r.source_id);

    // Documents = number of sources represented
    const documents = sources.length;

    // Storage: sum relation sizes for relevant tables; fallback to database size
    const tables = ['embeddings', 'sources', 'sync_logs', 'queries', 'api_usage', 'chunks_cache'];
    let totalBytes = 0;
    for (const t of tables) {
      const exists = await tableExists(client, t);
      if (!exists) continue;
      const r = await client.query<{ size: string }>(
        "SELECT pg_total_relation_size($1)::text AS size",
        [t],
      );
      totalBytes += parseInt(r.rows[0]?.size || '0', 10);
    }
    if (totalBytes === 0) {
      const r = await client.query<{ size: string }>(
        'SELECT pg_database_size(current_database())::text AS size',
      );
      totalBytes = parseInt(r.rows[0]?.size || '0', 10);
    }
    const storage_mb = Number((totalBytes / (1024 * 1024)).toFixed(2));

    // Index health using pg_stat_user_indexes
    const index_health = await checkIndexHealth(client);

    // Performance: derive from queries table if present; otherwise defaults
    let avg_search_ms = 0;
    let avg_insert_ms = 0; // not readily available; leave as 0
    let cache_hit_rate = 0; // requires external cache metrics; 0 as default
    if (await tableExists(client, 'queries')) {
      const q = workspace
        ? "SELECT AVG(execution_time_ms)::text AS avg_ms FROM queries WHERE metadata->>'workspace' = $1"
        : 'SELECT AVG(execution_time_ms)::text AS avg_ms FROM queries';
      const r = await client.query<{ avg_ms: string | null }>(q, chunksParams);
      avg_search_ms = r.rows[0]?.avg_ms ? parseFloat(r.rows[0].avg_ms) : 0;
    }

    return {
      documents,
      chunks,
      sources,
      storage_mb,
      index_health,
      performance: {
        avg_search_ms,
        avg_insert_ms,
        cache_hit_rate,
      },
    };
  } finally {
    client.release();
  }
}

export interface CleanupOptions {
  dryRun?: boolean;
  batchSize?: number;
}

export interface CleanupResult {
  orphaned_chunks: number; // rows in chunks_cache without a source
  orphaned_embeddings: number; // embeddings without a valid source
  cleaned: boolean;
  details: string[];
}

export async function cleanupOrphaned(
  pool: Pool,
  options: CleanupOptions = { dryRun: false, batchSize: 100 },
): Promise<CleanupResult> {
  const client = await pool.connect();
  const details: string[] = [];
  const batchSize = options.batchSize ?? 100;

  try {
    await client.query('BEGIN');

    // Orphaned embeddings (should be rare due to FK)
    const orphanedEmbeddingsRes = await client.query<{ id: string }>(
      `SELECT e.id::text AS id
       FROM embeddings e
       LEFT JOIN sources s ON e.source_id = s.id
       WHERE s.id IS NULL
       LIMIT $1`,
      [batchSize],
    );
    const orphanedEmbeddings = orphanedEmbeddingsRes.rows.map((r) => r.id);
    details.push(`Found ${orphanedEmbeddings.length} orphaned embeddings`);

    // Orphaned cached chunks (if table exists)
    let orphanedChunks: string[] = [];
    if (await tableExists(client, 'chunks_cache')) {
      const orphanedChunksRes = await client.query<{ id: string }>(
        `SELECT c.id::text AS id
         FROM chunks_cache c
         LEFT JOIN sources s ON c.source_id = s.id
         WHERE s.id IS NULL
         LIMIT $1`,
        [batchSize],
      );
      orphanedChunks = orphanedChunksRes.rows.map((r) => r.id);
      details.push(`Found ${orphanedChunks.length} orphaned cached chunks`);
    }

    if (!options.dryRun) {
      if (orphanedChunks.length > 0) {
        await client.query('DELETE FROM chunks_cache WHERE id = ANY($1::uuid[])', [orphanedChunks]);
        details.push(`Deleted ${orphanedChunks.length} orphaned cached chunks`);
      }
      if (orphanedEmbeddings.length > 0) {
        await client.query('DELETE FROM embeddings WHERE id = ANY($1::uuid[])', [orphanedEmbeddings]);
        details.push(`Deleted ${orphanedEmbeddings.length} orphaned embeddings`);
      }

      // Optional: clean up expired cache if function exists
      if (await functionExists(client, 'cleanup_expired_cache')) {
        const r = await client.query<{ cleanup_expired_cache: number }>('SELECT cleanup_expired_cache()');
        details.push(`Expired cache rows cleaned: ${r.rows[0]?.cleanup_expired_cache ?? 0}`);
      }

      await client.query('COMMIT');
    } else {
      await client.query('ROLLBACK');
      details.push('Dry run - no changes made');
    }

    return {
      orphaned_chunks: orphanedChunks.length,
      orphaned_embeddings: orphanedEmbeddings.length,
      cleaned: !options.dryRun,
      details,
    };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw new Error(`Cleanup failed: ${err?.message || String(err)}`);
  } finally {
    client.release();
  }
}

async function checkIndexHealth(client: PoolClient): Promise<IndexHealth> {
  const res = await client.query(
    `SELECT idx_scan FROM pg_stat_user_indexes WHERE schemaname = 'public'`,
  );
  const total = res.rowCount || 0;
  const unused = res.rows.filter((r: any) => {
    const v = typeof r.idx_scan === 'string' ? parseInt(r.idx_scan, 10) : r.idx_scan;
    return !v || v === 0;
  }).length;
  if (total === 0) return 'healthy';
  if (unused > total * 0.5) return 'critical';
  if (unused > total * 0.2) return 'degraded';
  return 'healthy';
}

async function tableExists(client: PoolClient, table: string): Promise<boolean> {
  const r = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [table],
  );
  return !!r.rows[0]?.exists;
}

async function functionExists(client: PoolClient, fnName: string): Promise<boolean> {
  const r = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = $1
     ) AS exists`,
    [fnName],
  );
  return !!r.rows[0]?.exists;
}
