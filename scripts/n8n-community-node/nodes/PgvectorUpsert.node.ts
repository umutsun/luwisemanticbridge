import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';
import { getPool } from '../shared/db';
import { embedText, vectorToSqlArray } from '../shared/embedding';
import { AsembError, ErrorCode, ErrorHandler } from '../src/errors/AsembError';

interface PgCreds {
  host: string; port: number; database: string; user: string; password?: string; ssl?: boolean;
}

export class PgvectorUpsert implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'PGVector Upsert',
    name: 'pgvectorUpsert',
    group: ['transform'],
    version: 1,
    description: 'Create embeddings and upsert rows into a Postgres table with pgvector',
    defaults: { name: 'PGVector Upsert' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [
      { name: 'postgresWithVectorApi', required: true },
      { name: 'openAIApi', required: true },
    ],
    properties: [
      { displayName: 'Table', name: 'table', type: 'string', default: '', required: true },
      { displayName: 'Text Field (from item)', name: 'textField', type: 'string', default: 'text', description: 'Path to text in item JSON (e.g. "content")' },
      { displayName: 'ID Column', name: 'idColumn', type: 'string', default: 'id', description: 'Column to use for upsert conflict' },
      { displayName: 'ID Value (from item)', name: 'idField', type: 'string', default: '', description: 'Path to ID in item JSON; if empty, a hash of text is used' },
      { displayName: 'Text Column', name: 'textColumn', type: 'string', default: 'text', description: 'Target column to store raw text' },
      { displayName: 'Embedding Column', name: 'embeddingColumn', type: 'string', default: 'embedding' },
      { displayName: 'Additional Columns JSON', name: 'extraColumnsJson', type: 'string', default: '', description: 'Optional JSON object mapping column names to item JSON paths' }
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const table = this.getNodeParameter('table', 0) as string;
    const idColumn = (this.getNodeParameter('idColumn', 0) as string) || 'id';
    const textColumn = (this.getNodeParameter('textColumn', 0) as string) || 'text';
    const embeddingColumn = (this.getNodeParameter('embeddingColumn', 0) as string) || 'embedding';
    const textField = (this.getNodeParameter('textField', 0) as string) || 'text';
    const idField = (this.getNodeParameter('idField', 0) as string) || '';
    const extraColumnsJson = (this.getNodeParameter('extraColumnsJson', 0) as string) || '';

    let extraMap: Record<string, string> = {};
    if (extraColumnsJson) {
      try { extraMap = JSON.parse(extraColumnsJson); } catch (error) {
        throw new AsembError(
          ErrorCode.INVALID_INPUT,
          'Invalid Additional Columns JSON',
          { context: { extraColumnsJson } }
        ).toNodeError(this.getNode());
      }
    }

    const creds = (await this.getCredentials('postgresWithVectorApi')) as unknown as PgCreds;
    const pool = getPool(this.getNode(), creds);

    const returnData: INodeExecutionData[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]?.json || {};
        const textValue = this.getNodeParameter('textField', i) ? (this.getNodeParameter('textField', i) as string).split('.').reduce((acc: any, k: string) => acc?.[k], item) : item['text'];
        const idValue = idField ? idField.split('.').reduce((acc: any, k: string) => acc?.[k], item) : undefined;
        if (!textValue || typeof textValue !== 'string') {
          throw new AsembError(
            ErrorCode.MISSING_REQUIRED_FIELD,
            'Text not found on item',
            { context: { itemIndex: i, textField } }
          ).toNodeError(this.getNode());
        }

        const embedding = await embedText(this, i, textValue);
        const embeddingSql = vectorToSqlArray(embedding);

        const extras: Record<string, any> = {};
        for (const [col, path] of Object.entries(extraMap)) {
          const val = path.split('.').reduce((acc: any, k: string) => acc?.[k], item);
          extras[col] = val;
        }

        // Build dynamic query
        const cols = [idColumn, textColumn, embeddingColumn, ...Object.keys(extras)];
        const placeholders = cols.map((c, idx) => c === embeddingColumn ? `${idx + 1}::vector` : `${idx + 1}`);
        const updates = cols.filter(c => c !== idColumn).map((c) => `${escapeIdent(c)}=EXCLUDED.${escapeIdent(c)}`);
        const values: any[] = [idValue ?? hashString(textValue), textValue, embeddingSql, ...Object.values(extras)];

        const query = `INSERT INTO ${escapeIdent(table)} (${cols.map(escapeIdent).join(',')}) VALUES (${placeholders.join(',')})
          ON CONFLICT (${escapeIdent(idColumn)}) DO UPDATE SET ${updates.join(', ')} RETURNING *`;
        
        const client = await pool.connect();
        try {
          const res = await client.query(query, values);
          returnData.push({ json: res.rows[0] });
        } finally {
          client.release();
        }
      }
    } catch (err) {
      if (err instanceof AsembError) {
        throw err.toNodeError(this.getNode());
      }
      throw ErrorHandler.wrapError(
        err,
        ErrorCode.DATABASE_QUERY_FAILED,
        { table, operation: 'upsert' }
      ).toNodeError(this.getNode());
    }

    return [returnData];
  }

}

function escapeIdent(name: string) { return '"' + name.replace(/"/g, '""') + '"'; }
function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  // Convert to positive 32-bit
  return Math.abs(h).toString();
}
