import axios, { AxiosInstance } from 'axios';
import { Crawl4AIOptions, ScrapeResult } from './crawl4ai-cli.service';

export class Crawl4AIAPIAdapter {
  private apiClient: AxiosInstance;
  private apiBaseUrl: string;
  
  constructor() {
    this.apiBaseUrl = process.env.CRAWL4AI_API_URL || 'http://localhost:5000';
    
    this.apiClient = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 60000, // 60 saniye timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
  
  async scrape(url: string, options: Crawl4AIOptions = {}): Promise<ScrapeResult> {
    try {
      console.log(`[CRAWL4AI-API] Scraping URL: ${url}`);
      
      const response = await this.apiClient.post('/scrape', {
        url,
        options: {
          browser_type: 'chromium',
          word_count_threshold: 10,
          use_js: true,
          bypass_cache: false,
          extract_text: true,
          extract_links: true,
          ...options
        }
      });
      
      const data = response.data;
      
      if (data.success) {
        return {
          url,
          title: data.title || '',
          content: data.content || data.markdown || '',
          description: data.description || '',
          keywords: data.keywords || [],
          links: data.links || [],
          images: data.images || [],
          metadata: {
            scrapingMethod: 'crawl4ai-api',
            sessionId: data.metadata?.session_id,
            extractedAt: data.metadata?.extracted_at,
            wordCount: data.metadata?.word_count,
            options,
            apiResponse: true
          },
          success: true
        };
      } else {
        return {
          url,
          title: '',
          content: '',
          description: '',
          keywords: [],
          links: [],
          images: [],
          metadata: {
            scrapingMethod: 'crawl4ai-api',
            error: data.error || 'Unknown API error',
            options
          },
          success: false,
          error: data.error || 'Unknown API error'
        };
      }
    } catch (error: any) {
      console.error('Crawl4AI API error:', error);
      
      let errorMessage = 'Unknown API error';
      if (error.response) {
        // API'den hata yanıtı geldi
        if (error.response.data && error.response.data.error) {
          errorMessage = error.response.data.error;
        } else {
          errorMessage = `API returned status ${error.response.status}`;
        }
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Crawl4AI API server is not running. Please start the API server.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'API request timeout';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return {
        url,
        title: '',
        content: '',
        description: '',
        keywords: [],
        links: [],
        images: [],
        metadata: {
          scrapingMethod: 'crawl4ai-api',
          error: errorMessage,
          options
        },
        success: false,
        error: errorMessage
      };
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.apiClient.get('/health', { timeout: 5000 });
      return response.data.status === 'healthy';
    } catch (error) {
      console.log('Crawl4AI API health check failed:', error);
      return false;
    }
  }
  
  // Toplu scraping için
  async scrapeBatch(urls: string[], options: Crawl4AIOptions = {}): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    
    // Paralel olarak URL'leri işle (maksimum 5 eş zamanlı)
    const concurrency = 5;
    const chunks = [];
    
    for (let i = 0; i < urls.length; i += concurrency) {
      chunks.push(urls.slice(i, i + concurrency));
    }
    
    for (const chunk of chunks) {
      const promises = chunk.map(url => this.scrape(url, options));
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }
    
    return results;
  }
  
  // API sunucu bilgilerini al
  async getServerInfo(): Promise<any> {
    try {
      const response = await this.apiClient.get('/info', { timeout: 5000 });
      return response.data;
    } catch (error) {
      console.error('Error getting server info:', error);
      return null;
    }
  }
}

export default new Crawl4AIAPIAdapter();