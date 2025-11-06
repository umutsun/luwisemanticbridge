import { lsembPool } from '../config/database.config';

export interface SiteConfiguration {
  id?: string;
  name: string;
  baseUrl: string;
  type: 'wiki' | 'news' | 'ecommerce' | 'blog' | 'forum' | 'custom';
  category?: string;
  selectors?: {
    content?: string;
    title?: string;
    description?: string;
    links?: string;
    wait?: string;
    pagination?: string;
  };
  auth?: {
    type: 'none' | 'basic' | 'bearer' | 'cookie' | 'form';
    credentials?: any;
  };
  rateLimit?: number;
  pagination?: {
    nextSelector?: string;
    pageParam?: string;
    maxPages?: number;
  };
  filters?: {
    minLength?: number;
    excludeTags?: string[];
    keywords?: string[];
  };
  transforms?: {
    cleanHtml?: boolean;
    extractImages?: boolean;
    extractMetadata?: boolean;
  };
  active?: boolean;
}

export class SiteConfigurationService {
  // Predefined site configurations with smart endpoint detection
  private predefinedConfigs: Partial<SiteConfiguration>[] = [
    {
      name: 'Wikipedia',
      type: 'wiki',
      baseUrl: 'https://en.wikipedia.org',
      selectors: {
        content: '#mw-content-text',
        title: '#firstHeading',
        description: '.mw-parser-output > p',
        links: '#mw-content-text a',
        wait: '#mw-content-text'
      },
      transforms: {
        cleanHtml: true,
        extractMetadata: true
      },
      rateLimit: 5
    },
    {
      name: 'Google News',
      type: 'news',
      baseUrl: 'https://news.google.com',
      selectors: {
        content: 'article',
        title: 'h3, .title',
        links: 'a[href]'
      },
      rateLimit: 10
    },
    {
      name: 'Reddit',
      type: 'forum',
      baseUrl: 'https://reddit.com',
      selectors: {
        content: '.usertext-body',
        title: 'h1, .title',
        links: 'a'
      },
      rateLimit: 15
    }
  ];

  async detectSiteStructure(url: string): Promise<Partial<SiteConfiguration>> {
    console.log(`[DETECTION] Analyzing site structure for: ${url}`);

    // Extract domain
    const domain = new URL(url).hostname;

    // Check if it's Wikipedia
    if (domain.includes('wikipedia.org')) {
      return {
        name: 'Wikipedia',
        type: 'wiki',
        baseUrl: `https://${domain}`,
        selectors: {
          content: '#mw-content-text',
          title: '#firstHeading',
          description: '.mw-parser-output > p:first-child',
          links: '#mw-content-text a',
          wait: '#mw-content-text'
        },
        transforms: {
          cleanHtml: true,
          extractMetadata: true
        },
        rateLimit: 5
      };
    }

    // Check if it's a news site
    if (domain.includes('news') || domain.includes('cnn') || domain.includes('bbc') || domain.includes('reuters')) {
      return {
        name: domain.split('.')[1] || 'News Site',
        type: 'news',
        baseUrl: `https://${domain}`,
        selectors: {
          content: 'article, .article-body, .content',
          title: 'h1, .headline, .title',
          description: '.summary, .excerpt, .description',
          links: 'a[href]'
        },
        rateLimit: 10
      };
    }

    // Check if it's e-commerce
    if (domain.includes('amazon') || domain.includes('shop') || domain.includes('store')) {
      return {
        name: domain.split('.')[1] || 'E-commerce Site',
        type: 'ecommerce',
        baseUrl: `https://${domain}`,
        selectors: {
          content: '.product-description, .description',
          title: '.product-title, h1',
          price: '.price, .amount',
          links: 'a[href]'
        },
        rateLimit: 20
      };
    }

    // Default generic configuration
    return {
      name: domain,
      type: 'custom',
      baseUrl: `https://${domain}`,
      selectors: {
        content: 'main, article, .content, .main-content',
        title: 'h1, .title',
        description: '.description, .summary, meta[name="description"]',
        links: 'a[href]'
      },
      rateLimit: 10
    };
  }

