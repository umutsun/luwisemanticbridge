# Luwi Semantic Bridge - Scrapy Geçiş Stratejisi

## 1. Scrapy'ye Geçiş Senaryosu

### 1.1. Neden Scrapy?

Luwi Semantic Bridge'in Scrapy'ye geçiş düşünülmesi durumunda aşağı avantajlar elde edilebilir:

1. **Endüstri Standardı**: Kanıtlanmış, olgun ve extensively test edilmiş framework
2. **Asenkron Mimari**: Twisted tabanlı yüksek performanslı ağ işleme
3. **Ölçeklenebilirlik**: Dahili dağıtık scraping desteği
4. **Geniş Ekosistem**: 1000+ eklenti ve middleware
5. **Kurumsal Özellikler**: Rate limiting, throttling, proxy yönetimi

### 1.2. Mevcut Sistemden Scrapy'ye Geçiş Mimarisi

```
┌────────────────────────────────────────────────────┐
│                Mevcut API Katmanı                  │
│  ┌─────────────────────────────────────────────┐  │
│  │  Express.js Router (scraper.routes.ts)     │  │
│  │  MCP WebScrape Tool Integration            │  │
│  │  n8n Custom Nodes                         │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│              Köprü Katmanı (Bridge)                │
│  ┌─────────────────────────────────────────────┐  │
│  │  Scrapy REST API Wrapper                  │  │
│  │  Job Queue Manager                        │  │
│  │  Result Processor                         │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│                Scrapy Cluster                    │
│  ┌─────────────────────────────────────────────┐  │
│  │  Scrapy Master Node                        │  │
│  │  ┌─────────────────────────────────────┐   │  │
│  │  │  Türk Devlet Siteleri Spider        │   │  │
│  │  │  Genel Web Spider                   │   │  │
│  │  │  SPA Spider (Splash ile)            │   │  │
│  │  └─────────────────────────────────────┘   │  │
│  │  Scrapy Worker Nodes                    │  │
│  │  Redis Queue + Scrapy Redis             │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│               Veri İşleme Katmanı                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  Scrapy Pipelines                         │  │
│  │  ┌─────────────────────────────────────┐   │  │
│  │  │  PostgreSQL Pipeline                │   │  │
│  │  │  Embedding Pipeline                  │   │  │
│  │  │  Deduplication Pipeline             │   │  │
│  │  │  Turkish Content Processor          │   │  │
│  │  └─────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│               Depolama Katmanı                     │
│  ┌─────────────────────────────────────────────┐  │
│  │  PostgreSQL (pgvector)                   │  │
│  │  Redis (Job Queue + Cache)              │  │
│  │  Scrapy Stats Collection                │  │
│  └─────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

## 2. Detaylı Implementasyon Planı

### 2.1. Scrapy Proje Yapısı

```
luwi-scrapy/
├── scrapy.cfg
├── requirements.txt
├── luwi_scraper/
│   ├── __init__.py
│   ├── settings.py
│   ├── middlewares.py
│   ├── pipelines.py
│   ├── items.py
│   └── spiders/
│       ├── __init__.py
│       ├── turkish_gov.py
│       ├── general_web.py
│       ├── spa_spider.py
│       └── sitemap_spider.py
├── utils/
│   ├── gib_parser.py
│   ├── content_cleaner.py
│   └── embedding_client.py
└── api/
    ├── scrapy_wrapper.py
    └── job_manager.py
```

### 2.2. Türk Devlet Siteleri için Özel Spider

```python
# luwi_scraper/spiders/turkish_gov.py
import scrapy
from scrapy.linkextractors import LinkExtractor
from scrapy.spiders import CrawlSpider, Rule
from urllib.parse import urljoin
import re

