import { NextRequest, NextResponse } from 'next/server';

// Dynamically import dependencies to avoid build-time issues
let cheerio: any, puppeteer: any;

async function loadDependencies() {
  if (!cheerio) {
    cheerio = (await import('cheerio')).default;
  }
  if (!puppeteer) {
    puppeteer = (await import('puppeteer')).default;
  }
}

// In-memory storage for scraping history
let scrapingHistory: any[] = [];

// Clean text content
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

// Extract metadata from the page
function extractMetadata($: cheerio.CheerioAPI) {
  return {
    title: $('title').text() || $('h1').first().text() || '',
    description: $('meta[name="description"]').attr('content') || 
                 $('meta[property="og:description"]').attr('content') || '',
    keywords: $('meta[name="keywords"]').attr('content') || '',
    author: $('meta[name="author"]').attr('content') || '',
    ogImage: $('meta[property="og:image"]').attr('content') || '',
    publishedTime: $('meta[property="article:published_time"]').attr('content') || '',
    modifiedTime: $('meta[property="article:modified_time"]').attr('content') || ''
  };
}

// Extract main content from the page
function extractContent($: cheerio.CheerioAPI): string {
  // Remove script and style elements
  $('script').remove();
  $('style').remove();
  $('noscript').remove();
  $('iframe').remove();
  
  // Try to find main content areas
  let content = '';
  
  // Priority 1: Article content
  const articleSelectors = [
    'main article',
    'article[role="main"]',
    'div[role="main"]',
    '[class*="article-content"]',
    '[class*="post-content"]',
    '[class*="entry-content"]',
    '.content',
    '#content',
    'main',
    'article'
  ];
  
  for (const selector of articleSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      content = element.text();
      if (content.length > 500) break; // Found substantial content
    }
  }
  
  // Priority 2: If no article found, get body text
  if (!content || content.length < 500) {
    content = $('body').text();
  }
  
  // Clean and format
  content = cleanText(content);
  
  // Extract structured data
  const structuredData = {
    headings: $('h1, h2, h3').map((_, el) => $(el).text()).get(),
    paragraphs: $('p').map((_, el) => $(el).text()).get().filter(p => p.length > 50),
    lists: $('ul li, ol li').map((_, el) => $(el).text()).get(),
    links: $('a[href]').map((_, el) => ({
      text: $(el).text(),
      href: $(el).attr('href')
    })).get().slice(0, 20), // Limit to 20 links
    images: $('img[src]').map((_, el) => ({
      alt: $(el).attr('alt') || '',
      src: $(el).attr('src')
    })).get().slice(0, 10) // Limit to 10 images
  };
  
  return JSON.stringify({
    rawContent: content.substring(0, 10000), // Limit raw content
    structuredData
  }, null, 2);
}

// Dynamic scraping with Puppeteer for JavaScript-heavy sites
async function dynamicScrape(url: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to the page
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for potential dynamic content
    await page.waitForTimeout(2000);
    
    // Scroll to load lazy content
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          
          if(totalHeight >= scrollHeight){
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
    
    // Get the full HTML after JavaScript execution
    const html = await page.content();
    
    await browser.close();
    return html;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

export async function POST(request: NextRequest) {
  // Check if we're in build mode
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return NextResponse.json({ error: 'Scraper is not available during build' }, { status: 503 });
  }

  try {
    await loadDependencies();
    const { url, saveToDb = false, storeEmbeddings = false, mode = 'static' } = await request.json();
    
    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    let html: string;
    
    // Choose scraping method
    if (mode === 'dynamic') {
      // Use Puppeteer for JavaScript-heavy sites
      try {
        html = await dynamicScrape(url);
      } catch (error) {
        console.error('Dynamic scraping failed, falling back to static:', error);
        // Fallback to static scraping
        const response = await fetch(url);
        html = await response.text();
      }
    } else {
      // Static scraping with fetch
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      html = await response.text();
    }
    
    // Parse with Cheerio
    const $ = cheerio.load(html);
    
    // Extract metadata and content
    const metadata = extractMetadata($);
    const content = extractContent($);
    
    // Create scrape result
    const scrapeResult = {
      url,
      title: metadata.title,
      description: metadata.description,
      content: content,
      metadata,
      scrapedAt: new Date().toISOString(),
      mode,
      contentLength: content.length,
      success: true
    };
    
    // Save to history
    scrapingHistory.unshift({
      ...scrapeResult,
      id: `scrape_${Date.now()}`
    });
    
    // Keep only last 100 items in history
    if (scrapingHistory.length > 100) {
      scrapingHistory = scrapingHistory.slice(0, 100);
    }
    
    // If storeEmbeddings or saveToDb is true, save to database with embeddings
    if (saveToDb || storeEmbeddings) {
      try {
        const ASB_API_URL = process.env.ASB_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083';
        
        // Parse the structured content
        let textToEmbed = '';
        try {
          const parsed = JSON.parse(content);
          textToEmbed = parsed.rawContent || content;
        } catch {
          textToEmbed = content;
        }
        
        const embeddingResponse = await fetch(`${ASB_API_URL}/api/v2/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: textToEmbed.substring(0, 8000), // Limit text size
            metadata: {
              source: url,
              title: metadata.title || 'Web Scrape',
              type: 'web_scrape',
              scrapedAt: new Date().toISOString()
            }
          })
        });
        
        if (embeddingResponse.ok) {
          console.log('Successfully saved to database with embeddings');
        } else {
          console.error('Failed to save embeddings:', await embeddingResponse.text());
        }
      } catch (dbError) {
        console.error('Failed to save to database:', dbError);
      }
    }
    
    return NextResponse.json(scrapeResult);
    
  } catch (error: any) {
    console.error('Scraper error:', error);
    
    return NextResponse.json(
      { 
        error: error.message || 'Failed to scrape content',
        success: false
      },
      { status: 500 }
    );
  }
}

// Get scraping history
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  
  return NextResponse.json({
    history: scrapingHistory.slice(0, limit),
    total: scrapingHistory.length
  });
}