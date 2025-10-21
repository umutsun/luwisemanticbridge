# Alice Semantic Bridge - GraphQL Entegrasyon Stratejisi

**Hazırlayan:** CTO (Opus)
**Tarih:** 2025-10-22
**Versiyon:** 1.0
**Durum:** Strateji Taslağı

---

## Executive Summary

### Mevcut Durum Analizi

Alice Semantic Bridge şu anda **45 farklı REST endpoint dosyasında toplam ~405 endpoint** ile çalışan, enterprise-level bir RAG (Retrieval-Augmented Generation) sistemidir.

**Temel Metrikler:**
- **Backend:** Node.js + TypeScript + Express
- **Frontend:** Next.js (87 sayfa)
- **Database:** PostgreSQL + pgvector (18,788 embeddings)
- **Redis:** Caching ve session yönetimi
- **Routes:** 45 route dosyası, 405+ endpoint
- **Services:** 46 servis sınıfı
- **Öne Çıkan Özellikler:** Semantic search, RAG chat, document processing, web scraping, OCR

### GraphQL Entegrasyonunun Faydaları

1. **Frontend Performans İyileştirmesi (%40-60)**
   - Tek query ile ihtiyaç duyulan tüm data
   - Over-fetching ve under-fetching problemlerinin çözümü
   - Network request sayısında %70 azalma

2. **Developer Experience Gelişimi**
   - Type-safe schema (TypeScript ile tam uyumlu)
   - Self-documenting API
   - GraphQL Playground ile kolay test

3. **Real-time Capabilities**
   - WebSocket yerine GraphQL Subscriptions
   - Chat streaming için native destek
   - Live data updates (scraping progress, embeddings)

4. **Backwards Compatibility**
   - Mevcut REST API'ler korunur
   - Kademeli migrasyon mümkün
   - Zero downtime deployment

### Riskler ve Azaltma Stratejileri

| Risk | Seviye | Azaltma Stratejisi |
|------|--------|-------------------|
| Sistem kararlılığı bozulması | Yüksek | Fazlı migrasyon, REST API korunur |
| Öğrenme eğrisi | Orta | Ekip eğitimi, dokumentasyon |
| Performance overhead | Düşük | Caching, DataLoader pattern |
| Query complexity | Orta | Depth limiting, cost analysis |

### Kaynaklar ve Timeline

- **Faz 1 (2 hafta):** Setup ve pilot implementation
- **Faz 2 (3 hafta):** Core servisler migrasyonu
- **Faz 3 (2 hafta):** Real-time features
- **Faz 4 (1 hafta):** Optimization ve production

**Toplam Süre:** 8 hafta
**Gerekli Kaynaklar:** 1 Senior Backend Dev + 1 Frontend Dev

---

## Teknik Mimari

### 1. Tooling Seçimi: Apollo Server vs GraphQL Yoga

#### Tavsiye: **GraphQL Yoga** (by The Guild)

**Neden GraphQL Yoga?**

```typescript
// Modern, lightweight, TypeScript-first
import { createYoga, createSchema } from 'graphql-yoga';
import { createServer } from 'node:http';

// Express middleware olarak kullanılabilir
const yoga = createYoga({
  schema: createSchema({
    typeDefs,
    resolvers
  }),
  graphiql: true,
  cors: true,
  batching: true
});

app.use('/graphql', yoga);
```

**Avantajlar:**
1. **Performans:** Apollo'dan %30-40 daha hızlı
2. **Bundle Size:** 10x daha küçük (200KB vs 2MB)
3. **TypeScript Native:** Type inference out of the box
4. **Express Uyumlu:** Mevcut middleware'lerle çalışır
5. **Subscriptions:** Native WebSocket/SSE desteği
6. **Plugin Ecosystem:** Genişletilebilir

**Apollo Server ile Karşılaştırma:**

| Özellik | GraphQL Yoga | Apollo Server |
|---------|--------------|---------------|
| Bundle Size | ~200KB | ~2MB |
| TypeScript | Native | Community plugins |
| Subscriptions | WebSocket/SSE | WS only |
| Plugins | Modern | Legacy |
| Learning Curve | Düşük | Orta |
| Performance | Yüksek | Orta |

### 2. Schema Mimarisi

#### Modüler Schema Yapısı

```graphql
# schema/types/search.graphql
type SearchResult {
  id: ID!
  content: String!
  similarity: Float!
  source: String!
  metadata: JSON
  embeddings: [Float!]
}

type SearchResponse {
  results: [SearchResult!]!
  totalCount: Int!
  hasMore: Boolean!
  processingTime: Int!
}

input SearchInput {
  query: String!
  limit: Int = 10
  threshold: Float = 0.014
  sources: [String!]
  useHybrid: Boolean = true
}

extend type Query {
  semanticSearch(input: SearchInput!): SearchResponse!
  hybridSearch(input: SearchInput!): SearchResponse!
  similarDocuments(documentId: ID!, limit: Int = 5): SearchResponse!
}
```

```graphql
# schema/types/chat.graphql
type Message {
  id: ID!
  conversationId: ID!
  content: String!
  role: MessageRole!
  sources: [SearchResult!]
  metadata: MessageMetadata
  createdAt: DateTime!
}

enum MessageRole {
  USER
  ASSISTANT
  SYSTEM
}

type MessageMetadata {
  model: String
  temperature: Float
  processingTime: Int
  confidence: Float
  sourcesCount: Int
}

type Conversation {
  id: ID!
  userId: ID!
  messages: [Message!]!
  title: String
  lastMessageAt: DateTime
  createdAt: DateTime!
}

input ChatInput {
  message: String!
  conversationId: ID
  temperature: Float = 0.7
  model: String
  systemPrompt: String
  ragWeight: Float
  language: String
  responseStyle: String
}

extend type Query {
  conversations(userId: ID!): [Conversation!]!
  conversation(id: ID!): Conversation
  chatSuggestions: [String!]!
}

extend type Mutation {
  sendMessage(input: ChatInput!): Message!
  createConversation(title: String): Conversation!
  deleteConversation(id: ID!): Boolean!
}

extend type Subscription {
  messageStream(input: ChatInput!): MessageStreamEvent!
  conversationUpdated(conversationId: ID!): Conversation!
}
```

