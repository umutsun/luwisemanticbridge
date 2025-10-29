/**
 * Scraper Resolvers
 * Web scraping işlemleri için GraphQL resolver'lar
 */

import { GraphQLContext } from '../context';
import { requireAuth, requireAdmin } from '../context';

export const scraperResolvers = {
  Query: {
    /**
     * Tüm scraping işlerini getir
     */
    scrapingJobs: async (
      _: any,
      { limit = 20, status }: { limit?: number; status?: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        let query = `
          SELECT id, url, status, progress, total_pages, processed_pages,
                 error, started_at, completed_at, created_at
          FROM scraping_jobs
        `;

        const params: any[] = [];
        if (status) {
          query += ` WHERE status = $1`;
          params.push(status);
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await context.pool.query(query, params);

        const countQuery = status
          ? `SELECT COUNT(*) as total FROM scraping_jobs WHERE status = $1`
          : `SELECT COUNT(*) as total FROM scraping_jobs`;
        const countParams = status ? [status] : [];
        const countResult = await context.pool.query(countQuery, countParams);

        const total = parseInt(countResult.rows[0].total, 10);

        return {
          items: result.rows.map((row) => ({
            id: row.id,
            url: row.url,
            status: row.status,
            progress: row.progress || 0,
            totalPages: row.total_pages,
            processedPages: row.processed_pages,
            error: row.error,
            startedAt: row.started_at,
            completedAt: row.completed_at,
          })),
          total,
        };
      } catch (error) {
        console.error('[GraphQL] Scraping jobs query error:', error);
        throw new Error('Scraping işleri getirilemedi');
      }
    },

    /**
     * Tek scraping işi getir
     */
    scrapingJob: async (
      _: any,
      { id }: { id: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `SELECT id, url, status, progress, total_pages, processed_pages,
                  error, started_at, completed_at, created_at
           FROM scraping_jobs
           WHERE id = $1`,
          [id]
        );

        if (result.rows.length === 0) {
          throw new Error('Scraping işi bulunamadı');
        }

        const row = result.rows[0];

        return {
          id: row.id,
          url: row.url,
          status: row.status,
          progress: row.progress || 0,
          totalPages: row.total_pages,
          processedPages: row.processed_pages,
          error: row.error,
          startedAt: row.started_at,
          completedAt: row.completed_at,
        };
      } catch (error) {
        console.error('[GraphQL] Scraping job query error:', error);
        throw new Error('Scraping işi bulunamadı');
      }
    },
  },

  Mutation: {
    /**
     * Yeni scraping işi başlat
     */
    startScraping: async (
      _: any,
      { input }: { input: any },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `INSERT INTO scraping_jobs
           (url, status, progress, total_pages, processed_pages, started_at, created_at)
           VALUES ($1, 'PENDING', 0, 0, 0, NOW(), NOW())
           RETURNING id, url, status, progress, total_pages, processed_pages,
                     error, started_at, completed_at`,
          [input.url]
        );

        const job = result.rows[0];

        // TODO: Burada scraping servisini trigger et
        console.log('[GraphQL] Scraping job created:', job.id);

        return {
          id: job.id,
          url: job.url,
          status: job.status,
          progress: job.progress || 0,
          totalPages: job.total_pages,
          processedPages: job.processed_pages,
          error: job.error,
          startedAt: job.started_at,
          completedAt: job.completed_at,
        };
      } catch (error) {
        console.error('[GraphQL] Start scraping error:', error);
        throw new Error('Scraping işi başlatılamadı');
      }
    },

    /**
     * Scraping'i duraklat
     */
    pauseScraping: async (
      _: any,
      { jobId }: { jobId: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `UPDATE scraping_jobs
           SET status = 'PAUSED'
           WHERE id = $1
           RETURNING id, url, status, progress, total_pages, processed_pages,
                     error, started_at, completed_at`,
          [jobId]
        );

        if (result.rows.length === 0) {
          throw new Error('Scraping işi bulunamadı');
        }

        const job = result.rows[0];

        return {
          id: job.id,
          url: job.url,
          status: job.status,
          progress: job.progress || 0,
          totalPages: job.total_pages,
          processedPages: job.processed_pages,
          error: job.error,
          startedAt: job.started_at,
          completedAt: job.completed_at,
        };
      } catch (error) {
        console.error('[GraphQL] Pause scraping error:', error);
        throw new Error('Scraping durdurulamadı');
      }
    },

    /**
     * Scraping'i devam ettir
     */
    resumeScraping: async (
      _: any,
      { jobId }: { jobId: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `UPDATE scraping_jobs
           SET status = 'RUNNING'
           WHERE id = $1
           RETURNING id, url, status, progress, total_pages, processed_pages,
                     error, started_at, completed_at`,
          [jobId]
        );

        if (result.rows.length === 0) {
          throw new Error('Scraping işi bulunamadı');
        }

        const job = result.rows[0];

        return {
          id: job.id,
          url: job.url,
          status: job.status,
          progress: job.progress || 0,
          totalPages: job.total_pages,
          processedPages: job.processed_pages,
          error: job.error,
          startedAt: job.started_at,
          completedAt: job.completed_at,
        };
      } catch (error) {
        console.error('[GraphQL] Resume scraping error:', error);
        throw new Error('Scraping devam ettirilemedi');
      }
    },

    /**
     * Scraping'i iptal et
     */
    cancelScraping: async (
      _: any,
      { jobId }: { jobId: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      try {
        const result = await context.pool.query(
          `UPDATE scraping_jobs
           SET status = 'FAILED', completed_at = NOW()
           WHERE id = $1
           RETURNING id`,
          [jobId]
        );

        if (result.rows.length === 0) {
          throw new Error('Scraping işi bulunamadı');
        }

        return true;
      } catch (error) {
        console.error('[GraphQL] Cancel scraping error:', error);
        throw new Error('Scraping iptal edilemedi');
      }
    },
  },

  Subscription: {
    /**
     * Scraping progress'i izle
     */
    scrapingProgress: {
      subscribe: async (_: any, { jobId }: { jobId: string }, context: GraphQLContext) => {
        requireAuth(context);

        // TODO: Redis PubSub ile implement et
        throw new Error('Subscriptions not yet implemented');
      },
    },
  },

  ScrapingJob: {
    /**
     * Scraping job results'larını getir (lazy loading)
     */
    results: async (parent: any, _: any, context: GraphQLContext) => {
      try {
        const result = await context.pool.query(
          `SELECT id, url, title, content, metadata, scraped_at
           FROM scraped_content
           WHERE job_id = $1
           ORDER BY scraped_at DESC
           LIMIT 100`,
          [parent.id]
        );

        return result.rows.map((row) => ({
          id: row.id,
          url: row.url,
          title: row.title,
          content: row.content,
          metadata: row.metadata,
          scrapedAt: row.scraped_at,
        }));
      } catch (error) {
        console.error('[GraphQL] Scraping job results error:', error);
        return [];
      }
    },
  },
};

export default scraperResolvers;
