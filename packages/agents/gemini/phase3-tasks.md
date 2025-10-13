# Gemini - Phase 3 Tasks: Performance & Optimization

## 🎯 Your Mission
Optimize search performance, implement hybrid search, and establish caching strategies to meet aggressive performance targets.

## 📋 Priority Tasks

### 1. Analyze Current Search Performance (HIGH)
**File:** `src/nodes/operations/search.ts`

Profile the existing search implementation:

```typescript
// Add performance monitoring
export async function measureSearchPerformance() {
  const metrics = {
    query_parse_time: 0,
    embedding_time: 0,
    db_query_time: 0,
    result_processing_time: 0,
    total_time: 0
  };
  
  const start = performance.now();
  
  // Measure each phase
  // ... implementation
  
  return metrics;
}
```

### 2. Implement Hybrid Search Algorithm (HIGH)
**File:** `src/nodes/operations/hybrid-search.ts`

Combine multiple search strategies:

```typescript
export class HybridSearch {
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    // Parallel search execution
    const [vectorResults, keywordResults, fuzzyResults] = await Promise.all([
      this.vectorSearch(query, options),
      this.keywordSearch(query, options),
      this.fuzzySearch(query, options)
    ]);
    
    // Merge and rank results
    return this.rankResults(vectorResults, keywordResults, fuzzyResults, options.weights);
  }
  
  private rankResults(
    vector: SearchResult[],
    keyword: SearchResult[],
    fuzzy: SearchResult[],
    weights: SearchWeights
  ): SearchResult[] {
    // RRF (Reciprocal Rank Fusion) algorithm
    const scores = new Map<string, number>();
    
    // Calculate weighted scores
    vector.forEach((r, i) => {
      const score = weights.vector * (1 / (i + 60));
      scores.set(r.id, (scores.get(r.id) || 0) + score);
    });
    
    keyword.forEach((r, i) => {
      const score = weights.keyword * (1 / (i + 60));
      scores.set(r.id, (scores.get(r.id) || 0) + score);
    });
    
    // Sort by final score
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => ({ id, score }));
  }
}
```

### 3. Design Caching Strategy (HIGH)
**File:** `src/shared/cache-strategy.ts`

Implement intelligent caching:

```typescript
export class CacheStrategy {
  // Cache key generation
  generateKey(operation: string, params: any): string {
    const normalized = this.normalizeParams(params);
    const hash = crypto.createHash('md5')
      .update(JSON.stringify(normalized))
      .digest('hex');
    return `lsemb:${operation}:${hash}`;
  }
  
  // Smart invalidation
  async invalidate(pattern: InvalidationPattern): Promise<void> {
    switch (pattern.type) {
      case 'document_update':
        // Invalidate related searches
        await this.invalidateSearches(pattern.documentId);
        break;
      case 'source_update':
        // Invalidate all caches for source
        await this.invalidateSource(pattern.sourceId);
        break;
      case 'ttl_expired':
        // Clean expired entries
        await this.cleanExpired();
        break;
    }
  }
  
  // Cache warming
  async warmCache(popular: string[]): Promise<void> {
    for (const query of popular) {
      await this.precomputeAndCache(query);
    }
  }
}
```

### 4. Optimize SQL Queries (HIGH)
**File:** `src/shared/query-optimizer.ts`

SQL optimization techniques:

```typescript
export class QueryOptimizer {
  // Query analysis
  async analyzeQuery(sql: string): Promise<QueryPlan> {
    const explained = await db.query(`EXPLAIN ANALYZE ${sql}`);
    return this.parseExplainOutput(explained);
  }
  
  // Optimized search query with CTEs
  buildOptimizedSearchQuery(params: SearchParams): string {
    return `
      WITH ranked_chunks AS (
        SELECT 
          c.id,
          c.content,
          c.metadata,
          1 - (c.embedding <=> $1::vector) as similarity,
          ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $2)) as text_rank
        FROM chunks c
        WHERE 
          c.source_id = ANY($3::text[])
          AND c.created_at > $4
        ORDER BY similarity DESC
        LIMIT $5 * 2  -- Fetch extra for re-ranking
      ),
      reranked AS (
        SELECT 
          *,
          (0.7 * similarity + 0.3 * text_rank) as final_score
        FROM ranked_chunks
        WHERE similarity > 0.5 OR text_rank > 0.1
      )
      SELECT * FROM reranked
      ORDER BY final_score DESC
      LIMIT $5;
    `;
  }
  
  // Batch query optimization
  buildBatchInsert(documents: Document[]): string {
    const values = documents.map((d, i) => 
      `($${i*4+1}, $${i*4+2}, $${i*4+3}, $${i*4+4})`
    ).join(',');
    
    return `
      INSERT INTO documents (id, content, embedding, metadata)
      VALUES ${values}
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id;
    `;
  }
}
```

### 5. Performance Monitoring Dashboard (MEDIUM)
**File:** `src/monitoring/performance.ts`

Real-time performance tracking:

```typescript
export class PerformanceMonitor {
  private metrics: Map<string, Metric> = new Map();
  
  // Track operation performance
  async track<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = performance.now();
    const memory = process.memoryUsage();
    
    try {
      const result = await fn();
      const duration = performance.now() - start;
      const memoryDelta = process.memoryUsage().heapUsed - memory.heapUsed;
      
      this.recordMetric(operation, {
        duration,
        memoryDelta,
        success: true,
        timestamp: Date.now()
      });
      
      return result;
    } catch (error) {
      this.recordMetric(operation, {
        duration: performance.now() - start,
        success: false,
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }
  
  // Get performance report
  getReport(): PerformanceReport {
    const report: PerformanceReport = {};
    
    this.metrics.forEach((metrics, operation) => {
      const durations = metrics.map(m => m.duration);
      report[operation] = {
        count: metrics.length,
        avg: this.average(durations),
        p50: this.percentile(durations, 50),
        p95: this.percentile(durations, 95),
        p99: this.percentile(durations, 99),
        errors: metrics.filter(m => !m.success).length
      };
    });
    
    return report;
  }
}
```