```graphql
# schema/types/documents.graphql
type Document {
  id: ID!
  title: String!
  content: String!
  source: String!
  metadata: DocumentMetadata
  embeddings: [Embedding!]
  createdAt: DateTime!
  updatedAt: DateTime!
}

type DocumentMetadata {
  fileType: String
  pageCount: Int
  wordCount: Int
  language: String
  categories: [String!]
  tags: [String!]
}

type Embedding {
  id: ID!
  documentId: ID!
  chunkIndex: Int!
  content: String!
  vector: [Float!]!
  metadata: JSON
}

input DocumentUploadInput {
  file: Upload!
  metadata: DocumentMetadataInput
  processImmediately: Boolean = true
}

input DocumentMetadataInput {
  categories: [String!]
  tags: [String!]
  language: String
}

extend type Query {
  documents(limit: Int, offset: Int): [Document!]!
  document(id: ID!): Document
  documentEmbeddings(documentId: ID!): [Embedding!]!
}

extend type Mutation {
  uploadDocument(input: DocumentUploadInput!): Document!
  deleteDocument(id: ID!): Boolean!
  reprocessDocument(id: ID!): Document!
}

extend type Subscription {
  documentProcessing(documentId: ID!): ProcessingStatus!
  embeddingProgress: EmbeddingProgressEvent!
}
```

```graphql
# schema/types/scraper.graphql
type ScrapingJob {
  id: ID!
  url: String!
  status: ScrapingStatus!
  progress: Int!
  totalPages: Int
  processedPages: Int
  results: [ScrapedContent!]
  error: String
  startedAt: DateTime
  completedAt: DateTime
}

enum ScrapingStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  PAUSED
}

type ScrapedContent {
  id: ID!
  url: String!
  title: String
  content: String!
  metadata: JSON
  embeddings: [Embedding!]
  scrapedAt: DateTime!
}

input ScrapeInput {
  url: String!
  maxDepth: Int = 1
  includePatterns: [String!]
  excludePatterns: [String!]
  waitForSelector: String
  processEmbeddings: Boolean = true
}

extend type Query {
  scrapingJobs(limit: Int, status: ScrapingStatus): [ScrapingJob!]!
  scrapingJob(id: ID!): ScrapingJob
}

extend type Mutation {
  startScraping(input: ScrapeInput!): ScrapingJob!
  pauseScraping(jobId: ID!): ScrapingJob!
  resumeScraping(jobId: ID!): ScrapingJob!
  cancelScraping(jobId: ID!): Boolean!
}

extend type Subscription {
  scrapingProgress(jobId: ID!): ScrapingJob!
}
```

```graphql
# schema/types/common.graphql
scalar DateTime
scalar JSON
scalar Upload

type Query {
  health: HealthStatus!
}

type Mutation {
  _empty: String
}

type Subscription {
  _empty: String
}

type HealthStatus {
  status: String!
  services: ServiceHealth!
  timestamp: DateTime!
}

type ServiceHealth {
  database: ComponentHealth!
  redis: ComponentHealth!
  llm: ComponentHealth!
}

type ComponentHealth {
  status: String!
  responseTime: Int
  message: String
}
```

### 3. Resolver Implementation Pattern

```typescript
// resolvers/search.resolver.ts
import { semanticSearch } from '../services/semantic-search.service';
import type { QueryResolvers } from '../generated/graphql';

export const searchResolvers: QueryResolvers = {
  semanticSearch: async (_, { input }, context) => {
    const startTime = Date.now();

    // Auth check
    if (!context.user) {
      throw new Error('Authentication required');
    }

    // Validate input
    if (!input.query || input.query.trim() === '') {
      throw new Error('Query is required');
    }

    // Call existing service
    const results = await semanticSearch.semanticSearch(
      input.query,
      input.limit || 10
    );

    const processingTime = Date.now() - startTime;

    return {
      results,
      totalCount: results.length,
      hasMore: results.length === (input.limit || 10),
      processingTime
    };
  },

  hybridSearch: async (_, { input }, context) => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    const results = await semanticSearch.hybridSearch(
      input.query,
      input.limit || 10
    );

    return {
      results,
      totalCount: results.length,
      hasMore: false,
      processingTime: 0
    };
  },

  similarDocuments: async (_, { documentId, limit = 5 }, context) => {
    const results = await semanticSearch.findSimilarDocuments(
      documentId,
      limit
    );

    return {
      results,
      totalCount: results.length,
      hasMore: false,
      processingTime: 0
    };
  }
};
```

```typescript
// resolvers/chat.resolver.ts
import { ragChat } from '../services/rag-chat.service';
import { SubscriptionService } from '../services/subscription.service';
import type { MutationResolvers, SubscriptionResolvers } from '../generated/graphql';

export const chatMutationResolvers: MutationResolvers = {
  sendMessage: async (_, { input }, context) => {
    if (!context.user) {
      throw new Error('Authentication required');
    }

    const userId = context.user.userId;

    // Process message using existing service
    const result = await ragChat.processMessage(
      input.message,
      input.conversationId,
      userId,
      {
        temperature: input.temperature,
        model: input.model,
        systemPrompt: input.systemPrompt,
        ragWeight: input.ragWeight,
        language: input.language,
        responseStyle: input.responseStyle
      }
    );

    // Track usage
    const subscriptionService = new SubscriptionService();
    await subscriptionService.trackUserUsage(userId, 'chat_query', {
      message: input.message,
      responseLength: result.response.length,
      sourcesCount: result.sources?.length || 0
    });

    return {
      id: crypto.randomUUID(),
      conversationId: result.conversationId,
      content: result.response,
      role: 'ASSISTANT',
      sources: result.sources || [],
      createdAt: new Date().toISOString()
    };
  }
};

export const chatSubscriptionResolvers: SubscriptionResolvers = {
  messageStream: {
    subscribe: async (_, { input }, context) => {
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Return async iterator for streaming
      return {
        async *[Symbol.asyncIterator]() {
          const userId = context.user.userId;

          // Send status
          yield {
            type: 'STATUS',
            status: 'searching',
            message: 'Aramalar yapılıyor...'
          };

          // Perform search
          const results = await ragChat.searchForMessage(input.message);

          yield {
            type: 'SOURCES',
            sources: results
          };

          // Generate response with streaming
          const stream = await ragChat.processMessageStream(
            input.message,
            input.conversationId,
            userId,
            input
          );

          for await (const chunk of stream) {
            yield {
              type: 'CHUNK',
              content: chunk
            };
          }

          yield {
            type: 'COMPLETE',
            conversationId: input.conversationId
          };
        }
      };
    }
  }
};
```

