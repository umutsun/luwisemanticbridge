#!/usr/bin/env node

/**
 * AGENT SELF-TEST ORCHESTRATOR
 * CTO-Commanded Comprehensive Agent Validation
 *
 * This script runs all 4 agent self-tests and generates a unified report
 * to verify which agents have actually implemented their claimed features.
 */

const SettingsAgentTest = require('./settings-agent-self-test');
const ChatbotAgentTest = require('./chatbot-agent-self-test');
const ScraperAgentTest = require('./scraper-agent-self-test');
const DocumentsAgentTest = require('./documents-agent-self-test');

class AgentTestOrchestrator {
    constructor() {
        this.testResults = {
            settings: null,
            chatbot: null,
            scraper: null,
            documents: null,
            startTime: new Date().toISOString()
        };
    }

    async runAllTests() {
        console.log('🎯 CTO AGENT VALIDATION SUITE');
        console.log('Comprehensive Agent Self-Test Orchestration');
        console.log('='.repeat(80));
        console.log(`Started: ${new Date().toISOString()}`);
        console.log('');

        // Initialize test suite
        const agents = [
            { name: 'Settings', class: SettingsAgentTest, color: '🔧' },
            { name: 'Chatbot', class: ChatbotAgentTest, color: '🤖' },
            { name: 'Scraper', class: ScraperAgentTest, color: '🕷️' },
            { name: 'Documents', class: DocumentsAgentTest, color: '📄' }
        ];

        // Run each agent test
        for (const agent of agents) {
            console.log(`\n${agent.color} ${agent.name.toUpperCase()} AGENT TEST`);
            console.log('-'.repeat(60));

            try {
                const testInstance = new agent.class();
                await testInstance.runFullTest();

                // Store results
                this.testResults[agent.name.toLowerCase()] = {
                    status: 'COMPLETED',
                    results: testInstance.results
                };

                // Cleanup if needed
                if (testInstance.cleanup) {
                    await testInstance.cleanup();
                }

            } catch (error) {
                console.log(`\n💥 ${agent.name} Agent Test Failed: ${error.message}`);
                this.testResults[agent.name.toLowerCase()] = {
                    status: 'ERROR',
                    error: error.message
                };
            }

            // Brief pause between tests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Generate comprehensive report
        this.generateMasterReport();
        this.saveReport();
        this.showFinalVerdict();
    }

    generateMasterReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📊 MASTER VALIDATION REPORT');
        console.log('='.repeat(80));

        const agentResults = [
            { name: 'Settings', data: this.testResults.settings },
            { name: 'Chatbot', data: this.testResults.chatbot },
            { name: 'Scraper', data: this.testResults.scraper },
            { name: 'Documents', data: this.testResults.documents }
        ];

        let totalClaimsVerified = 0;
        let totalClaims = 0;
        let totalOperationalTests = 0;
        let totalOperationalPassed = 0;
        let validatedAgents = [];

        agentResults.forEach(agent => {
            console.log(`\n${agent.name} Agent:`);

            if (agent.data.status === 'ERROR') {
                console.log(`  ❌ Test failed to run: ${agent.data.error}`);
                return;
            }

            if (!agent.data.results || !agent.data.results.claims) {
                console.log(`  ⚠️  No results available`);
                return;
            }

            const claims = agent.data.results.claims;
            const operational = agent.data.results.operationalTests || [];

            const claimsPassed = claims.filter(c => c.status === 'PASSED').length;
            const claimsTotal = claims.length;
            const operationalPassed = operational.filter(t => t.status === 'PASSED').length;
            const operationalTotal = operational.length;

            totalClaimsVerified += claimsPassed;
            totalClaims += claimsTotal;
            totalOperationalTests += operationalTotal;
            totalOperationalPassed += operationalPassed;

            const claimRate = claimsTotal > 0 ? (claimsPassed / claimsTotal * 100).toFixed(1) : '0.0';
            const operationalRate = operationalTotal > 0 ? (operationalPassed / operationalTotal * 100).toFixed(1) : '0.0';

            console.log(`  ✅ Claims Verified: ${claimsPassed}/${claimsTotal} (${claimRate}%)`);
            console.log(`  🔧 Operational Tests: ${operationalPassed}/${operationalTotal} (${operationalRate}%)`);

            // Check if agent is validated
            const agentValidated = claimsPassed >= Math.ceil(claimsTotal * 0.8) && // At least 80% of claims
                                 operationalPassed >= Math.ceil(operationalTotal * 0.67); // At least 67% of operational

            if (agentValidated) {
                validatedAgents.push(agent.name);
                console.log(`  🏆 Agent Status: VALIDATED ✅`);
            } else {
                console.log(`  ⚠️  Agent Status: NEEDS WORK ❌`);
            }

            // Show key achievements
            console.log(`  📈 Key Achievements:`);
            claims.filter(c => c.status === 'PASSED').forEach(claim => {
                console.log(`    • ${claim.claim}`);
            });
        });

        // Overall summary
        const overallClaimRate = totalClaims > 0 ? (totalClaimsVerified / totalClaims * 100).toFixed(1) : '0.0';
        const overallOperationalRate = totalOperationalTests > 0 ? (totalOperationalPassed / totalOperationalTests * 100).toFixed(1) : '0.0';

        console.log('\n' + '-'.repeat(80));
        console.log('📈 OVERALL SYSTEM METRICS');
        console.log('-'.repeat(80));
        console.log(`Total Claims Verified: ${totalClaimsVerified}/${totalClaims} (${overallClaimRate}%)`);
        console.log(`Total Operational Tests: ${totalOperationalPassed}/${totalOperationalTests} (${overallOperationalRate}%)`);
        console.log(`Agents Fully Validated: ${validatedAgents.length}/4`);

        // Store summary for final verdict
        this.summary = {
            totalClaimsVerified,
            totalClaims,
            totalOperationalPassed,
            totalOperationalTests,
            validatedAgents,
            overallClaimRate,
            overallOperationalRate
        };
    }

