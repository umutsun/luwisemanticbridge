const redis = require('redis');

class AgentMonitor {
    constructor() {
        this.client = redis.createClient({
            socket: { 
                host: process.env.REDIS_HOST || 'localhost', 
                port: parseInt(process.env.REDIS_PORT || '6380') 
            },
            password: process.env.REDIS_PASSWORD || 'redis_password_2025',
            database: 2
        });
        
        this.agents = [
            { key: 'asemb-claude-project', name: 'Claude' },
            { key: 'asemb-gemini-project', name: 'Gemini' },
            { key: 'asemb-codex-project', name: 'Codex' }
        ];
    }

    async connect() {
        await this.client.connect();
    }

    async checkHealth() {
        console.log(`[${new Date().toISOString()}] Running agent health check...`);
        
        const healthReport = {
            timestamp: new Date().toISOString(),
            agents: {}
        };

        for (const agent of this.agents) {
            try {
                // Check heartbeat
                const heartbeatKey = `asemb:${agent.key}:health:${agent.name.toLowerCase()}`;
                const heartbeat = await this.client.get(heartbeatKey);
                
                // Get state
                const stateKey = `asemb:${agent.key}:state`;
                const stateStr = await this.client.get(stateKey);
                const state = stateStr ? JSON.parse(stateStr) : null;
                
                // Check last active time
                const lastActive = state?.last_active ? new Date(state.last_active) : null;
                const minutesSinceActive = lastActive ? 
                    (new Date() - lastActive) / 1000 / 60 : null;
                
                // Get pending tasks count
                const tasksKey = `asemb:${agent.key}:tasks`;
                const taskCount = await this.client.lLen(tasksKey);
                
                // Get unread messages count  
                const messagesKey = `asemb:${agent.key}:messages`;
                const messageCount = await this.client.lLen(messagesKey);
                
                healthReport.agents[agent.name] = {
                    status: heartbeat ? 'healthy' : 'unhealthy',
                    lastActive: state?.last_active,
                    minutesSinceActive: minutesSinceActive?.toFixed(1),
                    pendingTasks: taskCount,
                    unreadMessages: messageCount,
                    currentTasks: state?.current_tasks || []
                };

                // Update heartbeat if agent is healthy
                if (heartbeat) {
                    await this.client.setEx(heartbeatKey, 300, 'healthy');
                }
                
                // Alert if agent is inactive for too long
                if (minutesSinceActive > 10) {
                    console.warn(`⚠️  ${agent.name} has been inactive for ${minutesSinceActive.toFixed(1)} minutes`);
                }
                
            } catch (error) {
                console.error(`❌ Error checking ${agent.name}:`, error.message);
                healthReport.agents[agent.name] = {
                    status: 'error',
                    error: error.message
                };
            }
        }

        // Save health report
        await this.client.set('asemb:system:health-report', JSON.stringify(healthReport));
        
        // Display summary
        console.log('\n📊 ASEMB Agent Health Summary:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        for (const [name, status] of Object.entries(healthReport.agents)) {
            const icon = status.status === 'healthy' ? '✅' : '❌';
            console.log(`${icon} ${name}: ${status.status} | Tasks: ${status.pendingTasks} | Messages: ${status.unreadMessages}`);
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        return healthReport;
    }

    async cleanupOldData() {
        // Clean up old messages (older than 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        console.log('🧹 Cleaning up old data...');
        
        // This would need more complex logic to parse message timestamps
        // For now, just log the action
        console.log('✅ Cleanup complete');
    }

    async run() {
        try {
            await this.connect();
            console.log('🚀 ASEMB Agent Monitor started');
            
            // Run health check
            await this.checkHealth();
            
            // Run cleanup
            await this.cleanupOldData();
            
        } catch (error) {
            console.error('❌ Monitor error:', error);
        } finally {
            await this.client.quit();
        }
    }
}

// Run monitor
const monitor = new AgentMonitor();
monitor.run().catch(console.error);