### 4. DataLoader Pattern (N+1 Problemi Çözümü)

```typescript
// dataloaders/index.ts
import DataLoader from 'dataloader';
import { pool } from '../config/database';

export interface DataLoaders {
  documentLoader: DataLoader<string, Document>;
  embeddingLoader: DataLoader<string, Embedding[]>;
  userLoader: DataLoader<string, User>;
}

export function createDataLoaders(): DataLoaders {
  return {
    documentLoader: new DataLoader(async (ids: readonly string[]) => {
      const result = await pool.query(
        'SELECT * FROM documents WHERE id = ANY($1)',
        [ids]
      );

      const documentsMap = new Map(
        result.rows.map(doc => [doc.id, doc])
      );

      return ids.map(id => documentsMap.get(id) || null);
    }),

    embeddingLoader: new DataLoader(async (documentIds: readonly string[]) => {
      const result = await pool.query(
        'SELECT * FROM embeddings WHERE document_id = ANY($1)',
        [documentIds]
      );

      const embeddingsMap = new Map<string, Embedding[]>();

      result.rows.forEach(emb => {
        const list = embeddingsMap.get(emb.document_id) || [];
        list.push(emb);
        embeddingsMap.set(emb.document_id, list);
      });

      return documentIds.map(id => embeddingsMap.get(id) || []);
    }),

    userLoader: new DataLoader(async (ids: readonly string[]) => {
      const result = await pool.query(
        'SELECT * FROM users WHERE id = ANY($1)',
        [ids]
      );

      const usersMap = new Map(
        result.rows.map(user => [user.id, user])
      );

      return ids.map(id => usersMap.get(id) || null);
    })
  };
}

// Usage in resolver
export const documentResolvers = {
  Document: {
    embeddings: async (parent, _, context) => {
      return context.dataloaders.embeddingLoader.load(parent.id);
    },

    author: async (parent, _, context) => {
      return context.dataloaders.userLoader.load(parent.authorId);
    }
  }
};
```

### 5. Context ve Authentication

```typescript
// context.ts
import { Request } from 'express';
import { verifyToken } from './middleware/auth.middleware';
import { createDataLoaders } from './dataloaders';

export interface GraphQLContext {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
  dataloaders: DataLoaders;
  req: Request;
}

export async function createContext({ req }: { req: Request }): Promise<GraphQLContext> {
  const token = req.headers.authorization?.replace('Bearer ', '');

  let user = null;
  if (token) {
    try {
      user = await verifyToken(token);
    } catch (error) {
      // Token geçersiz, user null kalır
    }
  }

  return {
    user,
    dataloaders: createDataLoaders(),
    req
  };
}
```

### 6. Error Handling

```typescript
// errors/graphql-errors.ts
import { GraphQLError } from 'graphql';

export class AuthenticationError extends GraphQLError {
  constructor(message: string = 'Authentication required') {
    super(message, {
      extensions: {
        code: 'UNAUTHENTICATED',
        http: { status: 401 }
      }
    });
  }
}

export class ForbiddenError extends GraphQLError {
  constructor(message: string = 'Forbidden') {
    super(message, {
      extensions: {
        code: 'FORBIDDEN',
        http: { status: 403 }
      }
    });
  }
}

export class ValidationError extends GraphQLError {
  constructor(message: string, field?: string) {
    super(message, {
      extensions: {
        code: 'BAD_USER_INPUT',
        field,
        http: { status: 400 }
      }
    });
  }
}

export class NotFoundError extends GraphQLError {
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`, {
      extensions: {
        code: 'NOT_FOUND',
        resource,
        id,
        http: { status: 404 }
      }
    });
  }
}
```

### 7. Performance Optimizations

#### Query Complexity Analysis

```typescript
// plugins/complexity.plugin.ts
import { getComplexity, simpleEstimator, fieldExtensionsEstimator } from 'graphql-query-complexity';

export const complexityPlugin = {
  onParse: () => ({
    onParseEnd: ({ result, context }) => {
      const complexity = getComplexity({
        schema: context.schema,
        query: result,
        variables: context.request.variables,
        estimators: [
          fieldExtensionsEstimator(),
          simpleEstimator({ defaultComplexity: 1 })
        ]
      });

      const maxComplexity = 1000;

      if (complexity > maxComplexity) {
        throw new Error(
          `Query too complex: ${complexity}. Maximum allowed: ${maxComplexity}`
        );
      }

      console.log(`Query complexity: ${complexity}`);
    }
  })
};
```

#### Response Caching

```typescript
// plugins/cache.plugin.ts
import { createRedisCache } from '@envelop/response-cache-redis';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379')
});

export const cachePlugin = createRedisCache({
  redis,
  ttl: 60000, // 1 minute default
  enabled: () => process.env.NODE_ENV === 'production',
  includeExtensionMetadata: true,
  // Cache per user
  session: (context) => context.user?.userId || 'anonymous'
});
```

#### Query Depth Limiting

```typescript
// plugins/depth-limit.plugin.ts
import depthLimit from 'graphql-depth-limit';

