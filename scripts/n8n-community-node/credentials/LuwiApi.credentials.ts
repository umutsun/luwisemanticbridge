/**
 * Luwi API Credentials
 *
 * Unified credential configuration for Luwi RAG Platform.
 * Configure PostgreSQL, OpenAI, and Redis connections in one place.
 *
 * @author Luwi Software
 * @version 1.0.0
 * @see https://luwi.dev
 */

import {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class LuwiApi implements ICredentialType {
	name = 'luwiApi';
	displayName = 'Luwi RAG Platform';
	documentationUrl = 'https://luwi.dev/docs/n8n-integration';
	properties: INodeProperties[] = [
		{
			displayName: 'Configuration Type',
			name: 'configurationType',
			type: 'options',
			options: [
				{
					name: 'Full Setup (Recommended)',
					value: 'complete',
					description: 'Configure all services including caching',
				},
				{
					name: 'Basic Setup',
					value: 'basic',
					description: 'Configure only required services',
				},
			],
			default: 'complete',
			noDataExpression: true,
		},

		// PostgreSQL Configuration (Required)
		{
			displayName: 'Database Host',
			name: 'postgresHost',
			type: 'string',
			default: 'localhost',
			required: true,
			description: 'PostgreSQL database host (with pgvector extension)',
			placeholder: 'e.g., localhost or db.example.com',
		},
		{
			displayName: 'Database Port',
			name: 'postgresPort',
			type: 'number',
			default: 5432,
			required: true,
			description: 'PostgreSQL database port',
		},
		{
			displayName: 'Database Name',
			name: 'postgresDatabase',
			type: 'string',
			default: 'luwi_db',
			required: true,
			description: 'PostgreSQL database name',
			placeholder: 'e.g., luwi_db',
		},
		{
			displayName: 'Database User',
			name: 'postgresUser',
			type: 'string',
			default: 'postgres',
			required: true,
			description: 'PostgreSQL username',
		},
		{
			displayName: 'Database Password',
			name: 'postgresPassword',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'PostgreSQL password',
		},
		{
			displayName: 'Enable SSL',
			name: 'postgresSSL',
			type: 'boolean',
			default: false,
			description: 'Use SSL/TLS for database connection',
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
			description: 'Your OpenAI API key for embeddings generation',
			placeholder: 'sk-...',
		},
		{
			displayName: 'Embedding Model',
			name: 'embeddingModel',
			type: 'options',
			options: [
				{
					name: 'text-embedding-3-small (Fast, Cost-Effective)',
					value: 'text-embedding-3-small',
				},
				{
					name: 'text-embedding-3-large (High Quality)',
					value: 'text-embedding-3-large',
				},
				{
					name: 'text-embedding-ada-002 (Legacy)',
					value: 'text-embedding-ada-002',
				},
			],
			default: 'text-embedding-3-small',
			description: 'OpenAI embedding model for vector generation',
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
			description: 'Redis server host for caching',
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
			description: 'Redis password (leave empty if no auth)',
		},
		{
			displayName: 'Redis Database Index',
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
			description: 'Maximum concurrent database connections',
		},
		{
			displayName: 'Request Timeout (ms)',
			name: 'requestTimeout',
			type: 'number',
			default: 30000,
			description: 'API request timeout in milliseconds',
		},
	];
}
