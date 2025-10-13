# Luwi Semantic Bridge - Scraper Dashboard Geliştirme Yol Haritası

## 1. Mevcut Durum Analizi

### 1.1. Mevcut Scraper Dashboard (http://localhost:3002/dashboard/scraper)

Mevcut scraper dashboard'ının temel özellikleri:
- URL girişi ve tekli scraping
- Basit scraping sonuçları görüntüleme
- scraping geçmişi

### 1.2. Hedeflenen Yetenekler

1. **Kategori Bazlı İçerik Toplama**
   - Farklı kaynak türlerini tanıma
   - Otomatik kategori atama
   - Toplu scraping işlemleri

2. **LLM ile İçerik Zenginleştirme**
   - Özet çıkarma
   - Anahtar kelime ve etiketleme
   - İçerik kalite değerlendirmesi

3. **Akıllı Embedding ve RAG Entegrasyonu**
   - Kategori bazlı embedding stratejileri
   - İçerik ilişkilendirme
   - Semantik arama optimizasyonu

## 2. Yeni Dashboard Mimarisi

```
┌────────────────────────────────────────────────────┐
│                Scraper Dashboard                   │
├────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐  │
│  │  Kaynak Yönetimi                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │  │
│  │  │  Kategoriler │ │  Kaynaklar  │ │  Etiketler│  │  │
│  │  └─────────────┘ └─────────────┘ └─────────┘  │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐  │
│  │  Toplu Scraping                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │  │
│  │  │  Sitemap    │ │  URL Listesi │ │  Zamanlan│  │  │
│  │  │  Import     │ │  Import     │ │ mış İşl │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────┘  │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐  │
│  │  İçerik İşleme                                │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │  │
│  │  │  LLM Zengin │ │  Embedding   │ │  Kalite │  │  │
│  │  │  leştirme   │ │  Optimizasyon│  │  Kontrol│  │  │
│  │  └─────────────┘ └─────────────┘ └─────────┘  │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┐  │
│  │  RAG Entegrasyonu                             │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────┐  │  │
│  │  │  Vektör DB   │ │  İlişkilendir │ │  Analiz │  │  │
│  │  │  Yönetimi    │ │  me           │  │  Paneli │  │  │
│  │  └─────────────┘ └─────────────┘ └─────────┘  │  │
│  └─────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

## 3. Kategori Bazlı Kaynak Yönetimi

### 3.1. Veritabanı Şeması

```sql
-- Kategori tablosu
CREATE TABLE content_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  embedding_strategy JSONB,
  scraping_config JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Kaynak tablosu
