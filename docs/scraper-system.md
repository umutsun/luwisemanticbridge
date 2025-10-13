# Luwi Semantic Bridge - Scraper System Documentation

## Overview

The Luwi Scraper System is an intelligent web scraping platform that combines automated content extraction, LLM-based processing, and semantic search capabilities. It provides tools for analyzing website structures, extracting entities, and building searchable knowledge bases from scraped content.

## Architecture

### Core Components

1. **Web Scraper Service** (`web-scraper.service.ts`)
   - URL analysis and selector detection
   - Static and dynamic content extraction
   - Markdown output generation

2. **Intelligent Scraper Service** (`intelligent-scraper.service.ts`)
   - Site structure analysis
   - Route pattern detection
   - Semantic search integration

3. **Category Scraper Service** (`category-scraper.service.ts`)
   - Bulk category scraping
   - Pagination handling
   - Product detail extraction

4. **NER Service** (`ner-service.ts`)
   - Named Entity Recognition
   - Regex + LLM hybrid approach
   - Custom entity type support

5. **Content Processor Service** (`scrape-content-processor.service.ts`)
   - LLM-based content processing
   - Language detection
   - Content summarization
   - Quality scoring

6. **Project Site Manager** (`project-site-manager.service.ts`)
   - Site-project relationship management
   - Automatic site configuration
   - Entity type configuration

## Database Schema

### scrape_embeddings Table

```sql
CREATE TABLE scrape_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content fields
  original_content TEXT NOT NULL,
  processed_content TEXT,
  summary TEXT,

  -- Embedding field
  embedding vector(1536),

  -- Source information
  source_url TEXT NOT NULL,
  source_type VARCHAR(50) DEFAULT 'scrape',

  -- Project and site relationship
  project_id UUID NOT NULL,
  site_id UUID,
  scrape_session_id UUID,

  -- Content metadata
  title TEXT,
  author TEXT,
  publish_date TIMESTAMP,
  content_type VARCHAR(50) DEFAULT 'general',
  language VARCHAR(10) DEFAULT 'tr',

  -- Entity information
  entities JSONB DEFAULT '[]',
  entity_types TEXT[] DEFAULT '{}',

  -- Extended metadata
  metadata JSONB DEFAULT '{}',

  -- Processing information
  processing_status VARCHAR(20) DEFAULT 'pending',
  processing_errors TEXT[],
  llm_processed BOOLEAN DEFAULT FALSE,

  -- Chunking information
  chunk_index INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 1,
  parent_id UUID REFERENCES scrape_embeddings(id),

  -- Quality metrics
  relevance_score FLOAT,
  quality_score FLOAT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);
```

### Indexes

- Vector index for semantic search (HNSW)
- Composite indexes for common queries
- GIN indexes for JSONB fields
- URL hash index for deduplication

## API Endpoints

### Workflow Management
- `POST /api/v2/scraper/concept-workflow` - Start concept analysis workflow
- `GET /api/v2/scraper/workflow-jobs/{jobId}` - Get workflow status
- `GET /api/v2/scraper/workflows` - List all workflows

### Site Management
- `POST /api/v2/scraper/projects/{projectId}/sites` - Add site to project
- `GET /api/v2/scraper/projects/{projectId}/sites` - List project sites
- `POST /api/v2/scraper/sites/{siteId}/analyze` - Analyze site structure
- `POST /api/v2/scraper/sites/{siteId}/entity-types` - Configure entity types

### Content Scraping
- `POST /api/v2/scraper/scrape` - Scrape single URL
- `POST /api/v2/scraper/category-scrape` - Start category scraping
- `GET /api/v2/scraper/category-scrape/{jobId}/status` - Get scraping progress
- `POST /api/v2/scraper/batch-scrape` - Batch scrape URLs

### Entity Extraction
- `POST /api/v2/scraper/extract-entities` - Extract entities from text
- `GET /api/v2/scraper/projects/{projectId}/entities` - List project entities
- `GET /api/v2/scraper/entity-types` - Get available entity types

### Search
- `POST /api/v2/scraper/semantic-search` - Semantic search across scraped content
- `GET /api/v2/scraper/search-jobs/{jobId}` - Get search results

## Workflow Types

### 1. Concept Workflow
Analyzes a concept across multiple sites:
1. Searches for relevant content
2. Scrapes discovered URLs
3. Extracts entities
4. Synthesizes comprehensive content
5. Generates embeddings

### 2. Category Scraping
Bulk scrapes product/content categories:
1. Analyzes category page structure
2. Extracts product/content URLs
3. Follows pagination
4. Scrapes individual items
5. Processes and stores content

## Site Configuration

