import { Router, Request, Response } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { pgPool, redis } from '../server';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { encoding_for_model } from 'tiktoken';
import advancedScraper from '../services/advanced-scraper.service';
import puppeteerScraper from '../services/puppeteer-scraper.service';
import { gibScraper } from '../services/gib-scraper.service';
import { enhancedPuppeteer } from '../services/enhanced-puppeteer.service';

const router = Router();


// Helper function to count tokens
// Activity history table creation
router.post('/api/v2/activity/init-table', async (req: Request, res: Response) => {
  try {
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS activity_history (
        id SERIAL PRIMARY KEY,
        operation_type TEXT NOT NULL,
        source_url TEXT,
        title TEXT,
        status TEXT NOT NULL,
        details JSONB,
        metrics JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_operation ON activity_history(operation_type);
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_history(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_status ON activity_history(status);
    `);
    
    res.json({ success: true, message: 'Activity history table initialized' });
  } catch (error: any) {
    console.error('Table init error:', error);
    res.status(500).json({ error: 'Failed to initialize table', message: error.message });
  }
});

// Get activity history
router.get('/activity/history', async (req: Request, res: Response) => {
  try {
    const { limit = 100, offset = 0, operation_type } = req.query;
    
    let query = `
      SELECT * FROM activity_history
    `;
    const params: any[] = [];
    
    if (operation_type) {
      query += ' WHERE operation_type = $1';
      params.push(operation_type);
    }
    
    query += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    
    const result = await pgPool.query(query, params);
    
    // Get statistics
    const stats = await pgPool.query(`
      SELECT 
        operation_type,
        COUNT(*) as count,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
        AVG((metrics->>'token_count')::int) as avg_tokens,
        SUM((metrics->>'token_count')::int) as total_tokens,
        AVG((metrics->>'chunk_count')::int) as avg_chunks,
        SUM((metrics->>'chunk_count')::int) as total_chunks,
        AVG((metrics->>'content_length')::int) as avg_content_length
      FROM activity_history
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY operation_type
    `);
    
    res.json({
      success: true,
      activities: result.rows,
      total: result.rowCount,
      statistics: stats.rows
    });
  } catch (error: any) {
    console.error('Error fetching activity history:', error);
    res.status(500).json({ 
      error: 'Failed to fetch activity history',
      message: error.message 
    });
  }
});

// Helper function to log activity
async function logActivity(
  operationType: string,
  sourceUrl: string | null,
  title: string | null,
  status: string,
  details: any,
  metrics: any,
  errorMessage?: string
) {
  try {
    await pgPool.query(`
      INSERT INTO activity_history (
        operation_type, source_url, title, status, details, metrics, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [operationType, sourceUrl, title, status, 
        JSON.stringify(details), JSON.stringify(metrics), errorMessage]);
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

function countTokens(text: string): number {
  try {
    const encoder = encoding_for_model('gpt-3.5-turbo');
    const tokens = encoder.encode(text);
    const count = tokens.length;
    encoder.free();
    return count;
  } catch (error) {
    // Fallback to character-based estimation (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }
}

// Web scraper endpoint with dynamic content support
router.post('/', async (req: Request, res: Response) => {
  const startTime = Date.now();
  let activityMetrics: any = {};
  let activityDetails: any = {};
  
  try {
    const { 
      url, 
      saveToDb = false, 
      mode = 'auto', 
      generateEmbeddings = false,
      customSelectors = [],
      prioritySelectors = [],
      extractMode = 'best'
    } = req.body;
    
    // Check if it's a Turkish government site
    const isTurkishGovSite = /\.gov\.tr|gib\.gov|mevzuat|kanun|resmigazete|tbmm\.gov|hazine\.gov|tcmb\.gov|sgk\.gov|iskur\.gov/i.test(url);
    
    // Auto-detect if we need dynamic scraping
    let useDynamic = mode === 'dynamic';
    let usePuppeteer = mode === 'puppeteer';
    let useGibScraper = isTurkishGovSite && (mode === 'auto' || mode === 'gib');
    let useEnhancedPuppeteer = false;
    
    if (mode === 'auto') {
      // Sites that typically need dynamic rendering  
      const dynamicPatterns = [
        /\.gov\./i,  // Government sites often need dynamic
        /twitter\.com/i,
        /x\.com/i,
        /instagram\.com/i,
        /facebook\.com/i,
        /linkedin\.com/i,
        /youtube\.com/i,
        /medium\.com/i,
        /dev\.to/i,
        /stackoverflow\.com/i
      ];
      
      // Check if URL matches any pattern that needs dynamic rendering
      useDynamic = dynamicPatterns.some(pattern => pattern.test(url));
      
      // Use enhanced puppeteer for sites with MUI or complex JS
      if (useDynamic && !isTurkishGovSite) {
        useEnhancedPuppeteer = true;
      }
    }
    
    if (!url) {
      await logActivity('scrape', null, null, 'error', {}, {}, 'URL is required');
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log(`[SCRAPER] Starting scrape for: ${url}`);
    console.log(`[SCRAPER] Mode: ${useGibScraper ? 'GİB Specialized' : useEnhancedPuppeteer ? 'Enhanced Puppeteer' : usePuppeteer ? 'puppeteer (advanced)' : (useDynamic ? 'dynamic (playwright)' : 'static (cheerio)')}`);
    
    // Use GİB scraper for Turkish government sites
    if (useGibScraper) {
      console.log('[SCRAPER] Using GİB specialized scraper for Turkish government site');
      const gibResult = await gibScraper.scrapeGibPage(url);
      
      if (gibResult.success && gibResult.content) {
        // Save to database if requested
        let savedId = null;
        if (saveToDb) {
          const insertResult = await pgPool.query(
            `INSERT INTO scraped_pages (url, title, content, description, keywords, content_length, scraping_mode, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              url,
              gibResult.title,
              gibResult.content,
              gibResult.description || '',
              gibResult.keywords || '',
              gibResult.content.length,
              'gib-specialized',
              JSON.stringify({
                ...gibResult.metadata,
                maddeler: gibResult.maddeler
              })
            ]
          );
          savedId = insertResult.rows[0].id;
        }
        
        // Create chunks for the content
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200,
          separators: ['\n\n', '\n', '.', '!', '?', ';', ':', ' ', '']
        });
        
        const chunks = await textSplitter.splitText(gibResult.content);
        
        // Generate embeddings if requested
        let embeddings: number[][] = [];
        if (generateEmbeddings && savedId) {
          // Here you would generate embeddings
          // For now, we'll skip this part
        }
        
        // Log activity
        await logActivity(
          'scrape',
          url,
          gibResult.title,
          'success',
          {
            url,
            title: gibResult.title,
            description: gibResult.description,
            scrapeMethod: 'gib-specialized',
            articleCount: gibResult.maddeler?.length || 0
          },
          {
            content_length: gibResult.content.length,
            chunk_count: chunks.length,
            embedding_count: embeddings.length,
            scraping_mode: 'gib-specialized',
            extraction_time_ms: Date.now() - startTime,
            article_count: gibResult.maddeler?.length || 0
          },
          undefined
        );
        
        return res.json({
          success: true,
          title: gibResult.title,
          content: gibResult.content.substring(0, 5000),
          contentPreview: gibResult.content.substring(0, 500) + '...',
          description: gibResult.description || '',
          keywords: gibResult.keywords || '',
          url,
          metadata: {
            ...gibResult.metadata,
            scrapingMode: 'gib-specialized',
            articleCount: gibResult.maddeler?.length || 0
          },
          maddeler: gibResult.maddeler, // Include extracted law articles
          metrics: {
            contentLength: gibResult.content.length,
            htmlLength: 0,
            chunksCreated: chunks.length,
            embeddingsGenerated: embeddings.length,
            totalTokens: 0,
            extractionTimeMs: Date.now() - startTime,
            articleCount: gibResult.maddeler?.length || 0
          },
          savedToDb: saveToDb,
          timestamp: new Date().toISOString()
        });
      } else {
        // If GİB scraper fails, fall back to enhanced puppeteer
        console.log('[SCRAPER] GİB scraper failed, falling back to enhanced puppeteer');
        useEnhancedPuppeteer = true;
      }
    }
    
    // Use enhanced puppeteer for complex JS sites
    if (useEnhancedPuppeteer) {
      console.log('[SCRAPER] Using enhanced puppeteer for complex JS site');
      const enhancedResult = await enhancedPuppeteer.scrape(url, {
        customSelectors,
        prioritySelectors,
        extractMode,
        scrollToBottom: true,
        clickCookieConsent: true,
        interceptRequests: false
      });
      
      if (enhancedResult.success && enhancedResult.content) {
        // Save to database if requested
        let savedId = null;
        if (saveToDb) {
          const insertResult = await pgPool.query(
            `INSERT INTO scraped_pages (url, title, content, description, keywords, content_length, scraping_mode, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              url,
              enhancedResult.title,
              enhancedResult.content,
              enhancedResult.description || '',
              enhancedResult.keywords || '',
              enhancedResult.content.length,
              'enhanced-puppeteer',
              JSON.stringify(enhancedResult.metadata)
            ]
          );
          savedId = insertResult.rows[0].id;
        }
        
        // Create chunks
        const textSplitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1000,
          chunkOverlap: 200
        });
        
        const chunks = await textSplitter.splitText(enhancedResult.content);
        
        // Log activity
        await logActivity(
          'scrape',
          url,
          enhancedResult.title,
          'success',
          {
            url,
            title: enhancedResult.title,
            description: enhancedResult.description,
            scrapeMethod: 'enhanced-puppeteer'
          },
          {
            content_length: enhancedResult.content.length,
            chunk_count: chunks.length,
            scraping_mode: 'enhanced-puppeteer',
            extraction_time_ms: Date.now() - startTime
          },
          undefined
        );
        
        return res.json({
          success: true,
          title: enhancedResult.title,
          content: enhancedResult.content.substring(0, 5000),
          contentPreview: enhancedResult.content.substring(0, 500) + '...',
          description: enhancedResult.description || '',
          keywords: enhancedResult.keywords || '',
          url,
          metadata: {
            ...enhancedResult.metadata,
            scrapingMode: 'enhanced-puppeteer'
          },
          metrics: {
            contentLength: enhancedResult.content.length,
            htmlLength: 0,
            chunksCreated: chunks.length,
            embeddingsGenerated: 0,
            totalTokens: 0,
            extractionTimeMs: Date.now() - startTime
          },
          savedToDb: saveToDb,
          timestamp: new Date().toISOString()
        });
      } else {
        // Fall back to regular puppeteer
        console.log('[SCRAPER] Enhanced puppeteer failed, falling back to regular puppeteer');
        usePuppeteer = true;
      }
    }
    
    // Use advanced scraper for custom selectors
    if (customSelectors.length > 0 || prioritySelectors.length > 0) {
      console.log('[SCRAPER] Using advanced scraper with custom selectors');
      const advancedResults = await advancedScraper.scrapeWebsite(url, {
        mode,
        saveToDb,
        generateEmbeddings,
        customSelectors,
        prioritySelectors,
        extractMode,
        maxDepth: 1,
        maxPages: 1
      });
      
      if (advancedResults && advancedResults.length > 0) {
        const result = advancedResults[0];
        
        // Log activity
        await logActivity(
          'scrape',
          url,
          result.title,
          'success',
          {
            url,
            title: result.title,
            description: result.description,
            scrapeMethod: 'advanced',
            customSelectors: customSelectors.length,
            prioritySelectors: prioritySelectors.length
          },
          {
            content_length: result.content.length,
            chunk_count: result.chunks?.length || 0,
            embedding_count: result.embeddings?.length || 0,
            scraping_mode: 'advanced',
            extraction_time_ms: Date.now() - startTime
          },
          undefined
        );
        
        return res.json({
          success: true,
          title: result.title,
          content: result.content.substring(0, 5000),
          contentPreview: result.content.substring(0, 500) + '...',
          description: result.description || '',
          keywords: result.keywords || '',
          url,
          metadata: {
            ...result.metadata,
            scrapingMode: 'advanced',
            customSelectors: customSelectors.length,
            prioritySelectors: prioritySelectors.length,
            extractMode
          },
          metrics: {
            contentLength: result.content.length,
            htmlLength: 0,
            chunksCreated: result.chunks?.length || 0,
            embeddingsGenerated: result.embeddings?.length || 0,
            totalTokens: 0,
            extractionTimeMs: Date.now() - startTime
          },
          savedToDb: saveToDb,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Use Puppeteer for sites that need advanced scraping
    if (usePuppeteer) {
      console.log('[SCRAPER] Using Puppeteer for enhanced scraping');
      const puppeteerResult = await puppeteerScraper.scrapeWithPuppeteer(url, { saveToDb, generateEmbeddings });
      
      if (puppeteerResult.success && puppeteerResult.content) {
        // Save to database if requested
        let savedId = null;
        if (saveToDb) {
          savedId = await puppeteerScraper.saveToDatabase(url, puppeteerResult);
        }
        
        // Embeddings are handled within the saveToDatabase method
        let embeddings: number[][] = [];
        
        // Log activity
        await logActivity(
          'scrape',
          url,
          puppeteerResult.title,
          'success',
          {
            url,
            title: puppeteerResult.title,
            description: puppeteerResult.description,
            scrapeMethod: 'puppeteer'
          },
          {
            content_length: puppeteerResult.content.length,
            chunk_count: puppeteerResult.chunks?.length || 0,
            embedding_count: embeddings.length,
            scraping_mode: 'puppeteer',
            extraction_time_ms: Date.now() - startTime
          },
          undefined
        );
        
        return res.json({
          success: true,
          title: puppeteerResult.title,
          content: puppeteerResult.content.substring(0, 5000),
          contentPreview: puppeteerResult.content.substring(0, 500) + '...',
          description: puppeteerResult.description || '',
          keywords: puppeteerResult.keywords || '',
          url,
          metadata: {
            ...puppeteerResult.metadata,
            scrapingMode: 'puppeteer'
          },
          metrics: {
            contentLength: puppeteerResult.content.length,
            htmlLength: 0,
            chunksCreated: puppeteerResult.chunks?.length || 0,
            embeddingsGenerated: embeddings.length,
            totalTokens: 0,
            extractionTimeMs: Date.now() - startTime
          },
          savedToDb: saveToDb,
          timestamp: new Date().toISOString()
        });
      } else {
        // If Puppeteer fails, fall back to regular scraping
        console.log('[SCRAPER] Puppeteer failed, falling back to Playwright');
        useDynamic = true;
      }
    }
    
    let htmlContent = '';
    let pageTitle = '';
    let statusCode = 200;
    
    if (useDynamic) {
      // Use Playwright for dynamic content
      console.log('[SCRAPER] Using Playwright for dynamic content...');
      try {
        const browser = await chromium.launch({ 
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        try {
          const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
          });
          const page = await context.newPage();
          
          // Navigate with timeout
          await page.goto(url, { 
            waitUntil: 'networkidle',
            timeout: 30000 
          });
          
          // Wait for content to load
          await page.waitForTimeout(5000);
          
          // For GİB site, wait for specific content
          if (url.includes('gib.gov.tr')) {
            try {
              await page.waitForSelector('.icerik, .content, #content, .mevzuat-icerik', { timeout: 5000 });
            } catch {
              console.log('[SCRAPER] GİB content selector not found, continuing...');
            }
          }
          
          // Try to click "accept cookies" or similar buttons
          try {
            await page.click('button:has-text("Accept")', { timeout: 2000 });
          } catch {}
          
          // Scroll to load lazy content
          await page.evaluate(() => {
            // This runs in browser context where window/document are available
            const win = window as any;
            const doc = document as any;
            win.scrollTo(0, doc.body.scrollHeight);
          });
          await page.waitForTimeout(2000);
          
          // Get the HTML content
          htmlContent = await page.content();
          pageTitle = await page.title();
          
          console.log(`[SCRAPER] Page title: ${pageTitle}`);
          console.log(`[SCRAPER] HTML content length: ${htmlContent.length}`);
          
          await browser.close();
        } catch (browserError) {
          await browser.close();
          throw browserError;
        }
      } catch (playwrightError: any) {
        console.warn('[SCRAPER] Playwright error, falling back to axios:', playwrightError.message);
        useDynamic = false;
      }
    }
    
    if (!useDynamic) {
      // Use axios for static content
      console.log('[SCRAPER] Using axios for static content...');
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });
      
      htmlContent = response.data;
      statusCode = response.status;
      console.log(`[SCRAPER] Response status: ${statusCode}`);
      console.log(`[SCRAPER] HTML content length: ${htmlContent.length}`);
    }

    // Parse HTML with Cheerio
    const $ = cheerio.load(htmlContent);
    
    // Remove non-content elements
    $('script').remove();
    $('style').remove();
    $('noscript').remove();
    $('iframe').remove();
    $('[style*="display:none"]').remove();
    $('[style*="display: none"]').remove();
    $('[aria-hidden="true"]').remove();
    $('svg').remove();
    $('img').remove();
    
    // Get title
    const title = pageTitle || $('title').text() || $('h1').first().text() || 'Untitled';
    
    // Enhanced content extraction
    let content = '';
    
    // First, try article and main content areas
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '#content',
      '.post',
      '.entry-content',
      '.article-content',
      '.article-body',
      '.post-content',
      '.page-content',
      'section.content',
      'div.content-wrapper',
      '.markdown-body',
      '.prose',
      '[itemprop="articleBody"]',
      // GİB specific selectors
      '.icerik',
      '.icerik-alani',
      '.kanun-icerik',
      '.mevzuat-icerik',
      '#icerik',
      '.sayfa-icerik',
      '.detail-content',
      '.mevzuat-detay',
      '.kanun-detay'
    ];
    
    let mainContent = null;
    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0 && element.text().trim().length > 100) {
        mainContent = element;
        console.log(`[SCRAPER] Found main content with selector: ${selector}`);
        break;
      }
    }
    
    if (mainContent) {
      // Extract text preserving structure
      content = extractTextWithStructure($ as any, mainContent);
    } else {
      // Remove navigation and footer elements
      $('nav, header, footer, aside, .sidebar, .menu, .navigation, .breadcrumb').remove();
      $('.share, .social, .comments, .related, .advertisement, .ads, .cookie').remove();
      $('[class*="sidebar"], [class*="menu"], [id*="menu"], [id*="nav"]').remove();
      
      // Extract headings and paragraphs
      const headings = $('h1, h2, h3, h4, h5, h6').map((_, el) => $(el).text().trim()).get();
      const paragraphs = $('p').map((_, el) => $(el).text().trim()).get()
        .filter(text => text.length > 30);
      
      // Get list items
      const listItems = $('li').map((_, el) => {
        const $el = $(el);
        if ($el.parents('nav, header, footer, aside').length === 0) {
          return $el.text().trim();
        }
        return '';
      }).get().filter(text => text.length > 20);
      
      // Combine all content
      const allTexts = [...headings, ...paragraphs, ...listItems];
      content = allTexts.join('\n\n');
      
      // If still not enough content, get body text
      if (content.length < 200) {
        content = $('body').text();
        console.log('[SCRAPER] Fallback to body text extraction');
      }
    }
    
    // Clean and format content
    content = content
      .replace(/\t+/g, ' ')
      .replace(/[ ]+/g, ' ')
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/^\s*\n/gm, '')
      .trim();
    
    console.log(`[SCRAPER] Extracted content length: ${content.length} characters`);
    
    // Get metadata
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || '';
    const keywords = $('meta[name="keywords"]').attr('content') || '';
    const author = $('meta[name="author"]').attr('content') || 
                  $('meta[property="article:author"]').attr('content') || '';
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    const ogImage = $('meta[property="og:image"]').attr('content') || '';
    const publishDate = $('meta[property="article:published_time"]').attr('content') || 
                       $('time[datetime]').first().attr('datetime') || '';
    
    const finalTitle = title || ogTitle || 'Untitled';
    const finalDescription = description || '';
    
    // Use LangChain text splitter for better chunking
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1500,
      chunkOverlap: 200,
      separators: ['\n\n\n', '\n\n', '\n', '. ', ', ', ' ', ''],
      lengthFunction: (text: string) => countTokens(text),
    });
    
    const chunks = await splitter.splitText(content);
    console.log(`[SCRAPER] Created ${chunks.length} chunks`);
    
    // Generate embeddings for each chunk
    const embeddings: number[][] = [];
    let totalTokens = 0;
    
    if (generateEmbeddings && chunks.length > 0) {
      for (const chunk of chunks) {
        const embedding = generateLocalEmbedding(chunk);
        embeddings.push(embedding);
        totalTokens += countTokens(chunk);
      }
      console.log(`[SCRAPER] Generated ${embeddings.length} embeddings, total tokens: ${totalTokens}`);
    }
    
    // Prepare metrics
    activityMetrics = {
      content_length: content.length,
      html_length: htmlContent.length,
      chunk_count: chunks.length,
      embedding_count: embeddings.length,
      token_count: totalTokens,
      scraping_mode: useDynamic ? 'dynamic' : 'static',
      extraction_time_ms: Date.now() - startTime
    };
    
    activityDetails = {
      url,
      title: finalTitle,
      description: finalDescription,
      author,
      publish_date: publishDate,
      chunks_preview: chunks.slice(0, 2).map(c => c.substring(0, 100) + '...')
    };
    
    // Save to database
    let savedId = null;
    if (saveToDb && content.length > 0) {
      try {
        // Create scraped_data table if it doesn't exist
        await pgPool.query(`
          CREATE TABLE IF NOT EXISTS scraped_data (
            id SERIAL PRIMARY KEY,
            url TEXT UNIQUE NOT NULL,
            title TEXT,
            content TEXT,
            description TEXT,
            keywords TEXT,
            metadata JSONB,
            content_chunks TEXT[],
            embeddings vector(1536)[],
            chunk_count INTEGER DEFAULT 0,
            content_length INTEGER,
            token_count INTEGER,
            scraping_mode TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Prepare metadata JSON
        const metadataJson = JSON.stringify({
          author,
          ogTitle,
          ogImage,
          publishDate,
          scrapingMode: useDynamic ? 'dynamic' : 'static',
          extractionTime: Date.now() - startTime
        });
        
        // Format embeddings for pgvector
        let formattedEmbeddings = null;
        if (embeddings.length > 0) {
          // Convert array of arrays to array of vector strings
          formattedEmbeddings = embeddings.map(embedding => 
            `[${embedding.join(',')}]`
          );
        }
        
        // Insert or update the scraped content
        const result = await pgPool.query(`
          INSERT INTO scraped_data (
            url, title, content, description, keywords, metadata,
            content_chunks, chunk_count, content_length, 
            token_count, scraping_mode
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
            token_count = EXCLUDED.token_count,
            scraping_mode = EXCLUDED.scraping_mode,
            updated_at = CURRENT_TIMESTAMP
          RETURNING id
        `, [
          url, 
          finalTitle, 
          content, 
          finalDescription, 
          keywords, 
          metadataJson,
          chunks,
          chunks.length,
          content.length,
          totalTokens,
          useDynamic ? 'dynamic' : 'static'
        ]);
        
        // Store embeddings separately if they exist
        if (formattedEmbeddings && formattedEmbeddings.length > 0) {
          try {
            for (let i = 0; i < formattedEmbeddings.length && i < chunks.length; i++) {
              await pgPool.query(`
                INSERT INTO document_embeddings (
                  document_id, 
                  chunk_text, 
                  embedding,
                  metadata
                )
                VALUES ($1, $2, $3::vector, $4)
              `, [
                result.rows[0].id,
                chunks[i],
                formattedEmbeddings[i],
                JSON.stringify({
                  chunk_index: i,
                  total_chunks: chunks.length,
                  url: url
                })
              ]);
            }
          } catch (embError) {
            console.error('[SCRAPER] Embedding storage error:', embError);
          }
        }
        
        savedId = result.rows[0].id;
        console.log(`[SCRAPER] Saved to database with ID: ${savedId}`);
      } catch (dbError) {
        console.error('[SCRAPER] Database save error:', dbError);
      }
    }
    
    // Log successful activity
    await logActivity(
      'scrape',
      url,
      finalTitle,
      'success',
      activityDetails,
      activityMetrics,
      undefined
    );
    
    const response = {
      success: true,
      title: finalTitle,
      content: content.substring(0, 5000), // Return first 5000 chars
      contentPreview: content.substring(0, 500) + '...',
      description: finalDescription,
      keywords,
      url,
      metadata: {
        author,
        ogTitle,
        ogImage,
        publishDate,
        scrapingMode: useDynamic ? 'dynamic' : 'static',
        statusCode
      },
      metrics: {
        contentLength: content.length,
        htmlLength: htmlContent.length,
        chunksCreated: chunks.length,
        embeddingsGenerated: embeddings.length,
        totalTokens,
        extractionTimeMs: Date.now() - startTime
      },
      savedToDb: !!savedId,
      dbId: savedId,
      timestamp: new Date().toISOString()
    };
    
    console.log(`[SCRAPER] Completed successfully in ${Date.now() - startTime}ms`);
    res.json(response);
    
  } catch (error: any) {
    console.error('[SCRAPER] Error:', error);
    
    // Log error activity
    await logActivity(
      'scrape',
      req.body.url,
      null,
      'error',
      { url: req.body.url, mode: req.body.mode },
      activityMetrics,
      error.message
    );
    
    // Provide detailed error messages
    let statusCode = 500;
    let errorMessage = 'Failed to scrape content';
    
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      statusCode = 408;
      errorMessage = 'Request timeout - the website took too long to respond';
    } else if (error.response) {
      statusCode = error.response.status;
      if (statusCode === 404) {
        errorMessage = 'Page not found';
      } else if (statusCode === 403) {
        errorMessage = 'Access forbidden - the website blocked our request';
      } else if (statusCode === 429) {
        errorMessage = 'Too many requests - please try again later';
      } else {
        errorMessage = `Website returned error: ${statusCode}`;
      }
    } else if (error.code === 'ENOTFOUND') {
      statusCode = 400;
      errorMessage = 'Invalid URL or domain not found';
    } else if (error.code === 'ECONNREFUSED') {
      statusCode = 503;
      errorMessage = 'Connection refused by the website';
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      message: error.message,
      url: req.body.url
    });
  }
});

// Helper function to extract text with structure
function extractTextWithStructure($: cheerio.CheerioAPI, element: any): string {
  const texts: string[] = [];
  
  // Process all text nodes
  element.find('*').each((_: number, el: any) => {
    const $el = $(el);
    const tagName = el.name.toLowerCase();
    
    // Skip certain tags
    if (['script', 'style', 'noscript'].includes(tagName)) {
      return;
    }
    
    // Get text content
    const text = $el.clone().children().remove().end().text().trim();
    
    if (text) {
      // Add formatting based on tag
      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        texts.push(`\n\n${text}\n`);
      } else if (tagName === 'p' || tagName === 'div') {
        if (text.length > 20) {
          texts.push(`${text}\n`);
        }
      } else if (tagName === 'li') {
        texts.push(`• ${text}\n`);
      } else if (text.length > 10) {
        texts.push(text);
      }
    }
  });
  
  return texts.join(' ').replace(/\s+/g, ' ').trim();
}

// Helper function to generate local embeddings
function generateLocalEmbedding(text: string): number[] {
  // This creates a deterministic 1536-dimensional embedding from text
  const embedding = new Array(1536).fill(0);
    
  // Use multiple hash functions for better distribution
  const hashFunctions = [
    (char: number, i: number) => Math.sin(char * 0.01 + i * 0.001),
    (char: number, i: number) => Math.cos(char * 0.02 + i * 0.002),
    (char: number, i: number) => Math.sin(char * 0.03) * Math.cos(i * 0.003),
    (char: number, i: number) => (char * i) % 1
  ];
  
  // Process text to generate embedding
  for (let i = 0; i < Math.min(text.length, 2000); i++) {
    const charCode = text.charCodeAt(i);
    
    // Apply multiple hash functions
    hashFunctions.forEach((hashFn, fnIdx) => {
      const value = hashFn(charCode, i);
      const index = Math.abs(Math.floor((charCode * (i + 1) * (fnIdx + 1)) % embedding.length));
      embedding[index] += value;
    });
  }
  
  // Apply non-linear transformation
  for (let i = 0; i < embedding.length; i++) {
    embedding[i] = Math.tanh(embedding[i] / 10);
  }
  
  // Normalize to unit vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }
  
  return embedding;
}

// Embeddings endpoint
router.post('/api/v2/embeddings', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { text, model = 'local' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const useLocalEmbeddings = model === 'local' || process.env.USE_LOCAL_EMBEDDINGS !== 'false';
    
    if (useLocalEmbeddings) {
      // Generate local embedding
      const embedding = generateLocalEmbedding(text);
      const tokenCount = countTokens(text);
      
      // Log activity
      await logActivity(
        'embedding',
        null,
        text.substring(0, 50) + '...',
        'success',
        { 
          model: 'local-hash-v2',
          text_preview: text.substring(0, 100),
          text_length: text.length
        },
        {
          token_count: tokenCount,
          dimensions: embedding.length,
          generation_time_ms: Date.now() - startTime
        },
        undefined
      );

      res.json({
        success: true,
        embedding,
        model: 'local-hash-v2',
        dimensions: embedding.length,
        tokens: tokenCount,
        text: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
        timestamp: new Date().toISOString()
      });
    } else {
      // API embeddings placeholder
      await logActivity(
        'embedding',
        null,
        null,
        'error',
        { text_preview: text.substring(0, 100) },
        {},
        'API embeddings not configured'
      );
      
      return res.status(501).json({ 
        error: 'API embeddings not available',
        message: 'Please use local embeddings or add working API keys',
        suggestion: 'Set USE_LOCAL_EMBEDDINGS=true in .env file'
      });
    }
  } catch (error: any) {
    console.error('Embeddings error:', error);
    
    await logActivity(
      'embedding',
      null,
      null,
      'error',
      { text_preview: req.body.text?.substring(0, 100) },
      {},
      error.message
    );
    
    res.status(500).json({ 
      error: 'Failed to generate embeddings',
      message: error.message 
    });
  }
});

// Get scraper history/pages
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    
    const result = await pgPool.query(`
      SELECT 
        id, 
        title, 
        url, 
        description, 
        content_length, 
        chunk_count,
        token_count, 
        scraping_mode, 
        created_at, 
        updated_at
      FROM scraped_data
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    
    res.json({
      success: true,
      pages: result.rows,
      total: result.rowCount
    });
  } catch (error: any) {
    console.error('Error fetching scraped pages:', error);
    res.status(500).json({ 
      error: 'Failed to fetch scraped pages',
      message: error.message 
    });
  }
});

// Get all scraped pages with metrics
router.get('/pages', async (req: Request, res: Response) => {
  try {
    const result = await pgPool.query(`
      SELECT 
        id, 
        title, 
        url, 
        description, 
        content_length, 
        chunk_count,
        token_count, 
        scraping_mode, 
        created_at, 
        updated_at
      FROM scraped_data
      ORDER BY created_at DESC
      LIMIT 100
    `);
    
    // Get summary statistics
    const stats = await pgPool.query(`
      SELECT 
        COUNT(*) as total_pages,
        SUM(content_length) as total_characters,
        SUM(chunk_count) as total_chunks,
        SUM(token_count) as total_tokens,
        AVG(content_length) as avg_content_length,
        AVG(chunk_count) as avg_chunks,
        AVG(token_count) as avg_tokens
      FROM scraped_data
    `);
    
    res.json({
      success: true,
      pages: result.rows,
      total: result.rowCount,
      statistics: stats.rows[0]
    });
  } catch (error: any) {
    console.error('Error fetching pages:', error);
    res.status(500).json({ 
      error: 'Failed to fetch pages',
      message: error.message 
    });
  }
});

// Get single scraped page with full details
router.get('/pages/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pgPool.query(`
      SELECT * FROM scraped_data WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    const page = result.rows[0];
    
    // Return formatted response
    res.json({
      success: true,
      page: {
        ...page,
        chunks_preview: page.content_chunks ? 
          page.content_chunks.slice(0, 3).map((c: string) => c.substring(0, 200) + '...') : [],
        has_embeddings: !!page.embeddings && page.embeddings.length > 0
      }
    });
  } catch (error: any) {
    console.error('Error fetching page:', error);
    res.status(500).json({ 
      error: 'Failed to fetch page',
      message: error.message 
    });
  }
});

// Delete scraped page
router.delete('/api/v2/scraper/pages/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pgPool.query(`
      DELETE FROM scraped_data WHERE id = $1 RETURNING id, title, url
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    // Log deletion
    await logActivity(
      'delete',
      result.rows[0].url,
      result.rows[0].title,
      'success',
      { deleted_id: id },
      {},
      undefined
    );
    
    res.json({
      success: true,
      message: 'Page deleted successfully',
      deletedId: result.rows[0].id
    });
  } catch (error: any) {
    console.error('Error deleting page:', error);
    res.status(500).json({ 
      error: 'Failed to delete page',
      message: error.message 
    });
  }
});

// Advanced scraping endpoints
router.post('/api/v2/scraper/crawl', async (req: Request, res: Response) => {
  try {
    const {
      url,
      maxDepth = 2,
      maxPages = 10,
      followLinks = true,
      generateEmbeddings = false,
      saveToDb = true,
      includePatterns = [],
      excludePatterns = []
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Start crawling in background and track progress
    const jobId = `crawl_${Date.now()}`;
    
    // Initialize job status
    await redis.set(`job:${jobId}`, JSON.stringify({
      status: 'processing',
      url,
      progress: 0,
      totalPages: 0,
      processedPages: 0,
      startTime: new Date()
    }), 'EX', 3600);

    // Start crawling asynchronously
    advancedScraper.scrapeWebsite(url, {
      maxDepth,
      maxPages,
      followLinks,
      generateEmbeddings,
      saveToDb,
      includePatterns,
      excludePatterns
    }).then(async (results) => {
      // Update job status
      await redis.set(`job:${jobId}`, JSON.stringify({
        status: 'completed',
        url,
        progress: 100,
        totalPages: results.length,
        processedPages: results.length,
        results: results.map(r => ({
          url: r.url,
          title: r.title,
          contentLength: r.content.length,
          chunksCount: r.chunks?.length || 0
        })),
        completedTime: new Date()
      }), 'EX', 3600);
    }).catch(async (error) => {
      // Update job status with error
      await redis.set(`job:${jobId}`, JSON.stringify({
        status: 'failed',
        url,
        error: error.message,
        failedTime: new Date()
      }), 'EX', 3600);
    });

    res.json({
      success: true,
      jobId,
      message: 'Crawling started',
      statusUrl: `/api/v2/scraper/job/${jobId}`
    });
  } catch (error: any) {
    console.error('Crawl error:', error);
    res.status(500).json({ 
      error: 'Failed to start crawling',
      message: error.message 
    });
  }
});

// Batch scraping endpoint
router.post('/api/v2/scraper/batch', async (req: Request, res: Response) => {
  try {
    const {
      urls,
      generateEmbeddings = false,
      saveToDb = true
    } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    const jobId = `batch_${Date.now()}`;
    
    // Initialize job status
    await redis.set(`job:${jobId}`, JSON.stringify({
      status: 'processing',
      totalUrls: urls.length,
      processedUrls: 0,
      progress: 0,
      startTime: new Date()
    }), 'EX', 3600);

    // Process batch asynchronously
    advancedScraper.scrapeBatch(urls, {
      generateEmbeddings,
      saveToDb
    }).then(async (results) => {
      await redis.set(`job:${jobId}`, JSON.stringify({
        status: 'completed',
        totalUrls: urls.length,
        processedUrls: results.length,
        progress: 100,
        results: results.map(r => ({
          url: r.url,
          title: r.title,
          success: !r.error,
          error: r.error
        })),
        completedTime: new Date()
      }), 'EX', 3600);
    }).catch(async (error) => {
      await redis.set(`job:${jobId}`, JSON.stringify({
        status: 'failed',
        error: error.message,
        failedTime: new Date()
      }), 'EX', 3600);
    });

    res.json({
      success: true,
      jobId,
      message: 'Batch scraping started',
      totalUrls: urls.length,
      statusUrl: `/api/v2/scraper/job/${jobId}`
    });
  } catch (error: any) {
    console.error('Batch scraping error:', error);
    res.status(500).json({ 
      error: 'Failed to start batch scraping',
      message: error.message 
    });
  }
});

// Get job status
router.get('/job/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const jobData = await redis.get(`job:${jobId}`);
    
    if (!jobData) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const job = JSON.parse(jobData);
    res.json({
      success: true,
      job
    });
  } catch (error: any) {
    console.error('Error fetching job:', error);
    res.status(500).json({ 
      error: 'Failed to fetch job status',
      message: error.message 
    });
  }
});

