import puppeteer from 'puppeteer';
import { Browser, Page } from 'puppeteer';
import { lsembPool } from '../config/database.config';
import OpenAI from 'openai';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

interface SiteAnalysis {
  baseUrl: string;
  siteType: 'ecommerce' | 'blog' | 'news' | 'forum' | 'portfolio' | 'corporate' | 'directory';
  confidence: number;

  // Core selectors
  selectors: {
    title: string[];
    content: string[];
    price: string[];
    image: string[];
    link: string[];
    navigation: string[];
    pagination: string[];
  };

  // E-commerce specific
  ecommerce?: {
    productGrid: string[];
    productCard: string[];
    productName: string[];
    productPrice: string[];
    productImage: string[];
    productLink: string[];
    productSKU: string[];
    productRating: string[];
    addToCart: string[];
    cartCount: string[];
    checkout: string[];
  };

  // Content specific
  content?: {
    author: string[];
    publishDate: string[];
    category: string[];
    tags: string[];
    comments: string[];
    socialShare: string[];
  };

  // Technical detection
  technical: {
    cms: string;
    framework: string;
    hasStructuredData: boolean;
    microdataTypes: string[];
    hasOpenGraph: boolean;
    hasTwitterCards: boolean;
    language: string;
    paginationType: 'traditional' | 'infinite' | 'load-more' | 'none';
  };

  // Detected entities
  entities: {
    products: boolean;
    articles: boolean;
    reviews: boolean;
    prices: boolean;
    dates: boolean;
    authors: boolean;
    categories: boolean;
  };

  // SEO & Metadata
  seo: {
    titleTemplate: string;
    metaDescription: string;
    h1Structure: string[];
    internalLinks: number;
    externalLinks: number;
    imagesWithAlt: number;
    totalImages: number;
  };
}

interface AnalysisProgress {
  step: string;
  progress: number;
  message: string;
  timestamp: Date;
}

interface RobotsTxtResult {
  allowed: boolean;
  userAgent: string;
  disallowedPaths: string[];
  crawlDelay: number;
  sitemaps: string[];
  warnings: string[];
}