CREATE TABLE content_sources (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  url VARCHAR(500) NOT NULL,
  category_id INTEGER REFERENCES content_categories(id),
  source_type VARCHAR(50), -- 'website', 'api', 'rss', 'sitemap'
  scraping_frequency INTEGER, -- saat cinsinden
  last_scraped TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- İçerik tablosu (geliştirilmiş)
CREATE TABLE scraped_content (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES content_sources(id),
  category_id INTEGER REFERENCES content_categories(id),
  url VARCHAR(500) NOT NULL,
  title TEXT,
  content TEXT,
  summary TEXT, -- LLM tarafından oluşturulan özet
  keywords TEXT[], -- LLM tarafından çıkarılan anahtar kelimeler
  quality_score FLOAT, -- LLM tarafından verilen kalite puanı
  embedding vector(1536),
  chunk_count INTEGER,
  processing_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Etiket tablosu
CREATE TABLE content_tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  category_id INTEGER REFERENCES content_categories(id),
  color VARCHAR(7), -- UI için renk kodu
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- İçerik-etiket ilişki tablosu
CREATE TABLE content_tag_relations (
  content_id INTEGER REFERENCES scraped_content(id),
  tag_id INTEGER REFERENCES content_tags(id),
  confidence FLOAT, -- Etiket güven skoru
  PRIMARY KEY (content_id, tag_id)
);
```

### 3.2. Kategori Tanımlama Sistemi

```typescript
// Kategori yapıları
interface ContentCategory {
  id: number;
  name: string;
  description: string;
  embeddingStrategy: EmbeddingStrategy;
  scrapingConfig: ScrapingConfig;
}

interface EmbeddingStrategy {
  chunkSize: number;
  chunkOverlap: number;
  model: string;
  preprocessing: PreprocessingConfig;
}

interface ScrapingConfig {
  engine: 'puppeteer' | 'playwright' | 'crawl4ai' | 'scrapy';
  customSelectors: string[];
  waitTime: number;
  retryCount: number;
}

// Örnek kategoriler
const DEFAULT_CATEGORIES: ContentCategory[] = [
  {
    id: 1,
    name: 'Yasal Mevzuat',
    description: 'Türk kanunları, yönetmelikler ve resmi gazeteler',
    embeddingStrategy: {
      chunkSize: 1500,
      chunkOverlap: 300,
      model: 'text-embedding-3-large',
      preprocessing: {
        preserveStructure: true,
        extractArticles: true,
        cleanLegalReferences: true
      }
    },
    scrapingConfig: {
      engine: 'puppeteer',
      customSelectors: ['.accordion-body', '.madde-metni'],
      waitTime: 5000,
      retryCount: 3
    }
  },
  {
    id: 2,
    name: 'Teknik Dokümantasyon',
    description: 'API dokümantasyonları, teknik kılavuzlar',
    embeddingStrategy: {
      chunkSize: 1000,
      chunkOverlap: 200,
      model: 'text-embedding-3-small',
      preprocessing: {
        preserveCodeBlocks: true,
        extractHeaders: true,
        cleanMarkdown: true
      }
    },
    scrapingConfig: {
      engine: 'crawl4ai',
      customSelectors: ['.markdown-body', '.content', 'main'],
      waitTime: 3000,
      retryCount: 2
    }
  },
  {
    id: 3,
    name: 'Haberler ve Makaleler',
    description: 'Haber siteleri, bloglar ve makaleler',
    embeddingStrategy: {
      chunkSize: 1200,
      chunkOverlap: 250,
      model: 'text-embedding-3-small',
      preprocessing: {
        extractTitle: true,
        extractAuthor: true,
        extractDate: true
      }
    },
    scrapingConfig: {
      engine: 'playwright',
      customSelectors: ['article', '.post-content', '.entry-content'],
      waitTime: 2000,
      retryCount: 2
    }
  }
];
```

## 4. Dashboard Bileşenleri

### 4.1. Kaynak Yönetimi Bileşeni

```jsx
// dashboard/components/SourceManager.jsx
import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Modal, Form, Input, Select, Tag } from 'antd';

const SourceManager = () => {
  const [sources, setSources] = useState([]);
  const [categories, setCategories] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchSources();
    fetchCategories();
  }, []);

  const fetchSources = async () => {
    const response = await fetch('/api/v2/scraper/sources');
    const data = await response.json();
    setSources(data.sources);
  };

  const fetchCategories = async () => {
    const response = await fetch('/api/v2/scraper/categories');
    const data = await response.json();
    setCategories(data.categories);
  };

  const handleAddSource = () => {
    setEditingSource(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEditSource = (source) => {
    setEditingSource(source);
    form.setFieldsValue(source);
    setModalVisible(true);
  };

  const handleSaveSource = async (values) => {
    const url = editingSource 
      ? `/api/v2/scraper/sources/${editingSource.id}`
      : '/api/v2/scraper/sources';
    
    const method = editingSource ? 'PUT' : 'POST';
    
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    
    setModalVisible(false);
    fetchSources();
  };

  const handleScrapeSource = async (sourceId) => {
    await fetch(`/api/v2/scraper/sources/${sourceId}/scrape`, {
      method: 'POST'
    });
    // Scraping durumunu izlemek için bir notification göster
  };

  const columns = [
    {
      title: 'Kaynak Adı',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      render: (url) => <a href={url} target="_blank" rel="noopener">{url}</a>
    },
    {
      title: 'Kategori',
      dataIndex: 'category_name',
      key: 'category',
      render: (category) => <Tag color="blue">{category}</Tag>
    },
    {
      title: 'Son Scraping',
      dataIndex: 'last_scraped',
      key: 'last_scraped',
      render: (date) => date ? new Date(date).toLocaleString() : 'Henüz scrape edilmedi'
    },
    {
      title: 'Durum',
      dataIndex: 'is_active',
      key: 'status',
      render: (active) => <Tag color={active ? 'green' : 'red'}>{active ? 'Aktif' : 'Pasif'}</Tag>
    },
    {
      title: 'İşlemler',
      key: 'actions',
      render: (_, record) => (
        <div>
          <Button size="small" onClick={() => handleEditSource(record)}>Düzenle</Button>
          <Button 
            size="small" 
            type="primary" 
            onClick={() => handleScrapeSource(record.id)}
            style={{ marginLeft: 8 }}
          >
            Scrape
          </Button>
        </div>
      )
    }
  ];

  return (
    <Card title="Kaynak Yönetimi">
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={handleAddSource}>Yeni Kaynak Ekle</Button>
      </div>
      
      <Table 
        columns={columns} 
        dataSource={sources} 
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />
      
      <Modal
        title={editingSource ? 'Kaynak Düzenle' : 'Yeni Kaynak Ekle'}
        visible={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSaveSource}>
          <Form.Item name="name" label="Kaynak Adı" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          
          <Form.Item name="url" label="URL" rules={[{ required: true, type: 'url' }]}>
            <Input />
          </Form.Item>
          
          <Form.Item name="category_id" label="Kategori" rules={[{ required: true }]}>
            <Select>
              {categories.map(cat => (
                <Select.Option key={cat.id} value={cat.id}>{cat.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item name="source_type" label="Kaynak Türü">
            <Select>
              <Select.Option value="website">Web Sitesi</Select.Option>
              <Select.Option value="sitemap">Sitemap</Select.Option>
              <Select.Option value="api">API</Select.Option>
              <Select.Option value="rss">RSS</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.Item name="scraping_frequency" label="Scraping Sıklığı (saat)">
            <Input type="number" min={1} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default SourceManager;
```

### 4.2. Toplu Scraping Bileşeni

```jsx
// dashboard/components/BatchScraping.jsx
import React, { useState } from 'react';
import { Card, Button, Upload, Table, Progress, message, Tabs } from 'antd';
import { UploadOutlined, PlayCircleOutlined } from '@ant-design/icons';

const { TabPane } = Tabs;

const BatchScraping = () => {
  const [batchJobs, setBatchJobs] = useState([]);
  const [activeTab, setActiveTab] = useState('url-list');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [scrapingProgress, setScrapingProgress] = useState(0);

  const handleUrlListUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const urls = text.split('\n').filter(url => url.trim());
      // URL listesini işle
      processUrlList(urls);
    };
    reader.readAsText(file);
    return false;
  };

  const handleSitemapUpload = async (file) => {
    const formData = new FormData();
    formData.append('sitemap', file);
    
    try {
      const response = await fetch('/api/v2/scraper/sitemap/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      if (data.success) {
        message.success(`${data.urlsFound} URL bulundu`);
        processUrlList(data.urls);
      }
    } catch (error) {
      message.error('Sitemap işlenirken hata oluştu');
    }
    
    return false;
  };

  const processUrlList = (urls) => {
    // URL'leri kategorize et
    const categorizedUrls = categorizeUrls(urls);
    
    // Batch scraping işini başlat
    startBatchScraping(categorizedUrls);
  };

  const categorizeUrls = (urls) => {
    // URL'leri kategorilere ayır
    const categories = {};
    
    urls.forEach(url => {
      let category = 'general';
      
      if (url.includes('gib.gov.tr') || url.includes('mevzuat.gov.tr')) {
        category = 'legal';
      } else if (url.includes('docs.') || url.includes('documentation')) {
        category = 'technical';
      } else if (url.includes('news') || url.includes('blog')) {
        category = 'news';
      }
      
      if (!categories[category]) {
        categories[category] = [];
      }
      
      categories[category].push(url);
    });
    
    return categories;
  };

  const startBatchScraping = async (categorizedUrls) => {
    const jobId = `batch_${Date.now()}`;
    
    try {
      const response = await fetch('/api/v2/scraper/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          categorizedUrls
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        message.success('Toplu scraping başlatıldı');
        
        // İlerliği izlemek için job'ı ekle
        setBatchJobs(prev => [...prev, {
          id: jobId,
          status: 'running',
          total: data.totalUrls,
          processed: 0,
          startTime: new Date()
        }]);
        
        // İlerliği takip et
        trackJobProgress(jobId);
      }
    } catch (error) {
      message.error('Toplu scraping başlatılamadı');
    }
  };

  const trackJobProgress = (jobId) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v2/scraper/job/${jobId}`);
        const data = await response.json();
        
        setBatchJobs(prev => prev.map(job => 
          job.id === jobId 
            ? { ...job, ...data.job }
            : job
        ));
        
        if (data.job.status === 'completed' || data.job.status === 'failed') {
          clearInterval(interval);
        }
      } catch (error) {
        clearInterval(interval);
      }
    }, 2000);
  };

  const jobColumns = [
    {
      title: 'İş ID',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: 'Durum',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusConfig = {
          running: { color: 'processing', text: 'Çalışıyor' },
          completed: { color: 'success', text: 'Tamamlandı' },
          failed: { color: 'error', text: 'Başarısız' }
        };
        
        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: 'İlerleme',
      key: 'progress',
      render: (_, record) => (
        <Progress 
          percent={Math.round((record.processed / record.total) * 100)} 
          status={record.status === 'failed' ? 'exception' : 'active'}
        />
      )
    },
    {
      title: 'Başlangıç',
      dataIndex: 'startTime',
      key: 'startTime',
      render: (time) => new Date(time).toLocaleString()
    }
  ];

  return (
    <Card title="Toplu Scraping">
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab="URL Listesi" key="url-list">
          <Upload
            accept=".txt,.csv"
            beforeUpload={handleUrlListUpload}
            showUploadList={false}
          >
            <Button icon={<UploadOutlined />}>URL Listesi Yükle</Button>
          </Upload>
          <p style={{ marginTop: 8 }}>Her satırda bir URL olacak şekilde .txt veya .csv dosyası yükleyin</p>
        </TabPane>
        
        <TabPane tab="Sitemap" key="sitemap">
          <Upload
            accept=".xml"
            beforeUpload={handleSitemapUpload}
            showUploadList={false}
          >
            <Button icon={<UploadOutlined />}>Sitemap Yükle</Button>
          </Upload>
          <p style={{ marginTop: 8 }}>Sitemap.xml dosyası yükleyin</p>
        </TabPane>
        
        <TabPane tab="Zamanlanmış İşler" key="scheduled">
          <p>Zamanlanmış scraping işleri burada gösterilecek</p>
        </TabPane>
      </Tabs>
      
      <div style={{ marginTop: 24 }}>
        <h3>Scraping İşleri</h3>
        <Table 
          columns={jobColumns} 
          dataSource={batchJobs} 
          rowKey="id"
          pagination={false}
        />
      </div>
    </Card>
  );
};

export default BatchScraping;
```

## 5. LLM ile İçerik Zenginleştirme

### 5.1. İçerik İşleme Servisi

```typescript
// backend/src/services/content-processor.service.ts
import OpenAI from 'openai';

interface ContentProcessorOptions {
  generateSummary: boolean;
  extractKeywords: boolean;
  assessQuality: boolean;
  customPrompt?: string;
}

interface ProcessedContent {
  summary: string;
  keywords: string[];
  qualityScore: number;
  metadata: any;
}

export class ContentProcessorService {
  private openai: OpenAI;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  
  async processContent(
    content: string, 
    category: string, 
    options: ContentProcessorOptions
  ): Promise<ProcessedContent> {
    const result: ProcessedContent = {
      summary: '',
      keywords: [],
      qualityScore: 0,
      metadata: {}
    };
    
    // Kategoriye özel prompt oluştur
    const systemPrompt = this.createCategoryPrompt(category);
    
    if (options.generateSummary) {
      result.summary = await this.generateSummary(content, systemPrompt);
    }
    
    if (options.extractKeywords) {
      result.keywords = await this.extractKeywords(content, category);
    }
    
    if (options.assessQuality) {
      result.qualityScore = await this.assessQuality(content, category);
    }
    
    return result;
  }
  
  private createCategoryPrompt(category: string): string {
    const prompts = {
      'legal': `
        Sen bir hukuk uzmanısın. Verilen yasal metni analiz edip özetle, 
        önemli hukuki terimleri çıkar ve metnin hukuki açıdan kalitesini değerlendir.
      `,
      'technical': `
        Sen bir teknik uzmansın. Verilen teknik dokümanı analiz edip özetle,
        önemli teknik terimleri çıkar ve metnin teknik doğruluğunu değerlendir.
      `,
      'news': `
        Sen bir gazetecisin. Verilen haber metnini analiz edip özetle,
        önemli anahtar kelimeleri çıkar ve haberin gazetecilik kalitesini değerlendir.
      `,
      'default': `
        Verilen metni analiz edip özetle, önemli anahtar kelimeleri çıkar 
        ve metnin genel kalitesini değerlendir.
      `
    };
    
    return prompts[category] || prompts['default'];
  }
  
  private async generateSummary(content: string, systemPrompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Aşağıdaki metni özetle (en fazla 200 kelime):\n\n${content.substring(0, 8000)}` 
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      });
      
      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('Summary generation error:', error);
      return '';
    }
  }
  
  private async extractKeywords(content: string, category: string): Promise<string[]> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `Verilen metinden en önemli 10 anahtar kelimeyi çıkar. 
            Sadece kelimeleri virgülle ayırarak listele, başka hiçbir şey ekleme.` 
          },
          { 
            role: 'user', 
            content: `Metin: ${content.substring(0, 4000)}` 
          }
        ],
        temperature: 0.1,
        max_tokens: 100
      });
      
      const keywordsText = response.choices[0].message.content || '';
      return keywordsText.split(',').map(k => k.trim()).filter(k => k.length > 0);
    } catch (error) {
      console.error('Keyword extraction error:', error);
      return [];
    }
  }
  
  private async assessQuality(content: string, category: string): Promise<number> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: `Verilen metnin kalitesini 0-100 arasında puanla. 
            Sadece puanı sayı olarak ver, başka hiçbir şey ekleme.` 
          },
          { 
            role: 'user', 
            content: `Metin: ${content.substring(0, 3000)}` 
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      });
      
      const scoreText = response.choices[0].message.content || '50';
      const score = parseInt(scoreText.trim());
      
      return isNaN(score) ? 50 : Math.min(100, Math.max(0, score));
    } catch (error) {
      console.error('Quality assessment error:', error);
      return 50;
    }
  }
}

