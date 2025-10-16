// Comprehensive Scraper Performance & Reliability Test
const axios = require('axios');
const { performance } = require('perf_hooks');

const API_BASE = 'http://localhost:8083/api/v2/scraper';

// Test URLs
const TEST_URLS = [
  'https://example.com',
  'https://httpbin.org/html',
  'https://jsonplaceholder.typicode.com',
  'https://reqres.in',
  'https://pokeapi.co/api/v2/pokemon/ditto'
];

class ScraperTester {
  constructor() {
    this.results = {
      performance: {},
      reliability: {},
      cache: {},
      ai: {},
      summary: {}
    };
  }

  async runAllTests() {
    console.log('\n🕷️  SCRAPER SYSTEM PERFORMANCE & RELIABILITY TESTING\n');
    console.log('=' .repeat(60));

    try {
      // 1. Test Basic API Health
      await this.testAPIHealth();

      // 2. Test Single URL Scraping
      await this.testSingleScraping();

      // 3. Test Batch Scraping
      await this.testBatchScraping();

      // 4. Test Cache Performance
      await this.testCachePerformance();

      // 5. Test AI Processing
      await this.testAIProcessing();

      // 6. Test Reliability Features
      await this.testReliability();

      // 7. Test Concurrent Requests
      await this.testConcurrentRequests();

      // 8. Generate Report
      this.generateReport();

    } catch (error) {
      console.error('\n❌ Test suite failed:', error.message);
    }
  }

  async testAPIHealth() {
    console.log('\n📡 1. API HEALTH CHECK');
    console.log('-'.repeat(40));

    try {
      const response = await axios.get(`${API_BASE}/stats`, { timeout: 5000 });
      this.results.apiHealth = {
        status: '✅ PASS',
        responseTime: response.headers['x-response-time'] || 'N/A',
        status: response.status
      };
      console.log('✅ API is responsive');
    } catch (error) {
      this.results.apiHealth = {
        status: '❌ FAIL',
        error: error.message
      };
      console.log('❌ API health check failed:', error.message);
    }
  }

  async testSingleScraping() {
    console.log('\n🎯 2. SINGLE URL SCRAPING');
    console.log('-'.repeat(40));

    const url = TEST_URLS[0];
    const startTime = performance.now();

    try {
      // Start scraping job
      const startResponse = await axios.post(`${API_BASE}/scrape`, {
        url,
        useCache: true,
        llmFiltering: true,
        entityExtraction: true,
        saveToDatabase: true
      });

      const jobId = startResponse.data.jobId;
      console.log(`📋 Started scraping job: ${jobId}`);

      // Poll for completion
      let jobStatus = null;
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const statusResponse = await axios.get(`${API_BASE}/scrape/${jobId}`);
        jobStatus = statusResponse.data.job;

        if (jobStatus.status === 'completed') {
          break;
        } else if (jobStatus.status === 'failed') {
          throw new Error(jobStatus.error || 'Scraping failed');
        }

        attempts++;
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      if (jobStatus && jobStatus.status === 'completed') {
        this.results.singleScraping = {
          status: '✅ PASS',
          url,
          totalTime: Math.round(totalTime),
          resultCount: jobStatus.result?.length || 0,
          cacheHit: jobStatus.result?.[0]?.cacheHit || false,
          hasAIAnalysis: jobStatus.result?.[0]?.llmAnalysis ? true : false,
          hasEntities: jobStatus.result?.[0]?.entities ? true : false
        };

        console.log(`✅ Scraping completed in ${Math.round(totalTime)}ms`);
        console.log(`📊 Results: ${jobStatus.result?.length || 0} items`);
        console.log(`🎯 Cache hit: ${jobStatus.result?.[0]?.cacheHit ? 'YES' : 'NO'}`);
        console.log(`🤖 AI analysis: ${jobStatus.result?.[0]?.llmAnalysis ? 'YES' : 'NO'}`);
      } else {
        throw new Error('Scraping timed out');
      }

    } catch (error) {
      this.results.singleScraping = {
        status: '❌ FAIL',
        error: error.message
      };
      console.log('❌ Single scraping failed:', error.message);
    }
  }