## 📊 Performance Optimization Strategies

### 1. Database Optimizations
```sql
-- Add specialized indexes
CREATE INDEX idx_chunks_content_gin ON chunks USING gin(to_tsvector('english', content));
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_l2_ops);

-- Optimize vector index parameters
ALTER INDEX idx_embeddings_vector SET (lists = 100);

-- Add materialized view for common queries
CREATE MATERIALIZED VIEW search_cache AS
SELECT 
  c.id,
  c.content,
  c.embedding,
  c.metadata,
  array_agg(DISTINCT t.tag) as tags
FROM chunks c
LEFT JOIN chunk_tags t ON c.id = t.chunk_id
GROUP BY c.id;

CREATE INDEX idx_search_cache_embedding ON search_cache USING ivfflat (embedding vector_l2_ops);
```

### 2. Query Optimization Patterns
```typescript
// Use prepared statements
const preparedQueries = {
  search: db.prepare('search_by_vector', searchQuery),
  insert: db.prepare('insert_chunk', insertQuery),
  delete: db.prepare('delete_by_source', deleteQuery)
};

// Implement query batching
class QueryBatcher {
  private batch: Query[] = [];
  private timer: NodeJS.Timeout;
  
  add(query: Query): Promise<Result> {
    return new Promise((resolve, reject) => {
      this.batch.push({ query, resolve, reject });
      
      if (this.batch.length >= 100) {
        this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), 10);
      }
    });
  }
  
  private async flush() {
    const batch = this.batch;
    this.batch = [];
    clearTimeout(this.timer);
    
    const results = await db.batchQuery(batch.map(b => b.query));
    batch.forEach((b, i) => b.resolve(results[i]));
  }
}
```

### 3. Caching Layers
```typescript
// Multi-level cache
class MultiLevelCache {
  private l1: Map<string, any> = new Map(); // Memory
  private l2: Redis;                        // Redis
  private l3: PostgreSQL;                   // Database
  
  async get(key: string): Promise<any> {
    // Check L1 (fastest)
    if (this.l1.has(key)) {
      return this.l1.get(key);
    }
    
    // Check L2
    const l2Value = await this.l2.get(key);
    if (l2Value) {
      this.l1.set(key, l2Value);
      return l2Value;
    }
    
    // Fall back to L3
    const l3Value = await this.l3.get(key);
    if (l3Value) {
      await this.l2.setex(key, 3600, l3Value);
      this.l1.set(key, l3Value);
      return l3Value;
    }
    
    return null;
  }
}
```

## 🎯 Performance Targets

### Achieve These Metrics:
| Operation | Current | Target | Strategy |
|-----------|---------|--------|----------|
| Search Latency | 150ms | 50ms | Caching + Query Optimization |
| Insert Throughput | 100/s | 500/s | Batching + Prepared Statements |
| Query Throughput | 10 qps | 100 qps | Connection Pooling + Caching |
| Cache Hit Rate | 0% | 60% | Smart Invalidation |
| Memory Usage | 250MB | 200MB | Streaming + Cleanup |

## 🔧 Implementation Checklist

### Database Level:
- [ ] Add missing indexes
- [ ] Optimize existing indexes
- [ ] Implement partitioning for large tables
- [ ] Configure connection pooling
- [ ] Add query result caching

### Application Level:
- [ ] Implement prepared statements
- [ ] Add query batching
- [ ] Use streaming for large results
- [ ] Implement circuit breakers
- [ ] Add request deduplication

### Cache Level:
- [ ] Implement Redis caching
- [ ] Add memory cache (LRU)
- [ ] Design invalidation strategy
- [ ] Implement cache warming
- [ ] Add cache statistics

## 📈 Benchmarking Suite

Create comprehensive benchmarks:

```typescript
// benchmark/search.bench.ts
export class SearchBenchmark {
  async run() {
    const scenarios = [
      { name: 'Simple Query', query: 'test', expected_ms: 50 },
      { name: 'Complex Query', query: 'test AND category:docs', expected_ms: 75 },
      { name: 'Vector Search', query: 'similar to X', expected_ms: 100 },
      { name: 'Hybrid Search', query: 'test', mode: 'hybrid', expected_ms: 80 }
    ];
    
    for (const scenario of scenarios) {
      const results = await this.runScenario(scenario);
      this.reportResults(scenario, results);
    }
  }
}
```

## 🔗 Coordination Points

### With Claude:
- Review caching architecture
- Align on error handling for performance issues
- Validate connection pooling configuration

### With Codex:
- Optimize database queries together
- Coordinate on batch processing
- Implement streaming endpoints

### With DeepSeek:
- Create performance test suite
- Document optimization results
- Benchmark against targets

## 📅 Timeline

### Day 1-2:
- [ ] Performance analysis
- [ ] Identify bottlenecks
- [ ] Create optimization plan

### Day 3-4:
- [ ] Implement hybrid search
- [ ] Add caching layer
- [ ] Optimize SQL queries

### Day 5:
- [ ] Benchmark improvements
- [ ] Document results
- [ ] Plan next optimizations

## 💡 Optimization Tips

1. **Profile First**: Never optimize without data
2. **Cache Wisely**: Not everything needs caching
3. **Batch Operations**: Reduce round trips
4. **Use Indexes**: But don't over-index
5. **Monitor Always**: Track performance metrics

Remember: Every millisecond counts. Focus on the critical path first, optimize the hot spots, and always measure the impact.