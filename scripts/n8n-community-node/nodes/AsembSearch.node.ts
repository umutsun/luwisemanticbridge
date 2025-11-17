import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
	IDataObject,
} from 'n8n-workflow';

import { searchEngine } from '../shared/search';
import { ISearchQuery, SearchMode } from '../shared/interfaces';

export class AsembSearch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'ASEMB Search',
		name: 'asembSearch',
		icon: 'file:alice-bridge.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["query"]}}',
		description: 'Advanced search for ASEMB pipeline',
		defaults: {
			name: 'ASEMB Search',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'postgresDb',
				required: true,
			},
			{
				name: 'openAiApi',
				required: true,
			},
			{
				name: 'redisApi',
				required: false,
			},
		],
		properties: [
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				required: true,
				description: 'The search query',
			},
			{
				displayName: 'Project Key',
				name: 'projectKey',
				type: 'string',
				default: 'asb-docs',
				required: true,
				description: 'The project key to search within',
			},
			{
				displayName: 'Search Mode',
				name: 'searchMode',
				type: 'options',
				options: [
					{
						name: 'Hybrid',
						value: 'hybrid',
						description: 'Combined vector and keyword search',
					},
					{
						name: 'Semantic',
						value: 'semantic',
						description: 'Semantic vector search only',
					},
					{
						name: 'Keyword',
						value: 'keyword',
						description: 'Traditional keyword search only',
					},
				],
				default: 'hybrid',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 10,
				description: 'Maximum number of results to return',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Use Cache',
						name: 'useCache',
						type: 'boolean',
						default: true,
						description: 'Cache search results for faster repeated queries',
					},
					{
						displayName: 'Expand Query',
						name: 'expandQuery',
						type: 'boolean',
						default: true,
						description: 'Expand the query with synonyms and related concepts',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const query = this.getNodeParameter('query', i) as string;
				const projectKey = this.getNodeParameter('projectKey', i) as string;
				const searchMode = this.getNodeParameter('searchMode', i, 'hybrid') as SearchMode;
				const limit = this.getNodeParameter('limit', i, 10) as number;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;

				const searchQuery: ISearchQuery = {
					query,
					projectKey,
					searchMode,
					options: {
						limit,
						useCache: options.useCache as boolean,
						expandQuery: options.expandQuery as boolean,
					},
				};

				const results = await searchEngine.search(searchQuery);

				returnData.push({
					json: {
						query,
						searchMode,
						results,
						resultCount: results.length,
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
