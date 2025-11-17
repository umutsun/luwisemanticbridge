import { PerformanceMetrics } from '../shared/metrics';
import { cacheManager } from '../shared/cache-manager';
import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
	IDataObject,
} from 'n8n-workflow';

import { Pool } from 'pg';
import { getPool, deleteBySourceId, getStatistics, cleanupOrphaned } from '../shared/db';
import { EmbeddingService } from '../shared/embedding-service';
import { createHybridSearchEngine } from '../shared/hybrid-search';
import { chunkText } from '../shared/chunk';
import { ASEMBError, ErrorCode, createErrorOutput } from '../shared/error-handler';
import { 
	IASEMBOperation, 
	IASEMBResult, 
	IProcessOptions,
	ISearchOptions,
	IManageOptions 
} from './interfaces/IAliceSemanticBridge';

export class AliceSemanticBridge implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Alice Semantic Bridge',
		name: 'aliceSemanticBridge',
		icon: 'file:alice-bridge.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Main orchestrator for semantic search operations',
		defaults: {
			name: 'ASEMB',
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
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{
						name: 'Process Content',
						value: 'process',
						description: 'Process and store content as vectors',
						action: 'Process content into vectors',
					},
					{
						name: 'Search',
						value: 'search',
						description: 'Search stored content',
						action: 'Search vector database',
					},
					{
						name: 'Manage Data',
						value: 'manage',
						description: 'Manage stored data and workspace',
						action: 'Manage vector data',
					},
				],
				default: 'process',
				noDataExpression: true,
			},

			// Process Operation Parameters
			{
				displayName: 'Content Source',
				name: 'contentSource',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['process'],
					},
				},
				options: [
					{
						name: 'Input Field',
						value: 'field',
						description: 'Process content from input data field',
					},
					{
						name: 'URL',
						value: 'url',
						description: 'Process content from URL',
					},
					{
						name: 'File',
						value: 'file',
						description: 'Process uploaded file content',
					},
				],
				default: 'field',
			},
			{
				displayName: 'Content Field',
				name: 'contentField',
				type: 'string',
				default: 'content',
				required: true,
				displayOptions: {
					show: {
						operation: ['process'],
						contentSource: ['field'],
					},
				},
				description: 'Field containing the content to process',
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['process'],
						contentSource: ['url'],
					},
				},
				description: 'URL to fetch content from',
			},
			{
				displayName: 'Source ID',
				name: 'sourceId',
				type: 'string',
				default: '={{$json["id"] || $json["sourceId"] || $guid()}}',
				required: true,
				displayOptions: {
					show: {
						operation: ['process'],
					},
				},
				description: 'Unique identifier for the content source',
			},
			{
				displayName: 'Processing Options',
				name: 'processOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['process'],
					},
				},
				options: [
					{
						displayName: 'Chunk Size',
						name: 'chunkSize',
						type: 'number',
						default: 512,
						description: 'Maximum tokens per chunk',
					},
					{
						displayName: 'Chunk Overlap',
						name: 'chunkOverlap',
						type: 'number',
						default: 64,
						description: 'Overlapping tokens between chunks',
					},
					{
						displayName: 'Batch Size',
						name: 'batchSize',
						type: 'number',
						default: 100,
						description: 'Items to process in parallel',
					},
					{
						displayName: 'Metadata',
						name: 'metadata',
						type: 'json',
						default: '{}',
						description: 'Additional metadata to store',
					},
				],
			},

			// Search Operation Parameters
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
				description: 'Search query text',
			},
			{
				displayName: 'Search Mode',
				name: 'searchMode',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
				options: [
					{
						name: 'Hybrid (Recommended)',
						value: 'hybrid',
						description: 'Combine vector and keyword search',
					},
					{
						name: 'Semantic Only',
						value: 'vector',
						description: 'Pure vector similarity search',
					},
					{
						name: 'Keyword Only',
						value: 'keyword',
						description: 'Traditional text matching',
					},
				],
				default: 'hybrid',
			},
			{
				displayName: 'Search Options',
				name: 'searchOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['search'],
					},
				},
				options: [
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						default: 10,
						description: 'Maximum results to return',
					},
					{
						displayName: 'Similarity Threshold',
						name: 'similarityThreshold',
						type: 'number',
						default: 0.7,
						description: 'Minimum similarity score (0-1)',
						typeOptions: {
							minValue: 0,
							maxValue: 1,
							numberStepSize: 0.1,
						},
					},
					{
						displayName: 'Source Filter',
						name: 'sourceFilter',
						type: 'string',
						default: '',
						description: 'Filter by source ID',
					},
					{
						displayName: 'Include Metadata',
						name: 'includeMetadata',
						type: 'boolean',
						default: false,
						description: 'Include metadata in results',
					},
				],
			},

			// Manage Operation Parameters
			{
				displayName: 'Action',
				name: 'manageAction',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['manage'],
					},
				},
				options: [
					{
						name: 'Get Statistics',
						value: 'statistics',
						description: 'Get database statistics',
					},
					{
						name: 'Delete by Source',
						value: 'deleteSource',
						description: 'Delete all data for a source',
					},
					{
						name: 'Cleanup',
						value: 'cleanup',
						description: 'Clean up orphaned data',
					},
					{
						name: 'Optimize',
						value: 'optimize',
						description: 'Optimize database indexes',
					},
				],
				default: 'statistics',
			},
			{
				displayName: 'Source ID',
				name: 'deleteSourceId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['manage'],
						manageAction: ['deleteSource'],
					},
				},
				description: 'Source ID to delete',
			},
			{
				displayName: 'Manage Options',
				name: 'manageOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						operation: ['manage'],
					},
				},
				options: [
					{
						displayName: 'Dry Run',
						name: 'dryRun',
						type: 'boolean',
						default: true,
						description: 'Preview changes without applying',
					},
					{
						displayName: 'Cascade',
						name: 'cascade',
						type: 'boolean',
						default: true,
						description: 'Delete related data',
					},
					{
						displayName: 'Workspace',
						name: 'workspace',
						type: 'string',
						default: '',
						description: 'Filter by workspace',
					},
				],
			},

			// Global Options
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Continue On Error',
						name: 'continueOnError',
						type: 'boolean',
						default: false,
						description: 'Continue processing if an item fails',
					},
					{
						displayName: 'Cache Results',
						name: 'cacheResults',
						type: 'boolean',
						default: true,
						description: 'Use caching for improved performance',
					},
					{
						displayName: 'Verbose Logging',
						name: 'verbose',
						type: 'boolean',
						default: false,
						description: 'Enable detailed logging',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as IASEMBOperation['operation'];
		const options = this.getNodeParameter('options', 0, {}) as IDataObject;
		const returnData: INodeExecutionData[] = [];

		// Initialize services
		let pool: Pool | undefined;
		let embeddingService: EmbeddingService | undefined;

		try {
			// Get credentials
			const pgCreds = await this.getCredentials('postgresDb') as any;
			const openAiCreds = await this.getCredentials('openAiApi') as any;

			// Create service instances
			pool = getPool(this.getNode(), pgCreds);
			embeddingService = EmbeddingService.getInstance({
				provider: 'openai' as any,
				apiKey: openAiCreds.apiKey,
				model: 'text-embedding-3-small',
				enableCache: true
			});

			// Execute operation
			const startTime = Date.now();
			let results: INodeExecutionData[] = [];
			let cacheHit = false;

			switch (operation) {
				case 'process':
					results = await AliceSemanticBridge.processContent(this, items, pool, embeddingService, options);
					break;

				case 'search':
					const searchResults = await AliceSemanticBridge.searchContent(this, items, pool, openAiCreds.apiKey, options);
					results = searchResults.results;
					cacheHit = searchResults.cacheHit;
					break;

				case 'manage':
					results = await AliceSemanticBridge.manageData(this, items, pool, options);
					break;

				default:
					throw new NodeOperationError(
						this.getNode(),
						`Unknown operation: ${operation}`,
						{ itemIndex: 0 }
					);
			}

			const executionTime = Date.now() - startTime;
			PerformanceMetrics.track(operation, executionTime);

			// Add metadata to results
			results.forEach((item, index) => {
				const result: IASEMBResult = {
					success: true,
					operation,
					data: item.json,
					metadata: {
						executionTime,
						itemsProcessed: items.length,
						cacheHit,
					},
				};

				returnData.push({
					json: result as unknown as IDataObject,
					pairedItem: { item: index },
				});
			});

			return [returnData];

		} catch (error) {
			const asembError = error instanceof ASEMBError 
				? error 
				: new ASEMBError(
					ErrorCode.OPERATION_FAILED,
					(error as Error).message,
					{ operation },
					false
				);
			
			if (options.continueOnError) {
				return [createErrorOutput(asembError, true)];
			}
			throw asembError;
		}
	}

	private static async processContent(
		context: IExecuteFunctions,
		items: INodeExecutionData[],
		pool: Pool,
		embeddingService: EmbeddingService,
		options: IDataObject
	): Promise<INodeExecutionData[]> {
		const results: INodeExecutionData[] = [];
		const contentSource = context.getNodeParameter('contentSource', 0) as string;
		const processOptions = context.getNodeParameter('processOptions', 0, {}) as IProcessOptions;
		const chunkSize = processOptions.chunkSize || 512;
		const chunkOverlap = processOptions.chunkOverlap || 64;
		const batchSize = processOptions.batchSize || 100;

		// Process in batches for performance
		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, Math.min(i + batchSize, items.length));
			
			const batchPromises = batch.map(async (item, batchIndex) => {
				const itemIndex = i + batchIndex;
				
				try {
					// Get content based on source type
					let content: string = '';
					const sourceId = context.getNodeParameter('sourceId', itemIndex) as string;
					
					if (contentSource === 'field') {
						const contentField = context.getNodeParameter('contentField', itemIndex) as string;
						content = item.json[contentField] as string;
					} else if (contentSource === 'url') {
						const url = context.getNodeParameter('url', itemIndex) as string;
						// URL fetching would be handled by a separate node in production
						content = `Content from URL: ${url}`;
					}

					if (!content) {
						throw new Error('No content to process');
					}

					// Chunk the content
					const chunks = chunkText(content, { maxChars: chunkSize, overlap: chunkOverlap });
					
					// Generate embeddings
					const embeddings = await Promise.all(
						chunks.map(chunk => embeddingService.generateEmbedding(chunk))
					);

					// Store in database
					const client = await pool.connect();
					try {
						await client.query('BEGIN');
						
						for (let j = 0; j < chunks.length; j++) {
							await client.query(
								`INSERT INTO embeddings (source_id, content, embedding, metadata, chunk_index, total_chunks)
								 VALUES ($1, $2, $3::vector, $4, $5, $6)
								 ON CONFLICT (source_id, chunk_index) DO UPDATE 
								 SET content = EXCLUDED.content, 
								     embedding = EXCLUDED.embedding,
								     metadata = EXCLUDED.metadata,
								     updated_at = NOW()`,
								[
									sourceId,
									chunks[j],
									JSON.stringify(embeddings[j]),
									processOptions.metadata || {},
									j,
									chunks.length
								]
							);
						}
						
						await client.query('COMMIT');
					} finally {
						client.release();
					}

					return {
						json: {
							sourceId,
							chunksCreated: chunks.length,
							contentLength: content.length,
							status: 'processed',
						},
					};

				} catch (error) {
					if (options.continueOnError) {
						return {
							json: {
								error: (error as Error).message,
								status: 'failed',
								itemIndex,
							},
						};
					}
					throw error;
				}
			});

			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);
		}

		return results;
	}

	private static async searchContent(
		context: IExecuteFunctions,
		items: INodeExecutionData[],
		pool: Pool,
		apiKey: string,
		options: IDataObject
	): Promise<{ results: INodeExecutionData[], cacheHit: boolean }> {
		const results: INodeExecutionData[] = [];
		let cacheHit = false;

		for (let i = 0; i < items.length; i++) {
			try {
				const query = context.getNodeParameter('query', i) as string;
				const searchMode = context.getNodeParameter('searchMode', i) as string;
				const searchOptions = context.getNodeParameter('searchOptions', i, {}) as ISearchOptions;
				
				const limit = searchOptions.limit || 10;
				const similarityThreshold = searchOptions.similarityThreshold || 0.7;
				const sourceFilter = searchOptions.sourceFilter;
				const includeMetadata = searchOptions.includeMetadata || false;

				const cacheKey = cacheManager.generateKey('search', { query, limit, searchMode, similarityThreshold, sourceFilter });
				const cached = await cacheManager.get(cacheKey);

				if (cached) {
					cacheHit = true;
					results.push({
						json: {
							query,
							mode: searchMode,
							results: cached,
							resultCount: (cached as any[]).length,
						},
					});
					continue;
				}

				let searchResults: any[] = [];

				if (searchMode === 'hybrid') {
					const searchEngine = createHybridSearchEngine(pool, apiKey);
					searchResults = await searchEngine.hybridSearch(query, {
						limit,
						minSimilarity: similarityThreshold,
					});
				} else if (searchMode === 'vector') {
					// Vector-only search
					const embeddingService = EmbeddingService.getInstance({
						provider: 'openai' as any,
						apiKey: apiKey,
						model: 'text-embedding-3-small',
						enableCache: true
					});
					const queryEmbedding = await embeddingService.generateEmbedding(query);
					const client = await pool.connect();
					
					try {
						let sql = `
							SELECT id, source_id, content, 
								   1 - (embedding <=> $1::vector) as similarity
								   ${includeMetadata ? ', metadata' : ''}
							FROM embeddings
							WHERE 1 - (embedding <=> $1::vector) > $2
						`;
						const params: any[] = [JSON.stringify(queryEmbedding), similarityThreshold];

						if (sourceFilter) {
							sql += ` AND source_id = $3`;
							params.push(sourceFilter);
						}

						sql += ` ORDER BY embedding <=> $1::vector LIMIT ${limit}`;

						const result = await client.query(sql, params);
						searchResults = result.rows;
					} finally {
						client.release();
					}
				} else if (searchMode === 'keyword') {
					// Keyword-only search
					const client = await pool.connect();
					
					try {
						let sql = `
							SELECT id, source_id, content
								   ${includeMetadata ? ', metadata' : ''}
							FROM embeddings
							WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
						`;
						const params: any[] = [query];

						if (sourceFilter) {
							sql += ` AND source_id = $2`;
							params.push(sourceFilter);
						}

						sql += ` ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) DESC LIMIT ${limit}`;

						const result = await client.query(sql, params);
						searchResults = result.rows;
					} finally {
						client.release();
					}
				}

				await cacheManager.set(cacheKey, searchResults, 300);

				results.push({
					json: {
						query,
						mode: searchMode,
						results: searchResults,
						resultCount: searchResults.length,
					},
				});

			} catch (error) {
				if (options.continueOnError) {
					results.push({
						json: {
							error: (error as Error).message,
							status: 'failed',
						},
					});
				} else {
					throw error;
				}
			}
		}

		return { results, cacheHit };
	}

	private static async manageData(
		context: IExecuteFunctions,
		items: INodeExecutionData[],
		pool: Pool,
		options: IDataObject
	): Promise<INodeExecutionData[]> {
		const results: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const action = context.getNodeParameter('manageAction', i) as string;
				const manageOptions = context.getNodeParameter('manageOptions', i, {}) as IManageOptions;
				
				let result: any = {};

				switch (action) {
					case 'statistics': {
						const workspace = manageOptions.workspace;
						result = await getStatistics(pool, workspace);
						break;
					}

					case 'deleteSource': {
						const sourceId = context.getNodeParameter('deleteSourceId', i) as string;
						const cascade = manageOptions.cascade !== false;
						result = await deleteBySourceId(pool, sourceId, { cascade });
						break;
					}

					case 'cleanup': {
						const dryRun = manageOptions.dryRun !== false;
						result = await cleanupOrphaned(pool, { dryRun, batchSize: 100 });
						break;
					}

					case 'optimize': {
						const client = await pool.connect();
						try {
							await client.query('VACUUM ANALYZE embeddings');
							await client.query('REINDEX TABLE embeddings');
							result = { 
								status: 'optimized',
								message: 'Database indexes optimized successfully'
							};
						} finally {
							client.release();
						}
						break;
					}
				}

				results.push({
					json: {
						action,
						...result,
					},
				});

			} catch (error) {
				if (options.continueOnError) {
					results.push({
						json: {
							error: (error as Error).message,
							status: 'failed',
						},
					});
				} else {
					throw error;
				}
			}
		}

		return results;
	}
}