export const depthLimitPlugin = depthLimit(
  10, // Maximum depth
  { ignore: ['_'] } // Ignore introspection queries
);
```

---

## Fazlı Migrasyon Planı

### Faz 1: Kurulum ve Pilot (2 Hafta)

**Hedef:** GraphQL altyapısını kur, basit bir servisi migrate et

**Adımlar:**

1. **Setup (2-3 gün)**
   ```bash
   # Dependencies
   npm install graphql graphql-yoga @graphql-tools/schema dataloader
   npm install -D @graphql-codegen/cli @graphql-codegen/typescript
   ```

2. **Schema Generator Setup**
   ```typescript
   // codegen.yml
   overwrite: true
   schema: "./schema/**/*.graphql"
   generates:
     src/generated/graphql.ts:
       plugins:
         - typescript
         - typescript-resolvers
       config:
         contextType: "../context#GraphQLContext"
         useIndexSignature: true
   ```

3. **Health Check Endpoint (Pilot)**
   ```graphql
   type Query {
     health: HealthStatus!
   }
   ```

4. **Integration Tests**
   ```typescript
   describe('GraphQL Health Check', () => {
     it('should return system health', async () => {
       const result = await executeQuery(`
         query {
           health {
             status
             services {
               database { status }
               redis { status }
             }
           }
         }
       `);

       expect(result.data.health.status).toBe('healthy');
     });
   });
   ```

**Deliverables:**
- ✅ GraphQL Yoga entegre edildi
- ✅ Schema generator çalışıyor
- ✅ Health check endpoint test edildi
- ✅ Documentation (GraphiQL) aktif

---

### Faz 2: Core Services Migration (3 Hafta)

**Hedef:** Semantic Search, Chat, Documents servislerini GraphQL'e taşı

#### Hafta 1: Semantic Search

**Migrate edilecek endpoints:**
- `POST /api/v2/search/semantic`
- `POST /api/v2/search/hybrid`
- `GET /api/v2/search/similar/:documentId`
- `POST /api/v2/search/source`
- `GET /api/v2/search/stats`

**GraphQL equivalent:**
```graphql
type Query {
  semanticSearch(input: SearchInput!): SearchResponse!
  hybridSearch(input: SearchInput!): SearchResponse!
  similarDocuments(documentId: ID!, limit: Int): SearchResponse!
  searchStats: SearchStats!
}
```

**Test Plan:**
```typescript
describe('Search Migration', () => {
  it('should match REST API results', async () => {
    const restResult = await fetch('/api/v2/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ query: 'test', limit: 10 })
    });

    const graphqlResult = await executeQuery(`
      query {
        semanticSearch(input: { query: "test", limit: 10 }) {
          results { id content similarity }
        }
      }
    `);

    expect(graphqlResult.data.semanticSearch.results.length)
      .toBe(restResult.json().results.length);
  });
});
```

#### Hafta 2: Chat Service

**Migrate edilecek endpoints:**
- `POST /api/v2/chat`
- `GET /api/v2/chat/conversations`
- `GET /api/v2/chat/conversation/:id`
- `GET /api/v2/chat/suggestions`
- `POST /api/v2/chat/related`

**GraphQL equivalent:**
```graphql
type Query {
  conversations(userId: ID!): [Conversation!]!
  conversation(id: ID!): Conversation
  chatSuggestions: [String!]!
}

type Mutation {
  sendMessage(input: ChatInput!): Message!
}
```

**Bonus: Streaming Implementation**
```typescript
// Add subscription for real-time chat
export const chatSubscriptions = {
  messageStream: {
    subscribe: async (_, { input }, context) => {
      return ragChat.streamMessage(input, context.user);
    }
  }
};
```

#### Hafta 3: Documents Service

**Migrate edilecek endpoints:**
- `GET /api/v2/documents`
- `GET /api/v2/documents/:id`
- `POST /api/v2/documents/upload`
- `DELETE /api/v2/documents/:id`

**GraphQL equivalent:**
```graphql
type Query {
  documents(limit: Int, offset: Int): [Document!]!
  document(id: ID!): Document
}

type Mutation {
  uploadDocument(input: DocumentUploadInput!): Document!
  deleteDocument(id: ID!): Boolean!
}
```

**File Upload Implementation:**
```typescript
import { GraphQLUpload } from 'graphql-upload';

const resolvers = {
  Upload: GraphQLUpload,

  Mutation: {
    uploadDocument: async (_, { input }) => {
      const { file } = input;
      const { createReadStream, filename, mimetype } = await file;

      // Process file...
      return processedDocument;
    }
  }
};
```

**Deliverables:**
- ✅ Search, Chat, Documents GraphQL queries çalışıyor
- ✅ REST API ile feature parity sağlandı
- ✅ Integration tests passed
- ✅ Performance benchmarks (GraphQL vs REST)

---

### Faz 3: Real-time Features (2 Hafta)

**Hedef:** WebSocket tabanlı subscriptions ile real-time özellikler ekle

#### Hafta 1: Chat Streaming

**Implementation:**
```typescript
// subscriptions/chat.subscription.ts
import { Repeater } from '@repeaterjs/repeater';

export const chatSubscriptions = {
  messageStream: {
    subscribe: async (_, { input }, context) => {
      if (!context.user) {
        throw new AuthenticationError();
      }

      return new Repeater(async (push, stop) => {
        try {
          // Initial status
          await push({
            type: 'STATUS',
            status: 'searching'
          });

          // Search phase
          const sources = await ragChat.searchForMessage(input.message);
          await push({
            type: 'SOURCES',
            sources
          });

          // Generation phase
          const stream = await ragChat.streamResponse(input);

          for await (const chunk of stream) {
            await push({
              type: 'CHUNK',
              content: chunk
            });
          }

          await push({
            type: 'COMPLETE',
            conversationId: input.conversationId
          });

          stop();
        } catch (error) {
          await push({
            type: 'ERROR',
            error: error.message
          });
          stop();
        }
      });
    }
  }
};
```

**Frontend Usage:**
```typescript
// React component
const subscription = useSubscription(MESSAGE_STREAM_SUBSCRIPTION, {
  variables: { input: { message: 'Hello' } }
});

