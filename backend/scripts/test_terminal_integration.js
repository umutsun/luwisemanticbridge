#!/usr/bin/env node

/**
 * Terminal Integration Test Script
 * 
 * This script tests the terminal console integration
 * with WebSocket log streaming.
 */

const WebSocket = require('ws');
const http = require('http');

const WS_URL = 'ws://localhost:8084';
const HTTP_URL = 'http://localhost:8083';

class TerminalIntegrationTester {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.testResults = [];
    }

    async runTests() {
        console.log('🧪 Starting Terminal Integration Tests...\n');

        // Test 1: Check HTTP Server
        await this.testHttpServer();

        // Test 2: Test WebSocket Connection
        await this.testWebSocketConnection();

        // Test 3: Test Log Broadcasting
        await this.testLogBroadcasting();

        // Test 4: Test Command Execution
        await this.testCommandExecution();

        // Test 5: Test Filter Functionality
        await this.testFilterFunctionality();

        // Print results
        this.printResults();
    }

    async testHttpServer() {
        console.log('📡 Testing HTTP Server...');

        return new Promise((resolve) => {
            const req = http.get(`${HTTP_URL}/api/v2/websocket-log-stream/status`, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const response = JSON.parse(data);
                        if (response.status === 'running') {
                            this.addTestResult('HTTP Server Status', true, 'Server is running');
                            console.log('✅ HTTP Server is running');
                        } else {
                            this.addTestResult('HTTP Server Status', false, 'Server not running');
                            console.log('❌ HTTP Server is not running');
                        }
                    } catch (error) {
                        this.addTestResult('HTTP Server Status', false, `Error: ${error.message}`);
                        console.log('❌ Failed to parse HTTP response');
                    }
                    resolve();
                });
            });

            req.on('error', (error) => {
                this.addTestResult('HTTP Server Status', false, `Connection error: ${error.message}`);
                console.log('❌ Failed to connect to HTTP server');
                resolve();
            });

            req.setTimeout(5000, () => {
                req.destroy();
                this.addTestResult('HTTP Server Status', false, 'Request timeout');
                console.log('❌ HTTP server request timeout');
                resolve();
            });
        });
    }

    async testWebSocketConnection() {
        console.log('\n🔌 Testing WebSocket Connection...');

        return new Promise((resolve) => {
            this.ws = new WebSocket(WS_URL);

            const timeout = setTimeout(() => {
                this.addTestResult('WebSocket Connection', false, 'Connection timeout');
                console.log('❌ WebSocket connection timeout');
                resolve();
            }, 5000);

            this.ws.on('open', () => {
                clearTimeout(timeout);
                this.connected = true;
                this.addTestResult('WebSocket Connection', true, 'Connected successfully');
                console.log('✅ WebSocket connected successfully');
                resolve();
            });

            this.ws.on('error', (error) => {
                clearTimeout(timeout);
                this.addTestResult('WebSocket Connection', false, `Connection error: ${error.message}`);
                console.log('❌ WebSocket connection failed:', error.message);
                resolve();
            });
        });
    }

    async testLogBroadcasting() {
        console.log('\n📢 Testing Log Broadcasting...');

        if (!this.connected) {
            this.addTestResult('Log Broadcasting', false, 'WebSocket not connected');
            console.log('❌ Cannot test log broadcasting - WebSocket not connected');
            return;
        }

        return new Promise((resolve) => {
            let receivedLogs = 0;
            const expectedLogs = 3;

            const messageHandler = (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'log') {
                        receivedLogs++;
                        console.log(`📝 Received log: ${message.data.message}`);

                        if (receivedLogs >= expectedLogs) {
                            this.ws.removeListener('message', messageHandler);
                            this.addTestResult('Log Broadcasting', true, `Received ${receivedLogs}/${expectedLogs} logs`);
                            console.log('✅ Log broadcasting test completed');
                            resolve();
                        }
                    }
                } catch (error) {
                    console.error('Failed to parse log message:', error);
                }
            };

            this.ws.on('message', messageHandler);

            // Send test logs via HTTP API
            setTimeout(() => {
                this.sendTestLog('info', 'Test log 1 - Integration test', 'test');
            }, 1000);

            setTimeout(() => {
                this.sendTestLog('warning', 'Test log 2 - Warning message', 'test');
            }, 1500);

            setTimeout(() => {
                this.sendTestLog('error', 'Test log 3 - Error message', 'test');
            }, 2000);

            // Timeout if not all logs received
            setTimeout(() => {
                this.ws.removeListener('message', messageHandler);
                if (receivedLogs < expectedLogs) {
                    this.addTestResult('Log Broadcasting', false, `Only received ${receivedLogs}/${expectedLogs} logs`);
                    console.log(`❌ Log broadcasting incomplete - only received ${receivedLogs}/${expectedLogs} logs`);
                }
                resolve();
            }, 10000);
        });
    }

    async testCommandExecution() {
        console.log('\n⚡ Testing Command Execution...');

        if (!this.connected) {
            this.addTestResult('Command Execution', false, 'WebSocket not connected');
            console.log('❌ Cannot test command execution - WebSocket not connected');
            return;
        }

        return new Promise((resolve) => {
            let commandResponse = null;

            const messageHandler = (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'command_response') {
                        commandResponse = message;
                        this.ws.removeListener('message', messageHandler);

                        if (message.data.success) {
                            this.addTestResult('Command Execution', true, `Command executed: ${message.data.command}`);
                            console.log(`✅ Command executed successfully: ${message.data.command}`);
                        } else {
                            this.addTestResult('Command Execution', false, `Command failed: ${message.data.error}`);
                            console.log(`❌ Command failed: ${message.data.error}`);
                        }
                        resolve();
                    }
                } catch (error) {
                    console.error('Failed to parse command response:', error);
                }
            };

            this.ws.on('message', messageHandler);

            // Send test command
            const testCommand = {
                type: 'command',
                data: {
                    command: 'help',
                    args: []
                }
            };

            this.ws.send(JSON.stringify(testCommand));

            // Timeout if no response
            setTimeout(() => {
                this.ws.removeListener('message', messageHandler);
                if (!commandResponse) {
                    this.addTestResult('Command Execution', false, 'No response received');
                    console.log('❌ No command response received');
                }
                resolve();
            }, 5000);
        });
    }

    async testFilterFunctionality() {
        console.log('\n🔍 Testing Filter Functionality...');

        if (!this.connected) {
            this.addTestResult('Filter Functionality', false, 'WebSocket not connected');
            console.log('❌ Cannot test filter functionality - WebSocket not connected');
            return;
        }

        return new Promise((resolve) => {
            let filterResponse = null;

            const messageHandler = (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if (message.type === 'filter_response') {
                        filterResponse = message;
                        this.ws.removeListener('message', messageHandler);

                        if (message.data.success) {
                            this.addTestResult('Filter Functionality', true, `Filter applied: ${message.data.filter}`);
                            console.log(`✅ Filter applied successfully: ${message.data.filter}`);
                        } else {
                            this.addTestResult('Filter Functionality', false, `Filter failed: ${message.data.error}`);
                            console.log(`❌ Filter failed: ${message.data.error}`);
                        }
                        resolve();
                    }
                } catch (error) {
                    console.error('Failed to parse filter response:', error);
                }
            };

            this.ws.on('message', messageHandler);

            // Send test filter
            const testFilter = {
                type: 'filter',
                data: {
                    filter: {
                        level: 'info',
                        search: 'test'
                    }
                }
            };

            this.ws.send(JSON.stringify(testFilter));

            // Timeout if no response
            setTimeout(() => {
                this.ws.removeListener('message', messageHandler);
                if (!filterResponse) {
                    this.addTestResult('Filter Functionality', false, 'No response received');
                    console.log('❌ No filter response received');
                }
                resolve();
            }, 5000);
        });
    }

    sendTestLog(level, message, source) {
        const postData = JSON.stringify({
            level,
            message,
            source
        });

        const options = {
            hostname: 'localhost',
            port: HTTP_PORT,
            path: '/api/v2/websocket-log-stream/broadcast',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            // Ignore response for test purposes
        });

        req.on('error', (error) => {
            console.error('Failed to send test log:', error);
        });

        req.write(postData);
        req.end();
    }

    addTestResult(testName, success, details) {
        this.testResults.push({
            name: testName,
            success,
            details,
            timestamp: new Date().toISOString()
        });
    }

    printResults() {
        console.log('\n📊 Test Results Summary:');
        console.log('='.repeat(50));

        const passed = this.testResults.filter(r => r.success).length;
        const total = this.testResults.length;

        this.testResults.forEach(result => {
            const status = result.success ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.name}: ${result.details}`);
        });

        console.log('='.repeat(50));
        console.log(`Total: ${passed}/${total} tests passed`);

        if (passed === total) {
            console.log('🎉 All tests passed! Terminal integration is working correctly.');
        } else {
            console.log('⚠️  Some tests failed. Please check the terminal configuration.');
        }

        // Close WebSocket connection
        if (this.ws && this.connected) {
            this.ws.close();
        }
    }
}

// Run tests if this script is executed directly
if (require.main === module) {
    const tester = new TerminalIntegrationTester();
    tester.runTests().catch(console.error);
}

module.exports = TerminalIntegrationTester;