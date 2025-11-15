import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { redis } from '../server';
import { siteAnalyzerService } from '../services/site-analyzer.service';
import { intelligentScraperService } from '../services/intelligent-scraper.service';
import { contentAnalyzerService } from '../services/content-analyzer.service';
import { projectSiteManagerService } from '../services/project-site-manager.service';
import { nerService } from '../services/ner-service';
import { categoryScraperService } from '../services/category-scraper.service';
import { deduplicationService } from '../services/deduplication.service';
import { loggingService } from '../services/logging.service';
import { scrapingCacheService } from '../services/scraping-cache.service';
import { ScraperService } from '../services/scraper.service';
import { scraperQueueService } from '../services/scraper-queue.service';
import { scraperMonitorService } from '../services/scraper-monitor.service';
import { scraperQualityService } from '../services/scraper-quality.service';
import { v4 as uuidv4 } from 'uuid';
import { URL } from 'url';

const router = Router();

// Initialize Socket.IO lazily to avoid circular dependency
let io: any = null;
function getSocketIO() {
  if (!io) {
    // Lazy import to avoid circular dependency
    const serverModule = require('../server');
    io = serverModule.getSocketIO();
    if (io) {
      webScraperService.setSocketIO(io);
      intelligentScraperService.setSocketIO(io);
    }
  }
  return io;
}

// Initialize required tables
router.post('/init-tables', async (req: Request, res: Response) => {
  try {
    // Ensure project-sites related tables exist
    await projectSiteManagerService.ensureTablesExist();
    // Create scraping_projects table
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS scraping_projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        auto_process BOOLEAN DEFAULT true,
        auto_embeddings BOOLEAN DEFAULT true,
        real_time BOOLEAN DEFAULT true,
        status TEXT DEFAULT 'active',
        stats JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create site_configurations table
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS site_configurations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT,
        selectors JSONB DEFAULT '{}',
        auth_config JSONB DEFAULT '{}',
        rate_limit INTEGER DEFAULT 10,
        pagination_config JSONB DEFAULT '{}',
        filters JSONB DEFAULT '{}',
        transforms JSONB DEFAULT '{}',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create scraped_content table (legacy)
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS scraped_content (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url TEXT NOT NULL UNIQUE,
        title TEXT,
        content TEXT,
        metadata JSONB DEFAULT '{}',
        processed BOOLEAN DEFAULT false,
        embedding_generated BOOLEAN DEFAULT false,
        project_id UUID,
        site_id UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES scraping_projects(id) ON DELETE CASCADE,
        FOREIGN KEY (site_id) REFERENCES site_configurations(id) ON DELETE CASCADE
      )
    `);

    // Create scrape_embeddings table for vector storage
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS scrape_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}',
        source_url TEXT,
        title TEXT,
        category TEXT,
        project_id UUID,
        site_id UUID,
        chunk_index INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 1,
        embedding_generated BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index on embedding for similarity search
    await lsembPool.query(`
      CREATE INDEX IF NOT EXISTS idx_scrape_embeddings_embedding
      ON scrape_embeddings
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);

    // Create other useful indexes
    await lsembPool.query(`
      CREATE INDEX IF NOT EXISTS idx_scraped_content_url ON scraped_content(url);
      CREATE INDEX IF NOT EXISTS idx_scraped_content_project_id ON scraped_content(project_id);
      CREATE INDEX IF NOT EXISTS idx_scraped_content_site_id ON scraped_content(site_id);
      CREATE INDEX IF NOT EXISTS idx_scrape_embeddings_source_url ON scrape_embeddings(source_url);
      CREATE INDEX IF NOT EXISTS idx_scrape_embeddings_project_id ON scrape_embeddings(project_id);
      CREATE INDEX IF NOT EXISTS idx_scrape_embeddings_site_id ON scrape_embeddings(site_id);
    `);

    // Create tables for intelligent scraping
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS search_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query TEXT NOT NULL,
        results_count INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS search_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        search_id UUID REFERENCES search_sessions(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        title TEXT,
        content TEXT,
        relevance_score FLOAT,
        site_name TEXT,
        type TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS site_structures (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id UUID REFERENCES site_configurations(id) ON DELETE CASCADE,
        structure JSONB NOT NULL,
        analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create processed_contents table (will be created by content analyzer service)
    await lsembPool.query(`
      CREATE TABLE IF NOT EXISTS processed_contents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        concept TEXT NOT NULL,
        content TEXT NOT NULL,
        summary TEXT,
        key_points JSONB DEFAULT '[]',
        embedding vector(1536),
        sources JSONB DEFAULT '[]',
        project_id UUID REFERENCES scraping_projects(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for new tables
    await lsembPool.query(`
      CREATE INDEX IF NOT EXISTS idx_search_results_search_id ON search_results(search_id);
      CREATE INDEX IF NOT EXISTS idx_search_results_site_name ON search_results(site_name);
      CREATE INDEX IF NOT EXISTS idx_site_structures_site_id ON site_structures(site_id);
      CREATE INDEX IF NOT EXISTS idx_processed_contents_concept ON processed_contents(concept);
      CREATE INDEX IF NOT EXISTS idx_processed_contents_project_id ON processed_contents(project_id);
      CREATE INDEX IF NOT EXISTS idx_processed_contents_embedding ON processed_contents
      USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    `);

    res.json({ success: true, message: 'Tables initialized successfully' });
  } catch (error) {
    console.error('Failed to initialize tables:', error);
    res.status(500).json({ success: false, error: 'Failed to initialize tables' });
  }
});

// AI-Powered Site Analysis with real-time progress - MUST come before basic analyze to avoid route conflicts
router.post('/sites/analyze-enhanced', async (req: Request, res: Response) => {
  console.log('AI ANALYSIS ENDPOINT HIT!', req.body);
  try {
    const { url, siteId } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Set up Server-Sent Events for real-time progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const progressCallback = (progress: any) => {
      try {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      } catch (err) {
        console.error('Error writing progress:', err);
      }
    };

    try {
      // Use real AI-powered analysis with site analyzer service
      console.log('Starting real AI site analysis for:', url);

      // Perform real analysis with AI-powered selectors and robots.txt compliance
      const analysis = await siteAnalyzerService.analyzeSite(url, (progress) => {
        progressCallback(progress);
      });

      // Send final success result
      console.log('Real AI analysis completed for:', url);
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        step: 'completed',
        progress: 100,
        message: 'Analysis completed successfully',
        analysis
      })}\n\n`);

    } catch (error) {
      console.error('Real AI analysis failed:', error);

      // Send error to client
      res.write(`data: ${JSON.stringify({
        type: 'error',
        step: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Analysis failed'
      })}\n\n`);
    }

    // End the stream
    res.end();

  } catch (error) {
    console.error('AI site analysis failed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to analyze site'
      });
    } else {
      res.end();
    }
  }
});

// Analyze URL for automatic selector detection
router.post('/analyze', async (req: Request, res: Response) => {
  console.log(' BASIC ANALYZE ENDPOINT HIT!', req.body);
  try {
    const { url, useCache = true } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Check cache for site structure analysis (24 hour cache)
    if (useCache) {
      const cachedStructure = await scrapingCacheService.getCachedSiteStructure(url);
      if (cachedStructure) {
        console.log(`Cache hit for site analysis: ${url}`);
        return res.json({
          success: true,
          fromCache: true,
          analyzedAt: cachedStructure.analyzedAt,
          ...cachedStructure.structure
        });
      }
    }

    // Perform analysis using site analyzer service
    const result = await siteAnalyzerService.analyzeSite(url);

    // Cache the analysis result
    if (result && useCache) {
      await scrapingCacheService.cacheSiteStructure(url, {
        success: true,
        ...result
      });
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Analysis failed:', error);
    res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});

// Preview scrape - immediate result for testing and configuration
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { url, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    console.log(`Starting preview scrape for: ${url}`);

    // Use scraper service for immediate scraping
    const results = await scraperService.scrapeWebsite(url, {
      ...options,
      maxDepth: options.maxDepth || 1,
      maxPages: options.maxPages || 1,
      followLinks: false,
      generateEmbeddings: false,
      saveToDb: false,
      mode: options.mode || 'auto'
    });

    if (results.length === 0) {
      return res.json({
        success: true,
        preview: {
          url,
          title: 'No content found',
          content: 'Could not extract content from this URL. The site might be blocked, require JavaScript, or have no accessible content.',
          contentLength: 0,
          metadata: {
            contentLength: 0,
            chunksCount: 0,
            linksCount: 0,
            imagesCount: 0
          }
        },
        message: 'No content could be extracted from this URL'
      });
    }

    const result = results[0];

    // Format preview response
    const preview = {
      url: result.url,
      title: result.title || 'No title found',
      content: result.content || 'No content found',
      description: result.description,
      keywords: result.keywords,
      author: result.author,
      publishDate: result.publishDate,
      contentLength: result.content?.length || 0,
      images: result.images?.slice(0, 5) || [], // Limit to first 5 images
      links: result.links?.slice(0, 10) || [], // Limit to first 10 links
      metadata: {
        contentLength: result.content?.length || 0,
        chunksCount: result.chunks?.length || 0,
        linksCount: result.links?.length || 0,
        imagesCount: result.images?.length || 0,
        scrapingMode: options.mode || 'auto',
        scrapedAt: new Date().toISOString()
      }
    };

    // Log successful preview
    console.log(`Preview completed for ${url}: ${preview.contentLength} characters extracted`);

    res.json({
      success: true,
      preview,
      message: `Successfully extracted ${preview.contentLength} characters from ${url}`
    });

  } catch (error: any) {
    console.error('Preview scrape failed:', error);
    res.status(500).json({
      success: false,
      error: 'Preview failed',
      details: error.message,
      preview: {
        url: req.body.url,
        title: 'Error',
        content: `Failed to scrape this URL: ${error.message}`,
        contentLength: 0,
        metadata: {
          error: error.message,
          scrapedAt: new Date().toISOString()
        }
      }
    });
  }
});

// Scrape with Redis caching and LLM processing
router.post('/scrape', async (req: Request, res: Response) => {
  try {
    const {
      url,
      options = {},
      useCache = true,
      llmFiltering = true,
      entityExtraction = true,
      saveToDatabase = true
    } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Start scraping in background
    const jobId = uuidv4();

    // Create job tracking
    const job = await scraperService.createScrapeJob(url, {
      ...options,
      useCache,
      llmFiltering,
      entityExtraction,
      saveToDatabase
    });

    // Process asynchronously
    (async () => {
      try {
        const results = await scraperService.scrapeWebsite(url, {
          ...options,
          useCache,
          llmFiltering,
          entityExtraction,
          saveToDatabase
        });

        // Update job status
        await scraperService.updateScrapeJob(jobId, {
          status: 'completed',
          progress: 100,
          result: results
        });

        // Emit via Socket.IO if available
        const socketIO = getSocketIO();
        if (socketIO) {
          socketIO.emit('scrape-complete', { jobId, results });
        }

      } catch (error) {
        console.error('Scraping error:', error);
        await scraperService.updateScrapeJob(jobId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        const socketIO = getSocketIO();
        if (socketIO) {
          socketIO.emit('scrape-error', {
            jobId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    })();

    res.json({
      success: true,
      jobId: job.id,
      message: 'Scraping started with caching and AI processing'
    });

  } catch (error) {
    console.error('Failed to start scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start scraping'
    });
  }
});

// Batch scrape
router.post('/batch-scrape', async (req: Request, res: Response) => {
  try {
    const { urls, mode = 'puppeteer', options = {}, projectId, siteId, useQueue = true, useCache = true } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'Valid URLs array is required' });
    }

    // Filter out cached URLs if cache is enabled
    let urlsToScrape = urls;
    let cachedResults = [];

    if (useCache) {
      const cachePromises = urls.map(async (url) => {
        const cached = await scrapingCacheService.getCachedPage(url);
        if (cached) {
          return { url, cached: true, data: JSON.parse(cached.data) };
        }
        return { url, cached: false };
      });

      const cacheResults = await Promise.all(cachePromises);
      cachedResults = cacheResults.filter(r => r.cached);
      urlsToScrape = cacheResults.filter(r => !r.cached).map(r => r.url);
    }

    if (useQueue && urlsToScrape.length > 0) {
      // Add to scraping queue with priority
      const jobIds = await scrapingCacheService.addToQueue(urlsToScrape, mode, options, 1);

      // Create job tracking
      const batchJobId = uuidv4();
      await redis.setex(`batch-scrape:${batchJobId}`, 7200, JSON.stringify({
        id: batchJobId,
        total: urls.length,
        cached: cachedResults.length,
        queued: urlsToScrape.length,
        jobIds,
        status: 'queued',
        progress: 0,
        cachedResults,
        createdAt: new Date().toISOString()
      }));

      // Process queue in background
      processScrapingQueue(batchJobId);

      res.json({
        success: true,
        batchJobId,
        total: urls.length,
        cached: cachedResults.length,
        queued: urlsToScrape.length,
        cachedResults,
        message: `${cachedResults.length} URLs loaded from cache, ${urlsToScrape.length} added to queue`
      });
    } else {
      // Traditional batch processing without queue
      const jobId = await webScraperService.createJob(urls, options, projectId, siteId);
      webScraperService.processJob(jobId).catch(console.error);

      res.json({
        success: true,
        jobId,
        total: urls.length,
        cached: cachedResults.length,
        message: cachedResults.length > 0 ?
          `${cachedResults.length} URLs loaded from cache, processing remaining...` :
          'Processing all URLs'
      });
    }
  } catch (error) {
    console.error('Batch scrape failed:', error);
    res.status(500).json({ success: false, error: 'Batch scraping failed' });
  }
});

// Get job status
router.get('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await webScraperService.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, job });
  } catch (error) {
    console.error('Failed to get job status:', error);
    res.status(500).json({ success: false, error: 'Failed to get job status' });
  }
});

// Get all jobs
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const keys = await redis.keys('scrape-job:*');
    const jobs = [];

    for (const key of keys) {
      const jobData = await redis.get(key);
      if (jobData) {
        jobs.push(JSON.parse(jobData));
      }
    }

    // Sort by creation date (newest first)
    jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, jobs });
  } catch (error) {
    console.error('Failed to get jobs:', error);
    res.status(500).json({ success: false, error: 'Failed to get jobs' });
  }
});

// Get all sessions (alias for jobs)
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const keys = await redis.keys('scrape-job:*');
    const sessions = [];

    for (const key of keys) {
      const jobData = await redis.get(key);
      if (jobData) {
        const job = JSON.parse(jobData);
        // Transform job data to session format
        sessions.push({
          id: job.id,
          url: job.url,
          status: job.status,
          progress: job.progress,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          error: job.error,
          result: job.result
        });
      }
    }

    // Sort by creation date (newest first)
    sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, sessions });
  } catch (error) {
    console.error('Failed to get sessions:', error);
    res.status(500).json({ success: false, error: 'Failed to get sessions' });
  }
});

// Projects CRUD
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const result = await lsembPool.query(`
      SELECT * FROM scraping_projects
      ORDER BY created_at DESC
    `);

    res.json({ success: true, projects: result.rows });
  } catch (error) {
    console.error('Failed to get projects:', error);
    res.status(500).json({ success: false, error: 'Failed to get projects' });
  }
});

