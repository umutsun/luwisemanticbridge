import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeConnectionType,
} from 'n8n-workflow';
import { Client } from 'pg';
import OpenAI from 'openai';

export class AliceSemanticBridge implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Luwi Semantic Bridge',
    name: 'aliceSemanticBridge',
    icon: 'file:alice.svg',
    group: ['transform'],
    version: 1,
    description: 'Store and search semantic embeddings with PostgreSQL + pgvector',
    defaults: {
      name: 'Luwi Semantic Bridge,
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
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Embed and Store',
            value: 'embedStore',
            description: 'Generate embeddings and store in PostgreSQL',
          },
          {
            name: 'Search',
            value: 'search',
            description: 'Search for similar documents',
          },
        ],
        default: 'embedStore',
      },
      {
        displayName: 'Text',
        name: 'text',
        type: 'string',
        default: '',
        placeholder: 'Text to embed or search query',
        description: 'The text content to process',
      },
      {
        displayName: 'Document ID',
        name: 'documentId',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            operation: ['embedStore'],
          },
        },
        description: 'Unique identifier for the document',
      },
      {
        displayName: 'Metadata',
        name: 'metadata',
        type: 'json',
        default: '{}',
        displayOptions: {
          show: {
            operation: ['embedStore'],
          },
        },
        description: 'Additional metadata to store with the document',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 10,
        displayOptions: {
          show: {
            operation: ['search'],
          },
        },
        description: 'Maximum number of results to return',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const credentials = await this.getCredentials('aliceSemanticBridgeApi');

    // Initialize PostgreSQL client
    const pgClient = new Client({
      host: credentials.pgHost as string,
      port: credentials.pgPort as number,
      database: credentials.pgDatabase as string,
      user: credentials.pgUser as string,
      password: credentials.pgPassword as string,
      ssl: credentials.pgSsl === true ? { rejectUnauthorized: false } : false,
    });

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: credentials.openaiApiKey as string,
    });

    try {
      await pgClient.connect();

      // Ensure table exists
      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          text TEXT,
          embedding vector(1536),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      const operation = this.getNodeParameter('operation', 0) as string;

      for (let i = 0; i < items.length; i++) {
        const text = this.getNodeParameter('text', i) as string;

        if (operation === 'embedStore') {
          const documentId = this.getNodeParameter('documentId', i) as string;
          const metadata = this.getNodeParameter('metadata', i, {}) as object;

          // Generate embedding
          const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
          });

          const embedding = embeddingResponse.data[0].embedding;

          // Store in PostgreSQL
          await pgClient.query(
            `INSERT INTO documents (id, text, embedding, metadata)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO UPDATE
             SET text = $2, embedding = $3, metadata = $4`,
            [documentId, text, `[${embedding.join(',')}]`, JSON.stringify(metadata)]
          );

          returnData.push({
            json: {
              success: true,
              documentId,
              message: 'Document stored successfully',
            },
          });
        } else if (operation === 'search') {
          const limit = this.getNodeParameter('limit', i) as number;

          // Generate embedding for search query
          const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
          });

          const queryEmbedding = embeddingResponse.data[0].embedding;

          // Perform similarity search
          const result = await pgClient.query(
            `SELECT id, text, metadata,
                    1 - (embedding <=> $1::vector) as similarity
             FROM documents
             ORDER BY embedding <=> $1::vector
             LIMIT $2`,
            [`[${queryEmbedding.join(',')}]`, limit]
          );

          returnData.push({
            json: {
              query: text,
              results: result.rows,
            },
          });
        }
      }
    } catch (error) {
      throw new Error(`Operation failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await pgClient.end();
    }

    return [returnData];
  }
}