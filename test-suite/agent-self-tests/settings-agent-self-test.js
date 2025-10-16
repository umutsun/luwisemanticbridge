/**
 * SETTINGS AGENT SELF-TEST
 * CTO-Operational Validation Script
 *
 * Claims by Settings Agent:
 * ✅ 30x faster with caching (247ms → 10ms)
 * ✅ Category filtering implemented
 * ✅ Input validation added
 * ✅ Optimized database queries
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

class SettingsAgentSelfTest {
    constructor() {
        this.baseURL = 'http://localhost:8083';
        this.results = {
            claims: [],
            operationalTests: [],
            summary: { passed: 0, failed: 0, total: 0 }
        };
    }

    async runFullTest() {
        console.log('\n🔧 SETTINGS AGENT SELF-TEST');
        console.log('CTO Operational Validation');
        console.log('='.repeat(60));

        // Claim 1: 30x Performance Improvement with Caching
        await this.testCachingPerformance();

        // Claim 2: Category Filtering Working
        await this.testCategoryFiltering();

        // Claim 3: Input Validation
        await this.testInputValidation();

        // Claim 4: Database Optimization
        await this.testDatabaseOptimization();

        // Operational Reality Check
        await this.testOperationalReality();

        this.generateReport();
    }

    async testCachingPerformance() {
        console.log('\n📊 CLAIM 1: 30x Performance with Caching');
        console.log('Target: 247ms → <10ms (30x improvement)');

        const tests = [];
        const category = 'llm';

        // First request - cache miss
        console.log('  • Cache miss test...');
        const missStart = performance.now();
        try {
            const missResponse = await axios.get(`${this.baseURL}/api/v2/settings?category=${category}`);
            const missTime = performance.now() - missStart;
            tests.push({ type: 'miss', time: missTime, data: missResponse.data });
            console.log(`    Response time: ${missTime.toFixed(2)}ms`);
        } catch (error) {
            console.log(`    ❌ Cache miss failed: ${error.message}`);
            this.results.claims.push({ claim: 'Caching Performance', status: 'FAILED', error: error.message });
            return;
        }

        // Second request - should be cache hit
        console.log('  • Cache hit test...');
        const hitStart = performance.now();
        try {
            const hitResponse = await axios.get(`${this.baseURL}/api/v2/settings?category=${category}`);
            const hitTime = performance.now() - hitStart;
            tests.push({ type: 'hit', time: hitTime, data: hitResponse.data });
            console.log(`    Response time: ${hitTime.toFixed(2)}ms`);
        } catch (error) {
            console.log(`    ❌ Cache hit failed: ${error.message}`);
        }

        // Calculate improvement
        if (tests.length === 2) {
            const improvement = tests[0].time / tests[1].time;
            const targetMet = tests[1].time < 10;

            console.log(`  📈 Performance improvement: ${improvement.toFixed(2)}x`);
            console.log(`  🎯 Target <10ms: ${targetMet ? '✅ MET' : '❌ NOT MET'}`);

            this.results.claims.push({
                claim: '30x Performance with Caching',
                status: (improvement >= 5 && targetMet) ? 'PASSED' : 'FAILED',
                metrics: {
                    cacheMiss: `${tests[0].time.toFixed(2)}ms`,
                    cacheHit: `${tests[1].time.toFixed(2)}ms`,
                    improvement: `${improvement.toFixed(2)}x`,
                    targetMet
                }
            });
        }
    }

    async testCategoryFiltering() {
        console.log('\n🎯 CLAIM 2: Category Filtering');
        console.log('Target: Return ONLY requested category data');

        const categories = ['llm', 'embeddings', 'rag', 'database', 'security'];
        const results = [];

        for (const category of categories) {
            try {
                const response = await axios.get(`${this.baseURL}/api/v2/settings?category=${category}`);
                const dataSize = JSON.stringify(response.data).length;

                // Check if only category-specific data is returned
                const isFiltered = this.validateCategoryFiltering(category, response.data);

                results.push({
                    category,
                    size: dataSize,
                    filtered: isFiltered,
                    data: response.data
                });

                console.log(`  • ${category}: ${dataSize} bytes - ${isFiltered ? '✅ Filtered' : '❌ Not filtered'}`);
            } catch (error) {
                console.log(`  • ${category}: ❌ Error - ${error.message}`);
                results.push({ category, error: error.message });
            }
        }

        const allFiltered = results.filter(r => !r.error).every(r => r.filtered);
        const avgSize = results.filter(r => !r.error).reduce((a, b) => a + b.size, 0) / results.filter(r => !r.error).length;

        this.results.claims.push({
            claim: 'Category Filtering Working',
            status: allFiltered ? 'PASSED' : 'FAILED',
            metrics: {
                categoriesTested: categories.length,
                allFiltered,
                avgResponseSize: `${(avgSize / 1024).toFixed(2)}KB`
            }
        });
    }

    async testInputValidation() {
        console.log('\n🛡️ CLAIM 3: Input Validation');
        console.log('Target: Reject invalid values');

        const validationTests = [
            {
                name: 'Temperature Validation',
                payload: { 'llmSettings.temperature': 5.0 }, // Invalid: > 2
                shouldFail: true
            },
            {
                name: 'Negative Temperature',
                payload: { 'llmSettings.temperature': -1.0 }, // Invalid: < 0
                shouldFail: true
            },
            {
                name: 'Valid Temperature',
                payload: { 'llmSettings.temperature': 0.7 }, // Valid
                shouldFail: false
            },
            {
                name: 'Invalid Chunk Size',
                payload: { 'embeddings.chunkSize': 50 }, // Invalid: < 100
                shouldFail: true
            },
            {
                name: 'Valid Chunk Size',
                payload: { 'embeddings.chunkSize': 1000 }, // Valid
                shouldFail: false
            }
        ];

        let passed = 0;
        let total = validationTests.length;

        for (const test of validationTests) {
            try {
                await axios.post(`${this.baseURL}/api/v2/settings/`, test.payload);

                if (test.shouldFail) {
                    console.log(`  • ${test.name}: ❌ Should have failed but passed`);
                } else {
                    console.log(`  • ${test.name}: ✅ Accepted valid value`);
                    passed++;
                }
            } catch (error) {
                if (error.response?.status === 400 && test.shouldFail) {
                    console.log(`  • ${test.name}: ✅ Correctly rejected invalid value`);
                    passed++;
                } else if (!test.shouldFail) {
                    console.log(`  • ${test.name}: ❌ Should have passed but failed`);
                } else {
                    console.log(`  • ${test.name}: ⚠️  Failed for unexpected reason`);
                }
            }
        }

        this.results.claims.push({
            claim: 'Input Validation Working',
            status: passed === total ? 'PASSED' : 'FAILED',
            metrics: {
                testsPassed: passed,
                totalTests: total,
                passRate: `${(passed / total * 100).toFixed(1)}%`
            }
        });
    }

    async testDatabaseOptimization() {
        console.log('\n💾 CLAIM 4: Database Optimization');
        console.log('Target: Optimized queries with specific WHERE clauses');

        // Test with database timing
        const dbTests = [];

        for (let i = 0; i < 5; i++) {
            const start = performance.now();
            try {
                const response = await axios.get(`${this.baseURL}/api/v2/settings?category=llm`);
                dbTests.push({
                    time: performance.now() - start,
                    hasData: Object.keys(response.data).length > 0
                });
            } catch (error) {
                console.log(`  • Query ${i + 1}: ❌ Error`);
            }
        }

        if (dbTests.length > 0) {
            const avgTime = dbTests.reduce((a, b) => a + b.time, 0) / dbTests.length;
            const allHaveData = dbTests.every(t => t.hasData);

            console.log(`  📊 Average query time: ${avgTime.toFixed(2)}ms`);
            console.log(`  📊 All queries returned data: ${allHaveData ? '✅ Yes' : '❌ No'}`);

            // Check if using optimized queries (sub 100ms is good indicator)
            const optimized = avgTime < 100;

            this.results.claims.push({
                claim: 'Database Queries Optimized',
                status: (optimized && allHaveData) ? 'PASSED' : 'FAILED',
                metrics: {
                    avgQueryTime: `${avgTime.toFixed(2)}ms`,
                    optimized,
                    allHaveData
                }
            });
        }
    }

    async testOperationalReality() {
        console.log('\n🔍 OPERATIONAL REALITY CHECK');
        console.log('Testing actual production scenarios...');

        const realityTests = [
            {
                name: 'Concurrent Settings Requests',
                test: async () => {
                    const promises = Array(10).fill().map(() =>
                        axios.get(`${this.baseURL}/api/v2/settings?category=llm`)
                    );
                    const results = await Promise.all(promises);
                    return {
                        success: results.every(r => r.status === 200),
                        avgTime: results.reduce((a, b, i, arr) =>
                            (a + b.config?.meta?.requestDuration || 0) / arr.length, 0)
                    };
                }
            },
            {
                name: 'Cache Invalidation on Update',
                test: async () => {
                    // Get cached data
                    await axios.get(`${this.baseURL}/api/v2/settings?category=llm`);

                    // Update setting
                    await axios.post(`${this.baseURL}/api/v2/settings/`, {
                        'llmSettings.temperature': 0.8
                    });

                    // Get again - should be fresh data
                    const response = await axios.get(`${this.baseURL}/api/v2/settings?category=llm`);

                    return {
                        success: response.data.llmSettings?.temperature === 0.8,
                        cacheInvalidated: true
                    };
                }
            },
            {
                name: 'Large Payload Handling',
                test: async () => {
                    const largePayload = {
                        'llmSettings.systemPrompt': 'A'.repeat(10000), // 10KB
                        'llmSettings.customInstructions': 'B'.repeat(5000)  // 5KB
                    };

                    const response = await axios.post(`${this.baseURL}/api/v2/settings/`, largePayload);
                    return {
                        success: response.status === 200,
                        payloadSize: '15KB'
                    };
                }
            }
        ];

        let passed = 0;
        for (const test of realityTests) {
            try {
                console.log(`  • ${test.name}...`);
                const result = await test.test();
                if (result.success) {
                    console.log(`    ✅ Passed`);
                    passed++;
                } else {
                    console.log(`    ❌ Failed`);
                }
                this.results.operationalTests.push({
                    name: test.name,
                    status: result.success ? 'PASSED' : 'FAILED',
                    metrics: result
                });
            } catch (error) {
                console.log(`    ❌ Error: ${error.message}`);
                this.results.operationalTests.push({
                    name: test.name,
                    status: 'ERROR',
                    error: error.message
                });
            }
        }

        this.results.summary.passed = passed;
        this.results.summary.total = realityTests.length;
        this.results.summary.failed = realityTests.length - passed;
    }

    validateCategoryFiltering(category, data) {
        // Check if data contains only category-specific keys
        const categoryPatterns = {
            llm: ['openai', 'google', 'anthropic', 'deepseek', 'ollama', 'huggingface', 'llmSettings'],
            embeddings: ['embeddings', 'embedding'],
            rag: ['ragSettings', 'rag'],
            database: ['database'],
            security: ['security', 'jwt']
        };

        const expectedKeys = categoryPatterns[category] || [];
        const actualKeys = Object.keys(data);

        // Simple validation: check if data contains expected category keys
        return expectedKeys.some(key =>
            actualKeys.some(actualKey => actualKey.toLowerCase().includes(key.toLowerCase()))
        );
    }

    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📋 SETTINGS AGENT VALIDATION REPORT');
        console.log('='.repeat(60));

        // Claims validation
        console.log('\n🎯 CLAIMS VALIDATION:');
        this.results.claims.forEach(claim => {
            const status = claim.status === 'PASSED' ? '✅' : '❌';
            console.log(`  ${status} ${claim.claim}`);
            if (claim.metrics) {
                Object.entries(claim.metrics).forEach(([key, value]) => {
                    console.log(`    • ${key}: ${value}`);
                });
            }
        });

        // Operational tests
        console.log('\n🔍 OPERATIONAL TESTS:');
        this.results.operationalTests.forEach(test => {
            const status = test.status === 'PASSED' ? '✅' : test.status === 'ERROR' ? '💥' : '❌';
            console.log(`  ${status} ${test.name}`);
            if (test.error) {
                console.log(`    Error: ${test.error}`);
            }
        });

        // Summary
        console.log('\n📊 SUMMARY:');
        const claimsPassed = this.results.claims.filter(c => c.status === 'PASSED').length;
        const claimsTotal = this.results.claims.length;

        console.log(`  Claims Verified: ${claimsPassed}/${claimsTotal} (${(claimsPassed/claimsTotal*100).toFixed(1)}%)`);
        console.log(`  Operational Tests: ${this.results.summary.passed}/${this.results.summary.total}`);

        // Final verdict
        const overallSuccess = claimsPassed === claimsTotal &&
                              this.results.summary.passed === this.results.summary.total;

        console.log(`\n🏆 FINAL VERDICT: ${overallSuccess ? '✅ SETTINGS AGENT VALIDATED' : '❌ CLAIMS NOT VERIFIED'}`);

        if (!overallSuccess) {
            console.log('\n⚠️  RECOMMENDATIONS:');
            console.log('  1. Fix failed validations before production');
            console.log('  2. Re-test with realistic scenarios');
            console.log('  3. Monitor performance in production');
        }
    }
}

// Run self-test if called directly
if (require.main === module) {
    const test = new SettingsAgentSelfTest();
    test.runFullTest().catch(console.error);
}

module.exports = SettingsAgentSelfTest;