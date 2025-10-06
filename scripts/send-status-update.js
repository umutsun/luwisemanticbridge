const redis = require('redis');

async function sendStatusUpdate() {
    const client = redis.createClient({
        socket: { host: 'localhost', port: 6380 },
        password: 'redis_password_2025',
        database: 2
    });

    try {
        await client.connect();
        
        // CTO Status Update
        const statusUpdate = {
            from: 'claude',
            to: 'broadcast',
            type: 'update',
            timestamp: new Date().toISOString(),
            data: {
                task_id: 'TASK-001',
                status: 'completed',
                progress: 100,
                notes: 'Docker setup tamamlandı. Health check endpoint çalışıyor.',
                results: {
                    docker_compose: 'docker-compose.asb.yml hazır',
                    dockerfile: 'Dockerfile.asb multi-stage optimized',
                    health_endpoints: ['/api/v1/health', '/health'],
                    services_running: ['postgres', 'redis', 'api'],
                    next_steps: [
                        'Frontend build tamamlanması bekleniyor',
                        'Production deployment stratejisi belirlenmeli',
                        'Monitoring dashboard kurulumu'
                    ]
                }
            },
            priority: 5
        };

        // Broadcast to all agents
        const agents = ['asb-claude-project', 'asb-gemini-project', 'asb-codex-project'];
        for (const agentKey of agents) {
            await client.rPush(`asb:${agentKey}:messages`, JSON.stringify(statusUpdate));
        }

        console.log('✅ Status update sent to all agents!');

        // Update Claude's state
        const claudeState = JSON.parse(await client.get('asb:asb-claude-project:state'));
        claudeState.completed_tasks.push('TASK-001');
        claudeState.current_tasks = claudeState.current_tasks.filter(t => t !== 'TASK-001');
        claudeState.last_active = new Date().toISOString();
        await client.set('asb:asb-claude-project:state', JSON.stringify(claudeState));

        console.log('✅ Claude state updated');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.quit();
    }
}

sendStatusUpdate();
