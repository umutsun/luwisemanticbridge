import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import { URL } from 'url';
import { pgPool } from '../server';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { pythonService, CrawlOptions as PythonCrawlOptions } from './python-integration.service';
import { logger } from '../utils/logger';

interface ScrapeOptions {
  mode?: 'static' | 'dynamic' | 'auto' | 'ai';  // Added 'ai' mode for Python Crawl4AI
  maxDepth?: number;
  maxPages?: number;
  followLinks?: boolean;
  respectRobotsTxt?: boolean;
  generateEmbeddings?: boolean;
  saveToDb?: boolean;
  includeImages?: boolean;
  includePdfs?: boolean;
  waitForSelector?: string;
  customHeaders?: Record<string, string>;
  excludePatterns?: string[];
  includePatterns?: string[];
  customSelectors?: string[]; // Custom CSS selectors to extract content
  prioritySelectors?: string[]; // High priority selectors (checked first)
  extractMode?: 'all' | 'first' | 'best'; // How to handle multiple matching selectors
  // AI-specific options
  extractionPrompt?: string;  // LLM extraction prompt for AI mode
  aiModel?: string;  // AI model to use (gpt-4, claude, etc.)
  aiProvider?: string;  // AI provider (openai, anthropic, etc.)
  usePythonService?: boolean;  // Force use of Python service
}

interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  description?: string;
  keywords?: string;
  author?: string;
  publishDate?: string;
  images?: string[];
  links?: string[];
  metadata?: any;
  chunks?: string[];
  embeddings?: number[][];
  error?: string;
}

interface CrawlState {
  visited: Set<string>;
  queue: string[];
  results: ScrapeResult[];
  errors: string[];
}

export class ScraperService {
  private browser: Browser | null = null;
  private openai: OpenAI | null = null;
  private crawlState: CrawlState = {
    visited: new Set(),
    queue: [],
    results: [],
    errors: []
  };

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  async scrapeWebsite(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult[]> {
    const {
      mode = 'auto',
      maxDepth = 1,
      maxPages = 50,
      followLinks = false,
      respectRobotsTxt = true,
      generateEmbeddings = false,
      saveToDb = false,
      excludePatterns = [],
      includePatterns = []
    } = options;

    try {
      // Check robots.txt if needed
      if (respectRobotsTxt) {
        const canScrape = await this.checkRobotsTxt(url);
        if (!canScrape) {
          throw new Error('Scraping disallowed by robots.txt');
        }
      }

      // Check for sitemap
      const sitemapUrls = await this.getSitemapUrls(url);
      if (sitemapUrls.length > 0 && followLinks) {
        console.log(`Found ${sitemapUrls.length} URLs in sitemap`);
        this.crawlState.queue = sitemapUrls.slice(0, maxPages);
      } else {
        this.crawlState.queue = [url];
      }

      // Process URLs
      while (this.crawlState.queue.length > 0 && this.crawlState.results.length < maxPages) {
        const currentUrl = this.crawlState.queue.shift()!;
        
        if (this.crawlState.visited.has(currentUrl)) {
          continue;
        }

        // Check URL patterns
        if (!this.shouldScrapeUrl(currentUrl, includePatterns, excludePatterns)) {
          continue;
        }

        this.crawlState.visited.add(currentUrl);

        try {
          const result = await this.scrapePage(currentUrl, options);
          this.crawlState.results.push(result);

          // Extract and queue new links if following links
          if (followLinks && result.links && this.crawlState.visited.size < maxPages) {
            const newLinks = result.links
              .filter(link => !this.crawlState.visited.has(link))
              .filter(link => this.isSameDomain(url, link))
              .slice(0, maxPages - this.crawlState.visited.size);
            
            this.crawlState.queue.push(...newLinks);
          }

          // Generate embeddings if requested
          if (generateEmbeddings && result.chunks) {
            result.embeddings = await this.generateEmbeddings(result.chunks);
          }

          // Save to database if requested
          if (saveToDb) {
            await this.saveToDatabase(result);
          }

        } catch (error: any) {
          console.error(`Error scraping ${currentUrl}:`, error.message);
          this.crawlState.errors.push(`${currentUrl}: ${error.message}`);
        }
      }

      return this.crawlState.results;

    } finally {
      // Clean up browser if opened
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  private async scrapePage(url: string, options: ScrapeOptions): Promise<ScrapeResult> {
    const { mode = 'auto', waitForSelector, usePythonService } = options;

    // Try AI-powered scraping first if requested or mode is 'ai'
    if (mode === 'ai' || usePythonService) {
      try {
        return await this.scrapeWithAI(url, options);
      } catch (error) {
        logger.warn(`AI scraping failed for ${url}, falling back to traditional methods:`, error);
      }
    }

    // Check if Python service is available for better scraping
    if (await pythonService.isPythonServiceAvailable() && mode === 'auto') {
      try {
        return await this.scrapeWithAI(url, options);
      } catch (error) {
        logger.info('Python service failed, using Node.js scraper');
      }
    }

    // Fallback to traditional scraping
    const useDynamic = this.shouldUseDynamic(url, mode);

    if (useDynamic) {
      return await this.scrapeDynamic(url, options);
    } else {
      return await this.scrapeStatic(url, options);
    }
  }

  private async scrapeStatic(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000,
      maxRedirects: 5
    });

    return this.parseHtml(url, response.data, options);
  }

  private async scrapeDynamic(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const { waitForSelector, customSelectors } = options;
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    const page = await this.browser.newPage();
    
    try {
      // Set viewport and user agent
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
      });

      // Navigate to page
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Wait for specific selector if provided
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      }
      