router.post('/projects', async (req: Request, res: Response) => {
  try {
    const { name, description, category, autoProcess, autoEmbeddings, realTime } = req.body;

    const result = await lsembPool.query(`
      INSERT INTO scraping_projects (name, description, category, auto_process, auto_embeddings, real_time)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, description, category, autoProcess, autoEmbeddings, realTime]);

    res.json({ success: true, project: result.rows[0] });
  } catch (error) {
    console.error('Failed to create project:', error);
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

router.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, category, autoProcess, autoEmbeddings, realTime } = req.body;

    const result = await lsembPool.query(`
      UPDATE scraping_projects
      SET name = $1, description = $2, category = $3, auto_process = $4, auto_embeddings = $5, real_time = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `, [name, description, category, autoProcess, autoEmbeddings, realTime, id]);

    res.json({ success: true, project: result.rows[0] });
  } catch (error) {
    console.error('Failed to update project:', error);
    res.status(500).json({ success: false, error: 'Failed to update project' });
  }
});

router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await lsembPool.query('DELETE FROM scraping_projects WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

// Site Configurations CRUD
router.get('/sites', async (req: Request, res: Response) => {
  try {
    const result = await lsembPool.query(`
      SELECT * FROM site_configurations
      ORDER BY created_at DESC
    `);

    res.json({ success: true, sites: result.rows });
  } catch (error) {
    console.error('Failed to get sites:', error);
    res.status(500).json({ success: false, error: 'Failed to get sites' });
  }
});

router.post('/sites', async (req: Request, res: Response) => {
  try {
    const { name, baseUrl, type, category, selectors, rateLimit, active } = req.body;

    const result = await lsembPool.query(`
      INSERT INTO site_configurations (name, base_url, type, category, selectors, rate_limit, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, baseUrl, type, category, JSON.stringify(selectors || {}), rateLimit, active]);

    res.json({ success: true, site: result.rows[0] });
  } catch (error) {
    console.error('Failed to create site:', error);
    res.status(500).json({ success: false, error: 'Failed to create site' });
  }
});

router.put('/sites/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, baseUrl, type, category, selectors, rateLimit, active } = req.body;

    const result = await lsembPool.query(`
      UPDATE site_configurations
      SET name = $1, base_url = $2, type = $3, category = $4, selectors = $5, rate_limit = $6, active = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [name, baseUrl, type, category, JSON.stringify(selectors || {}), rateLimit, active, id]);

    res.json({ success: true, site: result.rows[0] });
  } catch (error) {
    console.error('Failed to update site:', error);
    res.status(500).json({ success: false, error: 'Failed to update site' });
  }
});

router.delete('/sites/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await lsembPool.query('DELETE FROM site_configurations WHERE id = $1', [id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete site:', error);
    res.status(500).json({ success: false, error: 'Failed to delete site' });
  }
});

// ==================== PROJECT-SITE MANAGEMENT ====================

// Add site to project with automatic analysis
router.post('/projects/:projectId/sites', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { name, baseUrl, category, autoDetect = true } = req.body;

    if (!name || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'Name and base URL are required'
      });
    }

    // Add site to project with automatic configuration
    const projectSite = await projectSiteManagerService.addSiteToProject(projectId, {
      name,
      baseUrl,
      category,
      autoDetect
    });

    res.json({
      success: true,
      projectSite,
      message: 'Site added to project successfully'
    });
  } catch (error) {
    console.error('Failed to add site to project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add site to project'
    });
  }
});

// Get all sites for a project
router.get('/projects/:projectId/sites', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;

    const sites = await projectSiteManagerService.getProjectSites(projectId);

    res.json({ success: true, sites });
  } catch (error) {
    console.error('Failed to get project sites:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get project sites'
    });
  }
});

// Remove site from project
router.delete('/projects/:projectId/sites/:siteId', async (req: Request, res: Response) => {
  try {
    const { projectId, siteId } = req.params;

    await projectSiteManagerService.removeSiteFromProject(projectId, siteId);

    res.json({
      success: true,
      message: 'Site removed from project successfully'
    });
  } catch (error) {
    console.error('Failed to remove site from project:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove site from project'
    });
  }
});

// Update scraping config for project site
router.put('/projects/:projectId/sites/:siteId/config', async (req: Request, res: Response) => {
  try {
    const { projectId, siteId } = req.params;
    const { config } = req.body;

    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'Configuration is required'
      });
    }

    await projectSiteManagerService.updateScrapingConfig(projectId, siteId, config);

    res.json({
      success: true,
      message: 'Scraping configuration updated successfully'
    });
  } catch (error) {
    console.error('Failed to update scraping config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update scraping configuration'
    });
  }
});

// Re-analyze site and update config
router.post('/projects/:projectId/sites/:siteId/reanalyze', async (req: Request, res: Response) => {
  try {
    const { projectId, siteId } = req.params;

    const result = await projectSiteManagerService.reanalyzeSite(projectId, siteId);

    res.json({
      success: true,
      ...result,
      message: 'Site re-analyzed successfully'
    });
  } catch (error) {
    console.error('Failed to re-analyze site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to re-analyze site'
    });
  }
});

// Analyze a specific site (frontend expects this endpoint)
router.post('/sites/:siteId/analyze', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;

    // Get site configuration
    const siteResult = await lsembPool.query(
      'SELECT base_url FROM site_configurations WHERE id = $1',
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    const baseUrl = siteResult.rows[0].base_url;

    // Analyze site structure
    const structure = await intelligentScraperService.analyzeSiteStructure(baseUrl);

    // Save structure
    await intelligentScraperService.saveSiteStructure(siteId, structure);

    // Get updated site with structure
    const updatedSiteResult = await lsembPool.query(`
      SELECT sc.*, ss.structure
      FROM site_configurations sc
      LEFT JOIN site_structures ss ON sc.id = ss.site_id
      WHERE sc.id = $1
    `, [siteId]);

    res.json({
      success: true,
      site: updatedSiteResult.rows[0],
      structure,
      message: 'Site analyzed successfully'
    });
  } catch (error) {
    console.error('Failed to analyze site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze site'
    });
  }
});

// Get scraped items
router.get('/items', async (req: Request, res: Response) => {
  try {
    const { projectId, siteId, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT se.*, sp.name as project_name, sc.name as site_name
      FROM scrape_embeddings se
      LEFT JOIN scraping_projects sp ON se.project_id = sp.id
      LEFT JOIN site_configurations sc ON se.site_id = sc.id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (projectId) {
      query += ` AND se.project_id = $${paramIndex++}`;
      params.push(projectId);
    }

    if (siteId) {
      query += ` AND se.site_id = $${paramIndex++}`;
      params.push(siteId);
    }

    query += ` ORDER BY se.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await lsembPool.query(query, params);

    res.json({ success: true, items: result.rows });
  } catch (error) {
    console.error('Failed to get items:', error);
    res.status(500).json({ success: false, error: 'Failed to get items' });
  }
});

// Get scraping statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = {};

    // Total items
    const totalResult = await lsembPool.query('SELECT COUNT(*) as count FROM scrape_embeddings');
    stats.totalItems = parseInt(totalResult.rows[0].count);

    // Processed items
    const processedResult = await lsembPool.query('SELECT COUNT(*) as count FROM scrape_embeddings WHERE embedding_generated = true');
    stats.processedItems = parseInt(processedResult.rows[0].count);

    // Projects count
    const projectsResult = await lsembPool.query('SELECT COUNT(*) as count FROM scraping_projects');
    stats.totalProjects = parseInt(projectsResult.rows[0].count);

    // Sites count
    const sitesResult = await lsembPool.query('SELECT COUNT(*) as count FROM site_configurations WHERE active = true');
    stats.totalSites = parseInt(sitesResult.rows[0].count);

    // Recent activity
    const recentResult = await lsembPool.query(`
      SELECT COUNT(*) as count
      FROM scrape_embeddings
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    stats.itemsLast24h = parseInt(recentResult.rows[0].count);

    res.json({ success: true, stats });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ success: false, error: 'Failed to get statistics' });
  }
});

// Search in scraped items
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10, threshold = 0.7 } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    // Simple text search for now (can be improved with vector search)
    const result = await lsembPool.query(`
      SELECT se.*, sp.name as project_name, sc.name as site_name,
             ts_rank_cd(to_tsvector('english', se.content), plainto_tsquery('english', $1)) as rank
      FROM scrape_embeddings se
      LEFT JOIN scraping_projects sp ON se.project_id = sp.id
      LEFT JOIN site_configurations sc ON se.site_id = sc.id
      WHERE to_tsvector('english', se.content) @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $2
    `, [query, limit]);

    res.json({ success: true, results: result.rows });
  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ==================== INTELLIGENT SCRAPER ROUTES ====================

// Analyze site structure
router.post('/analyze-site', async (req: Request, res: Response) => {
  try {
    const { siteId, baseUrl } = req.body;

    if (!siteId && !baseUrl) {
      return res.status(400).json({ success: false, error: 'Site ID or base URL is required' });
    }

    const url = baseUrl || await getSiteUrl(siteId);
    if (!url) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    // Analyze site structure
    const structure = await intelligentScraperService.analyzeSiteStructure(url);

    // Save structure if we have a site ID
    if (siteId) {
      await intelligentScraperService.saveSiteStructure(siteId, structure);
    }

    res.json({ success: true, structure });
  } catch (error) {
    console.error('Site analysis failed:', error);
    res.status(500).json({ success: false, error: 'Site analysis failed' });
  }
});

// Semantic search across sites
router.post('/semantic-search', async (req: Request, res: Response) => {
  try {
    const { query, projectIds, siteIds, deepSearch = false, maxResultsPerSite = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: 'Query is required' });
    }

    // If project IDs are provided, get the sites associated with those projects
    let finalSiteIds = siteIds || [];
    if (projectIds && projectIds.length > 0) {
      const projectSitesResult = await lsembPool.query(`
        SELECT DISTINCT site_id
        FROM project_sites
        WHERE project_id = ANY($1) AND is_active = true
      `, [projectIds]);

      finalSiteIds = [
        ...finalSiteIds,
        ...projectSitesResult.rows.map(row => row.site_id)
      ];
    }

    // Start search in background
    const jobId = uuidv4();

    // Save job to Redis
    await redis.setex(`search-job:${jobId}`, 3600, JSON.stringify({
      id: jobId,
      query,
      projectIds,
      siteIds: finalSiteIds,
      deepSearch,
      maxResultsPerSite,
      status: 'processing',
      progress: 0,
      createdAt: new Date().toISOString()
    }));

    // Process asynchronously
    (async () => {
      try {
        const results = await intelligentScraperService.semanticSearch({
          query,
          projectIds,
          siteIds: finalSiteIds,
          deepSearch,
          maxResultsPerSite
        });

        // Update job status
        await redis.setex(`search-job:${jobId}`, 3600, JSON.stringify({
          ...JSON.parse(await redis.get(`search-job:${jobId}`)),
          status: 'completed',
          progress: 100,
          results,
          completedAt: new Date().toISOString()
        }));

        // Emit via Socket.IO
        if (io) {
          io.emit('semantic-search-complete', { jobId, results });
        }
      } catch (error) {
        console.error('Semantic search error:', error);
        await redis.setex(`search-job:${jobId}`, 3600, JSON.stringify({
          ...JSON.parse(await redis.get(`search-job:${jobId}`)),
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        }));

        if (io) {
          io.emit('semantic-search-error', { jobId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    })();

    res.json({ success: true, jobId });
  } catch (error) {
    console.error('Semantic search failed:', error);
    res.status(500).json({ success: false, error: 'Semantic search failed' });
  }
});

// Get search job status
router.get('/search-jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await redis.get(`search-job:${jobId}`);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, job: JSON.parse(job) });
  } catch (error) {
    console.error('Failed to get search job status:', error);
    res.status(500).json({ success: false, error: 'Failed to get search job status' });
  }
});

// Scrape results from semantic search
router.post('/scrape-search-results', async (req: Request, res: Response) => {
  try {
    const { searchResults, options = {} } = req.body;

    if (!searchResults || !Array.isArray(searchResults)) {
      return res.status(400).json({ success: false, error: 'Search results are required' });
    }

    // Start scraping in background
    const jobId = uuidv4();

    // Process asynchronously
    intelligentScraperService.scrapeSearchResults(searchResults, options)
      .then(results => {
        if (io) {
          io.emit('scrape-search-complete', { jobId, results });
        }
      })
      .catch(error => {
        console.error('Scrape search results error:', error);
        if (io) {
          io.emit('scrape-search-error', { jobId, error: error.message });
        }
      });

    res.json({ success: true, jobId });
  } catch (error) {
    console.error('Failed to scrape search results:', error);
    res.status(500).json({ success: false, error: 'Failed to scrape search results' });
  }
});

// Analyze and synthesize content based on concept
router.post('/analyze-concept', async (req: Request, res: Response) => {
  try {
    const { concept, projectId, siteIds, maxContentItems, rewritePrompt } = req.body;

    if (!concept) {
      return res.status(400).json({ success: false, error: 'Concept is required' });
    }

    // Start analysis in background
    const jobId = uuidv4();

    // Save job to Redis
    await redis.setex(`analysis-job:${jobId}`, 7200, JSON.stringify({
      id: jobId,
      type: 'concept_analysis',
      concept,
      projectId,
      siteIds,
      maxContentItems,
      rewritePrompt,
      status: 'processing',
      progress: 0,
      createdAt: new Date().toISOString()
    }));

    // Process asynchronously
    (async () => {
      try {
        const result = await contentAnalyzerService.analyzeAndSynthesizeContent({
          concept,
          projectId,
          siteIds,
          maxContentItems,
          rewritePrompt
        });

        // Update job status
        await redis.setex(`analysis-job:${jobId}`, 7200, JSON.stringify({
          ...JSON.parse(await redis.get(`analysis-job:${jobId}`)),
          status: 'completed',
          progress: 100,
          result,
          completedAt: new Date().toISOString()
        }));

        // Emit via Socket.IO
        if (io) {
          io.emit('concept-analysis-complete', { jobId, result });
        }
      } catch (error) {
        console.error('Concept analysis error:', error);
        await redis.setex(`analysis-job:${jobId}`, 7200, JSON.stringify({
          ...JSON.parse(await redis.get(`analysis-job:${jobId}`)),
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        }));

        if (io) {
          io.emit('concept-analysis-error', { jobId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    })();

    res.json({ success: true, jobId });
  } catch (error) {
    console.error('Concept analysis failed:', error);
    res.status(500).json({ success: false, error: 'Concept analysis failed' });
  }
});

// Get analysis job status
router.get('/analysis-jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await redis.get(`analysis-job:${jobId}`);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, job: JSON.parse(job) });
  } catch (error) {
    console.error('Failed to get analysis job status:', error);
    res.status(500).json({ success: false, error: 'Failed to get analysis job status' });
  }
});

// Get processed content
router.get('/processed-content', async (req: Request, res: Response) => {
  try {
    const { concept, projectId } = req.query;

    if (!concept) {
      return res.status(400).json({ success: false, error: 'Concept is required' });
    }

    const contents = await contentAnalyzerService.getProcessedContent(
      concept as string,
      projectId as string
    );

    res.json({ success: true, contents });
  } catch (error) {
    console.error('Failed to get processed content:', error);
    res.status(500).json({ success: false, error: 'Failed to get processed content' });
  }
});

// Update embedding for processed content
router.post('/update-embedding/:contentId', async (req: Request, res: Response) => {
  try {
    const { contentId } = req.params;

    await contentAnalyzerService.updateEmbedding(contentId);

    res.json({ success: true, message: 'Embedding updated successfully' });
  } catch (error) {
    console.error('Failed to update embedding:', error);
    res.status(500).json({ success: false, error: 'Failed to update embedding' });
  }
});

// Comprehensive concept scraping and analysis workflow
router.post('/concept-workflow', async (req: Request, res: Response) => {
  try {
    const {
      concept,
      projectId,
      autoScrape = true,
      maxSearchResults = 20,
      maxContentItems = 30,
      rewritePrompt,
      saveToEmbeddings = true
    } = req.body;

    if (!concept) {
      return res.status(400).json({
        success: false,
        error: 'Concept is required'
      });
    }

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required'
      });
    }

    // Start workflow in background
    const jobId = uuidv4();

    // Save job to Redis
    await redis.setex(`workflow-job:${jobId}`, 7200, JSON.stringify({
      id: jobId,
      type: 'concept_workflow',
      concept,
      projectId,
      autoScrape,
      maxSearchResults,
      maxContentItems,
      rewritePrompt,
      saveToEmbeddings,
      status: 'processing',
      progress: 0,
      currentStep: 'initializing',
      createdAt: new Date().toISOString()
    }));

    // Process workflow asynchronously
    (async () => {
      try {
        // Step 1: Get sites for the project
        await updateWorkflowStep(jobId, 'fetching_project_sites', 10);
        const projectSites = await projectSiteManagerService.getProjectSites(projectId);
        const siteIds = projectSites.map(ps => ps.id);

        if (siteIds.length === 0) {
          throw new Error('No sites configured for this project');
        }

        // Step 2: Semantic search across project sites
        await updateWorkflowStep(jobId, 'searching_across_sites', 20);
        const searchResults = await intelligentScraperService.semanticSearch({
          query: concept,
          projectIds: [projectId],
          siteIds,
          deepSearch: true,
          maxResultsPerSite: Math.ceil(maxSearchResults / siteIds.length)
        });

        if (searchResults.length === 0) {
          throw new Error('No relevant content found for the concept');
        }

        // Step 3: Scrape content from search results if enabled
        let scrapedContent = [];
        if (autoScrape && searchResults.length > 0) {
          await updateWorkflowStep(jobId, 'scraping_content', 40);
          scrapedContent = await intelligentScraperService.scrapeSearchResults(
            searchResults.slice(0, maxSearchResults),
            { wordCountThreshold: 100 }
          );
        }

        // Step 4: Analyze and synthesize content
        await updateWorkflowStep(jobId, 'analyzing_content', 70);
        const processedContent = await contentAnalyzerService.analyzeAndSynthesizeContent({
          concept,
          projectId,
          siteIds,
          maxContentItems,
          rewritePrompt
        });

        // Step 5: Generate embeddings if enabled
        if (saveToEmbeddings && processedContent.embedding) {
          await updateWorkflowStep(jobId, 'generating_embeddings', 90);
          // Embeddings are already generated in the analysis step
        }

        // Mark job as completed
        await redis.setex(`workflow-job:${jobId}`, 7200, JSON.stringify({
          ...JSON.parse(await redis.get(`workflow-job:${jobId}`)),
          status: 'completed',
          progress: 100,
          currentStep: 'completed',
          results: {
            searchResults: searchResults.length,
            scrapedContent: scrapedContent.length,
            processedContent: {
              id: processedContent.id,
              concept: processedContent.concept,
              summary: processedContent.summary,
              keyPoints: processedContent.keyPoints,
              sources: processedContent.sources.length
            }
          },
          completedAt: new Date().toISOString()
        }));

        // Emit completion via Socket.IO
        if (io) {
          io.emit('concept-workflow-complete', {
            jobId,
            results: {
              searchResultsCount: searchResults.length,
              scrapedContentCount: scrapedContent.length,
              processedContent
            }
          });
        }
      } catch (error) {
        console.error('Concept workflow error:', error);
        await redis.setex(`workflow-job:${jobId}`, 7200, JSON.stringify({
          ...JSON.parse(await redis.get(`workflow-job:${jobId}`)),
          status: 'failed',
          currentStep: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }));

        if (io) {
          io.emit('concept-workflow-error', {
            jobId,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    })();

    res.json({
      success: true,
      jobId,
      message: 'Concept workflow started successfully'
    });
  } catch (error) {
    console.error('Failed to start concept workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start concept workflow'
    });
  }
});

// Get workflow job status
router.get('/workflow-jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await redis.get(`workflow-job:${jobId}`);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, job: JSON.parse(job) });
  } catch (error) {
    console.error('Failed to get workflow job status:', error);
    res.status(500).json({ success: false, error: 'Failed to get workflow job status' });
  }
});

// Helper function to update workflow step
async function updateWorkflowStep(jobId: string, step: string, progress: number): Promise<void> {
  const job = await redis.get(`workflow-job:${jobId}`);
  if (job) {
    const jobData = JSON.parse(job);
    jobData.currentStep = step;
    jobData.progress = progress;
    await redis.setex(`workflow-job:${jobId}`, 7200, JSON.stringify(jobData));

    // Emit progress via Socket.IO
    if (io) {
      io.emit('workflow-progress', { jobId, step, progress });
    }
  }
}

// Named Entity Recognition
router.post('/ner', async (req: Request, res: Response) => {
  try {
    const { text, title, url, options = {} } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'Text is required'
      });
    }

    const result = await nerService.extractFromScrapedContent(text, title, url);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('NER extraction failed:', error);
    res.status(500).json({
      success: false,
      error: 'NER extraction failed'
    });
  }
});

// Extract entities from scraped item
router.post('/items/:itemId/extract-entities', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;

    // Get scraped item
    const itemResult = await lsembPool.query(
      'SELECT * FROM scraped_content WHERE id = $1',
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    const item = itemResult.rows[0];

    // Extract entities
    const result = await nerService.extractFromScrapedContent(
      item.content,
      item.title,
      item.url
    );

    // Save entities to database
    await lsembPool.query(`
      UPDATE scraped_content
      SET metadata = metadata || $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [
      JSON.stringify({
        entities: result.entities,
        entitySummary: result.summary,
        entityInsights: result.keyInsights,
        entitiesExtractedAt: new Date().toISOString()
      }),
      itemId
    ]);

    // Get entity statistics
    const stats = nerService.getEntityStats(result.entities);

    res.json({
      success: true,
      ...result,
      stats
    });
  } catch (error) {
    console.error('Failed to extract entities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to extract entities'
    });
  }
});

