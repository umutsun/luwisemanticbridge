import { redis } from '../server';
import { lsembPool } from '../config/database.config';
import { webScraperService } from './web-scraper.service';
import embeddingProcessor from './embedding-processor.service';
import { scrapeEmbeddingService } from './scrape-embedding.service';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Server as SocketIOServer } from 'socket.io';

let isProcessing = false;

interface ScrapingJob {
  projectId: string;
  category: string;
  sites: any[];
  options: any;
  status: string;
  progress: {
    total: number;
    completed: number;
    current: string | null;
    items: number;
    startTime: number;
    elapsed: string;
  };
  results: any[];
  errors: any[];
}

class QueueProcessorService {
  private io: SocketIOServer | null = null;

  constructor() {
    // Try to get Socket.IO instance
    try {
      const server = require('../server').default;
      if (server && server.getSocketIO) {
        this.io = server.getSocketIO();
      }
    } catch (error) {
      console.log('Socket.IO not available during initialization');
    }
  }

  async startQueueProcessor() {
    if (isProcessing) return;

    isProcessing = true;
    console.log('[QUEUE] Starting job processor...');

    while (isProcessing) {
      try {
        // Get next job from queue
        const jobId = await redis.brpop('scraping_jobs_queue', 5);

        if (jobId) {
          const [, jobKey] = jobId;
          await this.processJob(jobKey);
        }
      } catch (error) {
        console.error('[QUEUE] Processing error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log('[QUEUE] Job processor stopped');
  }

  async processJob(jobId: string) {
    console.log(`[JOB] Processing: ${jobId}`);

    try {
      // Get job data
      const jobData = await redis.get(`scraping_job:${jobId}`);
      if (!jobData) {
        console.error(`[JOB] Job data not found: ${jobId}`);
        return;
      }

      const job: ScrapingJob = JSON.parse(jobData);
      job.status = 'running';
      await redis.set(`scraping_job:${jobId}`, JSON.stringify(job));

      // Process each site
      for (let i = 0; i < job.sites.length; i++) {
        const site = job.sites[i];

        // Check if job was cancelled
        const currentJob = await redis.get(`scraping_job:${jobId}`);
        const currentJobData = JSON.parse(currentJob!);
        if (currentJobData.status === 'cancelled') {
          console.log(`[JOB] Job cancelled: ${jobId}`);
          return;
        }

        // Update progress
        job.progress.current = site.name;
        job.progress.completed = i;
        const elapsed = Date.now() - job.progress.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        job.progress.elapsed = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        await redis.set(`scraping_job:${jobId}`, JSON.stringify(job));

        // Emit progress update
        this.emitProgress(jobId, job.progress);

        // Scrape the site
        try {
          const scrapedData = await this.scrapeSite(site, job);
          job.results.push(...scrapedData);
          job.progress.items += scrapedData.length;

          // Save scraped data
          if (job.options.saveToDb) {
            await this.saveScrapedData(jobId, scrapedData);
          }

          // Process with embeddings if enabled
          if (job.options.generateEmbeddings) {
            await this.generateEmbeddings(scrapedData);
          }

        } catch (error) {
          console.error(`[JOB] Error scraping ${site.name}:`, error);
          job.errors.push({
            site: site.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Rate limiting
        if (site.rate_limit && site.rate_limit > 0) {
          await new Promise(resolve => setTimeout(resolve, 60000 / site.rate_limit));
        }
      }

      // Mark job as complete
      job.status = 'completed';
      job.progress.completed = job.progress.total;
      await redis.setex(`scraping_job:${jobId}`, 86400, JSON.stringify(job)); // Keep for 24 hours

      // Emit completion
      this.emitCompletion(jobId, job);

      console.log(`[JOB] Completed: ${jobId}`);

    } catch (error) {
      console.error(`[JOB] Failed to process ${jobId}:`, error);

      // Mark job as failed
      const jobData = await redis.get(`scraping_job:${jobId}`);
      if (jobData) {
        const job = JSON.parse(jobData);
        job.status = 'failed';
        job.errors.push({
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        await redis.set(`scraping_job:${jobId}`, JSON.stringify(job));

        this.emitError(jobId, error);
      }
    }
  }

  async scrapeSite(site: any, job: ScrapingJob): Promise<any[]> {
    console.log(`[SCRAPER] Scraping: ${site.name} (${site.base_url})`);

    // Use web scraper service
    const result = await webScraperService.scrape(site.base_url, {
      wordCountThreshold: 100,
      waitForSelector: site.selectors?.wait || null
    });

    if (!result.success) {
      throw new Error(result.error || 'Scraping failed');
    }

    // Process the scraped content
    const processedData = {
      siteId: site.id,
      siteName: site.name,
      url: result.url,
      category: job.category,
      title: result.title,
      content: result.content,
      description: result.description,
      keywords: result.metadata?.keywords || [],
      links: result.metadata?.links || [],
      metadata: {
        scrapingMethod: 'web-scraper',
        projectId: job.projectId,
        scrapedAt: new Date().toISOString(),
        siteType: site.type,
        contentLength: result.content.length,
        wordCount: result.metadata?.wordCount || 0
      }
    };

    // Apply filters if configured
    if (site.filters && Object.keys(site.filters).length > 0) {
      this.applyFilters(processedData, site.filters);
    }

    // Apply transformations if configured
    if (site.transforms && Object.keys(site.transforms).length > 0) {
      this.applyTransformations(processedData, site.transforms);
    }

    return [processedData];
  }

  async saveScrapedData(jobId: string, data: any[]) {
    try {
      for (const item of data) {
        await lsembPool.query(`
          INSERT INTO scraped_content
          (project_id, site_id, url, title, content, description, category, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (url) DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
        `, [
          item.metadata.projectId,
          item.siteId,
          item.url,
          item.title,
          item.content.substring(0, 50000), // Limit content size
          item.description,
          item.category,
          JSON.stringify(item.metadata)
        ]);
      }
    } catch (error) {
      console.error('[DB] Failed to save scraped data:', error);
    }
  }

  async generateEmbeddings(data: any[]) {
    try {
      for (const item of data) {
        // Use scrapeEmbeddingService for scraped content
        await scrapeEmbeddingService.processAndSaveChunks(
          item.content,
          {
            sourceUrl: item.url,
            title: item.title,
            category: item.category,
            projectId: item.metadata?.projectId,
            siteId: item.siteId,
            metadata: {
              scrapingMethod: item.metadata?.scrapingMethod,
              scrapedAt: item.metadata?.scrapedAt,
              siteType: item.metadata?.siteType
            }
          }
        );
      }
    } catch (error) {
      console.error('[EMBEDDINGS] Failed to generate embeddings:', error);
    }
  }

  applyFilters(data: any, filters: any) {
    // Apply content filters
    if (filters.min_length && data.content.length < filters.min_length) {
      data.content = '';
    }

    if (filters.exclude_tags && filters.exclude_tags.length > 0) {
      // Remove excluded tags from content
      for (const tag of filters.exclude_tags) {
        const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gis');
        data.content = data.content.replace(regex, '');
      }
    }

    if (filters.keywords && filters.keywords.length > 0) {
      // Check if content contains required keywords
      const hasKeywords = filters.keywords.some((keyword: string) =>
        data.content.toLowerCase().includes(keyword.toLowerCase())
      );
      if (!hasKeywords) {
        data.content = '';
      }
    }
  }

  applyTransformations(data: any, transforms: any) {
    // Clean HTML if requested
    if (transforms.clean_html) {
      data.content = data.content
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Extract images if requested
    if (transforms.extract_images) {
      const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
      const images = [];
      let match;
      while ((match = imgRegex.exec(data.content)) !== null) {
        images.push(match[1]);
      }
      data.metadata.images = images;
    }

    // Extract metadata if requested
    if (transforms.extract_metadata) {
      // Extract title from meta tags
      const titleMatch = data.content.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && !data.title) {
        data.title = titleMatch[1];
      }

      // Extract description from meta tags
      const descMatch = data.content.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      if (descMatch && !data.description) {
        data.description = descMatch[1];
      }
    }
  }

  private emitProgress(jobId: string, progress: any) {
    if (this.io) {
      this.io.emit('scraping-progress', {
        jobId,
        progress
      });
    }
  }

  private emitCompletion(jobId: string, job: ScrapingJob) {
    if (this.io) {
      this.io.emit('scraping-complete', {
        jobId,
        results: job.results,
        stats: job.progress,
        errors: job.errors
      });
    }
  }

  private emitError(jobId: string, error: any) {
    if (this.io) {
      this.io.emit('scraping-error', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  stopQueueProcessor() {
    isProcessing = false;
    console.log('[QUEUE] Stop signal sent');
  }
}

// Export singleton instance
const queueProcessor = new QueueProcessorService();
export default queueProcessor;