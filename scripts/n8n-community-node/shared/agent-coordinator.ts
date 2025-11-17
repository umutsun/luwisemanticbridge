import Redis from 'ioredis';

interface AgentTask {
  agent: string;
  task: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  progress: number;
  blockers?: string[];
  dependencies?: string[];
  output?: any;
}

interface AgentMessage {
  from: string;
  to: string | 'all';
  type: 'task-update' | 'help-needed' | 'code-ready' | 'review-request';
  data: any;
  timestamp: Date;
}

export class AgentCoordinator {
  private redis: Redis;
  private projectKey = 'asemb:phase3';

  constructor() {
    this.redis = new Redis({
      host: 'localhost',
      port: 6379,
      db: 2
    });
  }

  // Task Management
  async updateTaskStatus(agent: string, taskId: string, update: Partial<AgentTask>) {
    const key = `${this.projectKey}:tasks:${agent}:${taskId}`;
    await this.redis.hmset(key, update as any);
    await this.publishUpdate(agent, 'task-update', { taskId, ...update });
  }

  async getAgentTasks(agent: string): Promise<AgentTask[]> {
    const pattern = `${this.projectKey}:tasks:${agent}:*`;
    const keys = await this.redis.keys(pattern);
    const tasks = [];
    
    for (const key of keys) {
      const task = await this.redis.hgetall(key);
      tasks.push(task as any);
    }
    
    return tasks;
  }

  // Inter-agent Communication
  async sendMessage(message: AgentMessage) {
    const channel = message.to === 'all' 
      ? `${this.projectKey}:broadcast`
      : `${this.projectKey}:${message.to}`;
    
    await this.redis.publish(channel, JSON.stringify(message));
    await this.redis.lpush(`${this.projectKey}:messages`, JSON.stringify(message));
  }

  async subscribeToMessages(agent: string, callback: (message: AgentMessage) => void) {
    const subscriber = new Redis();
    
    // Subscribe to direct messages and broadcasts
    await subscriber.subscribe(
      `${this.projectKey}:${agent}`,
      `${this.projectKey}:broadcast`
    );
    
    subscriber.on('message', (channel, message) => {
      callback(JSON.parse(message));
    });
  }

  // Progress Tracking
  async updateOverallProgress() {
    const agents = ['claude', 'gemini', 'codex', 'deepseek'];
    let totalProgress = 0;
    
    for (const agent of agents) {
      const tasks = await this.getAgentTasks(agent);
      const agentProgress = tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length;
      totalProgress += agentProgress;
    }
    
    const overallProgress = totalProgress / agents.length;
    await this.redis.set(`${this.projectKey}:progress`, overallProgress);
    
    return overallProgress;
  }

  // Helper method
  private async publishUpdate(agent: string, type: string, data: any) {
    await this.redis.publish(`${this.projectKey}:updates`, JSON.stringify({
      agent,
      type,
      data,
      timestamp: new Date()
    }));
  }
}
