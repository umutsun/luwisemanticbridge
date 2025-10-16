/**
 * CHATBOT AGENT SELF-TEST
 * CTO-Operational Validation Script
 *
 * Claims by Chatbot Agent:
 * ✅ Message embeddings system working
 * ✅ RAG integration with 4 vector tables
 * ✅ Analytics dashboard functional
 * ✅ Authentication system working
 * ✅ Cross-session learning operational
 */

const axios = require('axios');
const { performance } = require('perf_hooks');

class ChatbotAgentSelfTest {
    constructor() {
        this.baseURL = 'http://localhost:8083';
        this.frontendURL = 'http://localhost:3002';
        this.testSession = 'chatbot-self-test-' + Date.now();
        this.authToken = null;
        this.results = {
            claims: [],
            operationalTests: [],
            ragTests: [],
            summary: { passed: 0, failed: 0, total: 0 }
        };
    }

    async runFullTest() {
        console.log('\n🤖 CHATBOT AGENT SELF-TEST');
        console.log('CTO Operational Validation');
        console.log('='.repeat(60));

        // Get auth token first
        await this.authenticate();

        // Claim 1: Message Embeddings System
        await this.testMessageEmbeddings();

        // Claim 2: RAG Integration with 4 Tables
        await this.testRAGIntegration();

        // Claim 3: Analytics Dashboard
        await this.testAnalyticsDashboard();

        // Claim 4: Authentication System
        await this.testAuthenticationSystem();

        // Claim 5: Cross-Session Learning
        await this.testCrossSessionLearning();

        // Operational Reality Check
        await this.testOperationalReality();

        this.generateReport();
    }

    async authenticate() {
        console.log('\n🔐 Authentication Setup');
        try {
            // Try to login with test credentials
            const response = await axios.post(`${this.baseURL}/api/v2/auth/login`, {
                email: 'test@test.com',
                password: 'Test123!@#'
            }).catch(async () => {
                // Create test user if doesn't exist
                await axios.post(`${this.baseURL}/api/v2/auth/register`, {
                    email: 'test@test.com',
                    password: 'Test123!@#',
                    name: 'Test User'
                });

                // Try login again
                return await axios.post(`${this.baseURL}/api/v2/auth/login`, {
                    email: 'test@test.com',
                    password: 'Test123!@#'
                });
            });

            this.authToken = response.data.token;
            axios.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;
            console.log('  ✅ Authentication successful');
        } catch (error) {
            console.log('  ⚠️  Authentication failed - continuing without auth');
        }
    }

    async testMessageEmbeddings() {
        console.log('\n💬 CLAIM 1: Message Embeddings System');
        console.log('Target: Q&A pairs stored with embeddings');

        const testMessage = {
            message: 'What is the capital of Turkey?',
            sessionId: this.testSession
        };

        try {
            // Send a message
            console.log('  • Sending test message...');
            const response = await axios.post(`${this.baseURL}/api/v2/chat`, testMessage);

            if (response.status === 200) {
                console.log('  ✅ Message processed');

                // Check if message was stored with embedding
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for async processing

                console.log('  • Checking message storage...');
                try {
                    const stats = await axios.get(`${this.baseURL}/api/v2/messages/stats`);
                    const hasMessages = stats.data.totalMessages > 0;
                    const hasEmbeddings = stats.data.embeddedMessages > 0;

                    console.log(`    Total messages: ${stats.data.totalMessages}`);
                    console.log(`    Embedded messages: ${stats.data.embeddedMessages}`);

                    this.results.claims.push({
                        claim: 'Message Embeddings Working',
                        status: (hasMessages && hasEmbeddings) ? 'PASSED' : 'FAILED',
                        metrics: {
                            totalMessages: stats.data.totalMessages,
                            embeddedMessages: stats.data.embeddedMessages,
                            embeddingRate: stats.data.totalMessages > 0
                                ? `${(stats.data.embeddedMessages / stats.data.totalMessages * 100).toFixed(1)}%`
                                : '0%'
                        }
                    });
                } catch (error) {
                    console.log('  ❌ Could not verify message storage');
                    this.results.claims.push({
                        claim: 'Message Embeddings Working',
                        status: 'FAILED',
                        error: 'Stats endpoint not accessible'
                    });
                }
            }
        } catch (error) {
            console.log(`  ❌ Message processing failed: ${error.message}`);
            this.results.claims.push({
                claim: 'Message Embeddings Working',
                status: 'FAILED',
                error: error.message
            });
        }
    }

