# Luwi Semantic Bridge - Crawl4AI Node.js Entegrasyonu

## 1. Crawl4AI Node.js Desteği

### 1.1. Mevcut Durum

Crawl4AI aslında bir Python kütüphanesi olsa da, Node.js ile entegrasyon için birkaç yaklaşım bulunmaktadır:

1. **Python Subprocess Çağrısı**: Node.js'ten Python script'lerini çalıştırma
2. **Crawl4AI CLI**: Komut satırı aracını kullanma
3. **REST API Wrapper**: Python backend'ini API olarak kullanma
4. **Resmi Node.js Bağlamaları**: Geliştirme aşamasındaki Node.js wrapper'ları

### 1.2. Crawl4AI CLI Avantajları

```
# Crawl4AI CLI komutları
crawl4ai "https://example.com" --output-dir ./output --session-id mysession
crawl4ai "https://example.com" --extract-text --extract-links
crawl4ai "https://example.com" --use-js --wait-for 3
crawl4ai "https://example.com" --css-selector ".content"
crawl4ai "https://example.com" --format json
```

**Avantajları:**
- Kurulum ve kullanım kolayluğu
- Az kodla çok iş yapabilme
- Farklı formatlarda çıktı desteği
- JavaScript bekleme ve çalıştırma desteği

## 2. Luwi Semantic Bridge için Entegrasyon Stratejileri

### 2.1. Strateji 1: CLI Tabanlı Entegrasyon (Hızlı Uygulama)

```typescript
// backend/src/services/crawl4ai-cli.service.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

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
      // CLI komutunu çalıştır
      const { stdout, stderr } = await execAsync(cliCommand);
      
      if (stderr && !stderr.includes('WARNING')) {
        console.error('Crawl4AI CLI error:', stderr);
        throw new Error(`CLI Error: ${stderr}`);
      }
      
      // Sonucu oku
      const resultJson = await fs.readFile(outputPath, 'utf-8');
      const result = JSON.parse(resultJson);
      
      // Sonucu Luwi formatına dönüştür
      return this.formatForLuwi(result, url, options);
      
    } catch (error) {
      console.error('Error running Crawl4AI CLI:', error);
      throw error;
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
    
    if (options.useJs) {
      commandParts.push('--use-js');
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
    
    return commandParts.join(' ');
  }
  
  private formatForLuwi(
    crawl4aiResult: any, 
    url: string, 
    options: Crawl4AIOptions
  ): ScrapeResult {
    return {
      url,
      title: crawl4aiResult.title || '',
      content: crawl4aiResult.cleaned_text || crawl4aiResult.markdown || '',
      description: crawl4aiResult.description || '',
      keywords: crawl4aiResult.keywords || [],
      links: crawl4aiResult.links || [],
      images: crawl4aiResult.images || [],
      metadata: {
        scrapingMethod: 'crawl4ai-cli',
        sessionId: crawl4aiResult.session_id,
        extractedAt: crawl4aiResult.extracted_at,
        wordCount: crawl4aiResult.word_count,
        options
      },
      success: true
    };
  }
  
  private async cleanup(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      // Dosya zaten silinmiş olabilir, hata yok say
    }
  }
}

interface Crawl4AIOptions {
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
}

interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  description: string;
  keywords: string[];
  links: string[];
  images: string[];
  metadata: any;
  success: boolean;
}

export default new Crawl4AICLIAdapter();
```

### 2.2. Strateji 2: REST API Wrapper (Daha İyi Entegrasyon)