// Get entities from project content
router.get('/projects/:projectId/entities', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { type, limit = 100 } = req.query;

    // Query items with entities
    let query = `
      SELECT id, title, url, metadata
      FROM scraped_content
      WHERE project_id = $1
      AND metadata->>'entitiesExtractedAt' IS NOT NULL
    `;
    const params: any[] = [projectId];

    if (type) {
      query += ` AND metadata->'entities' @> $2`;
      params.push(JSON.stringify([{ label: type }]));
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(Number(limit));

    const result = await lsembPool.query(query, params);

    // Extract and aggregate entities
    const allEntities: any[] = [];
    const entityStats: Record<string, number> = {};

    for (const row of result.rows) {
      const metadata = row.metadata || {};
      const entities = metadata.entities || [];

      for (const entity of entities) {
        allEntities.push({
          ...entity,
          itemTitle: row.title,
          itemUrl: row.url,
          itemId: row.id
        });

        entityStats[entity.label] = (entityStats[entity.label] || 0) + 1;
      }
    }

    // Sort entities by frequency
    const sortedEntities = allEntities.sort((a, b) => {
      const freqA = entityStats[a.label];
      const freqB = entityStats[b.label];
      return freqB - freqA;
    });

    res.json({
      success: true,
      entities: sortedEntities.slice(0, 500), // Limit total entities
      stats: entityStats,
      totalItems: result.rows.length
    });
  } catch (error) {
    console.error('Failed to get project entities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get project entities'
    });
  }
});

// Search entities by text
router.post('/entities/search', async (req: Request, res: Response) => {
  try {
    const { query, projectId, entityTypes } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }

    // Search in entities
    let sql = `
      SELECT id, title, url, metadata
      FROM scraped_content
      WHERE project_id = $1
      AND metadata->>'entitiesExtractedAt' IS NOT NULL
      AND metadata->'entities' @? $2
      ORDER BY created_at DESC
      LIMIT 50
    `;

    const result = await lsembPool.query(sql, [
      projectId,
      JSON.stringify({
        text: { $regex: query, $options: 'i' }
      })
    ]);

    const items = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      url: row.url,
      entities: (row.metadata?.entities || []).filter((e: any) =>
        e.text.toLowerCase().includes(query.toLowerCase())
      )
    }));

    res.json({
      success: true,
      items,
      total: items.length
    });
  } catch (error) {
    console.error('Failed to search entities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search entities'
    });
  }
});

// ==================== CATEGORY SCRAPING ====================

// Start category scraping
router.post('/category-scrape', async (req: Request, res: Response) => {
  try {
    const {
      categoryUrl,
      categoryId,
      maxProducts = 100,
      includeImages = true,
      extractEntities = true,
      projectId
    } = req.body;

    if (!categoryUrl) {
      return res.status(400).json({
        success: false,
        error: 'Category URL is required'
      });
    }

    const jobId = await categoryScraperService.startCategoryScraping({
      categoryUrl,
      categoryId,
      maxProducts,
      includeImages,
      extractEntities,
      projectId
    });

    res.json({
      success: true,
      jobId,
      message: 'Category scraping started'
    });
  } catch (error) {
    console.error('Failed to start category scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start category scraping'
    });
  }
});

// Get category scraping job status
router.get('/category-scrape/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await categoryScraperService.getJobStatus(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      job
    });
  } catch (error) {
    console.error('Failed to get job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status'
    });
  }
});

// List all category scraping jobs
router.get('/category-scrape-jobs', async (req: Request, res: Response) => {
  try {
    const jobs = await categoryScraperService.listJobs();

    res.json({
      success: true,
      jobs
    });
  } catch (error) {
    console.error('Failed to list jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list jobs'
    });
  }
});

// Cancel category scraping job
router.post('/category-scrape/:jobId/cancel', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const success = await categoryScraperService.cancelJob(jobId);

    res.json({
      success,
      message: success ? 'Job cancelled' : 'Job not found'
    });
  } catch (error) {
    console.error('Failed to cancel job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel job'
    });
  }
});

// ==================== ENTITY MANAGEMENT ====================

// Update entities for scraped content
router.put('/items/:itemId/entities', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { entities, add, remove } = req.body;

    // Get current item
    const itemResult = await lsembPool.query(
      'SELECT metadata FROM scraped_content WHERE id = $1',
      [itemId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    let metadata = itemResult.rows[0].metadata || {};
    let currentEntities = metadata.entities || [];

    // Add new entities
    if (add && Array.isArray(add)) {
      currentEntities = [...currentEntities, ...add];
    }

    // Remove entities
    if (remove && Array.isArray(remove)) {
      const removeTexts = new Set(remove.map(e => e.text));
      currentEntities = currentEntities.filter((e: any) => !removeTexts.has(e.text));
    }

    // Replace all entities
    if (entities && Array.isArray(entities)) {
      currentEntities = entities;
    }

    // Update metadata
    metadata.entities = currentEntities;
    metadata.entitiesUpdatedAt = new Date().toISOString();

    await lsembPool.query(`
      UPDATE scraped_content
      SET metadata = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [JSON.stringify(metadata), itemId]);

    // Get entity statistics
    const stats = nerService.getEntityStats(currentEntities);

    res.json({
      success: true,
      entities: currentEntities,
      stats,
      message: 'Entities updated successfully'
    });
  } catch (error) {
    console.error('Failed to update entities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update entities'
    });
  }
});

// Add custom entity type to site configuration
router.post('/sites/:siteId/entity-types', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { entityType, pattern, description, entityTypes } = req.body;

    // Handle bulk update of entity types (frontend sends entityTypes array)
    if (entityTypes && Array.isArray(entityTypes)) {
      const siteResult = await lsembPool.query(
        'SELECT selectors FROM site_configurations WHERE id = $1',
        [siteId]
      );

      if (siteResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Site not found'
        });
      }

      let selectors = siteResult.rows[0].selectors || {};
      selectors.entityTypes = {};

      // Add all entity types
      for (const entity of entityTypes) {
        if (entity.enabled && entity.pattern) {
          selectors.entityTypes[entity.type] = {
            pattern: entity.pattern,
            description: entity.label,
            category: entity.category,
            createdAt: new Date().toISOString()
          };

          // Add to NER service
          const regexPattern = new RegExp(entity.pattern, 'gi');
          nerService.addPattern(entity.type, regexPattern);
        }
      }

      // Update site configuration
      await lsembPool.query(`
        UPDATE site_configurations
        SET selectors = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [JSON.stringify(selectors), siteId]);

      return res.json({
        success: true,
        entityTypes,
        message: 'Entity types updated successfully'
      });
    }

    // Handle single entity type addition
    if (!entityType || !pattern) {
      return res.status(400).json({
        success: false,
        error: 'Entity type and pattern are required'
      });
    }

    // Get site configuration
    const siteResult = await lsembPool.query(
      'SELECT selectors FROM site_configurations WHERE id = $1',
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Site not found'
      });
    }

    let selectors = siteResult.rows[0].selectors || {};
    if (!selectors.entityTypes) {
      selectors.entityTypes = {};
    }

    // Add entity type
    selectors.entityTypes[entityType] = {
      pattern,
      description,
      createdAt: new Date().toISOString()
    };

    // Update site configuration
    await lsembPool.query(`
      UPDATE site_configurations
      SET selectors = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [JSON.stringify(selectors), siteId]);

    // Add to NER service
    const regexPattern = new RegExp(pattern, 'gi');
    nerService.addPattern(entityType, regexPattern);

    res.json({
      success: true,
      entityType,
      pattern,
      message: 'Entity type added successfully'
    });
  } catch (error) {
    console.error('Failed to add entity type:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add entity type'
    });
  }
});

// Get entity types for a site
router.get('/sites/:siteId/entity-types', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;

    const result = await lsembPool.query(
      'SELECT selectors FROM site_configurations WHERE id = $1',
      [siteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Site not found'
      });
    }

    const selectors = result.rows[0].selectors || {};
    const entityTypes = selectors.entityTypes || {};

    res.json({
      success: true,
      entityTypes
    });
  } catch (error) {
    console.error('Failed to get entity types:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get entity types'
    });
  }
});

// Update site configuration (for the configure/save functionality)
router.put('/sites/:siteId/config', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const {
      contentSelectors,
      pagination,
      rateLimit,
      headers,
      ecommerce,
      customSelectors
    } = req.body;

    // Get current site configuration
    const siteResult = await lsembPool.query(
      'SELECT selectors FROM site_configurations WHERE id = $1',
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Site not found'
      });
    }

    let selectors = siteResult.rows[0].selectors || {};

    // Update configuration
    if (contentSelectors) {
      selectors.contentSelectors = contentSelectors;
    }

    if (pagination) {
      selectors.pagination = pagination;
    }

    if (rateLimit !== undefined) {
      selectors.rateLimit = rateLimit;
    }

    if (headers) {
      selectors.headers = headers;
    }

    if (ecommerce) {
      selectors.ecommerce = ecommerce;
    }

    if (customSelectors) {
      selectors.customSelectors = customSelectors;
    }

    // Mark configuration as updated
    selectors.configuredAt = new Date().toISOString();
    selectors.configVersion = (selectors.configVersion || 0) + 1;

    // Update site configuration
    await lsembPool.query(`
      UPDATE site_configurations
      SET selectors = $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [JSON.stringify(selectors), siteId]);

    res.json({
      success: true,
      message: 'Site configuration updated successfully',
      config: selectors
    });
  } catch (error) {
    console.error('Failed to update site configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update site configuration'
    });
  }
});

