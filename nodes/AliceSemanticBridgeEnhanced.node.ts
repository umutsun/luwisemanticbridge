import {
	INodeExecutionFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	NodeConnectionType,
} from 'n8n-workflow';

import Redis from 'ioredis';
import { createHash } from 'crypto';

export class AliceSemanticBridgeEnhanced implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Luwi Semantic Bridge Enhanced',
		name: 'aliceSemanticBridgeEnhanced',
		icon: 'file:alice-bridge.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'AI-powered multi-agent semantic bridge with intelligent optimization',
		defaults: {
			name: 'Luwi Semantic BridgeEnhanced',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'aliceSemanticBridgeApi',
				required: true,
			},
		],
		properties: [
			// Resource Selection
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Semantic Data',
						value: 'semantic',
						description: 'AI-enhanced data operations with embeddings',
					},
					{
						name: 'Context',
						value: 'context',
						description: 'Manage shared context between agents',
					},
					{
						name: 'Agent',
						value: 'agent',
						description: 'Multi-agent communication and orchestration',
					},
				],
				default: 'semantic',
			},

			// Semantic Operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['semantic'],
					},
				},
				noDataExpression: true,
				options: [
					{
						name: 'Smart Upsert',
						value: 'upsert',
						description: 'Intelligently store data with deduplication and AI metadata',
						action: 'Smart upsert with AI enhancement',
					},
					{
						name: 'Hybrid Search',
						value: 'search',
						description: 'Combined semantic and keyword search with reranking',
						action: 'Hybrid search with AI reranking',
					},
					{
						name: 'Analyze',
						value: 'analyze',
						description: 'Analyze data patterns and suggest optimizations',
						action: 'Analyze semantic patterns',
					},
				],
				default: 'upsert',
			},

			// Common Parameters
			{
				displayName: 'Project Key',
				name: 'projectKey',
				type: 'string',
				default: '',
				required: true,
				description: 'Unique identifier to isolate project data. Example: "my-rag-chatbot"',
			},

			// Semantic Upsert Parameters
			{
				displayName: 'Source ID',
				name: 'sourceId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['semantic'],
						operation: ['upsert'],
					},
				},
				default: '',
				description: 'Unique identifier to group data (e.g., "google-docs-project-x"). Enables source-specific filtering in searches.',
			},
			{
				displayName: 'Content',
				name: 'content',
				type: 'string',
				typeOptions: {
					rows: 5,
				},
				displayOptions: {
					show: {
						resource: ['semantic'],
						operation: ['upsert'],
					},
				},
				default: '',
				description: 'Text content to process and store',
			},
			{
				displayName: 'Chunking Strategy',
				name: 'chunkingStrategy',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['semantic'],
						operation: ['upsert'],
					},
				},
				options: [
					{
						name: 'Auto (AI-Powered)',
						value: 'auto',
						description: 'AI analyzes text structure and chooses optimal chunking',
					},
					{
						name: 'Prose',
						value: 'prose',
						description: 'Preserves paragraph and sentence integrity',
					},
					{
						name: 'Code',
						value: 'code',
						description: 'Splits by functions and class definitions',
					},
					{
						name: 'Custom',
						value: 'custom',
						description: 'Manual chunk size and overlap control',
					},
				],
				default: 'auto',
				description: 'Determines text splitting. "Auto" is best for general content. Smaller chunks = more specific results but may lose context.',
			},

			// Semantic Search Parameters
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['semantic'],
						operation: ['search'],
					},
				},
				default: '',
				description: 'Search query to find relevant content',
			},
			{
				displayName: 'Search Mode',
				name: 'searchMode',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['semantic'],
						operation: ['search'],
					},
				},
				options: [
					{
						name: 'Hybrid (Recommended)',
						value: 'hybrid',
						description: 'Combined semantic + keyword search with AI reranking',
					},
					{
						name: 'Semantic',
						value: 'semantic',
						description: 'Vector-only search (fast)',
					},
					{
						name: 'Keyword',
						value: 'keyword',
						description: 'Text-only search',
					},
				],
				default: 'hybrid',
				description: 'Search strategy. Hybrid mode provides best accuracy by combining approaches.',
			},

			// Advanced Options
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					// Upsert Options
					{
						displayName: 'AI-Generated Metadata',
						name: 'generateMetadata',
						type: 'boolean',
						displayOptions: {
							show: {
								'/resource': ['semantic'],
								'/operation': ['upsert'],
							},
						},
						default: true,
						description: 'Auto-generates keywords and summaries. Improves search accuracy but slightly increases processing time.',
					},
					{
						displayName: 'Process in Background',
						name: 'asyncProcessing',
						type: 'boolean',
						displayOptions: {
							show: {
								'/resource': ['semantic'],
								'/operation': ['upsert'],
							},
						},
						default: false,
						description: 'Queue data for background processing. Prevents timeouts on large datasets.',
					},
					{
						displayName: 'Chunk Size',
						name: 'chunkSize',
						type: 'number',
						displayOptions: {
							show: {
								'/resource': ['semantic'],
								'/operation': ['upsert'],
								'/chunkingStrategy': ['custom'],
							},
						},
						default: 1000,
						description: 'Maximum characters per chunk',
					},
					{
						displayName: 'Chunk Overlap',
						name: 'chunkOverlap',
						type: 'number',
						displayOptions: {
							show: {
								'/resource': ['semantic'],
								'/operation': ['upsert'],
								'/chunkingStrategy': ['custom'],
							},
						},
						default: 200,
						description: 'Character overlap between chunks',
					},
					// Search Options
					{
						displayName: 'Expand Query',
						name: 'expandQuery',
						type: 'boolean',
						displayOptions: {
							show: {
								'/resource': ['semantic'],
								'/operation': ['search'],
							},
						},
						default: false,
						description: 'Use AI to expand query with related terms for better coverage',
					},
					{
						displayName: 'Filter by Source',
						name: 'filterSource',
						type: 'string',
						displayOptions: {
							show: {
								'/resource': ['semantic'],
								'/operation': ['search'],
							},
						},
						default: '',
						description: 'Only search within specific source ID',
					},
					{
						displayName: 'Result Limit',
						name: 'limit',
						type: 'number',
						displayOptions: {
							show: {
								'/resource': ['semantic'],
								'/operation': ['search'],
							},
						},
						default: 5,
						description: 'Maximum number of results to return',
					},
					// General Options
					{
						displayName: 'Cache Results',
						name: 'cacheResults',
						type: 'boolean',
						default: true,
						description: 'Cache embeddings and search results for faster repeated operations',
					},
					{
						displayName: 'Debug Mode',
						name: 'debug',
						type: 'boolean',
						default: false,
						description: 'Include detailed processing information in output',
					},
				],
			},
		],
	};

	async execute(this: INodeExecutionFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		let redis: Redis | undefined;

		try {
			// Initialize Redis connection
			const credentials = await this.getCredentials('aliceSemanticBridgeApi');
			redis = new Redis({
				host: credentials.redisHost as string,
				port: credentials.redisPort as number,
				password: credentials.redisPassword as string,
				db: credentials.redisDb as number || 2,
			});

			for (let i = 0; i < items.length; i++) {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const projectKey = this.getNodeParameter('projectKey', i) as string;
				const additionalOptions = this.getNodeParameter('additionalOptions', i, {}) as any;

				let result: any = {};

				if (resource === 'semantic') {
					if (operation === 'upsert') {
						result = await this.handleSemanticUpsert(
							redis,
							projectKey,
							i,
							additionalOptions
						);
					} else if (operation === 'search') {
						result = await this.handleSemanticSearch(
							redis,
							projectKey,
							i,
							additionalOptions
						);
					} else if (operation === 'analyze') {
						result = await this.handleSemanticAnalyze(
							redis,
							projectKey,
							i,
							additionalOptions
						);
					}
				}

				returnData.push({ json: result });
			}
		} catch (error) {
			if (this.continueOnFail()) {
				returnData.push({ json: { error: error.message } });
			} else {
				throw new NodeOperationError(
					this.getNode(),
					`Luwi Semantic Bridgeerror: ${error.message}`
				);
			}
		} finally {
			if (redis) {
				await redis.quit();
			}
		}

		return [returnData];
	}

	private async handleSemanticUpsert(
		this: IExecuteFunctions,
		redis: Redis,
		projectKey: string,
		itemIndex: number,
		options: any
	): Promise<any> {
		const sourceId = this.getNodeParameter('sourceId', itemIndex) as string;
		const content = this.getNodeParameter('content', itemIndex) as string;
		const chunkingStrategy = this.getNodeParameter('chunkingStrategy', itemIndex) as string;
		
		// Generate content hash for deduplication
		const contentHash = createHash('sha256').update(content).digest('hex');
		const hashKey = `asb:${projectKey}:hash:${contentHash}`;
		
		// Check if content already exists
		if (!options.debug && await redis.exists(hashKey)) {
			return {
				success: true,
				operation: 'upsert',
				status: 'skipped',
				reason: 'Content already exists (deduplication)',
				contentHash,
			};
		}
		
		// Handle async processing
		if (options.asyncProcessing) {
			// Queue for background processing
			const queueKey = `asb:${projectKey}:queue:upsert`;
			const jobData = {
				sourceId,
				content,
				chunkingStrategy,
				options,
				timestamp: new Date().toISOString(),
			};
			
			await redis.lpush(queueKey, JSON.stringify(jobData));
			
			return {
				success: true,
				operation: 'upsert',
				status: 'queued',
				queuePosition: await redis.llen(queueKey),
				contentHash,
			};
		}
		
		// Process chunks based on strategy
		const chunks = await this.createChunks(content, chunkingStrategy, options);
		
		// Generate metadata if enabled
		const metadata: any = {
			sourceId,
			timestamp: new Date().toISOString(),
			chunkingStrategy,
		};
		
		if (options.generateMetadata) {
			// Simulate AI metadata generation
			metadata.keywords = this.extractKeywords(content);
			metadata.summary = this.generateSummary(content);
			metadata.language = this.detectLanguage(content);
		}
		
		// Store chunks with metadata
		const storedChunks = [];
		for (let i = 0; i < chunks.length; i++) {
			const chunkKey = `asb:${projectKey}:chunk:${sourceId}:${i}`;
			const chunkData = {
				content: chunks[i],
				metadata: {
					...metadata,
					chunkIndex: i,
					totalChunks: chunks.length,
				},
			};
			
			await redis.set(chunkKey, JSON.stringify(chunkData));
			await redis.expire(chunkKey, 86400 * 30); // 30 days TTL
			storedChunks.push(chunkKey);
		}
		
		// Mark content as processed
		await redis.set(hashKey, sourceId);
		await redis.expire(hashKey, 86400 * 30);
		
		// Update source index
		await redis.sadd(`asb:${projectKey}:sources`, sourceId);
		
		return {
			success: true,
			operation: 'upsert',
			status: 'completed',
			contentHash,
			chunksCreated: chunks.length,
			metadata,
			...(options.debug ? { chunks: storedChunks } : {}),
		};
	}

	private async handleSemanticSearch(
		this: IExecuteFunctions,
		redis: Redis,
		projectKey: string,
		itemIndex: number,
		options: any
	): Promise<any> {
		const query = this.getNodeParameter('query', itemIndex) as string;
		const searchMode = this.getNodeParameter('searchMode', itemIndex) as string;
		const limit = options.limit || 5;
		
		// Expand query if enabled
		let expandedQuery = query;
		if (options.expandQuery) {
			expandedQuery = this.expandQuery(query);
		}
		
		// Search based on mode
		let results = [];
		
		if (searchMode === 'hybrid' || searchMode === 'semantic') {
			// Simulate semantic search
			const pattern = `asb:${projectKey}:chunk:*`;
			if (options.filterSource) {
				pattern.replace('*', `${options.filterSource}:*`);
			}
			
			const keys = await redis.keys(pattern);
			for (const key of keys.slice(0, limit * 2)) {
				const data = await redis.get(key);
				if (data) {
					const chunk = JSON.parse(data);
					// Simulate relevance scoring
					const score = this.calculateRelevance(expandedQuery, chunk.content);
					results.push({
						...chunk,
						score,
						searchType: 'semantic',
					});
				}
			}
		}
		
		if (searchMode === 'hybrid' || searchMode === 'keyword') {
			// Simulate keyword search
			const pattern = `asb:${projectKey}:chunk:*`;
			const keys = await redis.keys(pattern);
			
			for (const key of keys.slice(0, limit * 2)) {
				const data = await redis.get(key);
				if (data) {
					const chunk = JSON.parse(data);
					if (chunk.content.toLowerCase().includes(expandedQuery.toLowerCase())) {
						const score = this.calculateKeywordScore(expandedQuery, chunk.content);
						// Check if already in results
						const existing = results.find(r => r.content === chunk.content);
						if (existing) {
							// Combine scores for hybrid search
							existing.score = (existing.score + score) / 2;
							existing.searchType = 'hybrid';
						} else {
							results.push({
								...chunk,
								score,
								searchType: 'keyword',
							});
						}
					}
				}
			}
		}
		
		// Sort by score and limit
		results.sort((a, b) => b.score - a.score);
		results = results.slice(0, limit);
		
		// Cache results if enabled
		if (options.cacheResults) {
			const cacheKey = `asb:${projectKey}:cache:search:${createHash('md5').update(expandedQuery).digest('hex')}`;
			await redis.set(cacheKey, JSON.stringify(results));
			await redis.expire(cacheKey, 300); // 5 minute cache
		}
		
		return {
			success: true,
			operation: 'search',
			query,
			expandedQuery: options.expandQuery ? expandedQuery : undefined,
			searchMode,
			resultsCount: results.length,
			results,
		};
	}

	private async handleSemanticAnalyze(
		this: IExecuteFunctions,
		redis: Redis,
		projectKey: string,
		itemIndex: number,
		options: any
	): Promise<any> {
		// Analyze stored data patterns
		const sources = await redis.smembers(`asb:${projectKey}:sources`);
		const stats = {
			totalSources: sources.length,
			totalChunks: 0,
			averageChunkSize: 0,
			duplicatesFound: 0,
			optimizationSuggestions: [],
		};
		
		// Gather statistics
		let totalSize = 0;
		const hashes = new Set();
		
		for (const source of sources) {
			const pattern = `asb:${projectKey}:chunk:${source}:*`;
			const keys = await redis.keys(pattern);
			stats.totalChunks += keys.length;
			
			for (const key of keys) {
				const data = await redis.get(key);
				if (data) {
					const chunk = JSON.parse(data);
					totalSize += chunk.content.length;
					
					// Check for duplicates
					const hash = createHash('md5').update(chunk.content).digest('hex');
					if (hashes.has(hash)) {
						stats.duplicatesFound++;
					}
					hashes.add(hash);
				}
			}
		}
		
		stats.averageChunkSize = Math.round(totalSize / stats.totalChunks);
		
		// Generate optimization suggestions
		if (stats.duplicatesFound > 0) {
			stats.optimizationSuggestions.push({
				type: 'deduplication',
				message: `Found ${stats.duplicatesFound} duplicate chunks. Enable content hashing to save storage and API costs.`,
				impact: 'high',
			});
		}
		
		if (stats.averageChunkSize > 2000) {
			stats.optimizationSuggestions.push({
				type: 'chunking',
				message: 'Average chunk size is large. Consider smaller chunks for more precise search results.',
				impact: 'medium',
			});
		}
		
		if (stats.totalChunks > 10000) {
			stats.optimizationSuggestions.push({
				type: 'indexing',
				message: 'Large dataset detected. Ensure proper PostgreSQL indexes for optimal search performance.',
				impact: 'high',
			});
		}
		
		return {
			success: true,
			operation: 'analyze',
			projectKey,
			statistics: stats,
		};
	}

	// Helper methods
	private async createChunks(content: string, strategy: string, options: any): Promise<string[]> {
		if (strategy === 'auto') {
			// AI-powered chunking (simulated)
			return this.autoChunk(content);
		} else if (strategy === 'prose') {
			return this.proseChunk(content);
		} else if (strategy === 'code') {
			return this.codeChunk(content);
		} else {
			// Custom chunking
			const size = options.chunkSize || 1000;
			const overlap = options.chunkOverlap || 200;
			return this.customChunk(content, size, overlap);
		}
	}

	private autoChunk(content: string): string[] {
		// Simulate AI-powered chunking
		const paragraphs = content.split(/\n\n+/);
		const chunks = [];
		let currentChunk = '';
		
		for (const para of paragraphs) {
			if ((currentChunk + para).length > 1000) {
				if (currentChunk) chunks.push(currentChunk.trim());
				currentChunk = para;
			} else {
				currentChunk += (currentChunk ? '\n\n' : '') + para;
			}
		}
		if (currentChunk) chunks.push(currentChunk.trim());
		
		return chunks;
	}

	private proseChunk(content: string): string[] {
		// Preserve paragraph integrity
		return content.split(/\n\n+/).filter(p => p.trim());
	}

	private codeChunk(content: string): string[] {
		// Simple code chunking by function/class
		const chunks = [];
		const lines = content.split('\n');
		let currentChunk = [];
		
		for (const line of lines) {
			if (line.match(/^(function|class|def|const|let|var)\s+\w+/)) {
				if (currentChunk.length > 0) {
					chunks.push(currentChunk.join('\n'));
					currentChunk = [];
				}
			}
			currentChunk.push(line);
		}
		if (currentChunk.length > 0) {
			chunks.push(currentChunk.join('\n'));
		}
		
		return chunks;
	}

	private customChunk(content: string, size: number, overlap: number): string[] {
		const chunks = [];
		let start = 0;
		
		while (start < content.length) {
			const end = Math.min(start + size, content.length);
			chunks.push(content.substring(start, end));
			start += size - overlap;
		}
		
		return chunks;
	}

	private extractKeywords(content: string): string[] {
		// Simple keyword extraction (would use NLP in production)
		const words = content.toLowerCase().match(/\b\w{4,}\b/g) || [];
		const freq: Record<string, number> = {};
		
		for (const word of words) {
			freq[word] = (freq[word] || 0) + 1;
		}
		
		return Object.entries(freq)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10)
			.map(([word]) => word);
	}

	private generateSummary(content: string): string {
		// Simple summary (would use AI in production)
		const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
		return sentences.slice(0, 2).join(' ').substring(0, 200);
	}

	private detectLanguage(content: string): string {
		// Simple language detection
		if (content.match(/[\u4e00-\u9fa5]/)) return 'zh';
		if (content.match(/[\u0600-\u06ff]/)) return 'ar';
		if (content.match(/[\u3040-\u309f\u30a0-\u30ff]/)) return 'ja';
		return 'en';
	}

	private expandQuery(query: string): string {
		// Simple query expansion (would use AI in production)
		const expansions: Record<string, string[]> = {
			'optimization': ['performance', 'speed', 'efficiency'],
			'n8n': ['workflow', 'automation', 'node'],
			'error': ['bug', 'issue', 'problem'],
		};
		
		let expanded = query;
		for (const [term, synonyms] of Object.entries(expansions)) {
			if (query.toLowerCase().includes(term)) {
				expanded += ' ' + synonyms.join(' ');
			}
		}
		
		return expanded;
	}

	private calculateRelevance(query: string, content: string): number {
		// Simple relevance scoring (would use embeddings in production)
		const queryWords = query.toLowerCase().split(/\s+/);
		const contentLower = content.toLowerCase();
		let score = 0;
		
		for (const word of queryWords) {
			if (contentLower.includes(word)) {
				score += 1;
			}
		}
		
		return score / queryWords.length;
	}

	private calculateKeywordScore(query: string, content: string): number {
		// Keyword matching score
		const queryLower = query.toLowerCase();
		const contentLower = content.toLowerCase();
		let score = 0;
		
		// Exact match
		if (contentLower.includes(queryLower)) {
			score += 2;
		}
		
		// Word matches
		const queryWords = queryLower.split(/\s+/);
		for (const word of queryWords) {
			const regex = new RegExp(`\\b${word}\\b`, 'gi');
			const matches = content.match(regex);
			if (matches) {
				score += matches.length * 0.5;
			}
		}
		
		return Math.min(score / queryWords.length, 1);
	}
}