When adding a site, the system automatically:
1. Detects site type (ecommerce, blog, news, etc.)
2. Analyzes URL patterns
3. Identifies content selectors
4. Configures entity types
5. Sets up scraping rules

### Supported Site Types
- **Website**: General content sites
- **E-commerce**: Online stores with products
- **Blog**: Blog platforms and personal blogs
- **News**: News websites and articles
- **API**: Structured data sources

## Entity Types

### Default Entities
- **Contact**: Email, Phone, Address
- **Content**: Dates, Image URLs, Source URLs
- **Product**: ISBN, SKU, Price, Currency
- **Location**: Addresses, Coordinates
- **User**: Names, Usernames

### E-commerce Specific
- ISBN numbers
- Product IDs/SKUs
- Prices and currencies
- Barcodes
- Stock status
- Discount percentages

## Content Processing Pipeline

1. **Scraping**
   - Extract raw content
   - Detect HTML structure
   - Apply site-specific selectors

2. **Initial Processing**
   - Remove HTML tags
   - Extract text content
   - Detect language

3. **Entity Extraction**
   - Apply regex patterns
   - Run LLM-based NER
   - Combine and validate entities

4. **LLM Processing**
   - Generate summary
   - Extract key points
   - Identify topics
   - Calculate quality score

5. **Embedding Generation**
   - Use processed content
   - Generate 1536-dim vectors
   - Store with metadata

## Usage Examples

### Adding a Site with Auto-Detection

```javascript
const response = await fetch('/api/v2/scraper/projects/PROJECT_ID/sites', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Kitapyurdu',
    baseUrl: 'https://www.kitapyurdu.com',
    category: 'bookstore',
    type: 'ecommerce',
    autoDetect: true
  })
});
```

### Starting Category Scraping

```javascript
const response = await fetch('/api/v2/scraper/category-scrape', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    categoryUrl: 'https://example.com/category/books',
    projectId: 'PROJECT_ID',
    maxProducts: 100,
    extractEntities: true,
    followPagination: true
  })
});
```

### Semantic Search

```javascript
const response = await fetch('/api/v2/scraper/semantic-search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'Pinokyo kitap özeti',
    projectIds: ['PROJECT_ID'],
    maxResultsPerSite: 5,
    filters: {
      siteType: 'ecommerce',
      hasEntities: true
    }
  })
});
```

## Configuration

### Environment Variables
- `OPENAI_API_KEY`: Required for LLM processing
- `SCRAPER_RATE_LIMIT`: Default delay between requests (ms)
- `SCRAPER_MAX_CONCURRENT`: Maximum concurrent requests
- `EMBEDDING_MODEL`: OpenAI embedding model (default: text-embedding-ada-002)

### Rate Limiting
- Default: 1000ms between requests
- Configurable per site
- Automatic backoff on errors

## Best Practices

1. **Site Analysis**
   - Always run site analysis before bulk scraping
   - Review detected selectors
   - Test with sample URLs

2. **Entity Configuration**
   - Enable only necessary entity types
   - Customize patterns for specific sites
   - Validate extraction results

3. **Content Processing**
   - Monitor LLM processing costs
   - Batch process when possible
   - Review quality scores

4. **Performance**
   - Use appropriate batch sizes
   - Monitor database indexes
   - Cache frequently accessed content

## Troubleshooting

### Common Issues

1. **Site Analysis Fails**
   - Check if site is accessible
   - Verify robots.txt permissions
   - Review rate limiting settings

2. **Entity Extraction Missing**
   - Ensure entity types are configured
   - Check regex patterns
   - Verify content language

3. **No Search Results**
   - Check if embeddings are generated
   - Verify query format
   - Review search filters

4. **Processing Errors**
   - Check OpenAI API key
   - Review error logs
   - Validate content format

## Monitoring

### Key Metrics
- Scrape success rate
- Processing queue size
- Average processing time
- Entity extraction accuracy
- Search response time

### Logs
- Scrape requests and responses
- Processing errors
- Performance metrics
- API usage

## Future Enhancements

1. **Advanced Features**
   - Scheduled scraping
   - Change detection
   - Content versioning
   - Custom scraping rules

2. **AI Improvements**
   - Fine-tuned models
   - Multi-language support
   - Advanced entity relationships
   - Content classification

3. **Performance**
   - Distributed scraping
   - Caching layer
   - Background processing
   - Result streaming

## Security Considerations

1. **Access Control**
   - Project-based isolation
   - API key management
   - User permissions

2. **Data Privacy**
   - PII detection
   - Content anonymization
   - GDPR compliance

3. **Rate Limiting**
   - Domain-specific limits
   - Request throttling
   - IP rotation support