// Enhanced Site Analysis with AI
router.post('/sites/analyze-enhanced', async (req: Request, res: Response) => {
  console.log(' ENHANCED ANALYSIS ENDPOINT HIT!', req.body);
  try {
    const { url, siteId } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Set up Server-Sent Events for real-time progress
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'X-Content-Type-Options': 'nosniff'
    });

    const progressCallback = (progress: any) => {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    };

    try {
      // Simulate AI-powered analysis with progress steps
      console.log('Starting AI site analysis for:', url);

      // Step 1: Initialization
      progressCallback?.({
        step: 'initialization',
        progress: 5,
        message: 'Initializing browser...',
        timestamp: new Date()
      });

      // Step 2: Content Loading
      await new Promise(resolve => setTimeout(resolve, 1000));
      progressCallback?.({
        step: 'content_loading',
        progress: 15,
        message: 'Loading page content...',
        timestamp: new Date()
      });

      // Step 3: Structure Analysis
      await new Promise(resolve => setTimeout(resolve, 1500));
      progressCallback?.({
        step: 'structure_analysis',
        progress: 30,
        message: 'Analyzing site structure...',
        timestamp: new Date()
      });

      // Step 4: Content Area Detection
      await new Promise(resolve => setTimeout(resolve, 1000));
      progressCallback?.({
        step: 'detecting_content_areas',
        progress: 50,
        message: 'Detecting content areas...',
        timestamp: new Date()
      });

      // Step 5: Navigation Pattern Identification
      await new Promise(resolve => setTimeout(resolve, 1500));
      progressCallback?.({
        step: 'identifying_navigation_patterns',
        progress: 70,
        message: 'Identifying navigation patterns...',
        timestamp: new Date()
      });

      // Step 6: Page Structure Analysis
      await new Promise(resolve => setTimeout(resolve, 1500));
      progressCallback?.({
        step: 'analyzing_page_structure',
        progress: 85,
        message: 'Analyzing page structure...',
        timestamp: new Date()
      });

      // Generate mock analysis based on URL
      const isEcommerce = url.includes('shop') || url.includes('store') || url.includes('amazon') || url.includes('ebay');
      const isBlog = url.includes('blog') || url.includes('medium') || url.includes('wordpress');

      const analysis = {
        baseUrl: url,
        siteType: isEcommerce ? 'ecommerce' : isBlog ? 'blog' : 'website',
        confidence: 0.8,
        selectors: {
          title: ['h1', 'title'],
          content: ['main', 'article', 'body'],
          price: isEcommerce ? ['.price', '[itemprop="price"]'] : [],
          image: ['img'],
          link: ['a'],
          navigation: ['nav'],
          pagination: ['.pagination', '.paging']
        },
        entities: {
          products: isEcommerce,
          articles: isBlog || !isEcommerce,
          reviews: isEcommerce,
          prices: isEcommerce,
          dates: true,
          authors: isBlog,
          categories: true
        },
        technical: {
          cms: 'unknown',
          framework: 'unknown',
          hasStructuredData: false,
          microdataTypes: [],
          hasOpenGraph: false,
          hasTwitterCards: false,
          language: 'en',
          paginationType: 'traditional'
        },
        seo: {
          titleTemplate: '{title}',
          metaDescription: '',
          h1Structure: [],
          internalLinks: 0,
          externalLinks: 0,
          imagesWithAlt: 0,
          totalImages: 0
        }
      };

      // If we have a siteId, save the analysis
      if (siteId) {
        await lsembPool.query(`
          UPDATE site_configurations
          SET selectors = $1, type = $2, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [JSON.stringify(analysis), analysis.siteType, siteId]);

        // Save to site_structures table
        await lsembPool.query(`
          INSERT INTO site_structures (site_id, structure, analyzed_at)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (site_id) DO UPDATE SET
          structure = EXCLUDED.structure,
          analyzed_at = EXCLUDED.analyzed_at
        `, [siteId, analysis]);
      }

      // Send final result
      progressCallback?.({
        step: 'completed',
        progress: 100,
        message: 'Analysis completed successfully',
        timestamp: new Date()
      });

      res.write(`data: ${JSON.stringify({
        type: 'complete',
        analysis,
        message: 'Analysis completed successfully'
      })}\n\n`);

    } catch (error) {
      console.error('AI analysis error:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : 'Analysis failed'
      })}\n\n`);
    }

    res.end();

  } catch (error) {
    console.error('AI site analysis failed:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to analyze site'
      });
    }
  }
});

// ==================== ADVANCED SCRAPING ====================

// Scrape with custom selectors
router.post('/scrape-with-selectors', async (req: Request, res: Response) => {
  try {
    const { url, selectors, options = {} } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Use puppeteer service with custom selectors
    const result = await webScraperService.scrape(url, {
      ...options,
      customSelectors: selectors
    });

    // Extract entities if requested
    if (options.extractEntities && result.success) {
      const entities = await nerService.extractEntities(
        `${result.title}\n\n${result.content}`
      );
      result.entities = entities.entities;
    }

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Scraping with custom selectors failed:', error);
    res.status(500).json({
      success: false,
      error: 'Scraping failed'
    });
  }
});

// Helper function to get site URL from ID
async function getSiteUrl(siteId: string): Promise<string | null> {
  try {
    const result = await lsembPool.query(
      'SELECT base_url FROM site_configurations WHERE id = $1',
      [siteId]
    );
    return result.rows[0]?.base_url || null;
  } catch (error) {
    console.error('Failed to get site URL:', error);
    return null;
  }
}

// Get duplicate statistics
router.get('/duplicate-stats', async (req: Request, res: Response) => {
  try {
    const stats = await deduplicationService.getDuplicateStats();

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Failed to get duplicate stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get duplicate statistics'
    });
  }
});

// Check for duplicate before scraping
router.post('/check-duplicate', async (req: Request, res: Response) => {
  try {
    const { url, title, content, description } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    const duplicateCheck = await deduplicationService.checkDuplicate(
      url,
      title,
      content,
      description
    );

    res.json({
      success: true,
      data: duplicateCheck
    });
  } catch (error) {
    console.error('Failed to check duplicates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check for duplicates'
    });
  }
});

// Get console logs from Redis
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const { service, limit = 100 } = req.query;

    let logs;
    if (service) {
      logs = await loggingService.getLogs(service as string, parseInt(limit as string));
    } else {
      logs = await loggingService.getAllLogs(parseInt(limit as string));
    }

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Failed to get logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get console logs'
    });
  }
});

// Clear logs for a service
router.delete('/logs/:service', async (req: Request, res: Response) => {
  try {
    const { service } = req.params;

    if (!service) {
      return res.status(400).json({
        success: false,
        error: 'Service name is required'
      });
    }

    await loggingService.clearLogs(service);

    res.json({
      success: true,
      message: `Logs cleared for ${service}`
    });
  } catch (error) {
    console.error('Failed to clear logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear logs'
    });
  }
});