class TurkishGovSpider(CrawlSpider):
    name = 'turkish_gov'
    allowed_domains = ['gib.gov.tr', 'mevzuat.gov.tr', 'resmigazete.gov.tr']
    
    rules = (
        Rule(LinkExtractor(allow=r'/kanun/|/mevzuat/|/madde/'), callback='parse_law', follow=True),
        Rule(LinkExtractor(allow=r'/\d{4}/\d+/\d+'), callback='parse_article', follow=True),
    )
    
    def start_requests(self):
        urls = [
            'https://www.gib.gov.tr',
            'https://www.mevzuat.gov.tr',
            'https://www.resmigazete.gov.tr'
        ]
        
        for url in urls:
            yield scrapy.Request(
                url=url,
                callback=self.parse,
                meta={
                    'splash': {'args': {'wait': 3}},  # Splash for JS content
                    'dont_cache': True
                },
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
                }
            )
    
    def parse_law(self, response):
        """Kanun maddelerini yapısal olarak çıkar"""
        self.logger.info(f'Kanun sayfası işleniyor: {response.url}')
        
        # Başlığı çıkar
        title = response.css('h1::text, .baslik::text, .law-title::text').get()
        
        # Kanun maddelerini çıkar
        articles = []
        
        # Farklı selector'ları dene
        article_selectors = [
            '.accordion-item',
            '.panel',
            '.tab-pane',
            '[id*="madde"]',
            '.law-article'
        ]
        
        for selector in article_selectors:
            for article in response.css(selector):
                madde_no = article.css('.accordion-header::text, .madde-no::text, h3::text').get()
                madde_text = article.css('.accordion-body::text, .madde-text::text, p::text').getall()
                
                if madde_no and madde_text:
                    articles.append({
                        'madde_no': madde_no.strip(),
                        'metin': ' '.join(madde_text).strip()
                    })
        
        if not articles:
            # Metinden regex ile çıkar
            text_content = ' '.join(response.css('::text').getall())
            madde_pattern = r'Madde\s+(\d+)\s*[-–—:]\s*(.+?)(?=Madde\s+\d+|$)'
            
            for match in re.finditer(madde_pattern, text_content, re.DOTALL):
                articles.append({
                    'madde_no': f"Madde {match.group(1)}",
                    'metin': match.group(2).strip()
                })
        
        yield {
            'url': response.url,
            'title': title.strip() if title else '',
            'content_type': 'law',
            'articles': articles,
            'scraping_method': 'scrapy-turkish-gov',
            'metadata': {
                'domain': response.url.split('/')[2],
                'content_length': sum(len(a['metin']) for a in articles),
                'article_count': len(articles)
            }
        }
```

### 2.3. SPA Spider (Splash ile)

```python
# luwi_scraper/spiders/spa_spider.py
import scrapy
from scrapy_splash import SplashRequest

class SPASpider(scrapy.Spider):
    name = 'spa_spider'
    
    def start_requests(self):
        yield SplashRequest(
            self.url,
            self.parse,
            args={'wait': 3, 'resource_timeout': 10},
            endpoint='render.json'
        )
    
    def parse(self, response):
        # JavaScript içeriği bekle
        # React/Vue/Angular içerik çıkar
        pass
```

### 2.4. PostgreSQL Pipeline

```python
# luwi_scraper/pipelines.py
import psycopg2
from psycopg2.extras import Json
from itemadapter import ItemAdapter
import hashlib
from datetime import datetime

class PostgreSQLPipeline:
    def __init__(self, postgres_config):
        self.postgres_config = postgres_config
    
    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            postgres_config=crawler.settings.getdict("POSTGRES_CONFIG")
        )
    
    def open_spider(self, spider):
        self.conn = psycopg2.connect(**self.postgres_config)
        self.cursor = self.conn.cursor()
        
        # Tabloları oluştur
        self.cursor.execute("""
            CREATE TABLE IF NOT EXISTS scraped_data_scrapy (
                id SERIAL PRIMARY KEY,
                url TEXT UNIQUE NOT NULL,
                title TEXT,
                content TEXT,
                content_type TEXT,
                articles JSONB,
                metadata JSONB,
                scraping_method TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        self.conn.commit()
    
    def close_spider(self, spider):
        self.conn.close()
    
    def process_item(self, item, spider):
        # URL hash'i oluştur
        url_hash = hashlib.md5(item['url'].encode()).hexdigest()
        
        # İçeriği birleştir
        content = item.get('content', '')
        if item.get('articles'):
            content = '\n\n'.join([
                f"{a['madde_no']}\n{a['metin']}" 
                for a in item['articles']
            ])
        
        # Veritabanına kaydet
        self.cursor.execute("""
            INSERT INTO scraped_data_scrapy 
            (url, title, content, content_type, articles, metadata, scraping_method)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (url) 
            DO UPDATE SET 
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                content_type = EXCLUDED.content_type,
                articles = EXCLUDED.articles,
                metadata = EXCLUDED.metadata,
                scraping_method = EXCLUDED.scraping_method,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (
            item['url'],
            item.get('title', ''),
            content,
            item.get('content_type', 'general'),
            Json(item.get('articles', [])),
            Json(item.get('metadata', {})),
            item.get('scraping_method', 'scrapy')
        ))
        
        item_id = self.cursor.fetchone()[0]
        item['db_id'] = item_id
        
        self.conn.commit()
        return item