```python
# python/crawl4ai_server.py
from flask import Flask, request, jsonify
from crawl4ai import AsyncWebCrawler
import asyncio
import json
import uuid
from datetime import datetime

app = Flask(__name__)

# Global crawler instance
crawler = None

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})

@app.route('/scrape', methods=['POST'])
def scrape():
    global crawler
    
    data = request.json
    url = data.get('url')
    options = data.get('options', {})
    
    if not url:
        return jsonify({"error": "URL is required"}), 400
    
    try:
        # Crawler'ı başlat
        if not crawler:
            crawler = AsyncWebCrawler(
                headless=True,
                verbose=True,
                browser_type=options.get('browser_type', 'chromium')
            )
            asyncio.run(crawler.astart())
        
        # Scraping işlemini yap
        result = asyncio.run(crawler.arun(
            url=url,
            word_count_threshold=options.get('word_count_threshold', 10),
            extraction_strategy=options.get('extraction_strategy'),
            css_selector=options.get('css_selector'),
            wait_for=options.get('wait_for'),
            js_code=options.get('js_code'),
            use_js=options.get('use_js', True),
            bypass_cache=options.get('bypass_cache', False),
            session_id=options.get('session_id'),
            headers=options.get('headers')
        ))
        
        # Sonucu formatla
        response = {
            "success": True,
            "url": url,
            "title": result.title,
            "content": result.cleaned_text,
            "markdown": result.markdown,
            "description": result.description,
            "keywords": result.keywords,
            "links": result.links,
            "images": result.images,
            "metadata": {
                "scraping_method": "crawl4ai-api",
                "session_id": result.session_id,
                "extracted_at": datetime.now().isoformat(),
                "word_count": result.word_count
            }
        }
        
        return jsonify(response)
        
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "url": url
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```

```typescript
// backend/src/services/crawl4ai-api.service.ts
import axios from 'axios';

export class Crawl4AIAPIAdapter {
  private apiBaseUrl: string;
  
  constructor() {
    this.apiBaseUrl = process.env.CRAWL4AI_API_URL || 'http://localhost:5000';
  }
  
  async scrape(url: string, options: Crawl4AIOptions = {}): Promise<ScrapeResult> {
    try {
      const response = await axios.post(`${this.apiBaseUrl}/scrape`, {
        url,
        options: {
          browser_type: 'chromium',
          word_count_threshold: 10,
          use_js: true,
          bypass_cache: false,
          ...options
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Crawl4AI API error:', error);
      throw error;
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/health`);
      return response.data.status === 'healthy';
    } catch (error) {
      return false;
    }
  }
}

export default new Crawl4AIAPIAdapter();
```

### 2.3. Strateji 3: Hibrit Entegrasyon (Önerilen)

```typescript
// backend/src/services/crawl4ai-hybrid.service.ts
import crawl4aiCLI from './crawl4ai-cli.service';
import crawl4aiAPI from './crawl4ai-api.service';
import { EventEmitter } from 'events';

export class Crawl4AIHybridService extends EventEmitter {
  private apiAvailable: boolean = false;
  private cliAvailable: boolean = false;
  
  constructor() {
    super();
    this.checkAvailability();
  }
  
  private async checkAvailability(): Promise<void> {
    // API'nin kullanılabilirliğini kontrol et
    try {
      this.apiAvailable = await crawl4aiAPI.healthCheck();
      if (this.apiAvailable) {
        console.log('Crawl4AI API is available');
      }
    } catch (error) {
      console.log('Crawl4AI API is not available');
    }
    
    // CLI'nin kullanılabilirliğini kontrol et
    try {
      const testResult = await crawl4aiCLI.scrape(
        'https://example.com',
        { extractText: true }
      );
      this.cliAvailable = testResult.success;
      if (this.cliAvailable) {
        console.log('Crawl4AI CLI is available');
      }
    } catch (error) {
      console.log('Crawl4AI CLI is not available');
    }
    
    this.emit('availability-checked', {
      api: this.apiAvailable,
      cli: this.cliAvailable
    });
  }
  
  async scrape(url: string, options: Crawl4AIOptions = {}): Promise<ScrapeResult> {
    // Öncelik sırası: API > CLI > Fallback
    if (this.apiAvailable) {
      try {
        console.log('Using Crawl4AI API');
        return await crawl4aiAPI.scrape(url, options);
      } catch (error) {
        console.error('API scraping failed, trying CLI:', error);
        if (this.cliAvailable) {
          return await crawl4aiCLI.scrape(url, options);
        }
        throw error;
      }
    } else if (this.cliAvailable) {
      console.log('Using Crawl4AI CLI');
      return await crawl4aiCLI.scrape(url, options);
    } else {
      throw new Error('Neither Crawl4AI API nor CLI is available');
    }
  }
  
