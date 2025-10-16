/**
 * DOCUMENTS AGENT SELF-TEST
 * CTO-Operational Validation Script
 *
 * Claims by Documents Agent:
 * ✅ NoSQL injection protection (100% effective)
 * ✅ Translation system integrated
 * ✅ 3-tab workflow (OCR → Translate → Embeddings)
 * ✅ Security headers and validation
 * ✅ File processing capabilities
 * ✅ XSS protection active
 */

const axios = require('axios');
const { performance } = require('perf_hooks');
const FormData = require('form-data');
const fs = require('fs');

class DocumentsAgentSelfTest {
    constructor() {
        this.baseURL = 'http://localhost:8083';
        this.frontendURL = 'http://localhost:3002';
        this.testFileId = null;
        this.results = {
            claims: [],
            securityTests: [],
            operationalTests: [],
            summary: { passed: 0, failed: 0, total: 0 }
        };
    }

    async runFullTest() {
        console.log('\n📄 DOCUMENTS AGENT SELF-TEST');
        console.log('CTO Operational Validation');
        console.log('='.repeat(60));

        // Claim 1: NoSQL Injection Protection
        await this.testNoSQLInjectionProtection();

        // Claim 2: Translation System
        await this.testTranslationSystem();

        // Claim 3: 3-Tab Workflow
        await this.testThreeTabWorkflow();

        // Claim 4: Security Features
        await this.testSecurityFeatures();

        // Claim 5: File Processing
        await this.testFileProcessing();

        // Operational Reality Check
        await this.testOperationalReality();

        this.generateReport();
    }

    async testNoSQLInjectionProtection() {
        console.log('\n🛡️ CLAIM 1: NoSQL Injection Protection');
        console.log('Target: 100% effective against NoSQL injection');

        const injectionPayloads = [
            "'; DROP TABLE documents; --",
            "1' OR '1'='1",
            "{$ne: null}",
            "{$gt: ''}",
            {"$where": "return true"},
            {"$regex": ".*"},
            "'; return db.users.find(); --",
            "1'; return true; var x = '1"
        ];

        let blockedAttempts = 0;
        let totalAttempts = injectionPayloads.length;

        for (const payload of injectionPayloads) {
            try {
                console.log(`  • Testing payload: ${JSON.stringify(payload).substring(0, 30)}...`);

                // Test in document search
                await axios.get(`${this.baseURL}/api/v2/documents/search`, {
                    params: { q: payload }
                });

                // Test in document creation
                await axios.post(`${this.baseURL}/api/v2/documents/create`, {
                    title: payload,
                    content: 'Test content'
                });

                // If we reach here, injection was NOT blocked
                console.log(`    ❌ NOT BLOCKED - VULNERABLE!`);
            } catch (error) {
                const isBlocked = error.response?.status === 400 ||
                                 error.response?.status === 422 ||
                                 error.message.includes('invalid') ||
                                 error.message.includes('blocked');

                if (isBlocked) {
                    console.log(`    ✅ BLOCKED`);
                    blockedAttempts++;
                } else {
                    console.log(`    ⚠️  Unexpected error: ${error.response?.status}`);
                }
            }
        }

        const protectionRate = (blockedAttempts / totalAttempts * 100).toFixed(1);

        this.results.claims.push({
            claim: 'NoSQL Injection Protection',
            status: blockedAttempts === totalAttempts ? 'PASSED' : 'FAILED',
            metrics: {
                blockedAttempts,
                totalAttempts,
                protectionRate: `${protectionRate}%`
            }
        });
    }

