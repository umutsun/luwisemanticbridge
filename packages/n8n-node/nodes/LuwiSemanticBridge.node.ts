import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeConnectionType,
} from 'n8n-workflow';
import { Client } from 'pg';
import OpenAI from 'openai';

export class LuwiSemanticBridge implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Luwi Semantic Bridge',
    name: 'luwiSemanticBridge',
    icon: 'file:LuwiSemanticBridge.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'RAG-powered semantic search, chat completions, and bot message formatting for Telegram/WhatsApp',
    defaults: {
      name: 'Luwi Semantic Bridge',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: 'luwiSemanticBridgeApi',
        required: true,
      },
    ],
    properties: [
      // ===================
      // OPERATION SELECTOR
      // ===================
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
            action: 'Embed and store document',
          },
          {
            name: 'Semantic Search',
            value: 'search',
            description: 'Search for similar documents using vector similarity',
            action: 'Search similar documents',
          },
          {
            name: 'RAG Chat',
            value: 'ragChat',
            description: 'Answer questions using retrieved context (RAG)',
            action: 'RAG powered chat completion',
          },
          {
            name: 'Format for Telegram',
            value: 'formatTelegram',
            description: 'Format response for Telegram bot output',
            action: 'Format message for Telegram',
          },
          {
            name: 'Format for WhatsApp',
            value: 'formatWhatsApp',
            description: 'Format response for WhatsApp bot output',
            action: 'Format message for WhatsApp',
          },
        ],
        default: 'search',
      },

      // ===================
      // EMBED & STORE OPTIONS
      // ===================
      {
        displayName: 'Text',
        name: 'text',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'Text content to embed...',
        description: 'The text content to generate embeddings for',
        displayOptions: {
          show: {
            operation: ['embedStore'],
          },
        },
      },
      {
        displayName: 'Document ID',
        name: 'documentId',
        type: 'string',
        default: '',
        placeholder: 'doc-001',
        description: 'Unique identifier for the document (auto-generated if empty)',
        displayOptions: {
          show: {
            operation: ['embedStore'],
          },
        },
      },
      {
        displayName: 'Source',
        name: 'source',
        type: 'string',
        default: '',
        placeholder: 'website, pdf, manual...',
        description: 'Source of the document for filtering',
        displayOptions: {
          show: {
            operation: ['embedStore'],
          },
        },
      },
      {
        displayName: 'Metadata',
        name: 'metadata',
        type: 'json',
        default: '{}',
        description: 'Additional metadata to store with the document (JSON)',
        displayOptions: {
          show: {
            operation: ['embedStore'],
          },
        },
      },

      // ===================
      // SEARCH OPTIONS
      // ===================
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        typeOptions: {
          rows: 2,
        },
        default: '',
        placeholder: 'What is the return policy?',
        description: 'Search query to find similar documents',
        displayOptions: {
          show: {
            operation: ['search', 'ragChat'],
          },
        },
      },
      {
        displayName: 'Result Limit',
        name: 'limit',
        type: 'number',
        default: 5,
        description: 'Maximum number of results to return',
        displayOptions: {
          show: {
            operation: ['search', 'ragChat'],
          },
        },
      },
      {
        displayName: 'Minimum Similarity',
        name: 'minSimilarity',
        type: 'number',
        default: 0.7,
        description: 'Minimum similarity score (0-1) to include in results',
        typeOptions: {
          minValue: 0,
          maxValue: 1,
          numberPrecision: 2,
        },
        displayOptions: {
          show: {
            operation: ['search', 'ragChat'],
          },
        },
      },
      {
        displayName: 'Filter by Source',
        name: 'filterSource',
        type: 'string',
        default: '',
        placeholder: 'Leave empty for all sources',
        description: 'Filter results by source field',
        displayOptions: {
          show: {
            operation: ['search', 'ragChat'],
          },
        },
      },

      // ===================
      // RAG CHAT OPTIONS
      // ===================
      {
        displayName: 'System Prompt',
        name: 'systemPrompt',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: 'You are a helpful assistant. Answer questions based on the provided context. If the context doesn\'t contain relevant information, say so.',
        description: 'System prompt for the AI assistant',
        displayOptions: {
          show: {
            operation: ['ragChat'],
          },
        },
      },
      {
        displayName: 'Model',
        name: 'model',
        type: 'options',
        options: [
          { name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
          { name: 'GPT-4o', value: 'gpt-4o' },
          { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
          { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
        ],
        default: 'gpt-4o-mini',
        description: 'OpenAI model to use for chat completion',
        displayOptions: {
          show: {
            operation: ['ragChat'],
          },
        },
      },
      {
        displayName: 'Temperature',
        name: 'temperature',
        type: 'number',
        default: 0.7,
        description: 'Controls randomness (0=deterministic, 1=creative)',
        typeOptions: {
          minValue: 0,
          maxValue: 2,
          numberPrecision: 1,
        },
        displayOptions: {
          show: {
            operation: ['ragChat'],
          },
        },
      },
      {
        displayName: 'Max Tokens',
        name: 'maxTokens',
        type: 'number',
        default: 1000,
        description: 'Maximum tokens in the response',
        displayOptions: {
          show: {
            operation: ['ragChat'],
          },
        },
      },
      {
        displayName: 'Include Sources',
        name: 'includeSources',
        type: 'boolean',
        default: true,
        description: 'Whether to include source references in the response',
        displayOptions: {
          show: {
            operation: ['ragChat'],
          },
        },
      },

      // ===================
      // TELEGRAM FORMAT OPTIONS
      // ===================
      {
        displayName: 'Message',
        name: 'telegramMessage',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'Message to format for Telegram...',
        description: 'The message content to format',
        displayOptions: {
          show: {
            operation: ['formatTelegram'],
          },
        },
      },
      {
        displayName: 'Parse Mode',
        name: 'telegramParseMode',
        type: 'options',
        options: [
          { name: 'HTML', value: 'HTML' },
          { name: 'Markdown', value: 'Markdown' },
          { name: 'MarkdownV2', value: 'MarkdownV2' },
          { name: 'Plain Text', value: 'plain' },
        ],
        default: 'HTML',
        description: 'Telegram message parse mode',
        displayOptions: {
          show: {
            operation: ['formatTelegram'],
          },
        },
      },
      {
        displayName: 'Add Sources Footer',
        name: 'telegramAddSources',
        type: 'boolean',
        default: false,
        description: 'Whether to add source links at the bottom',
        displayOptions: {
          show: {
            operation: ['formatTelegram'],
          },
        },
      },
      {
        displayName: 'Sources',
        name: 'telegramSources',
        type: 'json',
        default: '[]',
        description: 'Array of source objects [{title, url}]',
        displayOptions: {
          show: {
            operation: ['formatTelegram'],
            telegramAddSources: [true],
          },
        },
      },

      // ===================
      // WHATSAPP FORMAT OPTIONS
      // ===================
      {
        displayName: 'Message',
        name: 'whatsappMessage',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'Message to format for WhatsApp...',
        description: 'The message content to format',
        displayOptions: {
          show: {
            operation: ['formatWhatsApp'],
          },
        },
      },
      {
        displayName: 'Format Style',
        name: 'whatsappStyle',
        type: 'options',
        options: [
          { name: 'Plain', value: 'plain' },
          { name: 'With Formatting', value: 'formatted' },
          { name: 'Compact', value: 'compact' },
        ],
        default: 'formatted',
        description: 'WhatsApp message formatting style',
        displayOptions: {
          show: {
            operation: ['formatWhatsApp'],
          },
        },
      },
      {
        displayName: 'Add Sources Footer',
        name: 'whatsappAddSources',
        type: 'boolean',
        default: false,
        description: 'Whether to add source links at the bottom',
        displayOptions: {
          show: {
            operation: ['formatWhatsApp'],
          },
        },
      },
      {
        displayName: 'Sources',
        name: 'whatsappSources',
        type: 'json',
        default: '[]',
        description: 'Array of source objects [{title, url}]',
        displayOptions: {
          show: {
            operation: ['formatWhatsApp'],
            whatsappAddSources: [true],
          },
        },
      },

      // ===================
      // EMBEDDING OPTIONS
      // ===================
      {
        displayName: 'Embedding Model',
        name: 'embeddingModel',
        type: 'options',
        options: [
          { name: 'text-embedding-3-small (Recommended)', value: 'text-embedding-3-small' },
          { name: 'text-embedding-3-large', value: 'text-embedding-3-large' },
          { name: 'text-embedding-ada-002 (Legacy)', value: 'text-embedding-ada-002' },
        ],
        default: 'text-embedding-3-small',
        description: 'OpenAI embedding model to use',
        displayOptions: {
          show: {
            operation: ['embedStore', 'search', 'ragChat'],
          },
        },
      },

      // ===================
      // DATABASE OPTIONS
      // ===================
      {
        displayName: 'Table Name',
        name: 'tableName',
        type: 'string',
        default: 'documents',
        description: 'PostgreSQL table name for storing embeddings',
        displayOptions: {
          show: {
            operation: ['embedStore', 'search', 'ragChat'],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const operation = this.getNodeParameter('operation', 0) as string;

    // For format operations, we don't need DB/OpenAI
    if (operation === 'formatTelegram' || operation === 'formatWhatsApp') {
      for (let i = 0; i < items.length; i++) {
        if (operation === 'formatTelegram') {
          const message = this.getNodeParameter('telegramMessage', i) as string;
          const parseMode = this.getNodeParameter('telegramParseMode', i) as string;
          const addSources = this.getNodeParameter('telegramAddSources', i) as boolean;

          let formattedMessage = message;

          if (addSources) {
            const sources = this.getNodeParameter('telegramSources', i, []) as Array<{title: string, url: string}>;
            if (sources.length > 0) {
              if (parseMode === 'HTML') {
                formattedMessage += '\n\n<b>📚 Kaynaklar:</b>\n';
                sources.forEach((s, idx) => {
                  formattedMessage += `${idx + 1}. <a href="${s.url}">${s.title}</a>\n`;
                });
              } else if (parseMode === 'Markdown' || parseMode === 'MarkdownV2') {
                formattedMessage += '\n\n*📚 Kaynaklar:*\n';
                sources.forEach((s, idx) => {
                  formattedMessage += `${idx + 1}. [${s.title}](${s.url})\n`;
                });
              } else {
                formattedMessage += '\n\n📚 Kaynaklar:\n';
                sources.forEach((s, idx) => {
                  formattedMessage += `${idx + 1}. ${s.title}: ${s.url}\n`;
                });
              }
            }
          }

          returnData.push({
            json: {
              text: formattedMessage,
              parse_mode: parseMode === 'plain' ? undefined : parseMode,
              platform: 'telegram',
            },
          });
        } else if (operation === 'formatWhatsApp') {
          const message = this.getNodeParameter('whatsappMessage', i) as string;
          const style = this.getNodeParameter('whatsappStyle', i) as string;
          const addSources = this.getNodeParameter('whatsappAddSources', i) as boolean;

          let formattedMessage = message;

          // WhatsApp formatting
          if (style === 'formatted') {
            // Convert markdown-like syntax to WhatsApp format
            formattedMessage = formattedMessage
              .replace(/\*\*(.*?)\*\*/g, '*$1*')  // Bold
              .replace(/__(.*?)__/g, '_$1_');     // Italic
          } else if (style === 'compact') {
            // Remove extra whitespace
            formattedMessage = formattedMessage.replace(/\n{3,}/g, '\n\n').trim();
          }

          if (addSources) {
            const sources = this.getNodeParameter('whatsappSources', i, []) as Array<{title: string, url: string}>;
            if (sources.length > 0) {
              formattedMessage += '\n\n📚 *Kaynaklar:*\n';
              sources.forEach((s, idx) => {
                formattedMessage += `${idx + 1}. ${s.title}\n${s.url}\n`;
              });
            }
          }

          returnData.push({
            json: {
              text: formattedMessage,
              platform: 'whatsapp',
            },
          });
        }
      }
      return [returnData];
    }

    // For DB operations, get credentials
    const credentials = await this.getCredentials('luwiSemanticBridgeApi');
    const tableName = this.getNodeParameter('tableName', 0, 'documents') as string;
    const embeddingModel = this.getNodeParameter('embeddingModel', 0, 'text-embedding-3-small') as string;

    // Determine embedding dimensions based on model
    const embeddingDimensions = embeddingModel === 'text-embedding-3-large' ? 3072 : 1536;

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

      // Ensure table exists with proper structure
      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id TEXT PRIMARY KEY,
          text TEXT,
          embedding vector(${embeddingDimensions}),
          source TEXT,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create index for faster similarity search if not exists
      await pgClient.query(`
        CREATE INDEX IF NOT EXISTS idx_${tableName}_embedding
        ON ${tableName} USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `).catch(() => {
        // Index might fail if not enough rows, ignore
      });

      for (let i = 0; i < items.length; i++) {
        if (operation === 'embedStore') {
          const text = this.getNodeParameter('text', i) as string;
          let documentId = this.getNodeParameter('documentId', i) as string;
          const source = this.getNodeParameter('source', i, '') as string;
          const metadata = this.getNodeParameter('metadata', i, {}) as object;

          // Auto-generate ID if not provided
          if (!documentId) {
            documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          }

          // Generate embedding
          const embeddingResponse = await openai.embeddings.create({
            model: embeddingModel,
            input: text,
          });

          const embedding = embeddingResponse.data[0].embedding;

          // Store in PostgreSQL
          await pgClient.query(
            `INSERT INTO ${tableName} (id, text, embedding, source, metadata, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (id) DO UPDATE
             SET text = $2, embedding = $3, source = $4, metadata = $5, updated_at = NOW()`,
            [documentId, text, `[${embedding.join(',')}]`, source, JSON.stringify(metadata)]
          );

          returnData.push({
            json: {
              success: true,
              documentId,
              source,
              textLength: text.length,
              embeddingModel,
              message: 'Document stored successfully',
            },
          });

        } else if (operation === 'search') {
          const query = this.getNodeParameter('query', i) as string;
          const limit = this.getNodeParameter('limit', i) as number;
          const minSimilarity = this.getNodeParameter('minSimilarity', i) as number;
          const filterSource = this.getNodeParameter('filterSource', i, '') as string;

          // Generate embedding for search query
          const embeddingResponse = await openai.embeddings.create({
            model: embeddingModel,
            input: query,
          });

          const queryEmbedding = embeddingResponse.data[0].embedding;

          // Build query with optional source filter
          let searchQuery = `
            SELECT id, text, source, metadata,
                   1 - (embedding <=> $1::vector) as similarity
            FROM ${tableName}
            WHERE 1 - (embedding <=> $1::vector) >= $2
          `;
          const params: any[] = [`[${queryEmbedding.join(',')}]`, minSimilarity];

          if (filterSource) {
            searchQuery += ` AND source = $3`;
            params.push(filterSource);
          }

          searchQuery += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
          params.push(limit);

          const result = await pgClient.query(searchQuery, params);

          returnData.push({
            json: {
              query,
              totalResults: result.rows.length,
              results: result.rows.map(row => ({
                id: row.id,
                text: row.text,
                source: row.source,
                similarity: parseFloat(row.similarity.toFixed(4)),
                metadata: row.metadata,
              })),
            },
          });

        } else if (operation === 'ragChat') {
          const query = this.getNodeParameter('query', i) as string;
          const limit = this.getNodeParameter('limit', i) as number;
          const minSimilarity = this.getNodeParameter('minSimilarity', i) as number;
          const filterSource = this.getNodeParameter('filterSource', i, '') as string;
          const systemPrompt = this.getNodeParameter('systemPrompt', i) as string;
          const model = this.getNodeParameter('model', i) as string;
          const temperature = this.getNodeParameter('temperature', i) as number;
          const maxTokens = this.getNodeParameter('maxTokens', i) as number;
          const includeSources = this.getNodeParameter('includeSources', i) as boolean;

          // Step 1: Retrieve relevant documents
          const embeddingResponse = await openai.embeddings.create({
            model: embeddingModel,
            input: query,
          });

          const queryEmbedding = embeddingResponse.data[0].embedding;

          let searchQuery = `
            SELECT id, text, source, metadata,
                   1 - (embedding <=> $1::vector) as similarity
            FROM ${tableName}
            WHERE 1 - (embedding <=> $1::vector) >= $2
          `;
          const params: any[] = [`[${queryEmbedding.join(',')}]`, minSimilarity];

          if (filterSource) {
            searchQuery += ` AND source = $3`;
            params.push(filterSource);
          }

          searchQuery += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
          params.push(limit);

          const searchResult = await pgClient.query(searchQuery, params);

          // Step 2: Build context from retrieved documents
          const context = searchResult.rows.map((row, idx) =>
            `[${idx + 1}] ${row.text}`
          ).join('\n\n');

          const sources = searchResult.rows.map(row => ({
            id: row.id,
            source: row.source,
            similarity: parseFloat(row.similarity.toFixed(4)),
          }));

          // Step 3: Generate response with context
          const messages = [
            { role: 'system' as const, content: systemPrompt },
            {
              role: 'user' as const,
              content: `Context:\n${context}\n\n---\n\nQuestion: ${query}`
            },
          ];

          const completion = await openai.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
          });

          const answer = completion.choices[0]?.message?.content || 'No response generated';

          returnData.push({
            json: {
              query,
              answer,
              model,
              sources: includeSources ? sources : undefined,
              contextDocuments: searchResult.rows.length,
              usage: {
                promptTokens: completion.usage?.prompt_tokens,
                completionTokens: completion.usage?.completion_tokens,
                totalTokens: completion.usage?.total_tokens,
              },
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
