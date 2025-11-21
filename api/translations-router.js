const express = require('express');
const { Client } = require('pg');
const Redis = require('ioredis');
const router = express.Router();

// Database configuration
const pgConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'lsemb',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD
};

// Redis configuration
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: process.env.REDIS_DB || 0
    });

// Translation providers configuration
const translationProviders = {
  google: {
    name: 'Google Translate',
    apiKey: process.env.GOOGLE_TRANSLATE_API_KEY,
    costPerChar: 0.00002,
    endpoint: 'https://translation.googleapis.com/language/translate/v2'
  },
  deepl: {
    name: 'DeepL',
    apiKey: process.env.DEEPL_API_KEY,
    costPerChar: 0.000006,
    endpoint: 'https://api-free.deepl.com/v2/translate'
  },
  openai: {
    name: 'OpenAI',
    apiKey: process.env.OPENAI_API_KEY,
    costPerToken: 0.000002,
    model: 'gpt-3.5-turbo',
    endpoint: 'https://api.openai.com/v1/chat/completions'
  }
};

/**
 * @route GET /api/v2/translations/providers
 * @group Translations - Data translation services
 * @summary Get available translation providers
 * @description Returns a list of available translation providers with their configuration
 * @returns {object} 200 - Translation providers configuration
 */
router.get('/providers', (req, res) => {
  const providers = {};
  
  Object.entries(translationProviders).forEach(([key, provider]) => {
    providers[key] = {
      name: provider.name,
      hasApiKey: !!provider.apiKey,
      costPerChar: provider.costPerChar,
      model: provider.model || null,
      supportedLanguages: ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'zh', 'ja', 'ko', 'el', 'th', 'ar']
    };
  });
  
  res.json({
    success: true,
    providers
  });
});

/**
 * @route GET /api/v2/translations/tables
 * @group Translations - Data translation services
 * @summary Get available database tables for translation
 * @description Returns a list of database tables that can be translated
 * @returns {object} 200 - List of available tables
 */