export default new ContentProcessorService();
```

### 5.2. İçerik İşleme Pipeline

```typescript
// backend/src/pipelines/content-processing.pipeline.ts
import contentProcessor from '../services/content-processor.service';
import { generateEmbeddings } from '../services/embedding.service';

export class ContentProcessingPipeline {
  async processScrapedContent(contentId: number): Promise<void> {
    try {
      // 1. Veritabanından içeriği al
      const content = await this.getScrapedContent(contentId);
      
      if (!content) {
        throw new Error(`Content not found: ${contentId}`);
      }
      
      // 2. Durumu güncelle
      await this.updateProcessingStatus(contentId, 'processing');
      
      // 3. Kategori bilgisini al
      const category = await this.getCategory(content.category_id);
      
      // 4. LLM ile içeriği zenginleştir
      const processedContent = await contentProcessor.processContent(
        content.content,
        category.name,
        {
          generateSummary: true,
          extractKeywords: true,
          assessQuality: true
        }
      );
      
      // 5. Embedding'leri oluştur
      const embeddingStrategy = category.embedding_strategy;
      const embeddings = await generateEmbeddings(
        content.content,
        embeddingStrategy
      );
      
      // 6. Veritabanını güncelle
      await this.updateProcessedContent(contentId, {
        summary: processedContent.summary,
        keywords: processedContent.keywords,
        quality_score: processedContent.qualityScore,
        embedding: embeddings.primary,
        chunks: embeddings.chunks,
        processing_status: 'completed'
      });
      
      // 7. Etiketleri işle
      await this.processTags(contentId, processedContent.keywords, category.id);
      
      // 8. RAG sistemine entegre et
      await this.integrateWithRAG(contentId, embeddings);
      
    } catch (error) {
      console.error(`Error processing content ${contentId}:`, error);
      await this.updateProcessingStatus(contentId, 'failed');
      throw error;
    }
  }
  
