/**
 * GraphQL DataLoaders
 * N+1 query problemini çözmek için DataLoader pattern
 */

import DataLoader from 'dataloader';
import { PrismaClient } from '@prisma/client';

/**
 * DataLoader tipleri
 */
export interface DataLoaders {
  searchResultLoader: DataLoader<string, any>;
  documentLoader: DataLoader<string, any>;
  userLoader: DataLoader<string, any>;
  embeddingLoader: DataLoader<string, number[]>;
  chatMessageLoader: DataLoader<string, any>;
}

/**
 * DataLoader'ları oluştur
 * Her request için yeni instance oluşturulur
 */
export function createDataLoaders(prisma: PrismaClient): DataLoaders {
  return {
    /**
     * Search result loader
     * Batch olarak search result'ları yükler
     */
    searchResultLoader: new DataLoader(async (ids: readonly string[]) => {
      const results = await prisma.searchResult.findMany({
        where: {
          id: { in: [...ids] },
        },
        include: {
          embedding: true,
          relevanceFeedback: true,
        },
      });

      // ID'lere göre sırala
      const resultMap = new Map(results.map((r) => [r.id, r]));
      return ids.map((id) => resultMap.get(id) || null);
    }),

    /**
     * Document loader
     * Batch olarak dokümanları yükler
     */
    documentLoader: new DataLoader(async (ids: readonly string[]) => {
      const documents = await prisma.document.findMany({
        where: {
          id: { in: [...ids] },
        },
        include: {
          embeddings: true,
          metadata: true,
        },
      });

      const docMap = new Map(documents.map((d) => [d.id, d]));
      return ids.map((id) => docMap.get(id) || null);
    }),

    /**
     * User loader
     * Batch olarak kullanıcıları yükler
     */
    userLoader: new DataLoader(async (ids: readonly string[]) => {
      const users = await prisma.user.findMany({
        where: {
          id: { in: [...ids] },
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      const userMap = new Map(users.map((u) => [u.id, u]));
      return ids.map((id) => userMap.get(id) || null);
    }),

    /**
     * Embedding loader
     * Text'ten embedding vektörü oluşturur (cached)
     */
    embeddingLoader: new DataLoader(async (texts: readonly string[]) => {
      const embeddings = await Promise.all(
        texts.map(async (text) => {
          // Önce cache'e bak
          const cached = await prisma.embeddingCache.findUnique({
            where: { text },
          });

          if (cached) {
            return cached.vector;
          }

          // Cache'de yoksa yeni oluştur
          try {
            // TODO: Embedding service'i çağır
            const vector = new Array(1536).fill(0).map(() => Math.random());

            // Cache'e kaydet
            await prisma.embeddingCache.create({
              data: {
                text,
                vector,
                model: 'text-embedding-ada-002',
              },
            });

            return vector;
          } catch (error) {
            console.error('Embedding error:', error);
            return null;
          }
        })
      );

      return embeddings;
    }),

    /**
     * Chat message loader
     * Batch olarak chat mesajlarını yükler
     */
    chatMessageLoader: new DataLoader(async (ids: readonly string[]) => {
      const messages = await prisma.chatMessage.findMany({
        where: {
          id: { in: [...ids] },
        },
        include: {
          session: true,
          user: true,
        },
      });

      const messageMap = new Map(messages.map((m) => [m.id, m]));
      return ids.map((id) => messageMap.get(id) || null);
    }),
  };
}

/**
 * DataLoader utilities
 */
export const DataLoaderUtils = {
  /**
   * Cache'i temizle
   */
  clearAll(loaders: DataLoaders) {
    Object.values(loaders).forEach((loader) => loader.clearAll());
  },

  /**
   * Belirli bir key için cache'i temizle
   */
  clear(loaders: DataLoaders, loaderName: keyof DataLoaders, key: string) {
    loaders[loaderName].clear(key);
  },

  /**
   * Prime cache with data
   */
  prime(
    loaders: DataLoaders,
    loaderName: keyof DataLoaders,
    key: string,
    value: any
  ) {
    loaders[loaderName].prime(key, value);
  },
};

export default createDataLoaders;