  async scrapeBatch(urls: string[], options: Crawl4AIOptions = {}): Promise<ScrapeResult[]> {
    const results: ScrapeResult[] = [];
    
    // Paralel scraping
    const promises = urls.map(url => 
      this.scrape(url, options).catch(error => ({
        url,
        success: false,
        error: error.message,
        title: '',
        content: '',
        description: '',
        keywords: [],
        links: [],
        images: [],
        metadata: { scrapingMethod: 'crawl4ai-hybrid', error }
      }))
    );
    
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
    
    return results;
  }
}

export default new Crawl4AIHybridService();
```

## 3. Luwi Semantic Bridge Entegrasyonu

### 3.1. Scraper Routes Güncellemesi

```typescript
// backend/src/routes/scraper.routes.ts (güncellenmiş)
import express from 'express';
import crawl4aiHybrid from '../services/crawl4ai-hybrid.service';
import contentProcessor from '../services/content-processor.service';

const router = express.Router();

// Crawl4AI ile scraping endpoint'i
router.post('/crawl4ai', async (req: Request, res: Response) => {
  try {
    const { url, options = {}, category, processContent = true } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Crawl4AI ile scrape et
    const scrapeResult = await crawl4aiHybrid.scrape(url, options);
    
    let finalResult = scrapeResult;
    
    // İçerik işleme isteniyorsa
    if (processContent && scrapeResult.success) {
      try {
        const processedContent = await contentProcessor.processContent(
          scrapeResult.content,
          category || 'general',
          {
            generateSummary: true,
            extractKeywords: true,
            assessQuality: true
          }
        );
        
        finalResult = {
          ...scrapeResult,
          summary: processedContent.summary,
          keywords: processedContent.keywords,
          qualityScore: processedContent.qualityScore
        };
      } catch (processingError) {
        console.error('Content processing error:', processingError);
        // İşleme hatası olsa bile scraping sonucunu döndür
      }
    }
    
    res.json({
      success: true,
      data: finalResult,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Crawl4AI scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      url: req.body.url
    });
  }
});

// Toplu scraping endpoint'i
router.post('/crawl4ai/batch', async (req: Request, res: Response) => {
  try {
    const { urls, options = {}, category, processContent = true } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }
    
    // İş için ID oluştur
    const jobId = `crawl4ai_batch_${Date.now()}`;
    
    // Redis'de iş durumunu kaydet
    await redis.set(`job:${jobId}`, JSON.stringify({
      status: 'processing',
      progress: 0,
      total: urls.length,
      processed: 0,
      startTime: new Date().toISOString()
    }), 'EX', 3600);
    
    // Toplu scraping'i arka planda başlat
    processBatchScraping(jobId, urls, options, category, processContent)
      .then(async (results) => {
        // İş durumunu güncelle
        await redis.set(`job:${jobId}`, JSON.stringify({
          status: 'completed',
          progress: 100,
          total: urls.length,
          processed: results.length,
          results,
          completedTime: new Date().toISOString()
        }), 'EX', 3600);
      })
      .catch(async (error) => {
        // Hata durumunu güncelle
        await redis.set(`job:${jobId}`, JSON.stringify({
          status: 'failed',
          error: error.message,
          failedTime: new Date().toISOString()
        }), 'EX', 3600);
      });
    
    res.json({
      success: true,
      jobId,
      message: 'Batch scraping started',
      totalUrls: urls.length,
      statusUrl: `/api/v2/scraper/crawl4ai/job/${jobId}`
    });
    
  } catch (error: any) {
    console.error('Crawl4AI batch scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// İş durumu endpoint'i
router.get('/crawl4ai/job/:jobId', async (req: Request, res: Response) => {
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
      success: false,
      error: error.message
    });
  }
});