  private async processTags(contentId: number, keywords: string[], categoryId: number): Promise<void> {
    // Anahtar kelimeleri mevcut etiketlerle eşleştir
    for (const keyword of keywords) {
      let tagId = await this.findOrCreateTag(keyword, categoryId);
      await this.addTagToContent(contentId, tagId, 0.8); // Varsayılan güven skoru
    }
  }
  
  private async integrateWithRAG(contentId: number, embeddings: any): Promise<void> {
    // Embedding'leri RAG sistemine entegre et
    // Bu, mevcut RAG sisteminizin API'sini kullanır
    try {
      await fetch('/api/v2/rag/integrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId,
          embeddings: embeddings.chunks.map((chunk, index) => ({
            text: chunk.text,
            embedding: chunk.embedding,
            metadata: {
              contentId,
              chunkIndex: index
            }
          }))
        })
      });
    } catch (error) {
      console.error('RAG integration error:', error);
    }
  }
  
  // Diğer yardımcı metotlar...
}

export default new ContentProcessingPipeline();
```

## 6. RAG Entegrasyonu ve Vektör Optimizasyonu

### 6.1. Kategori Bazlı Embedding Stratejileri

```typescript
// backend/src/services/category-embedding.service.ts
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import OpenAI from 'openai';

interface CategoryEmbeddingConfig {
  chunkSize: number;
  chunkOverlap: number;
  model: string;
  preprocessing: {
    preserveStructure?: boolean;
    extractArticles?: boolean;
    extractHeaders?: boolean;
    cleanLegalReferences?: boolean;
    cleanMarkdown?: boolean;
  };
}

