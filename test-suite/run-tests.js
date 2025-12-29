#!/usr/bin/env node

/**
 * Automated Test Runner
 * Executes all test suites and generates comprehensive reports
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class TestRunner {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            suites: {},
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                duration: 0
            }
        };
        this.startTime = Date.now();
    }

    async runAllSuites() {
        console.log('🚀 Alice Semantic Bridge - Automated Test Suite');
        console.log('='.repeat(80));
        console.log(`Started: ${new Date().toISOString()}`);
        console.log(`Node Version: ${process.version}`);
        console.log(`Platform: ${process.platform}`);
        console.log('='.repeat(80));

        // Check if services are running
        console.log('\n🔍 Checking service availability...');
        await this.checkServices();

        // Install dependencies if needed
        console.log('\n📦 Checking dependencies...');
        await this.installDependencies();

        // Run test suites
        const suites = [
            { name: 'Unit Tests', file: 'unit-tests.js', critical: true },
            { name: 'Comprehensive Tests', file: 'comprehensive-tests.js', critical: true },
            { name: 'Integration Tests', file: 'integration-tests.js', critical: true },
            { name: 'Load Tests', file: 'load-tests.js', critical: false },
            { name: 'Security Tests', file: 'security-tests.js', critical: true }
        ];

        for (const suite of suites) {
            if (fs.existsSync(path.join(__dirname, suite.file))) {
                await this.runSuite(suite.name, suite.file, suite.critical);
            } else {
                console.log(`⚠️  ${suite.name} file not found, skipping...`);
                this.results.summary.skipped++;
            }
        }

        // Generate final report
        this.generateFinalReport();
        this.saveResults();
        this.checkCIStatus();
    }

    async checkServices() {
        const services = [
            { name: 'Backend', url: 'http://localhost:8083/health', port: 8083 },
            { name: 'Frontend', url: 'http://localhost:3002', port: 3002 },
            { name: 'Redis', port: 6379, type: 'redis' },
            { name: 'PostgreSQL', port: 5432, type: 'postgres' }
        ];

        for (const service of services) {
            try {
                if (service.type === 'redis') {
                    const redis = require('redis');
                    const client = redis.createClient({ url: 'redis://localhost:6379' });
                    await client.connect();
                    await client.ping();
                    await client.quit();
                    console.log(`✅ ${service.name}: Connected`);
                } else if (service.type === 'postgres') {
                    const { Client } = require('pg');
                    const client = new Client({
                        host: '91.99.229.96',
                        port: 5432,
                        user: 'postgres',
                        password: '123456',
                        database: 'lsemb'
                    });
                    await client.connect();
                    await client.query('SELECT 1');
                    await client.end();
                    console.log(`✅ ${service.name}: Connected`);
                } else {
                    const axios = require('axios');
                    await axios.get(service.url, { timeout: 3000 });
                    console.log(`✅ ${service.name}: Running`);
                }
            } catch (error) {
                console.log(`❌ ${service.name}: Not available (${error.message})`);
                if (service.name === 'Backend' || service.name === 'PostgreSQL') {
                    console.log('\n⚠️  Critical service not running. Some tests may fail.');
                    console.log('   Please start the required services before running tests.');
                }
            }
        }
    }

    async installDependencies() {
        const dependencies = ['axios', 'ws', 'pg', 'redis', 'perf_hooks'];
        const missing = [];

        for (const dep of dependencies) {
            try {
                require.resolve(dep);
            } catch (error) {
                missing.push(dep);
            }
        }

        if (missing.length > 0) {
            console.log('Installing missing dependencies...');
            try {
                execSync(`npm install ${missing.join(' ')}`, { stdio: 'inherit' });
                console.log('✅ Dependencies installed');
            } catch (error) {
                console.log('❌ Failed to install dependencies');
                console.log('Please run: npm install ' + missing.join(' '));
            }
        } else {
            console.log('✅ All dependencies available');
        }
    }

    async runSuite(name, file, critical) {
        console.log(`\n📋 Running ${name}...`);
        const startTime = Date.now();

        try {
            // Dynamic import
            const suite = require(path.join(__dirname, file));

            let suiteResults;

            // Handle Class exports (like IntegrationTestSuite)
            if (typeof suite === 'function' && suite.prototype && suite.prototype.runAllTests) {
                const instance = new suite();
                suiteResults = await instance.runAllTests();
            }
            // Handle specific exports
            else if (suite.runComprehensiveTests) {
                suiteResults = await suite.runComprehensiveTests();
            } else if (suite.runAllTests) {
                suiteResults = await suite.runAllTests();
            } else if (typeof suite === 'function') {
                suiteResults = await suite();
            } else {
                throw new Error('Invalid test suite format: ' + file);
            }

            // Ensure suiteResults is valid
            if (!suiteResults) {
                console.warn(`⚠️  ${name} did not return results.`);
                suiteResults = { summary: { total: 0, passed: 0, failed: 0 } };
            }

            const duration = Date.now() - startTime;

            this.results.suites[name] = {
                status: 'PASSED',
                duration,
                critical,
                results: suiteResults
            };

            console.log(`✅ ${name} completed in ${duration}ms`);

            // Extract pass/fail counts if available
            if (suiteResults.summary) {
                this.results.summary.total += suiteResults.summary.total || 0;
                this.results.summary.passed += suiteResults.summary.passed || 0;
                this.results.summary.failed += suiteResults.summary.failed || 0;
            }

        } catch (error) {
            const duration = Date.now() - startTime;
            this.results.suites[name] = {
                status: 'FAILED',
                duration,
                critical,
                error: error.message,
                stack: error.stack
            };

            console.log(`❌ ${name} failed: ${error.message}`);

            if (critical) {
                console.log('\n⚠️  Critical test suite failed!');
                console.log('This may indicate serious issues with the system.');
            }
        }
    }

    generateFinalReport() {
        this.results.summary.duration = Date.now() - this.startTime;

        console.log('\n' + '='.repeat(80));
        console.log('📊 FINAL TEST REPORT');
        console.log('='.repeat(80));

        // Suite summary
        console.log('\nTest Suites:');
        Object.entries(this.results.suites).forEach(([name, suite]) => {
            const status = suite.status === 'PASSED' ? '✅' : '❌';
            const critical = suite.critical ? ' (Critical)' : '';
            const time = (suite.duration / 1000).toFixed(2) + 's';
            console.log(`  ${status} ${name}${critical}: ${time}`);
        });

        // Overall summary
        console.log('\n' + '-'.repeat(40));
        console.log('Overall Summary:');
        console.log(`  Total Tests: ${this.results.summary.total}`);
        console.log(`  Passed: ${this.results.summary.passed} ✅`);
        console.log(`  Failed: ${this.results.summary.failed} ❌`);
        console.log(`  Skipped: ${this.results.summary.skipped} ⏭️`);
        console.log(`  Duration: ${(this.results.summary.duration / 1000).toFixed(2)}s`);

        const passRate = this.results.summary.total > 0
            ? (this.results.summary.passed / this.results.summary.total * 100).toFixed(1)
            : 0;
        console.log(`  Success Rate: ${passRate}%`);

        // System health assessment
        console.log('\n🏥 SYSTEM HEALTH ASSESSMENT:');
        const criticalSuites = Object.values(this.results.suites).filter(s => s.critical);
        const criticalPassed = criticalSuites.filter(s => s.status === 'PASSED').length;

        if (criticalPassed === criticalSuites.length && passRate >= 80) {
            console.log('  ✅ EXCELLENT - System is production ready');
        } else if (criticalPassed >= criticalSuites.length * 0.8 && passRate >= 60) {
            console.log('  ⚠️  GOOD - System is mostly ready with minor issues');
        } else {
            console.log('  ❌ NEEDS ATTENTION - System has significant issues');
        }

        // Action items
        console.log('\n🎯 ACTION ITEMS:');
        const failedSuites = Object.entries(this.results.suites)
            .filter(([_, suite]) => suite.status === 'FAILED');

        if (failedSuites.length === 0) {
            console.log('  ✅ All tests passed! System is ready for deployment.');
        } else {
            console.log('  🔧 Fix the following failing test suites:');
            failedSuites.forEach(([name, suite]) => {
                console.log(`    • ${name}: ${suite.error}`);
            });
        }

        // Performance summary
        const slowSuites = Object.entries(this.results.suites)
            .filter(([_, suite]) => suite.duration > 5000)
            .sort(([, a], [, b]) => b.duration - a.duration);

        if (slowSuites.length > 0) {
            console.log('\n⚡ PERFORMANCE SUMMARY:');
            console.log('  Slowest test suites:');
            slowSuites.slice(0, 3).forEach(([name, suite]) => {
                console.log(`    • ${name}: ${(suite.duration / 1000).toFixed(2)}s`);
            });
        }
    }

    saveResults() {
        const reportsDir = path.join(__dirname, 'reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir);
        }

        const filename = `test-report-${Date.now()}.json`;
        const filepath = path.join(reportsDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(this.results, null, 2));

        // Also save latest report
        const latestPath = path.join(reportsDir, 'latest.json');
        fs.writeFileSync(latestPath, JSON.stringify(this.results, null, 2));

        console.log(`\n📄 Report saved to: ${filename}`);
    }

    checkCIStatus() {
        // Set exit code for CI/CD
        const hasCriticalFailures = Object.values(this.results.suites)
            .some(suite => suite.critical && suite.status === 'FAILED');

        if (hasCriticalFailures) {
            console.log('\n❌ CI/CD Status: FAILED (Critical test failures)');
            process.exit(1);
        } else if (this.results.summary.failed > 0) {
            console.log('\n⚠️  CI/CD Status: WARNING (Non-critical failures)');
            process.exit(0);
        } else {
            console.log('\n✅ CI/CD Status: PASSED');
            process.exit(0);
        }
    }
}

// CLI interface
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Alice Semantic Bridge - Test Runner

Usage: node run-tests.js [options]

Options:
  --help, -h       Show this help
  --suite <name>   Run specific test suite
  --report         Generate HTML report
  --ci             CI mode (exit with status code)
  --verbose        Verbose output

Available Suites:
  - comprehensive-tests.js
  - integration-tests.js
  - load-tests.js
  - security-tests.js
  - unit-tests.js

Examples:
  node run-tests.js
  node run-tests.js --suite comprehensive-tests.js
  node run-tests.js --ci
`);
    process.exit(0);
}

// Run the tests
if (args.includes('--suite')) {
    const suiteName = args[args.indexOf('--suite') + 1];
    if (!suiteName) {
        console.error('Please specify a suite name');
        process.exit(1);
    }

    const runner = new TestRunner();
    runner.runSuite('Custom Suite', suiteName, true)
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
} else {
    const runner = new TestRunner();
    runner.runAllSuites().catch(console.error);
}

module.exports = TestRunner;