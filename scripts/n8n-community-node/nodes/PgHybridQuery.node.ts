import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';
import { Client } from 'pg';
import { embedText, vectorToSqlArray } from '../shared/embedding';

interface PgCreds { host: string; port: number; database: string; user: string; password?: string; ssl?: boolean; }

export class PgHybridQuery implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'PG Hybrid Query',
    name: 'pgHybridQuery',
    group: ['transform'],
    version: 1,
    description: 'Combine BM25 (tsvector) and vector similarity scores',
    defaults: { name: 'PG Hybrid Query' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [
      { name: 'postgresWithVectorApi', required: true },
      { name: 'openAIApi', required: true },
    ],
    properties: [
      { displayName: 'Table', name: 'table', type: 'string', default: '', required: true },
      { displayName: 'TSVector Column', name: 'tsvColumn', type: 'string', default: 'tsv' },
      { displayName: 'Embedding Column', name: 'embeddingColumn', type: 'string', default: 'embedding' },
      { displayName: 'Language', name: 'language', type: 'string', default: 'english' },
      { displayName: 'Query Text', name: 'queryText', type: 'string', default: '', required: true },
      { displayName: 'Return Columns (CSV)', name: 'returnColumnsCsv', type: 'string', default: '*'},
      { displayName: 'Top K', name: 'topK', type: 'number', default: 5 },
      { displayName: 'Vector Operator', name: 'distanceOp', type: 'options', default: '<->', options: [
        { name: 'Euclidean (<->)', value: '<->' },
        { name: 'Inner Product (<#>)', value: '<#>' },
        { name: 'Cosine (<=>)', value: '<=>' },
      ]},
      { displayName: 'BM25 Weight', name: 'bm25Weight', type: 'number', default: 0.5 },
      { displayName: 'Vector Weight', name: 'vecWeight', type: 'number', default: 0.5 },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const table = this.getNodeParameter('table', 0) as string;
    const tsvColumn = (this.getNodeParameter('tsvColumn', 0) as string) || 'tsv';
    const embeddingColumn = (this.getNodeParameter('embeddingColumn', 0) as string) || 'embedding';
    const language = (this.getNodeParameter('language', 0) as string) || 'english';
    const queryText = this.getNodeParameter('queryText', 0) as string;
    const returnColumnsCsv = (this.getNodeParameter('returnColumnsCsv', 0) as string) || '*';
    const topK = this.getNodeParameter('topK', 0) as number;
    const distanceOp = (this.getNodeParameter('distanceOp', 0) as string) as '<->' | '<#>' | '<=>';
    const bm25Weight = Number(this.getNodeParameter('bm25Weight', 0));
    const vecWeight = Number(this.getNodeParameter('vecWeight', 0));

    const creds = (await this.getCredentials('postgresWithVectorApi')) as unknown as PgCreds;
    const client = new Client({
      host: creds.host,
      port: creds.port,
      database: creds.database,
      user: creds.user,
      password: creds.password,
      ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
    });
    await client.connect();

    try {
      const embedding = await embedText(this, 0, queryText);
      const vec = vectorToSqlArray(embedding);
      // Normalize vector distance to similarity (smaller distance => higher score)
      // Use 1 / (1 + distance) as a simple transform; combine with ts_rank_cd
      const sql = `SELECT ${returnColumnsCsv},
        ts_rank_cd(${PgHybridQuery.escapeIdent(tsvColumn)}, plainto_tsquery($1, $2)) AS bm25,
        (1.0 / (1.0 + (${PgHybridQuery.escapeIdent(embeddingColumn)} ${distanceOp} $3::vector))) AS vecsim,
        (ts_rank_cd(${PgHybridQuery.escapeIdent(tsvColumn)}, plainto_tsquery($1, $2)) * $4
          + (1.0 / (1.0 + (${PgHybridQuery.escapeIdent(embeddingColumn)} ${distanceOp} $3::vector))) * $5) AS score
        FROM ${PgHybridQuery.escapeIdent(table)}
        WHERE ${PgHybridQuery.escapeIdent(tsvColumn)} @@ plainto_tsquery($1, $2)
        ORDER BY score DESC
        LIMIT $6`;

      const res = await client.query(sql, [language, queryText, vec, bm25Weight, vecWeight, topK]);
      const out: INodeExecutionData[] = res.rows.map((row: any) => ({ json: row }));
      return [out];
    } catch (err) {
      throw new NodeOperationError(this.getNode(), (err as Error).message);
    } finally {
      await client.end().catch(() => {});
    }
  }

  private static escapeIdent(name: string) { return '"' + name.replace(/"/g, '""') + '"'; }
}