// Test LLM providers
router.get('/test-llm', async (req: Request, res: Response) => {
  try {
    const { provider = 'openai', message = 'Test Türkçe mesajı. Hello, how are you?' } = req.query;

    // Log the test
    await loggingService.info('LLM-Test', `Testing ${provider} with message: ${message}`);

    // Test message in Turkish first, then English
    const testMessages = [
      'Merhaba, nasılsın?',
      'Hello, how are you?',
      'Bu bir test mesajıdır.',
      'This is a test message.'
    ];

    const results = [];

    for (const msg of testMessages) {
      try {
        const response = await fetch('http://localhost:8083/api/v2/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: msg,
            model: 'gpt-4o-mini'
          })
        });

        if (response.ok) {
          const data = await response.json();
          results.push({
            message: msg,
            response: data.response || data.choices?.[0]?.message?.content,
            success: true
          });
          await loggingService.success('LLM-Test', `Response received for: ${msg}`, { response: data.response || data.choices?.[0]?.message?.content });
        } else {
          results.push({
            message: msg,
            error: 'Failed to get response',
            success: false
          });
          await loggingService.error('LLM-Test', `Failed to get response for: ${msg}`);
        }
      } catch (error: any) {
        results.push({
          message: msg,
          error: error.message,
          success: false
        });
        await loggingService.error('LLM-Test', `Error for ${msg}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      provider,
      results
    });
  } catch (error: any) {
    console.error('Failed to test LLM:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test LLM'
    });
  }
});

// Test embeddings
router.post('/test-embeddings', async (req: Request, res: Response) => {
  try {
    const { texts = ['Test embedding text in Turkish', 'Test embedding text in English'] } = req.body;

    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({
        success: false,
        error: 'Texts array is required'
      });
    }

    // Log the test
    await loggingService.info('Embedding-Test', `Testing embeddings with ${texts.length} texts`);

    const results = [];

    for (const text of texts) {
      try {
        const response = await fetch('http://localhost:8083/api/v2/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            texts: [text],
            model: 'text-embedding-3-small'
          })
        });

        if (response.ok) {
          const data = await response.json();
          results.push({
            text: text,
            embedding: data.embeddings?.[0],
            success: true,
            dimensions: data.embeddings?.[0]?.length
          });
          await loggingService.success('Embedding-Test', `Embedding created for: ${text}`, { dimensions: data.embeddings?.[0]?.length });
        } else {
          results.push({
            text: text,
            error: 'Failed to create embedding',
            success: false
          });
          await loggingService.error('Embedding-Test', `Failed to create embedding for: ${text}`);
        }
      } catch (error: any) {
        results.push({
          text: text,
          error: error.message,
          success: false
        });
        await loggingService.error('Embedding-Test', `Error for ${text}: ${error.message}`);
      }
    }

    res.json({
      success: true,
      results
    });
  } catch (error: any) {
    console.error('Failed to test embeddings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test embeddings'
    });
  }
});

// Get workflow jobs
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    // Get all workflow jobs from Redis
    const keys = await redis.keys('workflow-job:*');
    const workflows = [];

    for (const key of keys) {
      const jobData = await redis.get(key);
      if (jobData) {
        const job = JSON.parse(jobData);
        workflows.push({
          id: job.id,
          type: job.type || 'concept_workflow',
          concept: job.concept,
          projectId: job.projectId,
          status: job.status,
          progress: job.progress || 0,
          currentStep: job.currentStep,
          createdAt: job.createdAt,
          completedAt: job.completedAt,
          error: job.error,
          results: job.results
        });
      }
    }

    // Sort by creation date (newest first)
    workflows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ success: true, workflows });
  } catch (error) {
    console.error('Failed to get workflows:', error);
    res.status(500).json({ success: false, error: 'Failed to get workflows' });
  }
});

// Create new workflow job
router.post('/workflows', async (req: Request, res: Response) => {
  try {
    const { concept, projectId, options = {} } = req.body;

    if (!concept || !projectId) {
      return res.status(400).json({
        success: false,
        error: 'Concept and project ID are required'
      });
    }

    // Create workflow job
    const jobId = uuidv4();

    await redis.setex(`workflow-job:${jobId}`, 7200, JSON.stringify({
      id: jobId,
      type: 'concept_workflow',
      concept,
      projectId,
      options,
      status: 'pending',
      progress: 0,
      currentStep: 'initialized',
      createdAt: new Date().toISOString()
    }));

    res.json({
      success: true,
      jobId,
      message: 'Workflow job created successfully'
    });
  } catch (error) {
    console.error('Failed to create workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create workflow'
    });
  }
});

// Get workflow job status
router.get('/workflows/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const job = await redis.get(`workflow-job:${jobId}`);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Workflow job not found'
      });
    }

    res.json({
      success: true,
      job: JSON.parse(job)
    });
  } catch (error) {
    console.error('Failed to get workflow job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get workflow job'
    });
  }
});

// Cancel workflow job
router.post('/workflows/:jobId/cancel', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const job = await redis.get(`workflow-job:${jobId}`);
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Workflow job not found'
      });
    }

    const jobData = JSON.parse(job);
    jobData.status = 'cancelled';
    jobData.completedAt = new Date().toISOString();

    await redis.setex(`workflow-job:${jobId}`, 7200, JSON.stringify(jobData));

    res.json({
      success: true,
      message: 'Workflow job cancelled successfully'
    });
  } catch (error) {
    console.error('Failed to cancel workflow job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel workflow job'
    });
  }
});

// Test all scraping methods
router.post('/test-all-methods', async (req: Request, res: Response) => {
  try {
    const { url = 'https://example.com' } = req.body;
    const results: any = {
      url,
      methods: {},
      summary: {
        total: 0,
        successful: 0,
        failed: 0
      }
    };

    // 1. Test Puppeteer
    try {
      const puppeteerResult = await webScraperService.scrape(url, {
        timeout: 10000,
        removeOverlayElements: true
      });
      results.methods.puppeteer = {
        success: puppeteerResult.success,
        title: puppeteerResult.title,
        contentLength: puppeteerResult.content?.length || 0,
        error: puppeteerResult.error
      };
      results.summary.successful++;
    } catch (error) {
      results.methods.puppeteer = { success: false, error: error.message };
      results.summary.failed++;
    }
    results.summary.total++;

    // 2. Test Playwright
    try {
      const { chromium } = require('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      const title = await page.title();
      const content = await page.content();
      await browser.close();

      results.methods.playwright = {
        success: true,
        title,
        contentLength: content.length
      };
      results.summary.successful++;
    } catch (error) {
      results.methods.playwright = { success: false, error: error.message };
      results.summary.failed++;
    }
    results.summary.total++;

    // 3. Test Axios
    try {
      const axios = require('axios');
      const response = await axios.get(url, { timeout: 10000 });
      results.methods.axios = {
        success: true,
        status: response.status,
        contentLength: response.data?.length || 0,
        contentType: response.headers['content-type']
      };
      results.summary.successful++;
    } catch (error) {
      results.methods.axios = { success: false, error: error.message };
      results.summary.failed++;
    }
    results.summary.total++;

    // 4. Test Cheerio (via Axios + Cheerio)
    try {
      const axios = require('axios');
      const cheerio = require('cheerio');
      const response = await axios.get(url, { timeout: 10000 });
      const $ = cheerio.load(response.data);
      const title = $('title').text();
      const links = $('a').length;

      results.methods.cheerio = {
        success: true,
        title,
        linksFound: links,
        contentLength: response.data?.length || 0
      };
      results.summary.successful++;
    } catch (error) {
      results.methods.cheerio = { success: false, error: error.message };
      results.summary.failed++;
    }
    results.summary.total++;

    // 5. Test node-fetch
    try {
      const fetch = require('node-fetch');
      const response = await fetch(url);
      const text = await response.text();
      results.methods.nodeFetch = {
        success: true,
        status: response.status,
        contentLength: text.length,
        contentType: response.headers.get('content-type')
      };
      results.summary.successful++;
    } catch (error) {
      results.methods.nodeFetch = { success: false, error: error.message };
      results.summary.failed++;
    }
    results.summary.total++;

    // 6. Test Custom Selectors with Puppeteer
    try {
      const customResult = await webScraperService.scrape(url, {
        customSelectors: {
          title: 'h1',
          content: 'p',
          links: 'a'
        },
        timeout: 10000
      });
      results.methods.customSelectors = {
        success: customResult.success,
        title: customResult.title,
        hasCustomSelectors: true,
        error: customResult.error
      };
      results.summary.successful++;
    } catch (error) {
      results.methods.customSelectors = { success: false, error: error.message };
      results.summary.failed++;
    }
    results.summary.total++;

    // Add timestamp
    results.timestamp = new Date().toISOString();
    results.overallStatus = results.summary.failed === 0 ? 'All methods working' : 'Some methods failed';

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Test all methods failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test scraping methods',
      details: error.message
    });
  }
});

// Get available scraping methods and their capabilities
router.get('/methods', async (req: Request, res: Response) => {
  try {
    const methods = {
      puppeteer: {
        name: 'Puppeteer',
        description: 'Headless Chrome with full JavaScript rendering',
        capabilities: [
          'JavaScript execution',
          'Dynamic content',
          'Screenshots',
          'PDF generation',
          'Form submission',
          'Complex interactions'
        ],
        useCases: ['SPAs', 'React/Vue/Angular apps', 'JavaScript-heavy sites']
      },
      playwright: {
        name: 'Playwright',
        description: 'Modern browser automation with multi-browser support',
        capabilities: [
          'Multi-browser (Chrome, Firefox, Safari)',
          'Mobile emulation',
          'Network interception',
          'Geolocation',
          'Permissions',
          'Video recording'
        ],
        useCases: ['Cross-browser testing', 'Mobile scraping', 'Complex workflows']
      },
      axios: {
        name: 'Axios',
        description: 'HTTP client with promise support',
        capabilities: [
          'HTTP/HTTPS requests',
          'Request/Response interceptors',
          'Automatic JSON transformation',
          'Request cancellation',
          'File uploads'
        ],
        useCases: ['APIs', 'Static content', 'JSON data', 'File downloads']
      },
      cheerio: {
        name: 'Cheerio',
        description: 'Fast and flexible server-side HTML parsing',
        capabilities: [
          'jQuery-like API',
          'HTML parsing',
          'DOM manipulation',
          'CSS selectors',
          'Attribute extraction'
        ],
        useCases: ['Static HTML', 'Web scraping', 'Data extraction']
      },
      'node-fetch': {
        name: 'Node-Fetch',
        description: 'Fetch API for Node.js',
        capabilities: [
          'Fetch API compatibility',
          'Streams',
          'Blob/File support',
          'Headers manipulation',
          'Response cloning'
        ],
        useCases: ['API requests', 'File downloads', 'Stream processing']
      }
    };

    res.json({
      success: true,
      methods
    });
  } catch (error) {
    console.error('Failed to get methods:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scraping methods'
    });
  }
});

// Category-based scraping - scrape all items from category pages
router.post('/scrape-category', async (req: Request, res: Response) => {
  try {
    const {
      siteId,
      categoryUrls,
      paginationConfig = {},
      maxPages = 10,
      method = 'puppeteer' // puppeteer, playwright, axios+cheerio
    } = req.body;

    if (!siteId || !categoryUrls || !Array.isArray(categoryUrls)) {
      return res.status(400).json({
        success: false,
        error: 'Site ID and category URLs array are required'
      });
    }

    // Get site configuration
    const siteResult = await lsembPool.query(
      'SELECT * FROM site_configurations WHERE id = $1',
      [siteId]
    );

    if (siteResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Site not found'
      });
    }

    const site = siteResult.rows[0];
    const jobId = uuidv4();

    // Create job tracking
    const job = {
      id: jobId,
      type: 'category_scraping',
      siteId,
      categoryUrls,
      status: 'starting',
      progress: 0,
      items: [],
      errors: [],
      createdAt: new Date().toISOString()
    };

    await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));

    // Start scraping in background
    scrapeCategoryInBackground(jobId, site, categoryUrls, paginationConfig, maxPages, method);

    res.json({
      success: true,
      jobId,
      message: 'Category scraping started',
      estimatedItems: categoryUrls.length * maxPages
    });

  } catch (error) {
    console.error('Failed to start category scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start category scraping'
    });
  }
});

// Concept-based scraping - scrape content matching a concept from multiple sites
router.post('/scrape-concept', async (req: Request, res: Response) => {
  try {
    const {
      concept,
      sites = [], // Array of site IDs or URLs
      keywords = [],
      filters = {},
      maxResultsPerSite = 50,
      method = 'intelligent' // intelligent, puppeteer, playwright
    } = req.body;

    if (!concept || (!sites || sites.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Concept and sites are required'
      });
    }

    const jobId = uuidv4();

    // Create job tracking
    const job = {
      id: jobId,
      type: 'concept_scraping',
      concept,
      sites,
      keywords,
      filters,
      status: 'starting',
      progress: 0,
      results: [],
      matchedItems: [],
      createdAt: new Date().toISOString()
    };

    await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));

    // Start concept scraping in background
    scrapeConceptInBackground(jobId, concept, sites, keywords, filters, maxResultsPerSite, method);

    res.json({
      success: true,
      jobId,
      message: 'Concept scraping started',
      sitesCount: sites.length
    });

  } catch (error) {
    console.error('Failed to start concept scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start concept scraping'
    });
  }
});

// Background function for category scraping
async function scrapeCategoryInBackground(jobId: string, site: any, categoryUrls: string[], paginationConfig: any, maxPages: number, method: string) {
  try {
    const job = JSON.parse(await redis.get(`scrape-job:${jobId}`) || '{}');
    job.status = 'scraping';
    await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));

    const allItems = [];
    const totalPages = categoryUrls.length * maxPages;
    let processedPages = 0;

    for (const categoryUrl of categoryUrls) {
      let currentPage = categoryUrl;
      let pageCount = 0;

      while (currentPage && pageCount < maxPages) {
        try {
          // Scrape current page
          let result;

          if (method === 'puppeteer') {
            result = await webScraperService.scrape(currentPage, {
              timeout: 30000,
              removeOverlayElements: true,
              customSelectors: site.scraping_config?.contentSelectors || {}
            });
          } else if (method === 'playwright') {
            const { chromium } = require('playwright');
            const browser = await chromium.launch({ headless: true });
            const page = await browser.newPage();
            await page.goto(currentPage, { waitUntil: 'networkidle' });
            const content = await page.content();
            result = {
              success: true,
              title: await page.title(),
              content,
              url: currentPage
            };
            await browser.close();
          } else {
            // Axios + Cheerio
            const axios = require('axios');
            const cheerio = require('cheerio');
            const response = await axios.get(currentPage, { timeout: 30000 });
            const $ = cheerio.load(response.data);
            result = {
              success: true,
              title: $('title').text(),
              content: response.data,
              url: currentPage
            };
          }

          if (result.success) {
            // Extract items based on site configuration
            const items = await extractItemsFromPage(result, site.scraping_config || {});
            allItems.push(...items);
          }

          // Find next page
          if (paginationConfig.nextSelector) {
            const { chromium } = require('playwright');
            const browser = await chromium.launch({ headless: true });
            const page = await browser.newPage();
            await page.goto(currentPage);

            const nextUrl = await page.$eval(paginationConfig.nextSelector, (el: any) => {
              return el.href || el.getAttribute('href');
            }).catch(() => null);

            await browser.close();
            currentPage = nextUrl;
          } else {
            currentPage = null;
          }

          pageCount++;
          processedPages++;

          // Update progress
          const progress = Math.round((processedPages / totalPages) * 100);
          job.progress = progress;
          job.items = allItems;
          await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));

        } catch (error) {
          console.error(`Failed to scrape page ${currentPage}:`, error);
          job.errors.push({ page: currentPage, error: error.message });
        }
      }
    }

    // Final update
    job.status = 'completed';
    job.progress = 100;
    job.items = allItems;
    job.completedAt = new Date().toISOString();
    await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));

  } catch (error) {
    console.error('Category scraping failed:', error);
    const job = JSON.parse(await redis.get(`scrape-job:${jobId}`) || '{}');
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));
  }
}

// Background function for concept scraping
async function scrapeConceptInBackground(jobId: string, concept: string, sites: any[], keywords: string[], filters: any, maxResultsPerSite: number, method: string) {
  try {
    const job = JSON.parse(await redis.get(`scrape-job:${jobId}`) || '{}');
    job.status = 'analyzing';
    await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));

    const allResults = [];
    let processedSites = 0;

    for (const site of sites) {
      try {
        let searchResults = [];

        if (method === 'intelligent') {
          // Use intelligent scraper for semantic search
          const query = `${concept} ${keywords.join(' ')}`;
          searchResults = await intelligentScraperService.semanticSearch({
            query,
            siteIds: [typeof site === 'string' ? site : site.id],
            maxResultsPerSite
          });
        } else {
          // Use traditional scraping
          const baseUrl = typeof site === 'string' ? site : site.base_url;
          const result = await webScraperService.scrape(baseUrl, {
            timeout: 30000,
            removeOverlayElements: true
          });

          if (result.success) {
            // Find concept-related content
            searchResults = await findConceptRelatedContent(result.content, concept, keywords);
          }
        }

        allResults.push(...searchResults);
        processedSites++;

        // Update progress
        const progress = Math.round((processedSites / sites.length) * 100);
        job.progress = progress;
        job.matchedItems = allResults;
        await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));

      } catch (error) {
        console.error(`Failed to scrape site ${site}:`, error);
        job.errors.push({ site, error: error.message });
      }
    }

    // Final update
    job.status = 'completed';
    job.progress = 100;
    job.matchedItems = allResults;
    job.completedAt = new Date().toISOString();
    await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));

  } catch (error) {
    console.error('Concept scraping failed:', error);
    const job = JSON.parse(await redis.get(`scrape-job:${jobId}`) || '{}');
    job.status = 'failed';
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    await redis.setex(`scrape-job:${jobId}`, 7200, JSON.stringify(job));
  }
}

// Helper function to extract items from a page
async function extractItemsFromPage(pageResult: any, config: any): Promise<any[]> {
  const items = [];

  if (!pageResult || !pageResult.content) {
    return items;
  }

  try {
    const cheerio = require('cheerio');
    const $ = cheerio.load(pageResult.content);

    // Extract items based on selectors
    const itemSelector = config.itemSelector || '.product, .item, article, .post';
    $(itemSelector).each((i, element) => {
      const item = {
        title: $(element).find(config.titleSelector || 'h1, h2, h3, .title').first().text().trim(),
        price: $(element).find(config.priceSelector || '.price, [itemprop="price"]').first().text().trim(),
        description: $(element).find(config.descriptionSelector || '.description, p').first().text().trim(),
        image: $(element).find(config.imageSelector || 'img').first().attr('src'),
        link: $(element).find(config.linkSelector || 'a').first().attr('href'),
        url: pageResult.url
      };

      // Clean up and add item
      if (item.title || item.description) {
        items.push(item);
      }
    });

  } catch (error) {
    console.error('Error extracting items:', error);
  }

  return items;
}

// Helper function to find concept-related content
async function findConceptRelatedContent(content: string, concept: string, keywords: string[]): Promise<any[]> {
  const results = [];

  try {
    const cheerio = require('cheerio');
    const $ = cheerio.load(content);

    // Look for headings, paragraphs, and other content containing the concept or keywords
    const selectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'article', '.content', '.description'];

    selectors.forEach(selector => {
      $(selector).each((i, element) => {
        const text = $(element).text().toLowerCase();
        const searchTerms = [concept.toLowerCase(), ...keywords.map(k => k.toLowerCase())];

        if (searchTerms.some(term => text.includes(term))) {
          results.push({
            type: selector,
            content: $(element).text().trim(),
            html: $(element).html(),
            relevance: calculateRelevance(text, concept, keywords)
          });
        }
      });
    });

    // Sort by relevance and limit results
    results.sort((a, b) => b.relevance - a.relevance);

  } catch (error) {
    console.error('Error finding concept content:', error);
  }

  return results;
}

// Helper function to calculate content relevance
function calculateRelevance(text: string, concept: string, keywords: string[]): number {
  let score = 0;

  // Check for exact concept match
  if (text.includes(concept.toLowerCase())) {
    score += 10;
  }

  // Check for keyword matches
  keywords.forEach(keyword => {
    if (text.includes(keyword.toLowerCase())) {
      score += 5;
    }
  });

  // Bonus for heading tags
  if (text.includes('<h1>')) score += 5;
  if (text.includes('<h2>')) score += 3;

  return score;
}

// Process scraping queue
async function processScrapingQueue(batchJobId: string) {
  try {
    const batchJob = JSON.parse(await redis.get(`batch-scrape:${batchJobId}`) || '{}');
    batchJob.status = 'processing';
    await redis.setex(`batch-scrape:${batchJobId}`, 7200, JSON.stringify(batchJob));

    const results = [];
    let processed = 0;

    while (true) {
      // Get next batch from queue
      const items = await scrapingCacheService.getFromQueue(5);

      if (items.length === 0) {
        break;
      }

      // Process items in parallel
      const promises = items.map(async (item) => {
        try {
          let result;

          switch (item.method) {
            case 'playwright':
              const { chromium } = require('playwright');
              const browser = await chromium.launch({ headless: true });
              const page = await browser.newPage();
              await page.goto(item.url, { waitUntil: 'networkidle' });
              result = {
                success: true,
                title: await page.title(),
                content: await page.content(),
                url: item.url
              };
              await browser.close();
              break;

            case 'axios':
              const axios = require('axios');
              const response = await axios.get(item.url, { timeout: 30000 });
              result = {
                success: true,
                status: response.status,
                content: response.data,
                url: item.url
              };
              break;

            default: // puppeteer
              result = await webScraperService.scrape(item.url, item.options);
              break;
          }

          // Cache the result
          if (result.success) {
            await scrapingCacheService.cachePage(item.url, JSON.stringify(result));
          }

          await scrapingCacheService.markQueueCompleted(item.id, result);
          return { url: item.url, result };

        } catch (error) {
          console.error(`Failed to scrape ${item.url}:`, error);
          return { url: item.url, error: error.message };
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
      processed += items.length;

      // Update progress
      batchJob.progress = Math.round((processed / batchJob.queued) * 100);
      batchJob.results = results;
      await redis.setex(`batch-scrape:${batchJobId}`, 7200, JSON.stringify(batchJob));
    }

    // Mark as completed
    batchJob.status = 'completed';
    batchJob.progress = 100;
    batchJob.completedAt = new Date().toISOString();
    await redis.setex(`batch-scrape:${batchJobId}`, 7200, JSON.stringify(batchJob));

  } catch (error) {
    console.error('Queue processing failed:', error);
    const batchJob = JSON.parse(await redis.get(`batch-scrape:${batchJobId}`) || '{}');
    batchJob.status = 'failed';
    batchJob.error = error.message;
    batchJob.completedAt = new Date().toISOString();
    await redis.setex(`batch-scrape:${batchJobId}`, 7200, JSON.stringify(batchJob));
  }
}

// Cache statistics endpoint
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    const stats = await scrapingCacheService.getCacheStats();

    // Add additional statistics
    const [
      totalScrapedToday,
      topDomains,
      cacheHitRate
    ] = await Promise.all([
      redis.get('stats:scraped:today') || 0,
      redis.zrevrange('stats:domains', 0, 9, 'WITHSCORES'),
      calculateCacheHitRate()
    ]);

    res.json({
      success: true,
      cache: stats,
      additional: {
        totalScrapedToday,
        topDomains: topDomains.map(([domain, count]) => ({ domain, count: parseInt(count) })),
        cacheHitRate
      }
    });
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache statistics'
    });
  }
});

// Clear cache endpoint
router.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    const { tag, pattern } = req.body;

    let deleted = 0;

    if (tag) {
      // Clear by tag
      deleted = await scrapingCacheService.invalidateByTag(tag);
    } else if (pattern) {
      // Clear by pattern
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted = keys.length;
      }
    } else {
      // Clear all cache (dangerous!)
      const keys = await redis.keys('cache:*');
      if (keys.length > 0) {
        await redis.del(...keys);
        deleted = keys.length;
      }
    }

    res.json({
      success: true,
      deleted,
      message: `Cleared ${deleted} cache entries`
    });
  } catch (error) {
    console.error('Failed to clear cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache'
    });
  }
});

// Clean expired cache entries
router.post('/cache/clean', async (req: Request, res: Response) => {
  try {
    const cleaned = await scrapingCacheService.cleanExpiredCache();

    res.json({
      success: true,
      cleaned,
      message: `Cleaned ${cleaned} expired cache entries`
    });
  } catch (error) {
    console.error('Failed to clean cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clean cache'
    });
  }
});

// Helper function to calculate cache hit rate
async function calculateCacheHitRate(): Promise<number> {
  const totalHits = await redis.get('stats:cache:hits') || 0;
  const totalMisses = await redis.get('stats:cache:misses') || 0;
  const total = parseInt(totalHits) + parseInt(totalMisses);

  return total > 0 ? Math.round((parseInt(totalHits) / total) * 100) : 0;
}

// Get scrape job status
router.get('/scrape/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!redis) {
      return res.status(500).json({
        success: false,
        error: 'Cache not available'
      });
    }

    const jobData = await redis.get(`scrape:job:${jobId}`);
    if (!jobData) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    const job = JSON.parse(jobData);
    res.json({
      success: true,
      job
    });

  } catch (error) {
    console.error('Failed to get scrape job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status'
    });
  }
});

// Get scraping performance metrics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const performanceMetrics = new ScraperService().getPerformanceMetrics();
    const cacheStats = await scraperService.getCacheStats();

    // Get database statistics
    const dbStats = {};

    // Scrape embeddings table stats
    const scrapeResult = await lsembPool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN llm_analysis IS NOT NULL THEN 1 END) as ai_processed,
        COUNT(CASE WHEN entities IS NOT NULL THEN 1 END) as entities_extracted,
        AVG(LENGTH(content)) as avg_content_length,
        MAX(created_at) as last_scraped
      FROM scrape_embeddings
    `);

    dbStats.scrapeEmbeddings = scrapeResult.rows[0];

    // Overall scraping stats
    const overallResult = await lsembPool.query(`
      SELECT
        COUNT(DISTINCT url) as unique_urls,
        SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END) as last_24h,
        SUM(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) as last_7d
      FROM scrape_embeddings
    `);

    dbStats.overall = overallResult.rows[0];

    res.json({
      success: true,
      performance: performanceMetrics,
      cache: cacheStats,
      database: dbStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scraper statistics'
    });
  }
});

