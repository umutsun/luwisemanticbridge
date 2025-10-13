import puppeteer from 'puppeteer';
import { Browser, Page } from 'puppeteer';
import { lsembPool } from '../config/database.config';
import { redis } from '../server';
import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import OpenAI from 'openai';
import { deduplicationService } from './deduplication.service';

interface ScrapeOptions {
  selector?: string;
  waitForSelector?: string;
  timeout?: number;
  jsCode?: string;
  extractLinks?: boolean;
  extractImages?: boolean;
  wordCountThreshold?: number;
  removeOverlayElements?: boolean;
  customSelectors?: {
    title?: string;
    content?: string;
    links?: string;
    images?: string;
  };
}

interface ScrapeResult {
  success: boolean;
  title: string;
  content: string;
  description?: string;
  markdown?: string;
  links?: string[];
  images?: string[];
  metadata?: any;
  url: string;
  error?: string;
}

interface DetectedSelector {
  name: string;
  selector: string;
  confidence: number;
  type: 'title' | 'content' | 'navigation' | 'footer' | 'sidebar';
}

export class WebScraperService {
  private browser: Browser | null = null;
  private openai: OpenAI | null = null;
  private jobQueue: Map<string, any> = new Map();
  private io: any;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  setSocketIO(io: any) {
    this.io = io;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  async analyzeUrl(url: string): Promise<{ success: boolean; selectors?: DetectedSelector[]; mode?: string }> {
    try {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Check if page has dynamic content
      const hasDynamicContent = await page.evaluate(() => {
        return window['__INITIAL_STATE__'] ||
               document.querySelector('[data-reactroot]') ||
               document.querySelector('[data-v-]') ||
               document.querySelector('#__next') ||
               document.querySelector('[ng-app]') ||
               document.querySelector('.vue-app');
      });

      const content = await page.content();
      const $ = cheerio.load(content);

      const selectors: DetectedSelector[] = [];

      // Detect title selector
      const titleSelectors = ['h1', '.title', '.page-title', '#title', '[itemprop="headline"]'];
      for (const selector of titleSelectors) {
        if ($(selector).length > 0) {
          selectors.push({
            name: 'Main Title',
            selector,
            confidence: $(selector).length,
            type: 'title'
          });
          break;
        }
      }

      // Detect content selector
      const contentSelectors = [
        '.content', '#content', '.main-content', '#main',
        'article', '.post-content', '.entry-content',
        '[role="main"]', '.container .row',
        '.prose', '.markdown-body'
      ];

      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0 && element.text().length > 200) {
          selectors.push({
            name: 'Main Content',
            selector,
            confidence: element.text().length,
            type: 'content'
          });
          break;
        }
      }

      // Detect navigation
      if ($('nav, .nav, .navigation, .menu, #menu').length > 0) {
        selectors.push({
          name: 'Navigation',
          selector: 'nav, .nav, .navigation, .menu, #menu',
          confidence: 1,
          type: 'navigation'
        });
      }

      // Detect footer
      if ($('footer, .footer, #footer').length > 0) {
        selectors.push({
          name: 'Footer',
          selector: 'footer, .footer, #footer',
          confidence: 1,
          type: 'footer'
        });
      }

      await page.close();

      return {
        success: true,
        selectors,
        mode: hasDynamicContent ? 'dynamic' : 'static'
      };
    } catch (error) {
      console.error('Analysis failed:', error);
      return { success: false };
    }
  }

  async scrape(url: string, options: ScrapeOptions = {}, jobId?: string): Promise<ScrapeResult> {
    try {
      // Check for duplicates before scraping
      console.log(`Checking for duplicates for URL: ${url}`);
      const duplicateCheck = await deduplicationService.checkUrlDuplicate(url);

      if (duplicateCheck.isDuplicate) {
        console.log(`Duplicate URL detected: ${url} (Existing ID: ${duplicateCheck.existingId})`);

        // Log duplicate prevention
        await deduplicationService.logDuplicatePrevention(
          url,
          duplicateCheck.reason || 'exact_url_match',
          duplicateCheck.existingId
        );

        return {
          success: false,
          title: '',
          content: '',
          url,
          error: `Duplicate content detected: ${duplicateCheck.reason}`
        };
      }

      const browser = await this.initBrowser();
      const page = await browser.newPage();

      // Set up user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to page
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: options.timeout || 30000
      });

      // Wait for selector if specified
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
      }

      // Execute custom JavaScript if provided
      if (options.jsCode) {
        await page.evaluate(options.jsCode);
      }

      // Remove overlay elements if requested
      if (options.removeOverlayElements) {
        await page.evaluate(() => {
          const overlays = document.querySelectorAll(
            'div[style*="position: fixed"], div[style*="position: absolute"], .modal, .popup, .overlay, .cookie-banner'
          );
          overlays.forEach(el => el.remove());
        });
      }

      // Extract content
      let title = await page.title();
      let content = '';
      let description = '';
      let links: string[] = [];
      let images: string[] = [];

      if (options.customSelectors?.title) {
        title = await page.$eval(options.customSelectors.title, el => (el as any).textContent?.trim() || title);
      }

      if (options.customSelectors?.content) {
        content = await page.$eval(options.customSelectors.content, el => (el as any).innerText || '');
      } else if (options.selector) {
        content = await page.$eval(options.selector, el => (el as any).innerText || '');
      } else {
        // Default content extraction
        content = await page.evaluate(() => {
          // Try to find main content
          const mainContent = document.querySelector('main, article, .content, .main-content, #content') ||
                           document.querySelector('[role="main"]');

          if (mainContent) {
            return mainContent.innerText;
          }

          // Fallback to body
          return document.body.innerText;
        });
      }

      // Extract meta description
      description = await page.$eval('head meta[name="description"]', (el: any) =>
        el?.getAttribute('content') || ''
      ).catch(() => '');

      // Extract links if requested
      if (options.extractLinks) {
        links = await page.evaluate(() => {
          const linkElements = document.querySelectorAll('a[href]');
          return Array.from(linkElements)
            .map((link: any) => link.href)
            .filter(href => href.startsWith('http'));
        });
      }

      // Extract images if requested
      if (options.extractImages) {
        images = await page.evaluate(() => {
          const imgElements = document.querySelectorAll('img[src]');
          return Array.from(imgElements)
            .map((img: any) => img.src)
            .filter(src => src.startsWith('http'));
        });
      }

      // Convert to markdown-like format
      const markdown = this.convertToMarkdown(title, content, links, images);

      // Filter by word count threshold
      if (options.wordCountThreshold && content.split(' ').length < options.wordCountThreshold) {
        content = '';
      }

      await page.close();

      // Additional content deduplication check after scraping
      const contentDuplicateCheck = await deduplicationService.checkContentDuplicate(
        title,
        content,
        description
      );

      if (contentDuplicateCheck.isDuplicate) {
        console.log(`Duplicate content detected by similarity: ${url} (Similar to: ${contentDuplicateCheck.existingId})`);

        // Log duplicate prevention
        await deduplicationService.logDuplicatePrevention(
          url,
          contentDuplicateCheck.reason || 'similarity_threshold',
          contentDuplicateCheck.existingId
        );

        return {
          success: false,
          title: title || 'No title',
          content: content || '',
          description,
          markdown,
          links,
          images,
          url,
          error: `Duplicate content detected: ${contentDuplicateCheck.reason}`
        };
      }

      // Save scraped content with deduplication metadata
      const saveResult = await deduplicationService.saveScrapedContent(
        {
          url,
          title: title || 'No title',
          content: content || '',
          description,
          metadata: {
            wordCount: content.split(' ').length,
            hasDynamicContent: !!window.__INITIAL_STATE__,
            extractedAt: new Date().toISOString(),
            markdown,
            links,
            images
          }
        },
        undefined, // Embeddings will be generated separately if needed
        jobId
      );

      if (!saveResult.success) {
        console.error('Failed to save scraped content:', saveResult.error);
      }

      return {
        success: true,
        title: title || 'No title',
        content: content || '',
        description,
        markdown,
        links,
        images,
        url,
        metadata: {
          wordCount: content.split(' ').length,
          hasDynamicContent: await page.evaluate(() => !!window.__INITIAL_STATE__),
          extractedAt: new Date().toISOString(),
          savedId: saveResult.id
        }
      };
    } catch (error) {
      console.error('Scraping failed:', error);
      return {
        success: false,
        title: 'Error',
        content: '',
        url,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async batchScrape(urls: string[], options: ScrapeOptions = {}): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];

    for (const url of urls) {
      const result = await this.scrape(url, options);
      results.push(result);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  private convertToMarkdown(title: string, content: string, links: string[] = [], images: string[] = []): string {
    let markdown = `# ${title}\n\n`;

    // Add content
    const paragraphs = content.split('\n\n');
    paragraphs.forEach(p => {
      if (p.trim()) {
        markdown += `${p.trim()}\n\n`;
      }
    });

    // Add images if any
    if (images.length > 0) {
      markdown += '\n## Images\n\n';
      images.forEach(img => {
        markdown += `![Image](${img})\n\n`;
      });
    }

    // Add links if any
    if (links.length > 0) {
      markdown += '\n## Links\n\n';
      links.forEach(link => {
        markdown += `- [Link](${link})\n`;
      });
    }

    return markdown;
  }

  async generateEmbeddings(content: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: content
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Embedding creation error:', error);
      throw error;
    }
  }

  async saveToDatabase(result: ScrapeResult, projectId?: string, siteId?: string): Promise<string> {
    try {
      // Save to scrape_embeddings table
      const embeddingResult = await lsembPool.query(`
        INSERT INTO scrape_embeddings
        (content, metadata, source_url, title, category, project_id, site_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        result.content,
        JSON.stringify(result.metadata),
        result.url,
        result.title,
        'general',
        projectId || null,
        siteId || null
      ]);

      const itemId = embeddingResult.rows[0].id;

      // Generate and save embeddings if enabled
      if (this.openai && result.content) {
        try {
          const embedding = await this.generateEmbeddings(result.content);
          await lsembPool.query(`
            UPDATE scrape_embeddings
            SET embedding = $1, embedding_generated = true
            WHERE id = $2
          `, [embedding, itemId]);
        } catch (error) {
          console.error('Failed to generate embedding:', error);
        }
      }

      return itemId;
    } catch (error) {
      console.error('Database save error:', error);
      throw error;
    }
  }

  async createJob(urls: string[], options: ScrapeOptions = {}, projectId?: string, siteId?: string): Promise<string> {
    const jobId = uuidv4();

    // Save job to Redis
    await redis.setex(`scrape-job:${jobId}`, 3600, JSON.stringify({
      id: jobId,
      urls,
      options,
      projectId,
      siteId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      results: []
    }));

    return jobId;
  }

  async processJob(jobId: string): Promise<void> {
    const jobData = await redis.get(`scrape-job:${jobId}`);
    if (!jobData) return;

    const job = JSON.parse(jobData);

    // Update status to processing
    job.status = 'processing';
    await redis.setex(`scrape-job:${jobId}`, 3600, JSON.stringify(job));

    // Emit job update via Socket.IO
    if (this.io) {
      this.io.emit('scrape-job-update', {
        jobId,
        status: 'processing',
        progress: 0
      });
    }

    const results = [];
    const totalUrls = job.urls.length;

    for (let i = 0; i < totalUrls; i++) {
      const url = job.urls[i];

      try {
        const result = await this.scrape(url, job.options);
        const itemId = await this.saveToDatabase(result, job.projectId, job.siteId);

        results.push({
          ...result,
          id: itemId
        });

        // Update progress
        const progress = Math.round(((i + 1) / totalUrls) * 100);

        if (this.io) {
          this.io.emit('scrape-job-update', {
            jobId,
            status: 'processing',
            progress,
            currentUrl: url,
            completed: i + 1,
            total: totalUrls
          });
        }

        // Update Redis
        job.status = 'processing';
        job.progress = progress;
        job.results = results;
        await redis.setex(`scrape-job:${jobId}`, 3600, JSON.stringify(job));

      } catch (error) {
        console.error(`Failed to scrape ${url}:`, error);
        results.push({
          success: false,
          url,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Mark job as completed
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.progress = 100;
    await redis.setex(`scrape-job:${jobId}`, 86400, JSON.stringify(job));

    // Emit completion
    if (this.io) {
      this.io.emit('scrape-job-complete', {
        jobId,
        status: 'completed',
        results
      });
    }
  }

  async getJobStatus(jobId: string): Promise<any> {
    const jobData = await redis.get(`scrape-job:${jobId}`);
    return jobData ? JSON.parse(jobData) : null;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Export singleton instance
export const webScraperService = new WebScraperService();