```

### 2.5. Embedding Pipeline

```python
# luwi_scraper/pipelines.py (devam)

class EmbeddingPipeline:
    def __init__(self, openai_api_key):
        self.openai_api_key = openai_api_key
        self.embedding_client = None
    
    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            openai_api_key=crawler.settings.get("OPENAI_API_KEY")
        )
    
    def open_spider(self, spider):
        if self.openai_api_key:
            import openai
            self.embedding_client = openai.Client(api_key=self.openai_api_key)
    
    def process_item(self, item, spider):
        if not self.embedding_client or not item.get('content'):
            return item
        
        try:
            # Metni chunk'lara ayır
            content = item['content']
            chunks = self.split_into_chunks(content)
            
            # Embedding'leri oluştur
            embeddings = []
            for chunk in chunks:
                response = self.embedding_client.embeddings.create(
                    model="text-embedding-3-small",
                    input=chunk
                )
                embeddings.append({
                    'chunk_text': chunk,
                    'embedding': response.data[0].embedding
                })
            
            item['embeddings'] = embeddings
            
        except Exception as e:
            spider.logger.error(f"Embedding hatası: {e}")
        
        return item
    
    def split_into_chunks(self, text, chunk_size=1000, overlap=200):
        chunks = []
        for i in range(0, len(text), chunk_size - overlap):
            chunks.append(text[i:i + chunk_size])
        return chunks
```

### 2.6. API Bridge Katmanı

```python
# api/scrapy_wrapper.py
from flask import Flask, request, jsonify
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from twisted.internet import reactor
import threading
import redis
import json

app = Flask(__name__)
redis_client = redis.Redis(host='localhost', port=6379, db=0)

class ScrapyRunner:
    def __init__(self):
        self.process = None
        self.results = {}
    
    def run_spider(self, spider_name, url, **kwargs):
        settings = get_project_settings()
        self.process = CrawlerProcess(settings)
        
        # Sonuçları sakla
        job_id = kwargs.get('job_id', f"job_{int(time.time())}")
        
        def item_scraped(item):
            # Sonuçları Redis'e yaz
            redis_client.lpush(f"scrapy_results:{job_id}", json.dumps(dict(item)))
        
        # Spider'ı çalıştır
        self.process.crawl(
            spider_name, 
            start_urls=[url],
            **kwargs,
            callback=item_scraped
        )
        
        # Thread içinde çalıştır
        thread = threading.Thread(target=self.process.start)
        thread.start()
        
        return job_id

scrapy_runner = ScrapyRunner()

@app.route('/api/v2/scraper/scrapy', methods=['POST'])
def scrape_with_scrapy():
    data = request.json
    url = data.get('url')
    spider_type = data.get('spider_type', 'general_web')
    
    if not url:
        return jsonify({'error': 'URL required'}), 400
    
    # Spider tipine göre seç
    spider_map = {
        'turkish_gov': 'turkish_gov',
        'spa': 'spa_spider',
        'general': 'general_web'
    }
    
    spider_name = spider_map.get(spider_type, 'general_web')
    
    # Scrapy'yi çalıştır
    job_id = scrapy_runner.run_spider(
        spider_name=spider_name,
        url=url,
        job_id=f"scrapy_{int(time.time())}"
    )
    
    return jsonify({
        'success': True,
        'job_id': job_id,
        'status_url': f'/api/v2/scraper/scrapy/status/{job_id}'
    })