export class CategoryEmbeddingService {
  private openai: OpenAI;
  
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  
  async generateEmbeddings(
    content: string, 
    config: CategoryEmbeddingConfig
  ): Promise<{
    primary: number[];
    chunks: Array<{
      text: string;
      embedding: number[];
      metadata: any;
    }>;
  }> {
    // 1. Ön işleme
    const processedContent = this.preprocessContent(content, config.preprocessing);
    
    // 2. Metni chunk'lara ayır
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
      separators: this.getSeparators(config.preprocessing)
    });
    
    const chunks = await splitter.splitText(processedContent);
    
    // 3. Embedding'leri oluştur
    const embeddings = [];
    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk, config.model);
      embeddings.push({
        text: chunk,
        embedding,
        metadata: {
          chunkSize: chunk.length,
          model: config.model
        }
      });
    }
    
    // 4. Birincil embedding (tüm içerik için)
    const primaryEmbedding = await this.generateEmbedding(
      processedContent.substring(0, 8000), // Token limit
      config.model
    );
    
    return {
      primary: primaryEmbedding,
      chunks: embeddings
    };
  }
  
  private preprocessContent(content: string, preprocessing: any): string {
    let processed = content;
    
    if (preprocessing.preserveStructure) {
      // Yapıyı koru (başlıklar, paragraflar)
      processed = this.preserveStructure(processed);
    }
    
    if (preprocessing.extractArticles) {
      // Yasal maddeleri çıkar
      processed = this.extractLegalArticles(processed);
    }
    
    if (preprocessing.extractHeaders) {
      // Başlıkları çıkar
      processed = this.extractHeaders(processed);
    }
    
    if (preprocessing.cleanLegalReferences) {
      // Yasal referansları temizle
      processed = this.cleanLegalReferences(processed);
    }
    
    if (preprocessing.cleanMarkdown) {
      // Markdown'i temizle
      processed = this.cleanMarkdown(processed);
    }
    
    return processed;
  }
  
  private getSeparators(preprocessing: any): string[] {
    if (preprocessing.preserveStructure) {
      return ['\n\n\n', '\n\n', '\n', '. ', ', ', ' ', ''];
    }
    
    if (preprocessing.extractArticles) {
      return ['\n\nMadde ', '\n\n', '\n', '. ', ', ', ' ', ''];
    }
    
    return ['\n\n\n', '\n\n', '\n', '. ', ', ', ' ', ''];
  }
  
  private async generateEmbedding(text: string, model: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: model || 'text-embedding-3-small',
        input: text
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Embedding generation error:', error);
      // Yerel embedding'e geri dön
      return this.generateLocalEmbedding(text);
    }
  }
  
  private generateLocalEmbedding(text: string): number[] {
    // Basit hash-based embedding (mevcut sistemden alınabilir)
    const embedding = new Array(1536).fill(0);
    
    for (let i = 0; i < Math.min(text.length, 2000); i++) {
      const charCode = text.charCodeAt(i);
      const index = (charCode * (i + 1)) % embedding.length;
      embedding[index] += Math.sin(charCode * 0.01 + i * 0.001);
    }
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] = embedding[i] / magnitude;
      }
    }
    
    return embedding;
  }
  
  // Diğer yardımcı metotlar...
}