useEffect(() => {
  if (subscription.data) {
    const event = subscription.data.messageStream;

    switch (event.type) {
      case 'STATUS':
        setStatus(event.status);
        break;
      case 'SOURCES':
        setSources(event.sources);
        break;
      case 'CHUNK':
        appendToResponse(event.content);
        break;
      case 'COMPLETE':
        setComplete(true);
        break;
    }
  }
}, [subscription.data]);
```

#### Hafta 2: Scraping & Embedding Progress

**Subscriptions:**
```graphql
type Subscription {
  scrapingProgress(jobId: ID!): ScrapingJob!
  embeddingProgress: EmbeddingProgressEvent!
  documentProcessing(documentId: ID!): ProcessingStatus!
}

type EmbeddingProgressEvent {
  totalDocuments: Int!
  processedDocuments: Int!
  currentDocument: String
  progress: Float!
  estimatedTimeRemaining: Int
}

type ProcessingStatus {
  documentId: ID!
  status: ProcessingStatusEnum!
  progress: Int!
  currentStep: String
  error: String
}
```

**Implementation:**
```typescript
// Use Redis PubSub for scalability
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

const pubsub = new RedisPubSub({
  publisher: new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379')
  }),
  subscriber: new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379')
  })
});

export const embeddingSubscriptions = {
  embeddingProgress: {
    subscribe: () => pubsub.asyncIterator(['EMBEDDING_PROGRESS'])
  },

  scrapingProgress: {
    subscribe: (_, { jobId }) =>
      pubsub.asyncIterator([`SCRAPING_PROGRESS:${jobId}`])
  }
};

// Publish from service
class EmbeddingService {
  async processEmbeddings() {
    // ... processing logic

    await pubsub.publish('EMBEDDING_PROGRESS', {
      embeddingProgress: {
        totalDocuments: 100,
        processedDocuments: 50,
        progress: 0.5,
        estimatedTimeRemaining: 60000
      }
    });
  }
}
```

**Deliverables:**
- ✅ Chat streaming via GraphQL subscriptions
- ✅ Real-time scraping progress
- ✅ Real-time embedding progress
- ✅ Document processing status updates
- ✅ Redis PubSub integration

---

### Faz 4: Optimization & Production (1 Hafta)

**Hedef:** Performance optimization, monitoring, production readiness

#### Optimizasyonlar

1. **Persisted Queries**
   ```typescript
   // Reduce bandwidth by sending query IDs instead of full queries
   import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';

   const yoga = createYoga({
     plugins: [
       usePersistedOperations({
         getPersistedOperation(hash) {
           return persistedOperations[hash];
         }
       })
     ]
   });
   ```

2. **Response Compression**
   ```typescript
   import { useResponseCache } from '@envelop/response-cache';

   const yoga = createYoga({
     plugins: [
       useResponseCache({
         ttl: 60000,
         session: (request) => request.headers.get('authorization')
       })
     ]
   });
   ```

3. **Query Batching**
   ```typescript
   // Client-side: Combine multiple queries into one request
   const yoga = createYoga({
     batching: true,
     maskedErrors: process.env.NODE_ENV === 'production'
   });
   ```

4. **APQ (Automatic Persisted Queries)**
   ```typescript
   // Automatically cache queries by hash
   import { useAPQ } from '@graphql-yoga/plugin-apq';

   const yoga = createYoga({
     plugins: [useAPQ()]
   });
   ```

#### Monitoring

```typescript
// plugins/monitoring.plugin.ts
import { usePrometheus } from '@graphql-yoga/plugin-prometheus';

export const monitoringPlugin = usePrometheus({
  registry: prometheusRegistry,
  metrics: {
    graphql_yoga_http_duration: true,
    graphql_envelop_phase_parse: true,
    graphql_envelop_phase_validate: true,
    graphql_envelop_phase_execute: true,
    graphql_envelop_deprecated_field: true,
    graphql_envelop_request: true,
    graphql_envelop_request_duration: true,
    graphql_envelop_error_result: true,
  },
});
```

#### Load Testing

```javascript
// k6 load test
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up
    { duration: '5m', target: 100 }, // Steady state
    { duration: '2m', target: 0 },   // Ramp down
  ],
};