router.get('/tables', async (req, res) => {
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    
    // Get all user tables (excluding system tables)
    const result = await pg.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('spatial_ref_sys', 'geometry_columns', 'raster_columns', 'pgvector_stat')
      ORDER BY table_name
    `);
    
    const tables = result.rows.map(row => ({
      name: row.table_name,
      columnCount: parseInt(row.column_count),
      canTranslate: row.column_count > 0
    }));
    
    res.json({
      success: true,
      tables
    });
  } catch (error) {
    console.error('Error getting tables:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await pg.end();
  }
});

/**
 * @route POST /api/v2/translations/preview
 * @group Translations - Data translation services
 * @summary Preview table data before translation
 * @description Returns sample data from selected table for preview
 * @param {object} request.body.required - The request body
 * @param {string} request.body.table - Table name to preview
 * @param {number} request.body.limit - Number of rows to preview (default: 5)
 * @returns {object} 200 - Table preview data
 */
router.post('/preview', async (req, res) => {
  const { table, limit = 5 } = req.body;
  
  if (!table) {
    return res.status(400).json({
      success: false,
      error: 'Table name is required'
    });
  }
  
  const pg = new Client(pgConfig);
  
  try {
    await pg.connect();
    
    // Get table structure
    const structureResult = await pg.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = $1 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [table]);
    
    // Get sample data
    const dataResult = await pg.query(`
      SELECT * FROM "${table}" 
      LIMIT $1
    `, [parseInt(limit)]);
    
    res.json({
      success: true,
      table: {
        name: table,
        structure: structureResult.rows,
        sampleData: dataResult.rows,
        totalRows: dataResult.rowCount || 0
      }
    });
  } catch (error) {
    console.error('Error previewing table:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await pg.end();
  }
});

/**
 * @route POST /api/v2/translations/translate-table
 * @group Translations - Data translation services
 * @summary Start table translation job
 * @description Initiates a translation job for selected table and columns
 * @param {object} request.body.required - The request body
 * @param {string} request.body.table - Source table name
 * @param {string} request.body.targetTable - Target table name for translated data
 * @param {string} request.body.provider - Translation provider to use
 * @param {string} request.body.sourceLang - Source language code
 * @param {string} request.body.targetLang - Target language code
 * @param {array} request.body.columns - Columns to translate
 * @returns {object} 200 - Translation job started
 */
router.post('/translate-table', async (req, res) => {
  const { 
    table, 
    targetTable, 
    provider, 
    sourceLang, 
    targetLang, 
    columns 
  } = req.body;
  
  // Validation
  if (!table || !targetTable || !provider || !sourceLang || !targetLang || !columns) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: table, targetTable, provider, sourceLang, targetLang, columns'
    });
  }
  
  if (!translationProviders[provider]) {
    return res.status(400).json({
      success: false,
      error: `Unknown translation provider: ${provider}`
    });
  }
  
  if (!translationProviders[provider].apiKey) {
    return res.status(400).json({
      success: false,
      error: `API key not configured for provider: ${provider}`
    });
  }
  
  // Generate job ID
  const jobId = `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Store job in Redis
  const jobData = {
    id: jobId,
    table,
    targetTable,
    provider,
    sourceLang,
    targetLang,
    columns,
    status: 'pending',
    progress: 0,
    totalRows: 0,
    processedRows: 0,
    errors: [],
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  };
  
  try {
    await redis.setex(`translation_job:${jobId}`, 3600, JSON.stringify(jobData));
    
    // Add to job queue
    await redis.lpush('translation_jobs', jobId);
    
    res.json({
      success: true,
      jobId,
      message: 'Translation job started successfully'
    });
  } catch (error) {
    console.error('Error starting translation job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/v2/translations/job/:jobId
 * @group Translations - Data translation services
 * @summary Get translation job status
 * @description Returns the current status and progress of a translation job
 * @param {string} jobId.param.required - Job ID to check
 * @returns {object} 200 - Job status and progress
 */
router.get('/job/:jobId', async (req, res) => {
  const { jobId } = req.params;
  
  try {
    const jobData = await redis.get(`translation_job:${jobId}`);
    
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
    console.error('Error getting job status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/v2/translations/jobs
 * @group Translations - Data translation services
 * @summary Get all translation jobs
 * @description Returns a list of all translation jobs with their status
 * @param {number} query.limit - Maximum number of jobs to return (default: 50)
 * @param {string} query.status - Filter by job status (pending, processing, completed, error)
 * @returns {object} 200 - List of translation jobs
 */
router.get('/jobs', async (req, res) => {
  const { limit = 50, status } = req.query;
  
  try {
    // Get all job IDs from queue
    const jobIds = await redis.lrange('translation_jobs', 0, -1);
    
    const jobs = [];
    for (const jobId of jobIds) {
      const jobData = await redis.get(`translation_job:${jobId}`);
      if (jobData) {
        const job = JSON.parse(jobData);
        
        // Apply status filter if provided
        if (!status || job.status === status) {
          jobs.push(job);
        }
      }
    }
    
    // Sort by creation date (newest first) and apply limit
    const sortedJobs = jobs
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, parseInt(limit));
    
    res.json({
      success: true,
      jobs: sortedJobs,
      total: jobs.length
    });
  } catch (error) {
    console.error('Error getting jobs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route POST /api/v2/translations/job/:jobId/cancel
 * @group Translations - Data translation services
 * @summary Cancel a translation job
 * @description Cancels a running or pending translation job
 * @param {string} jobId.param.required - Job ID to cancel
 * @returns {object} 200 - Cancellation confirmation
 */
router.post('/job/:jobId/cancel', async (req, res) => {
  const { jobId } = req.params;
  
  try {
    const jobData = await redis.get(`translation_job:${jobId}`);
    
    if (!jobData) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    const job = JSON.parse(jobData);
    
    if (job.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel completed job'
      });
    }
    
    // Update job status
    job.status = 'cancelled';
    job.completedAt = new Date().toISOString();
    
    await redis.setex(`translation_job:${jobId}`, 3600, JSON.stringify(job));
    
    res.json({
      success: true,
      message: 'Job cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /api/v2/translations/stats
 * @group Translations - Data translation services
 * @summary Get translation statistics
 * @description Returns statistics about translation jobs and usage
 * @returns {object} 200 - Translation statistics
 */
router.get('/stats', async (req, res) => {
  try {
    // Get all job IDs
    const jobIds = await redis.lrange('translation_jobs', 0, -1);
    
    const stats = {
      totalJobs: jobIds.length,
      pendingJobs: 0,
      processingJobs: 0,
      completedJobs: 0,
      errorJobs: 0,
      cancelledJobs: 0,
      totalCost: 0,
      totalRows: 0,
      providerUsage: {}
    };
    
    for (const jobId of jobIds) {
      const jobData = await redis.get(`translation_job:${jobId}`);
      if (jobData) {
        const job = JSON.parse(jobData);
        
        // Update status counters
        stats[job.status + 'Jobs']++;
        
        // Update provider usage
        if (!stats.providerUsage[job.provider]) {
          stats.providerUsage[job.provider] = {
            jobs: 0,
            cost: 0,
            rows: 0
          };
        }
        
        stats.providerUsage[job.provider].jobs++;
        stats.providerUsage[job.provider].cost += job.cost || 0;
        stats.providerUsage[job.provider].rows += job.totalRows || 0;
        
        // Update totals
        stats.totalCost += job.cost || 0;
        stats.totalRows += job.totalRows || 0;
      }
    }
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;