export default new CategoryEmbeddingService();
```

## 7. Yol Haritası

### 7.1. Faz 1: Temel Altyapı (1-2 ay)

1. **Veritabanı Şemasını Güncelle**
   - Kategori, kaynak ve etiket tablolarını oluştur
   - Mevcut scraped_content tablosunu genişlet

2. **Temel Dashboard Bileşenleri**
   - Kaynak yönetimi bileşeni
   - Kategori yönetimi bileşeni
   - Basit scraping arayüzü

3. **API Endpoint'leri**
   - Kategori ve kaynak yönetimi API'leri
   - Basit scraping endpoint'leri

### 7.2. Faz 2: Toplu Scraping ve İşleme (2-3 ay)

1. **Toplu Scraping Özellikleri**
   - URL listesi ve sitemap import
   - Zamanlanmış scraping
   - İlerleme takibi

2. **LLM Entegrasyonu**
   - İçerik özetleme
   - Anahtar kelime çıkarma
   - Kalite değerlendirme

3. **İşleme Pipeline**
   - Otomatik içerik işleme
   - Embedding optimizasyonu
   - RAG entegrasyonu

### 7.3. Faz 3: İleri Özellikler (3-4 ay)

1. **Akıllı Kategori Atama**
   - Otomatik kategori tespiti
   - İçerik benzerliğine göre gruplama

2. **Gelişmiş Analiz**
   - İçerik ilişkilendirme
   - Etkileşimli görselleştirme
   - Performans metrikleri

3. **RAG Optimizasyonu**
   - Kategori bazlı arama stratejileri
   - İçerik önerileri
   - Semantik ilişkiler

### 7.4. Faz 4: Ölçeklendirme ve Optimizasyon (4+ ay)

1. **Performans Optimizasyonu**
   - Parallel processing
   - Cache optimizasyonu
   - Resource pooling

2. **Kullanıcı Deneyimi**
   - Geri bildirim sistemi
   - Kişiselleştirme
   - Eğitim materyalleri

3. **Entegrasyonlar**
   - Dışarıdan veri kaynakları
   - API erişimi
   - Üçüncü parti araçlar

## 8. Sonuç

Bu yol haritası, Luwi Semantic Bridge scraper dashboard'ını basit bir URL scraping arayüzünden, kategori bazlı içerik toplama, LLM ile zenginleştirme ve RAG sistemine entegrasyon sağlayan kapsamlı bir platforma dönüştürecektir.

**Ana Avantajlar:**
1. **Kategori Bazlı Yaklaşım**: Farklı içerik türleri için özel stratejiler
2. **LLM Entegrasyonu**: Otomatik özetleme, anahtar kelime çıkarma ve kalite değerlendirme
3. **Akıllı Embedding**: Kategoriye özel embedding stratejileri
4. **RAG Entegrasyonu**: Doğrudan semantik arama sistemine entegrasyon
5. **Ölçeklenebilirlik**: Toplu işlemler ve otomasyon

Bu yaklaşım, Luwi Semantic Bridge'i sadece bir scraping aracından, akıllı içerik yönetimi ve semantik arama platformuna dönüştürecektir.