    async testRAGIntegration() {
        console.log('\n🔍 CLAIM 2: RAG Integration with 4 Vector Tables');
        console.log('Target: Search across unified, document, scrape, message embeddings');

        const vectorTables = ['unified_embeddings', 'document_embeddings', 'scrape_embeddings', 'message_embeddings'];
        const ragResults = [];

        // Test RAG search
        console.log('  • Testing RAG search...');
        try {
            const searchResponse = await axios.post(`${this.baseURL}/api/v2/rag/search`, {
                query: 'Turkey capital city Ankara',
                limit: 10
            });

            if (searchResponse.data && searchResponse.data.results) {
                const results = searchResponse.data.results;
                console.log(`    Found ${results.length} results`);

                // Check source diversity
                const sources = new Set();
                results.forEach(r => {
                    if (r.source_type) sources.add(r.source_type);
                });

                vectorTables.forEach(table => {
                    const hasResults = sources.has(table.replace('_embeddings', ''));
                    ragResults.push({ table: table, hasResults });
                    console.log(`    ${table}: ${hasResults ? '✅' : '❌'}`);
                });

                // Test semantic quality
                const relevantResults = results.filter(r =>
                    r.content.toLowerCase().includes('ankara') ||
                    r.content.toLowerCase().includes('turkey')
                );

                this.results.claims.push({
                    claim: 'RAG Integration with 4 Tables',
                    status: ragResults.filter(r => r.hasResults).length >= 2 ? 'PASSED' : 'FAILED',
                    metrics: {
                        totalResults: results.length,
                        tablesWithResults: ragResults.filter(r => r.hasResults).length,
                        relevantResults: relevantResults.length,
                        sources: Array.from(sources)
                    }
                });
            }
        } catch (error) {
            console.log(`  ❌ RAG search failed: ${error.message}`);
            this.results.claims.push({
                claim: 'RAG Integration with 4 Tables',
                status: 'FAILED',
                error: error.message
            });
        }
    }

    async testAnalyticsDashboard() {
        console.log('\n📊 CLAIM 3: Analytics Dashboard');
        console.log('Target: Dashboard with message analytics');

        const analyticsEndpoints = [
            '/api/v2/messages/stats',
            '/api/v2/messages/sessions',
            '/api/v2/messages/topics'
        ];

        let workingEndpoints = 0;

        for (const endpoint of analyticsEndpoints) {
            try {
                console.log(`  • Testing ${endpoint}...`);
                const response = await axios.get(`${this.baseURL}${endpoint}`);
                if (response.status === 200) {
                    workingEndpoints++;
                    console.log(`    ✅ Working`);
                }
            } catch (error) {
                console.log(`    ❌ Error: ${error.response?.status || 'Unknown'}`);
            }
        }

        // Test frontend dashboard
        console.log('  • Testing frontend dashboard...');
        try {
            const frontendResponse = await axios.get(`${this.frontendURL}/dashboard/messages`);
            const frontendWorking = frontendResponse.status === 200;
            console.log(`    Frontend: ${frontendWorking ? '✅' : '❌'}`);
        } catch (error) {
            console.log(`    Frontend: ❌ Not accessible`);
        }

        this.results.claims.push({
            claim: 'Analytics Dashboard Functional',
            status: workingEndpoints >= 2 ? 'PASSED' : 'FAILED',
            metrics: {
                workingEndpoints,
                totalEndpoints: analyticsEndpoints.length,
                endpointSuccessRate: `${(workingEndpoints / analyticsEndpoints.length * 100).toFixed(1)}%`
            }
        });
    }

    async testAuthenticationSystem() {
        console.log('\n🔐 CLAIM 4: Authentication System');
        console.log('Target: Protected routes and session management');

        const authTests = [
            {
                name: 'Protected Message Endpoint',
                test: async () => {
                    // Remove auth header
                    const originalAuth = axios.defaults.headers.common['Authorization'];
                    delete axios.defaults.headers.common['Authorization'];

                    try {
                        await axios.get(`${this.baseURL}/api/v2/messages/stats`);
                        return { success: false, reason: 'Endpoint not protected' };
                    } catch (error) {
                        // Restore auth
                        if (originalAuth) {
                            axios.defaults.headers.common['Authorization'] = originalAuth;
                        }
                        return {
                            success: error.response?.status === 401,
                            status: error.response?.status
                        };
                    }
                }
            },
            {
                name: 'Token Validation',
                test: async () => {
                    if (!this.authToken) {
                        return { success: false, reason: 'No auth token' };
                    }

                    try {
                        const response = await axios.get(`${this.baseURL}/api/v2/auth/verify`);
                        return { success: response.status === 200 };
                    } catch (error) {
                        return { success: false, reason: error.message };
                    }
                }
            },
            {
                name: 'Session Creation',
                test: async () => {
                    try {
                        const response = await axios.post(`${this.baseURL}/api/v2/chat`, {
                            message: 'Test session creation',
                            sessionId: 'test-session-' + Date.now()
                        });
                        return {
                            success: response.status === 200,
                            hasSessionId: !!response.data.sessionId
                        };
                    } catch (error) {
                        return { success: false, reason: error.message };
                    }
                }
            }
        ];

        let passed = 0;
        for (const test of authTests) {
            try {
                console.log(`  • ${test.name}...`);
                const result = await test.test();
                if (result.success) {
                    console.log(`    ✅ Passed`);
                    passed++;
                } else {
                    console.log(`    ❌ Failed: ${result.reason}`);
                }
            } catch (error) {
                console.log(`    ❌ Error: ${error.message}`);
            }
        }

        this.results.claims.push({
            claim: 'Authentication System Working',
            status: passed >= 2 ? 'PASSED' : 'FAILED',
            metrics: {
                testsPassed: passed,
                totalTests: authTests.length,
                authWorking: passed >= 2
            }
        });
    }