  async createConfig(config: Partial<SiteConfiguration> & { baseUrl: string }): Promise<SiteConfiguration> {
    try {
      // Ensure we have a name
      if (!config.name) {
        const url = new URL(config.baseUrl);
        config.name = url.hostname;
      }

      // Auto-detect if not provided
      if (!config.type || config.type === 'custom') {
        const detected = await this.detectSiteStructure(config.baseUrl);
        config = { ...detected, ...config };
      }

      // Build search query for Wikipedia
      if (config.type === 'wiki' && config.baseUrl.includes('wikipedia.org')) {
        const title = this.extractWikipediaTitle(config.baseUrl);
        if (title) {
          // Store the search query that was used
          config.metadata = {
            searchQuery: title,
            originalUrl: config.baseUrl
          };
        }
      }

      const result = await lsembPool.query(`
        INSERT INTO advanced_site_configurations
        (name, base_url, type, category, selectors, auth_config, rate_limit,
         pagination_config, filters, transforms, active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW())
        RETURNING *
      `, [
        config.name,
        config.baseUrl,
        config.type,
        config.category,
        JSON.stringify(config.selectors || {}),
        JSON.stringify(config.auth || {}),
        config.rateLimit || 10,
        JSON.stringify(config.pagination || {}),
        JSON.stringify(config.filters || {}),
        JSON.stringify(config.transforms || {})
      ]);

      return result.rows[0];
    } catch (error) {
      console.error('Failed to create site configuration:', error);
      throw error;
    }
  }

  async searchWikipedia(query: string, language: string = 'en'): Promise<string> {
    const searchUrl = `https://${language}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=`;

    try {
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.query && data.query.search && data.query.search.length > 0) {
        const firstResult = data.query.search[0];
        const title = firstResult.title;
        return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
      }

      throw new Error('No Wikipedia articles found for the query');
    } catch (error) {
      console.error('Wikipedia search failed:', error);
      throw error;
    }
  }

  private extractWikipediaTitle(url: string): string | null {
    const match = url.match(/wikipedia\.org\/wiki\/([^?#]+)/);
    if (match) {
      return decodeURIComponent(match[1].replace(/_/g, ' '));
    }
    return null;
  }

  async createCategoryBasedScraping(category: string, query: string): Promise<SiteConfiguration[]> {
    const configs: SiteConfiguration[] = [];

    // Always add Wikipedia
    try {
      const wikiUrl = await this.searchWikipedia(query);
      const wikiConfig = await this.detectSiteStructure(wikiUrl);
      wikiConfig.category = category;
      // detectSiteStructure always returns baseUrl, so we can safely cast
      configs.push(await this.createConfig(wikiConfig as Partial<SiteConfiguration> & { baseUrl: string }));
    } catch (error) {
      console.error('Failed to create Wikipedia config:', error);
    }

    // Add other predefined configs based on category
    for (const predefined of this.predefinedConfigs) {
      if (predefined.type !== 'wiki' && predefined.baseUrl) {
        predefined.category = category;
        configs.push(await this.createConfig(predefined as Partial<SiteConfiguration> & { baseUrl: string }));
      }
    }

    return configs;
  }

  async getConfigsByCategory(category: string): Promise<SiteConfiguration[]> {
    try {
      const result = await lsembPool.query(
        'SELECT * FROM site_configurations WHERE category = $1 AND active = true',
        [category]
      );

      return result.rows.map(row => ({
        ...row,
        selectors: JSON.parse(row.selectors || '{}'),
        auth: JSON.parse(row.auth_config || '{}'),
        pagination: JSON.parse(row.pagination_config || '{}'),
        filters: JSON.parse(row.filters || '{}'),
        transforms: JSON.parse(row.transforms || '{}'),
        rateLimit: row.rate_limit
      }));
    } catch (error) {
      console.error('Failed to get configs by category:', error);
      throw error;
    }
  }
}

export const siteConfigurationService = new SiteConfigurationService();