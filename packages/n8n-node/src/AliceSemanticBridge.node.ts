import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { getPool, getExistingHashes, batchInsertEmbeddings, IEmbedding } from './database/db';
import { createContentHash, chunkText } from '@alice/semantic-bridge-shared/utils/textProcessor';
import { OpenAI } from 'openai';

// A simple in-memory cache for OpenAI clients to avoid creating a new client for every execution.
const openAiCache: { [key: string]: OpenAI } = {};

/**
 * @class AliceSemanticBridge
 * @description The main n8n node for Luwi Semantic Bridge operations.
 * This node serves as a central hub for semantic search, data ingestion (embedding),
 * and management of vector data within a PostgreSQL database using pgvector.
 * It is designed to be modular and work with other n8n nodes.
 *
 * @author Codex (Implementation Lead)
 * @version 1.1.0
 */
export class AliceSemanticBridge implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Luwi Semantic Bridge,
		name: 'aliceSemanticBridge',
		icon: 'fa:brain',
		group: ['transform'],
		version: 1,
		description: 'A node for semantic search, embedding, and RAG operations.',
		defaults: {
			name: 'Luwi Semantic Bridge,
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'postgresCredentials',
				required: true,
			},
			{
				name: 'openApiCredentials',
				required: true,
			},
		],
		properties: [
			// ... (properties remain the same)
		],
	};

	/**
	 * @name execute
	 * @description The main execution method for the node.
	 * It will read the operation parameter and route the execution to the
	 * appropriate handler function.
	 * @param {IExecuteFunctions} this - The n8n execution context.
	 * @returns {Promise<INodeExecutionData[][]>} The processed data.
	 */
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		const credentials = await this.getCredentials('postgresCredentials');
		const pool = getPool(credentials);

		for (let i = 0; i < items.length; i++) {
			try {
				switch (operation) {
					case 'upsert': {
						const sourceId = this.getNodeParameter('sourceId', i) as string;
						const contentField = this.getNodeParameter('contentField', i) as string;
						const metadataFields = (this.getNodeParameter('metadataFields', i) as string).split(',').filter(Boolean);

						const text = items[i].json[contentField] as string;
						if (!text) {
							this.logger.warn(`No content found in field "${contentField}" for item ${i}. Skipping.`);
							continue;
						}

						// 1. Chunk the text
						const chunks = await chunkText(text);

						// 2. Create hashes for each chunk
						const chunkHashes = chunks.map(createContentHash);

						// 3. Check for existing hashes in the database
						const existingHashes = await getExistingHashes(pool, chunkHashes);

						// 4. Filter out chunks that already exist
						const newChunks = chunks.filter((_, index) => !existingHashes.has(chunkHashes[index]));

						if (newChunks.length === 0) {
							this.logger.info(`All ${chunks.length} chunks for item ${i} already exist in the database. Nothing to do.`);
							returnData.push({ json: { ...items[i].json, status: 'skipped', reason: 'duplicate' } });
							continue;
						}

						// 5. Create embeddings for new chunks
						const openApiCredentials = await this.getCredentials('openApiCredentials');
						const apiKey = openApiCredentials.apiKey as string;
						if (!openAiCache[apiKey]) {
							openAiCache[apiKey] = new OpenAI({ apiKey });
						}
						const openai = openAiCache[apiKey];

						const embeddingResponse = await openai.embeddings.create({
							model: 'text-embedding-ada-002',
							input: newChunks,
						});

						// 6. Prepare data for batch insert
						const embeddingsToInsert: IEmbedding[] = embeddingResponse.data.map((embedding, index) => {
							const chunk = newChunks[index];
							const metadata: IDataObject = {};
							metadataFields.forEach(field => {
								if (items[i].json[field]) {
									metadata[field] = items[i].json[field];
								}
							});

							return {
								source_id: sourceId,
								content: chunk,
								content_hash: createContentHash(chunk),
								embedding: embedding.embedding,
								token_count: embedding.usage.total_tokens,
								metadata,
							};
						});

						// 7. Batch insert into the database
						const insertedCount = await batchInsertEmbeddings(pool, embeddingsToInsert);

						returnData.push({
							json: {
								...items[i].json,
								status: 'success',
								processedChunks: newChunks.length,
								insertedCount,
								skippedChunks: existingHashes.size,
							},
						});
						break;
					}

					case 'search': {
						const query = this.getNodeParameter('query', i) as string;
						const limit = this.getNodeParameter('limit', i) as number;
						const filterSourceIds = (this.getNodeParameter('filterSourceIds', i) as string)
							.split(',')
							.filter(Boolean);

						if (!query) {
							this.logger.warn(`No query provided for item ${i}. Skipping.`);
							continue;
						}

						// 1. Get OpenAI client
						const openApiCredentials = await this.getCredentials('openApiCredentials');
						const apiKey = openApiCredentials.apiKey as string;
						if (!openAiCache[apiKey]) {
							openAiCache[apiKey] = new OpenAI({ apiKey });
						}
						const openai = openAiCache[apiKey];

						// 2. Create an embedding for the query
						const embeddingResponse = await openai.embeddings.create({
							model: 'text-embedding-ada-002',
							input: query,
						});
						const queryEmbedding = embeddingResponse.data[0].embedding;

						// 3. Perform the semantic search
						const searchResults = await semanticSearch(pool, queryEmbedding, limit, filterSourceIds);

						// 4. Return the results
						// We wrap the array of results in a single n8n item.
						// If you want one item per result, you would loop here.
						returnData.push({
							json: {
								query,
								results: searchResults,
							},
						});
						break;
					}

					case 'manage':
						// ... (manage logic to be implemented)
						break;

					default:
						throw new Error(`The operation "${operation}" is not supported.`);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					items[i].json.error = error.message;
					returnData.push(items[i]);
					continue;
				}
				throw error;
			}
		}

		return this.prepareOutputData(returnData);
	}
}