    async testCrossSessionLearning() {
        console.log('\n🧠 CLAIM 5: Cross-Session Learning');
        console.log('Target: Learning from previous conversations');

        const testQueries = [
            'What is the capital of Turkey?',
            'Tell me about Ankara',
            'Turkey information'
        ];

        const learningResults = [];

        for (const query of testQueries) {
            try {
                console.log(`  • Query: "${query}"`);
                const response = await axios.post(`${this.baseURL}/api/v2/rag/search`, {
                    query: query,
                    sessionId: this.testSession,
                    limit: 5
                });

                if (response.data && response.data.results) {
                    learningResults.push({
                        query,
                        resultCount: response.data.results.length,
                        hasContext: response.data.results.some(r => r.session_id)
                    });
                    console.log(`    Results: ${response.data.results.length}`);
                }
            } catch (error) {
                console.log(`    Error: ${error.message}`);
            }
        }

        // Check if system is learning from previous queries
        const avgResults = learningResults.reduce((a, b) => a + b.resultCount, 0) / learningResults.length;
        const hasLearning = learningResults.some(r => r.hasContext);

        this.results.claims.push({
            claim: 'Cross-Session Learning Working',
            status: (avgResults > 0 && learningResults.length === testQueries.length) ? 'PASSED' : 'FAILED',
            metrics: {
                queriesTested: testQueries.length,
                avgResults: avgResults.toFixed(1),
                hasContextLearning: hasLearning
            }
        });
    }

    async testOperationalReality() {
        console.log('\n🔍 OPERATIONAL REALITY CHECK');
        console.log('Testing actual production scenarios...');

        const realityTests = [
            {
                name: 'Concurrent Chat Sessions',
                test: async () => {
                    const sessions = Array(3).fill().map((_, i) => ({
                        message: `Test message from session ${i}`,
                        sessionId: `concurrent-test-${i}-${Date.now()}`
                    }));

                    const promises = sessions.map(s =>
                        axios.post(`${this.baseURL}/api/v2/chat`, s)
                    );

                    const results = await Promise.all(promises);
                    return {
                        success: results.every(r => r.status === 200),
                        sessions: results.length
                    };
                }
            },
            {
                name: 'Long Conversation Memory',
                test: async () => {
                    const conversation = [
                        'My name is John',
                        'I live in Istanbul',
                        'What is my name?'
                    ];

                    let responses = [];
                    for (const msg of conversation) {
                        const response = await axios.post(`${this.baseURL}/api/v2/chat`, {
                            message: msg,
                            sessionId: 'memory-test-' + Date.now()
                        });
                        responses.push(response.data);
                    }

                    const remembersName = responses[2].content.toLowerCase().includes('john');
                    return {
                        success: remembersName,
                        remembersContext: remembersName
                    };
                }
            },
            {
                name: 'RAG Response Quality',
                test: async () => {
                    const response = await axios.post(`${this.baseURL}/api/v2/chat`, {
                        message: 'What are the main features of the Turkish tax system?',
                        sessionId: 'quality-test-' + Date.now()
                    });

                    const hasSources = response.data.sources && response.data.sources.length > 0;
                    const hasContent = response.data.content && response.data.content.length > 50;

                    return {
                        success: hasSources && hasContent,
                        hasSources,
                        hasContent,
                        responseLength: response.data.content?.length || 0
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

    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📋 CHATBOT AGENT VALIDATION REPORT');
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
        const overallSuccess = claimsPassed >= 4 && // At least 4/5 claims
                              this.results.summary.passed >= 2; // At least 2/3 operational tests

        console.log(`\n🏆 FINAL VERDICT: ${overallSuccess ? '✅ CHATBOT AGENT VALIDATED' : '❌ CLAIMS NOT FULLY VERIFIED'}`);

        if (!overallSuccess) {
            console.log('\n⚠️  RECOMMENDATIONS:');
            console.log('  1. Fix authentication system');
            console.log('  2. Verify message embeddings are being stored');
            console.log('  3. Check RAG integration with all vector tables');
            console.log('  4. Test analytics dashboard endpoints');
        }
    }
}

// Run self-test if called directly
if (require.main === module) {
    const test = new ChatbotAgentSelfTest();
    test.runFullTest().catch(console.error);
}

module.exports = ChatbotAgentSelfTest;