export class SiteAnalyzerService {
  private browser: Browser | null = null;
  private openai: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
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
   * Check robots.txt compliance
   */
  async checkRobotsTxt(url: string): Promise<RobotsTxtResult> {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

      const response = await axios.get(robotsUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SiteAnalyzer/1.0; +http://localhost:8083)'
        }
      });

      const lines = response.data.split('\n');
      const userAgent = '*';
      const disallowedPaths: string[] = [];
      const sitemaps: string[] = [];
      let crawlDelay = 0;
      const warnings: string[] = [];

      let currentUserAgent = '*';
      let applyingToOurUserAgent = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        if (trimmed.toLowerCase().startsWith('user-agent:')) {
          currentUserAgent = trimmed.split(':')[1].trim();
          applyingToOurUserAgent = currentUserAgent === '*' || currentUserAgent.toLowerCase().includes('bot') || currentUserAgent.toLowerCase().includes('crawler');
          continue;
        }

        if (applyingToOurUserAgent) {
          if (trimmed.toLowerCase().startsWith('disallow:')) {
            const path = trimmed.split(':')[1].trim();
            if (path) disallowedPaths.push(path);
          } else if (trimmed.toLowerCase().startsWith('crawl-delay:')) {
            crawlDelay = parseInt(trimmed.split(':')[1].trim()) || 0;
          } else if (trimmed.toLowerCase().startsWith('sitemap:')) {
            sitemaps.push(trimmed.split(':')[1].trim());
          }
        }
      }

      // Check if current path is allowed
      const currentPath = urlObj.pathname;
      const allowed = !disallowedPaths.some(path => {
        if (path === '/') return true;
        if (path.endsWith('/') && currentPath.startsWith(path)) return true;
        if (!path.endsWith('/') && currentPath.startsWith(path + '/')) return true;
        if (currentPath === path) return true;
        return false;
      });

      // Generate warnings
      if (crawlDelay > 5) warnings.push(`High crawl delay: ${crawlDelay}s`);
      if (disallowedPaths.includes('/')) warnings.push('Site disallows all crawling');
      if (disallowedPaths.length > 50) warnings.push('Very restrictive robots.txt');

      return {
        allowed,
        userAgent,
        disallowedPaths,
        crawlDelay,
        sitemaps,
        warnings
      };

    } catch (error) {
      // No robots.txt or error - assume allowed
      return {
        allowed: true,
        userAgent: '*',
        disallowedPaths: [],
        crawlDelay: 0,
        sitemaps: [],
        warnings: ['No robots.txt found or inaccessible']
      };
    }
  }

  /**
   * Comprehensive site analysis with progress tracking
   */
  async analyzeSite(url: string, progressCallback?: (progress: AnalysisProgress) => void): Promise<SiteAnalysis> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      progressCallback?.({
        step: 'robots_check',
        progress: 5,
        message: 'Checking robots.txt compliance...',
        timestamp: new Date()
      });

      // Check robots.txt compliance
      const robotsCheck = await this.checkRobotsTxt(url);

      if (!robotsCheck.allowed) {
        throw new Error(`Scraping disallowed by robots.txt: ${robotsCheck.disallowedPaths.join(', ')}`);
      }

      if (robotsCheck.warnings.length > 0) {
        progressCallback?.({
          step: 'robots_warning',
          progress: 10,
          message: `Robots.txt warnings: ${robotsCheck.warnings.join('; ')}`,
          timestamp: new Date()
        });
      }

      progressCallback?.({
        step: 'initialization',
        progress: 15,
        message: 'Initializing browser with respectful settings...',
        timestamp: new Date()
      });

      // Apply crawl delay if specified
      if (robotsCheck.crawlDelay > 0) {
        await page.setDefaultTimeout(10000 + (robotsCheck.crawlDelay * 1000));
      }

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      progressCallback?.({
        step: 'content_loading',
        progress: 15,
        message: 'Loading page content...',
        timestamp: new Date()
      });

      // Extract HTML for analysis
      const html = await page.content();
      const $ = cheerio.load(html);

      progressCallback?.({
        step: 'structure_analysis',
        progress: 30,
        message: 'Analyzing site structure...',
        timestamp: new Date()
      });

      // Core structure analysis
      const structure = await this.analyzeSiteStructure(page, $);

      progressCallback?.({
        step: 'detecting_content_areas',
        progress: 50,
        message: 'Detecting content areas...',
        timestamp: new Date()
      });

      // E-commerce detection
      const ecommerceFeatures = await this.detectEcommerceFeatures(page, $);

      progressCallback?.({
        step: 'identifying_navigation_patterns',
        progress: 70,
        message: 'Identifying navigation patterns...',
        timestamp: new Date()
      });

      // Entity extraction
      const entities = await this.extractEntities($);

      progressCallback?.({
        step: 'analyzing_page_structure',
        progress: 85,
        message: 'Analyzing page structure...',
        timestamp: new Date()
      });

      // Technical analysis
      const technical = await this.analyzeTechnicalAspects($);

      progressCallback?.({
        step: 'completed',
        progress: 100,
        message: 'Analysis completed successfully',
        timestamp: new Date()
      });

      await page.close();

      return {
        baseUrl: url,
        siteType: this.determineSiteType(structure, ecommerceFeatures, entities),
        confidence: this.calculateConfidence(structure, ecommerceFeatures, entities),
        ...structure,
        ecommerce: ecommerceFeatures.detected ? ecommerceFeatures.config : undefined,
        entities,
        technical,
        seo: this.analyzeSEO($)
      };

    } catch (error) {
      await page.close();
      throw error;
    }
  }

  private async analyzeSiteStructure(page: Page, $: cheerio.CheerioAPI) {
    let selectors: any;

    // Try AI-powered detection first
    try {
      const siteType = await this.determineSiteTypeFromHTML($);
      const html = await page.content();

      const aiSelectors = await this.detectSelectorsWithAI(page, siteType, html);

      if (aiSelectors) {
        // Merge AI selectors with traditional ones as fallback
        const traditionalSelectors = {
          title: await this.detectSelectors(page, ['h1', '.title', '.page-title', '[data-title]', 'title']),
          content: await this.detectSelectors(page, ['main', 'article', '.content', '#content', '.post-content', '[role="main"]']),
          price: await this.detectSelectors(page, ['.price', '.cost', '.amount', '[itemprop="price"]', '[data-price]']),
          image: await this.detectSelectors(page, ['img', '.image img', '.photo img', '[data-image] img']),
          link: await this.detectSelectors(page, ['a', 'a[href]', '[data-link]']),
          navigation: await this.detectSelectors(page, ['nav', '.nav', '.navigation', '.menu', '[role="navigation"]']),
          pagination: await this.detectSelectors(page, ['.pagination', '.paging', '.pages', '[data-pagination]'])
        };

        // Combine results, prioritizing AI selectors
        selectors = {
          title: [...new Set([...(aiSelectors.title || []), ...traditionalSelectors.title])],
          content: [...new Set([...(aiSelectors.content || []), ...traditionalSelectors.content])],
          price: [...new Set([...(aiSelectors.price || []), ...traditionalSelectors.price])],
          image: [...new Set([...(aiSelectors.image || []), ...traditionalSelectors.image])],
          link: [...new Set([...(aiSelectors.link || []), ...traditionalSelectors.link])],
          navigation: [...new Set([...(aiSelectors.navigation || []), ...traditionalSelectors.navigation])],
          pagination: [...new Set([...(aiSelectors.pagination || []), ...traditionalSelectors.pagination])]
        };
      } else {
        // Fallback to traditional detection
        selectors = {
          title: await this.detectSelectors(page, ['h1', '.title', '.page-title', '[data-title]', 'title']),
          content: await this.detectSelectors(page, ['main', 'article', '.content', '#content', '.post-content', '[role="main"]']),
          price: await this.detectSelectors(page, ['.price', '.cost', '.amount', '[itemprop="price"]', '[data-price]']),
          image: await this.detectSelectors(page, ['img', '.image img', '.photo img', '[data-image] img']),
          link: await this.detectSelectors(page, ['a', 'a[href]', '[data-link]']),
          navigation: await this.detectSelectors(page, ['nav', '.nav', '.navigation', '.menu', '[role="navigation"]']),
          pagination: await this.detectSelectors(page, ['.pagination', '.paging', '.pages', '[data-pagination]'])
        };
      }
    } catch (error) {
      console.error('AI detection failed, using traditional methods:', error);
      // Fallback to traditional detection
      selectors = {
        title: await this.detectSelectors(page, ['h1', '.title', '.page-title', '[data-title]', 'title']),
        content: await this.detectSelectors(page, ['main', 'article', '.content', '#content', '.post-content', '[role="main"]']),
        price: await this.detectSelectors(page, ['.price', '.cost', '.amount', '[itemprop="price"]', '[data-price]']),
        image: await this.detectSelectors(page, ['img', '.image img', '.photo img', '[data-image] img']),
        link: await this.detectSelectors(page, ['a', 'a[href]', '[data-link]']),
        navigation: await this.detectSelectors(page, ['nav', '.nav', '.navigation', '.menu', '[role="navigation"]']),
        pagination: await this.detectSelectors(page, ['.pagination', '.paging', '.pages', '[data-pagination]'])
      };
    }

    return { selectors, aiSelectors: selectors !== null };
  }

  private async determineSiteTypeFromHTML($: cheerio.CheerioAPI): string {
    const text = $.text().toLowerCase();
    const url = window.location?.href || '';

    // E-commerce indicators
    if (text.includes('cart') || text.includes('checkout') || text.includes('add to cart') ||
        text.includes('price') || text.includes('shop') || text.includes('product') ||
        $('.price, .cost, .amount, [itemprop="price"]').length > 0) {
      return 'ecommerce';
    }

    // Blog indicators
    if (text.includes('blog') || text.includes('post') || text.includes('article') ||
        $('.blog, .post, .article').length > 0) {
      return 'blog';
    }

    // News indicators
    if (text.includes('news') || text.includes('breaking') || text.includes('latest') ||
        $('.news, .breaking, .latest').length > 0) {
      return 'news';
    }

    return 'website';
  }

  private async detectSelectors(page: Page, candidateSelectors: string[]): Promise<string[]> {
    const detected: string[] = [];

    for (const selector of candidateSelectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          // Test if selector has meaningful content
          const hasContent = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return false;

            if (el.tagName === 'IMG') {
              return el.getAttribute('src') || el.getAttribute('data-src');
            }

            return el.textContent && el.textContent.trim().length > 10;
          }, selector);

          if (hasContent) {
            detected.push(selector);
          }
        }
      } catch (error) {
        // Selector not valid, skip
      }
    }

    return detected;
  }

  /**
   * AI-powered CSS selector detection using OpenAI
   */
  private async detectSelectorsWithAI(page: Page, siteType: string, html: string): Promise<any> {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Extract relevant HTML sections for analysis
      const relevantHTML = await page.evaluate(() => {
        // Focus on main content areas
        const selectors = ['main', 'article', '.content', '#content', '.products', '.items'];
        let content = '';

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            content += element.outerHTML.substring(0, 2000); // Limit size
            break;
          }
        }

        // If no main content found, get body structure
        if (!content) {
          content = document.body.outerHTML.substring(0, 3000);
        }

        return content;
      });

      const prompt = `
Analyze this HTML structure and provide optimal CSS selectors for scraping.

Site Type: ${siteType}

HTML Structure:
${relevantHTML}

Return a JSON object with the following structure:
{
  "title": ["selector1", "selector2"],
  "content": ["selector1", "selector2"],
  "price": ["selector1", "selector2"],
  "image": ["selector1", "selector2"],
  "link": ["selector1", "selector2"],
  "navigation": ["selector1", "selector2"],
  "pagination": ["selector1", "selector2"],
  "productGrid": ["selector1", "selector2"],
  "productCard": ["selector1", "selector2"],
  "productName": ["selector1", "selector2"],
  "productPrice": ["selector1", "selector2"],
  "productImage": ["selector1", "selector2"],
  "addToCart": ["selector1", "selector2"]
}

Guidelines:
1. Provide multiple fallback selectors for each element type
2. Prioritize semantic selectors (class names, data attributes)
3. Avoid overly specific selectors that might break
4. Focus on selectors that are likely to be consistent across the site
5. For e-commerce sites, focus on product-related selectors
6. Include at least 2-3 options per element type for robustness
7. Use modern CSS selector patterns (attribute selectors, structural pseudo-classes)
`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert web scraping specialist. Analyze HTML and provide optimal CSS selectors for data extraction. Return only valid JSON without any additional text."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.1
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      // Parse AI response
      const aiSelectors = JSON.parse(aiResponse);

      // Validate AI selectors by testing them on the page
      const validatedSelectors: any = {};

      for (const [key, selectors] of Object.entries(aiSelectors)) {
        const validSelectors: string[] = [];

        if (Array.isArray(selectors)) {
          for (const selector of selectors) {
            try {
              const elements = await page.$$(selector);
              if (elements.length > 0) {
                const hasContent = await page.evaluate((sel) => {
                  const el = document.querySelector(sel);
                  if (!el) return false;

                  if (el.tagName === 'IMG') {
                    return el.getAttribute('src') || el.getAttribute('data-src');
                  }

                  return el.textContent && el.textContent.trim().length > 5;
                }, selector);

                if (hasContent) {
                  validSelectors.push(selector);
                }
              }
            } catch (error) {
              // Invalid selector, skip
            }
          }
        }

        validatedSelectors[key] = validSelectors;
      }

      return validatedSelectors;

    } catch (error) {
      console.error('AI selector detection failed:', error);
      // Fallback to traditional detection
      return null;
    }
  }

  private async detectEcommerceFeatures(page: Page, $: cheerio.CheerioAPI) {
    const detected = await page.evaluate(() => {
      const features = {
        // E-commerce indicators
        hasCart: !!document.querySelector('.cart, .shopping-cart, #cart, [data-cart]'),
        hasCheckout: !!document.querySelector('.checkout, .payment, #checkout, [data-checkout]'),
        hasProductGrid: !!document.querySelector('.products, .product-grid, .items, .catalog'),
        hasAddToCart: !!document.querySelector('.add-to-cart, .buy-now, .purchase, [data-add-to-cart]'),
        hasPricing: !!document.querySelector('.price, .cost, .amount, [itemprop="price"]'),
        hasProductCard: !!document.querySelector('.product, .item, .card, [data-product]'),
        hasWishlist: !!document.querySelector('.wishlist, .favorite, .save, [data-wishlist]'),
        hasReviews: !!document.querySelector('.review, .rating, .stars, [data-rating]'),
        hasFilters: !!document.querySelector('.filter, .sort, .refine, [data-filter]'),

        // E-commerce text patterns
        cartKeywords: ['cart', 'basket', 'checkout', 'payment', 'shipping'],
        productKeywords: ['price', 'sale', 'discount', 'offer', 'deal', 'buy'],

        // Count potential products
        potentialProducts: document.querySelectorAll('.product, .item, .card').length,

        // Price elements
        priceElements: document.querySelectorAll('[class*="price"], [class*="cost"], [itemprop="price"]').length
      };

      return features;
    });

    // Check for common e-commerce platforms
    const platformIndicators = {
      shopify: !!$('script[src*="shopify"]').length,
      woocommerce: !!$('link[href*="woocommerce"]').length || !!$('body.woocommerce').length,
      magento: !!$('script[src*="magento"]').length,
      bigcommerce: !!$('script[src*="bigcommerce"]').length,
      squarespace: !!$('script[src*="squarespace"]').length,
      wix: !!$('script[src*="wix"]').length
    };

    const detectedPlatform = Object.keys(platformIndicators).find(key => platformIndicators[key as keyof typeof platformIndicators]);

    const isEcommerce = detected.hasCart || detected.hasCheckout || detected.hasAddToCart ||
                        detected.hasPricing || detectedPlatform || detected.potentialProducts > 5;

    const config = {
      productGrid: await this.detectSelectors(page, ['.products', '.product-grid', '.items', '.catalog', '.listings']),
      productCard: await this.detectSelectors(page, ['.product', '.item', '.card', '[data-product]']),
      productName: await this.detectSelectors(page, ['.title', '.name', '.product-title', 'h2', 'h3', '[data-name]']),
      productPrice: await this.detectSelectors(page, ['.price', '.cost', '.amount', '[itemprop="price"]', '[data-price]']),
      productImage: await this.detectSelectors(page, ['.image img', '.photo img', 'img[src*="product"]', '[data-image]']),
      productLink: await this.detectSelectors(page, ['a', '[data-href]', '[data-link]']),
      productSKU: await this.detectSelectors(page, ['.sku', '.model', '.mpn', '[data-sku]']),
      productRating: await this.detectSelectors(page, ['.rating', '.stars', '.review-score', '[data-rating]']),
      addToCart: await this.detectSelectors(page, ['.add-to-cart', '.buy-now', '.purchase', '[data-add-to-cart]']),
      cartCount: await this.detectSelectors(page, ['.cart-count', '.cart-items', '[data-cart-count]']),
      checkout: await this.detectSelectors(page, ['.checkout', '.payment', '[data-checkout]'])
    };

    return {
      detected: isEcommerce,
      platform: detectedPlatform,
      confidence: this.calculateEcommerceConfidence(detected, platformIndicators),
      features: detected,
      config
    };
  }

  private calculateEcommerceConfidence(features: any, platformIndicators: any): number {
    let confidence = 0;

    // Platform detection gives high confidence
    if (Object.values(platformIndicators).some((detected: boolean) => detected)) {
      confidence += 0.4;
    }

    // Core e-commerce features
    if (features.hasCart) confidence += 0.2;
    if (features.hasCheckout) confidence += 0.2;
    if (features.hasAddToCart) confidence += 0.15;
    if (features.hasPricing) confidence += 0.1;
    if (features.hasProductGrid) confidence += 0.1;
    if (features.priceElements > 5) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private async extractEntities($: cheerio.CheerioAPI) {
    const text = $.text();

    return {
      products: /product|item|sku|isbn|price|cart|checkout|buy/i.test(text),
      articles: /article|post|blog|news|story/i.test(text),
      reviews: /review|rating|star|feedback|testimonial/i.test(text),
      prices: /\$\d+|\d+\$\d+|price|cost|amount/i.test(text),
      dates: /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/i.test(text),
      authors: /author|writer|by\s+\w+/i.test(text),
      categories: /category|tag|topic|section/i.test(text)
    };
  }

  private async analyzeTechnicalAspects($: cheerio.CheerioAPI) {
    // CMS Detection
    const cms = this.detectCMS($);

    // Framework detection
    const framework = this.detectFramework($);

    // Structured data
    const structuredData = this.detectStructuredData($);

    // Language detection
    const language = $('html').attr('lang') || $('meta[http-equiv="content-language"]').attr('content') || 'en';

    // Pagination type
    const paginationType = this.detectPaginationType($);

    return {
      cms,
      framework,
      ...structuredData,
      language,
      paginationType
    };
  }

  private detectCMS($: cheerio.CheerioAPI): string {
    const generators = $('meta[name="generator"]').attr('content') || '';

    if (generators.includes('WordPress')) return 'wordpress';
    if (generators.includes('Drupal')) return 'drupal';
    if (generators.includes('Joomla')) return 'joomla';
    if (generators.includes('Shopify')) return 'shopify';
    if (generators.includes('Wix')) return 'wix';
    if (generators.includes('Squarespace')) return 'squarespace';

    // Check for common CMS patterns
    if ($('link[href*="wp-content"]').length) return 'wordpress';
    if ($('script[src*="drupal"]').length) return 'drupal';

    return 'unknown';
  }

  private detectFramework($: cheerio.CheerioAPI): string {
    if ($('script[src*="react"]').length) return 'react';
    if ($('script[src*="vue"]').length) return 'vue';
    if ($('script[src*="angular"]').length) return 'angular';
    if ($('script[src*="jquery"]').length) return 'jquery';
    if ($('[data-react]').length) return 'react';

    return 'unknown';
  }

  private detectStructuredData($: cheerio.CheerioAPI) {
    const jsonLD = $('script[type="application/ld+json"]').length > 0;
    const microdata = $('[itemscope]').length > 0;
    const rdfa = $('[typeof]').length > 0;

    const microdataTypes: string[] = [];
    $('[itemscope]').each((i, el) => {
      const itemType = $(el).attr('itemtype');
      if (itemType) microdataTypes.push(itemType);
    });

    return {
      hasStructuredData: jsonLD || microdata || rdfa,
      microdataTypes: [...new Set(microdataTypes)],
      hasOpenGraph: $('meta[property^="og:"]').length > 0,
      hasTwitterCards: $('meta[name^="twitter:"]').length > 0
    };
  }

  private detectPaginationType($: cheerio.CheerioAPI): 'traditional' | 'infinite' | 'load-more' | 'none' {
    if ($('.load-more, .loadMore, [data-load-more]').length > 0) return 'load-more';
    if ($('script').text().includes('infinite') || $('.infinite').length > 0) return 'infinite';
    if ($('.pagination, .paging, .pages').length > 0) return 'traditional';
    return 'none';
  }

  private analyzeSEO($: cheerio.CheerioAPI) {
    const title = $('title').text();
    const metaDescription = $('meta[name="description"]').attr('content') || '';

    const h1Structure: string[] = [];
    $('h1').each((i, el) => h1Structure.push($(el).text()));

    const internalLinks = $('a[href^="/"], a[href^="' + location.origin + '"]').length;
    const externalLinks = $('a[href^="http"]:not([href^="' + location.origin + '"])').length;

    const totalImages = $('img').length;
    const imagesWithAlt = $('img[alt]').length;

    return {
      titleTemplate: this.extractTitleTemplate(title),
      metaDescription,
      h1Structure,
      internalLinks,
      externalLinks,
      imagesWithAlt,
      totalImages
    };
  }

  private extractTitleTemplate(title: string): string {
    // Try to identify title pattern
    const parts = title.split(' - ');
    const separators = [' - ', ' | ', ' » ', ' — '];

    for (const sep of separators) {
      if (title.includes(sep)) {
        return title.replace(/[^ -|»—]+/g, '{title}');
      }
    }

    return '{title}';
  }

  private determineSiteType(structure: any, ecommerce: any, entities: any): SiteAnalysis['siteType'] {
    if (ecommerce.detected) return 'ecommerce';
    if (entities.articles) return 'blog';
    if (entities.reviews) return 'forum';
    if (structure.selectors.navigation.length > 5) return 'corporate';
    return 'website';
  }

  private calculateConfidence(structure: any, ecommerce: any, entities: any): number {
    let confidence = 0.5; // Base confidence

    // High confidence for detected selectors
    const selectorCount = Object.values(structure.selectors).flat().length;
    confidence += Math.min(selectorCount * 0.05, 0.3);

    // Boost for e-commerce detection
    if (ecommerce.detected) {
      confidence += ecommerce.confidence * 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Export singleton instance
export const siteAnalyzerService = new SiteAnalyzerService();