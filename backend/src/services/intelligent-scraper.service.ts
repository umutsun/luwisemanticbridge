import puppeteer from 'puppeteer';
import { Browser, Page } from 'puppeteer';
import { lsembPool } from '../config/database.config';
import { redis } from '../server';
import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import OpenAI from 'openai';
import { webScraperService } from './web-scraper.service';

interface SiteRoute {
  url: string;
  title: string;
  type: 'homepage' | 'search' | 'category' | 'article' | 'api' | 'other';
  pattern?: string; // URL pattern for dynamic routes
  params?: Record<string, string>;
}

interface SiteStructure {
  baseUrl: string;
  routes: SiteRoute[];
  searchPatterns: string[];
  paginationPatterns: string[];
  contentSelectors: Record<string, string>;
}

interface SemanticSearchRequest {
  query: string;
  projectIds?: string[];
  siteIds?: string[];
  deepSearch?: boolean;
  maxResultsPerSite?: number;
}

interface SearchResult {
  url: string;
  title: string;
  content: string;
  relevanceScore: number;
  siteName: string;
  type: 'exact_match' | 'semantic_match' | 'related';
  metadata?: any;
}

export class IntelligentScraperService {
  private browser: Browser | null = null;
  private openai: OpenAI | null = null;
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

  /**
   * Analyze site structure to understand routing patterns
   */
  async analyzeSiteStructure(baseUrl: string): Promise<SiteStructure> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Extract all links and their patterns
      const links = await page.evaluate(() => {
        const linkElements = document.querySelectorAll('a[href]');
        return Array.from(linkElements)
          .map(link => ({
            href: (link as HTMLAnchorElement).href,
            text: (link as HTMLAnchorElement).textContent?.trim(),
            title: (link as HTMLAnchorElement).getAttribute('title')
          }))
          .filter(link => link.href && link.text);
      });

      // Analyze URL patterns
      const routes: SiteRoute[] = [];
      const searchPatterns: string[] = [];
      const paginationPatterns: string[] = [];

      // Categorize routes
      for (const link of links) {
        const url = new URL(link.href);
        const pathname = url.pathname;

        // Identify search pages
        if (pathname.includes('/search') || pathname.includes('/q=') ||
            pathname.includes('/query') || url.searchParams.has('q') ||
            url.searchParams.has('search') || url.searchParams.has('query')) {
          searchPatterns.push(link.href);
          routes.push({
            url: link.href,
            title: link.text || link.title || 'Search',
            type: 'search'
          });
        }
        // Identify category pages
        else if (pathname.includes('/category') || pathname.includes('/tag') ||
                 pathname.includes('/topic') || pathname.split('/').length === 2) {
          routes.push({
            url: link.href,
            title: link.text || link.title || 'Category',
            type: 'category'
          });
        }
        // Identify article pages
        else if (pathname.includes('/article') || pathname.includes('/post') ||
                 pathname.includes('/story') || pathname.split('/').length > 3) {
          routes.push({
            url: link.href,
            title: link.text || link.title || 'Article',
            type: 'article'
          });
        }
        // API endpoints
        else if (pathname.startsWith('/api') || pathname.startsWith('/v1') ||
                 pathname.startsWith('/v2')) {
          routes.push({
            url: link.href,
            title: link.text || link.title || 'API',
            type: 'api'
          });
        }
        else {
          routes.push({
            url: link.href,
            title: link.text || link.title || 'Page',
            type: 'other'
          });
        }
      }

      // Detect content selectors
      const contentSelectors = await page.evaluate(() => {
        const selectors: Record<string, string> = {};

        // Common content selectors
        const commonSelectors = [
          'main', 'article', '.content', '#content', '.post-content',
          '.entry-content', '.article-content', '[role="main"]',
          '.story-body', '.post-body'
        ];

        for (const selector of commonSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent && element.textContent.length > 200) {
            selectors.content = selector;
            break;
          }
        }

        // Title selectors
        const titleSelectors = ['h1', '.title', '.page-title', '#title', 'article h1'];
        for (const selector of titleSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            selectors.title = selector;
            break;
          }
        }

