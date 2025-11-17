import { performance } from 'perf_hooks';
import { createClient } from 'redis';
import { Pool } from 'pg';

// Benchmark sonuçları için interface
interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  errors: number;
}

// Cache istatistikleri için interface
interface CacheStats {
  hit_l1: number;
  hit_l2: number;
  miss: number;
  hitRate: number;
}

class SearchBenchmark {
  private redisClient: any;
  private pgPool: Pool;
  private latencies: number[] = [];

  constructor() {
    // Redis bağlantısı
    this.redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        connectTimeout: 5000,
      },
    });

    // PostgreSQL bağlantısı
    this.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/alice_db',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Hata dinleyicileri
    this.redisClient.on('error', (err: Error) => {
      console.error('Redis error:', err);
    });

    this.pgPool.on('error', (err: Error) => {
      console.error('PostgreSQL error:', err);
    });
  }

  // Bağlantıları başlat
  async initialize() {
    try {
      await this.redisClient.connect();
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.warn('⚠️  Redis connection failed, continuing without cache');
      this.redisClient = null;
    }

    try {
      await this.pgPool.connect();
      console.log('✅ PostgreSQL connected successfully');
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error);
      throw error;
    }
  }

  // Gecikme ekleme yardımcı fonksiyonu
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Latency ölçümlerini hesapla
  private calculateLatencies(): { avg: number; p95: number; p99: number } {
    if (this.latencies.length === 0) {
      return { avg: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const avg = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      avg: Number(avg.toFixed(2)),
      p95: sorted[p95Index],
      p99: sorted[p99Index],
    };
  }

  // Cache'i ısıtma (warmup)
  async warmupCache(iterations: number = 10): Promise<void> {
    console.log('🔥 Warming up cache...');
    const warmupQueries = [
      'ai', 'machine', 'learning', 'deep', 'neural', 'network'
    ];

    for (let i = 0; i < iterations; i++) {
      const query = warmupQueries[i % warmupQueries.length];
      try {
        await this.simulateSearch(query);
        await this.delay(50);
      } catch (error) {
        // Isınma sırasında hataları yoksay
      }
    }
    console.log('✅ Cache warmup completed');
  }

  // Arama simülasyonu (gerçek arama mantığını taklit eder)
  private async simulateSearch(query: string): Promise<any[]> {
    const start = performance.now();
    
    // Gerçek arama mantığı buraya gelecek
    // Şimdilik basit bir simülasyon
    await this.delay(10 + Math.random() * 40); // 10-50ms arası gecikme
    
    const results = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      title: `${query} result ${i + 1}`,
      content: `This is a sample result for ${query}`,
      score: 0.9 - (i * 0.1)
    }));

    const duration = performance.now() - start;
    this.latencies.push(duration);

    return results;
  }

  // Cache operasyonlarını benchmark et
  async benchmarkCacheOperations(iterations: number = 100): Promise<BenchmarkResult> {
    console.log(`\n🔧 Benchmarking cache operations (${iterations} iterations)...`);
    
    this.latencies = [];
    let errors = 0;

    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      try {
        const key = `benchmark:key:${i}`;
        const value = { data: `value${i}`, timestamp: Date.now() };

        const opStart = performance.now();
        
        if (this.redisClient) {
          await this.redisClient.set(key, JSON.stringify(value), {
            EX: 60, // 60 saniye TTL
          });
          
          const retrieved = await this.redisClient.get(key);
          if (retrieved) {
            JSON.parse(retrieved);
          }
        }

        const duration = performance.now() - opStart;
        this.latencies.push(duration);

        await this.delay(5); // Küçük bir gecikme

      } catch (error) {
        errors++;
        console.warn(`Cache operation error: ${error.message}`);
      }
    }

    const totalTime = performance.now() - startTime;
    const { avg, p95, p99 } = this.calculateLatencies();
    const throughput = iterations / (totalTime / 1000);

    return {
      name: 'Cache Operations',
      iterations,
      totalTime,
      avgLatency: avg,
      p95Latency: p95,
      p99Latency: p99,
      throughput: Number(throughput.toFixed(2)),
      errors,
    };
  }

  // Arama benchmark'ı
  async benchmarkSearch(query: string, iterations: number = 50, useCache: boolean = true): Promise<BenchmarkResult> {
    console.log(`\n🔍 Benchmarking search: "${query}" (${iterations} iterations)...`);
    
    this.latencies = [];
    let errors = 0;

    const startTime = performance.now();

    for (let i = 0; i < iterations; i++) {
      try {
        await this.simulateSearch(query);
        
        // Rastgele varyasyon için küçük gecikme
        await this.delay(10 + Math.random() * 20);

      } catch (error) {
        errors++;
        console.warn(`Search error: ${error.message}`);
      }
    }

    const totalTime = performance.now() - startTime;
    const { avg, p95, p99 } = this.calculateLatencies();
    const throughput = iterations / (totalTime / 1000);

    return {
      name: `Search: ${query}`,
      iterations,
      totalTime,
      avgLatency: avg,
      p95Latency: p95,
      p99Latency: p99,
      throughput: Number(throughput.toFixed(2)),
      errors,
    };
  }

  // Sonuçları yazdır
  printResults(results: BenchmarkResult[]): void {
    console.log('\n' + '=' .repeat(80));
    console.log('📊 BENCHMARK RESULTS');
    console.log('=' .repeat(80));
    
    results.forEach(result => {
      console.log(`\n${result.name}:`);
      console.log(`  Iterations: ${result.iterations}`);
      console.log(`  Total Time: ${result.totalTime.toFixed(2)}ms`);
      console.log(`  Avg Latency: ${result.avgLatency}ms`);
      console.log(`  P95 Latency: ${result.p95Latency}ms`);
      console.log(`  P99 Latency: ${result.p99Latency}ms`);
      console.log(`  Throughput: ${result.throughput} ops/sec`);
      console.log(`  Errors: ${result.errors}`);
    });

    // Genel istatistikler
    const totalIterations = results.reduce((sum, r) => sum + r.iterations, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);
    const avgLatency = results.reduce((sum, r) => sum + r.avgLatency, 0) / results.length;

    console.log('\n' + '-' .repeat(40));
    console.log('📈 OVERALL STATISTICS:');
    console.log(`  Total Iterations: ${totalIterations}`);
    console.log(`  Total Errors: ${totalErrors}`);
    console.log(`  Average Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`  Error Rate: ${((totalErrors / totalIterations) * 100).toFixed(2)}%`);
  }

  // Kapsamlı benchmark çalıştır
  async runComprehensiveBenchmark(): Promise<void> {
    console.log('🎯 Starting Alice Semantic Bridge Comprehensive Benchmark');
    console.log('=' .repeat(60));
    
    const startTime = performance.now();
    
    try {
      // Sistemi ısıt
      await this.warmupCache(20);
      
      const results: BenchmarkResult[] = [];
      
      // Farklı arama senaryolarını benchmark et
      const searchQueries = [
        'artificial intelligence',
        'machine learning applications',
        'deep neural networks',
        'natural language processing techniques'
      ];
      
      for (const query of searchQueries) {
        const result = await this.benchmarkSearch(query, 50, true);
        results.push(result);
        await this.delay(1000); // Test grupları arasında soğuma
      }
      
      // Cache operasyonlarını benchmark et
      const cacheResult = await this.benchmarkCacheOperations(500);
      results.push(cacheResult);
      
      const totalTime = performance.now() - startTime;
      
      this.printResults(results);
      
      console.log(`\n⏱️  Total Benchmark Time: ${(totalTime / 1000).toFixed(2)}s`);
      console.log('✅ Benchmark completed successfully!');
      
    } catch (error) {
      console.error('❌ Benchmark failed:', error);
      process.exit(1);
    }
  }

  // Bağlantıları kapat
  async cleanup(): Promise<void> {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      await this.pgPool.end();
      console.log('✅ Connections closed successfully');
    } catch (error) {
      console.warn('Warning during cleanup:', error);
    }
  }
}

// Ana çalıştırma fonksiyonu
async function main() {
  const benchmark = new SearchBenchmark();
  
  // Komut satırı argümanlarını parse et
  const args = process.argv.slice(2);
  const iterations = args[0] ? parseInt(args[0]) : 50;
  const query = args[1] || 'artificial intelligence';
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: ts-node bench-search.ts [iterations] [query]

Options:
  iterations    Number of iterations (default: 50)
  query         Search query to benchmark (default: "artificial intelligence")
  --help, -h    Show this help message
  --comprehensive, -c  Run comprehensive benchmark

Examples:
  ts-node bench-search.ts 100 "machine learning"
  ts-node bench-search.ts 200
  ts-node bench-search.ts --comprehensive
    `);
    process.exit(0);
  }
  
  try {
    await benchmark.initialize();
    
    if (args.includes('--comprehensive') || args.includes('-c')) {
      await benchmark.runComprehensiveBenchmark();
    } else {
      const result = await benchmark.benchmarkSearch(query, iterations);
      benchmark.printResults([result]);
    }
  } catch (error) {
    console.error('❌ Failed to initialize benchmark:', error);
    process.exit(1);
  } finally {
    await benchmark.cleanup();
  }
}

// Yakalanmamış hataları işle
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Benchmark'ı çalıştır
if (require.main === module) {
  main().catch(error => {
    console.error('Benchmark execution failed:', error);
    process.exit(1);
  });
}

export { SearchBenchmark };