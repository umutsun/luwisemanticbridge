#!/usr/bin/env ts-node

/**
 * WebSocket Log Stream Test Script
 *
 * This script tests the WebSocket log stream functionality
 * by connecting to the existing service and sending test commands.
 */

import WebSocket from 'ws';

const WS_PORT = 8084;
const WS_URL = `ws://localhost:${WS_PORT}/ws/logs`;

async function testWebSocketLogStream() {
    console.log('🧪 Testing WebSocket Log Stream Service...');
    console.log(`🔌 Connecting to ${WS_URL}...`);

    // Create a test client
    const ws = new WebSocket(WS_URL);

    return new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
            console.log('✅ Test client connected');

            // Test commands
            setTimeout(() => {
                console.log('🎮 Testing commands...');

                // Test status command
                ws.send(JSON.stringify({
                    type: 'command',
                    data: {
                        command: 'status',
                        args: []
                    }
                }));

                // Test logs command
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'command',
                        data: {
                            command: 'logs',
                            args: []
                        }
                    }));
                }, 1000);

                // Test stats command
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'command',
                        data: {
                            command: 'stats',
                            args: []
                        }
                    }));
                }, 2000);

                // Test health command
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'command',
                        data: {
                            command: 'health',
                            args: []
                        }
                    }));
                }, 3000);

                // Test services command
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'command',
                        data: {
                            command: 'services',
                            args: []
                        }
                    }));
                }, 4000);

                // Test filter update
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'filter',
                        data: {
                            level: ['error', 'warn'],
                            source: ['backend']
                        }
                    }));
                }, 5000);

                // Test ping
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'ping',
                        timestamp: new Date().toISOString()
                    }));
                }, 6000);

                // Test disconnect after 8 seconds
                setTimeout(() => {
                    console.log('🔌 Disconnecting test client...');
                    ws.close();
                    resolve();
                }, 8000);

            }, 1000);
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log('📨 Received:', message.type);

                if (message.data) {
                    if (typeof message.data === 'object') {
                        console.log('   Data:', JSON.stringify(message.data, null, 2));
                    } else {
                        console.log('   Data:', message.data);
                    }
                }
            } catch (error) {
                console.log('📨 Received (raw):', data.toString());
            }
        });

        ws.on('close', () => {
            console.log('🔌 Test client disconnected');
            resolve();
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket error:', error);
            reject(error);
        });

        // Timeout after 15 seconds
        setTimeout(() => {
            console.log('⏰ Test timeout, closing connection...');
            ws.close();
            resolve();
        }, 15000);
    });
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

// Run the test
if (require.main === module) {
    testWebSocketLogStream()
        .then(() => {
            console.log('✅ Test completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Test failed:', error);
            process.exit(1);
        });
}

export { testWebSocketLogStream };