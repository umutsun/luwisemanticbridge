import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export interface Crawl4AIOptions {
  waitForSelector?: string;
  useJs?: boolean;
  jsCode?: string;
  cssSelector?: string;
  extractText?: boolean;
  extractLinks?: boolean;
  extractImages?: boolean;
  screenshot?: boolean;
  userAgent?: string;
  proxy?: string;
  wordCountThreshold?: number;
  bypassCache?: boolean;
  session?: string;
}

export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  description: string;
  keywords: string[];
  links: string[];
  images: string[];
  metadata: any;
  success: boolean;
  error?: string;
}

export class Crawl4AICLIAdapter {
  private pythonPath: string;
  private outputDir: string;
  
  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.outputDir = path.join(process.cwd(), 'temp', 'crawl4ai');
    this.ensureOutputDir();
  }
  
  private async ensureOutputDir(): Promise<void> {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('Error creating output directory:', error);
    }
  }
  
  async scrape(url: string, options: Crawl4AIOptions = {}): Promise<ScrapeResult> {
    const sessionId = `luwi_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const outputPath = path.join(this.outputDir, `${sessionId}.json`);
    
    // CLI komutunu oluştur
    const cliCommand = this.buildCLICommand(url, outputPath, sessionId, options);
    
    try {
      console.log(`[CRAWL4AI-CLI] Executing: ${cliCommand}`);
      
      // CLI komutunu çalıştır
      const { stdout, stderr } = await execAsync(cliCommand, {
        timeout: 60000, // 60 saniye timeout
        cwd: process.cwd()
      });
      
      if (stderr && !stderr.includes('WARNING') && !stderr.includes('INFO')) {
        console.error('Crawl4AI CLI error:', stderr);
        throw new Error(`CLI Error: ${stderr}`);
      }
      
      // Sonucu oku
      const resultJson = await fs.readFile(outputPath, 'utf-8');
      const result = JSON.parse(resultJson);
      
      // Sonucu Luwi formatına dönüştür
      return this.formatForLuwi(result, url, options);
      
    } catch (error: any) {
      console.error('Error running Crawl4AI CLI:', error);
      
      // Daha detaylı hata mesajı
      let errorMessage = 'Unknown error occurred';
      if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Scraping timeout - the page took too long to load';
      } else if (error.code === 'ENOENT') {
        errorMessage = 'Crawl4AI CLI not found. Please install crawl4ai: pip install crawl4ai';
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
          scrapingMethod: 'crawl4ai-cli',
          error: errorMessage,
          options
        },
        success: false,
        error: errorMessage
      };
    } finally {
      // Geçici dosyayı temizle
      await this.cleanup(outputPath);
    }
  }
  
  private buildCLICommand(
    url: string, 
    outputPath: string, 
    sessionId: string, 
    options: Crawl4AIOptions
  ): string {
    const commandParts = [
      this.pythonPath,
      '-m',
      'crawl4ai',
      `"${url}"`,
      `--output-path "${outputPath}"`,
      `--session-id "${sessionId}"`
    ];
    
    // Seçenekleri ekle
    if (options.waitForSelector) {
      commandParts.push(`--wait-for "${options.waitForSelector}"`);
    }
    
    if (options.useJs !== undefined) {
      commandParts.push(`--use-js ${options.useJs ? 'true' : 'false'}`);
    }
    
    if (options.jsCode) {
      commandParts.push(`--js-code "${options.jsCode}"`);
    }
    
    if (options.cssSelector) {
      commandParts.push(`--css-selector "${options.cssSelector}"`);
    }
    
    if (options.extractText) {
      commandParts.push('--extract-text');
    }
    
    if (options.extractLinks) {
      commandParts.push('--extract-links');
    }
    
    if (options.extractImages) {
      commandParts.push('--extract-images');
    }
    
    if (options.screenshot) {
      commandParts.push('--screenshot');
    }
    
    if (options.userAgent) {
      commandParts.push(`--user-agent "${options.userAgent}"`);
    }
    
    if (options.proxy) {
      commandParts.push(`--proxy "${options.proxy}"`);
    }
    
    if (options.wordCountThreshold) {
      commandParts.push(`--word-count-threshold ${options.wordCountThreshold}`);
    }
    
    if (options.bypassCache) {
      commandParts.push('--bypass-cache');
    }
    
    if (options.session) {
      commandParts.push(`--session "${options.session}"`);
    }
    
    // JSON formatında çıktı al
    commandParts.push('--format json');
    
    return commandParts.join(' ');
  }
  
  private formatForLuwi(
    crawl4aiResult: any, 
    url: string, 
    options: Crawl4AIOptions
  ): ScrapeResult {
    try {
      return {
        url,
        title: crawl4aiResult.title || '',
        content: crawl4aiResult.cleaned_text || crawl4aiResult.markdown || crawl4aiResult.raw_html || '',
        description: crawl4aiResult.description || '',
        keywords: crawl4aiResult.keywords || [],
        links: crawl4aiResult.links || [],
        images: crawl4aiResult.images || [],
        metadata: {
          scrapingMethod: 'crawl4ai-cli',
          sessionId: crawl4aiResult.session_id,
          extractedAt: crawl4aiResult.extracted_at,
          wordCount: crawl4aiResult.word_count,
          options,
          success: crawl4aiResult.success !== false
        },
        success: true
      };
    } catch (error) {
      console.error('Error formatting Crawl4AI result:', error);
      return {
        url,
        title: '',
        content: '',
        description: '',
        keywords: [],
        links: [],
        images: [],
        metadata: {
          scrapingMethod: 'crawl4ai-cli',
          error: 'Failed to parse Crawl4AI result',
          options
        },
        success: false,
        error: 'Failed to parse Crawl4AI result'
      };
    }
  }
  
  private async cleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Dosya zaten silinmiş olabilir, hata yok say
    }
  }
  
  // Crawl4AI'nin kurulu olup olmadığını kontrol et
  async isAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`${this.pythonPath} -m crawl4ai --version`, {
        timeout: 10000
      });
      return stdout.includes('crawl4ai');
    } catch (error) {
      console.log('Crawl4AI CLI not available:', error);
      return false;
    }
  }
}

export default new Crawl4AICLIAdapter();