@app.route('/api/v2/scraper/scrapy/status/<job_id>')
def get_scrapy_status(job_id):
    # Redis'den sonuçları al
    results = []
    while True:
        result = redis_client.rpop(f"scrapy_results:{job_id}")
        if not result:
            break
        results.append(json.loads(result))
    
    return jsonify({
        'job_id': job_id,
        'results': results,
        'total': len(results)
    })
```

## 3. Geçiş Stratejisi

### 3.1. Faz 1: Paralel Çalışma (1-2 ay)

1. **Scrapy Kurulumu**
   ```bash
   # Yeni Scrapy projesi
   pip install scrapy scrapy-splash psycopg2-binary
   scrapy startproject luwi_scraper
   ```

2. **Temel Spider'lar**
   - Türk devlet siteleri spider'ı
   - Genel web spider'ı
   - Test ve benchmark

3. **API Bridge**
   - Mevcut Express.js ile Scrapy arası köprü
   - Job queue sistemi
   - Result processor

### 3.2. Faz 2: Hibrit Sistem (2-4 ay)

1. **Akıllı Yönlendirme**
   ```javascript
   // Mevcut scraper.routes.ts'de
   router.post('/', async (req: Request, res: Response) => {
     const { useScrapy = false, spiderType = 'general' } = req.body;
     
     if (useScrapy) {
       // Scrapy'yi çağır
       const result = await scrapyWrapper.scrape(req.body.url, spiderType);
       return res.json(result);
     }
     
     // Mevcut sistemi kullan
     // ... existing code
   });
   ```

2. **Performans Karşılaştırması**
   - Aynı URL'ler için test
   - Hız ve kaynak kullanımı karşılaştırması
   - Sonuç kalitesi analizi

### 3.3. Faz 3: Tam Geçiş (4-6 ay)

1. **Scrapy Varsayılan Yap**
   - Büyük projeler için otomatik Scrapy kullanımı
   - Mevcut sistem sadece özel durumlar için

2. **Mikroservis Mimarisi**
   - Scrapy cluster kurulumu
   - Load balancing
   - Dağıtık job queue

## 4. Avantajlar ve Dezavantajlar

### 4.1. Avantajlar

1. **Performans**
   - 10x daha yüksek throughput
   - Daha düşük CPU kullanımı
   - Daha iyi kaynak yönetimi

2. **Ölçeklenebilirlik**
   - Horizontal scaling (daha fazla worker)
   - Dağıtık scraping
   - Load balancing

3. **Özellikler**
   - Dahili rate limiting
   - Otomatik retry
   - Proxy rotasyonu
   - Geniş middleware ekosistemi

4. **Bakım**
   - Standartlaştırılmış yapı
   - Daha az özel kod
   - Topluluk desteği

### 4.2. Dezavantajlar

1. **Geçiş Maliyeti**
   - Python ekosistemine geçiş
   - Ekip eğitimi gerekir
   - İki sistem bakımı geçiş süresince

2. **Öğrenme Eğrisi**
   - Scrapy'nin karmaşık yapısı
   - Twisted framework öğrenmesi
   - Pipeline ve middleware geliştirme

3. **JavaScript Siteleri**
   - Splash kurulumu gerekir
   - Ek Docker container'ları
   - Daha fazla karmaşıklık

## 5. Sonuç

Scrapy'ye geçiş, Luwi Semantic Bridge için **uzun vadeli bir yatırım** olacaktır:

**Kısa vadede:**
- Daha yüksek geliştirme maliyeti
- Öğrenme eğrisi
- Geçiş sırasında karmaşıklık

**Uzun vadede:**
- 10x daha yüksek performans
- Daha düşük bakım maliyeti
- Endüstri standardı çözüm
- Ölçeklenebilir mimari

**Tavsiye:**
Eğer proje büyük ölçekli scraping hedefliyorsa (1000+ URL/gün) ve uzun vadeli sürdürülebilirlik önemliyse, Scrapy'ye geçiş değerlendirilmelidir. Ancak küçük-orta ölçekli projeler için hibrit yaklaşım daha uygun olabilir.