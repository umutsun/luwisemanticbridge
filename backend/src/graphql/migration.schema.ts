/**
 * GraphQL Schema for Migration Monitoring
 * Provides real-time migration tracking and analytics
 */

import { gql } from 'graphql-tag';

export const migrationTypeDefs = gql`
  # Migration status enum
  enum MigrationStatus {
    PENDING
    PROCESSING
    COMPLETED
    FAILED
    STOPPED
    PAUSED
  }

  # Migration method enum
  enum MigrationMethod {
    STANDARD
    PARALLEL
    PGAI
    AUTO
  }

  # Migration statistics
  type MigrationStats {
    totalRows: Int!
    processedRows: Int!
    skippedRows: Int!
    errors: Int!
    tokensUsed: Int!
    estimatedCost: Float!
    startTime: String!
    endTime: String
    averageSpeed: Float
    progress: Float!
  }

  # Migration job
  type Migration {
    id: String!
    tableName: String!
    columns: [String!]!
    method: MigrationMethod!
    status: MigrationStatus!
    stats: MigrationStats!
    createdAt: String!
    updatedAt: String!
    remainingTime: String
  }

  # System capabilities
  type SystemCapabilities {
    pgai: PgAIStatus!
    pgvectorscale: PgVectorScaleStatus!
    parallelProcessing: ParallelStatus!
    models: [String!]!
    performance: PerformanceMetrics!
    recommendations: [String!]!
  }

  type PgAIStatus {
    installed: Boolean!
    configured: Boolean!
    vectorizers: [String!]!
    benefits: [String!]!
  }

  type PgVectorScaleStatus {
    installed: Boolean!
    benefits: [String!]!
  }

  type ParallelStatus {
    available: Boolean!
    maxWorkers: Int!
    benefits: [String!]!
  }

  type PerformanceMetrics {
    standardSpeed: String!
    parallelSpeed: String!
    pgaiSpeed: String!
    withPgVectorScale: String!
  }

  # Migration summary
  type MigrationSummary {
    totalActive: Int!
    totalCompleted: Int!
    totalFailed: Int!
    totalRowsProcessed: Int!
    totalTokensUsed: Int!
    totalCost: Float!
  }

  # Query type
  type Query {
    # Get system capabilities
    migrationCapabilities: SystemCapabilities!

    # Get specific migration
    migration(id: String!): Migration

    # Get all migrations
    migrations(
      status: MigrationStatus
      limit: Int = 20
      offset: Int = 0
    ): [Migration!]!

    # Get migration summary
    migrationSummary: MigrationSummary!

    # Get migration history
    migrationHistory(
      tableName: String
      limit: Int = 50
    ): [Migration!]!
  }

  # Mutation type
  type Mutation {
    # Start a new migration
    startMigration(
      tableName: String!
      columns: [String!]!
      method: MigrationMethod = AUTO
      batchSize: Int = 100
      embeddingModel: String = "text-embedding-3-large"
    ): Migration!

    # Stop a migration
    stopMigration(id: String!): Migration!

    # Pause a migration
    pauseMigration(id: String!): Migration!

    # Resume a migration
    resumeMigration(id: String!): Migration!

    # Optimize embeddings with pgvectorscale
    optimizeEmbeddings(
      tableName: String = "unified_embeddings"
    ): OptimizationResult!

    # Configure pgai
    configurePgAI(
      apiKey: String!
      model: String = "text-embedding-3-large"
    ): Boolean!
  }

  type OptimizationResult {
    status: String!
    tableName: String!
    message: String!
    indexes: [IndexInfo!]!
    benefits: [String!]!
  }

  type IndexInfo {
    schemaname: String!
    tablename: String!
    indexname: String!
    size: String!
  }

  # Subscription type for real-time updates
  type Subscription {
    # Subscribe to migration progress
    migrationProgress(id: String!): MigrationProgressUpdate!

    # Subscribe to all migration updates
    allMigrationUpdates: MigrationProgressUpdate!
  }

  type MigrationProgressUpdate {
    id: String!
    status: MigrationStatus!
    progress: Float!
    processedRows: Int!
    totalRows: Int!
    errors: Int!
    message: String
    timestamp: String!
  }
`;

export const migrationResolvers = {
  Query: {
    migrationCapabilities: async (_: any, __: any, context: any) => {
      const response = await fetch('http://localhost:8083/api/v2/migration/capabilities');
      return response.json();
    },

    migration: async (_: any, { id }: { id: string }, context: any) => {
      const response = await fetch(`http://localhost:8083/api/v2/migration/progress/${id}`);
      if (!response.ok) return null;
      return response.json();
    },

    migrations: async (_: any, { status, limit, offset }: any, context: any) => {
      const response = await fetch('http://localhost:8083/api/v2/migration/status');
      const data = await response.json();

      let migrations = [...data.active, ...data.history];

      if (status) {
        migrations = migrations.filter(m => m.status === status.toLowerCase());
      }

      return migrations.slice(offset, offset + limit);
    },

    migrationSummary: async (_: any, __: any, context: any) => {
      const response = await fetch('http://localhost:8083/api/v2/migration/status');
      const data = await response.json();

      return data.summary;
    },

    migrationHistory: async (_: any, { tableName, limit }: any, context: any) => {
      const response = await fetch('http://localhost:8083/api/v2/migration/status');
      const data = await response.json();

      let history = data.history;

      if (tableName) {
        history = history.filter((m: any) => m.source_table === tableName);
      }

      return history.slice(0, limit);
    }
  },

  Mutation: {
    startMigration: async (_: any, args: any, context: any) => {
      const response = await fetch('http://localhost:8083/api/v2/migration/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableName: args.tableName,
          columns: args.columns,
          method: args.method.toLowerCase(),
          options: {
            batchSize: args.batchSize,
            embeddingModel: args.embeddingModel
          }
        })
      });

      return response.json();
    },

    stopMigration: async (_: any, { id }: { id: string }, context: any) => {
      const response = await fetch(`http://localhost:8083/api/v2/migration/stop/${id}`, {
        method: 'POST'
      });

      return response.json();
    },

    pauseMigration: async (_: any, { id }: { id: string }, context: any) => {
      // To be implemented
      return {
        id,
        status: 'PAUSED',
        message: 'Migration paused'
      };
    },

    resumeMigration: async (_: any, { id }: { id: string }, context: any) => {
      // To be implemented
      return {
        id,
        status: 'PROCESSING',
        message: 'Migration resumed'
      };
    },

    optimizeEmbeddings: async (_: any, { tableName }: any, context: any) => {
      const response = await fetch('http://localhost:8083/api/v2/migration/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName })
      });

      return response.json();
    },

    configurePgAI: async (_: any, { apiKey, model }: any, context: any) => {
      // To be implemented with pgai configuration
      return true;
    }
  },

  Subscription: {
    migrationProgress: {
      subscribe: (_: any, { id }: { id: string }, context: any) => {
        // WebSocket subscription for real-time updates
        // This would be implemented with GraphQL subscriptions
        return {
          id,
          status: 'PROCESSING',
          progress: 0,
          processedRows: 0,
          totalRows: 0,
          errors: 0,
          message: 'Starting...',
          timestamp: new Date().toISOString()
        };
      }
    },

    allMigrationUpdates: {
      subscribe: (_: any, __: any, context: any) => {
        // WebSocket subscription for all migrations
        return {
          id: 'all',
          status: 'PROCESSING',
          progress: 0,
          processedRows: 0,
          totalRows: 0,
          errors: 0,
          message: 'Monitoring all migrations...',
          timestamp: new Date().toISOString()
        };
      }
    }
  }
};