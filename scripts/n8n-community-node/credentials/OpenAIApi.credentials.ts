import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class OpenAIApi implements ICredentialType {
  name = 'openAIApi';
  displayName = 'OpenAI API';
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
    },
    {
      displayName: 'Embedding Model',
      name: 'model',
      type: 'string',
      default: 'text-embedding-3-small',
      description: 'OpenAI embedding model to use',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://api.openai.com',
      description: 'Override for compatible API endpoints (e.g., Azure/OpenAI gateways)'
    }
  ];
}

