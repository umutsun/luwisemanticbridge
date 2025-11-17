import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';
import { embedText, vectorToSqlArray } from '../shared/embedding';
import { getPool } from '../shared/db';
import { AsembError, ErrorCode, ErrorHandler } from '../src/errors/AsembError';

interface PgCreds { host: string; port: number; database: string; user: string; password?: string; ssl?: boolean; }

export class PgvectorQuery implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'PGVector Query',
    name: 'pgvectorQuery',
    group: ['transform'],
    version: 1,
    description: 'Similarity search with pgvector',
    defaults: { name: 'PGVector Query' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [
      { name: 'postgresWithVectorApi', required: true },
      { name: 'openAIApi', required: true },
    ],
    properties: [
      { displayName: 'Table', name: 'table', type: 'string', default: '', required: true },
      { displayName: 'Embedding Column', name: 'embeddingColumn', type: 'string', default: 'embedding' },
      { displayName: 'Query Text', name: 'queryText', type: 'string', default: '', required: true },
      { displayName: 'Return Columns (CSV)', name: 'returnColumnsCsv', type: 'string', default: '*', description: 'Columns to return, e.g. id,text,metadata' },
      { displayName: 'Top K', name: 'topK', type: 'number', default: 5 },
      { displayName: 'Distance Operator', name: 'distanceOp', type: 'options', default: '<->', options: [
        { name: 'Euclidean (<->)', value: '<->' },
        { name: 'Inner Product (<#>)', value: '<#>' },
        { name: 'Cosine (<=>)', value: '<=>' },
      ]}
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const table = this.getNodeParameter('table', 0) as string;
    const embeddingColumn = (this.getNodeParameter('embeddingColumn', 0) as string) || 'embedding';
    const queryText = this.getNodeParameter('queryText', 0) as string;
    const returnColumnsCsv = (this.getNodeParameter('returnColumnsCsv', 0) as string) || '*';
    const topK = this.getNodeParameter('topK', 0) as number;
    const distanceOp = (this.getNodeParameter('distanceOp', 0) as string) as '<->' | '<#>' | '<=>';

    const creds = (await this.getCredentials('postgresWithVectorApi')) as unknown as PgCreds;
    const pool = getPool(this.getNode(), creds);

    try {
      const embedding = await embedText(this, 0, queryText);
      const embeddingSql = vectorToSqlArray(embedding);
      const query = `EXPLAIN ANALYZE SELECT ${returnColumnsCsv} FROM ${escapeIdent(table)} ORDER BY ${escapeIdent(embeddingColumn)} ${distanceOp} ${embeddingSql}::vector LIMIT $1`;
      const client = await pool.connect();
      try {
        const res = await client.query(query, [topK]);
        console.log(res.rows.map(row => row['QUERY PLAN']).join('\n'));
        const out: INodeExecutionData[] = res.rows.map((row: any) => ({ json: row }));
        return [out];
      } finally {
        client.release();
      }
    } catch (err) {
      if (err instanceof AsembError) {
        throw err.toNodeError(this.getNode());
      }
      throw ErrorHandler.wrapError(
        err,
        ErrorCode.SEARCH_FAILED,
        { table, topK, queryText }
      ).toNodeError(this.getNode());
    }
  }
}

function escapeIdent(name: string) { return '"' + name.replace(/"/g, '""') + '"'; }