        // Navigation selectors
        const navSelectors = ['nav', '.nav', '.navigation', '.menu'];
        for (const selector of navSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            selectors.navigation = selector;
            break;
          }
        }

        return selectors;
      });

      await page.close();

      return {
        baseUrl,
        routes: routes.slice(0, 100), // Limit to first 100 routes
        searchPatterns,
        paginationPatterns,
        contentSelectors
      };
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Save site structure to database
   */
  async saveSiteStructure(siteId: string, structure: SiteStructure): Promise<void> {
    try {
      // Update site configuration with structure info
      await lsembPool.query(`
        UPDATE site_configurations
        SET selectors = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [JSON.stringify(structure), siteId]);

      // Cache in Redis for faster access
      await redis.setex(`site-structure:${siteId}`, 3600, JSON.stringify(structure));
    } catch (error) {
      console.error('Failed to save site structure:', error);
      throw error;
    }
  }

  /**
   * Get cached site structure
   */
  async getSiteStructure(siteId: string): Promise<SiteStructure | null> {
    try {
      // Try Redis first
      const cached = await redis.get(`site-structure:${siteId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fallback to database
      const result = await lsembPool.query(`
        SELECT selectors
        FROM site_configurations
        WHERE id = $1
      `, [siteId]);

      if (result.rows.length > 0) {
        const selectors = result.rows[0].selectors;
        if (selectors && typeof selectors === 'object' && selectors.routes) {
          return selectors as SiteStructure;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to get site structure:', error);
      return null;
    }
  }

  /**
   * Search within a specific site for related content
   */
  async searchWithinSite(siteStructure: SiteStructure, query: string, maxResults: number = 5): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const browser = await this.initBrowser();

    try {
      // Try to use site's own search functionality
      if (siteStructure.searchPatterns.length > 0) {
        for (const searchUrl of siteStructure.searchPatterns.slice(0, 2)) {
          try {
            const url = new URL(searchUrl);
            url.searchParams.set('q', query);
            url.searchParams.set('query', query);
            url.searchParams.set('search', query);

            const page = await browser.newPage();
            await page.goto(url.toString(), { waitUntil: 'networkidle2', timeout: 15000 });

            // Extract search results
            const searchResults = await page.evaluate((maxResults) => {
              const resultElements = document.querySelectorAll(
                '.search-result, .result, .item, article, .post'
              );

              return Array.from(resultElements).slice(0, maxResults).map(item => {
                const link = item.querySelector('a[href]');
                const title = item.querySelector('h1, h2, h3, .title') ||
                             item.querySelector('a');

                return {
                  url: link ? (link as HTMLAnchorElement).href : '',
                  title: title ? title.textContent?.trim() : '',
                  content: item.textContent?.substring(0, 500) || ''
                };
              });
            }, maxResults);

            await page.close();

            for (const result of searchResults) {
              if (result.url && result.title) {
                results.push({
                  ...result,
                  relevanceScore: this.calculateRelevanceScore(query, result.title + ' ' + result.content),
                  siteName: new URL(siteStructure.baseUrl).hostname,
                  type: 'exact_match'
                });
              }
            }
          } catch (error) {
            console.error('Site search failed:', error);
          }
        }
      }

      // If no search results, try to construct intelligent URLs
      if (results.length === 0) {
        const candidateUrls = this.generateCandidateUrls(siteStructure, query);

        for (const url of candidateUrls.slice(0, maxResults)) {
          try {
            const result = await webScraperService.scrape(url, {
              wordCountThreshold: 100
            });

            if (result.success && result.content) {
              const relevanceScore = this.calculateRelevanceScore(
                query,
                result.title + ' ' + result.content
              );

              if (relevanceScore > 0.3) {
                results.push({
                  url: result.url,
                  title: result.title,
                  content: result.content.substring(0, 1000),
                  relevanceScore,
                  siteName: new URL(siteStructure.baseUrl).hostname,
                  type: relevanceScore > 0.7 ? 'exact_match' : 'semantic_match',
                  metadata: result.metadata
                });
              }
            }
          } catch (error) {
            // Continue trying other URLs
          }
        }
      }

      // Sort by relevance score
      results.sort((a, b) => b.relevanceScore - a.relevanceScore);

      return results.slice(0, maxResults);
    } finally {
      // Don't close browser here as it might be reused
    }
  }

  /**
   * Generate candidate URLs based on query and site structure
   */
  private generateCandidateUrls(siteStructure: SiteStructure, query: string): string[] {
    const urls: string[] = [];
    const baseUrl = siteStructure.baseUrl;
    const querySlug = query.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Generate common URL patterns
    const patterns = [
      `/${query}`,
      `/${querySlug}`,
      `/${query}/`,
      `/${querySlug}/`,
      `/wiki/${query}`,
      `/wiki/${querySlug}`,
      `/p/${query}`,
      `/p/${querySlug}`,
      `/article/${query}`,
      `/article/${querySlug}`,
      `/post/${query}`,
      `/post/${querySlug}`,
      `/search?q=${encodeURIComponent(query)}`,
      `/search?query=${encodeURIComponent(query)}`,
      `?s=${encodeURIComponent(query)}`,
      `?search=${encodeURIComponent(query)}`
    ];

    for (const pattern of patterns) {
      try {
        const url = new URL(pattern, baseUrl);
        urls.push(url.toString());
      } catch (error) {
        // Invalid URL, skip
      }
    }

    return urls;
  }

  /**
   * Calculate relevance score between query and content
   */
  private calculateRelevanceScore(query: string, content: string): number {
    const queryWords = query.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);

    let matches = 0;
    let totalQueryWords = queryWords.length;

    for (const queryWord of queryWords) {
      if (contentWords.some(contentWord =>
          contentWord.includes(queryWord) || queryWord.includes(contentWord))) {
        matches++;
      }
    }

    // Base score from word matching
    let score = matches / totalQueryWords;

    // Boost score for exact phrase matches
    if (content.toLowerCase().includes(query.toLowerCase())) {
      score += 0.3;
    }

    // Boost score for title-like patterns
    if (contentWords.slice(0, 10).join(' ').includes(query.toLowerCase())) {
      score += 0.2;
    }

    return Math.min(score, 1.0);
  }

  /**
   * Perform semantic search across multiple sites
   */
  async semanticSearch(request: SemanticSearchRequest): Promise<SearchResult[]> {
    const { query, projectIds, siteIds, deepSearch = false, maxResultsPerSite = 5 } = request;
    const allResults: SearchResult[] = [];

    try {
      // Get sites to search
      let siteQuery = `
        SELECT sc.*, sp.name as project_name
        FROM site_configurations sc
        LEFT JOIN scraping_projects sp ON sc.id = ANY(sp.site_ids)
        WHERE sc.active = true
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (projectIds && projectIds.length > 0) {
        siteQuery += ` AND sp.id = ANY($${paramIndex++})`;
        params.push(projectIds);
      }

      if (siteIds && siteIds.length > 0) {
        siteQuery += ` AND sc.id = ANY($${paramIndex++})`;
        params.push(siteIds);
      }

      const sitesResult = await lsembPool.query(siteQuery, params);
      const sites = sitesResult.rows;

      // Search each site
      for (const site of sites) {
        try {
          // Get or analyze site structure
          let siteStructure = await this.getSiteStructure(site.id);

          if (!siteStructure || deepSearch) {
            // Re-analyze if deep search requested or no cached structure
            siteStructure = await this.analyzeSiteStructure(site.base_url);
            await this.saveSiteStructure(site.id, siteStructure);
          }

          // Search within the site
          const siteResults = await this.searchWithinSite(
            siteStructure,
            query,
            maxResultsPerSite
          );

          allResults.push(...siteResults);

          // Emit progress
          if (this.io) {
            this.io.emit('search-progress', {
              query,
              siteName: site.name,
              resultsCount: siteResults.length,
              totalSites: sites.length,
              currentSiteIndex: sites.indexOf(site) + 1
            });
          }
        } catch (error) {
          console.error(`Failed to search site ${site.name}:`, error);
        }
      }

      // Remove duplicates and sort by relevance
      const uniqueResults = this.deduplicateResults(allResults);
      uniqueResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // If we have OpenAI, enhance with semantic similarity
      if (this.openai && uniqueResults.length > 0) {
        await this.enhanceWithSemanticSimilarity(query, uniqueResults);
      }

      // Save search results to database
      await this.saveSearchResults(query, uniqueResults);

      return uniqueResults.slice(0, 50); // Limit total results
    } catch (error) {
      console.error('Semantic search failed:', error);
      throw error;
    }
  }

  /**
   * Remove duplicate results
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      const key = result.url;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Enhance results with semantic similarity using OpenAI embeddings
   */
  private async enhanceWithSemanticSimilarity(query: string, results: SearchResult[]): Promise<void> {
    if (!this.openai) return;

    try {
      // Generate embedding for query
      const queryEmbedding = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: query
      });

      // Generate embeddings for results
      for (const result of results) {
        const text = result.title + ' ' + result.content.substring(0, 1000);
        const contentEmbedding = await this.openai.embeddings.create({
          model: 'text-embedding-ada-002',
          input: text
        });

        // Calculate cosine similarity
        const similarity = this.cosineSimilarity(
          queryEmbedding.data[0].embedding,
          contentEmbedding.data[0].embedding
        );

        // Update relevance score with semantic similarity
        result.relevanceScore = (result.relevanceScore + similarity) / 2;
      }
    } catch (error) {
      console.error('Failed to enhance with semantic similarity:', error);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Save search results to database
   */
  private async saveSearchResults(query: string, results: SearchResult[]): Promise<void> {
    try {
      const searchId = uuidv4();

      // Save search metadata
      await lsembPool.query(`
        INSERT INTO search_sessions (id, query, results_count, created_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      `, [searchId, query, results.length]);

      // Save individual results
      for (const result of results) {
        await lsembPool.query(`
          INSERT INTO search_results
          (search_id, url, title, content, relevance_score, site_name, type, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        `, [
          searchId,
          result.url,
          result.title,
          result.content,
          result.relevanceScore,
          result.siteName,
          result.type,
          JSON.stringify(result.metadata || {})
        ]);
      }
    } catch (error) {
      console.error('Failed to save search results:', error);
    }
  }

  /**
   * Scrape content based on search results
   */
  async scrapeSearchResults(searchResults: SearchResult[], options: any = {}): Promise<any[]> {
    const jobId = uuidv4();
    const scrapedContent = [];

    // Create job entry
    await redis.setex(`scrape-job:${jobId}`, 3600, JSON.stringify({
      id: jobId,
      type: 'search_based_scraping',
      status: 'processing',
      progress: 0,
      totalUrls: searchResults.length,
      createdAt: new Date().toISOString()
    }));

    // Process each URL
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];

      try {
        const scrapeResult = await webScraperService.scrape(result.url, options);

        if (scrapeResult.success) {
          // Save to database
          const itemId = await webScraperService.saveToDatabase(scrapeResult);

          scrapedContent.push({
            ...scrapeResult,
            id: itemId,
            searchRelevanceScore: result.relevanceScore,
            searchType: result.type
          });
        }

        // Update progress
        const progress = Math.round(((i + 1) / searchResults.length) * 100);

        await redis.setex(`scrape-job:${jobId}`, 3600, JSON.stringify({
          id: jobId,
          type: 'search_based_scraping',
          status: 'processing',
          progress,
          completedUrls: i + 1,
          totalUrls: searchResults.length
        }));

        // Emit progress via Socket.IO
        if (this.io) {
          this.io.emit('scrape-search-progress', {
            jobId,
            progress,
            currentUrl: result.url,
            completedUrls: i + 1,
            totalUrls: searchResults.length
          });
        }
      } catch (error) {
        console.error(`Failed to scrape ${result.url}:`, error);
      }
    }

    // Mark job as completed
    await redis.setex(`scrape-job:${jobId}`, 86400, JSON.stringify({
      id: jobId,
      type: 'search_based_scraping',
      status: 'completed',
      progress: 100,
      completedAt: new Date().toISOString(),
      resultsCount: scrapedContent.length
    }));

    return scrapedContent;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Export singleton instance
export const intelligentScraperService = new IntelligentScraperService();