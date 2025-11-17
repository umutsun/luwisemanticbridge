import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AliceSemanticBridgeApi implements ICredentialType {
	name = 'aliceSemanticBridgeApi';
	displayName = 'Alice Semantic Bridge API';
	documentationUrl = 'https://github.com/alice-semantic-bridge/docs';
	properties: INodeProperties[] = [
		{
			displayName: 'Configuration Type',
			name: 'configurationType',
			type: 'options',
			options: [
				{
					name: 'Complete Setup',
					value: 'complete',
					description: 'Configure all services (PostgreSQL, OpenAI, Redis)',
				},
				{
					name: 'Basic Setup',
					value: 'basic',
					description: 'Configure only required services (PostgreSQL, OpenAI)',
				},
			],
			default: 'complete',
			noDataExpression: true,
		},
		// PostgreSQL Configuration (Required)
		{
			displayName: 'PostgreSQL Host',
			name: 'postgresHost',
			type: 'string',
			default: 'localhost',
			required: true,
			description: 'PostgreSQL database host',
		},
		{
			displayName: 'PostgreSQL Port',
			name: 'postgresPort',
			type: 'number',
			default: 5432,
			required: true,
			description: 'PostgreSQL database port',
		},
		{
			displayName: 'PostgreSQL Database',
			name: 'postgresDatabase',
			type: 'string',
			default: 'asemb',
			required: true,
			description: 'PostgreSQL database name',
		},
		{
			displayName: 'PostgreSQL User',
			name: 'postgresUser',
			type: 'string',
			default: 'asemb_user',
			required: true,
			description: 'PostgreSQL username',
		},
		{
			displayName: 'PostgreSQL Password',
			name: 'postgresPassword',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'PostgreSQL password',
		},
		// OpenAI Configuration (Required)
		{
			displayName: 'OpenAI API Key',
			name: 'openAiApiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'OpenAI API key for embeddings',
		},
		{
			displayName: 'Embedding Model',
			name: 'embeddingModel',
			type: 'options',
			options: [
				{
					name: 'text-embedding-3-small',
					value: 'text-embedding-3-small',
				},
				{
					name: 'text-embedding-3-large',
					value: 'text-embedding-3-large',
				},
				{
					name: 'text-embedding-ada-002',
					value: 'text-embedding-ada-002',
				},
			],
			default: 'text-embedding-3-small',
			description: 'OpenAI embedding model to use',
		},
		// Redis Configuration (Optional)
		{
			displayName: 'Redis Host',
			name: 'redisHost',
			type: 'string',
			default: 'localhost',
			displayOptions: {
				show: {
					configurationType: ['complete'],
				},
			},
			description: 'Redis server host',
		},
		{
			displayName: 'Redis Port',
			name: 'redisPort',
			type: 'number',
			default: 6379,
			displayOptions: {
				show: {
					configurationType: ['complete'],
				},
			},
			description: 'Redis server port',
		},
		{
			displayName: 'Redis Password',
			name: 'redisPassword',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			displayOptions: {
				show: {
					configurationType: ['complete'],
				},
			},
			description: 'Redis password (if required)',
		},
		{
			displayName: 'Redis Database',
			name: 'redisDb',
			type: 'number',
			default: 0,
			displayOptions: {
				show: {
					configurationType: ['complete'],
				},
			},
			description: 'Redis database index (0-15)',
		},
		// Advanced Settings
		{
			displayName: 'Connection Pool Size',
			name: 'poolSize',
			type: 'number',
			default: 20,
			description: 'Maximum number of database connections',
		},
		{
			displayName: 'Request Timeout',
			name: 'requestTimeout',
			type: 'number',
			default: 30000,
			description: 'Request timeout in milliseconds',
		},
	];
}