    async testTranslationSystem() {
        console.log('\n🌐 CLAIM 2: Translation System');
        console.log('Target: DeepL & Google Translate integration');

        const translationTests = [
            {
                name: 'Google Translate API',
                provider: 'google',
                text: 'Hello world, this is a test.',
                target: 'tr'
            },
            {
                name: 'DeepL API',
                provider: 'deepl',
                text: 'Hello world, this is a test.',
                target: 'tr'
            },
            {
                name: 'Cost Estimation',
                provider: 'google',
                text: 'This is a longer text for cost estimation testing purposes.',
                target: 'de'
            }
        ];

        let workingTranslations = 0;

        for (const test of translationTests) {
            try {
                console.log(`  • Testing ${test.name}...`);

                if (test.name === 'Cost Estimation') {
                    // Test cost estimation
                    const response = await axios.post(`${this.baseURL}/api/v2/translate/estimate`, {
                        text: test.text,
                        target: test.target,
                        provider: test.provider
                    });

                    if (response.data.cost !== undefined) {
                        console.log(`    ✅ Cost estimation: $${response.data.cost}`);
                        workingTranslations++;
                    }
                } else {
                    // Test actual translation
                    const response = await axios.post(`${this.baseURL}/api/v2/translate`, {
                        text: test.text,
                        from: 'en',
                        to: test.target,
                        provider: test.provider
                    });

                    if (response.data.translatedText) {
                        console.log(`    ✅ Translated: ${response.data.translatedText.substring(0, 50)}...`);
                        workingTranslations++;
                    }
                }
            } catch (error) {
                const apiKeyMissing = error.response?.data?.error?.includes('API key');
                if (apiKeyMissing) {
                    console.log(`    ⚠️  API key not configured`);
                } else {
                    console.log(`    ❌ Error: ${error.message}`);
                }
            }
        }

        // Check translation settings
        try {
            console.log('  • Checking translation settings...');
            const settingsResponse = await axios.get(`${this.baseURL}/api/v2/settings?category=translation`);
            if (settingsResponse.data.deepl || settingsResponse.data.google) {
                console.log(`    ✅ Translation settings available`);
                workingTranslations++;
            }
        } catch (error) {
            console.log(`    Settings not accessible`);
        }

        this.results.claims.push({
            claim: 'Translation System Integrated',
            status: workingTranslations >= 2 ? 'PASSED' : 'FAILED',
            metrics: {
                workingFeatures: workingTranslations,
                totalFeatures: translationTests.length + 1,
                apiConfigured: workingTranslations > 0
            }
        });
    }

    async testThreeTabWorkflow() {
        console.log('\n📑 CLAIM 3: 3-Tab Workflow');
        console.log('Target: OCR → Translate → Embeddings');

        const workflowSteps = [
            {
                name: 'OCR Processing',
                endpoint: '/api/v2/documents/ocr',
                test: async () => {
                    // Create a test text file for OCR
                    const testContent = 'This is a test document for OCR processing.';
                    const response = await axios.post(`${this.baseURL}/api/v2/documents/process`, {
                        title: 'OCR Test Document',
                        content: testContent,
                        type: 'text'
                    });
                    return {
                        success: response.status === 200,
                        documentId: response.data.documentId
                    };
                }
            },
            {
                name: 'Translation Tab',
                endpoint: '/api/v2/translate/document',
                test: async () => {
                    if (!this.testFileId) {
                        return { success: false, reason: 'No document ID' };
                    }

                    const response = await axios.post(`${this.baseURL}/api/v2/translate/document`, {
                        documentId: this.testFileId,
                        targetLanguage: 'tr'
                    });

                    return {
                        success: response.status === 200,
                        translated: !!response.data.translatedContent
                    };
                }
            },
            {
                name: 'Embeddings Generation',
                endpoint: '/api/v2/documents/embeddings',
                test: async () => {
                    if (!this.testFileId) {
                        return { success: false, reason: 'No document ID' };
                    }

                    const response = await axios.post(`${this.baseURL}/api/v2/documents/embeddings`, {
                        documentId: this.testFileId
                    });

                    return {
                        success: response.status === 200,
                        embeddingId: response.data.embeddingId
                    };
                }
            }
        ];

        let workflowComplete = 0;

        for (const step of workflowSteps) {
            try {
                console.log(`  • Testing ${step.name}...`);
                const result = await step.test();

                if (result.success) {
                    console.log(`    ✅ ${step.name} working`);
                    workflowComplete++;

                    // Save document ID for next steps
                    if (result.documentId) {
                        this.testFileId = result.documentId;
                    }
                } else {
                    console.log(`    ❌ ${step.name} failed: ${result.reason}`);
                }
            } catch (error) {
                console.log(`    ❌ ${step.name} error: ${error.message}`);
            }
        }

        // Check frontend workflow
        try {
            console.log('  • Checking frontend workflow UI...');
            const frontendResponse = await axios.get(`${this.frontendURL}/dashboard/documents`);
            const uiWorking = frontendResponse.status === 200;
            console.log(`    Frontend UI: ${uiWorking ? '✅' : '❌'}`);
        } catch (error) {
            console.log(`    Frontend UI not accessible`);
        }

        this.results.claims.push({
            claim: '3-Tab Workflow Working',
            status: workflowComplete >= 2 ? 'PASSED' : 'FAILED',
            metrics: {
                stepsWorking: workflowComplete,
                totalSteps: workflowSteps.length,
                workflowComplete: workflowComplete === workflowSteps.length
            }
        });
    }

