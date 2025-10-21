/**
 * Settings Resolvers
 * Sistem konfigürasyonu ve ayarları yönetmek için GraphQL resolver'ları
 */

import { GraphQLContext, hasRole } from '../context';
import { GraphQLError } from 'graphql';

export const settingsResolvers = {
  Query: {
    /**
     * Tüm settings'i getir (kategoriye göre filtrelenebilir)
     */
    async settings(
      _parent: unknown,
      args: { category?: string },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü - admin ve settings-reader roles
        if (!hasRole(context, 'admin') && !hasRole(context, 'settings-reader')) {
          throw new GraphQLError('Bu ayarlara erişim yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // Query'i oluştur
        let query = 'SELECT key, value, category, description, created_at, updated_at FROM settings';
        const params: any[] = [];

        if (args.category) {
          query += ' WHERE category = $1';
          params.push(args.category);
        }

        query += ' ORDER BY category, key';

        const result = await context.prisma.$queryRaw`
          SELECT key, value, category, description, created_at as "createdAt", updated_at as "updatedAt"
          FROM settings
          ${args.category ? 'WHERE category = ' + args.category : ''}
          ORDER BY category, key
        `;

        // Redis'ten cache'e al
        const cacheKey = `settings:${args.category || 'all'}`;
        await context.redis.setex(cacheKey, 3600, JSON.stringify(result)); // 1 saat cache

        return {
          items: result,
          category: args.category || null,
          total: (result as any[]).length,
        };
      } catch (error) {
        console.error('Get settings error:', error);
        throw new GraphQLError('Ayarlar getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },

    /**
     * Belirli bir setting getir
     */
    async setting(
      _parent: unknown,
      args: { key: string },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!hasRole(context, 'admin') && !hasRole(context, 'settings-reader')) {
          throw new GraphQLError('Bu ayara erişim yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // Cache'den kontrol et
        const cached = await context.redis.get(`setting:${args.key}`);
        if (cached) {
          return JSON.parse(cached);
        }

        // Veritabanından getir
        const result = await context.prisma.$queryRaw`
          SELECT key, value, category, description, created_at as "createdAt", updated_at as "updatedAt"
          FROM settings
          WHERE key = ${args.key}
          LIMIT 1
        `;

        const setting = (result as any[])[0];

        if (!setting) {
          throw new GraphQLError('Setting bulunamadı', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        // Cache'e ekle
        await context.redis.setex(`setting:${args.key}`, 3600, JSON.stringify(setting));

        return setting;
      } catch (error) {
        console.error('Get setting error:', error);
        throw new GraphQLError('Setting getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },

    /**
     * GraphQL ayarlarını getir
     */
    async graphqlSettings(
      _parent: unknown,
      _args: unknown,
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!hasRole(context, 'admin')) {
          throw new GraphQLError('Bu işlem için yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // GraphQL ayarlarını getir
        const settings = await context.prisma.$queryRaw`
          SELECT value FROM settings WHERE key LIKE 'graphql.%'
        `;

        // Default ayarlar
        const graphqlSettings = {
          enabled: process.env.ENABLE_GRAPHQL !== 'false',
          endpoint: process.env.GRAPHQL_ENDPOINT || '/graphql',
          playgroundEnabled: process.env.GRAPHQL_PLAYGROUND !== 'false',
          maxQueryDepth: 10,
          maxQueryComplexity: 1000,
          enableSubscriptions: true,
          enableCaching: true,
          cacheTTL: 3600,
          enableRateLimiting: true,
          rateLimit: {
            maxRequests: 100,
            windowMs: 60000,
            keyGenerator: 'ip',
          },
          persistedQueriesEnabled: false,
          introspectionEnabled: process.env.NODE_ENV !== 'production',
          debugMode: process.env.NODE_ENV === 'development',
        };

        return graphqlSettings;
      } catch (error) {
        console.error('Get GraphQL settings error:', error);
        throw new GraphQLError('GraphQL ayarları getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },

    /**
     * API ayarlarını getir
     */
    async apiSettings(
      _parent: unknown,
      _args: unknown,
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!hasRole(context, 'admin')) {
          throw new GraphQLError('Bu işlem için yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // API ayarlarını topla
        const apiSettings = {
          port: parseInt(process.env.API_PORT || '8083'),
          environment: process.env.NODE_ENV || 'development',
          corsEnabled: process.env.ENABLE_CORS !== 'false',
          corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
            .split(',')
            .map((o) => o.trim()),
          jwtEnabled: true,
          apiKeyEnabled: true,
          https: process.env.HTTPS === 'true',
          compressionEnabled: true,
          requestLogging: true,
          errorLogging: true,
        };

        return apiSettings;
      } catch (error) {
        console.error('Get API settings error:', error);
        throw new GraphQLError('API ayarları getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },

    /**
     * Tüm kategoriileri listele
     */
    async settingsCategories(
      _parent: unknown,
      _args: unknown,
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!hasRole(context, 'admin') && !hasRole(context, 'settings-reader')) {
          throw new GraphQLError('Bu işlem için yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        const result = await context.prisma.$queryRaw`
          SELECT DISTINCT category FROM settings ORDER BY category
        `;

        return (result as any[]).map((r) => r.category);
      } catch (error) {
        console.error('Get categories error:', error);
        throw new GraphQLError('Kategoriler getirilirken hata oluştu', {
          extensions: { code: 'FETCH_ERROR' },
        });
      }
    },
  },

  Mutation: {
    /**
     * Tek bir setting güncelle
     */
    async updateSetting(
      _parent: unknown,
      args: {
        input: {
          key: string;
          value: any;
          category: string;
          description?: string;
        };
      },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü - admin only
        if (!hasRole(context, 'admin')) {
          throw new GraphQLError('Ayarları güncelleme yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // Güncelle
        const result = await context.prisma.$queryRaw`
          INSERT INTO settings (key, value, category, description)
          VALUES (${args.input.key}, ${JSON.stringify(args.input.value)}, ${args.input.category}, ${args.input.description || null})
          ON CONFLICT (key) DO UPDATE SET
            value = ${JSON.stringify(args.input.value)},
            category = ${args.input.category},
            description = ${args.input.description || null},
            updated_at = CURRENT_TIMESTAMP
          RETURNING key, value, category, description, created_at as "createdAt", updated_at as "updatedAt"
        `;

        // Cache'i temizle
        await context.redis.del(`setting:${args.input.key}`);
        await context.redis.del(`settings:${args.input.category}`);
        await context.redis.del('settings:all');

        return (result as any[])[0];
      } catch (error) {
        console.error('Update setting error:', error);
        throw new GraphQLError('Setting güncellenirken hata oluştu', {
          extensions: { code: 'UPDATE_ERROR' },
        });
      }
    },

    /**
     * Birden fazla setting güncelle
     */
    async updateSettings(
      _parent: unknown,
      args: {
        input: Array<{
          key: string;
          value: any;
          category: string;
          description?: string;
        }>;
      },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!hasRole(context, 'admin')) {
          throw new GraphQLError('Ayarları güncelleme yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        const results = [];

        for (const item of args.input) {
          const result = await context.prisma.$queryRaw`
            INSERT INTO settings (key, value, category, description)
            VALUES (${item.key}, ${JSON.stringify(item.value)}, ${item.category}, ${item.description || null})
            ON CONFLICT (key) DO UPDATE SET
              value = ${JSON.stringify(item.value)},
              category = ${item.category},
              description = ${item.description || null},
              updated_at = CURRENT_TIMESTAMP
            RETURNING key, value, category, description, created_at as "createdAt", updated_at as "updatedAt"
          `;

          // Cache'i temizle
          await context.redis.del(`setting:${item.key}`);
          await context.redis.del(`settings:${item.category}`);

          results.push((result as any[])[0]);
        }

        // Genel cache'i temizle
        await context.redis.del('settings:all');

        return results;
      } catch (error) {
        console.error('Update settings error:', error);
        throw new GraphQLError('Ayarlar güncellenirken hata oluştu', {
          extensions: { code: 'UPDATE_ERROR' },
        });
      }
    },

    /**
     * GraphQL ayarlarını güncelle
     */
    async updateGraphQLSettings(
      _parent: unknown,
      args: { input: any },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!hasRole(context, 'admin')) {
          throw new GraphQLError('GraphQL ayarlarını güncelleme yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        // Ayarları güncelle
        const updates = [];
        if (args.input.enabled !== undefined) {
          updates.push(['graphql.enabled', args.input.enabled]);
        }
        if (args.input.maxQueryDepth !== undefined) {
          updates.push(['graphql.maxQueryDepth', args.input.maxQueryDepth]);
        }
        if (args.input.enableCaching !== undefined) {
          updates.push(['graphql.enableCaching', args.input.enableCaching]);
        }

        // Veritabanına kaydet
        for (const [key, value] of updates) {
          await context.prisma.$queryRaw`
            INSERT INTO settings (key, value, category)
            VALUES (${key}, ${JSON.stringify(value)}, 'graphql')
            ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify(value)}
          `;
        }

        // Cache'i temizle
        await context.redis.del('graphql:settings');

        // Updated settings'i dön
        return {
          ...args.input,
          enabled: args.input.enabled ?? true,
          endpoint: '/graphql',
          playgroundEnabled: true,
          maxQueryDepth: args.input.maxQueryDepth ?? 10,
          maxQueryComplexity: args.input.maxQueryComplexity ?? 1000,
          enableSubscriptions: args.input.enableSubscriptions ?? true,
          enableCaching: args.input.enableCaching ?? true,
          cacheTTL: args.input.cacheTTL ?? 3600,
          enableRateLimiting: args.input.enableRateLimiting ?? true,
          rateLimit: args.input.rateLimit ?? { maxRequests: 100, windowMs: 60000 },
          persistedQueriesEnabled: args.input.persistedQueriesEnabled ?? false,
          introspectionEnabled: args.input.introspectionEnabled ?? true,
          debugMode: args.input.debugMode ?? false,
        };
      } catch (error) {
        console.error('Update GraphQL settings error:', error);
        throw new GraphQLError('GraphQL ayarları güncellenirken hata oluştu', {
          extensions: { code: 'UPDATE_ERROR' },
        });
      }
    },

    /**
     * Setting sil
     */
    async deleteSetting(
      _parent: unknown,
      args: { key: string },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!hasRole(context, 'admin')) {
          throw new GraphQLError('Setting silme yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        await context.prisma.$queryRaw`
          DELETE FROM settings WHERE key = ${args.key}
        `;

        // Cache'i temizle
        await context.redis.del(`setting:${args.key}`);

        return true;
      } catch (error) {
        console.error('Delete setting error:', error);
        throw new GraphQLError('Setting silinirken hata oluştu', {
          extensions: { code: 'DELETE_ERROR' },
        });
      }
    },

    /**
     * Kategori temizle
     */
    async clearSettingsCategory(
      _parent: unknown,
      args: { category: string },
      context: GraphQLContext
    ) {
      try {
        // Yetki kontrolü
        if (!hasRole(context, 'admin')) {
          throw new GraphQLError('Bu işlem için yetkiniz yok', {
            extensions: { code: 'FORBIDDEN' },
          });
        }

        await context.prisma.$queryRaw`
          DELETE FROM settings WHERE category = ${args.category}
        `;

        // Cache'i temizle
        await context.redis.del(`settings:${args.category}`);
        await context.redis.del('settings:all');

        return true;
      } catch (error) {
        console.error('Clear category error:', error);
        throw new GraphQLError('Kategori temizlenirken hata oluştu', {
          extensions: { code: 'DELETE_ERROR' },
        });
      }
    },
  },
};