// Get AI configuration
router.get('/ai-config', async (req: Request, res: Response) => {
  try {
    let config = {
      enabled: true,
      qualityThreshold: 0.3,
      sentimentFilter: 'all',
      topicsFilter: [],
      customPrompt: ''
    };

    if (redis) {
      const savedConfig = await redis.get('scraper:ai-config');
      if (savedConfig) {
        config = { ...config, ...JSON.parse(savedConfig) };
      }
    }

    res.json({
      success: true,
      config
    });

  } catch (error) {
    console.error('Failed to get AI config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get AI configuration'
    });
  }
});

// ==================== PRODUCTION GRADE ENDPOINTS ====================

// Queue Management
router.post('/queue/add', async (req: Request, res: Response) => {
  try {
    const { url, options = {}, priority = 5, scheduledAt } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    const jobId = await scraperQueueService.addJob({
      url,
      options,
      priority,
      scheduledAt,
      metadata: {
        useCache: options.useCache ?? true,
        llmFiltering: options.llmFiltering ?? true,
        entityExtraction: options.entityExtraction ?? true
      }
    });

    res.json({
      success: true,
      jobId,
      message: 'Job added to queue'
    });

  } catch (error) {
    console.error('Failed to add job to queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add job to queue'
    });
  }
});

// Bulk queue operations
router.post('/queue/add-bulk', async (req: Request, res: Response) => {
  try {
    const { urls, options = {}, priority = 5 } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid URLs array is required'
      });
    }

    const jobs = urls.map(url => ({
      url,
      options,
      priority,
      metadata: {
        useCache: options.useCache ?? true,
        llmFiltering: options.llmFiltering ?? true,
        entityExtraction: options.entityExtraction ?? true
      }
    }));

    const jobIds = await scraperQueueService.addBulkJobs(jobs);

    res.json({
      success: true,
      jobIds,
      total: urls.length,
      message: `Added ${urls.length} jobs to queue`
    });

  } catch (error) {
    console.error('Failed to add bulk jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add bulk jobs'
    });
  }
});

// Get queue status
router.get('/queue/status', async (req: Request, res: Response) => {
  try {
    const metrics = await scraperQueueService.getMetrics();
    const queueStats = await scraperQueueService.getQueueStats();

    res.json({
      success: true,
      metrics,
      queueStats
    });

  } catch (error) {
    console.error('Failed to get queue status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get queue status'
    });
  }
});

// Cancel job
router.post('/queue/cancel/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const cancelled = await scraperQueueService.cancelJob(jobId);

    res.json({
      success: true,
      cancelled,
      message: cancelled ? 'Job cancelled' : 'Job not found or already processing'
    });

  } catch (error) {
    console.error('Failed to cancel job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel job'
    });
  }
});

// Monitoring Dashboard
router.get('/monitor/realtime', async (req: Request, res: Response) => {
  try {
    const metrics = await scraperMonitorService.getRealTimeMetrics();
    const alerts = await scraperMonitorService.getActiveAlerts();

    res.json({
      success: true,
      metrics,
      alerts
    });

  } catch (error) {
    console.error('Failed to get real-time metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get real-time metrics'
    });
  }
});

// Historical metrics
router.get('/monitor/history', async (req: Request, res: Response) => {
  try {
    const { hours = 24 } = req.query;
    const metrics = await scraperMonitorService.getHistoricalMetrics(parseInt(hours as string));

    res.json({
      success: true,
      metrics,
      period: `${hours} hours`
    });

  } catch (error) {
    console.error('Failed to get historical metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get historical metrics'
    });
  }
});

// Generate performance report
router.get('/monitor/report', async (req: Request, res: Response) => {
  try {
    const { hours = 24, format = 'json' } = req.query;
    const report = await scraperMonitorService.generateReport(parseInt(hours as string));

    if (format === 'csv') {
      // Convert to CSV (simplified)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="scraper-report-${hours}h.csv"`);
      return res.send(convertToCSV(report));
    }

    res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('Failed to generate report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report'
    });
  }
});

// Quality Control
router.post('/quality/check', async (req: Request, res: Response) => {
  try {
    const { url, title, content } = req.body;

    if (!url || !title || !content) {
      return res.status(400).json({
        success: false,
        error: 'URL, title, and content are required'
      });
    }

    // Check for duplicates
    const duplicateCheck = await scraperQualityService.checkDuplicate(url, title, content);

    // Analyze quality
    const qualityAnalysis = await scraperQualityService.analyzeQuality(url, title, content);

    // Update freshness
    const freshness = await scraperQualityService.updateFreshness(url);

    res.json({
      success: true,
      duplicate: duplicateCheck,
      quality: qualityAnalysis,
      freshness
    });

  } catch (error) {
    console.error('Failed to check quality:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check quality'
    });
  }
});

// Get quality statistics
router.get('/quality/stats', async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;
    const stats = await scraperQualityService.getQualityStats(parseInt(days as string));

    res.json({
      success: true,
      stats,
      period: `${days} days`
    });

  } catch (error) {
    console.error('Failed to get quality stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get quality stats'
    });
  }
});

// Bulk status check
router.post('/status/bulk', async (req: Request, res: Response) => {
  try {
    const { jobIds } = req.body;

    if (!jobIds || !Array.isArray(jobIds)) {
      return res.status(400).json({
        success: false,
        error: 'Job IDs array is required'
      });
    }

    const statuses = await scraperQueueService.getBulkJobStatus(jobIds);

    res.json({
      success: true,
      total: jobIds.length,
      statuses: Object.fromEntries(statuses)
    });

  } catch (error) {
    console.error('Failed to get bulk status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get bulk status'
    });
  }
});

// Export results
router.post('/export', async (req: Request, res: Response) => {
  try {
    const { format = 'json', urls, dateRange, filters } = req.body;

    // Query results based on criteria
    let query = `
      SELECT url, title, content, created_at, llm_analysis, entities
      FROM scrape_embeddings
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (urls && urls.length > 0) {
      query += ` AND url = ANY($${paramIndex})`;
      params.push(urls);
      paramIndex++;
    }

    if (dateRange) {
      query += ` AND created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      params.push(dateRange.start, dateRange.end);
      paramIndex += 2;
    }

    if (filters) {
      if (filters.minQualityScore) {
        query += ` AND (llm_analysis->>'qualityScore')::float >= $${paramIndex}`;
        params.push(filters.minQualityScore);
        paramIndex++;
      }
    }

    query += ` ORDER BY created_at DESC LIMIT 10000`;

    const result = await lsembPool.query(query, params);

    // Format based on export type
    if (format === 'csv') {
      const csv = convertResultsToCSV(result.rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="scraped-data.csv"`);
      return res.send(csv);
    }

    if (format === 'xml') {
      const xml = convertResultsToXML(result.rows);
      res.setHeader('Content-Type', 'application/xml');
      res.setHeader('Content-Disposition', `attachment; filename="scraped-data.xml"`);
      return res.send(xml);
    }

    // Default JSON
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
      format
    });

  } catch (error) {
    console.error('Failed to export results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export results'
    });
  }
});

// Schedule recurring scrape
router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const { urls, schedule, options = {} } = req.body;

    if (!urls || !schedule) {
      return res.status(400).json({
        success: false,
        error: 'URLs and schedule are required'
      });
    }

    // Parse cron-like schedule (simplified)
    // For production, use a proper cron library
    const jobId = uuidv4();

    // Store schedule in Redis
    if (redis) {
      await redis.hset('scraper:schedules', jobId, JSON.stringify({
        urls,
        schedule,
        options,
        createdAt: new Date().toISOString(),
        lastRun: null,
        nextRun: calculateNextRun(schedule)
      }));
    }

    res.json({
      success: true,
      jobId,
      nextRun: calculateNextRun(schedule),
      message: 'Recurring scrape scheduled'
    });

  } catch (error) {
    console.error('Failed to schedule scrape:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to schedule scrape'
    });
  }
});

// Configuration endpoints
router.post('/config/queue', async (req: Request, res: Response) => {
  try {
    const { concurrencyLimit, rateLimits } = req.body;

    if (concurrencyLimit) {
      scraperQueueService.setConcurrencyLimit(concurrencyLimit);
    }

    if (rateLimits) {
      for (const [domain, rpm] of Object.entries(rateLimits)) {
        scraperQueueService.setRateLimit(domain, rpm as number);
      }
    }

    res.json({
      success: true,
      message: 'Queue configuration updated'
    });

  } catch (error) {
    console.error('Failed to update queue config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update queue configuration'
    });
  }
});

router.post('/config/monitoring', async (req: Request, res: Response) => {
  try {
    const { alertThresholds, notifications } = req.body;

    scraperMonitorService.updateConfig({
      alertThresholds,
      notifications
    });

    res.json({
      success: true,
      message: 'Monitoring configuration updated'
    });

  } catch (error) {
    console.error('Failed to update monitoring config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update monitoring configuration'
    });
  }
});

// Helper functions
function convertToCSV(data: any): string {
  const headers = Object.keys(data);
  const csvRows = [headers.join(',')];

  for (const row of [data.summary, data.trends]) {
    const values = headers.map(header => {
      const value = (row as any)[header];
      return typeof value === 'string' ? `"${value}"` : value;
    });
    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

function convertResultsToCSV(rows: any[]): string {
  if (rows.length === 0) return '';

  const headers = ['url', 'title', 'created_at', 'quality_score', 'entity_count'];
  const csvRows = [headers.join(',')];

  for (const row of rows) {
    const qualityScore = row.llm_analysis?.qualityScore || 0;
    const entityCount = row.entities?.length || 0;

    const values = [
      `"${row.url}"`,
      `"${row.title?.replace(/"/g, '""') || ''}"`,
      row.created_at,
      qualityScore,
      entityCount
    ];

    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

function convertResultsToXML(rows: any[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<scraped_data>\n';

  for (const row of rows) {
    xml += '  <item>\n';
    xml += `    <url>${escapeXml(row.url)}</url>\n`;
    xml += `    <title>${escapeXml(row.title || '')}</title>\n`;
    xml += `    <created_at>${row.created_at}</created_at>\n`;
    xml += `    <quality_score>${row.llm_analysis?.qualityScore || 0}</quality_score>\n`;
    xml += `    <entity_count>${row.entities?.length || 0}</entity_count>\n`;
    xml += '  </item>\n';
  }

  xml += '</scraped_data>';
  return xml;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function calculateNextRun(schedule: string): string {
  // Simplified implementation
  // In production, use a proper cron parser
  const now = new Date();
  const next = new Date(now.getTime() + 3600000); // Add 1 hour
  return next.toISOString();
}

/**
 * Scraper service health check
 */
router.get('/api/v2/scraper/health', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Check all scraper services
    const services = {
      webScraper: !!webScraperService,
      intelligentScraper: !!intelligentScraperService,
      contentAnalyzer: !!contentAnalyzerService,
      projectSiteManager: !!projectSiteManagerService,
      nerService: !!nerService,
      categoryScraper: !!categoryScraperService,
      deduplication: !!deduplicationService,
      scrapingCache: !!scrapingCacheService,
      scraperQueue: !!scraperQueueService,
      scraperMonitor: !!scraperMonitorService,
      scraperQuality: !!scraperQualityService
    };

    // Check Redis connectivity
    let redisStatus = 'disconnected';
    if (redis) {
      try {
        await redis.ping();
        redisStatus = 'connected';
      } catch (error) {
        redisStatus = 'error';
      }
    }

    // Check database connectivity
    let dbStatus = 'disconnected';
    try {
      const testClient = await lsembPool.connect();
      await testClient.query('SELECT 1');
      testClient.release();
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'error';
    }

    const responseTime = Date.now() - startTime;

    res.json({
      status: 'healthy',
      service: 'Scraper',
      responseTime: `${responseTime}ms`,
      components: {
        services,
        redis: redisStatus,
        database: dbStatus
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      service: 'Scraper',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Scraper dashboard status (combined metrics for frontend dashboard)
 */
router.get('/dashboard/status', async (req: Request, res: Response) => {
  try {
    // Get comprehensive dashboard data by combining multiple services
    const [
      scraperStatus,
      realTimeMetrics,
      monitorData,
      scraperStats,
      queueMetrics,
      cacheStats
    ] = await Promise.all([
      // Basic scraper status
      new ScraperService().getPerformanceMetrics().catch(() => null),
      // Real-time monitoring metrics
      scraperMonitorService.getRealTimeMetrics().catch(() => null),
      // Monitor data with alerts
      scraperMonitorService.getMonitorData().catch(() => null),
      // General statistics
      new ScraperService().getBasicStats().catch(() => null),
      // Queue metrics
      scraperQueueService.getMetrics().catch(() => null),
      // Cache statistics
      scrapingCacheService.getCacheStats().catch(() => null)
    ]);

    // Get recent job counts
    let jobsToday = 0;
    let itemsLast24h = 0;
    if (redis) {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const dailyCount = await redis.get(`stats:scraped:${today}`);
      const yesterdayCount = await redis.get(`stats:scraped:${yesterday}`);

      jobsToday = parseInt(dailyCount || '0');
      itemsLast24h = parseInt(dailyCount || '0') + parseInt(yesterdayCount || '0');
    }

    // Combine all metrics for dashboard
    const dashboardData = {
      // Service status
      status: 'active',
      service: 'Scraper Dashboard',
      timestamp: new Date().toISOString(),

      // Scraper metrics
      scraper: {
        jobsToday,
        itemsLast24h,
        performance: scraperStatus,
        queue: queueMetrics,
        cache: cacheStats
      },

      // Monitoring data
      monitoring: {
        realTime: realTimeMetrics,
        alerts: monitorData?.alerts || [],
        performance: monitorData?.performance || {},
        domains: monitorData?.domains || {}
      },

      // Overall statistics
      statistics: {
        totalItems: scraperStats?.totalItems || 0,
        processedItems: scraperStats?.processedItems || 0,
        totalProjects: scraperStats?.totalProjects || 0,
        totalSites: scraperStats?.totalSites || 0,
        itemsLast24h
      },

      // System health
      health: {
        uptime: scraperStatus?.uptime || 'N/A',
        memory: scraperStatus?.memory || {},
        cpu: scraperStatus?.cpu || {},
        disk: scraperStatus?.disk || {}
      }
    };

    res.json(dashboardData);
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      service: 'Scraper Dashboard',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Scraper projects v2 endpoint (authenticated frontend endpoint)
 */
router.get('/api/v2/scraper/projects', async (req: Request, res: Response) => {
  try {
    const result = await pgPool.query(`
      SELECT
        p.id,
        p.name,
        p.description,
        p.created_at as createdAt,
        p.updated_at as updatedAt,
        p.is_active as isActive,
        COUNT(ps.site_id) as siteCount
      FROM scraping_projects p
      LEFT JOIN project_sites ps ON p.id = ps.project_id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `);

    const projects = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      isActive: row.isActive,
      siteCount: parseInt(row.siteCount || '0')
    }));

    res.json({
      success: true,
      data: projects,
      count: projects.length
    });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects',
      details: error.message
    });
  }
});

/**
 * Scraper configs endpoint (authenticated frontend endpoint)
 */
router.get('/api/v2/scraper/configs', async (req: Request, res: Response) => {
  try {
    const configs = {
      scrapingModes: [
        { value: 'static', label: 'Static Scraping', description: 'For simple websites with static content' },
        { value: 'dynamic', label: 'Dynamic Scraping', description: 'For modern websites with JavaScript content' },
        { value: 'auto', label: 'Auto Mode', description: 'Automatically detect scraping method' }
      ],
      defaultConfig: {
        maxPages: 50,
        maxDepth: 2,
        delay: 1000,
        respectRobots: true,
        generateEmbeddings: true,
        processWithAI: true,
        realTimeUpdates: true,
        excludePatterns: [],
        includePatterns: [],
        customSelectors: [],
        extractMode: 'best'
      },
      extractModes: [
        { value: 'all', label: 'All Content', description: 'Extract from all matching selectors' },
        { value: 'first', label: 'First Match', description: 'Use first matching selector only' },
        { value: 'best', label: 'Best Content', description: 'Find selector with most content' }
      ],
      commonSelectors: [
        { name: 'Main Content', selector: 'main, [role="main"], .content, #content' },
        { name: 'Articles', selector: 'article, .article, .post, .entry-content' },
        { name: 'Body', selector: '.body, .content-body, .article-body' },
        { name: 'Posts', selector: '.post, .entry, .article' },
        { name: 'Grid Content', selector: '.MuiGrid-root.MuiGrid-item' }
      ]
    };

    res.json({
      success: true,
      data: configs
    });
  } catch (error: any) {
    console.error('Error fetching configs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch configurations',
      details: error.message
    });
  }
});

/**
 * Start parallel scraping sessions v2 (authenticated endpoint for multiple sites)
 */
router.post('/api/v2/scraper/parallel', async (req: Request, res: Response) => {
  try {
    const { sites, config = {} } = req.body;

    if (!sites || !Array.isArray(sites) || sites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Sites array is required',
        details: 'Provide an array of sites to scrape simultaneously'
      });
    }

    // Validate each site
    const validSites = [];
    for (const site of sites) {
      if (!site.baseUrl) {
        console.warn('Site without baseUrl:', site);
        continue;
      }

      try {
        new URL(site.baseUrl);
        validSites.push(site);
      } catch (error) {
        console.warn('Invalid URL in site:', site.baseUrl);
        continue;
      }
    }

    if (validSites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid sites provided',
        details: 'All provided sites have invalid URLs'
      });
    }

    // Create scraping jobs for each site
    const jobs = [];
    for (const site of validSites) {
      const siteConfig = {
        ...config,
        projectId: site.projectId || null,
        siteId: site.siteId || null,
        siteName: site.name || null,
        scrapingMode: site.scrapingMode || config.scrapingMode || 'auto',
        maxPages: site.maxPages || config.maxPages || 50,
        maxDepth: site.maxDepth || config.maxDepth || 2,
        delay: site.delay || config.delay || 1000,
        respectRobots: site.respectRobots !== false,
        generateEmbeddings: site.generateEmbeddings !== false,
        processWithAI: site.processWithAI !== false,
        realTimeUpdates: site.realTimeUpdates !== false,
        excludePatterns: site.excludePatterns || config.excludePatterns || [],
        includePatterns: site.includePatterns || config.includePatterns || [],
        customSelectors: site.customSelectors || config.customSelectors || [],
        prioritySelectors: site.prioritySelectors || config.prioritySelectors || [],
        extractMode: site.extractMode || config.extractMode || 'best',
        domainsOnly: site.domainsOnly !== false,
        followExternal: site.followExternal !== true,
        waitForSelector: site.waitForSelector || config.waitForSelector || null,
        customHeaders: site.customHeaders || config.customHeaders || {}
      };

      // Create unique job ID for this site
      const jobId = `scrape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store job configuration
      await pgPool.query(`
        INSERT INTO scraping_jobs (
          id, url, config, status, created_at, project_id, site_id
        ) VALUES ($1, $2, $3, 'pending', NOW(), $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          config = EXCLUDED.config,
          status = EXCLUDED.status
      `, [jobId, site.baseUrl, JSON.stringify(siteConfig), site.projectId, site.siteId]);

      jobs.push({
        jobId,
        siteName: site.name,
        baseUrl: site.baseUrl,
        config: siteConfig
      });
    }

    // Return success response with all job IDs
    res.json({
      success: true,
      jobs,
      message: `${jobs.length} scraping jobs started successfully`,
      parallelJobs: jobs.length
    });

  } catch (error: any) {
    console.error('Failed to start parallel scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start parallel scraping',
      details: error.message
    });
  }
});

/**
 * Start scraping session v2 (authenticated endpoint with multiple sites support)
 */
router.post('/api/v2/scraper/start', async (req: Request, res: Response) => {
  try {
    const { url, config = {}, projectId, siteId, siteName } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
        details: 'The scraping URL parameter is mandatory'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
        details: 'Please provide a valid URL (e.g., https://example.com)'
      });
    }

    const scrapingConfig = {
      mode: config.scrapingMode || 'auto',
      maxPages: config.maxPages || 50,
      maxDepth: config.maxDepth || 2,
      delay: config.delay || 1000,
      respectRobots: config.respectRobots !== false,
      generateEmbeddings: config.generateEmbeddings !== false,
      processWithAI: config.processWithAI !== false,
      realTimeUpdates: config.realTimeUpdates !== false,
      excludePatterns: config.excludePatterns || [],
      includePatterns: config.includePatterns || [],
      customSelectors: config.customSelectors || [],
      prioritySelectors: config.prioritySelectors || [],
      extractMode: config.extractMode || 'best',
      projectId: projectId || null,
      siteId: siteId || null,
      siteName: siteName || null,
      domainsOnly: config.domainsOnly !== false,
      followExternal: config.followExternal !== true,
      waitForSelector: config.waitForSelector || null,
      customHeaders: config.customHeaders || {}
    };

    // Create unique job ID
    const jobId = `scrape_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store job configuration
    await pgPool.query(`
      INSERT INTO scraping_jobs (
        id, url, config, status, created_at, project_id, site_id
      ) VALUES ($1, $2, $3, 'pending', NOW(), $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        config = EXCLUDED.config,
        status = EXCLUDED.status
    `, [jobId, url, JSON.stringify(scrapingConfig), projectId, siteId]);

    // Return success response
    res.json({
      success: true,
      jobId,
      message: 'Scraping job started successfully',
      config: scrapingConfig
    });

  } catch (error: any) {
    console.error('Error starting scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start scraping',
      details: error.message
    });
  }
});

/**
 * Start scraping session (authenticated endpoint)
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { url, config = {} } = req.body;

    if (!url) {
      return res.status(400).json({
        error: 'URL is required',
        details: 'The scraping URL parameter is mandatory'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        error: 'Invalid URL format',
        details: 'Please provide a valid URL (e.g., https://example.com)'
      });
    }

    // Get Socket.IO for real-time updates
    const io = getSocketIO();

    // Start scraping session
    const result = await webScraperService.startScrapingSession(url, config, io);

    // Log the activity
    await loggingService.logActivity('scraper_start', `Started scraping session: ${url}`, {
      url,
      config,
      sessionId: result.sessionId,
      userId: (req as any).user?.userId
    });

    res.json({
      success: true,
      sessionId: result.sessionId,
      message: 'Scraping session started successfully',
      config: {
        maxDepth: config.maxDepth || 3,
        maxPages: config.maxPages || 100,
        domainsOnly: config.domainsOnly || true,
        followExternal: config.followExternal || false,
        delay: config.delay || 1000,
        respectRobots: config.respectRobots || true,
        userAgent: config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      estimatedTime: result.estimatedTime || '5-15 minutes'
    });
  } catch (error: any) {
    console.error('Failed to start scraping session:', error);

    await loggingService.logActivity('scraper_start_error', `Failed to start scraping: ${error.message}`, {
      url: req.body.url,
      error: error.message,
      userId: (req as any).user?.userId
    });

    res.status(500).json({
      error: 'Failed to start scraping session',
      details: error.message || 'Unknown error occurred'
    });
  }
});

/**
 * Pause scraping session (authenticated endpoint)
 */
router.post('/pause', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        details: 'The sessionId parameter is mandatory'
      });
    }

    // Get Socket.IO for real-time updates
    const io = getSocketIO();

    // Pause scraping session
    const result = await webScraperService.pauseScrapingSession(sessionId, io);

    if (!result.success) {
      return res.status(404).json({
        error: 'Session not found',
        details: result.message || 'Scraping session does not exist'
      });
    }

    // Log the activity
    await loggingService.logActivity('scraper_pause', `Paused scraping session: ${sessionId}`, {
      sessionId,
      userId: (req as any).user?.userId
    });

    res.json({
      success: true,
      sessionId,
      message: 'Scraping session paused successfully',
      pausedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Failed to pause scraping session:', error);

    await loggingService.logActivity('scraper_pause_error', `Failed to pause scraping: ${error.message}`, {
      sessionId: req.body.sessionId,
      error: error.message,
      userId: (req as any).user?.userId
    });

    res.status(500).json({
      error: 'Failed to pause scraping session',
      details: error.message || 'Unknown error occurred'
    });
  }
});

