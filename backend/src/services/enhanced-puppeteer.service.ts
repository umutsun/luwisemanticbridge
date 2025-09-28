import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';

interface EnhancedScrapeOptions {
  waitForSelector?: string;
  customSelectors?: string[];
  prioritySelectors?: string[];
  extractMode?: 'all' | 'first' | 'best';
  waitTime?: number;
  scrollToBottom?: boolean;
  clickCookieConsent?: boolean;
  interceptRequests?: boolean;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

interface ScrapeResult {
  success: boolean;
  title: string;
  content: string;
  description?: string;
  keywords?: string;
  url: string;
  metadata?: any;
  error?: string;
  scrapingMethod?: string;
  extractedFrom?: string[];
}

export class EnhancedPuppeteerService {
  private browser: Browser | null = null;

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--lang=tr-TR,tr,en-US,en'
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      });
    }
    return this.browser;
  }

  async scrape(url: string, options: EnhancedScrapeOptions = {}): Promise<ScrapeResult> {
    const browser = await this.initialize();
    const page = await browser.newPage();

    try {
      // Set user agent
      const userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
      await page.setUserAgent(userAgent);

      // Set viewport
      if (options.viewport) {
        await page.setViewport(options.viewport);
      }

      // Hide automation detection
      await this.hideAutomation(page);

      // Intercept and block unnecessary requests for faster loading
      if (options.interceptRequests) {
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const resourceType = request.resourceType();
          if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            request.abort();
          } else {
            request.continue();
          }
        });
      }

      console.log(`[ENHANCED-PUPPETEER] Navigating to: ${url}`);
      
      // Navigate to the page
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      console.log(`[ENHANCED-PUPPETEER] Status: ${response?.status()}`);

      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, options.waitTime || 3000));

      // Handle cookie consent for common sites
      if (options.clickCookieConsent) {
        await this.handleCookieConsent(page);
      }

      // Wait for specific selectors if provided
      if (options.waitForSelector) {
        try {
          await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
          console.log(`[ENHANCED-PUPPETEER] Found selector: ${options.waitForSelector}`);
        } catch (e) {
          console.log(`[ENHANCED-PUPPETEER] Selector not found: ${options.waitForSelector}`);
        }
      }

      // Wait for custom selectors
      if (options.customSelectors && options.customSelectors.length > 0) {
        for (const selector of options.customSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            console.log(`[ENHANCED-PUPPETEER] Found custom selector: ${selector}`);
          } catch (e) {
            console.log(`[ENHANCED-PUPPETEER] Custom selector not found: ${selector}`);
          }
        }
      }

      // Scroll to load lazy content
      if (options.scrollToBottom !== false) {
        await this.autoScroll(page);
      }

      // Wait for React/Vue/Angular to finish rendering
      await this.waitForFrameworks(page);

      // Get page content
      const html = await page.content();
      const $ = cheerio.load(html);

      // Extract content using various strategies
      const content = await this.extractContent($, page, options);
      
      // Extract metadata
      const title = await page.title() || $('h1').first().text() || 'Untitled';
      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content') || '';
      const keywords = $('meta[name="keywords"]').attr('content') || '';

      return {
        success: true,
        title,
        content,
        description,
        keywords,
        url,
        metadata: {
          statusCode: response?.status(),
          contentLength: content.length,
          scrapingMethod: 'enhanced-puppeteer',
          selectors: options.customSelectors || [],
          extractMode: options.extractMode || 'best'
        },
        scrapingMethod: 'enhanced-puppeteer'
      };

    } catch (error: any) {
      console.error('[ENHANCED-PUPPETEER] Error:', error);
      return {
        success: false,
        title: '',
        content: '',
        url,
        error: error.message,
        scrapingMethod: 'enhanced-puppeteer'
      };
    } finally {
      await page.close();
    }
  }

  private async hideAutomation(page: Page) {
    await page.evaluateOnNewDocument(() => {
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });

      // Mock plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
      });

      // Mock languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['tr-TR', 'tr', 'en-US', 'en']
      });

      // Add chrome object
      (window as any).chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
    });
  }

  private async handleCookieConsent(page: Page) {
    const cookieSelectors = [
      '[aria-label*="cookie"]',
      '[class*="cookie-consent"]',
      '[id*="cookie-consent"]',
      'button:has-text("Accept")',
      'button:has-text("Kabul")',
      'button:has-text("Tamam")',
      '.cookie-notice button',
      '.gdpr-consent button'
    ];

    for (const selector of cookieSelectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          await element.click();
          console.log('[ENHANCED-PUPPETEER] Clicked cookie consent');
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
  }

  private async autoScroll(page: Page) {
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

        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(timer);
          resolve();
        }, 10000);
      });
    });
  }

  private async waitForFrameworks(page: Page) {
    // Wait for React
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if ((window as any).React || (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
          // React detected, wait for it to finish
          setTimeout(resolve, 2000);
        } else if ((window as any).Vue) {
          // Vue detected
          setTimeout(resolve, 2000);
        } else if ((window as any).angular) {
          // Angular detected
          setTimeout(resolve, 2000);
        } else {
          // No framework detected
          resolve();
        }
      });
    });
  }

  private async extractContent($: cheerio.CheerioAPI, page: Page, options: EnhancedScrapeOptions): Promise<string> {
    const allSelectors = [
      ...(options.prioritySelectors || []),
      ...(options.customSelectors || []),
      // Turkish government sites (GİB, e-devlet, etc.)
      '.accordion-body',
      '.panel-body',
      '.tab-content',
      '.tab-pane.active',
      '[id*="icerik"]',
      '[class*="icerik"]',
      '.detay',
      '.makale',
      '.kanun-madde',
      '.mevzuat-content',
      '.law-content',
      '.madde-metni',
      '[class*="madde"]',
      '[class*="kanun"]',
      '[id*="madde"]',
      // MUI specific selectors
      '.MuiContainer-root',
      '.MuiGrid-root.MuiGrid-container',
      '.MuiGrid-root.MuiGrid-item',
      '[class*="MuiGrid-grid-"]',
      '.MuiPaper-root',
      '.MuiCard-root',
      '.MuiCardContent-root',
      '.MuiTypography-root',
      // React common patterns
      '[data-testid*="content"]',
      '[class*="content"]',
      '[id*="content"]',
      'main[role="main"]',
      // Common content selectors
      'article',
      'main',
      '.main-content',
      '#main-content',
      '.content',
      '#content',
      '.post',
      '.entry-content',
      '.article-content',
      // Bootstrap common patterns
      '.container .row',
      '.col-md-8',
      '.col-md-9',
      '.col-lg-8',
      '.col-lg-9'
    ];

    let contentParts: string[] = [];
    const extractedFrom: string[] = [];

    if (options.extractMode === 'all') {
      // Extract from all matching selectors
      for (const selector of allSelectors) {
        $(selector).each((_, el) => {
          const text = this.extractTextFromElement($, $(el));
          if (text && text.length > 50) {
            contentParts.push(text);
            extractedFrom.push(selector);
          }
        });
      }
    } else if (options.extractMode === 'first') {
      // Use first matching selector
      for (const selector of allSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          const text = this.extractTextFromElement($, element);
          if (text && text.length > 50) {
            contentParts.push(text);
            extractedFrom.push(selector);
            break;
          }
        }
      }
    } else {
      // 'best' mode - find selector with most content
      let bestContent = '';
      let bestSelector = '';
      
      for (const selector of allSelectors) {
        $(selector).each((_, el) => {
          const text = this.extractTextFromElement($, $(el));
          if (text && text.length > bestContent.length) {
            bestContent = text;
            bestSelector = selector;
          }
        });
      }
      
      if (bestContent) {
        contentParts.push(bestContent);
        extractedFrom.push(bestSelector);
      }
    }

    // If no content found with selectors, try page evaluate
    if (contentParts.length === 0) {
      const pageContent = await page.evaluate(() => {
        // Remove script and style elements
        const scripts = document.querySelectorAll('script, style');
        scripts.forEach(el => el.remove());
        
        // Try to get text from body
        return document.body?.innerText || document.body?.textContent || '';
      });
      
      if (pageContent) {
        contentParts.push(pageContent);
        extractedFrom.push('page.evaluate');
      }
    }

    console.log(`[ENHANCED-PUPPETEER] Extracted from: ${extractedFrom.join(', ')}`);
    return contentParts.join('\n\n').trim();
  }

  private extractTextFromElement($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): string {
    // Clone element to avoid modifying original
    const clone = element.clone();
    
    // Remove unwanted elements
    clone.find('script, style, noscript, iframe, svg').remove();
    clone.find('[aria-hidden="true"]').remove();
    clone.find('.advertisement, .ads, .social-share').remove();
    
    // Get text and clean it
    let text = clone.text();
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Singleton instance
export const enhancedPuppeteer = new EnhancedPuppeteerService();