// Arka planda toplu scraping işleyen fonksiyon
async function processBatchScraping(
  jobId: string,
  urls: string[],
  options: Crawl4AIOptions,
  category: string,
  processContent: boolean
): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    
    try {
      // URL'yi scrape et
      const scrapeResult = await crawl4aiHybrid.scrape(url, options);
      
      let finalResult = scrapeResult;
      
      // İçerik işleme
      if (processContent && scrapeResult.success) {
        try {
          const processedContent = await contentProcessor.processContent(
            scrapeResult.content,
            category,
            {
              generateSummary: true,
              extractKeywords: true,
              assessQuality: true
            }
          );
          
          finalResult = {
            ...scrapeResult,
            summary: processedContent.summary,
            keywords: processedContent.keywords,
            qualityScore: processedContent.qualityScore
          };
        } catch (processingError) {
          console.error(`Content processing error for ${url}:`, processingError);
        }
      }
      
      results.push(finalResult);
      
      // İş durumunu güncelle
      await redis.set(`job:${jobId}`, JSON.stringify({
        status: 'processing',
        progress: Math.round((i + 1) / urls.length * 100),
        total: urls.length,
        processed: i + 1,
        lastProcessedUrl: url,
        lastProcessedTime: new Date().toISOString()
      }), 'EX', 3600);
      
    } catch (error: any) {
      console.error(`Error scraping ${url}:`, error);
      results.push({
        url,
        success: false,
        error: error.message,
        title: '',
        content: '',
        description: '',
        keywords: [],
        links: [],
        images: [],
        metadata: { scrapingMethod: 'crawl4ai-hybrid', error }
      });
    }
  }
  
  return results;
}

export default router;
```

### 3.2. Dashboard Entegrasyonu

```jsx
// dashboard/components/Crawl4AIScraper.jsx
import React, { useState } from 'react';
import { Card, Form, Input, Button, Select, Switch, Progress, message, Tabs } from 'antd';
import { PlayCircleOutlined, UploadOutlined } from '@ant-design/icons';

const { Option } = Select;
const { TextArea } = Input;
const { TabPane } = Tabs;