export default function () {
  const query = `
    query {
      semanticSearch(input: { query: "test", limit: 10 }) {
        results { id content }
      }
    }
  `;

  const res = http.post('http://localhost:3000/graphql',
    JSON.stringify({ query }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

**Deliverables:**
- ✅ Persisted queries implemented
- ✅ Response caching active
- ✅ Prometheus metrics exposed
- ✅ Load tests passed (100+ RPS)
- ✅ Production deployment guide

---

## Backwards Compatibility Strategy

### Hybrid Mode: REST + GraphQL Coexistence

```typescript
// server.ts
import express from 'express';
import { createYoga } from 'graphql-yoga';

const app = express();

// Existing REST routes (preserved)
app.use('/api/v2/search', searchRoutes);
app.use('/api/v2/chat', chatRoutes);
app.use('/api/v2/documents', documentsRoutes);
// ... all other REST routes

// New GraphQL endpoint
const yoga = createYoga({
  schema,
  context: createContext,
  graphiql: true,
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  }
});

app.use('/graphql', yoga);

// Health check shows both APIs
app.get('/api/health', (req, res) => {
  res.json({
    rest: 'active',
    graphql: 'active',
    mode: 'hybrid'
  });
});
```

### Versioning Strategy

```typescript
// Option 1: Schema Directives
type User @deprecated(reason: "Use userById query instead") {
  id: ID!
  name: String!
}

type Query {
  user(id: ID!): User @deprecated(reason: "Use userById")
  userById(id: ID!): User
}

// Option 2: Versioned Schemas
// schema/v1/...
// schema/v2/...

const schemaV1 = buildSchema(v1TypeDefs);
const schemaV2 = buildSchema(v2TypeDefs);

app.use('/graphql/v1', createYoga({ schema: schemaV1 }));
app.use('/graphql/v2', createYoga({ schema: schemaV2 }));
```

### Feature Flags

```typescript
// Use feature flags for gradual rollout
const useGraphQL = process.env.FEATURE_GRAPHQL === 'true';

// In frontend
const searchResults = useGraphQL
  ? await graphqlClient.query({ query: SEARCH_QUERY })
  : await fetch('/api/v2/search/semantic').then(r => r.json());
```

---

## Öncelik Sıralaması (GraphQL'e Taşınacak Servisler)

### Tier 1: Yüksek Öncelik (İlk 4 Hafta)

1. **Semantic Search** ⭐⭐⭐⭐⭐
   - **Neden:** En çok kullanılan feature, over-fetching var
   - **Fayda:** %60 network reduction, better UX
   - **Complexity:** Düşük (mevcut servis çalışıyor)

2. **Chat Service** ⭐⭐⭐⭐⭐
   - **Neden:** Real-time streaming için ideal
   - **Fayda:** WebSocket yerine native subscriptions
   - **Complexity:** Orta (streaming implementation)

3. **Documents** ⭐⭐⭐⭐
   - **Neden:** File upload, CRUD operations
   - **Fayda:** Better error handling, progress tracking
   - **Complexity:** Orta (file uploads)

### Tier 2: Orta Öncelik (5-6. Hafta)

4. **Scraper Service** ⭐⭐⭐⭐
   - **Neden:** Real-time progress tracking
   - **Fayda:** Subscriptions for progress
   - **Complexity:** Orta

5. **Embeddings** ⭐⭐⭐
   - **Neden:** Background processing visibility
   - **Fayda:** Progress subscriptions
   - **Complexity:** Düşük

6. **Settings** ⭐⭐⭐
   - **Neden:** Multiple endpoints, atomic updates
   - **Fayda:** Single mutation for settings
   - **Complexity:** Düşük

### Tier 3: Düşük Öncelik (REST'te Kalabilir)

7. **Activity Logs** ⭐⭐
   - **Neden:** Read-only, simple queries
   - **Fayda:** Minimal
   - **Complexity:** Çok düşük

8. **Admin Panel** ⭐⭐
   - **Neden:** Low traffic, internal use
   - **Fayda:** Nice to have
   - **Complexity:** Düşük

9. **Health Checks** ⭐
   - **Neden:** Simple GET requests
   - **Fayda:** Minimal
   - **Complexity:** Çok düşük

---

## Performance Benchmarks

### Expected Improvements

| Metric | REST API | GraphQL | İyileştirme |
|--------|----------|---------|-------------|
| Network Requests (Chat Page) | 8-12 | 2-3 | %70 azalma |
| Data Transfer (KB) | 450 | 180 | %60 azalma |
| Time to Interactive | 2.4s | 1.2s | %50 iyileştirme |
| Bundle Size | - | +200KB | Minimal artış |
| Server CPU | Baseline | +10% | Kabul edilebilir |
| Response Time (p95) | 450ms | 380ms | %15 iyileştirme |

### Test Scenario: Chat Page Load

**REST API (Current):**
```javascript
// 8 separate requests
1. GET /api/v2/chat/conversations
2. GET /api/v2/chat/suggestions
3. GET /api/v2/settings/config/prompts
4. GET /api/v2/ai/settings
5. GET /api/v2/chat/stats
6. GET /api/v2/search/stats
7. GET /api/v2/user/profile
8. GET /api/v2/user/subscription
```

**GraphQL (New):**
```graphql
# Single request
query ChatPageData {
  conversations(userId: $userId) {
    id
    title
    lastMessageAt
  }
  chatSuggestions
  settings {
    prompts { name prompt }
    ai { activeChatModel temperature }
  }
  chatStats {
    totalConversations
    totalMessages
  }
  currentUser {
    profile { name email }
    subscription { plan usageLimit }
  }
}
```

**Results:**
- Requests: 8 → 1 (%87.5 azalma)
- Total bytes: 45KB → 18KB (%60 azalma)
- Load time: 2.4s → 1.2s (%50 iyileştirme)

---

## Risk Değerlendirmesi ve Azaltma

### 1. Sistem Kararlılığı Riski

**Risk:** GraphQL entegrasyonu sırasında mevcut REST API'ler bozulabilir

**Seviye:** 🔴 Yüksek

**Azaltma Stratejileri:**
- ✅ REST API'leri hiç dokunmadan GraphQL ekle
- ✅ Ayrı endpoint (/graphql vs /api/v2/*)
- ✅ Feature flags ile kontrollü rollout
- ✅ Canary deployment (ilk %10 trafik)
- ✅ Comprehensive integration tests
- ✅ Rollback planı hazır

**Monitoring:**
```typescript
// Alert if error rate increases
if (errorRate > baseline * 1.5) {
  alert('GraphQL migration causing errors');
  rollback();
}
```

### 2. Performance Degradation

**Risk:** GraphQL overhead REST'ten daha yavaş olabilir

**Seviye:** 🟡 Orta

**Azaltma Stratejileri:**
- ✅ DataLoader ile N+1 problem çözümü
- ✅ Response caching (Redis)
- ✅ Query complexity limiting
- ✅ Depth limiting
- ✅ APQ (Automatic Persisted Queries)
- ✅ Load testing before production

**Benchmarks:**
```bash
# Before migration
k6 run rest-api-test.js

# After migration
k6 run graphql-test.js

# Compare results
./scripts/compare-benchmarks.sh
```

### 3. Learning Curve

**Risk:** Ekip GraphQL konusunda deneyimsiz olabilir

**Seviye:** 🟡 Orta

**Azaltma Stratejileri:**
- ✅ 2 günlük GraphQL workshop
- ✅ Pair programming sessions
- ✅ Comprehensive documentation
- ✅ Code review checklist
- ✅ GraphQL best practices guide

**Eğitim Planı:**
```
Day 1: GraphQL Fundamentals
- Schema design
- Queries vs Mutations
- Resolvers

Day 2: Advanced Topics
- Subscriptions
- DataLoader
- Performance optimization
- Testing strategies
```

### 4. Query Complexity Attacks

**Risk:** Malicious complex queries can DoS the server

**Seviye:** 🟡 Orta

**Azaltma Stratejileri:**
- ✅ Query depth limiting (max 10)
- ✅ Query complexity analysis
- ✅ Rate limiting per user
- ✅ Timeout per query (30s max)
- ✅ Cost-based throttling

**Implementation:**
```typescript
const yoga = createYoga({
  plugins: [
    useDepthLimit({ maxDepth: 10 }),
    useQueryComplexity({
      maximumComplexity: 1000,
      estimators: [simpleEstimator({ defaultComplexity: 1 })]
    }),
    useRateLimiting({
      max: 100, // 100 requests
      window: '1m', // per minute
      identifyFn: (context) => context.user?.id || context.request.ip
    })
  ]
});
```

### 5. Schema Breaking Changes

**Risk:** Schema değişiklikleri frontend'i bozabilir

**Seviye:** 🟢 Düşük

**Azaltma Stratejileri:**
- ✅ Schema versioning
- ✅ @deprecated directive usage
- ✅ Schema registry (Apollo Studio/GraphQL Inspector)
- ✅ CI/CD schema validation
- ✅ Backwards compatibility checks

**CI/CD Pipeline:**
```yaml
# .github/workflows/graphql-check.yml
name: GraphQL Schema Check

on: [pull_request]

jobs:
  schema-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check for breaking changes
        run: |
          npx graphql-inspector diff \
            schema-main.graphql \
            schema-pr.graphql
      - name: Fail on breaking changes
        run: exit 1
        if: contains(steps.diff.output, 'BREAKING')
```

---

## Kaynak Gereksinimleri

### İnsan Kaynakları

**Gerekli Ekip:**

1. **Senior Backend Developer** (Full-time, 8 hafta)
   - GraphQL schema design
   - Resolver implementation
   - Performance optimization
   - **Maliyet:** ~$12,000 (freelance) veya internal

2. **Frontend Developer** (Part-time, 4 hafta)
   - GraphQL client integration
   - Apollo Client / urql setup
   - UI component updates
   - **Maliyet:** ~$4,000

3. **DevOps Engineer** (Part-time, 2 hafta)
   - Deployment pipeline
   - Monitoring setup
   - Load testing
   - **Maliyet:** ~$2,000

**Toplam İnsan Gücü Maliyeti:** ~$18,000 (veya internal team allocation)

### Teknik Kaynaklar

**Gerekli Tooling:**

1. **GraphQL Yoga** (Free, Open Source)
2. **GraphQL Code Generator** (Free)
3. **DataLoader** (Free)
4. **GraphQL Inspector** (Free)
5. **Apollo Studio** (Optional, $0-$500/month)
   - Schema registry
   - Performance monitoring
   - Query analytics

**Infrastructure:**

1. **Redis** (Mevcut - PubSub için kullanılacak)
2. **PostgreSQL** (Mevcut - değişiklik yok)
3. **Server Resources:**
   - CPU: +10% expected overhead
   - Memory: +200MB for GraphQL layer
   - Network: -40% (less requests, smaller payloads)

**Toplam Teknik Maliyet:** $0-$500/month (Apollo Studio opsiyonel)

### Zaman Tahminleri

| Faz | Süre | Paralel İş? | Kümülatif |
|-----|------|-------------|-----------|
| Faz 1: Setup | 2 hafta | Hayır | 2 hafta |
| Faz 2: Core Services | 3 hafta | Kısmi | 5 hafta |
| Faz 3: Real-time | 2 hafta | Evet | 6 hafta |
| Faz 4: Optimization | 1 hafta | Hayır | 7 hafta |
| Buffer | 1 hafta | - | 8 hafta |

**Toplam Süre:** 8 hafta (2 aylık timeline)

---

## Success Metrics

### Phase 1 Success Criteria

- ✅ GraphQL endpoint live ve stable
- ✅ GraphiQL documentation accessible
- ✅ Health check query working
- ✅ Integration tests passing
- ✅ Zero impact on existing REST API

### Phase 2 Success Criteria

- ✅ Search, Chat, Documents migrated
- ✅ Feature parity with REST API
- ✅ Performance equal or better than REST
- ✅ < 1% error rate
- ✅ All integration tests passing

### Phase 3 Success Criteria

- ✅ Real-time subscriptions working
- ✅ Chat streaming functional
- ✅ Scraping progress updates live
- ✅ Embedding progress visible
- ✅ WebSocket connections stable

### Phase 4 Success Criteria

- ✅ Load tests passing (100+ RPS)
- ✅ Response time p95 < 500ms
- ✅ Query complexity limiting active
- ✅ Monitoring dashboards live
- ✅ Production deployment successful

### Overall Success Metrics (3 Months Post-Launch)

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Response Time | -15% | APM monitoring |
| Network Requests | -60% | Browser DevTools |
| Data Transfer | -50% | Network analytics |
| Developer Satisfaction | 8/10+ | Team survey |
| Frontend Load Time | -30% | Lighthouse CI |
| Server CPU Usage | < +15% | Prometheus |
| Error Rate | < 0.5% | Sentry |
| API Adoption | 50%+ | Usage analytics |

---

## Rollback Planı

### Immediate Rollback (< 5 Minutes)

**Trigger:** Critical production issue

**Steps:**
```bash
# 1. Feature flag disable
curl -X POST https://admin.alice-bridge.com/api/feature-flags \
  -d '{"GRAPHQL_ENABLED": false}'

# 2. NGINX config rollback
sudo cp /etc/nginx/sites-available/alice-bridge.backup \
     /etc/nginx/sites-available/alice-bridge
sudo nginx -s reload

# 3. Application restart (without GraphQL)
pm2 restart luwi-semantic-bridge --update-env GRAPHQL_ENABLED=false
```

**Expected Downtime:** < 30 seconds

### Gradual Rollback (Canary Reversal)

**Trigger:** Elevated error rate or performance degradation

**Steps:**
```typescript
// Reduce traffic gradually
// 50% -> 25% -> 10% -> 0%

const trafficPercentage = 50;

app.use('/api/*', (req, res, next) => {
  const useGraphQL = Math.random() * 100 < trafficPercentage;

  if (useGraphQL && isGraphQLEligible(req)) {
    return graphqlProxy(req, res);
  }

  next(); // Use REST API
});
```

### Data Rollback

**Issue:** GraphQL caused data inconsistency

**Steps:**
1. Stop GraphQL traffic
2. Analyze affected data
3. Restore from database backup
4. Replay missed transactions from logs
5. Validate data integrity

**Tools:**
```bash
# PostgreSQL point-in-time recovery
pg_restore --dbname=lsemb \
  --clean --if-exists \
  --before="2025-10-22 14:30:00" \
  backup.dump
```

---

## Appendix

### A. GraphQL vs REST Comparison

| Aspect | REST | GraphQL |
|--------|------|---------|
| **Requests** | Multiple (N endpoints) | Single (1 endpoint) |
| **Over-fetching** | Common | Eliminated |
| **Under-fetching** | Common | Eliminated |
| **Versioning** | URL-based (/v1, /v2) | Schema evolution |
| **Documentation** | OpenAPI/Swagger | Introspection |
| **Type Safety** | Optional | Built-in |
| **Real-time** | WebSockets | Subscriptions |
| **Caching** | HTTP caching | Custom (Apollo) |
| **Learning Curve** | Low | Medium |
| **Tooling** | Mature | Rapidly improving |

### B. Recommended Dependencies

```json
{
  "dependencies": {
    "graphql": "^16.8.0",
    "graphql-yoga": "^5.0.0",
    "@graphql-tools/schema": "^10.0.0",
    "dataloader": "^2.2.0",
    "graphql-redis-subscriptions": "^2.6.0",
    "graphql-upload": "^16.0.0"
  },
  "devDependencies": {
    "@graphql-codegen/cli": "^5.0.0",
    "@graphql-codegen/typescript": "^4.0.0",
    "@graphql-codegen/typescript-resolvers": "^4.0.0",
    "graphql-inspector": "^4.0.0",
    "@types/dataloader": "^2.0.0"
  }
}
```

### C. Sample Frontend Integration

**Apollo Client Setup:**
```typescript
// lib/apollo-client.ts
import { ApolloClient, InMemoryCache, split, HttpLink } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { createClient } from 'graphql-ws';

const httpLink = new HttpLink({
  uri: 'https://api.alice-bridge.com/graphql',
  credentials: 'include'
});

const wsLink = new GraphQLWsLink(createClient({
  url: 'wss://api.alice-bridge.com/graphql',
}));

const splitLink = split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink,
  httpLink,
);

export const apolloClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache()
});
```

**React Component:**
```typescript
// components/ChatPage.tsx
import { useQuery, useSubscription } from '@apollo/client';
import { CHAT_PAGE_DATA, MESSAGE_STREAM } from './queries';

export function ChatPage() {
  // Single query for all page data
  const { data, loading } = useQuery(CHAT_PAGE_DATA, {
    variables: { userId: currentUserId }
  });

  // Real-time message streaming
  const { data: streamData } = useSubscription(MESSAGE_STREAM, {
    variables: { input: { message: userMessage } }
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <ConversationList conversations={data.conversations} />
      <ChatInterface
        suggestions={data.chatSuggestions}
        settings={data.settings}
        stream={streamData?.messageStream}
      />
      <StatsPanel stats={data.chatStats} />
    </div>
  );
}
```

### D. Monitoring Dashboard Queries

**Prometheus Queries:**
```promql
# Request rate
rate(graphql_yoga_http_duration_count[5m])

# Error rate
rate(graphql_envelop_error_result_total[5m])

# Average response time
rate(graphql_envelop_request_duration_sum[5m]) /
rate(graphql_envelop_request_duration_count[5m])

# Query complexity distribution
histogram_quantile(0.95, graphql_query_complexity_bucket)

# Active subscriptions
graphql_yoga_active_subscriptions
```

**Grafana Dashboard:**
```json
{
  "dashboard": {
    "title": "GraphQL API Performance",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{ "expr": "rate(graphql_yoga_http_duration_count[5m])" }]
      },
      {
        "title": "Error Rate",
        "targets": [{ "expr": "rate(graphql_envelop_error_result_total[5m])" }]
      },
      {
        "title": "P95 Response Time",
        "targets": [{ "expr": "histogram_quantile(0.95, graphql_envelop_request_duration_bucket)" }]
      }
    ]
  }
}
```

---

## Karar ve Onay

### Tavsiye Edilen Yaklaşım

**CTO Recommendation:** GraphQL entegrasyonunu **EVET**, ama **fazlı ve kontrollü** şekilde ilerle.

**Öncelik Sırası:**
1. ✅ **İlk 4 Hafta:** Search + Chat (En yüksek ROI)
2. ⏳ **5-6. Hafta:** Documents + Scraper (Real-time benefits)
3. 🔄 **7-8. Hafta:** Optimization + Production hardening
4. ❓ **İleriye Dönük:** Diğer servisler (feature flag ile)

**Kritik Başarı Faktörleri:**
- Mevcut REST API'lere dokunma (backwards compatibility)
- Kapsamlı test coverage
- Monitoring ve alerting
- Rollback planı hazır
- Ekip eğitimi

### Gerekli Onaylar

- [ ] **CTO Onayı:** Teknik mimari ve timeline
- [ ] **Product Owner:** Feature prioritization
- [ ] **DevOps Lead:** Infrastructure ve deployment
- [ ] **Frontend Lead:** Client integration strategy
- [ ] **Security Team:** Authentication ve authorization review

### Next Steps

1. **Ekip Toplantısı** (1 saat)
   - Bu dokümanı gözden geçir
   - Soruları yanıtla
   - Timeline'ı onayla

2. **Pilot Başlat** (Faz 1)
   - GraphQL Yoga setup
   - Health check endpoint
   - İlk integration tests

3. **Weekly Sync** (Her Perşembe, 30 dk)
   - Progress review
   - Blocker'ları çöz
   - Next week planning

---

**Son Güncelleme:** 2025-10-22
**Hazırlayan:** Ben Opus (CTO)
**İletişim:** ben@alice-semantic-bridge.com
**Versiyon:** 1.0