    showFinalVerdict() {
        console.log('\n' + '='.repeat(80));
        console.log('🏆 FINAL CTO VERDICT');
        console.log('='.repeat(80));

        const { validatedAgents, overallClaimRate, overallOperationalRate } = this.summary;

        if (validatedAgents.length === 4) {
            console.log('\n✅ ALL AGENTS VALIDATED - SYSTEM PRODUCTION READY');
            console.log('\n🚀 Next Steps:');
            console.log('  • Deploy to production environment');
            console.log('  • Set up monitoring and alerting');
            console.log('  • Schedule regular security audits');
            console.log('  • Begin performance optimization phase 2');
        } else if (validatedAgents.length >= 3) {
            console.log('\n⚠️  SYSTEM MOSTLY READY - MINOR FIXES NEEDED');
            console.log('\n📋 Action Items:');
            console.log(`  • Fix issues with: ${['Settings', 'Chatbot', 'Scraper', 'Documents'].filter(a => !validatedAgents.includes(a)).join(', ')}`);
            console.log('  • Re-run validation after fixes');
            console.log('  • Can proceed with staging deployment');
        } else if (validatedAgents.length >= 2) {
            console.log('\n❌ SYSTEM NOT READY - MAJOR WORK NEEDED');
            console.log('\n📋 Critical Actions:');
            console.log('  • Fix all failed claims immediately');
            console.log('  • Re-architect if necessary');
            console.log('  • Do not deploy to production');
        } else {
            console.log('\n💥 SYSTEM INCOMPLETE - RECONSTRUCTION REQUIRED');
            console.log('\n📋 Emergency Actions:');
            console.log('  • Halt all deployment plans');
            console.log('  • Re-evaluate agent implementations');
            console.log('  • Consider system redesign');
        }

        // Individual agent recommendations
        console.log('\n📋 AGENT-SPECIFIC RECOMMENDATIONS:');

        if (!validatedAgents.includes('Settings')) {
            console.log('  🔧 Settings Agent: Implement caching and fix performance issues');
        }
        if (!validatedAgents.includes('Chatbot')) {
            console.log('  🤖 Chatbot Agent: Fix authentication and RAG integration');
        }
        if (!validatedAgents.includes('Scraper')) {
            console.log('  🕷️ Scraper Agent: Complete Redis and LLM integration');
        }
        if (!validatedAgents.includes('Documents')) {
            console.log('  📄 Documents Agent: Fix security vulnerabilities');
        }

        console.log('\n📊 Performance Metrics:');
        console.log(`  • Claim Validation Rate: ${overallClaimRate}%`);
        console.log(`  • Operational Success Rate: ${overallOperationalRate}%`);
        console.log(`  • System Readiness: ${(validatedAgents.length / 4 * 100).toFixed(1)}%`);

        console.log(`\n⏰ Test completed at: ${new Date().toISOString()}`);
    }

    saveReport() {
        const fs = require('fs');
        const path = require('path');

        const report = {
            timestamp: new Date().toISOString(),
            type: 'AGENT_VALIDATION_REPORT',
            summary: this.summary,
            results: this.testResults,
            ctoApproved: true
        };

        const reportDir = path.join(__dirname, '../../reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }

        const filename = `agent-validation-report-${Date.now()}.json`;
        const filepath = path.join(reportDir, filename);

        fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
        console.log(`\n📄 Detailed report saved to: reports/${filename}`);

        // Also save latest
        const latestPath = path.join(reportDir, 'latest-agent-validation.json');
        fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
    }
}

// CLI interface
const args = process.argv.slice(2);

if (args.includes('--agent')) {
    const agentName = args[args.indexOf('--agent') + 1];
    const agentClasses = {
        'settings': SettingsAgentTest,
        'chatbot': ChatbotAgentTest,
        'scraper': ScraperAgentTest,
        'documents': DocumentsAgentTest
    };

    if (agentClasses[agentName]) {
        console.log(`Running ${agentName} agent test only...\n`);
        const test = new agentClasses[agentName]();
        test.runFullTest().catch(console.error);
    } else {
        console.log('Invalid agent name. Use: settings, chatbot, scraper, or documents');
    }
} else {
    // Run all tests
    const orchestrator = new AgentTestOrchestrator();
    orchestrator.runAllTests().catch(console.error);
}

module.exports = AgentTestOrchestrator;