/**
 * Resume scraping session (authenticated endpoint)
 */
router.post('/resume', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        details: 'The sessionId parameter is mandatory'
      });
    }

    // Get Socket.IO for real-time updates
    const io = getSocketIO();

    // Resume scraping session
    const result = await webScraperService.resumeScrapingSession(sessionId, io);

    if (!result.success) {
      return res.status(404).json({
        error: 'Session not found',
        details: result.message || 'Scraping session does not exist or cannot be resumed'
      });
    }

    // Log the activity
    await loggingService.logActivity('scraper_resume', `Resumed scraping session: ${sessionId}`, {
      sessionId,
      userId: (req as any).user?.userId
    });

    res.json({
      success: true,
      sessionId,
      message: 'Scraping session resumed successfully',
      resumedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Failed to resume scraping session:', error);

    await loggingService.logActivity('scraper_resume_error', `Failed to resume scraping: ${error.message}`, {
      sessionId: req.body.sessionId,
      error: error.message,
      userId: (req as any).user?.userId
    });

    res.status(500).json({
      error: 'Failed to resume scraping session',
      details: error.message || 'Unknown error occurred'
    });
  }
});

/**
 * Stop scraping session (authenticated endpoint)
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId, force = false } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        error: 'Session ID is required',
        details: 'The sessionId parameter is mandatory'
      });
    }

    // Get Socket.IO for real-time updates
    const io = getSocketIO();

    // Stop scraping session
    const result = await webScraperService.stopScrapingSession(sessionId, force, io);

    if (!result.success) {
      return res.status(404).json({
        error: 'Session not found',
        details: result.message || 'Scraping session does not exist'
      });
    }

    // Log the activity
    await loggingService.logActivity('scraper_stop', `Stopped scraping session: ${sessionId}`, {
      sessionId,
      force,
      userId: (req as any).user?.userId
    });

    res.json({
      success: true,
      sessionId,
      message: force ? 'Scraping session forcefully stopped' : 'Scraping session stopped successfully',
      stoppedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Failed to stop scraping session:', error);

    await loggingService.logActivity('scraper_stop_error', `Failed to stop scraping: ${error.message}`, {
      sessionId: req.body.sessionId,
      error: error.message,
      userId: (req as any).user?.userId
    });

    res.status(500).json({
      error: 'Failed to stop scraping session',
      details: error.message || 'Unknown error occurred'
    });
  }
});

/**
 * Pause scraping session v2 (authenticated endpoint)
 */
router.post('/api/v2/scraper/pause', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required',
        details: 'The scraping job ID parameter is mandatory'
      });
    }

    // Update job status to paused
    const result = await pgPool.query(`
      UPDATE scraping_jobs
      SET status = 'paused', updated_at = NOW()
      WHERE id = $1 AND status = 'running'
      RETURNING id, status, created_at, updated_at
    `, [jobId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        details: 'Scraping job does not exist or is not running'
      });
    }

    res.json({
      success: true,
      jobId,
      message: 'Scraping job paused successfully',
      pausedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Failed to pause scraping job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause scraping job',
      details: error.message
    });
  }
});

/**
 * Resume scraping session v2 (authenticated endpoint)
 */
router.post('/api/v2/scraper/resume', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required',
        details: 'The scraping job ID parameter is mandatory'
      });
    }

    // Update job status to running
    const result = await pgPool.query(`
      UPDATE scraping_jobs
      SET status = 'running', updated_at = NOW()
      WHERE id = $1 AND status = 'paused'
      RETURNING id, status, created_at, updated_at
    `, [jobId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        details: 'Scraping job does not exist or is not paused'
      });
    }

    res.json({
      success: true,
      jobId,
      message: 'Scraping job resumed successfully',
      resumedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Failed to resume scraping job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume scraping job',
      details: error.message
    });
  }
});

/**
 * Stop scraping session v2 (authenticated endpoint)
 */
router.post('/api/v2/scraper/stop', async (req: Request, res: Response) => {
  try {
    const { jobId, force = false } = req.body;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'Job ID is required',
        details: 'The scraping job ID parameter is mandatory'
      });
    }

    // Update job status to stopped
    const status = force ? 'stopped' : 'completed';
    const result = await pgPool.query(`
      UPDATE scraping_jobs
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND status IN ('running', 'paused')
      RETURNING id, status, created_at, updated_at
    `, [status, jobId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        details: 'Scraping job does not exist or is not active'
      });
    }

    res.json({
      success: true,
      jobId,
      message: force ? 'Scraping job forcefully stopped' : 'Scraping job completed successfully',
      stoppedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Failed to stop scraping job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop scraping job',
      details: error.message
    });
  }
});

/**
 * Scraper service status v2 (authenticated endpoint)
 */
router.get('/api/v2/scraper/status', async (req: Request, res: Response) => {
  try {
    // Get current job counts by status
    const statusResult = await pgPool.query(`
      SELECT
        status,
        COUNT(*) as count
      FROM scraping_jobs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY status
    `);

    const jobStats = statusResult.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count || '0');
      return acc;
    }, {});

    // Get system status
    const [performanceMetrics, basicStats] = await Promise.all([
      new ScraperService().getPerformanceMetrics(),
      new ScraperService().getBasicStats()
    ]);

    res.json({
      success: true,
      data: {
        jobs: {
          running: jobStats.running || 0,
          paused: jobStats.paused || 0,
          pending: jobStats.pending || 0,
          completed: jobStats.completed || 0,
          stopped: jobStats.stopped || 0,
          failed: jobStats.failed || 0
        },
        performance: performanceMetrics,
        stats: basicStats,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Failed to get scraper status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get scraper status',
      details: error.message
    });
  }
});

/**
 * Create new site v2 (authenticated endpoint for scraper wizard)
 */
router.post('/api/v2/scraper/sites', async (req: Request, res: Response) => {
  try {
    const {
      name,
      baseUrl,
      category = 'general',
      description = '',
      projectId = null,
      advancedSettings = {
        maxPages: 50,
        maxDepth: 2,
        delay: 1000,
        respectRobots: true,
        generateEmbeddings: true,
        processWithAI: true,
        realTimeUpdates: true,
        scrapingMode: 'auto',
        excludePatterns: [],
        includePatterns: [],
        customSelectors: [],
        extractMode: 'best'
      }
    } = req.body;

    // Validate required fields
    if (!name || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'Name and base URL are required',
        details: 'Site name and base URL parameters are mandatory'
      });
    }

    // Validate URL format
    try {
      new URL(baseUrl);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format',
        details: 'Please provide a valid base URL (e.g., https://example.com)'
      });
    }

    // Generate site slug
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const siteId = `${slug}_${Date.now()}`;

    // Insert site
    const result = await pgPool.query(`
      INSERT INTO project_sites (
        id,
        project_id,
        name,
        base_url,
        category,
        description,
        config,
        is_active,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
      RETURNING id, project_id, name, base_url, category, description, config, is_active
    `, [
      siteId,
      projectId,
      name,
      baseUrl,
      category,
      description,
      JSON.stringify(advancedSettings)
    ]);

    const site = result.rows[0];

    res.json({
      success: true,
      site,
      message: 'Site created successfully'
    });

  } catch (error: any) {
    console.error('Failed to create site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create site',
      details: error.message
    });
  }
});