    async testSecurityFeatures() {
        console.log('\n🔒 CLAIM 4: Security Features');
        console.log('Target: XSS protection, file validation, secure headers');

        const securityTests = [
            {
                name: 'XSS Protection',
                test: async () => {
                    const xssPayload = '<script>alert("xss")</script>';
                    const response = await axios.post(`${this.baseURL}/api/v2/documents/create`, {
                        title: xssPayload,
                        content: 'Test content with XSS'
                    });

                    // Check if XSS was sanitized
                    const content = JSON.stringify(response.data);
                    const sanitized = !content.includes('<script>');

                    return { success: sanitized, sanitized };
                }
            },
            {
                name: 'File Type Validation',
                test: async () => {
                    // Try to upload executable file
                    const maliciousFile = {
                        filename: 'malware.exe',
                        content: 'fake executable content',
                        mimetype: 'application/x-executable'
                    };

                    try {
                        await axios.post(`${this.baseURL}/api/v2/documents/upload`, maliciousFile);
                        return { success: false, reason: 'Should block executable' };
                    } catch (error) {
                        return {
                            success: error.response?.status === 400,
                            blocksMalicious: true
                        };
                    }
                }
            },
            {
                name: 'Secure Headers',
                test: async () => {
                    const response = await axios.get(`${this.baseURL}/api/v2/documents`);
                    const headers = response.headers;

                    const securityHeaders = {
                        'x-frame-options': headers['x-frame-options'],
                        'x-content-type-options': headers['x-content-type-options'],
                        'x-xss-protection': headers['x-xss-protection']
                    };

                    const hasSecurityHeaders = Object.values(securityHeaders).some(h => h);

                    return {
                        success: hasSecurityHeaders,
                        headers: securityHeaders
                    };
                }
            },
            {
                name: 'Path Traversal Protection',
                test: async () => {
                    const maliciousPaths = [
                        '../../../etc/passwd',
                        '..\\..\\windows\\system32\\config\\sam',
                        '/etc/shadow'
                    ];

                    let blocked = 0;
                    for (const path of maliciousPaths) {
                        try {
                            await axios.post(`${this.baseURL}/api/v2/documents/upload`, {
                                filename: path,
                                content: 'test'
                            });
                        } catch (error) {
                            if (error.response?.status === 400) {
                                blocked++;
                            }
                        }
                    }

                    return {
                        success: blocked === maliciousPaths.length,
                        blocked,
                        total: maliciousPaths.length
                    };
                }
            }
        ];

        let securityPassed = 0;

        for (const test of securityTests) {
            try {
                console.log(`  • ${test.name}...`);
                const result = await test.test();

                if (result.success) {
                    console.log(`    ✅ Security check passed`);
                    securityPassed++;
                } else {
                    console.log(`    ❌ Security vulnerability detected`);
                }

                this.results.securityTests.push({
                    name: test.name,
                    status: result.success ? 'PASSED' : 'FAILED',
                    metrics: result
                });
            } catch (error) {
                console.log(`    ❌ Error: ${error.message}`);
            }
        }

        this.results.claims.push({
            claim: 'Security Features Active',
            status: securityPassed >= 3 ? 'PASSED' : 'FAILED',
            metrics: {
                securityTestsPassed: securityPassed,
                totalSecurityTests: securityTests.length,
                securityScore: `${(securityPassed / securityTests.length * 100).toFixed(1)}%`
            }
        });
    }

    async testFileProcessing() {
        console.log('\n📁 CLAIM 5: File Processing Capabilities');
        console.log('Target: Multiple file formats support');

        const fileTypes = [
            { type: 'PDF', test: 'PDF processing' },
            { type: 'CSV', test: 'CSV table view' },
            { type: 'JSON', test: 'JSON tree view' },
            { type: 'TXT', test: 'Text preview' },
            { type: 'DOCX', test: 'Document processing' }
        ];

        let supportedFormats = 0;

        for (const fileType of fileTypes) {
            try {
                console.log(`  • Testing ${fileType.type}...`);

                // Test file upload and processing
                const response = await axios.post(`${this.baseURL}/api/v2/documents/process`, {
                    title: `Test ${fileType.type} File`,
                    content: `Test content for ${fileType.type} file`,
                    type: fileType.type.toLowerCase()
                });

                if (response.status === 200) {
                    console.log(`    ✅ ${fileType.test} supported`);
                    supportedFormats++;
                }
            } catch (error) {
                console.log(`    ❌ ${fileType.type} not supported: ${error.message}`);
            }
        }

        // Test preview generation
        try {
            console.log('  • Testing preview generation...');
            if (this.testFileId) {
                const previewResponse = await axios.get(
                    `${this.baseURL}/api/v2/documents/preview/${this.testFileId}`
                );
                if (previewResponse.data.preview) {
                    console.log(`    ✅ Preview generation working`);
                    supportedFormats++;
                }
            }
        } catch (error) {
            console.log(`    Preview not available`);
        }

        this.results.claims.push({
            claim: 'File Processing Capabilities',
            status: supportedFormats >= 3 ? 'PASSED' : 'FAILED',
            metrics: {
                supportedFormats,
                totalFormats: fileTypes.length + 1,
                formatSupportRate: `${(supportedFormats / (fileTypes.length + 1) * 100).toFixed(1)}%`
            }
        });
    }

