import { webScraperService } from './web-scraper.service';
import { nerService } from './ner-service';
import { lsembPool } from '../config/database.config';
import { redis } from '../server';
import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';

interface CategoryScrapeJob {
  id: string;
  categoryUrl: string;
  categoryId?: string;
  maxProducts?: number;
  includeImages?: boolean;
  extractEntities?: boolean;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentPage: number;
  totalPages: number;
  productsScraped: number;
  products: any[];
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface ProductInfo {
  url: string;
  title: string;
  price?: string;
  originalPrice?: string;
  discount?: string;
  author?: string;
  publisher?: string;
  isbn?: string;
  rating?: number;
  image?: string;
  category?: string;
  inStock?: boolean;
  description?: string;
  metadata?: any;
}

export class CategoryScraperService {
  private jobs: Map<string, CategoryScrapeJob> = new Map();

  /**
   * Start scraping all products from a category
   */
  async startCategoryScraping(options: {
    categoryUrl: string;
    categoryId?: string;
    maxProducts?: number;
    includeImages?: boolean;
    extractEntities?: boolean;
    projectId?: string;
  }): Promise<string> {
    const jobId = uuidv4();
    const job: CategoryScrapeJob = {
      id: jobId,
      categoryUrl: options.categoryUrl,
      categoryId: options.categoryId,
      maxProducts: options.maxProducts || 1000,
      includeImages: options.includeImages !== false,
      extractEntities: options.extractEntities !== false,
      status: 'queued',
      progress: 0,
      currentPage: 1,
      totalPages: 1,
      productsScraped: 0,
      products: [],
      createdAt: new Date().toISOString()
    };

    this.jobs.set(jobId, job);

    // Save to Redis
    await redis.setex(`category-scrape:${jobId}`, 3600, JSON.stringify(job));

    // Process asynchronously
    this.processCategoryScraping(jobId, options);

    return jobId;
  }

  /**
   * Process category scraping
   */
  private async processCategoryScraping(
    jobId: string,
    options: any
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'processing';
      await this.updateJob(job);

      // Analyze category page structure
      const structure = await this.analyzeCategoryPage(job.categoryUrl);
      job.totalPages = structure.totalPages || 1;
      await this.updateJob(job);

      // Scrape all pages
      let pageNum = 1;
      let allProducts: ProductInfo[] = [];

      while (pageNum <= job.totalPages && job.productsScraped < job.maxProducts!) {
        // Update progress
        job.currentPage = pageNum;
        job.progress = Math.round(((pageNum - 1) / job.totalPages) * 90);
        await this.updateJob(job);

        // Get page URL
        const pageUrl = this.getPageUrl(job.categoryUrl, pageNum, structure.pagePattern);

        // Scrape products from current page
        const products = await this.scrapePageProducts(
          pageUrl,
          structure,
          options
        );

        // Add to results
        allProducts = allProducts.concat(products);
        job.productsScraped = allProducts.length;
        job.products = allProducts.slice(0, job.maxProducts);

        // Check if we've reached max products
        if (allProducts.length >= job.maxProducts!) {
          break;
        }

        pageNum++;
      }

      // Extract entities if requested
      if (job.extractEntities) {
        job.progress = 95;
        await this.updateJob(job);

        for (const product of job.products) {
          if (product.description) {
            const entities = await nerService.extractEntities(
              `${product.title} ${product.description}`,
              {
                entityTypes: ['PERSON', 'ORG', 'GPE', 'PRODUCT_ID', 'MONEY', 'DATE']
              }
            );
            product.entities = entities.entities;
          }
        }
      }

      // Complete
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      await this.updateJob(job);

      // Save to database
      if (options.projectId) {
        await this.saveToDatabase(job.products, options.projectId);
      }

    } catch (error) {
      console.error('Category scraping failed:', error);
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      await this.updateJob(job);
    }
  }

