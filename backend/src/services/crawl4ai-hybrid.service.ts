import { EventEmitter } from 'events';
import crawl4aiCLI from './crawl4ai-cli.service';
import crawl4aiAPI from './crawl4ai-api.service';
import { Crawl4AIOptions, ScrapeResult } from './crawl4ai-cli.service';

export class Crawl4AIHybridService extends EventEmitter {
  private apiAvailable: boolean = false;
  private cliAvailable: boolean = false;
  private availabilityChecked: boolean = false;
  
  constructor() {
    super();
    this.checkAvailability();
  }
  
  private async checkAvailability(): Promise<void> {
    // API'nin kullanılabilirliğini kontrol et
    try {
      this.apiAvailable = await crawl4aiAPI.healthCheck();
      if (this.apiAvailable) {
        console.log('[CRAWL4AI-HYBRID] API is available');
      }
    } catch (error) {
      console.log('[CRAWL4AI-HYBRID] API is not available');
    }
    
    // CLI'nin kullanılabilirliğini kontrol et
    try {
      this.cliAvailable = await crawl4aiCLI.isAvailable();
      if (this.cliAvailable) {
        console.log('[CRAWL4AI-HYBRID] CLI is available');
      }
    } catch (error) {
      console.log('[CRAWL4AI-HYBRID] CLI is not available');
    }
    
    this.availabilityChecked = true;
    
    this.emit('availability-checked', {
      api: this.apiAvailable,
      cli: this.cliAvailable
    });
    
    console.log(`[CRAWL4AI-HYBRID] Availability - API: ${this.apiAvailable}, CLI: ${this.cliAvailable}`);
  }
  
  async scrape(url: string, options: Crawl4AIOptions = {}): Promise<ScrapeResult> {
    // Kullanılabilirlik kontrolü yapılmadıysa bekle
    if (!this.availabilityChecked) {
      await new Promise(resolve => {
        this.once('availability-checked', resolve);
      });
    }
    
    // Öncelik sırası: API > CLI > Fallback
    if (this.apiAvailable) {
      try {
        console.log('[CRAWL4AI-HYBRID] Using API for scraping');
        return await crawl4aiAPI.scrape(url, options);
      } catch (error) {
        console.error('[CRAWL4AI-HYBRID] API scraping failed, trying CLI:', error);
        if (this.cliAvailable) {
          return await crawl4aiCLI.scrape(url, options);
        }
        throw error;
      }
    } else if (this.cliAvailable) {
      console.log('[CRAWL4AI-HYBRID] Using CLI for scraping');
      return await crawl4aiCLI.scrape(url, options);
    } else {
      const error = 'Neither Crawl4AI API nor CLI is available. Please install Crawl4AI or start the API server.';
      console.error('[CRAWL4AI-HYBRID]', error);
      
      return {
        url,
        title: '',
        content: '',
        description: '',
        keywords: [],
        links: [],
        images: [],
        metadata: {
          scrapingMethod: 'crawl4ai-hybrid',
          error,
          options
        },
        success: false,
        error
      };
    }
  }
  
  async scrapeBatch(urls: string[], options: Crawl4AIOptions = {}): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    
    // Kullanılabilirlik kontrolü yapılmadıysa bekle
    if (!this.availabilityChecked) {
      await new Promise(resolve => {
        this.once('availability-checked', resolve);
      });
    }
    
    // Paralel scraping - API veya CLI'ye göre
    if (this.apiAvailable) {
      console.log('[CRAWL4AI-HYBRID] Using API for batch scraping');
      return await crawl4aiAPI.scrapeBatch(urls, options);
    } else if (this.cliAvailable) {
      console.log('[CRAWL4AI-HYBRID] Using CLI for batch scraping');
      
      // CLI için manuel paralel işleme
      const concurrency = 3; // CLI için daha düşük eşzamanlılık
      const chunks = [];
      
      for (let i = 0; i < urls.length; i += concurrency) {
        chunks.push(urls.slice(i, i + concurrency));
      }
      
      for (const chunk of chunks) {
        const promises = chunk.map(url => 
          crawl4aiCLI.scrape(url, options).catch(error => ({
            url,
            success: false,
            error: error.message,
            title: '',
            content: '',
            description: '',
            keywords: [],
            links: [],
            images: [],
            metadata: { scrapingMethod: 'crawl4ai-cli', error }
          }))
        );
        
        const chunkResults = await Promise.all(promises);
        results.push(...chunkResults);
      }
      
      return results;
    } else {
      const error = 'Neither Crawl4AI API nor CLI is available';
      console.error('[CRAWL4AI-HYBRID]', error);
      
      // Hata sonuçları döndür
      return urls.map(url => ({
        url,
        success: false,
        error,
        title: '',
        content: '',
        description: '',
        keywords: [],
        links: [],
        images: [],
        metadata: { scrapingMethod: 'crawl4ai-hybrid', error }
      }));
    }
  }
  
  // URL için en uygun scraping yöntemini belirle
  async determineBestMethod(url: string): Promise<'api' | 'cli' | 'fallback'> {
    if (!this.availabilityChecked) {
      await new Promise(resolve => {
        this.once('availability-checked', resolve);
      });
    }
    
    if (this.apiAvailable) {
      // Karmaşık siteler için API'yi tercih et
      const complexPatterns = [
        /react\.js/i, /vue\.js/i, /angular\.js/i,
        /next\.js/i, /nuxt\.js/i, /gatsby\.js/i,
        /webapp/i, /spa/i,
        /twitter\.com/i, /x\.com/i,
        /instagram\.com/i, /facebook\.com/i,
        /linkedin\.com/i, /youtube\.com/i
      ];
      
      if (complexPatterns.some(pattern => pattern.test(url))) {
        return 'api';
      }
    }
    
    if (this.cliAvailable) {
      return 'cli';
    }
    
    return 'fallback';
  }
  
  // Servis durumunu al
  getStatus() {
    return {
      api: this.apiAvailable,
      cli: this.cliAvailable,
      availabilityChecked: this.availabilityChecked,
      available: this.apiAvailable || this.cliAvailable
    };
  }
  
  // Kullanılabilirlik durumunu yeniden kontrol et
  async refreshAvailability(): Promise<void> {
    this.availabilityChecked = false;
    await this.checkAvailability();
  }
}

export default new Crawl4AIHybridService();