import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium, Browser, Page } from 'playwright';
import { URL } from 'url';
import { pgPool } from '../server';
import { initializeRedis } from '../config/redis';
import { cacheReliabilityService } from './cache-reliability.service';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import crypto from 'crypto';

interface ScrapeOptions {
  mode?: 'static' | 'dynamic' | 'auto';
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
  customSelectors?: string[];
  prioritySelectors?: string[];
  extractMode?: 'all' | 'first' | 'best';
  useCache?: boolean;
  cacheTTL?: number;
  llmFiltering?: boolean;
  entityExtraction?: boolean;
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
  entities?: ExtractedEntity[];
  llmAnalysis?: LLMAnalysis;
  cacheHit?: boolean;
  processingTime?: number;
}

interface ExtractedEntity {
  type: 'person' | 'organization' | 'location' | 'product' | 'date' | 'custom';
  name: string;
  confidence: number;
  context?: string;
  metadata?: any;
}

interface LLMAnalysis {
  summary: string;
  relevanceScore: number;
  topics: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  qualityScore: number;
  isHighQuality: boolean;
  extractedEntities: ExtractedEntity[];
  recommendedActions: string[];
}

interface CacheEntry {
  data: ScrapeResult;
  timestamp: number;
  ttl: number;
  hash: string;
  accessCount: number;
  lastAccessed: number;
}

interface ScrapeJob {
  id: string;
  url: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progress: number;
  result?: ScrapeResult[];
  error?: string;
  options: ScrapeOptions;
  createdAt: string;
  updatedAt: string;
  processingStats: {
    totalPages: number;
    cacheHits: number;
    cacheMisses: number;
    llmProcessed: number;
    avgProcessingTime: number;
  };
}

export class WebScraperService {
  private browser: Browser | null = null;
  private openai: OpenAI | null = null;
  private redis: any = null;
  private cacheEnabled: boolean = true;
  private defaultCacheTTL: number = 3600; // 1 hour
  private llmFilteringEnabled: boolean = true;

  // Performance tracking
  private performanceMetrics = {
    totalScrapes: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgResponseTime: 0,
    errorCount: 0,
    llmProcessed: 0,
    databaseWrites: 0
  };

  constructor() {
    this.initializeServices();
  }

