/**
 * GraphQL Server Configuration
 * GraphQL Yoga ile modern, performanslı GraphQL server
 */

import { createYoga } from 'graphql-yoga';
import { createServer } from 'node:http';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { loadFilesSync } from '@graphql-tools/load-files';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { Application } from 'express';
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
  // Tüm .graphql dosyalarını yükle
  const typesArray = loadFilesSync(join(__dirname, './schema'), {
    extensions: ['graphql'],
  });

  // Type definition'ları birleştir
  const typeDefs = mergeTypeDefs(typesArray);

  // Resolver'ları birleştir
  const mergedResolvers = mergeResolvers([
    resolvers.baseResolvers,
    resolvers.searchResolvers,
    resolvers.chatResolvers,
    resolvers.settingsResolvers,
    resolvers.documentResolvers,
    resolvers.scraperResolvers,
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
    graphqlEndpoint: '/graphql',

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

    // CORS configuration
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3001',
      credentials: true,
    },

    // Error masking in production
    maskedErrors: process.env.NODE_ENV === 'production',

    // Batching configuration
    batching: {
      limit: 10,
    },

    // Plugins
    plugins: [
      // Rate limiting
      rateLimitPlugin({
        max: 100,
        window: '1m',
      }),

      // Request logging
      loggingPlugin(),

      // Query complexity limiting
      complexityPlugin({
        maxComplexity: 1000,
      }),

      // Authentication & Authorization
      authPlugin(),

      // DataLoader for N+1 prevention
      dataloaderPlugin(),
    ],

    // Health check endpoint
    healthCheckEndpoint: '/graphql/health',

    // Landing page configuration
    landingPage: process.env.NODE_ENV === 'production' ? false : true,
  });

  // Express'e GraphQL endpoint'i ekle
  app.use('/graphql', yoga);

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