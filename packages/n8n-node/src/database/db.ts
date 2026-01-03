import { IDataObject } from 'n8n-workflow';
import { Pool, PoolConfig } from 'pg';

/**
 * @file db.ts
 * @description Database utility functions for interacting with the PostgreSQL/pgvector database.
 * @author Codex (Implementation Lead)
 * @version 1.0.0
 */

// Embedding interface for type safety
export interface IEmbeddingData {
  source_id: string;
  content: string;
  content_hash: string;
  embedding: number[];
  token_count: number;
  metadata: IDataObject;
}

let pool: Pool;

/**
 * Returns a singleton instance of the PostgreSQL connection pool.
 * Initializes the pool if it doesn't exist.
 * @param {IDataObject} credentials - The database credentials from the n8n node.
 * @returns {Pool} The PostgreSQL connection pool.
 */
function getPool(credentials: IDataObject): Pool {
	if (!pool) {
		const config: PoolConfig = {
			user: credentials.user as string,
			host: credentials.host as string,
			database: credentials.database as string,
			password: credentials.password as string,
			port: credentials.port as number,
			ssl: credentials.ssl as boolean,
		};
		pool = new Pool(config);
	}
	return pool;
}

/**
 * Fetches existing embeddings from the database based on their content hashes.
 * This is a crucial step in the deduplication process to avoid re-embedding the same content.
 * @param {Pool} poolInstance - The PostgreSQL connection pool.
 * @param {string[]} hashes - An array of SHA-256 content hashes to check.
 * @returns {Promise<Set<string>>} A promise that resolves to a Set containing the hashes that already exist in the database.
 */
export async function getExistingHashes(poolInstance: Pool, hashes: string[]): Promise<Set<string>> {
	if (hashes.length === 0) {
		return new Set();
	}
	const query = 'SELECT content_hash FROM embeddings WHERE content_hash = ANY($1)';
	const result = await poolInstance.query(query, [hashes]);
	return new Set(result.rows.map((row) => row.content_hash));
}

/**
 * Inserts new embeddings into the database in a single batch operation.
 * This is more efficient than inserting rows one by one.
 * @param {Pool} poolInstance - The PostgreSQL connection pool.
 * @param {IEmbedding[]} embeddings - An array of embedding objects to insert.
 * @returns {Promise<number>} A promise that resolves to the number of rows inserted.
 */
export async function batchInsertEmbeddings(poolInstance: Pool, embeddings: IEmbeddingData[]): Promise<number> {
	if (embeddings.length === 0) {
		return 0;
	}

	const client = await poolInstance.connect();
	try {
		await client.query('BEGIN');

		// Using a single query with multiple VALUES clauses is highly efficient.
		const query = `
            INSERT INTO embeddings (source_id, content, content_hash, embedding, token_count, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;

		// Note: This is a simplified version. For true bulk insert, a library like 'pg-copy-streams'
		// or a more complex query builder would be used. For n8n's typical batch sizes,
		// looping through promises is acceptable.
		for (const embedding of embeddings) {
			const vectorString = `[${embedding.embedding.join(',')}]`;
			await client.query(query, [
				embedding.source_id,
				embedding.content,
				embedding.content_hash,
				vectorString,
				embedding.token_count,
				embedding.metadata,
			]);
		}

		await client.query('COMMIT');
		return embeddings.length;
	} catch (e) {
		await client.query('ROLLBACK');
		throw e;
	} finally {
		client.release();
	}
}

// We need a simple interface for the embedding object.
// This should be moved to a shared types file later.
// For now, defining it here.
export interface IEmbedding {
    source_id: string;
    content: string;
    content_hash: string;
    embedding: number[];
    token_count: number;
    metadata: IDataObject;
}


export { getPool };


/**
 * Performs a semantic search on the embeddings table using cosine similarity.
 * @param {Pool} poolInstance - The PostgreSQL connection pool.
 * @param {number[]} queryEmbedding - The vector embedding of the search query.
 * @param {number} limit - The maximum number of results to return.
 * @param {string[]} [sourceIds=[]] - Optional array of source IDs to filter the search.
 * @returns {Promise<any[]>} A promise that resolves to an array of search results.
 */
export async function semanticSearch(
	poolInstance: Pool,
	queryEmbedding: number[],
	limit: number,
	sourceIds: string[] = [],
): Promise<any[]> {
	if (!queryEmbedding || queryEmbedding.length === 0) {
		return [];
	}

	const client = await poolInstance.connect();
	try {
		// The <=> operator calculates the cosine distance (0 = exact match, 1 = opposite).
		// We order by this distance to get the most similar results first.
		// 1 - distance = similarity score.
		let queryString = `
            SELECT
                id,
                source_id,
                content,
                metadata,
                1 - (embedding <=> $1) as similarity
            FROM
                embeddings
        `;

		const queryParams: any[] = [`[${queryEmbedding.join(',')}]`];

		if (sourceIds.length > 0) {
			queryString += ` WHERE source_id = ANY($2)`;
			queryParams.push(sourceIds);
		}

		queryString += ` ORDER BY similarity DESC LIMIT ${queryParams.length + 1}`;
		queryParams.push(limit);

		const result = await client.query(queryString, queryParams);
		return result.rows;
	} finally {
		client.release();
	}
}

