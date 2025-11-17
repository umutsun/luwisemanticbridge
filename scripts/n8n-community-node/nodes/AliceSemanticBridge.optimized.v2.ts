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

import { Pool, PoolClient } from 'pg';
import { getPool } from '../shared/db';
import { EmbeddingService } from '../shared/embedding-service';
import { chunkText } from '../shared/chunk';

/**
 * Optimized AliceSemanticBridge Node v2
 * Performance improvements:
 * 1. Connection pooling with proper management
 * 2. Batch processing with configurable sizes
 * 3. Parallel embedding generation
 * 4. Prepared statements for faster queries
 * 5. In-memory caching with Redis
 * 6. Stream processing for large datasets
 */
export class AliceSemanticBridgeOptimized implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Alice Semantic Bridge (Optimized)',
		name: 'aliceSemanticBridgeOptimized',
		icon: 'file:alice-bridge.svg',
		group: ['transform'],
		version: 2,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Optimized semantic search operations with enhanced performance',
		defaults: {
			name: 'ASEMB Optimized',
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
			{
				displayName: 'Performance Options',
				name: 'performanceOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Batch Size',
						name: 'batchSize',
						type: 'number',
						default: 50,
						description: 'Number of items to process in parallel',
					},
					{
						displayName: 'Connection Pool Size',
						name: 'poolSize',
						type: 'number',
						default: 10,
						description: 'Maximum database connections',
					},
					{
						displayName: 'Enable Caching',
						name: 'enableCache',
						type: 'boolean',
						default: true,
						description: 'Use Redis for caching',
					},
					{
						displayName: 'Cache TTL',
						name: 'cacheTTL',
						type: 'number',
						default: 3600,
						description: 'Cache time-to-live in seconds',
					},
					{
						displayName: 'Stream Processing',
						name: 'streamMode',
						type: 'boolean',
						default: false,
						description: 'Enable stream processing for large datasets',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const metrics = new PerformanceMetrics();
		metrics.startTimer('total_execution');
		
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		const performanceOptions = this.getNodeParameter('performanceOptions', 0, {}) as IDataObject;
		
		// Initialize optimized settings
		const batchSize = (performanceOptions.batchSize as number) || 50;
		const enableCache = (performanceOptions.enableCache as boolean) !== false;
		const cacheTTL = (performanceOptions.cacheTTL as number) || 3600;
		const streamMode = performanceOptions.streamMode as boolean;
		
		let pool: Pool | undefined;
		let embeddingService: EmbeddingService | undefined;
		const returnData: INodeExecutionData[] = [];
		
		try {
			// Get credentials
			const pgCreds = await this.getCredentials('postgresDb') as any;
			const openAiCreds = await this.getCredentials('openAiApi') as any;
			
			// Initialize pool with optimized settings
			pool = getPool(this.getNode(), {
				...pgCreds,
				max: (performanceOptions.poolSize as number) || 10,
				idleTimeoutMillis: 30000,
				connectionTimeoutMillis: 2000,
			});
			
			// Initialize embedding service with caching
			embeddingService = EmbeddingService.getInstance({
				provider: 'openai' as any,
				apiKey: openAiCreds.apiKey,
				model: 'text-embedding-3-small',
				enableCache: enableCache,
				cacheTTL: cacheTTL,
			});
			
			// Execute operation with optimizations
			switch (operation) {
				case 'process':
					if (streamMode && items.length > 100) {
						// Stream processing for large datasets
						for await (const result of (this as any).streamProcess(items, pool, embeddingService, batchSize)) {
							returnData.push(result);
						}
					} else {
						// Batch processing
						const results = await (this as any).batchProcess(items, pool, embeddingService, batchSize);
						returnData.push(...results);
					}
					break;
					
				case 'search':
					const searchResults = await (this as any).optimizedSearch(
						items,
						pool,
						embeddingService,
						enableCache,
						cacheTTL
					);
					returnData.push(...searchResults);
					break;
					
				case 'manage':
					const manageResults = await (this as any).manageData(items, pool);
					returnData.push(...manageResults);
					break;
					
				default:
					throw new NodeOperationError(
						this.getNode(),
						`Unknown operation: ${operation}`,
						{ itemIndex: 0 }
					);
			}
			
			// Log metrics
			const executionTime = metrics.endTimer('total_execution');
			console.log(`Execution completed in ${executionTime}ms`);
			
			// Add performance stats to results
			if (returnData.length > 0) {
				returnData[0].json.performanceStats = {
					executionTime,
					itemsProcessed: items.length,
					cacheEnabled: enableCache,
					batchSize,
				};
			}
			
			return [returnData];
			
		} catch (error) {
			throw new NodeOperationError(this.getNode(), (error as Error).message);
		} finally {
			// Cleanup resources
			if (pool) {
				await pool.end();
			}
		}
	}

	private async batchProcess(
		items: INodeExecutionData[],
		pool: Pool,
		embeddingService: EmbeddingService,
		batchSize: number
	): Promise<INodeExecutionData[]> {
		const results: INodeExecutionData[] = [];
		
		// Process items in optimized batches
		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, Math.min(i + batchSize, items.length));
			
			// Parallel processing within batch
			const batchPromises = batch.map(async (item, index) => {
				const content = item.json.content as string;
				if (!content) return null;
				
				// Generate chunks
				const chunks = chunkText(content, { maxChars: 512, overlap: 64 });
				
				// Parallel embedding generation
				const embeddings = await Promise.all(
					chunks.map(chunk => embeddingService.generateEmbedding(chunk))
				);
				
				// Use single connection for batch insert
				const client = await pool.connect();
				try {
					// Use prepared statement for better performance
					const insertQuery = {
						name: 'insert-embedding',
						text: `INSERT INTO embeddings (source_id, content, embedding, chunk_index, total_chunks)
						       VALUES ($1, $2, $3::vector, $4, $5)
						       ON CONFLICT (source_id, chunk_index) 
						       DO UPDATE SET content = EXCLUDED.content, 
						                    embedding = EXCLUDED.embedding,
						                    updated_at = NOW()`,
						values: [] as any[]
					};
					
					await client.query('BEGIN');
					
					for (let j = 0; j < chunks.length; j++) {
						insertQuery.values = [
							item.json.sourceId || `item-${i + index}`,
							chunks[j],
							JSON.stringify(embeddings[j]),
							j,
							chunks.length
						];
						await client.query(insertQuery);
					}
					
					await client.query('COMMIT');
					
					return {
						json: {
							sourceId: item.json.sourceId,
							chunksCreated: chunks.length,
							status: 'processed',
						}
					};
				} catch (error) {
					await client.query('ROLLBACK');
					throw error;
				} finally {
					client.release();
				}
			});
			
			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults.filter(r => r !== null) as INodeExecutionData[]);
		}
		
		return results;
	}

	private async *streamProcess(
		items: INodeExecutionData[],
		pool: Pool,
		embeddingService: EmbeddingService,
		batchSize: number
	): AsyncGenerator<INodeExecutionData> {
		// Stream processing for very large datasets
		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, Math.min(i + batchSize, items.length));
			const results = await this.batchProcess(batch, pool, embeddingService, batchSize);
			
			for (const result of results) {
				yield result;
			}
		}
	}

	private async optimizedSearch(
		items: INodeExecutionData[],
		pool: Pool,
		embeddingService: EmbeddingService,
		enableCache: boolean,
		cacheTTL: number
	): Promise<INodeExecutionData[]> {
		const results: INodeExecutionData[] = [];
		
		for (const item of items) {
			const query = item.json.query as string;
			if (!query) continue;
			
			// Check cache first
			let cacheKey = '';
			let searchResults: any[] = [];
			
			if (enableCache) {
				cacheKey = `search:${Buffer.from(query).toString('base64')}`;
				const cached = await cacheManager.get(cacheKey);
				
				if (cached) {
					results.push({
						json: {
							query,
							results: cached,
							cached: true,
						}
					});
					continue;
				}
			}
			
			// Generate embedding for query
			const queryEmbedding = await embeddingService.generateEmbedding(query);
			
			// Optimized pgvector search with proper indexing
			const client = await pool.connect();
			try {
				const searchQuery = {
					name: 'vector-search',
					text: `
						SELECT 
							source_id,
							content,
							1 - (embedding <=> $1::vector) as similarity,
							metadata
						FROM embeddings
						WHERE 1 - (embedding <=> $1::vector) > $2
						ORDER BY embedding <=> $1::vector
						LIMIT $3
					`,
					values: [JSON.stringify(queryEmbedding), 0.7, 10]
				};
				
				const result = await client.query(searchQuery);
				searchResults = result.rows;
				
				// Cache results
				if (enableCache && cacheKey) {
					await cacheManager.set(cacheKey, searchResults, cacheTTL);
				}
				
			} finally {
				client.release();
			}
			
			results.push({
				json: {
					query,
					results: searchResults,
					cached: false,
				}
			});
		}
		
		return results;
	}

	private async manageData(
		items: INodeExecutionData[],
		pool: Pool
	): Promise<INodeExecutionData[]> {
		const results: INodeExecutionData[] = [];
		const client = await pool.connect();
		
		try {
			// Get statistics with optimized query
			const statsQuery = `
				SELECT 
					COUNT(*) as total_embeddings,
					COUNT(DISTINCT source_id) as unique_sources,
					AVG(array_length(string_to_array(embedding::text, ','), 1)) as avg_dimension,
					pg_size_pretty(pg_total_relation_size('embeddings')) as table_size
				FROM embeddings
			`;
			
			const stats = await client.query(statsQuery);
			
			results.push({
				json: {
					statistics: stats.rows[0],
					timestamp: new Date().toISOString(),
				}
			});
			
		} finally {
			client.release();
		}
		
		return results;
	}
}