import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';

interface GibScrapeResult {
  success: boolean;
  title: string;
  content: string;
  description?: string;
  keywords?: string;
  url: string;
  metadata?: any;
  error?: string;
  scrapingMethod?: string;
  maddeler?: Array<{
    maddeNo: string;
    baslik?: string;
    metin: string;
  }>;
}

export class GibScraperService {
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
          '--lang=tr-TR,tr'
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

  async scrapeGibPage(url: string): Promise<GibScrapeResult> {
    const browser = await this.initialize();
    const page = await browser.newPage();

    try {
      // Set Turkish user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
      
      // Set Turkish language headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      });

      console.log(`[GIB-SCRAPER] Navigating to: ${url}`);
      
      // Navigate to the page
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      console.log(`[GIB-SCRAPER] Status: ${response?.status()}`);

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if it's a law/regulation page with articles
      const isKanunPage = url.includes('/kanun/') || url.includes('/mevzuat/');
      
      if (isKanunPage) {
        // Wait for law content to load
        await page.waitForSelector('.accordion, .panel-group, .tab-content, [id*="madde"], [class*="madde"]', { 
          timeout: 10000 
        }).catch(() => {
          console.log('[GIB-SCRAPER] No article selectors found, trying alternative methods');
        });

        // Try to click on tabs or accordions to expand content
        await this.expandAllContent(page);
      }

      // Wait a bit more for dynamic content
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get page content
      const html = await page.content();
      const $ = cheerio.load(html);

      // Extract title
      const title = await page.title() || 
                   $('h1').first().text() || 
                   $('.page-title').text() ||
                   $('.baslik').text() ||
                   'Untitled';

      // Extract law articles if present
      let maddeler: Array<{ maddeNo: string; baslik?: string; metin: string }> = [];
      let content = '';

      if (isKanunPage) {
        // Try different selectors for law articles
        const maddeSelectors = [
          '.accordion-item',
          '.panel',
          '.tab-pane',
          '[id^="madde"]',
          '[class*="madde-item"]',
          '.law-article',
          '.kanun-maddesi'
        ];

        for (const selector of maddeSelectors) {
          const elements = $(selector);
          if (elements.length > 0) {
            console.log(`[GIB-SCRAPER] Found ${elements.length} articles using selector: ${selector}`);
            
            elements.each((_, el) => {
              const element = $(el);
              
              // Extract article number
              const maddeNo = element.find('.accordion-header, .panel-heading, .madde-no, h3, h4')
                .first()
                .text()
                .trim() || `Madde ${maddeler.length + 1}`;
              
              // Extract article content
              const maddeMetin = element.find('.accordion-body, .panel-body, .madde-text, .content, p')
                .text()
                .trim() || element.text().trim();
              
              if (maddeMetin && maddeMetin.length > 10) {
                maddeler.push({
                  maddeNo: maddeNo,
                  metin: maddeMetin
                });
              }
            });
            
            if (maddeler.length > 0) break;
          }
        }

        // If no articles found with structured selectors, try to extract from page text
        if (maddeler.length === 0) {
          const pageText = await page.evaluate(() => {
            return document.body?.innerText || '';
          });

          // Try to parse articles from plain text using regex
          const maddeRegex = /(?:Madde\s+(\d+)\s*[-–—:]\s*(.+?)(?=Madde\s+\d+|$))/gis;
          let match;
          
          while ((match = maddeRegex.exec(pageText)) !== null) {
            if (match[2] && match[2].trim().length > 10) {
              maddeler.push({
                maddeNo: `Madde ${match[1]}`,
                metin: match[2].trim()
              });
            }
          }
        }

        // Create content from articles
        if (maddeler.length > 0) {
          content = maddeler.map(m => `${m.maddeNo}\n${m.metin}`).join('\n\n');
          console.log(`[GIB-SCRAPER] Extracted ${maddeler.length} law articles`);
        }
      }

      // If no law articles found or not a law page, use general content extraction
      if (!content) {
        content = await this.extractGeneralContent($, page);
      }

      // Extract metadata
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
          scrapingMethod: 'gib-specialized',
          articleCount: maddeler.length
        },
        maddeler: maddeler.length > 0 ? maddeler : undefined,
        scrapingMethod: 'gib-specialized'
      };

    } catch (error: any) {
      console.error('[GIB-SCRAPER] Error:', error);
      return {
        success: false,
        title: '',
        content: '',
        url,
        error: error.message,
        scrapingMethod: 'gib-specialized'
      };
    } finally {
      await page.close();
    }
  }

  private async expandAllContent(page: Page) {
    try {
      // Try to expand accordions
      await page.evaluate(() => {
        // Bootstrap accordions
        document.querySelectorAll('.accordion-button.collapsed, .panel-heading a.collapsed').forEach(el => {
          (el as HTMLElement).click();
        });
        
        // Tab panels
        document.querySelectorAll('.nav-tabs a, .nav-pills a').forEach(el => {
          (el as HTMLElement).click();
        });
      });

      console.log('[GIB-SCRAPER] Expanded collapsible content');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.log('[GIB-SCRAPER] No expandable content found');
    }
  }

  private async extractGeneralContent($: cheerio.CheerioAPI, page: Page): Promise<string> {
    // Try various selectors for GİB and similar sites
    const contentSelectors = [
      '.accordion-body',
      '.panel-body',
      '.tab-content',
      '.tab-pane.active',
      '#icerik',
      '.icerik',
      '.content-area',
      '.page-content',
      '.main-content',
      'main',
      'article',
      '.container .row .col-md-8',
      '.container .row .col-md-9',
      '.container .row .col-lg-8',
      '.container .row .col-lg-9'
    ];

    let bestContent = '';
    
    for (const selector of contentSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        const text = elements.text().replace(/\s+/g, ' ').trim();
        if (text.length > bestContent.length) {
          bestContent = text;
          console.log(`[GIB-SCRAPER] Found content with selector: ${selector} (${text.length} chars)`);
        }
      }
    }

    // If still no content, try page evaluate
    if (bestContent.length < 100) {
      const pageContent = await page.evaluate(() => {
        // Remove navigation and footer
        const elementsToRemove = document.querySelectorAll(
          'nav, header, footer, .navbar, .header, .footer, .menu, .sidebar, script, style'
        );
        elementsToRemove.forEach(el => el.remove());
        
        // Get main content
        const main = document.querySelector('main, article, .content, #content');
        if (main) {
          return (main as HTMLElement).innerText;
        }
        
        // Fallback to body
        return document.body?.innerText || '';
      });
      
      if (pageContent && pageContent.length > bestContent.length) {
        bestContent = pageContent;
        console.log(`[GIB-SCRAPER] Extracted content via page.evaluate (${pageContent.length} chars)`);
      }
    }

    return bestContent;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Singleton instance
export const gibScraper = new GibScraperService();