// ASB-CLI MCP Bridge for Agent Shared Memory
const redis = require('redis');
const { EventEmitter } = require('events');

class ASBSharedMemory extends EventEmitter {
  constructor(projectKey = 'alice-semantic-bridge') {
    super();
    this.projectKey = projectKey;
    this.client = null;
    this.pubClient = null;
    this.subClient = null;
  }

  async connect() {
    // Main client for get/set operations
    this.client = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: process.env.REDIS_DB || 2
    });

    // Pub/Sub clients for real-time communication
    this.pubClient = this.client.duplicate();
    this.subClient = this.client.duplicate();

    await Promise.all([
      this.client.connect(),
      this.pubClient.connect(),
      this.subClient.connect()
    ]);

    // Subscribe to agent messages
    await this.subClient.subscribe(`${this.projectKey}:messages`, (message) => {
      this.emit('message', JSON.parse(message));
    });

    console.log(`✅ Connected to ASB Shared Memory (Project: ${this.projectKey})`);
  }

  // Agent registration
  async registerAgent(agentName, capabilities = []) {
    const agentData = {
      name: agentName,
      status: 'active',
      capabilities,
      registeredAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString()
    };

    await this.client.set(
      `${this.projectKey}:agent:${agentName}`,
      JSON.stringify(agentData)
    );

    // Notify other agents
    await this.broadcast({
      type: 'agent_registered',
      agent: agentName,
      capabilities
    });

    return agentData;
  }

  // Get all active agents
  async getAgents() {
    const pattern = `${this.projectKey}:agent:*`;
    const keys = await this.client.keys(pattern);
    const agents = [];

    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        agents.push(JSON.parse(data));
      }
    }

    return agents;
  }

  // Share context between agents
  async setContext(key, value, ttl = null) {
    const fullKey = `${this.projectKey}:context:${key}`;
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttl) {
      await this.client.setEx(fullKey, ttl, data);
    } else {
      await this.client.set(fullKey, data);
    }

    // Notify agents of context update
    await this.broadcast({
      type: 'context_updated',
      key,
      timestamp: new Date().toISOString()
    });

    return { key: fullKey, stored: true };
  }

  // Get shared context
  async getContext(key) {
    const fullKey = `${this.projectKey}:context:${key}`;
    const data = await this.client.get(fullKey);
    
    if (!data) return null;
    
    try {
      return JSON.parse(data);
    } catch {
      return data; // Return as string if not JSON
    }
  }

  // Task queue for agent coordination
  async queueTask(taskType, taskData) {
    const task = {
      id: `${taskType}-${Date.now()}`,
      type: taskType,
      data: taskData,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    await this.client.lPush(
      `${this.projectKey}:queue:${taskType}`,
      JSON.stringify(task)
    );

    // Notify agents
    await this.broadcast({
      type: 'task_queued',
      taskType,
      taskId: task.id
    });

    return task;
  }

  // Get next task from queue
  async getNextTask(taskType) {
    const data = await this.client.rPop(`${this.projectKey}:queue:${taskType}`);
    
    if (!data) return null;
    
    const task = JSON.parse(data);
    task.status = 'processing';
    
    // Store task in processing set
    await this.client.set(
      `${this.projectKey}:processing:${task.id}`,
      JSON.stringify(task),
      { EX: 3600 } // 1 hour TTL
    );

    return task;
  }

  // Complete a task
  async completeTask(taskId, result) {
    const processingKey = `${this.projectKey}:processing:${taskId}`;
    const taskData = await this.client.get(processingKey);
    
    if (!taskData) {
      throw new Error(`Task ${taskId} not found`);
    }

    const task = JSON.parse(taskData);
    task.status = 'completed';
    task.result = result;
    task.completedAt = new Date().toISOString();

    // Store in completed tasks
    await this.client.set(
      `${this.projectKey}:completed:${taskId}`,
      JSON.stringify(task),
      { EX: 86400 } // 24 hours TTL
    );

    // Remove from processing
    await this.client.del(processingKey);

    // Notify agents
    await this.broadcast({
      type: 'task_completed',
      taskId,
      taskType: task.type
    });

    return task;
  }

  // Broadcast message to all agents
  async broadcast(message) {
    await this.pubClient.publish(
      `${this.projectKey}:messages`,
      JSON.stringify({
        ...message,
        timestamp: new Date().toISOString()
      })
    );
  }

  // Send direct message to specific agent
  async sendToAgent(agentName, message) {
    await this.pubClient.publish(
      `${this.projectKey}:agent:${agentName}:messages`,
      JSON.stringify({
        ...message,
        to: agentName,
        timestamp: new Date().toISOString()
      })
    );
  }

  // Heartbeat to keep agent alive
  async heartbeat(agentName) {
    const key = `${this.projectKey}:agent:${agentName}`;
    const data = await this.client.get(key);
    
    if (data) {
      const agentData = JSON.parse(data);
      agentData.lastHeartbeat = new Date().toISOString();
      await this.client.set(key, JSON.stringify(agentData));
    }
  }

  // Clean up inactive agents
  async cleanupInactiveAgents(maxInactiveMs = 300000) { // 5 minutes
    const agents = await this.getAgents();
    const now = Date.now();
    const cleaned = [];

    for (const agent of agents) {
      const lastHeartbeat = new Date(agent.lastHeartbeat).getTime();
      
      if (now - lastHeartbeat > maxInactiveMs) {
        await this.client.del(`${this.projectKey}:agent:${agent.name}`);
        cleaned.push(agent.name);
      }
    }

    if (cleaned.length > 0) {
      await this.broadcast({
        type: 'agents_cleaned',
        agents: cleaned
      });
    }

    return cleaned;
  }

  // Get project stats
  async getStats() {
    const agents = await this.getAgents();
    const contextKeys = await this.client.keys(`${this.projectKey}:context:*`);
    const queueKeys = await this.client.keys(`${this.projectKey}:queue:*`);
    
    const queueLengths = {};
    for (const key of queueKeys) {
      const taskType = key.split(':').pop();
      queueLengths[taskType] = await this.client.lLen(key);
    }

    return {
      projectKey: this.projectKey,
      activeAgents: agents.length,
      agents: agents.map(a => ({ name: a.name, status: a.status })),
      contextKeys: contextKeys.length,
      queues: queueLengths,
      timestamp: new Date().toISOString()
    };
  }

  // Disconnect
  async disconnect() {
    await this.subClient.unsubscribe();
    await Promise.all([
      this.client.quit(),
      this.pubClient.quit(),
      this.subClient.quit()
    ]);
    console.log('Disconnected from ASB Shared Memory');
  }
}

module.exports = ASBSharedMemory;
