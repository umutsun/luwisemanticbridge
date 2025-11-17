import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class RedisApi implements ICredentialType {
  name = 'redisApi';
  displayName = 'Redis';
  properties: INodeProperties[] = [
    {
      displayName: 'Host',
      name: 'host',
      type: 'string',
      default: 'localhost',
      required: true,
    },
    {
      displayName: 'Port',
      name: 'port',
      type: 'number',
      default: 6379,
      required: true,
    },
    {
      displayName: 'Password',
      name: 'password',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
    {
      displayName: 'DB',
      name: 'db',
      type: 'number',
      default: 0,
      description: 'Optional logical database index to select'
    }
  ];
}

