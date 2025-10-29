/**
 * Optimized Semantic Search Resolvers
 * Performance-first implementation with caching and batching
 */

import { GraphQLContext } from '../context';
import { requireAuth } from '../context';
import { GraphQLError } from 'graphql';
import OptimizedSemanticSearchService from '../../services/semantic-search-optimized.service';
import { PubSub } from 'graphql-subscriptions';

const pubsub = new PubSub();

export const searchOptimizedResolvers = {
  Query: {
    /**
     * Optimized semantic search with caching
     */
    optimizedSemanticSearch: async (
      _: any,
      { input }: { input: any },
      context: GraphQLContext
    ) => {
      const startTime = Date.now();

      try {
        // Validate input
        if (!input.query || input.query.trim().length < 2) {
          throw new GraphQLError('Query must be at least 2 characters', {
            extensions: { code: 'INVALID_INPUT' },
          });
        }

        // Initialize optimized service
        const service = new OptimizedSemanticSearchService(
          context.pool,
          context.redis
        );

        // Execute search
        const result = await service.search({
          query: input.query,
          limit: input.limit || 10,
          threshold: input.threshold || 0.7,
          filters: input.filters,
          includeMetadata: input.includeMetadata,
          includeEmbeddings: input.includeEmbeddings,
          searchType: input.searchType || 'HYBRID',
          sortBy: input.sortBy || 'RELEVANCE',
          enableCache: input.enableCache !== false,
          forceRefresh: input.forceRefresh || false,
        });

        // Log performance
        console.log(
          `[Search] Query: "${input.query.substring(0, 50)}" | ` +
          `Time: ${result.queryTime}ms | ` +
          `Cache: ${result.cacheHit ? 'HIT' : 'MISS'} | ` +
          `Results: ${result.total}`
        );

        return result;
      } catch (error) {
        console.error('[Search] Error:', error);
        throw new GraphQLError('Search failed', {
          extensions: {
            code: 'SEARCH_ERROR',
            detail: (error as Error).message,
          },
        });
      }
    },

    /**
     * Batch semantic search
     */
    batchSemanticSearch: async (
      _: any,
      { inputs }: { inputs: any[] },
      context: GraphQLContext
    ) => {
      try {
        if (!inputs || inputs.length === 0) {
          throw new GraphQLError('At least one search input required', {
            extensions: { code: 'INVALID_INPUT' },
          });
        }

        if (inputs.length > 100) {
          throw new GraphQLError('Maximum 100 searches per batch', {
            extensions: { code: 'BATCH_TOO_LARGE' },
          });
        }

        const service = new OptimizedSemanticSearchService(
          context.pool,
          context.redis
        );

        const results = await service.batchSearch(
          inputs.map(input => ({
            query: input.query,
            limit: input.limit || 10,
            threshold: input.threshold || 0.7,
            filters: input.filters,
            includeMetadata: input.includeMetadata,
            includeEmbeddings: input.includeEmbeddings,
            searchType: input.searchType || 'HYBRID',
            sortBy: input.sortBy || 'RELEVANCE',
            enableCache: input.enableCache !== false,
            forceRefresh: input.forceRefresh || false,
          }))
        );

        console.log(
          `[Search] Batch: ${inputs.length} queries | ` +
          `Cache hits: ${results.filter(r => r.cacheHit).length}`
        );

        return results;
      } catch (error) {
        console.error('[Search] Batch error:', error);
        throw new GraphQLError('Batch search failed', {
          extensions: { code: 'BATCH_ERROR' },
        });
      }
    },

    /**
     * Get cached search result
     */
    getCachedSearch: async (
      _: any,
      { cacheKey }: { cacheKey: string },
      context: GraphQLContext
    ) => {
      try {
        const cached = await context.redis.get(`search:result:${cacheKey}`);
        return cached ? JSON.parse(cached) : null;
      } catch (error) {
        console.error('[Cache] Get error:', error);
        return null;
      }
    },

    /**
     * Get popular searches
     */
    popularSearches: async (
      _: any,
      { limit = 10, timeframe = '24h' }: { limit?: number; timeframe?: string },
      context: GraphQLContext
    ) => {
      try {
        const service = new OptimizedSemanticSearchService(
          context.pool,
          context.redis
        );

        return await service.getPopularSearches(limit, timeframe);
      } catch (error) {
        console.error('[Popular] Error:', error);
        return [];
      }
    },

    /**
     * Get search analytics
     */
    searchAnalytics: async (
      _: any,
      { timeRange }: { timeRange?: any },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const date = new Date().toISOString().split('T')[0];

        // Get basic stats
        const stats = await context.redis.hgetall(`search:stats:${date}`);
        const totalSearches = parseInt(stats.total || '0');

        // Get cache stats
        const service = new OptimizedSemanticSearchService(
          context.pool,
          context.redis
        );
        const cacheStats = await service.getCacheStats();

        // Get response times
        const times = await context.redis.lrange(`search:times:${date}`, 0, -1);
        const responseTimes = times.map(t => parseFloat(t)).sort((a, b) => a - b);

        const avgResponseTime =
          responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : 0;

        // Calculate percentiles
        const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
        const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
        const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

        // Get top queries
        const topQueries = await service.getPopularSearches(10, '24h');

        return {
          totalSearches,
          uniqueQueries: topQueries.length,
          avgResponseTime,
          cacheHitRate: cacheStats.hitRate * 100,
          topQueries,
          searchesByHour: [], // TODO: implement hourly stats
          performanceDistribution: {
            p50,
            p95,
            p99,
            min: responseTimes[0] || 0,
            max: responseTimes[responseTimes.length - 1] || 0,
          },
        };
      } catch (error) {
        console.error('[Analytics] Error:', error);
        throw new GraphQLError('Failed to get analytics', {
          extensions: { code: 'ANALYTICS_ERROR' },
        });
      }
    },

    /**
     * Check cache status
     */
    searchCacheStatus: async (
      _: any,
      { query, filters }: { query: string; filters?: any },
      context: GraphQLContext
    ) => {
      try {
        const service = new OptimizedSemanticSearchService(
          context.pool,
          context.redis
        );

        const cacheKey = (service as any).generateCacheKey({
          query,
          filters,
          limit: 10,
          threshold: 0.7,
          searchType: 'HYBRID',
          sortBy: 'RELEVANCE',
        });

        const cached = await context.redis.get(`search:result:${cacheKey}`);
        const ttl = cached ? await context.redis.ttl(`search:result:${cacheKey}`) : 0;

        return {
          cached: !!cached,
          cacheKey: cached ? cacheKey : null,
          expiresAt: cached && ttl > 0 ? new Date(Date.now() + ttl * 1000) : null,
          hitCount: 0, // TODO: track per-query hits
          age: cached && ttl > 0 ? 600 - ttl : null,
        };
      } catch (error) {
        console.error('[CacheStatus] Error:', error);
        return {
          cached: false,
          cacheKey: null,
          expiresAt: null,
          hitCount: 0,
          age: null,
        };
      }
    },

    /**
     * Get cache statistics
     */
    cacheStatistics: async (_: any, __: any, context: GraphQLContext) => {
      requireAuth(context);

      try {
        const service = new OptimizedSemanticSearchService(
          context.pool,
          context.redis
        );

        const stats = await service.getCacheStats();

        return {
          hits: stats.hits,
          misses: stats.misses,
          hitRate: stats.hitRate * 100,
          totalKeys: stats.size,
          memoryUsage: null, // TODO: get from Redis INFO
          oldestEntry: null,
          newestEntry: null,
        };
      } catch (error) {
        console.error('[CacheStats] Error:', error);
        throw new GraphQLError('Failed to get cache statistics');
      }
    },
  },

  Mutation: {
    /**
     * Prewarm search cache
     */
    prewarmSearchCache: async (
      _: any,
      { queries }: { queries: string[] },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const startTime = Date.now();

      try {
        const service = new OptimizedSemanticSearchService(
          context.pool,
          context.redis
        );

        await service.prewarmCache(queries);

        return {
          queriesProcessed: queries.length,
          successful: queries.length,
          failed: 0,
          totalTime: Date.now() - startTime,
        };
      } catch (error) {
        console.error('[Prewarm] Error:', error);
        throw new GraphQLError('Failed to prewarm cache');
      }
    },

    /**
     * Clear search cache
     */
    clearSearchCache: async (
      _: any,
      { pattern }: { pattern?: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const service = new OptimizedSemanticSearchService(
          context.pool,
          context.redis
        );

        const keysCleared = await service.clearCache(pattern);

        // Publish cache update
        pubsub.publish('CACHE_UPDATES', {
          cacheUpdates: {
            action: 'CLEARED',
            cacheKey: pattern || '*',
            query: null,
            timestamp: new Date(),
          },
        });

        return {
          keysCleared,
          pattern: pattern || '*',
          success: true,
        };
      } catch (error) {
        console.error('[ClearCache] Error:', error);
        throw new GraphQLError('Failed to clear cache');
      }
    },

    /**
     * Save search history
     */
    saveSearchHistory: async (
      _: any,
      { input }: { input: any },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `INSERT INTO search_history (
            user_id, query, filters, results_count, response_time, clicked_results, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          RETURNING *`,
          [
            context.user?.id,
            input.query,
            JSON.stringify(input.filters || {}),
            input.resultsCount,
            input.responseTime,
            input.clickedResults || [],
          ]
        );

        return {
          id: result.rows[0].id,
          userId: result.rows[0].user_id,
          query: result.rows[0].query,
          filters: result.rows[0].filters,
          resultsCount: result.rows[0].results_count,
          responseTime: result.rows[0].response_time,
          clickedResults: result.rows[0].clicked_results,
          timestamp: result.rows[0].created_at,
        };
      } catch (error) {
        console.error('[SaveHistory] Error:', error);
        throw new GraphQLError('Failed to save search history');
      }
    },

    /**
     * Provide relevance feedback
     */
    provideRelevanceFeedback: async (
      _: any,
      { input }: { input: any },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        await context.pool.query(
          `INSERT INTO relevance_feedback (
            user_id, search_id, result_id, rating, clicked, feedback, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            context.user?.id,
            input.searchId,
            input.resultId,
            input.rating,
            input.clicked,
            input.feedback,
          ]
        );

        return true;
      } catch (error) {
        console.error('[Feedback] Error:', error);
        return false;
      }
    },
  },

  Subscription: {
    /**
     * Cache updates subscription
     */
    cacheUpdates: {
      subscribe: () => pubsub.asyncIterator(['CACHE_UPDATES']),
    },

    /**
     * Popular searches updates
     */
    popularSearchesUpdates: {
      subscribe: () => pubsub.asyncIterator(['POPULAR_SEARCHES_UPDATES']),
    },

    /**
     * Analytics updates
     */
    analyticsUpdates: {
      subscribe: () => pubsub.asyncIterator(['ANALYTICS_UPDATES']),
    },
  },
};

export default searchOptimizedResolvers;
