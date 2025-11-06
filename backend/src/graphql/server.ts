/**
 * GraphQL Server Configuration
 * GraphQL Yoga ile modern, performanslı GraphQL server
 */

import { createYoga } from 'graphql-yoga';
import { createServer } from 'node:http';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { mergeResolvers } from '@graphql-tools/merge';
import { Application } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GraphQLContext, createContext } from './context';
import * as resolvers from './resolvers';
import {
  rateLimitPlugin,
  loggingPlugin,
  complexityPlugin,
  authPlugin,
  dataloaderPlugin,
} from './plugins';

/**
 * GraphQL schema ve resolver'ları yükle
 */
export function loadSchema() {
  // Schema dosyalarını manual olarak yükle
  const schemaDir = join(__dirname, './schema');

  const baseSchema = readFileSync(join(schemaDir, 'base.schema.graphql'), 'utf-8');
  const searchSchema = readFileSync(join(schemaDir, 'search.schema.graphql'), 'utf-8');
  const chatSchema = readFileSync(join(schemaDir, 'chat.schema.graphql'), 'utf-8');
  const settingsSchema = readFileSync(join(schemaDir, 'settings.schema.graphql'), 'utf-8');
  const documentSchema = readFileSync(join(schemaDir, 'document.schema.graphql'), 'utf-8');
  const scraperSchema = readFileSync(join(schemaDir, 'scraper.schema.graphql'), 'utf-8');
  const dataPipelineSchema = readFileSync(join(schemaDir, 'data-pipeline.schema.graphql'), 'utf-8');
  const documentTransformSchema = readFileSync(join(schemaDir, 'document-transform.schema.graphql'), 'utf-8');

  // Tüm schema'ları birleştir
  const typeDefs = `
    ${baseSchema}
    ${searchSchema}
    ${chatSchema}
    ${settingsSchema}
    ${documentSchema}
    ${scraperSchema}
    ${dataPipelineSchema}
    ${documentTransformSchema}
  `;

  // Resolver'ları birleştir
  const mergedResolvers = mergeResolvers([
    resolvers.baseResolvers,
    resolvers.searchResolvers,
    resolvers.chatResolvers,
    resolvers.settingsResolvers,
    resolvers.documentResolvers,
    resolvers.scraperResolvers,
    resolvers.dataPipelineResolvers,
    resolvers.documentTransformResolvers,
  ]);

  // Executable schema oluştur
  return makeExecutableSchema({
    typeDefs,
    resolvers: mergedResolvers,
  });
}

/**
 * GraphQL Yoga server instance oluştur
 */
export function createGraphQLServer(app: Application) {
  const schema = loadSchema();

  const yoga = createYoga({
    schema,
    context: createContext,

    // GraphQL endpoint
    graphqlEndpoint: '/api/graphql',

    // GraphiQL playground
    graphiql: {
      title: 'Alice Semantic Bridge GraphQL',
      defaultQuery: `
        # Alice Semantic Bridge GraphQL API'ye hoş geldiniz!
        # Örnek sorgu:

        query HealthCheck {
          health {
            status
            timestamp
            services {
              database
              redis
              embeddings
            }
          }
        }
      `,
    },

    // CORS configuration - disable, let Express handle it
    cors: false, // Let Express CORS middleware handle CORS

    // Error masking in production
    maskedErrors: false, // Disable error masking for debugging

    // Logging
    logging: {
      debug: (...args) => console.log('[GraphQL Debug]', ...args),
      info: (...args) => console.log('[GraphQL Info]', ...args),
      warn: (...args) => console.warn('[GraphQL Warning]', ...args),
      error: (...args) => console.error('[GraphQL Error]', ...args),
    },

    // Format errors for better debugging
    formatError: (err) => {
      console.error('[GraphQL] Full Error Details:', {
        message: err.message,
        path: err.path,
        locations: err.locations,
        extensions: err.extensions,
        originalError: err.originalError,
        stack: err.originalError?.stack,
      });
      return err;
    },

    // Batching configuration
    batching: {
      limit: 10,
    },

    // Plugins - Minimal debugging without blocking
    plugins: [
      {
        onExecute({ args }) {
          console.log('[GraphQL Plugin] onExecute called');
          return {
            onExecuteDone({ result }) {
              console.log('[GraphQL Plugin] Execution done');
              if (result && 'errors' in result) {
                console.error('[GraphQL Plugin] Execution errors:', result.errors);
              }
            },
          };
        },
      },
      // // Rate limiting
      // rateLimitPlugin({
      //   max: 100,
      //   window: '1m',
      // }),

      // // Request logging
      // loggingPlugin(),

      // // Query complexity limiting
      // complexityPlugin({
      //   maxComplexity: 1000,
      // }),

      // // Authentication & Authorization
      // authPlugin(),

      // // DataLoader for N+1 prevention
      // dataloaderPlugin(),
    ],

    // Health check endpoint
    healthCheckEndpoint: '/api/graphql/health',

    // Landing page configuration
    landingPage: process.env.NODE_ENV === 'production' ? false : true,
  });

  // Express'e GraphQL endpoint'i ekle
  app.use('/api/graphql', yoga);

  // Subscription'lar için WebSocket server (opsiyonel)
  if (process.env.ENABLE_SUBSCRIPTIONS === 'true') {
    const httpServer = createServer(app);

    yoga.getEnveloped({
      contextFactory: () => ({}),
    });

    return httpServer;
  }

  return app;
}

/**
 * GraphQL server'ı başlat
 */
export function startGraphQLServer(app: Application, port: number = 4000) {
  const server = createGraphQLServer(app);

  if (typeof server.listen === 'function') {
    server.listen(port, () => {
      console.log(`🚀 GraphQL Server hazır: http://localhost:${port}/graphql`);
      console.log(`📊 GraphiQL Playground: http://localhost:${port}/graphql`);
      console.log(`❤️ Health Check: http://localhost:${port}/graphql/health`);
    });
  }

  return server;
}

export default {
  createGraphQLServer,
  startGraphQLServer,
  loadSchema,
};