  private async initializeServices() {
    try {
      // Initialize OpenAI if API key is available
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        console.log(' OpenAI initialized for intelligent scraping');
      }

      // Initialize Redis
      try {
        this.redis = await initializeRedis();
        if (this.redis && this.redis.status === 'ready') {
          console.log(' Redis initialized for intelligent scraper caching');
        } else {
          console.log('️ Redis not available, caching disabled');
          this.cacheEnabled = false;
        }
      } catch (error) {
        console.warn('️ Failed to initialize Redis, caching disabled:', error);
        this.cacheEnabled = false;
      }
    } catch (error) {
      console.error(' Failed to initialize intelligent scraper services:', error);
    }
  }

  async scrapeWebsite(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult[]> {
    const startTime = Date.now();
    const {
      mode = 'auto',
      maxDepth = 1,
      maxPages = 50,
      followLinks = false,
      respectRobotsTxt = true,
      generateEmbeddings = false,
      saveToDb = false,
      excludePatterns = [],
      includePatterns = [],
      useCache = true,
      cacheTTL = this.defaultCacheTTL,
      llmFiltering = this.llmFilteringEnabled,
      entityExtraction = true
    } = options;

    const results: ScrapeResult[] = [];
    const visited = new Set<string>();
    const queue = [url];

    console.log(` Starting enhanced scrape of ${url} with caching: ${useCache}, LLM filtering: ${llmFiltering}`);

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
        console.log(` Found ${sitemapUrls.length} URLs in sitemap`);
        queue.push(...sitemapUrls.slice(0, maxPages - 1));
      }

      // Process URLs
      while (queue.length > 0 && results.length < maxPages) {
        const currentUrl = queue.shift()!;

        if (visited.has(currentUrl)) {
          continue;
        }

        // Check URL patterns
        if (!this.shouldScrapeUrl(currentUrl, includePatterns, excludePatterns)) {
          continue;
        }

        visited.add(currentUrl);
        const pageStartTime = Date.now();

        try {
          // Check cache first
          let result: ScrapeResult;
          let cacheHit = false;

          if (useCache && this.cacheEnabled) {
            const cachedResult = await this.getFromCache(currentUrl, options);
            if (cachedResult) {
              result = cachedResult;
              result.cacheHit = true;
              cacheHit = true;
              this.performanceMetrics.cacheHits++;
              console.log(` Cache hit for ${currentUrl}`);
            }
          }

          // Scrape if not in cache
          if (!cacheHit) {
            result = await this.scrapePage(currentUrl, options);
            result.cacheHit = false;
            this.performanceMetrics.cacheMisses++;

            // Process with LLM if enabled
            if (llmFiltering && this.openai) {
              result.llmAnalysis = await this.processWithLLM(result);
              this.performanceMetrics.llmProcessed++;

              // Skip low-quality content if LLM filtering is enabled
              if (result.llmAnalysis && result.llmAnalysis.qualityScore < 0.3) {
                console.log(`⏭️ Skipping low-quality content: ${currentUrl} (quality score: ${result.llmAnalysis.qualityScore})`);
                continue;
              }
            }

            // Extract entities if enabled
            if (entityExtraction && this.openai) {
              result.entities = await this.extractEntities(result);
            }

            // Save to cache
            if (useCache && this.cacheEnabled) {
              await this.saveToCache(currentUrl, result, cacheTTL, options);
            }

            // Save to database if requested
            if (saveToDb) {
              await this.saveToScrapeEmbeddings(result);
              this.performanceMetrics.databaseWrites++;
            }
          }

          result.processingTime = Date.now() - pageStartTime;
          results.push(result);

          // Extract and queue new links if following links
          if (followLinks && result.links && visited.size < maxPages) {
            const newLinks = result.links
              .filter(link => !visited.has(link))
              .filter(link => this.isSameDomain(url, link))
              .slice(0, maxPages - visited.size);

            queue.push(...newLinks);
          }

          // Generate embeddings if requested
          if (generateEmbeddings && result.chunks) {
            result.embeddings = await this.generateEmbeddings(result.chunks);
          }

        } catch (error: any) {
          console.error(` Error scraping ${currentUrl}:`, error.message);
          this.performanceMetrics.errorCount++;

          // Add error result for tracking
          results.push({
            url: currentUrl,
            title: 'Error',
            content: '',
            error: error.message,
            processingTime: Date.now() - pageStartTime
          });
        }
      }

      this.performanceMetrics.totalScrapes++;
      const totalTime = Date.now() - startTime;
      this.performanceMetrics.avgResponseTime = (this.performanceMetrics.avgResponseTime + totalTime) / 2;

      console.log(` Enhanced scraping completed: ${results.length} pages in ${totalTime}ms`);
      console.log(` Performance: Cache hits: ${this.performanceMetrics.cacheHits}, Cache misses: ${this.performanceMetrics.cacheMisses}, LLM processed: ${this.performanceMetrics.llmProcessed}`);

      return results;

    } finally {
      // Clean up browser if opened
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  private async getFromCache(url: string, options: ScrapeOptions): Promise<ScrapeResult | null> {
    if (!this.cacheEnabled) return null;

    try {
      const cacheKey = this.generateCacheKey(url, options);

      // Use reliable cache service with fallback
      const result = await cacheReliabilityService.get<CacheEntry>(
        cacheKey,
        null // No fallback for cache - we'll scrape if cache fails
      );

      if (result) {
        // Check TTL
        if (Date.now() - result.timestamp > result.ttl * 1000) {
          await cacheReliabilityService.delete(cacheKey);
          return null;
        }

        // Update access stats
        result.accessCount++;
        result.lastAccessed = Date.now();
        await cacheReliabilityService.set(cacheKey, result, result.ttl);

        return result.data;
      }
    } catch (error) {
      console.warn('️ Cache read error handled by reliability service:', error);
    }

    return null;
  }

  private async saveToCache(url: string, result: ScrapeResult, ttl: number, options: ScrapeOptions): Promise<void> {
    if (!this.cacheEnabled) return;

    try {
      const cacheKey = this.generateCacheKey(url, options);
      const cacheEntry: CacheEntry = {
        data: result,
        timestamp: Date.now(),
        ttl: ttl,
        hash: this.generateContentHash(result.content),
        accessCount: 1,
        lastAccessed: Date.now()
      };

      // Use reliable cache service
      await cacheReliabilityService.set(cacheKey, cacheEntry, ttl);

      // Also save to a global cache index for management (if Redis is available)
      if (this.redis && this.redis.status === 'ready') {
        try {
          const indexKey = 'scraper:cache:index';
          await this.redis.zadd(indexKey, Date.now(), cacheKey);

          // Keep only the most recent 1000 cache entries
          const cacheSize = await this.redis.zcard(indexKey);
          if (cacheSize > 1000) {
            const oldEntries = await this.redis.zrange(indexKey, 0, cacheSize - 1000);
            if (oldEntries.length > 0) {
              await this.redis.zremrangebyrank(indexKey, 0, cacheSize - 1001);
              await this.redis.del(...oldEntries);
            }
          }
        } catch (indexError) {
          // Index management failure doesn't affect main caching
          console.warn('️ Cache index update failed:', indexError);
        }
      }
    } catch (error) {
      console.warn('️ Cache write error handled by reliability service:', error);
    }
  }

  private generateCacheKey(url: string, options: ScrapeOptions): string {
    const optionsHash = crypto
      .createHash('md5')
      .update(JSON.stringify({
        mode: options.mode,
        customSelectors: options.customSelectors,
        extractMode: options.extractMode
      }))
      .digest('hex')
      .substring(0, 8);

    const urlHash = crypto
      .createHash('md5')
      .update(url)
      .digest('hex')
      .substring(0, 16);

    return `scraper:cache:${urlHash}:${optionsHash}`;
  }

  private generateContentHash(content: string): string {
    return crypto
      .createHash('md5')
      .update(content)
      .digest('hex');
  }

  private async processWithLLM(result: ScrapeResult): Promise<LLMAnalysis | null> {
    if (!this.openai) return null;

    try {
      const prompt = `
        Analyze the following scraped content and provide a detailed assessment:

        Title: ${result.title}
        URL: ${result.url}
        Content: ${result.content.substring(0, 2000)}...

        Please provide:
        1. A brief summary (max 100 words)
        2. Relevance score (0-1) for general usefulness
        3. Key topics (max 5)
        4. Sentiment (positive/negative/neutral)
        5. Quality score (0-1) based on:
           - Content uniqueness and value
           - Writing quality
           - Information density
           - Absence of spam/gibberish
        6. Recommended actions (e.g., "save for analysis", "skip similar content", "extract specific data")

        Respond in JSON format with these fields: summary, relevanceScore, topics, sentiment, qualityScore, isHighQuality, recommendedActions
      `;

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an expert content analyzer. Provide objective, accurate assessments of web content quality and relevance."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const analysis = JSON.parse(content);
        analysis.isHighQuality = analysis.qualityScore > 0.6;
        return analysis;
      }
    } catch (error) {
      console.warn('️ LLM processing error:', error);
    }

    return null;
  }

  private async extractEntities(result: ScrapeResult): Promise<ExtractedEntity[]> {
    if (!this.openai) return [];

    try {
      const prompt = `
        Extract key entities from the following content:

        Title: ${result.title}
        Content: ${result.content.substring(0, 1500)}...

        Extract entities in these categories:
        - person (people mentioned)
        - organization (companies, institutions)
        - location (places, addresses)
        - product (products, services)
        - date (dates, times)
        - custom (any other important entities)

        For each entity, provide:
        - type (one of the categories above)
        - name (the entity name)
        - confidence (0-1)
        - context (brief context where it appears)

        Respond in JSON format with an array of entities.
      `;

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are an expert entity extractor. Identify and categorize entities accurately."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.2,
        max_tokens: 800
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn('️ Entity extraction error:', error);
    }

    return [];
  }

  private async saveToScrapeEmbeddings(result: ScrapeResult): Promise<void> {
    if (!result.chunks || result.chunks.length === 0) return;

    try {
      const client = await pgPool.connect();

      try {
        // Generate embeddings for chunks
        const embeddings = await this.generateEmbeddings(result.chunks);

        // Save each chunk with its embedding
        for (let i = 0; i < result.chunks.length; i++) {
          const chunk = result.chunks[i];
          const embedding = embeddings[i];

          await client.query(`
            INSERT INTO scrape_embeddings (
              url, title, content, chunk, chunk_index,
              embedding, metadata, llm_analysis, entities,
              created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (url, chunk_index)
            DO UPDATE SET
              title = EXCLUDED.title,
              content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              metadata = EXCLUDED.metadata,
              llm_analysis = EXCLUDED.llm_analysis,
              entities = EXCLUDED.entities,
              updated_at = CURRENT_TIMESTAMP
          `, [
            result.url,
            result.title,
            result.content,
            chunk,
            i,
              JSON.stringify(embedding),
            JSON.stringify(result.metadata),
            JSON.stringify(result.llmAnalysis),
            JSON.stringify(result.entities)
          ]);
        }

        console.log(` Saved ${result.chunks.length} chunks to scrape_embeddings for ${result.url}`);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(' Error saving to scrape_embeddings:', error);
    }
  }

  // Reuse existing methods from ScraperService
  private async scrapePage(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const { mode = 'auto', waitForSelector } = options;

    // Determine scraping mode
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
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
      });

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      }

      if (customSelectors && customSelectors.length > 0) {
        for (const selector of customSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
          } catch {
            // Continue if selector not found
          }
        }
      }

      await this.autoScroll(page);
      const html = await page.content();
      const title = await page.title();

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

    const title = $('title').text() || $('h1').first().text() || 'Untitled';
    const description = $('meta[name="description"]').attr('content') ||
                       $('meta[property="og:description"]').attr('content') || '';
    const keywords = $('meta[name="keywords"]').attr('content') || '';
    const author = $('meta[name="author"]').attr('content') ||
                  $('meta[property="article:author"]').attr('content') || '';
    const publishDate = $('meta[property="article:published_time"]').attr('content') ||
                       $('time[datetime]').first().attr('datetime') || '';

    let content = '';
    let contentParts: string[] = [];

    const allSelectors = [
      ...prioritySelectors,
      ...customSelectors,
      '.MuiGrid-root.MuiGrid-item',
      '.MuiGrid-container',
      '[class*="MuiGrid-grid-"]',
      'article', 'main', '[role="main"]', '.content', '#content',
      '.post', '.entry-content', '.article-content', '.article-body',
      '.post-content', '.page-content', '.markdown-body', '.prose'
    ];

    if (extractMode === 'all') {
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
      for (const selector of allSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          content = this.extractTextContent($, element);
          if (content && content.length > 50) break;
        }
      }
    } else {
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

    if (!content || content.length < 200) {
      content = $('body').text();
    }

    content = this.cleanText(content);

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

    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / magnitude;
      }
    }

    return embedding;
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
      return true;
    }
  }

  private shouldUseDynamic(url: string, mode: string): boolean {
    if (mode === 'dynamic') return true;
    if (mode === 'static') return false;

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
    for (const pattern of excludePatterns) {
      if (url.includes(pattern)) {
        return false;
      }
    }

    if (includePatterns.length > 0) {
      return includePatterns.some(pattern => url.includes(pattern));
    }

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

  // Public methods for cache management and performance tracking
  async getCacheStats(): Promise<any> {
    if (!this.redis || !this.cacheEnabled) {
      return { cacheEnabled: false };
    }

    try {
      const indexKey = 'scraper:cache:index';
      const cacheSize = await this.redis.zcard(indexKey);
      const cacheMemory = await this.redis.memory('usage', indexKey);

      return {
        cacheEnabled: true,
        cacheSize,
        cacheMemory,
        performanceMetrics: this.performanceMetrics,
        hitRate: this.performanceMetrics.cacheHits / (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) || 0
      };
    } catch (error) {
      return { cacheEnabled: true, error: error.message };
    }
  }

  async clearCache(pattern?: string): Promise<void> {
    if (!this.redis || !this.cacheEnabled) return;

    try {
      if (pattern) {
        const keys = await this.redis.keys(`scraper:cache:*${pattern}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      } else {
        const indexKey = 'scraper:cache:index';
        const cacheKeys = await this.redis.zrange(indexKey, 0, -1);
        if (cacheKeys.length > 0) {
          await this.redis.del(...cacheKeys);
          await this.redis.del(indexKey);
        }
      }
      console.log('️ Cache cleared successfully');
    } catch (error) {
      console.error(' Error clearing cache:', error);
    }
  }

  async createScrapeJob(url: string, options: ScrapeOptions): Promise<ScrapeJob> {
    const job: ScrapeJob = {
      id: crypto.randomUUID(),
      url,
      status: 'pending',
      progress: 0,
      options,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      processingStats: {
        totalPages: 0,
        cacheHits: 0,
        cacheMisses: 0,
        llmProcessed: 0,
        avgProcessingTime: 0
      }
    };

    // Save job to database or cache
    if (this.redis) {
      await this.redis.setex(`scrape:job:${job.id}`, 86400, JSON.stringify(job));
    }

    return job;
  }

  async updateScrapeJob(jobId: string, updates: Partial<ScrapeJob>): Promise<void> {
    if (this.redis) {
      const jobKey = `scrape:job:${jobId}`;
      const jobData = await this.redis.get(jobKey);

      if (jobData) {
        const job: ScrapeJob = JSON.parse(jobData);
        Object.assign(job, updates);
        job.updatedAt = new Date().toISOString();
        await this.redis.setex(jobKey, 86400, JSON.stringify(job));
      }
    }
  }

  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheHitRate: this.performanceMetrics.cacheHits / (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses) || 0,
      errorRate: this.performanceMetrics.errorCount / this.performanceMetrics.totalScrapes || 0
    };
  }
}

export default new WebScraperService();