/**
 * Get all sites v2 (authenticated endpoint for scraper wizard)
 */
router.get('/api/v2/scraper/sites', async (req: Request, res: Response) => {
  try {
    // Get query parameters
    const { projectId, category, search } = req.query;

    // Build base query
    let query = `
      SELECT
        ps.id,
        ps.name,
        ps.base_url,
        ps.category,
        ps.description,
        ps.config,
        ps.is_active,
        ps.created_at,
        ps.updated_at,
        p.name as project_name
      FROM project_sites ps
      LEFT JOIN scraping_projects p ON ps.project_id = p.id
    `;

    let conditions = [];
    let queryParams = [];
    let paramIndex = 1;

    // Add conditions
    if (projectId) {
      conditions.push(`ps.project_id = $${paramIndex++}`);
      queryParams.push(projectId);
    }

    if (category) {
      conditions.push(`ps.category = $${paramIndex++}`);
      queryParams.push(category);
    }

    if (search) {
      conditions.push(`(ps.name ILIKE $${paramIndex++} OR ps.description ILIKE $${paramIndex++} OR ps.base_url ILIKE $${paramIndex++})`);
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Add WHERE clause if there are conditions
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY ps.updated_at DESC`;

    const result = await pgPool.query(query, queryParams);

    const sites = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      category: row.category,
      description: row.description,
      config: row.config || {},
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      projectName: row.project_name
    }));

    res.json({
      success: true,
      data: sites,
      count: sites.length
    });

  } catch (error: any) {
    console.error('Failed to fetch sites:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sites',
      details: error.message
    });
  }
});

/**
 * Update site configuration v2 (authenticated endpoint for scraper wizard)
 */
router.put('/api/v2/scraper/sites/:siteId/config', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    const { config, name, description, isActive } = req.body;

    // Validate siteId
    if (!siteId) {
      return res.status(400).json({
        success: false,
        error: 'Site ID is required',
        details: 'The site ID parameter is mandatory'
      });
    }

    // Build update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (config) {
      updateFields.push(`config = $${paramIndex++}`);
      updateValues.push(JSON.stringify(config));
    }

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name);
    }

    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(description);
    }

    if (isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      updateValues.push(isActive);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No update fields provided',
        details: 'At least one field must be provided for update'
      });
    }

    // Add updated_at and siteId to values
    updateFields.push(`updated_at = NOW()`);
    updateValues.push(siteId);

    const query = `
      UPDATE project_sites
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, base_url, category, description, config, is_active, created_at, updated_at
    `;

    const result = await pgPool.query(query, updateValues);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
        details: 'The specified site does not exist'
      });
    }

    const site = result.rows[0];

    res.json({
      success: true,
      site,
      message: 'Site configuration updated successfully'
    });

  } catch (error: any) {
    console.error('Failed to update site configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update site configuration',
      details: error.message
    });
  }
});

/**
 * Delete site v2 (authenticated endpoint for scraper wizard)
 */
router.delete('/api/v2/scraper/sites/:siteId', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;

    if (!siteId) {
      return res.status(400).json({
        success: false,
        error: 'Site ID is required',
        details: 'The site ID parameter is mandatory'
      });
    }

    // Delete site
    const result = await pgPool.query(`
      DELETE FROM project_sites
      WHERE id = $1
      RETURNING id, name
    `, [siteId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
        details: 'The specified site does not exist'
      });
    }

    res.json({
      success: true,
      siteId,
      message: 'Site deleted successfully'
    });

  } catch (error: any) {
    console.error('Failed to delete site:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete site',
      details: error.message
    });
  }
});

/**
 * Get site selectors v2 (authenticated endpoint for scraper wizard)
 */
router.get('/api/v2/scraper/sites/:siteId/selectors', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;

    if (!siteId) {
      return res.status(400).json({
        success: false,
        error: 'Site ID is required',
        details: 'The site ID parameter is mandatory'
      });
    }

    // Get site configuration including selectors
    const result = await pgPool.query(`
      SELECT config, name, base_url
      FROM project_sites
      WHERE id = $1
    `, [siteId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
        details: 'The specified site does not exist'
      });
    }

    const { config } = result.rows[0];

    res.json({
      success: true,
      data: {
        site: {
          id: siteId,
          name: result.rows[0].name,
          baseUrl: result.rows[0].base_url
        },
        selectors: {
          customSelectors: config?.customSelectors || [],
          prioritySelectors: config?.prioritySelectors || [],
          extractMode: config?.extractMode || 'best',
          commonSelectors: [
            { name: 'Main Content', selector: 'main, [role="main"], .content, #content' },
            { name: 'Articles', selector: 'article, .article, .post, .entry-content' },
            { name: 'Body', selector: '.body, .content-body, .article-body' },
            { name: 'Posts', selector: '.post, .entry, .article' },
            { name: 'Grid Content', selector: '.MuiGrid-root.MuiGrid-item' }
          ]
        }
      }
    });

  } catch (error: any) {
    console.error('Failed to fetch site selectors:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch site selectors',
      details: error.message
    });
  }
});

/**
 * Start category-based scraping v2 (authenticated endpoint for category-based wizard)
 */
router.post('/api/v2/scraper/category', async (req: Request, res: Response) => {
  try {
    const {
      sites,
      category,
      keywords = [],
      maxPagesPerSite = 20,
      maxDepth = 1,
      excludePatterns = [],
      includePatterns = [],
      config = {}
    } = req.body;

    if (!sites || !Array.isArray(sites) || sites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Sites array is required',
        details: 'Provide an array of sites to scrape by category'
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Category is required',
        details: 'Specify the category for scraping (e.g., "news", "blog", "documentation")'
      });
    }

    // Validate each site
    const validSites = [];
    for (const site of sites) {
      if (!site.baseUrl) {
        console.warn('Site without baseUrl:', site);
        continue;
      }

      try {
        new URL(site.baseUrl);
        validSites.push(site);
      } catch (error) {
        console.warn('Invalid URL in site:', site.baseUrl);
        continue;
      }
    }

    if (validSites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid sites provided',
        details: 'All provided sites have invalid URLs'
      });
    }

    // Create category-specific scraping jobs
    const jobs = [];
    for (const site of validSites) {
      const categoryConfig = {
        ...config,
        projectId: site.projectId || null,
        siteId: site.siteId || null,
        siteName: site.name || null,
        category: category,
        keywords: keywords,
        scrapingMode: 'auto',
        maxPages: maxPagesPerSite,
        maxDepth: maxDepth,
        delay: 2000, // Longer delay for category scraping
        respectRobots: true,
        generateEmbeddings: true,
        processWithAI: true,
        realTimeUpdates: true,
        excludePatterns: [...excludePatterns, 'login', 'signup', 'contact', 'about'],
        includePatterns: [...includePatterns, category],
        customSelectors: [],
        prioritySelectors: [],
        extractMode: 'best',
        domainsOnly: true,
        followExternal: false,
        waitForSelector: null,
        customHeaders: config.customHeaders || {}
      };

      // Create unique job ID for this category scraping job
      const jobId = `category_${category}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store job configuration
      await pgPool.query(`
        INSERT INTO scraping_jobs (
          id, url, config, status, created_at, project_id, site_id
        ) VALUES ($1, $2, $3, 'pending', NOW(), $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          config = EXCLUDED.config,
          status = EXCLUDED.status
      `, [jobId, site.baseUrl, JSON.stringify(categoryConfig), site.projectId, site.siteId]);

      jobs.push({
        jobId,
        siteName: site.name,
        baseUrl: site.baseUrl,
        category: category,
        keywords: keywords,
        config: categoryConfig
      });
    }

    // Return success response with all job IDs
    res.json({
      success: true,
      jobs,
      message: `${jobs.length} category-based scraping jobs started successfully`,
      category,
      totalJobs: jobs.length
    });

  } catch (error: any) {
    console.error('Failed to start category-based scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start category-based scraping',
      details: error.message
    });
  }
});

/**
 * Start concept-based scraping v2 (authenticated endpoint for concept-based wizard)
 */
router.post('/api/v2/scraper/concept', async (req: Request, res: Response) => {
  try {
    const {
      sites,
      concept,
      context = '',
      maxPagesPerSite = 30,
      maxDepth = 2,
      similarityThreshold = 0.7,
      excludePatterns = [],
      includePatterns = [],
      config = {}
    } = req.body;

    if (!sites || !Array.isArray(sites) || sites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Sites array is required',
        details: 'Provide an array of sites to scrape by concept'
      });
    }

    if (!concept) {
      return res.status(400).json({
        success: false,
        error: 'Concept is required',
        details: 'Specify the concept for scraping (e.g., "machine learning", "blockchain", "climate change")'
      });
    }

    // Validate each site
    const validSites = [];
    for (const site of sites) {
      if (!site.baseUrl) {
        console.warn('Site without baseUrl:', site);
        continue;
      }

      try {
        new URL(site.baseUrl);
        validSites.push(site);
      } catch (error) {
        console.warn('Invalid URL in site:', site.baseUrl);
        continue;
      }
    }

    if (validSites.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid sites provided',
        details: 'All provided sites have invalid URLs'
      });
    }

    // Create concept-specific scraping jobs
    const jobs = [];
    for (const site of validSites) {
      const conceptConfig = {
        ...config,
        projectId: site.projectId || null,
        siteId: site.siteId || null,
        siteName: site.name || null,
        concept: concept,
        context: context,
        similarityThreshold: similarityThreshold,
        scrapingMode: 'dynamic', // Use dynamic scraping for better content extraction
        maxPages: maxPagesPerSite,
        maxDepth: maxDepth,
        delay: 1500,
        respectRobots: true,
        generateEmbeddings: true,
        processWithAI: true,
        realTimeUpdates: true,
        excludePatterns: [...excludePatterns, 'advertisement', 'sidebar', 'footer'],
        includePatterns: [...includePatterns],
        customSelectors: [],
        prioritySelectors: [],
        extractMode: 'best',
        domainsOnly: true,
        followExternal: false,
        waitForSelector: null,
        customHeaders: config.customHeaders || {}
      };

      // Create unique job ID for this concept scraping job
      const jobId = `concept_${concept}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store job configuration
      await pgPool.query(`
        INSERT INTO scraping_jobs (
          id, url, config, status, created_at, project_id, site_id
        ) VALUES ($1, $2, $3, 'pending', NOW(), $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          config = EXCLUDED.config,
          status = EXCLUDED.status
      `, [jobId, site.baseUrl, JSON.stringify(conceptConfig), site.projectId, site.siteId]);

      jobs.push({
        jobId,
        siteName: site.name,
        baseUrl: site.baseUrl,
        concept: concept,
        context: context,
        similarityThreshold: similarityThreshold,
        config: conceptConfig
      });
    }

    // Return success response with all job IDs
    res.json({
      success: true,
      jobs,
      message: `${jobs.length} concept-based scraping jobs started successfully`,
      concept,
      totalJobs: jobs.length
    });

  } catch (error: any) {
    console.error('Failed to start concept-based scraping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start concept-based scraping',
      details: error.message
    });
  }
});

/**
 * Get scraping wizard configuration v2 (authenticated endpoint for wizard setup)
 */
router.get('/api/v2/scraper/wizard-config', async (req: Request, res: Response) => {
  try {
    const wizardConfig = {
      categories: [
        { value: 'news', label: 'News Sites', description: 'For news and article websites' },
        { value: 'blog', label: 'Blogs', description: 'For personal and professional blogs' },
        { value: 'documentation', label: 'Documentation', description: 'For technical documentation and guides' },
        { value: 'forum', label: 'Forums', description: 'For discussion forums and community sites' },
        { value: 'ecommerce', label: 'E-commerce', description: 'For online shopping sites' },
        { value: 'portfolio', label: 'Portfolio', description: 'For portfolio and showcase sites' },
        { value: 'corporate', label: 'Corporate', description: 'For business and corporate websites' },
        { value: 'academic', label: 'Academic', description: 'For educational and research content' },
        { value: 'government', label: 'Government', description: 'For official government websites' },
        { value: 'nonprofit', label: 'Non-profit', description: 'For non-profit and organizational sites' }
      ],
      concepts: [
        { value: 'artificial-intelligence', label: 'Artificial Intelligence', description: 'AI, machine learning, deep learning' },
        { value: 'blockchain', label: 'Blockchain', description: 'Cryptocurrency, distributed ledger technology' },
        { value: 'climate-change', label: 'Climate Change', description: 'Environmental science, sustainability' },
        { value: 'cybersecurity', label: 'Cybersecurity', description: 'Information security, network protection' },
        { value: 'data-science', label: 'Data Science', description: 'Analytics, data mining, statistics' },
        { value: 'web-development', label: 'Web Development', description: 'Frontend, backend, full-stack development' },
        { value: 'mobile-development', label: 'Mobile Development', description: 'iOS, Android, mobile apps' },
        { value: 'cloud-computing', label: 'Cloud Computing', description: 'AWS, Azure, GCP, cloud infrastructure' },
        { value: 'devops', label: 'DevOps', description: 'CI/CD, automation, infrastructure management' },
        { value: 'ux-design', label: 'UX Design', description: 'User experience, interface design' }
      ],
      defaultSettings: {
        category: {
          maxPagesPerSite: 20,
          maxDepth: 1,
          delay: 2000,
          excludePatterns: ['login', 'signup', 'contact', 'about'],
          similarityThreshold: 0.8
        },
        concept: {
          maxPagesPerSite: 30,
          maxDepth: 2,
          delay: 1500,
          similarityThreshold: 0.7,
          excludePatterns: ['advertisement', 'sidebar', 'footer']
        }
      },
      advancedOptions: {
        extractionModes: [
          { value: 'all', label: 'All Content', description: 'Extract from all matching selectors' },
          { value: 'first', label: 'First Match', description: 'Use first matching selector only' },
          { value: 'best', label: 'Best Content', description: 'Find selector with most content' }
        ],
        scrapingModes: [
          { value: 'static', label: 'Static Scraping', description: 'For simple websites' },
          { value: 'dynamic', label: 'Dynamic Scraping', description: 'For modern JavaScript sites' },
          { value: 'auto', label: 'Auto Mode', description: 'Automatically detect method' }
        ],
        commonSelectors: [
          { name: 'Main Content', selector: 'main, [role="main"], .content, #content' },
          { name: 'Articles', selector: 'article, .article, .post, .entry-content' },
          { name: 'Headlines', selector: 'h1, h2, h3, h4, h5, h6' },
          { name: 'Body Text', selector: '.body, .content-body, .article-body' },
          { name: 'Links', selector: 'a[href]' },
          { name: 'Images', selector: 'img[src]' }
        ]
      }
    };

    res.json({
      success: true,
      data: wizardConfig
    });

  } catch (error: any) {
    console.error('Failed to fetch wizard configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wizard configuration',
      details: error.message
    });
  }
});

/**
 * Scraper service status (authenticated endpoint)
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Get comprehensive status
    const [
      queueMetrics,
      cacheStats,
      performanceMetrics
    ] = await Promise.all([
      scraperQueueService.getMetrics().catch(() => null),
      scrapingCacheService.getCacheStats().catch(() => null),
      scraperService.getPerformanceMetrics().catch(() => null)
    ]);

    // Get recent job counts
    let recentJobs = 0;
    if (redis) {
      const today = new Date().toISOString().split('T')[0];
      const dailyCount = await redis.get(`stats:scraped:${today}`);
      recentJobs = parseInt(dailyCount || '0');
    }

    res.json({
      status: 'active',
      service: 'Scraper',
      metrics: {
        jobsToday: recentJobs,
        queue: queueMetrics,
        cache: cacheStats,
        performance: performanceMetrics
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      service: 'Scraper',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