    async testOperationalReality() {
        console.log('\n🔍 OPERATIONAL REALITY CHECK');
        console.log('Testing actual production scenarios...');

        const realityTests = [
            {
                name: 'Large File Handling',
                test: async () => {
                    const largeContent = 'A'.repeat(1000000); // 1MB
                    const response = await axios.post(`${this.baseURL}/api/v2/documents/process`, {
                        title: 'Large File Test',
                        content: largeContent,
                        type: 'txt'
                    });

                    return {
                        success: response.status === 200,
                        documentId: response.data.documentId,
                        sizeHandled: '1MB'
                    };
                }
            },
            {
                name: 'Concurrent Document Processing',
                test: async () => {
                    const documents = Array(5).fill().map((_, i) => ({
                        title: `Concurrent Test ${i}`,
                        content: `Test content ${i}`,
                        type: 'txt'
                    }));

                    const promises = documents.map(doc =>
                        axios.post(`${this.baseURL}/api/v2/documents/process`, doc)
                    );

                    const results = await Promise.all(promises);
                    const successful = results.filter(r => r.status === 200).length;

                    return {
                        success: successful >= 4,
                        processed: successful,
                        total: documents.length
                    };
                }
            },
            {
                name: 'Search Functionality',
                test: async () => {
                    // First create a searchable document
                    await axios.post(`${this.baseURL}/api/v2/documents/process`, {
                        title: 'Search Test Document',
                        content: 'This document contains unique keywords for testing search functionality: bluegreenredyellow',
                        type: 'txt'
                    });

                    // Wait for indexing
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Search for the document
                    const searchResponse = await axios.get(`${this.baseURL}/api/v2/documents/search`, {
                        params: { q: 'bluegreenredyellow' }
                    });

                    return {
                        success: searchResponse.data.results?.length > 0,
                        foundDocuments: searchResponse.data.results?.length || 0
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
        console.log('📋 DOCUMENTS AGENT VALIDATION REPORT');
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

        // Security tests
        console.log('\n🔒 SECURITY TESTS:');
        this.results.securityTests.forEach(test => {
            const status = test.status === 'PASSED' ? '✅' : '❌';
            console.log(`  ${status} ${test.name}`);
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
        const securityPassed = this.results.securityTests.filter(t => t.status === 'PASSED').length;
        const securityTotal = this.results.securityTests.length;

        console.log(`  Claims Verified: ${claimsPassed}/${claimsTotal} (${(claimsPassed/claimsTotal*100).toFixed(1)}%)`);
        console.log(`  Security Tests: ${securityPassed}/${securityTotal} (${(securityPassed/securityTotal*100).toFixed(1)}%)`);
        console.log(`  Operational Tests: ${this.results.summary.passed}/${this.results.summary.total}`);

        // Final verdict
        const overallSuccess = claimsPassed >= 4 && // At least 4/5 claims
                              securityPassed >= 3 && // At least 3/4 security tests
                              this.results.summary.passed >= 2; // At least 2/3 operational tests

        console.log(`\n🏆 FINAL VERDICT: ${overallSuccess ? '✅ DOCUMENTS AGENT VALIDATED' : '❌ CLAIMS NOT FULLY VERIFIED'}`);

        if (!overallSuccess) {
            console.log('\n⚠️  RECOMMENDATIONS:');
            console.log('  1. Fix security vulnerabilities immediately');
            console.log('  2. Complete 3-tab workflow implementation');
            console.log('  3. Configure translation API keys');
            console.log('  4. Test file processing with real files');
        }
    }
}

// Run self-test if called directly
if (require.main === module) {
    const test = new DocumentsAgentSelfTest();
    test.runFullTest().catch(console.error);
}

module.exports = DocumentsAgentSelfTest;