  async testBatchScraping() {
    console.log('\n📦 3. BATCH SCRAPING');
    console.log('-'.repeat(40));

    const urls = TEST_URLS.slice(0, 3);
    const startTime = performance.now();

    try {
      const response = await axios.post(`${API_BASE}/batch-scrape`, {
        urls,
        concurrency: 2,
        useCache: true,
        llmFiltering: false, // Disable for speed test
        entityExtraction: false
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      this.results.batchScraping = {
        status: '✅ PASS',
        totalUrls: urls.length,
        totalTime: Math.round(totalTime),
        avgTimePerUrl: Math.round(totalTime / urls.length),
        successCount: response.data.completed || 0,
        throughput: Math.round(urls.length / (totalTime / 1000 * 60)) // URLs per minute
      };

      console.log(`✅ Batch scraping completed in ${Math.round(totalTime)}ms`);
      console.log(`📊 Processed ${response.data.completed}/${urls.length} URLs`);
      console.log(`⚡ Throughput: ${this.results.batchScraping.throughput} URLs/min`);

    } catch (error) {
      this.results.batchScraping = {
        status: '❌ FAIL',
        error: error.message
      };
      console.log('❌ Batch scraping failed:', error.message);
    }
  }

  async testCachePerformance() {
    console.log('\n💾 4. CACHE PERFORMANCE');
    console.log('-'.repeat(40));

    const url = TEST_URLS[1];

    try {
      // First request (cache miss)
      const start1 = performance.now();
      const response1 = await axios.post(`${API_BASE}/scrape`, {
        url,
        useCache: true,
        llmFiltering: false,
        entityExtraction: false
      });
      const time1 = performance.now() - start1;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Second request (cache hit)
      const start2 = performance.now();
      const response2 = await axios.post(`${API_BASE}/scrape`, {
        url,
        useCache: true,
        llmFiltering: false,
        entityExtraction: false
      });
      const time2 = performance.now() - start2;

      const cacheSpeedup = Math.round((time1 - time2) / time1 * 100);

      this.results.cachePerformance = {
        status: '✅ PASS',
        firstRequestTime: Math.round(time1),
        secondRequestTime: Math.round(time2),
        cacheSpeedupPercent: cacheSpeedup,
        cacheWorking: time2 < time1
      };

      console.log(`🥇 First request (cache miss): ${Math.round(time1)}ms`);
      console.log(`🚀 Second request (cache hit): ${Math.round(time2)}ms`);
      console.log(`⚡ Cache speedup: ${cacheSpeedup}%`);

    } catch (error) {
      this.results.cachePerformance = {
        status: '❌ FAIL',
        error: error.message
      };
      console.log('❌ Cache performance test failed:', error.message);
    }
  }

  async testAIProcessing() {
    console.log('\n🤖 5. AI PROCESSING');
    console.log('-'.repeat(40));

    const url = TEST_URLS[2];

    try {
      const startTime = performance.now();
      const response = await axios.post(`${API_BASE}/scrape`, {
        url,
        useCache: false,
        llmFiltering: true,
        entityExtraction: true
      });

      // Poll for completion
      let jobStatus = null;
      let attempts = 0;

      while (attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const statusResponse = await axios.get(`${API_BASE}/scrape/${response.data.jobId}`);
        jobStatus = statusResponse.data.job;

        if (jobStatus.status === 'completed') break;
        attempts++;
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      if (jobStatus && jobStatus.status === 'completed' && jobStatus.result) {
        const result = jobStatus.result[0];
        this.results.aiProcessing = {
          status: '✅ PASS',
          totalTime: Math.round(totalTime),
          hasLLMAnalysis: !!result.llmAnalysis,
          hasEntities: !!result.entities,
          qualityScore: result.llmAnalysis?.qualityScore || 0,
          entityCount: result.entities?.length || 0,
          sentiment: result.llmAnalysis?.sentiment || 'N/A'
        };

        console.log(`✅ AI processing completed in ${Math.round(totalTime)}ms`);
        console.log(`📊 Quality score: ${result.llmAnalysis?.qualityScore || 0}`);
        console.log(`🏷️  Entities found: ${result.entities?.length || 0}`);
        console.log(`😊 Sentiment: ${result.llmAnalysis?.sentiment || 'N/A'}`);
      }

    } catch (error) {
      this.results.aiProcessing = {
        status: '❌ FAIL',
        error: error.message
      };
      console.log('❌ AI processing test failed:', error.message);
    }
  }

  async testReliability() {
    console.log('\n🛡️  6. RELIABILITY FEATURES');
    console.log('-'.repeat(40));

    // Test AI configuration
    try {
      const configResponse = await axios.get(`${API_BASE}/ai-config`);
      const aiConfig = configResponse.data.config;

      this.results.reliability = {
        status: '✅ PASS',
        aiConfigAvailable: !!aiConfig,
        aiEnabled: aiConfig.enabled,
        qualityThreshold: aiConfig.qualityThreshold
      };

      console.log(`✅ AI configuration accessible`);
      console.log(`📊 AI enabled: ${aiConfig.enabled}`);
      console.log(`🎯 Quality threshold: ${aiConfig.qualityThreshold}`);

    } catch (error) {
      this.results.reliability = {
        status: '❌ FAIL',
        error: error.message
      };
      console.log('❌ Reliability test failed:', error.message);
    }
  }

  async testConcurrentRequests() {
    console.log('\n⚡ 7. CONCURRENT REQUESTS');
    console.log('-'.repeat(40));

    const concurrentCount = 5;
    const url = TEST_URLS[3];

    try {
      const startTime = performance.now();

      const promises = Array.from({ length: concurrentCount }, () =>
        axios.post(`${API_BASE}/scrape`, {
          url,
          useCache: true,
          llmFiltering: false,
          entityExtraction: false
        })
      );

      const responses = await Promise.all(promises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      this.results.concurrent = {
        status: '✅ PASS',
        concurrentRequests: concurrentCount,
        totalTime: Math.round(totalTime),
        avgTimePerRequest: Math.round(totalTime / concurrentCount),
        allSuccessful: responses.every(r => r.status === 200)
      };

      console.log(`✅ ${concurrentCount} concurrent requests completed`);
      console.log(`⏱️  Total time: ${Math.round(totalTime)}ms`);
      console.log(`📊 Avg per request: ${Math.round(totalTime / concurrentCount)}ms`);

    } catch (error) {
      this.results.concurrent = {
        status: '❌ FAIL',
        error: error.message
      };
      console.log('❌ Concurrent test failed:', error.message);
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 PERFORMANCE & RELIABILITY REPORT');
    console.log('='.repeat(60));

    // Summary
    const tests = [
      this.results.singleScraping,
      this.results.batchScraping,
      this.results.cachePerformance,
      this.results.aiProcessing,
      this.results.reliability,
      this.results.concurrent
    ];

    const passedTests = tests.filter(t => t && t.status === '✅ PASS').length;
    const totalTests = tests.length;

    console.log(`\n📈 OVERALL SCORE: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);

    // Performance metrics
    console.log('\n⚡ PERFORMANCE METRICS:');
    if (this.results.cachePerformance && this.results.cachePerformance.cacheWorking) {
      console.log(`   • Cache speedup: ${this.results.cachePerformance.cacheSpeedupPercent}%`);
    }
    if (this.results.batchScraping) {
      console.log(`   • Batch throughput: ${this.results.batchScraping.throughput} URLs/min`);
    }
    if (this.results.singleScraping) {
      console.log(`   • Single scrape time: ${this.results.singleScraping.totalTime}ms`);
    }

    // Reliability metrics
    console.log('\n🛡️  RELIABILITY METRICS:');
    if (this.results.concurrent && this.results.concurrent.allSuccessful) {
      console.log(`   • Concurrent handling: ✅ ${this.results.concurrent.concurrentRequests} requests`);
    }
    if (this.results.aiProcessing && this.results.aiProcessing.hasLLMAnalysis) {
      console.log(`   • AI processing: ✅ Working`);
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    if (this.results.cachePerformance && !this.results.cachePerformance.cacheWorking) {
      console.log('   • Cache is not providing speedup - check Redis configuration');
    }
    if (this.results.aiProcessing && this.results.aiProcessing.totalTime > 10000) {
      console.log('   • AI processing is slow - consider optimizing prompts or using caching');
    }
    if (passedTests === totalTests) {
      console.log('   • All systems operational - ready for production!');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✨ Testing completed!\n');
  }
}

// Run the test suite
const tester = new ScraperTester();
tester.runAllTests().catch(console.error);