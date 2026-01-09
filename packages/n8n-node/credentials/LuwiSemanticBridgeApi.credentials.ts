import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class LuwiSemanticBridgeApi implements ICredentialType {
  name = 'luwiSemanticBridgeApi';
  displayName = 'Luwi Semantic Bridge API';
  documentationUrl = 'https://luwi.dev';
  properties: INodeProperties[] = [
    // Luwi API Configuration
    {
      displayName: 'Luwi API URL',
      name: 'luwiApiUrl',
      type: 'string',
      default: 'https://vergilex.luwi.dev',
      placeholder: 'https://your-instance.luwi.dev',
      description: 'Base URL of your Luwi instance (e.g., https://vergilex.luwi.dev)',
    },
    {
      displayName: 'Luwi API Token',
      name: 'luwiApiToken',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      description: 'JWT token for authentication. Get this from your Luwi dashboard settings.',
    },
    // OpenAI for media generation
    {
      displayName: 'OpenAI API Key',
      name: 'openaiApiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      description: 'OpenAI API key for image and audio generation (optional)',
    },
  ];
}
