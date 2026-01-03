import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class LuwiSemanticBridgeApi implements ICredentialType {
  name = 'luwiSemanticBridgeApi';
  displayName = 'Luwi Semantic Bridge API';
  documentationUrl = 'https://luwi.dev';
  properties: INodeProperties[] = [
    {
      displayName: 'PostgreSQL Host',
      name: 'pgHost',
      type: 'string',
      default: 'localhost',
    },
    {
      displayName: 'PostgreSQL Port',
      name: 'pgPort',
      type: 'number',
      default: 5432,
    },
    {
      displayName: 'PostgreSQL Database',
      name: 'pgDatabase',
      type: 'string',
      default: 'postgres',
    },
    {
      displayName: 'PostgreSQL User',
      name: 'pgUser',
      type: 'string',
      default: 'postgres',
    },
    {
      displayName: 'PostgreSQL Password',
      name: 'pgPassword',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
    },
    {
      displayName: 'PostgreSQL SSL',
      name: 'pgSsl',
      type: 'boolean',
      default: false,
    },
    {
      displayName: 'OpenAI API Key',
      name: 'openaiApiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
    },
  ];
}