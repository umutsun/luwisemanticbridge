const redis = require('redis');

// Redis client oluştur
const client = redis.createClient({
    socket: {
        host: 'localhost',
        port: 6380
    },
    password: 'redis_password_2025',
    database: 2
});

async function initializeAgentStates() {
    try {
        await client.connect();
        console.log('✅ Redis bağlantısı başarılı!');

        // Agent states
        const agents = [
            { 
                key: 'asemb-claude-project',
                name: 'Claude (CTO)',
                role: 'CTO & Lead Architect',
                status: 'active'
            },
            { 
                key: 'asemb-gemini-project',
                name: 'Gemini',
                role: 'Frontend & UX Lead',
                status: 'active'
            },
            { 
                key: 'asemb-codex-project',
                name: 'Codex',
                role: 'Backend & Infrastructure',
                status: 'active'
            }
        ];

        // Her agent için state initialize et
        for (const agent of agents) {
            // Agent state
            const state = {
                agent_name: agent.name,
                role: agent.role,
                status: agent.status,
                last_active: new Date().toISOString(),
                current_tasks: [],
                completed_tasks: [],
                health: 'healthy'
            };
            
            await client.set(`asemb:${agent.key}:state`, JSON.stringify(state));
            console.log(`✅ ${agent.name} state initialized`);

            // Task queue
            await client.del(`asemb:${agent.key}:tasks`);
            
            // Message queue
            await client.del(`asemb:${agent.key}:messages`);
            
            // Health heartbeat
            await client.setEx(`asemb:${agent.key}:health:${agent.name.toLowerCase()}`, 300, 'healthy');
        }

        // Initial tasks
        const initialTasks = [
            {
                id: 'TASK-001',
                title: 'Docker Health Check Implementation',
                assigned_to: 'claude',
                priority: 5,
                status: 'pending',
                created_at: new Date().toISOString()
            },
            {
                id: 'TASK-002', 
                title: 'Frontend Component Audit',
                assigned_to: 'gemini',
                priority: 4,
                status: 'pending',
                created_at: new Date().toISOString()
            },
            {
                id: 'TASK-003',
                title: 'API Endpoint Documentation',
                assigned_to: 'codex',
                priority: 4,
                status: 'pending',
                created_at: new Date().toISOString()
            }
        ];

        // Task'ları queue'lara ekle
        for (const task of initialTasks) {
            const agentKey = `asemb-${task.assigned_to}-project`;
            await client.rPush(`asemb:${agentKey}:tasks`, JSON.stringify(task));
        }

        console.log('✅ Initial tasks assigned');

        // System message
        const systemMessage = {
            from: 'system',
            to: 'broadcast',
            type: 'update',
            timestamp: new Date().toISOString(),
            data: {
                message: 'Luwi Semantic Bridge (ASEMB) initialized. All agents are online.',
                version: '1.0.0'
            },
            priority: 5
        };

        // Broadcast to all agents
        for (const agent of agents) {
            await client.rPush(`asemb:${agent.key}:messages`, JSON.stringify(systemMessage));
        }

        console.log('✅ System message broadcasted');
        
        // Summary
        console.log('\n🚀 Luwi Semantic Bridge(ASEMB) Agent System Initialized!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Agents Online:');
        agents.forEach(a => console.log(`  • ${a.name} - ${a.role}`));
        console.log('\nInitial Tasks Assigned:');
        initialTasks.forEach(t => console.log(`  • ${t.title} → ${t.assigned_to}`));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
        console.error('❌ Redis initialization error:', error);
    } finally {
        await client.quit();
    }
}

// Initialize
initializeAgentStates();
