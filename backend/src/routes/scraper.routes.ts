import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { redis } from '../server';
import { webScraperService } from '../services/web-scraper.service';
import { intelligentScraperService } from '../services/intelligent-scraper.service';
import { contentAnalyzerService } from '../services/content-analyzer.service';
import { projectSiteManagerService } from '../services/project-site-manager.service';
import { nerService } from '../services/ner-service';
import { categoryScraperService } from '../services/category-scraper.service';
import { deduplicationService } from '../services/deduplication.service';
import { loggingService } from '../services/logging.service';
import { v4 as uuidv4 } from 'uuid';

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

// Analyze URL for automatic selector detection
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const result = await webScraperService.analyzeUrl(url);
    res.json(result);
  } catch (error) {
    console.error('Analysis failed:', error);
    res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});

// Scrape single URL
router.post('/scrape', async (req: Request, res: Response) => {
  try {
    const { url, mode, options, projectId, siteId } = req.body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Start scraping in background
    const jobId = uuidv4();

    // Save job to Redis
    await redis.setex(`scrape-job:${jobId}`, 3600, JSON.stringify({
      id: jobId,
      url,
      mode,
      options,
      projectId,
      siteId,
      status: 'processing',
      progress: 0,
      createdAt: new Date().toISOString()
    }));

    // Process asynchronously
    (async () => {
      try {
        const result = await webScraperService.scrape(url, options || {});
        const itemId = await webScraperService.saveToDatabase(result, projectId, siteId);

        // Update job status
        await redis.setex(`scrape-job:${jobId}`, 3600, JSON.stringify({
          ...JSON.parse(await redis.get(`scrape-job:${jobId}`)),
          status: 'completed',
          progress: 100,
          result,
          itemId,
          completedAt: new Date().toISOString()
        }));

        // Emit via Socket.IO
        if (io) {
          io.emit('scrape-complete', { jobId, result, itemId });
        }
      } catch (error) {
        console.error('Scraping error:', error);
        await redis.setex(`scrape-job:${jobId}`, 3600, JSON.stringify({
          ...JSON.parse(await redis.get(`scrape-job:${jobId}`)),
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        }));

        if (io) {
          io.emit('scrape-error', { jobId, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }
    })();

    res.json({ success: true, jobId });
  } catch (error) {
    console.error('Scrape failed:', error);
    res.status(500).json({ success: false, error: 'Scraping failed' });
  }
});

// Batch scrape
router.post('/batch-scrape', async (req: Request, res: Response) => {
  try {
    const { urls, mode, options, projectId, siteId } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ success: false, error: 'Valid URLs array is required' });
    }

    const jobId = await webScraperService.createJob(urls, options || {}, projectId, siteId);

    // Process in background
    webScraperService.processJob(jobId).catch(console.error);

    res.json({ success: true, jobId });
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

    // Simple text search for now (can be enhanced with vector search)
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
    const { entityType, pattern, description } = req.body;

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

    // Use enhanced puppeteer service with custom selectors
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

export default router;