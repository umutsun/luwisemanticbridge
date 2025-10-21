/**
 * Semantic Search Resolvers
 * Semantik arama GraphQL resolver'ları
 */

import { GraphQLContext } from '../context';
import { GraphQLError } from 'graphql';

export const searchResolvers = {
  Query: {
    /**
     * Semantik arama yap
     */
    async semanticSearch(
      _parent: unknown,
      args: {
        input: {
          query: string;
          limit?: number;
          threshold?: number;
          filters?: any;
          includeMetadata?: boolean;
          includeEmbeddings?: boolean;
          searchType?: string;
        };
      },
      context: GraphQLContext
    ) {
      const startTime = Date.now();
      const { search } = context.services;

      try {
        // Input validasyonu
        if (!args.input.query || args.input.query.trim().length < 2) {
          throw new GraphQLError('Arama sorgusu en az 2 karakter olmalıdır', {
            extensions: { code: 'INVALID_INPUT' },
          });
        }

        // Semantic search servisini çağır
        const results = await search.search({
          query: args.input.query,
          limit: args.input.limit || 10,
          threshold: args.input.threshold || 0.7,
          filters: args.input.filters,
          searchType: args.input.searchType || 'HYBRID',
        });

        // Query vector'ü al (caching için)
        const queryVector = await context.dataloaders.embeddingLoader.load(
          args.input.query
        );

        // İlişkili sorguları bul
        const relatedQueries = await search.findRelatedQueries(
          args.input.query,
          5
        );

        // Önerileri oluştur
        const suggestions = await search.generateSuggestions(
          args.input.query,
          results
        );

        // Response'u dön
        return {
          results: results.map((result) => ({
            id: result.id,
            content: result.content,
            title: result.title || null,
            score: result.score,
            source: result.source,
            documentId: result.documentId || null,
            metadata: args.input.includeMetadata ? result.metadata : null,
            embedding: args.input.includeEmbeddings
              ? {
                  id: result.embeddingId,
                  vector: result.embedding,
                  model: 'text-embedding-ada-002',
                  dimensions: 1536,
                  createdAt: result.createdAt,
                }
              : null,
            highlights: result.highlights || [],
            timestamp: result.createdAt,
            relevanceFeedback: null, // TODO: implement feedback
          })),
          total: results.length,
          queryTime: Date.now() - startTime,
          queryVector: args.input.includeEmbeddings ? queryVector : null,
          suggestions,
          relatedQueries,
        };
      } catch (error) {
        console.error('Semantic search error:', error);
        throw new GraphQLError('Arama sırasında bir hata oluştu', {
          extensions: {
            code: 'SEARCH_ERROR',
            detail: error.message,
          },
        });
      }
    },

    /**
     * Belge ID'si ile tek sonuç getir
     */
    async searchResult(
      _parent: unknown,
      args: { id: string },
      context: GraphQLContext
    ) {
      try {
        const result = await context.dataloaders.searchResultLoader.load(
          args.id
        );

        if (!result) {
          throw new GraphQLError('Arama sonucu bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        return result;
      } catch (error) {
        console.error('Get search result error:', error);
        throw new GraphQLError('Sonuç getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },

    /**
     * Arama geçmişi
     */
    async searchHistory(
      _parent: unknown,
      args: {
        userId?: string;
        pagination?: { page?: number; limit?: number };
      },
      context: GraphQLContext
    ) {
      try {
        const page = args.pagination?.page || 1;
        const limit = args.pagination?.limit || 20;
        const offset = (page - 1) * limit;

        // Kullanıcı ID kontrolü
        const userId = args.userId || context.user?.id;
        if (!userId && !context.user) {
          throw new GraphQLError('Kullanıcı kimliği gerekli', {
            extensions: { code: 'UNAUTHORIZED' },
          });
        }

        // Veritabanından geçmişi çek
        const [items, total] = await Promise.all([
          context.prisma.searchHistory.findMany({
            where: userId ? { userId } : undefined,
            skip: offset,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
              clickedResults: true,
            },
          }),
          context.prisma.searchHistory.count({
            where: userId ? { userId } : undefined,
          }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
          items: items.map((item) => ({
            id: item.id,
            query: item.query,
            resultCount: item.resultCount,
            clickedResults: item.clickedResults.map((r) => r.resultId),
            userId: item.userId,
            timestamp: item.createdAt,
            duration: item.duration || 0,
          })),
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        };
      } catch (error) {
        console.error('Search history error:', error);
        throw new GraphQLError('Geçmiş getirilirken hata oluştu', {
          extensions: { code: 'HISTORY_ERROR' },
        });
      }
    },

    /**
     * Arama analitiği
     */
    async searchAnalytics(
      _parent: unknown,
      args: {
        startDate?: Date;
        endDate?: Date;
      },
      context: GraphQLContext
    ) {
      try {
        const { search } = context.services;

        // Tarih aralığını belirle
        const endDate = args.endDate || new Date();
        const startDate =
          args.startDate ||
          new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Son 30 gün

        // Analytics verilerini topla
        const analytics = await search.getAnalytics(startDate, endDate);

        return {
          totalSearches: analytics.totalSearches,
          uniqueUsers: analytics.uniqueUsers,
          averageResultCount: analytics.averageResultCount,
          averageQueryTime: analytics.averageQueryTime,
          topQueries: analytics.topQueries.map((q) => ({
            query: q.query,
            count: q.count,
            averageScore: q.averageScore,
            clickRate: q.clickRate,
          })),
          noResultQueries: analytics.noResultQueries,
          searchTrends: analytics.trends.map((t) => ({
            date: t.date,
            searchCount: t.searchCount,
            userCount: t.userCount,
          })),
        };
      } catch (error) {
        console.error('Search analytics error:', error);
        throw new GraphQLError('Analitik verileri getirilirken hata oluştu', {
          extensions: { code: 'ANALYTICS_ERROR' },
        });
      }
    },
  },

  Mutation: {
    /**
     * Yeni arama kaydet
     */
    async saveSearch(
      _parent: unknown,
      args: {
        input: {
          query: string;
          results: string[];
          userId: string;
          metadata?: any;
        };
      },
      context: GraphQLContext
    ) {
      try {
        const { query, results, userId, metadata } = args.input;

        // Arama geçmişine kaydet
        const searchHistory = await context.prisma.searchHistory.create({
          data: {
            query,
            resultCount: results.length,
            userId,
            metadata: metadata || {},
            duration: 0,
            clickedResults: {
              create: results.map((resultId) => ({
                resultId,
                clickedAt: new Date(),
              })),
            },
          },
          include: {
            clickedResults: true,
          },
        });

        // Cache'e ekle
        await context.redis.setex(
          `search:${searchHistory.id}`,
          3600,
          JSON.stringify(searchHistory)
        );

        return {
          id: searchHistory.id,
          content: query,
          title: null,
          score: 1.0,
          source: 'user_search',
          documentId: null,
          metadata,
          highlights: [],
          embedding: null,
          timestamp: searchHistory.createdAt,
          relevanceFeedback: null,
        };
      } catch (error) {
        console.error('Save search error:', error);
        throw new GraphQLError('Arama kaydedilirken hata oluştu', {
          extensions: { code: 'SAVE_ERROR' },
        });
      }
    },

    /**
     * Relevance feedback güncelle
     */
    async updateSearchRelevance(
      _parent: unknown,
      args: {
        input: {
          searchResultId: string;
          isRelevant: boolean;
          rating?: number;
          comment?: string;
          userId: string;
        };
      },
      context: GraphQLContext
    ) {
      try {
        const { searchResultId, isRelevant, rating, comment, userId } =
          args.input;

        // Feedback'i kaydet
        const feedback = await context.prisma.relevanceFeedback.upsert({
          where: {
            searchResultId_userId: {
              searchResultId,
              userId,
            },
          },
          create: {
            searchResultId,
            userId,
            isRelevant,
            rating: rating || (isRelevant ? 5 : 1),
            comment,
          },
          update: {
            isRelevant,
            rating: rating || (isRelevant ? 5 : 1),
            comment,
          },
        });

        // Model'i yeniden eğit (async - background)
        context.services.search.updateModelWithFeedback(feedback);

        // Güncellenmiş sonucu dön
        const result = await context.dataloaders.searchResultLoader.load(
          searchResultId
        );

        return {
          ...result,
          relevanceFeedback: {
            isRelevant: feedback.isRelevant,
            rating: feedback.rating,
            userId: feedback.userId,
            timestamp: feedback.createdAt,
            comment: feedback.comment,
          },
        };
      } catch (error) {
        console.error('Update relevance error:', error);
        throw new GraphQLError('Relevance güncellenirken hata oluştu', {
          extensions: { code: 'UPDATE_ERROR' },
        });
      }
    },

    /**
     * Arama geçmişini temizle
     */
    async clearSearchHistory(
      _parent: unknown,
      args: { userId: string },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (context.user?.id !== args.userId && context.user?.role !== 'admin') {
          throw new GraphQLError('Bu işlem için yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // Geçmişi sil
        await context.prisma.searchHistory.deleteMany({
          where: { userId: args.userId },
        });

        // Cache'i temizle
        const keys = await context.redis.keys(`search:user:${args.userId}:*`);
        if (keys.length > 0) {
          await context.redis.del(...keys);
        }

        return true;
      } catch (error) {
        console.error('Clear history error:', error);
        throw new GraphQLError('Geçmiş temizlenirken hata oluştu', {
          extensions: { code: 'DELETE_ERROR' },
        });
      }
    },
  },

  Subscription: {
    /**
     * Gerçek zamanlı arama sonuçları
     */
    searchResultsUpdated: {
      subscribe: async (_parent, args, context) => {
        // Redis PubSub kullan
        const channel = `search:updates:${args.query}`;
        return context.redis.subscribe(channel);
      },
    },

    /**
     * Embedding progress tracking
     */
    embeddingProgress: {
      subscribe: async (_parent, args, context) => {
        const channel = `embedding:progress:${args.documentId}`;
        return context.redis.subscribe(channel);
      },
    },
  },
};