const Crawl4AIScraper = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [batchJobId, setBatchJobId] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  
  // Tekli scraping
  const handleScrape = async (values) => {
    setLoading(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/v2/scraper/crawl4ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      
      const data = await response.json();
      
      if (data.success) {
        setResult(data.data);
        message.success('Scraping completed successfully');
      } else {
        message.error(`Scraping failed: ${data.error}`);
      }
    } catch (error) {
      message.error('Scraping failed');
      console.error('Scraping error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Toplu scraping
  const handleBatchScrape = async (values) => {
    const { urls, options, category } = values;
    
    if (!urls || urls.split('\n').filter(url => url.trim()).length === 0) {
      message.error('Please enter at least one URL');
      return;
    }
    
    setBatchLoading(true);
    setBatchJobId(null);
    setBatchProgress(null);
    
    try {
      const urlList = urls.split('\n').filter(url => url.trim());
      
      const response = await fetch('/api/v2/scraper/crawl4ai/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: urlList,
          options,
          category
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setBatchJobId(data.jobId);
        message.success(`Batch scraping started with ${data.totalUrls} URLs`);
        
        // İlerliği takip et
        trackBatchProgress(data.jobId);
      } else {
        message.error(`Batch scraping failed: ${data.error}`);
      }
    } catch (error) {
      message.error('Batch scraping failed');
      console.error('Batch scraping error:', error);
    } finally {
      setBatchLoading(false);
    }
  };
  
  // Toplu scraping ilerleğini takip et
  const trackBatchProgress = (jobId) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v2/scraper/crawl4ai/job/${jobId}`);
        const data = await response.json();
        
        if (data.success) {
          setBatchProgress(data.job);
          
          if (data.job.status === 'completed' || data.job.status === 'failed') {
            clearInterval(interval);
            
            if (data.job.status === 'completed') {
              message.success('Batch scraping completed');
            } else {
              message.error(`Batch scraping failed: ${data.job.error}`);
            }
          }
        }
      } catch (error) {
        clearInterval(interval);
        console.error('Error tracking batch progress:', error);
      }
    }, 2000);
  };
  
  return (
    <Card title="Crawl4AI Scraper">
      <Tabs defaultActiveKey="single">
        <TabPane tab="Tekli Scraping" key="single">
          <Form
            form={form}
            layout="vertical"
            onFinish={handleScrape}
            initialValues={{
              options: {
                useJs: true,
                extractText: true,
                extractLinks: true
              },
              category: 'general',
              processContent: true
            }}
          >
            <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url' }]}>
              <Input placeholder="https://example.com" />
            </Form.Item>
            
            <Form.Item name="category" label="Kategori">
              <Select>
                <Option value="general">Genel</Option>
                <Option value="legal">Yasal Mevzuat</Option>
                <Option value="technical">Teknik Dokümantasyon</Option>
                <Option value="news">Haberler ve Makaleler</Option>
              </Select>
            </Form.Item>
            
            <Form.Item name="processContent" label="İçerik İşleme" valuePropName="checked">
              <Switch checkedChildren="İşle" unCheckedChildren="İşleme" />
            </Form.Item>
            
            <Form.Item name="options" label="Scraping Seçenekleri">
              <Card size="small">
                <Form.Item name="useJs" valuePropName="checked">
                  <Switch checkedChildren="JS Kullan" unCheckedChildren="JS Kullanma" />
                </Form.Item>
                
                <Form.Item name="extractText" valuePropName="checked">
                  <Switch checkedChildren="Metin Çıkar" unCheckedChildren="Metin Çıkarma" />
                </Form.Item>
                
                <Form.Item name="extractLinks" valuePropName="checked">
                  <Switch checkedChildren="Linkleri Çıkar" unCheckedChildren="Linkleri Çıkarma" />
                </Form.Item>
                
                <Form.Item name="waitForSelector" label="Wait For Selector">
                  <Input placeholder=".content" />
                </Form.Item>
                
                <Form.Item name="cssSelector" label="CSS Selector">
                  <Input placeholder="article" />
                </Form.Item>
              </Card>
            </Form.Item>
            
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} icon={<PlayCircleOutlined />}>
                Scrape Et
              </Button>
            </Form.Item>
          </Form>
          
          {result && (
            <Card title="Scraping Sonucu" style={{ marginTop: 16 }}>
              <p><strong>Başlık:</strong> {result.title}</p>
              <p><strong>Açıklama:</strong> {result.description}</p>
              <p><strong>İçerik Uzunluğu:</strong> {result.content.length} karakter</p>
              
              {result.summary && (
                <div>
                  <strong>Özet:</strong>
                  <p>{result.summary}</p>
                </div>
              )}
              
              {result.keywords && result.keywords.length > 0 && (
                <div>
                  <strong>Anahtar Kelimeler:</strong>
                  <div>
                    {result.keywords.map(keyword => (
                      <span key={keyword} style={{ 
                        display: 'inline-block', 
                        margin: '4px', 
                        padding: '2px 8px', 
                        backgroundColor: '#f0f0f0', 
                        borderRadius: '4px' 
                      }}>
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </TabPane>
        
        <TabPane tab="Toplu Scraping" key="batch">
          <Form
            layout="vertical"
            onFinish={handleBatchScrape}
            initialValues={{
              options: {
                useJs: true,
                extractText: true,
                extractLinks: true
              },
              category: 'general',
              processContent: true
            }}
          >
            <Form.Item name="urls" label="URL Listesi" rules={[{ required: true }]}>
              <TextArea 
                rows={10} 
                placeholder="Her satırda bir URL olacak şekilde URL'leri girin&#10;https://example.com&#10;https://example.org"
              />
            </Form.Item>
            
            <Form.Item name="category" label="Kategori">
              <Select>
                <Option value="general">Genel</Option>
                <Option value="legal">Yasal Mevzuat</Option>
                <Option value="technical">Teknik Dokümantasyon</Option>
                <Option value="news">Haberler ve Makaleler</Option>
              </Select>
            </Form.Item>
            
            <Form.Item name="processContent" label="İçerik İşleme" valuePropName="checked">
              <Switch checkedChildren="İşle" unCheckedChildren="İşleme" />
            </Form.Item>
            
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={batchLoading} icon={<UploadOutlined />}>
                Toplu Scrape Başlat
              </Button>
            </Form.Item>
          </Form>
          
          {batchProgress && (
            <Card title="İşlem İlerlemi" style={{ marginTop: 16 }}>
              <Progress 
                percent={batchProgress.progress} 
                status={batchProgress.status === 'failed' ? 'exception' : 'active'}
              />
              <p>İşlenen: {batchProgress.processed} / {batchProgress.total}</p>
              
              {batchProgress.status === 'completed' && (
                <p>İşlem tamamlandı!</p>
              )}
              
              {batchProgress.status === 'failed' && (
                <p>İşlem başarısız: {batchProgress.error}</p>
              )}
            </Card>
          )}
        </TabPane>
      </Tabs>
    </Card>
  );
};

export default Crawl4AIScraper;
```

## 4. Kurulum ve Konfigürasyon

### 4.1. Crawl4AI Kurulumu

```bash
# Python ortamı oluşturma
python -m venv crawl4ai-env
source crawl4ai-env/bin/activate  # Linux/Mac
# veya
crawl4ai-env\Scripts\activate  # Windows

# Crawl4AI kurulumu
pip install crawl4ai
pip install "crawl4ai[async]"
pip install playwright
playwright install chromium

# Flask API için (opsiyonel)
pip install flask flask-cors
```

### 4.2. Docker ile Kurulum

```dockerfile
# Dockerfile.crawl4ai
FROM python:3.11-slim

WORKDIR /app

# Sistem bağımlılıkları
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python bağımlılıkları
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Playwright kurulumu
RUN playwright install chromium
RUN playwright install-deps chromium

# Flask API'yi kopyala
COPY python/ ./python/

# API'yi başlat
EXPOSE 5000
CMD ["python", "python/crawl4ai_server.py"]
```

```yaml
# docker-compose.crawl4ai.yml
version: '3.8'

services:
  crawl4ai-api:
    build:
      context: .
      dockerfile: Dockerfile.crawl4ai
    ports:
      - "5000:5000"
    environment:
      - FLASK_ENV=production
    volumes:
      - ./temp:/app/temp
    restart: unless-stopped
```

### 4.3. Luwi Semantic Bridge Entegrasyonu

```bash
# Crawl4AI CLI adaptörünü kur
cd backend/src/services
npm install

# Çevre değişkenlerini ayarla
# .env dosyasına ekle:
CRAWL4AI_API_URL=http://localhost:5000
PYTHON_PATH=python3
```

## 5. Avantajlar ve Dezavantajlar

### 5.1. Avantajları

1. **Hızlı Uygulama**: CLI ile minimum kodla scraping
2. **Modern Özellikler**: JavaScript bekleme, dynamic content destek
3. **Esneklik**: Hem CLI hem API kullanabilme
4. **Performans**: Async tabanlı yüksek performans
5. **Az Bakım**: Python kütüphanesi tarafından yönetilir

### 5.2. Dezavantajları

1. **Python Bağımlılığı**: Python ortamı gerektirir
2. **Ek Kurulum**: Crawl4AI ve bağımlılıklarının kurulumu
3. **Özelleştirme Sınırlamaları**: Özel scraping mantığı için Python kodu gerekir

## 6. Sonuç ve Tavsiye

Luwi Semantic Bridge için **Crawl4AI CLI + Hibrit API yaklaşımı** öneriyorum:

**Nedenleri:**
1. **Hızlı Öğrenme**: CLI komutları ile hızlı başlangıç
2. **Esnek Entegrasyon**: Hem CLI hem API desteği
3. **Düşük Risk**: Mevcut sistemle paralel çalışabilir
4. **Yüksek Performans**: Modern scraping yetenekleri

**Implementasyon Önceliği:**
1. **Önce**: CLI adaptörünü kur ve temel scraping'i test et
2. **Sonra**: Flask API wrapper'ını kur ve daha iyi entegrasyon sağla
3. **Son**: Hibrit hizmeti oluştur ve mevcut sistemle entegre et

Bu yaklaşım, Luwi Semantic Bridge'e modern scraping yetenekleri kazandırırken, öğrenme eğrisini ve uygulama süresini minimumda tutacaktır.