// Get sitemap URLs
router.post('/api/v2/scraper/sitemap', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const baseUrl = new URL(url);
    const sitemapUrl = `${baseUrl.protocol}//${baseUrl.host}/sitemap.xml`;
    
    const response = await axios.get(sitemapUrl, { timeout: 10000 });
    const $ = cheerio.load(response.data, { xmlMode: true });
    
    const urls: string[] = [];
    $('url > loc').each((_, el) => {
      const loc = $(el).text();
      if (loc) {
        urls.push(loc);
      }
    });
    
    res.json({
      success: true,
      sitemapUrl,
      urlsFound: urls.length,
      urls: urls.slice(0, 100), // Return first 100 URLs
      hasMore: urls.length > 100
    });
  } catch (error: any) {
    console.error('Sitemap error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sitemap',
      message: error.message 
    });
  }
});

// Initialize tables endpoint
router.post('/api/v2/scraper/init-table', async (req: Request, res: Response) => {
  try {
    // Create scraped_data table
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS scraped_data (
        id SERIAL PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        content TEXT,
        description TEXT,
        keywords TEXT,
        metadata JSONB,
        content_chunks TEXT[],
        embeddings vector(1536)[],
        chunk_count INTEGER DEFAULT 0,
        content_length INTEGER,
        token_count INTEGER,
        scraping_mode TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create activity_history table
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS activity_history (
        id SERIAL PRIMARY KEY,
        operation_type TEXT NOT NULL,
        source_url TEXT,
        title TEXT,
        status TEXT NOT NULL,
        details JSONB,
        metrics JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_scraped_data_url ON scraped_data(url);
      CREATE INDEX IF NOT EXISTS idx_scraped_data_created_at ON scraped_data(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_operation ON activity_history(operation_type);
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_history(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_status ON activity_history(status);
    `);
    
    res.json({ success: true, message: 'Tables initialized successfully' });
  } catch (error: any) {
    console.error('Table init error:', error);
    res.status(500).json({ error: 'Failed to initialize tables', message: error.message });
  }
});

// Start scraping session
router.post('/api/v2/scraper/start', async (req: Request, res: Response) => {
  try {
    const { url, config } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // For now, return a simple response
    res.json({
      success: true,
      sessionId: `session_${Date.now()}`,
      status: 'started',
      url,
      message: 'Scraping session started'
    });
  } catch (error: any) {
    console.error('Error starting scraping:', error);
    res.status(500).json({
      error: 'Failed to start scraping',
      message: error.message
    });
  }
});

// Pause scraping session
router.post('/api/v2/scraper/pause', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // For now, return a simple response
    res.json({
      success: true,
      sessionId,
      status: 'paused',
      message: 'Scraping session paused'
    });
  } catch (error: any) {
    console.error('Error pausing scraping:', error);
    res.status(500).json({
      error: 'Failed to pause scraping',
      message: error.message
    });
  }
});

// Get scraper sessions (for dashboard)
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    // For now, return empty sessions array
    res.json({
      success: true,
      sessions: [],
      total: 0
    });
  } catch (error: any) {
    console.error('Error fetching scraper sessions:', error);
    res.status(500).json({
      error: 'Failed to fetch scraper sessions',
      message: error.message
    });
  }
});

// Get dashboard status
router.get('/dashboard/status', async (req: Request, res: Response) => {
  try {
    // Get basic system status
    const result = await pgPool.query(`
      SELECT
        COUNT(*) as total_documents,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_documents
      FROM documents
    `);

    const scraperResult = await pgPool.query(`
      SELECT
        COUNT(*) as total_pages,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as recent_pages
      FROM scraped_data
    `);

    res.json({
      success: true,
      status: 'operational',
      documents: {
        total: parseInt(result.rows[0].total_documents) || 0,
        recent: parseInt(result.rows[0].recent_documents) || 0
      },
      scraper: {
        total: parseInt(scraperResult.rows[0].total_pages) || 0,
        recent: parseInt(scraperResult.rows[0].recent_pages) || 0,
        status: 'idle'
      }
    });
  } catch (error: any) {
    console.error('Error fetching dashboard status:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard status',
      message: error.message
    });
  }
});

export default router;