      // Wait for custom selectors if provided
      if (customSelectors && customSelectors.length > 0) {
        for (const selector of customSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
          } catch {
            // Continue if selector not found
          }
        }
      }

      // Auto-scroll to load lazy content
      await this.autoScroll(page);

      // Get the HTML content
      const html = await page.content();
      const title = await page.title();

      // Get all links on the page
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => (a as HTMLAnchorElement).href)
          .filter(href => href.startsWith('http'));
      });

      const result = await this.parseHtml(url, html, options);
      result.title = title || result.title;
      result.links = links;

      return result;

    } finally {
      await page.close();
    }
  }

  private async parseHtml(url: string, html: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const $ = cheerio.load(html);
    const { customSelectors = [], prioritySelectors = [], extractMode = 'best' } = options;
    
    // Remove non-content elements
    $('script, style, noscript, iframe, svg, img').remove();
    $('[style*="display:none"], [style*="display: none"]').remove();
    $('[aria-hidden="true"]').remove();
    $('nav, header, footer, aside, .sidebar, .menu, .navigation').remove();
    $('.cookie, .advertisement, .ads, .social, .share, .comments').remove();

    // Extract metadata
    const title = $('title').text() || $('h1').first().text() || 'Untitled';
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || '';
    const keywords = $('meta[name="keywords"]').attr('content') || '';
    const author = $('meta[name="author"]').attr('content') || 
                  $('meta[property="article:author"]').attr('content') || '';
    const publishDate = $('meta[property="article:published_time"]').attr('content') || 
                       $('time[datetime]').first().attr('datetime') || '';

    // Extract main content
    let content = '';
    let contentParts: string[] = [];
    
    // Combine all selectors with priority
    const allSelectors = [
      ...prioritySelectors,
      ...customSelectors,
      // MUI Grid specific selectors
      '.MuiGrid-root.MuiGrid-item',
      '.MuiGrid-container',
      '[class*="MuiGrid-grid-"]',
      // Common content selectors
      'article', 'main', '[role="main"]', '.content', '#content',
      '.post', '.entry-content', '.article-content', '.article-body',
      '.post-content', '.page-content', '.markdown-body', '.prose'
    ];

    if (extractMode === 'all') {
      // Extract from all matching selectors
      for (const selector of allSelectors) {
        $(selector).each((_, el) => {
          const text = this.extractTextContent($, $(el));
          if (text && text.length > 50) {
            contentParts.push(text);
          }
        });
      }
      content = contentParts.join('\n\n');
    } else if (extractMode === 'first') {
      // Use first matching selector
      for (const selector of allSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          content = this.extractTextContent($, element);
          if (content && content.length > 50) break;
        }
      }
    } else {
      // 'best' mode - find selector with most content
      let bestContent = '';
      let bestLength = 0;
      
      for (const selector of allSelectors) {
        $(selector).each((_, el) => {
          const text = this.extractTextContent($, $(el));
          if (text && text.length > bestLength) {
            bestContent = text;
            bestLength = text.length;
          }
        });
      }
      content = bestContent;
    }

    // Fallback to body text if no main content found
    if (!content || content.length < 200) {
      content = $('body').text();
    }

    // Clean content
    content = this.cleanText(content);

    // Extract all links
    const links = $('a[href]')
      .map((_, el) => {
        const href = $(el).attr('href');
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
          try {
            return new URL(href, url).href;
          } catch {
            return null;
          }
        }
        return null;
      })
      .get()
      .filter(Boolean) as string[];

    // Extract images
    const images = $('img[src]')
      .map((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          try {
            return new URL(src, url).href;
          } catch {
            return null;
          }
        }
        return null;
      })
      .get()
      .filter(Boolean) as string[];

    // Create chunks
    const chunks = await this.createChunks(content);

    return {
      url,
      title,
      content,
      description,
      keywords,
      author,
      publishDate,
      images,
      links,
      chunks,
      metadata: {
        contentLength: content.length,
        chunksCount: chunks.length,
        linksCount: links.length,
        imagesCount: images.length
      }
    };
  }

  private extractTextContent($: cheerio.CheerioAPI, element: any): string {
    const texts: string[] = [];
    
    element.find('*').each((_: number, el: any) => {
      const $el = $(el);
      const tagName = el.name?.toLowerCase();
      
      if (!tagName || ['script', 'style', 'noscript'].includes(tagName)) {
        return;
      }
      
      const text = $el.clone().children().remove().end().text().trim();
      
      if (text) {
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
          texts.push(`\n\n${text}\n`);
        } else if (tagName === 'p' && text.length > 20) {
          texts.push(`${text}\n`);
        } else if (tagName === 'li') {
          texts.push(`• ${text}\n`);
        } else if (text.length > 10) {
          texts.push(text);
        }
      }
    });
    
    return texts.join(' ');
  }

  private cleanText(text: string): string {
    return text
      .replace(/\t+/g, ' ')
      .replace(/[ ]+/g, ' ')
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/^\s*\n/gm, '')
      .trim();
  }

  private async createChunks(text: string): Promise<string[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1500,
      chunkOverlap: 200,
      separators: ['\n\n\n', '\n\n', '\n', '. ', ', ', ' ', '']
    });
    
    return await splitter.splitText(text);
  }

  private async generateEmbeddings(chunks: string[]): Promise<number[][]> {
    if (!this.openai) {
      // Use local embeddings
      return chunks.map(chunk => this.generateLocalEmbedding(chunk));
    }

    const embeddings: number[][] = [];
    
    for (const chunk of chunks) {
      try {
        const response = await this.openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: chunk
        });
        embeddings.push(response.data[0].embedding);
      } catch (error) {
        // Fallback to local embedding
        embeddings.push(this.generateLocalEmbedding(chunk));
      }
    }
    
    return embeddings;
  }

  private generateLocalEmbedding(text: string): number[] {
    const embedding = new Array(1536).fill(0);
    
    for (let i = 0; i < Math.min(text.length, 2000); i++) {
      const charCode = text.charCodeAt(i);
      const index = (charCode * (i + 1)) % embedding.length;
      embedding[index] += Math.sin(charCode * 0.01 + i * 0.001);
    }
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / magnitude;
      }
    }
    
    return embedding;
  }

  private async scrapeWithAI(url: string, options: ScrapeOptions): Promise<ScrapeResult> {
    try {
      // Convert options to Python service format
      const pythonOptions: PythonCrawlOptions = {
        mode: options.extractionPrompt ? 'llm' : 'auto',
        extractionPrompt: options.extractionPrompt,
        model: options.aiModel || 'gpt-4',
        provider: options.aiProvider || 'openai',
        maxDepth: options.maxDepth || 1,
        followLinks: options.followLinks || false,
        contentType: 'all',
        jsCode: undefined,
        waitFor: options.waitForSelector,
        screenshot: false,
        timeout: 30
      };

      // Call Python Crawl4AI service
      const result = await pythonService.crawlWithAI(url, pythonOptions);

      // Convert Python result to our format
      const scrapedResult: ScrapeResult = {
        url: result.url,
        title: result.title || '',
        content: result.content || result.markdown || '',
        description: result.metadata?.description,
        keywords: result.metadata?.keywords,
        author: result.metadata?.author,
        publishDate: result.metadata?.published_date,
        images: result.images,
        links: result.links,
        metadata: result.metadata,
        chunks: undefined,
        embeddings: undefined
      };

      // Split content into chunks if needed
      if (options.generateEmbeddings && scrapedResult.content) {
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
        });
        scrapedResult.chunks = await textSplitter.splitText(scrapedResult.content);
      }

      return scrapedResult;

    } catch (error) {
      logger.error(`AI scraping failed for ${url}:`, error);
      throw error;
    }
  }

  private async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  private async getSitemapUrls(url: string): Promise<string[]> {
    const urls: string[] = [];
    
    try {
      const baseUrl = new URL(url);
      const sitemapUrl = `${baseUrl.protocol}//${baseUrl.host}/sitemap.xml`;
      
      const response = await axios.get(sitemapUrl, { timeout: 10000 });
      const $ = cheerio.load(response.data, { xmlMode: true });
      
      $('url > loc').each((_, el) => {
        const loc = $(el).text();
        if (loc) {
          urls.push(loc);
        }
      });
      
      // Also check for sitemap index
      const sitemapIndexElements = $('sitemap > loc').get();
      for (const el of sitemapIndexElements) {
        const sitemapLoc = $(el).text();
        if (sitemapLoc) {
          try {
            const subResponse = await axios.get(sitemapLoc, { timeout: 10000 });
            const sub$ = cheerio.load(subResponse.data, { xmlMode: true });
            sub$('url > loc').each((_, subEl) => {
              const loc = sub$(subEl).text();
              if (loc) {
                urls.push(loc);
              }
            });
          } catch {
            // Ignore sub-sitemap errors
          }
        }
      }
      
    } catch {
      // No sitemap found or error accessing it
    }
    
    return urls;
  }

  private async checkRobotsTxt(url: string): Promise<boolean> {
    try {
      const baseUrl = new URL(url);
      const robotsUrl = `${baseUrl.protocol}//${baseUrl.host}/robots.txt`;
      
      const response = await axios.get(robotsUrl, { timeout: 5000 });
      const robotsTxt = response.data;
      
      // Simple robots.txt parser
      const lines = robotsTxt.split('\n');
      let userAgentMatch = false;
      let allowed = true;
      
      for (const line of lines) {
        const trimmed = line.trim().toLowerCase();
        
        if (trimmed.startsWith('user-agent:')) {
          const agent = trimmed.substring(11).trim();
          userAgentMatch = agent === '*' || agent === 'bot';
        }
        
        if (userAgentMatch && trimmed.startsWith('disallow:')) {
          const path = trimmed.substring(9).trim();
          if (path === '/' || url.includes(path)) {
            allowed = false;
            break;
          }
        }
      }
      
      return allowed;
    } catch {
      // If robots.txt doesn't exist or can't be accessed, assume allowed
      return true;
    }
  }

  private shouldUseDynamic(url: string, mode: string): boolean {
    if (mode === 'dynamic') return true;
    if (mode === 'static') return false;
    
    // Auto mode - detect if dynamic scraping is needed
    const dynamicSites = [
      'gib.gov.tr',
      'e-devlet.turkiye.gov.tr',
      'twitter.com',
      'x.com',
      'instagram.com',
      'facebook.com',
      'linkedin.com',
      'youtube.com',
      'medium.com',
      'dev.to',
      'react',
      'angular',
      'vue',
      'nextjs'
    ];
    
    return dynamicSites.some(site => url.toLowerCase().includes(site));
  }

  private shouldScrapeUrl(url: string, includePatterns: string[], excludePatterns: string[]): boolean {
    // Check exclude patterns first
    for (const pattern of excludePatterns) {
      if (url.includes(pattern)) {
        return false;
      }
    }
    
    // If include patterns are specified, URL must match at least one
    if (includePatterns.length > 0) {
      return includePatterns.some(pattern => url.includes(pattern));
    }
    
    // Default to true if no patterns specified
    return true;
  }

  private isSameDomain(originalUrl: string, newUrl: string): boolean {
    try {
      const original = new URL(originalUrl);
      const newParsed = new URL(newUrl);
      return original.hostname === newParsed.hostname;
    } catch {
      return false;
    }
  }

  private async saveToDatabase(result: ScrapeResult): Promise<void> {
    try {
      await pgPool.query(`
        INSERT INTO scraped_data (
          url, title, content, description, keywords,
          metadata, content_chunks, chunk_count, content_length
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (url) 
        DO UPDATE SET 
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          description = EXCLUDED.description,
          keywords = EXCLUDED.keywords,
          metadata = EXCLUDED.metadata,
          content_chunks = EXCLUDED.content_chunks,
          chunk_count = EXCLUDED.chunk_count,
          content_length = EXCLUDED.content_length,
          updated_at = CURRENT_TIMESTAMP
      `, [
        result.url,
        result.title,
        result.content.substring(0, 100000),
        result.description,
        result.keywords,
        JSON.stringify(result.metadata),
        result.chunks,
        result.chunks?.length || 0,
        result.content.length
      ]);
    } catch (error) {
      console.error('Error saving to database:', error);
    }
  }

  async scrapeBatch(urls: string[], options: ScrapeOptions = {}): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    
    for (const url of urls) {
      try {
        const pageResults = await this.scrapeWebsite(url, { ...options, maxDepth: 1 });
        results.push(...pageResults);
      } catch (error: any) {
        console.error(`Error scraping ${url}:`, error.message);
        results.push({
          url,
          title: 'Error',
          content: '',
          error: error.message
        });
      }
    }
    
    return results;
  }

  async getPerformanceMetrics(): Promise<any> {
    try {
      // Get basic metrics from database
      const result = await pgPool.query(`
        SELECT
          COUNT(*) as total_scrapes,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as scrapes_24h,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as scrapes_7d,
          AVG(content_length) as avg_content_length,
          MAX(created_at) as last_scrape
        FROM scraped_data
      `);

      const metrics = result.rows[0];

      // Get system performance info
      const memoryUsage = process.memoryUsage();

      return {
        totalScrapes: parseInt(metrics.total_scrapes || 0),
        scrapes24h: parseInt(metrics.scrapes_24h || 0),
        scrapes7d: parseInt(metrics.scrapes_7d || 0),
        avgContentLength: parseFloat(metrics.avg_content_length || 0),
        lastScrape: metrics.last_scrape || null,
        uptime: process.uptime(),
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        },
        cpu: process.cpuUsage(),
        performance: {
          avgResponseTime: 1500, // Mock data
          successRate: 95.5, // Mock data
          errorRate: 4.5 // Mock data
        }
      };
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      return {
        totalScrapes: 0,
        scrapes24h: 0,
        scrapes7d: 0,
        avgContentLength: 0,
        lastScrape: null,
        uptime: process.uptime(),
        memory: {
          used: 0,
          total: 0,
          external: 0
        },
        cpu: process.cpuUsage(),
        performance: {
          avgResponseTime: 0,
          successRate: 0,
          errorRate: 0
        }
      };
    }
  }

  async getBasicStats(): Promise<any> {
    try {
      const [totalResult, projectsResult, sitesResult] = await Promise.all([
        pgPool.query('SELECT COUNT(*) FROM scraped_data'),
        pgPool.query('SELECT COUNT(*) FROM scraping_projects'),
        pgPool.query('SELECT COUNT(*) FROM project_sites')
      ]);

      return {
        totalItems: parseInt(totalResult.rows[0].count),
        processedItems: parseInt(totalResult.rows[0].count),
        totalProjects: parseInt(projectsResult.rows[0].count),
        totalSites: parseInt(sitesResult.rows[0].count),
        itemsLast24h: 0 // TODO: Implement this
      };
    } catch (error) {
      console.error('Error getting basic stats:', error);
      return {
        totalItems: 0,
        processedItems: 0,
        totalProjects: 0,
        totalSites: 0,
        itemsLast24h: 0
      };
    }
  }

  async getPerformanceMetrics(): Promise<any> {
    try {
      // Get basic metrics from database
      const result = await pgPool.query(`
        SELECT
          COUNT(*) as total_scrapes,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as scrapes_24h,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as scrapes_7d,
          AVG(content_length) as avg_content_length,
          MAX(created_at) as last_scrape
        FROM scraped_data
      `);

      const metrics = result.rows[0];

      // Get system performance info
      const memoryUsage = process.memoryUsage();

      return {
        totalScrapes: parseInt(metrics.total_scrapes || 0),
        scrapes24h: parseInt(metrics.scrapes_24h || 0),
        scrapes7d: parseInt(metrics.scrapes_7d || 0),
        avgContentLength: parseFloat(metrics.avg_content_length || 0),
        lastScrape: metrics.last_scrape || null,
        uptime: process.uptime(),
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        },
        cpu: process.cpuUsage(),
        performance: {
          avgResponseTime: 1500, // Mock data
          successRate: 95.5, // Mock data
          errorRate: 4.5 // Mock data
        }
      };
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      return {
        totalScrapes: 0,
        scrapes24h: 0,
        scrapes7d: 0,
        avgContentLength: 0,
        lastScrape: null,
        uptime: process.uptime(),
        memory: {
          used: 0,
          total: 0,
          external: 0
        },
        cpu: process.cpuUsage(),
        performance: {
          avgResponseTime: 0,
          successRate: 0,
          errorRate: 0
        }
      };
    }
  }

  async getBasicStats(): Promise<any> {
    try {
      const [totalResult, projectsResult, sitesResult] = await Promise.all([
        pgPool.query('SELECT COUNT(*) FROM scraped_data'),
        pgPool.query('SELECT COUNT(*) FROM scraping_projects'),
        pgPool.query('SELECT COUNT(*) FROM project_sites')
      ]);

      return {
        totalItems: parseInt(totalResult.rows[0].count),
        processedItems: parseInt(totalResult.rows[0].count),
        totalProjects: parseInt(projectsResult.rows[0].count),
        totalSites: parseInt(sitesResult.rows[0].count),
        itemsLast24h: 0 // TODO: Implement this
      };
    } catch (error) {
      console.error('Error getting basic stats:', error);
      return {
        totalItems: 0,
        processedItems: 0,
        totalProjects: 0,
        totalSites: 0,
        itemsLast24h: 0
      };
    }
  }
}

export default new ScraperService();