  /**
   * Analyze category page structure
   */
  private async analyzeCategoryPage(url: string): Promise<any> {
    const result = await webScraperService.scrape(url, {
      wordCountThreshold: 50
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    const $ = cheerio.load(result.content);
    const structure: any = {
      productSelector: '',
      titleSelector: '',
      priceSelector: '',
      imageSelector: '',
      linkSelector: '',
      paginationSelector: '',
      pagePattern: '?page={id}',
      totalPages: 1
    };

    // Find product container
    const productContainers = [
      '.product-item',
      '.product-card',
      '.product-box',
      '.book-item',
      '.item',
      '[data-product]'
    ];

    for (const selector of productContainers) {
      if ($(selector).length > 0) {
        structure.productSelector = selector;
        break;
      }
    }

    // Extract product info from first item
    const firstProduct = $(structure.productSelector).first();
    if (firstProduct.length) {
      // Title
      const titleSelectors = ['a[href*="/kitap/"]', '.title', '.name', 'h2', 'h3'];
      for (const selector of titleSelectors) {
        if (firstProduct.find(selector).length) {
          structure.titleSelector = selector;
          break;
        }
      }

      // Link
      const link = firstProduct.find('a[href*="/kitap/"]').attr('href');
      if (link) {
        structure.linkSelector = 'a[href*="/kitap/"]';
      }

      // Price
      const priceSelectors = ['.price', '.fiyat', '.amount'];
      for (const selector of priceSelectors) {
        if (firstProduct.find(selector).length) {
          structure.priceSelector = selector;
          break;
        }
      }

      // Image
      const imageSelectors = ['img', '.image img', '.photo img'];
      for (const selector of imageSelectors) {
        if (firstProduct.find(selector).length) {
          structure.imageSelector = selector;
          break;
        }
      }
    }

    // Find pagination
    const paginationSelectors = [
      '.pagination',
      '.paging',
      '.pages'
    ];

    for (const selector of paginationSelectors) {
      const pagination = $(selector);
      if (pagination.length) {
        structure.paginationSelector = selector;

        // Extract page numbers
        const pageLinks = pagination.find('a').filter((i, el) => {
          const text = $(el).text().trim();
          return /^\d+$/.test(text);
        });

        if (pageLinks.length > 0) {
          const maxPage = Math.max(
            ...pageLinks.map((i, el) => parseInt($(el).text().trim()))
          );
          structure.totalPages = maxPage;
        }

        break;
      }
    }

    // Detect page pattern
    if (url.includes('.html')) {
      structure.pagePattern = url.replace(/\.html$/, '/{page}.html');
    } else if (url.includes('?')) {
      structure.pagePattern = url + '&page={id}';
    } else {
      structure.pagePattern = url + '?page={id}';
    }

    return structure;
  }

  /**
   * Scrape products from a single page
   */
  private async scrapePageProducts(
    url: string,
    structure: any,
    options: any
  ): Promise<ProductInfo[]> {
    const result = await webScraperService.scrape(url, {
      wordCountThreshold: 50
    });

    if (!result.success) {
      return [];
    }

    const $ = cheerio.load(result.content);
    const products: ProductInfo[] = [];

    $(structure.productSelector).each((i, element) => {
      const $product = $(element);

      // Extract product info
      const titleEl = $product.find(structure.titleSelector);
      const title = titleEl.text().trim();

      if (!title) return;

      const linkEl = $product.find(structure.linkSelector);
      let productUrl = linkEl.attr('href');
      if (productUrl && !productUrl.startsWith('http')) {
        productUrl = `https://www.kitapyurdu.com${productUrl}`;
      }

      // Price
      const priceEl = $product.find(structure.priceSelector);
      const price = priceEl.text().trim();

      // Image
      let image = '';
      if (structure.imageSelector) {
        const imageEl = $product.find(structure.imageSelector);
        image = imageEl.attr('src') || imageEl.attr('data-src') || '';
        if (image && !image.startsWith('http')) {
          image = `https://www.kitapyurdu.com${image}`;
        }
      }

      const product: ProductInfo = {
        url: productUrl || '',
        title,
        price,
        image
      };

      products.push(product);
    });

    // Scrape detailed info for each product if needed
    if (options.includeImages || options.extractEntities) {
      for (let i = 0; i < products.length; i++) {
        if (products[i].url) {
          try {
            const detail = await this.scrapeProductDetail(products[i].url);
            products[i] = { ...products[i], ...detail };
          } catch (error) {
            console.error(`Failed to scrape detail for ${products[i].url}:`, error);
          }
        }
      }
    }

    return products;
  }

  /**
   * Scrape detailed product information
   */
  private async scrapeProductDetail(url: string): Promise<any> {
    const result = await webScraperService.scrape(url, {
      wordCountThreshold: 100
    });

    if (!result.success) {
      return {};
    }

    const $ = cheerio.load(result.content);
    const details: any = {};

    // Author
    const authorEl = $('.author, .yazar, .writer');
    details.author = authorEl.first().text().trim();

    // Publisher
    const publisherEl = $('.publisher, .yayinevi, .brand');
    details.publisher = publisherEl.first().text().trim();

    // ISBN
    const isbnEl = $('.isbn, [data-isbn]');
    const isbnText = isbnEl.first().text().trim();
    const isbnMatch = isbnText.match(/(?:ISBN|isbn)[:\s]*([\d-]+)/);
    details.isbn = isbnMatch ? isbnMatch[1].replace(/-/g, '') : '';

    // Rating
    const ratingEl = $('.rating, .stars, [data-rating]');
    const ratingText = ratingEl.first().attr('data-rating') || ratingEl.text().trim();
    details.rating = parseFloat(ratingText) || undefined;

    // Stock status
    const stockEl = $('.stock, .availability, .in-stock');
    const stockText = stockEl.first().text().trim().toLowerCase();
    details.inStock = !stockText.includes('stokta yok') && !stockText.includes('out of stock');

    // Description
    const descEl = $('.description, .summary, .product-text, .detay');
    details.description = descEl.first().text().trim();

    return details;
  }

  /**
   * Get page URL for pagination
   */
  private getPageUrl(baseUrl: string, page: number, pattern: string): string {
    return pattern.replace('{id}', page.toString());
  }

  /**
   * Update job status
   */
  private async updateJob(job: CategoryScrapeJob): Promise<void> {
    await redis.setex(`category-scrape:${job.id}`, 3600, JSON.stringify(job));
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<CategoryScrapeJob | null> {
    // Check memory first
    if (this.jobs.has(jobId)) {
      return this.jobs.get(jobId)!;
    }

    // Check Redis
    const jobData = await redis.get(`category-scrape:${jobId}`);
    if (jobData) {
      const job = JSON.parse(jobData);
      this.jobs.set(jobId, job);
      return job;
    }

    return null;
  }

  /**
   * Save products to database
   */
  private async saveToDatabase(products: ProductInfo[], projectId: string): Promise<void> {
    try {
      for (const product of products) {
        await lsembPool.query(`
          INSERT INTO scraped_content
          (project_id, url, title, content, description, category, metadata, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
          ON CONFLICT (url) DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
        `, [
          projectId,
          product.url,
          product.title,
          JSON.stringify(product),
          product.description,
          'product',
          JSON.stringify({
            type: 'product',
            price: product.price,
            author: product.author,
            publisher: product.publisher,
            isbn: product.isbn,
            rating: product.rating,
            image: product.image,
            inStock: product.inStock,
            entities: product.entities || []
          })
        ]);
      }
    } catch (error) {
      console.error('Failed to save products to database:', error);
    }
  }

  /**
   * Cancel a scraping job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = 'failed';
    job.error = 'Cancelled by user';
    await this.updateJob(job);
    return true;
  }

  /**
   * List all jobs
   */
  async listJobs(): Promise<CategoryScrapeJob[]> {
    const keys = await redis.keys('category-scrape:*');
    const jobs: CategoryScrapeJob[] = [];

    for (const key of keys) {
      const jobData = await redis.get(key);
      if (jobData) {
        jobs.push(JSON.parse(jobData));
      }
    }

    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

// Export singleton instance
export const categoryScraperService = new CategoryScraperService();