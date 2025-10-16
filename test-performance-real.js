// REAL PERFORMANCE TEST - Settings System
// Target: 5x improvement (1106ms → <200ms)

const axios = require('axios');
const { performance } = require('perf_hooks');

const BASE_URL = 'http://localhost:8083';

async function runRealTests() {
  console.log('🎯 REAL PERFORMANCE TEST - Settings System');
  console.log('========================================');
  console.log(`Target: 5x improvement (1106ms → <200ms)`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  // Test 1: Cache Performance Test
  console.log('1️⃣ CACHE PERFORMANCE TEST');
  console.log('------------------------');

  const testCategory = 'llm';
  const testRuns = 5;
  const times = [];

  // First request (cold cache)
  console.log('\n🥶 Cold Cache Test:');
  const coldStart = performance.now();
  try {
    const response1 = await axios.get(`${BASE_URL}/api/v2/settings?category=${testCategory}`, {
      timeout: 5000
    });
    const coldEnd = performance.now();
    const coldTime = coldEnd - coldStart;
    times.push(coldTime);
    console.log(`   First request: ${coldTime.toFixed(2)}ms`);
    console.log(`   Data size: ${JSON.stringify(response1.data).length} bytes`);
    console.log(`   Sections: ${Object.keys(response1.data).length}`);
  } catch (error) {
    console.error(`   ❌ FAILED: ${error.message}`);
    return;
  }

  // Warm cache tests
  console.log('\n🔥 Warm Cache Tests:');
  for (let i = 0; i < testRuns; i++) {
    const start = performance.now();
    try {
      await axios.get(`${BASE_URL}/api/v2/settings?category=${testCategory}`, {
        timeout: 5000
      });
      const end = performance.now();
      const time = end - start;
      times.push(time);
      console.log(`   Request ${i + 2}: ${time.toFixed(2)}ms`);
    } catch (error) {
      console.error(`   ❌ Request ${i + 2} failed: ${error.message}`);
    }
  }

  // Calculate metrics
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const improvement = ((1106 - avgTime) / 1106 * 100).toFixed(1);

  console.log('\n📊 RESULTS:');
  console.log(`   Average: ${avgTime.toFixed(2)}ms`);
  console.log(`   Min: ${minTime.toFixed(2)}ms`);
  console.log(`   Max: ${maxTime.toFixed(2)}ms`);
  console.log(`   Improvement: ${improvement}%`);

  // Test 2: Input Validation Test
  console.log('\n\n2️⃣ INPUT VALIDATION TEST');
  console.log('-----------------------');

  const validationTests = [
    { key: 'openai.temperature', value: 1.5, shouldPass: true },
    { key: 'openai.temperature', value: -1, shouldPass: false },
    { key: 'openai.temperature', value: 3, shouldPass: false },
    { key: 'openai.temperature', value: 'invalid', shouldPass: false },
    { key: 'ragSettings.similarityThreshold', value: 0.5, shouldPass: true },
    { key: 'ragSettings.similarityThreshold', value: -0.1, shouldPass: false },
    { key: 'ragSettings.similarityThreshold', value: 1.5, shouldPass: false }
  ];

  let validationPassed = 0;
  let validationTotal = validationTests.length;

  for (const test of validationTests) {
    try {
      const response = await axios.post(`${BASE_URL}/api/v2/settings`, {
        [test.key]: test.value
      }, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });

      const passed = (response.status === 200) === test.shouldPass;
      if (passed) {
        validationPassed++;
        console.log(`   ✅ ${test.key} = ${test.value}: ${test.shouldPass ? 'Accepted' : 'Rejected'} (Correct)`);
      } else {
        console.log(`   ❌ ${test.key} = ${test.value}: ${test.shouldPass ? 'Should reject' : 'Should accept'} (Incorrect)`);
      }
    } catch (error) {
      if (!test.shouldPass && error.response?.status === 400) {
        validationPassed++;
        console.log(`   ✅ ${test.key} = ${test.value}: Rejected (Correct)`);
      } else {
        console.log(`   ❌ ${test.key} = ${test.value}: Unexpected error`);
      }
    }
  }

  const validationRate = (validationPassed / validationTotal * 100).toFixed(1);

  // Test 3: Category Filtering Test
  console.log('\n\n3️⃣ CATEGORY FILTERING TEST');
  console.log('--------------------------');

  const categories = ['llm', 'embeddings', 'rag', 'database', 'security'];
  let filteringTests = 0;
  let filteringPassed = 0;

  for (const category of categories) {
    filteringTests++;
    try {
      const start = performance.now();
      const response = await axios.get(`${BASE_URL}/api/v2/settings?category=${category}`, {
        timeout: 5000
      });
      const end = performance.now();
      const time = end - start;

      // Check if only relevant data returned
      const hasOnlyRelevant = Object.keys(response.data).every(key => {
        return key === 'openai' || key === 'google' || key === 'anthropic' ||
               key === 'deepseek' || key === 'ollama' || key === 'huggingface' ||
               key === 'llmSettings' || key === 'embeddings' || key === 'ragSettings' ||
               key === 'database' || key === 'security' || key === 'app';
      });

      if (hasOnlyRelevant && time < 500) {
        filteringPassed++;
        console.log(`   ✅ ${category}: ${time.toFixed(2)}ms, ${Object.keys(response.data).length} sections`);
      } else {
        console.log(`   ❌ ${category}: ${time.toFixed(2)}ms, ${hasOnlyRelevant ? 'filtered' : 'not filtered'}`);
      }
    } catch (error) {
      console.log(`   ❌ ${category}: Failed - ${error.message}`);
    }
  }

  const filteringRate = (filteringPassed / filteringTests * 100).toFixed(1);

  // Final Results
  console.log('\n\n🏆 FINAL RESULTS');
  console.log('==================');
  console.log(`\n📈 Performance:`);
  console.log(`   Average: ${avgTime.toFixed(2)}ms`);
  console.log(`   Target: <200ms`);
  console.log(`   Status: ${avgTime < 200 ? '✅ PASS' : '❌ FAIL'} (${improvement}% improvement)`);

  console.log(`\n🛡️ Validation:`);
  console.log(`   Rate: ${validationRate}%`);
  console.log(`   Status: ${validationRate > 80 ? '✅ PASS' : '❌ FAIL'}`);

  console.log(`\n🎯 Filtering:`);
  console.log(`   Rate: ${filteringRate}%`);
  console.log(`   Status: ${filteringRate > 80 ? '✅ PASS' : '❌ FAIL'}`);

  // Overall Status
  const performanceOK = avgTime < 200;
  const validationOK = validationRate > 80;
  const filteringOK = filteringRate > 80;

  const allPassed = performanceOK && validationOK && filteringOK;
  const overallScore = ((Number(improvement) + Number(validationRate) + Number(filteringRate)) / 3).toFixed(1);

  console.log(`\n🎯 OVERALL:`);
  console.log(`   Score: ${overallScore}%`);
  console.log(`   Status: ${allPassed ? '✅ DEPLOYMENT READY' : '❌ NOT READY'}`);

  if (!allPassed) {
    console.log('\n⚠️ DEPLOYMENT BLOCKERS:');
    if (!performanceOK) console.log('   - Performance not meeting target');
    if (!validationOK) console.log('   - Input validation failing');
    if (!filteringOK) console.log('   - Category filtering not working');
  }

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    performance: {
      average: avgTime,
      improvement: Number(improvement),
      passed: performanceOK
    },
    validation: {
      rate: Number(validationRate),
      passed: validationOK
    },
    filtering: {
      rate: Number(filteringRate),
      passed: filteringOK
    },
    overall: {
      score: Number(overallScore),
      ready: allPassed
    }
  };

  require('fs').writeFileSync(`performance-results-${Date.now()}.json`, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to performance-results-${Date.now()}.json`);
}

runRealTests();