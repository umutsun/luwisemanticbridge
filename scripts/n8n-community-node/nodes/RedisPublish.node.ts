import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';
import Redis from 'ioredis';

interface RedisCreds { host: string; port: number; password?: string; db?: number }

function createRedisClient(creds: RedisCreds): Redis {
  return new Redis({
    host: creds.host,
    port: creds.port,
    password: creds.password,
    db: creds.db,
    // Add some resilience
    retryStrategy: times => Math.min(times * 50, 2000),
  });
}


export class RedisPublish implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Redis Publish',
    name: 'redisPublish',
    group: ['transform'],
    version: 1,
    description: 'Publish a message to a Redis channel',
    defaults: { name: 'Redis Publish' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [ { name: 'redisApi', required: true } ],
    properties: [
      { displayName: 'Channel', name: 'channel', type: 'string', default: '', required: true },
      { displayName: 'Message Field (from item)', name: 'messageField', type: 'string', default: 'message', description: 'Path to message in item JSON' }
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const channel = this.getNodeParameter('channel', 0) as string;
    const messageField = (this.getNodeParameter('messageField', 0) as string) || 'message';

    const creds = (await this.getCredentials('redisApi')) as unknown as RedisCreds;
    const redis = createRedisClient(creds);

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]?.json || {};
        const message = messageField.split('.').reduce((acc: any, k: string) => acc?.[k], item);
        if (typeof message === 'undefined') throw new NodeOperationError(this.getNode(), 'Message not found on item', { itemIndex: i });
        await redis.publish(channel, typeof message === 'string' ? message : JSON.stringify(message));
      }
      await redis.quit();
      return [items];
    } catch (err) {
      throw new NodeOperationError(this.getNode(), (err as Error).message);
    }
  }
}
