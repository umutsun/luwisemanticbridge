import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const router = Router();

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../python-services/crawlers');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use crawler name from params
    const crawlerName = req.params.crawlerName;
    cb(null, `${crawlerName}.py`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/x-python' || file.originalname.endsWith('.py')) {
      cb(null, true);
    } else {
      cb(new Error('Only Python files are allowed'));
    }
  }
});

// Create dedicated Redis client for Crawl4AI data (Tenant-specific DB from .env.lsemb)
// Each tenant uses their own Redis DB for crawler data isolation
// DB number comes from REDIS_DB in .env.lsemb
const crawl4aiRedis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
  db: parseInt(process.env.REDIS_DB || '2', 10), // From .env.lsemb
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times: number) => {
    // Keep retrying with exponential backoff, max 5 seconds
    return Math.min(times * 200, 5000);
  },
  enableOfflineQueue: false, // Don't queue commands when disconnected
  maxRetriesPerRequest: 3 // Fail fast per request but keep connection alive
});

crawl4aiRedis.on('connect', () => {
  const dbNum = parseInt(process.env.REDIS_DB || '2', 10);
  console.log(` Crawl4AI Redis (DB ${dbNum}) connecting...`);
});

crawl4aiRedis.on('ready', () => {
  const dbNum = parseInt(process.env.REDIS_DB || '2', 10);
  console.log(` Crawl4AI Redis (DB ${dbNum}) ready for commands`);
});

crawl4aiRedis.on('close', () => {
  console.warn('️ Crawl4AI Redis connection closed');
});

crawl4aiRedis.on('reconnecting', () => {
  console.log(' Crawl4AI Redis reconnecting...');
});

crawl4aiRedis.on('error', (err: any) => {
  console.error(' Crawl4AI Redis error:', err.message || err);
});

// ============================================================================
// CRAWLER DIRECTORIES & DATA MANAGEMENT (Crawl4AI Redis)
// ============================================================================

/**
 * POST /crawler-directories
 * Create a new crawler directory
 */
router.post('/crawler-directories', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Crawler name is required'
      });
    }

    // Validate name format (lowercase, numbers, underscores only)
    if (!/^[a-z0-9_]+$/.test(name)) {
      return res.status(400).json({
        success: false,
        error: 'Crawler name must contain only lowercase letters, numbers, and underscores'
      });
    }

    // Add _crawler suffix if not already present
    const crawlerName = name.endsWith('_crawler') ? name : `${name}_crawler`;

    // Check if already exists by checking for any keys with this crawler name
    const existingKeys = await crawl4aiRedis.keys(`crawl4ai:${crawlerName}:*`);
    if (existingKeys.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Crawler with this name already exists'
      });
    }

    // Create a placeholder key to register the crawler
    const placeholderKey = `crawl4ai:${crawlerName}:_init`;
    await crawl4aiRedis.set(placeholderKey, JSON.stringify({
      created: new Date().toISOString(),
      status: 'initialized'
    }));

    const directory = {
      id: crawlerName,
      name: crawlerName,
      displayName: crawlerName.replace(/_crawler$/, '').replace(/_/g, ' ').toUpperCase(),
      itemCount: 0,
      lastCrawled: null,
      type: 'crawler'
    };

    res.json({
      success: true,
      directory,
      message: `Crawler "${crawlerName}" created successfully`
    });
  } catch (error: any) {
    console.error(' Failed to create crawler:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create crawler'
    });
  }
});

/**
 * GET /crawler-directories
 * List all crawler directories from Redis (e.g., yky_crawler, can_crawler)
 */
router.get('/crawler-directories', async (req: Request, res: Response) => {
  try {
    if (!crawl4aiRedis) {
      return res.status(503).json({
        success: false,
        error: 'Redis not available'
      });
    }

    // Get all crawl4ai keys from DB 0
    const keys = await crawl4aiRedis.keys('crawl4ai:*');

    // Extract unique crawler directory names (e.g., yky_crawler, can_crawler)
    const crawlerDirsSet = new Set<string>();
    const crawlerStats: Record<string, { name: string; count: number; lastCrawled: Date | null }> = {};

    for (const key of keys) {
      const parts = key.split(':');
      if (parts.length >= 2) {
        const crawlerName = parts[1]; // e.g., yky_crawler
        crawlerDirsSet.add(crawlerName);

        // Initialize stats if not exists
        if (!crawlerStats[crawlerName]) {
          crawlerStats[crawlerName] = {
            name: crawlerName,
            count: 0,
            lastCrawled: null
          };
        }
        crawlerStats[crawlerName].count++;
      }
    }

    // Convert to array and add metadata
    const directories = Array.from(crawlerDirsSet).map(name => ({
      id: name,
      name: name,
      displayName: name.replace(/_crawler$/, '').replace(/_/g, ' ').toUpperCase(),
      itemCount: crawlerStats[name]?.count || 0,
      lastCrawled: crawlerStats[name]?.lastCrawled || null,
      type: 'crawler'
    }));

    // Get running crawlers
    const runningKeys = await crawl4aiRedis.keys('crawler_running:*');
    const runningCrawlers = await Promise.all(
      runningKeys.map(async (key) => {
        const data = await crawl4aiRedis.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          return {
            crawlerName: key.replace('crawler_running:', ''),
            ...parsed
          };
        }
        return null;
      })
    ).then(results => results.filter(Boolean));

    res.json({
      success: true,
      directories,
      totalDirectories: directories.length,
      totalItems: keys.length,
      runningCrawlers
    });
  } catch (error: any) {
    console.error('Failed to fetch crawler directories:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch crawler directories'
    });
  }
});

/**
 * GET /crawler-directories/:crawlerName/data
 * Get all crawled data for a specific crawler directory
 */
router.get('/crawler-directories/:crawlerName/data', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const { limit, offset = 0, search } = req.query;

    if (!crawl4aiRedis) {
      return res.status(503).json({
        success: false,
        error: 'Redis not available'
      });
    }

    // Get all keys for this crawler from DB 0
    const pattern = `crawl4ai:${crawlerName}:*`;
    const keys = await crawl4aiRedis.keys(pattern);

    // Fetch and parse all data first if search is provided
    let allData = await Promise.all(
      keys.map(async (key) => {
        try {
          const value = await crawl4aiRedis.get(key);
          const parts = key.split(':');
          const itemKey = parts.slice(2).join(':'); // Everything after crawlerName

          let parsedData = null;
          try {
            parsedData = value ? JSON.parse(value) : null;
          } catch {
            parsedData = { raw: value };
          }

          return {
            id: key,
            key: itemKey,
            fullKey: key,
            crawlerName,
            data: parsedData,
            rawData: value,
            scrapedAt: parsedData?.scrapedAt || parsedData?.metadata?.scrapedAt || null,
            title: parsedData?.title || parsedData?.name || itemKey,
            url: parsedData?.url || parsedData?.source_url || null
          };
        } catch (err) {
          console.error(`Error fetching data for key ${key}:`, err);
          return null;
        }
      })
    );

    // Filter out null values
    allData = allData.filter(d => d !== null);

    // Apply search filter if provided
    if (search && typeof search === 'string') {
      const searchLower = search.toLowerCase();
      allData = allData.filter(item => {
        const titleMatch = item.title?.toLowerCase().includes(searchLower);
        const keyMatch = item.key?.toLowerCase().includes(searchLower);
        const urlMatch = item.url?.toLowerCase().includes(searchLower);
        return titleMatch || keyMatch || urlMatch;
      });
    }

    const totalAfterSearch = allData.length;

    // Paginate after filtering
    const paginatedData = limit
      ? allData.slice(Number(offset), Number(offset) + Number(limit))
      : allData.slice(Number(offset));

    res.json({
      success: true,
      crawlerName,
      data: paginatedData,
      total: totalAfterSearch,
      totalBeforeSearch: keys.length,
      limit: limit ? Number(limit) : totalAfterSearch,
      offset: Number(offset),
      hasMore: limit ? Number(offset) + Number(limit) < totalAfterSearch : false,
      searchApplied: !!search
    });
  } catch (error: any) {
    console.error('Failed to fetch crawler data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch crawler data'
    });
  }
});

/**
 * GET /crawler-directories/:crawlerName/data/:itemKey
 * Get specific crawled item data
 */
router.get('/crawler-directories/:crawlerName/data/:itemKey(*)', async (req: Request, res: Response) => {
  try {
    const { crawlerName, itemKey } = req.params;

    if (!crawl4aiRedis) {
      return res.status(503).json({
        success: false,
        error: 'Redis not available'
      });
    }

    const redisKey = `crawl4ai:${crawlerName}:${itemKey}`;
    const value = await crawl4aiRedis.get(redisKey);

    if (!value) {
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    let parsedData = null;
    try {
      parsedData = JSON.parse(value);
    } catch {
      parsedData = { raw: value };
    }

    res.json({
      success: true,
      key: itemKey,
      fullKey: redisKey,
      crawlerName,
      data: parsedData,
      rawData: value
    });
  } catch (error: any) {
    console.error('Failed to fetch crawler item:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch crawler item'
    });
  }
});

/**
 * POST /crawler-directories/:crawlerName/export-to-db
 * Export selected crawler data to source database
 */
router.post('/crawler-directories/:crawlerName/export-to-db', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const { items, tableName, columnMappings, createTable, tableSchema, autoEmbeddings } = req.body;

    console.log(' [Export to DB] Starting export...');
    console.log(' Crawler:', crawlerName);
    console.log(' Items count from frontend:', items?.length);
    console.log('️  Table name:', tableName);
    console.log(' Column mappings:', columnMappings);
    console.log(' Create table:', createTable);
    console.log(' Table schema:', tableSchema);

    // If no items provided, fetch all items from Redis for this crawler
    let itemsToExport = items;
    if (!items || !Array.isArray(items) || items.length === 0) {
      console.log(' No items provided, fetching all from Redis...');
      const allKeys = await crawl4aiRedis.keys(`crawl4ai:${crawlerName}:*`);
      itemsToExport = allKeys.map(key => key.replace(`crawl4ai:${crawlerName}:`, ''));
      console.log(` Found ${itemsToExport.length} items in Redis`);
    }

    if (!tableName || !columnMappings) {
      console.error(' Missing table name or column mappings');
      return res.status(400).json({
        success: false,
        error: 'Table name and column mappings are required'
      });
    }

    if (!crawl4aiRedis) {
      console.error(' Redis not available');
      return res.status(503).json({
        success: false,
        error: 'Redis not available'
      });
    }

    // Fetch data from Redis for each item
    console.log(' Fetching data from Redis...');
    console.log(` Total items to export: ${itemsToExport.length}`);
    const exportData = await Promise.all(
      itemsToExport.map(async (itemKey: string) => {
        const redisKey = `crawl4ai:${crawlerName}:${itemKey}`;
        const value = await crawl4aiRedis.get(redisKey);

        if (!value) {
          console.warn(`️  Item not found in Redis: ${redisKey}`);
          return null;
        }

        try {
          return JSON.parse(value);
        } catch {
          return { raw: value };
        }
      })
    );

    const validData = exportData.filter(d => d !== null);
    console.log(' Valid data items:', validData.length);

    // Transform data according to column mappings
    // columnMappings example: { "db_column_name": "json_field_path" }
    console.log(' Transforming data...');
    const transformedData = validData.map(item => {
      const row: any = {};
      for (const [dbColumn, jsonPath] of Object.entries(columnMappings)) {
        // Simple path resolution (e.g., "metadata.title" -> item.metadata.title)
        const pathParts = (jsonPath as string).split('.');
        let value = item;
        for (const part of pathParts) {
          value = value?.[part];
        }
        row[dbColumn] = value;
      }
      return row;
    });
    console.log(' Transformed data rows:', transformedData.length);

    // Create table if requested (use source.routes.ts logic)
    if (createTable && tableSchema && Array.isArray(tableSchema)) {
      try {
        console.log('️  Creating table:', tableName);
        // Import source routes dynamically to use table creation
        const axios = require('axios');
        const createResponse = await axios.post('http://localhost:8083/api/v2/source/tables/create', {
          tableName,
          columns: tableSchema
        });
        console.log(' Table created successfully:', createResponse.data);
      } catch (createError: any) {
        console.error(' Failed to create table:', createError.response?.data || createError.message);
        return res.status(500).json({
          success: false,
          error: `Failed to create table: ${createError.response?.data?.error || createError.message}`
        });
      }
    }

    // Insert into database using source database in batches with progress tracking
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    // Create jobId once for the entire export
    const jobId = `crawler_export_${crawlerName}_${Date.now()}`;

    if (transformedData.length > 0) {
      try {
        console.log(' Inserting data into table:', tableName);

        const batchSize = 50; // Insert 50 records at a time
        const totalBatches = Math.ceil(transformedData.length / batchSize);

        console.log(` Job ID: ${jobId}, Total batches: ${totalBatches}`);

        const axios = require('axios');

        for (let i = 0; i < totalBatches; i++) {
          const start = i * batchSize;
          const end = Math.min((i + 1) * batchSize, transformedData.length);
          const batch = transformedData.slice(start, end);

          console.log(` Processing batch ${i + 1}/${totalBatches} (${batch.length} records)`);

          const insertResponse = await axios.post(`http://localhost:8083/api/v2/source/tables/${tableName}/insert`, {
            data: batch,
            columnMappings
          });

          if (!insertResponse.data.success) {
            throw new Error(insertResponse.data.error || 'Failed to insert data');
          }

          totalInserted += insertResponse.data.insertedCount || 0;
          totalUpdated += insertResponse.data.updatedCount || 0;
          totalSkipped += insertResponse.data.skippedCount || 0;

          // Publish progress update via Redis
          const progress = {
            jobId,
            status: 'processing',
            currentBatch: i + 1,
            totalBatches,
            processedRecords: end,
            totalRecords: transformedData.length,
            insertedCount: totalInserted,
            updatedCount: totalUpdated,
            skippedCount: totalSkipped,
            percentage: Math.round((end / transformedData.length) * 100),
            message: `Processing batch ${i + 1}/${totalBatches}...`
          };

          await crawl4aiRedis.publish(
            `crawler_export_progress:${jobId}`,
            JSON.stringify(progress)
          );

          console.log(` Batch ${i + 1} complete - Inserted: ${insertResponse.data.insertedCount}, Updated: ${insertResponse.data.updatedCount}, Skipped: ${insertResponse.data.skippedCount}`);
        }

        console.log(` All batches complete - Total inserted: ${totalInserted}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}`);
      } catch (insertError: any) {
        console.error(' Failed to insert data:', insertError.response?.data || insertError.message);
        return res.status(500).json({
          success: false,
          error: `Failed to insert data: ${insertError.response?.data?.error || insertError.message}`
        });
      }
    }

    // If autoEmbeddings is enabled, trigger embedding generation
    let embeddingMessage = '';
    if (autoEmbeddings) {
      try {
        // Import embedding processor service
        const embeddingProcessor = require('../services/embedding-processor.service').default;

        // Queue embedding generation for the table
        console.log(` Triggering embedding generation for table: ${tableName}`);

        // Get sample data to generate embeddings
        const sampleResult = await lsembPool.query(
          `SELECT * FROM ${tableName} LIMIT 100`
        );

        let embeddingsGenerated = 0;
        for (const row of sampleResult.rows) {
          // Combine all text fields for embedding
          const textContent = Object.values(row)
            .filter(val => typeof val === 'string')
            .join(' ');

          if (textContent.trim().length > 0) {
            try {
              await embeddingProcessor.processEmbeddings(textContent, {
                model: 'text-embedding-3-small',
                chunkSize: 1000
              });
              embeddingsGenerated++;
            } catch (embErr) {
              console.error(` Failed to generate embedding for row:`, embErr);
            }
          }
        }

        embeddingMessage = ` (${embeddingsGenerated} embeddings generated)`;
        console.log(` Generated ${embeddingsGenerated} embeddings for ${tableName}`);
      } catch (embErr) {
        console.error(' Failed to generate embeddings:', embErr);
        embeddingMessage = ' (Embedding generation failed)';
      }
    }

    // Publish final completion status (use same jobId)
    await crawl4aiRedis.publish(
      `crawler_export_progress:${jobId}`,
      JSON.stringify({
        jobId,
        status: 'completed',
        processedRecords: transformedData.length,
        totalRecords: transformedData.length,
        insertedCount: totalInserted,
        updatedCount: totalUpdated,
        skippedCount: totalSkipped,
        percentage: 100,
        message: 'Export completed successfully'
      })
    );

    res.json({
      success: true,
      message: `Exported ${transformedData.length} items to ${tableName}${embeddingMessage}`,
      insertedCount: totalInserted,
      updatedCount: totalUpdated,
      skippedCount: totalSkipped,
      totalProcessed: transformedData.length,
      tableName,
      autoEmbeddings,
      jobId
    });
  } catch (error: any) {
    console.error(' [Export to DB] Critical error:', error);
    console.error(' Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export crawler data',
      details: error.response?.data || error.toString()
    });
  }
});

/**
 * POST /crawler-directories/:crawlerName/generate-embeddings
 * Generate embeddings for selected crawler data and store in scrape_embeddings
 */
router.post('/crawler-directories/:crawlerName/generate-embeddings', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required'
      });
    }

    if (!crawl4aiRedis) {
      return res.status(503).json({
        success: false,
        error: 'Redis not available'
      });
    }

    // Fetch data from Redis for each item
    const fetchedData = await Promise.all(
      items.map(async (itemKey: string) => {
        const redisKey = `crawl4ai:${crawlerName}:${itemKey}`;
        const value = await crawl4aiRedis.get(redisKey);

        if (!value) return null;

        try {
          const parsed = JSON.parse(value);
          return { key: itemKey, data: parsed };
        } catch {
          return { key: itemKey, data: { raw: value } };
        }
      })
    );

    const validData = fetchedData.filter(d => d !== null);


    // Generate embeddings using the embedding processor service
    const embeddingResults = [];
    const embeddingProcessor = require('../services/embedding-processor.service').default;

    for (const item of validData) {
      const content = item?.data?.content || item?.data?.text || JSON.stringify(item?.data);
      const title = item?.data?.title || item?.data?.name || item?.key;
      const url = item?.data?.url || item?.data?.source_url || null;

      try {
        // Generate actual embeddings
        const embeddingResult = await embeddingProcessor.processEmbeddings(content, {
          model: 'text-embedding-3-small',
          chunkSize: 1000,
          chunkOverlap: 200
        });

        // Insert with actual embedding data
        const insertResult = await lsembPool.query(`
          INSERT INTO scrape_embeddings (
            content,
            title,
            source_url,
            metadata,
            category,
            embedding,
            embedding_generated,
            model_used,
            total_chunks
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT DO NOTHING
          RETURNING id
        `, [
          content,
          title,
          url,
          JSON.stringify({
            crawlerName,
            itemKey: item?.key,
            totalTokens: embeddingResult.totalTokens,
            processingTimeMs: embeddingResult.processingTimeMs
          }),
          crawlerName,
          JSON.stringify(embeddingResult.embedding),
          true,
          embeddingResult.model,
          embeddingResult.totalChunks
        ]);

        embeddingResults.push({
          itemKey: item?.key,
          status: 'completed',
          embeddingId: insertResult.rows[0]?.id,
          chunks: embeddingResult.totalChunks
        });
      } catch (embErr) {
        console.error(` Failed to generate embedding for item ${item?.key}:`, embErr);

        // Insert without embedding as fallback
        await lsembPool.query(`
          INSERT INTO scrape_embeddings (
            content,
            title,
            source_url,
            metadata,
            category,
            embedding_generated
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING
        `, [
          content,
          title,
          url,
          JSON.stringify({ crawlerName, itemKey: item?.key, error: embErr.message }),
          crawlerName,
          false
        ]);

        embeddingResults.push({
          itemKey: item?.key,
          status: 'failed',
          error: embErr.message
        });
      }
    }

    res.json({
      success: true,
      message: `Queued ${embeddingResults.length} items for embedding generation`,
      results: embeddingResults
    });
  } catch (error: any) {
    console.error('Failed to generate embeddings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate embeddings'
    });
  }
});

/**
 * POST /analyze-table
 * Analyze table structure and provide entity analysis with JSON schema
 */
router.post('/analyze-table', async (req: Request, res: Response) => {
  try {
    const { crawlerName, sampleItems } = req.body;

    if (!crawlerName || !sampleItems || !Array.isArray(sampleItems)) {
      return res.status(400).json({
        success: false,
        error: 'Crawler name and sample items are required'
      });
    }

    // Analyze the structure of sample items
    const fieldAnalysis: Record<string, {
      name: string;
      type: string;
      nullable: boolean;
      examples: any[];
      frequency: number;
      sqlType: string;
    }> = {};

    sampleItems.forEach(item => {
      const data = item.data || item;
      Object.entries(data).forEach(([key, value]) => {
        if (!fieldAnalysis[key]) {
          fieldAnalysis[key] = {
            name: key,
            type: typeof value === 'object' && value !== null ? 'object' : typeof value,
            nullable: false,
            examples: [],
            frequency: 0,
            sqlType: 'TEXT'
          };
        }

        fieldAnalysis[key].frequency += 1;

        // Collect unique examples (max 3)
        if (fieldAnalysis[key].examples.length < 3 &&
          !fieldAnalysis[key].examples.some(ex => JSON.stringify(ex) === JSON.stringify(value))) {
          fieldAnalysis[key].examples.push(value);
        }

        // Update type if we see different types
        const currentType = typeof value === 'object' && value !== null ? 'object' : typeof value;
        if (fieldAnalysis[key].type !== currentType) {
          fieldAnalysis[key].nullable = true;
        }
      });
    });

    // Determine SQL types based on analysis
    Object.values(fieldAnalysis).forEach(field => {
      if (field.type === 'string') {
        // Check if it's a long text
        const maxLength = Math.max(...field.examples.map(ex => String(ex).length));
        field.sqlType = maxLength > 255 ? 'TEXT' : 'VARCHAR(255)';
      } else if (field.type === 'number') {
        // Check if it's an integer or decimal
        const hasDecimal = field.examples.some(ex => !Number.isInteger(ex));
        field.sqlType = hasDecimal ? 'NUMERIC' : 'INTEGER';
      } else if (field.type === 'boolean') {
        field.sqlType = 'BOOLEAN';
      } else if (field.type === 'object') {
        field.sqlType = 'JSONB';
      } else {
        field.sqlType = 'TEXT';
      }

      // Mark as nullable if not present in all items
      field.nullable = field.frequency < sampleItems.length;
    });

    // Generate JSON schema
    const jsonSchema = {
      type: 'object',
      properties: {} as Record<string, any>,
      required: [] as string[]
    };

    Object.values(fieldAnalysis).forEach(field => {
      jsonSchema.properties[field.name] = {
        type: field.type === 'object' ? 'object' : field.type,
        description: `Field type: ${field.type}, SQL type: ${field.sqlType}`,
        examples: field.examples.slice(0, 2)
      };

      if (!field.nullable) {
        jsonSchema.required.push(field.name);
      }
    });

    // Generate suggested table schema
    const tableSchema = Object.values(fieldAnalysis).map(field => ({
      columnName: field.name.toLowerCase().replace(/\s+/g, '_'),
      originalField: field.name,
      sqlType: field.sqlType,
      nullable: field.nullable,
      isPrimaryKey: field.name.toLowerCase() === 'id',
      examples: field.examples
    }));

    // Entity analysis
    const entityAnalysis = {
      crawlerName,
      totalFields: Object.keys(fieldAnalysis).length,
      requiredFields: Object.values(fieldAnalysis).filter(f => !f.nullable).length,
      optionalFields: Object.values(fieldAnalysis).filter(f => f.nullable).length,
      dataTypes: {
        text: Object.values(fieldAnalysis).filter(f => f.sqlType.includes('TEXT') || f.sqlType.includes('VARCHAR')).length,
        numeric: Object.values(fieldAnalysis).filter(f => f.sqlType.includes('NUMERIC') || f.sqlType.includes('INTEGER')).length,
        boolean: Object.values(fieldAnalysis).filter(f => f.sqlType === 'BOOLEAN').length,
        json: Object.values(fieldAnalysis).filter(f => f.sqlType === 'JSONB').length
      },
      sampleSize: sampleItems.length
    };

    res.json({
      success: true,
      entityAnalysis,
      fieldAnalysis: Object.values(fieldAnalysis),
      jsonSchema,
      tableSchema,
      suggestedTableName: crawlerName.replace(/_crawler$/, '_data')
    });
  } catch (error: any) {
    console.error('Failed to analyze table:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze table structure'
    });
  }
});

/**
 * POST /crawler-directories/:crawlerName/update-item
 * Update a crawler item in Redis
 */
router.post('/crawler-directories/:crawlerName/update-item', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const { itemKey, data } = req.body;

    console.log(' [Update Item] Received request');
    console.log(' Crawler Name:', crawlerName);
    console.log(' Item Key:', itemKey);
    console.log(' Data keys:', Object.keys(data || {}));

    if (!itemKey || !data) {
      console.error(' Missing itemKey or data');
      return res.status(400).json({
        success: false,
        error: 'Item key and data are required'
      });
    }

    if (!crawl4aiRedis) {
      console.error(' Redis not available');
      return res.status(503).json({
        success: false,
        error: 'Redis not available'
      });
    }

    // Update item in Redis
    const redisKey = `crawl4ai:${crawlerName}:${itemKey}`;
    console.log(' Redis Key:', redisKey);

    const jsonData = JSON.stringify(data);
    console.log(' Data size:', jsonData.length, 'bytes');

    await crawl4aiRedis.set(redisKey, jsonData);
    console.log(' Redis SET successful');

    // Verify the save
    const savedData = await crawl4aiRedis.get(redisKey);
    console.log(' Redis GET verification:', savedData ? 'Success' : 'Failed');

    res.json({
      success: true,
      message: 'Item updated successfully',
      itemKey,
      redisKey,
      dataSize: jsonData.length
    });
  } catch (error: any) {
    console.error(' Failed to update item:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update item'
    });
  }
});

/**
 * DELETE /crawler-directories/:crawlerName
 * Delete entire crawler directory (all items) from Redis
 */
/**
 * PATCH /crawler-directories/:crawlerName/rename
 * Rename a crawler directory by updating all Redis keys
 */
router.patch('/crawler-directories/:crawlerName/rename', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const { newName } = req.body;

    console.log('🔄 [Rename Directory] Received request');
    console.log('📁 Old Name:', crawlerName);
    console.log('📝 New Name:', newName);

    if (!crawlerName || !newName) {
      console.error('❌ Missing crawlerName or newName');
      return res.status(400).json({
        success: false,
        error: 'Both crawler name and new name are required'
      });
    }

    if (!crawl4aiRedis) {
      console.error('❌ Redis not available');
      return res.status(503).json({
        success: false,
        error: 'Redis not available'
      });
    }

    // Get all keys for the old crawler name
    const pattern = `crawl4ai:${crawlerName}:*`;
    console.log('🔍 Searching pattern:', pattern);

    const keys = await crawl4aiRedis.keys(pattern);
    console.log(`📦 Found ${keys.length} keys to rename`);

    if (keys.length === 0) {
      console.warn('⚠️ No keys found for crawler:', crawlerName);
      return res.status(404).json({
        success: false,
        error: 'Crawler directory not found'
      });
    }

    // Rename all keys
    let renamedCount = 0;
    for (const oldKey of keys) {
      const suffix = oldKey.replace(`crawl4ai:${crawlerName}:`, '');
      const newKey = `crawl4ai:${newName}:${suffix}`;

      // Get the value
      const value = await crawl4aiRedis.get(oldKey);

      if (value) {
        // Set new key
        await crawl4aiRedis.set(newKey, value);
        // Delete old key
        await crawl4aiRedis.del(oldKey);
        renamedCount++;
      }
    }

    console.log(`✅ Renamed ${renamedCount} items from ${crawlerName} to ${newName}`);

    res.json({
      success: true,
      message: `Crawler directory renamed successfully`,
      oldName: crawlerName,
      newName,
      renamedCount
    });
  } catch (error: any) {
    console.error('❌ Failed to rename crawler directory:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to rename crawler directory'
    });
  }
});

router.delete('/crawler-directories/:crawlerName', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;

    console.log('️  [Delete Directory] Received request');
    console.log(' Crawler Name:', crawlerName);

    if (!crawlerName) {
      console.error(' Missing crawlerName');
      return res.status(400).json({
        success: false,
        error: 'Crawler name is required'
      });
    }

    if (!crawl4aiRedis) {
      console.error(' Redis not available');
      return res.status(503).json({
        success: false,
        error: 'Redis not available'
      });
    }

    // Get all keys for this crawler
    const pattern = `crawl4ai:${crawlerName}:*`;
    console.log(' Searching pattern:', pattern);

    const keys = await crawl4aiRedis.keys(pattern);
    console.log(` Found ${keys.length} keys to delete`);

    if (keys.length === 0) {
      console.warn('️  No keys found for crawler:', crawlerName);
      return res.status(404).json({
        success: false,
        error: 'Crawler directory not found'
      });
    }

    // Delete all keys
    let deletedCount = 0;
    for (const key of keys) {
      await crawl4aiRedis.del(key);
      deletedCount++;
    }

    console.log(` Deleted ${deletedCount} items from Redis`);

    res.json({
      success: true,
      message: `Crawler directory deleted successfully`,
      crawlerName,
      deletedCount
    });
  } catch (error: any) {
    console.error(' Failed to delete crawler directory:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete crawler directory'
    });
  }
});

/**
 * DELETE /crawler-directories/:crawlerName/items/:itemKey
 * Delete a specific crawler item from Redis
 */
router.delete('/crawler-directories/:crawlerName/items/:itemKey', async (req: Request, res: Response) => {
  try {
    const { crawlerName, itemKey } = req.params;

    console.log('️  [Delete Item] Received request');
    console.log(' Crawler Name:', crawlerName);
    console.log(' Item Key:', itemKey);

    if (!crawlerName || !itemKey) {
      console.error(' Missing crawlerName or itemKey');
      return res.status(400).json({
        success: false,
        error: 'Crawler name and item key are required'
      });
    }

    if (!crawl4aiRedis) {
      console.error(' Redis not available');
      return res.status(503).json({
        success: false,
        error: 'Redis not available'
      });
    }

    const redisKey = `crawl4ai:${crawlerName}:${itemKey}`;
    console.log(' Redis Key:', redisKey);

    // Check if item exists
    const exists = await crawl4aiRedis.exists(redisKey);
    if (!exists) {
      console.warn('️  Item not found:', redisKey);
      return res.status(404).json({
        success: false,
        error: 'Item not found'
      });
    }

    // Delete the item from Redis
    await crawl4aiRedis.del(redisKey);
    console.log(' Item deleted successfully from Redis');

    res.json({
      success: true,
      message: 'Item deleted successfully',
      itemKey,
      redisKey
    });
  } catch (error: any) {
    console.error(' Failed to delete item:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete item'
    });
  }
});

/**
 * POST /crawler-directories/:crawlerName/script
 * Upload Python script for a crawler
 */
router.post('/crawler-directories/:crawlerName/script', upload.single('script'), async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;

    console.log(' [Upload Script] Received request');
    console.log(' Crawler Name:', crawlerName);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    console.log(' Script uploaded successfully:', req.file.filename);

    res.json({
      success: true,
      message: 'Python script uploaded successfully',
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });
  } catch (error: any) {
    console.error(' Failed to upload script:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload Python script'
    });
  }
});

/**
 * GET /crawler-directories/:crawlerName/script
 * Get Python script content for a crawler
 */
router.get('/crawler-directories/:crawlerName/script', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const scriptPath = path.join(__dirname, '../../python-services/crawlers', `${crawlerName}.py`);

    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({
        success: false,
        error: 'Script not found'
      });
    }

    // Read and return the script content as text
    const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(scriptContent);
  } catch (error: any) {
    console.error(' Failed to get script content:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get script content'
    });
  }
});

/**
 * POST /crawler-directories/:crawlerName/script/run
 * Run Python script for a crawler
 */
router.post('/crawler-directories/:crawlerName/script/run', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const { url } = req.body;
    const scriptPath = path.join(__dirname, '../../python-services/crawlers', `${crawlerName}.py`);

    console.log('▶️  [Run Script] Received request');
    console.log(' Crawler Name:', crawlerName);
    console.log(' URL:', url);
    console.log(' Script Path:', scriptPath);

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({
        success: false,
        error: 'Script not found'
      });
    }

    // Execute Python script as child process
    const { spawn } = require('child_process');
    // Use global Python (has playwright installed) instead of venv
    const pythonPath = 'python';

    const jobId = `script_run_${crawlerName}_${Date.now()}`;
    console.log(` Job ID: ${jobId}`);

    // Mark crawler as running in Redis
    await crawl4aiRedis.set(
      `crawler_running:${crawlerName}`,
      JSON.stringify({
        jobId,
        startedAt: new Date().toISOString(),
        url,
        status: 'running'
      })
    );
    console.log(` Marked ${crawlerName} as running in Redis`);

    // Start Python process with URL as argument
    // Set PYTHONUNBUFFERED=1 to disable stdout buffering for immediate output
    const pythonProcess = spawn(pythonPath, [scriptPath, url], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    let outputBuffer = '';
    let errorBuffer = '';

    // Capture stdout
    pythonProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      outputBuffer += output;
      console.log(`[${crawlerName}] ${output.trim()}`);

      // Store logs in Redis with TTL (24 hours)
      const logKey = `crawl_logs:${crawlerName}:${jobId}`;
      crawl4aiRedis.rpush(logKey, JSON.stringify({
        type: 'stdout',
        message: output,
        timestamp: new Date().toISOString()
      }));
      crawl4aiRedis.expire(logKey, 86400); // 24 hours TTL

      // Publish real-time logs via Redis
      crawl4aiRedis.publish(
        `script_log:${jobId}`,
        JSON.stringify({
          jobId,
          type: 'stdout',
          message: output,
          timestamp: new Date().toISOString()
        })
      );
    });

    // Capture stderr
    pythonProcess.stderr.on('data', (data: Buffer) => {
      const error = data.toString();
      errorBuffer += error;
      console.error(`[${crawlerName}] ERROR: ${error.trim()}`);

      // Store errors in Redis with TTL
      const logKey = `crawl_logs:${crawlerName}:${jobId}`;
      crawl4aiRedis.rpush(logKey, JSON.stringify({
        type: 'stderr',
        message: error,
        timestamp: new Date().toISOString()
      }));
      crawl4aiRedis.expire(logKey, 86400); // 24 hours TTL

      // Publish errors via Redis
      crawl4aiRedis.publish(
        `script_log:${jobId}`,
        JSON.stringify({
          jobId,
          type: 'stderr',
          message: error,
          timestamp: new Date().toISOString()
        })
      );
    });

    // Handle process completion
    pythonProcess.on('close', async (code: number) => {
      console.log(` Script finished with code: ${code}`);

      // Remove from running crawlers
      await crawl4aiRedis.del(`crawler_running:${crawlerName}`);
      console.log(` Removed ${crawlerName} from running crawlers`);

      // Publish completion status
      crawl4aiRedis.publish(
        `script_log:${jobId}`,
        JSON.stringify({
          jobId,
          type: 'completed',
          exitCode: code,
          timestamp: new Date().toISOString()
        })
      );
    });

    // Return job ID immediately for real-time tracking
    res.json({
      success: true,
      message: 'Script execution started',
      jobId,
      scriptPath,
      url
    });

  } catch (error: any) {
    console.error(' Failed to run script:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run Python script'
    });
  }
});

/**
 * POST /crawler-directories/:crawlerName/script/stop
 * Stop a running crawler script
 */
router.post('/crawler-directories/:crawlerName/script/stop', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const { jobId } = req.body;

    console.log(' [Stop Script] Received request');
    console.log(' Crawler Name:', crawlerName);
    console.log(' Job ID:', jobId);

    // Find and kill Python process and its child processes (Playwright/Chromium)
    const { exec } = require('child_process');

    if (process.platform === 'win32') {
      // Windows: First find Python PID running the crawler, then kill it with /T (tree) flag to kill children
      exec(`wmic process where "CommandLine like '%${crawlerName}.py%' and name='python.exe'" get ProcessId`, (error: any, stdout: any) => {
        if (error || !stdout) {
          console.warn('️  Failed to find Python process');
          return;
        }

        // Parse PIDs from output
        const lines = stdout.split('\n').filter((line: string) => line.trim() && line.trim() !== 'ProcessId');
        lines.forEach((line: string) => {
          const pid = line.trim();
          if (pid && !isNaN(Number(pid))) {
            // Kill process tree (includes Playwright/Chromium children)
            exec(`taskkill /F /T /PID ${pid}`, (killError: any) => {
              if (killError) {
                console.warn(`️  Failed to kill PID ${pid}:`, killError.message);
              } else {
                console.log(` Killed process tree for PID ${pid} (Python + Playwright)`);
              }
            });
          }
        });
      });
    } else {
      // Linux/Mac: Find Python PID and kill its process group
      exec(`pgrep -f "${crawlerName}.py"`, (error: any, stdout: any) => {
        if (error || !stdout) {
          console.warn('️  Failed to find Python process');
          return;
        }

        const pid = stdout.trim();
        if (pid) {
          // Kill process group (includes child processes)
          exec(`pkill -P ${pid}`, () => {
            exec(`kill -9 ${pid}`, (killError: any) => {
              if (killError) {
                console.warn('️  Failed to kill process:', killError.message);
              } else {
                console.log(' Killed Python process and children');
              }
            });
          });
        }
      });
    }

    // Remove from running crawlers
    await crawl4aiRedis.del(`crawler_running:${crawlerName}`);
    console.log(` Removed ${crawlerName} from running crawlers`);

    // Publish stop event
    if (jobId) {
      crawl4aiRedis.publish(
        `script_log:${jobId}`,
        JSON.stringify({
          jobId,
          type: 'completed',
          exitCode: -1,
          message: 'Stopped by user',
          timestamp: new Date().toISOString()
        })
      );
    }

    res.json({
      success: true,
      message: 'Stop command sent'
    });
  } catch (error: any) {
    console.error(' Failed to stop script:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /crawler-directories/:crawlerName/script
 * Delete Python script for a crawler
 */
router.delete('/crawler-directories/:crawlerName/script', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const scriptPath = path.join(__dirname, '../../python-services/crawlers', `${crawlerName}.py`);

    console.log('️  [Delete Script] Received request');
    console.log(' Crawler Name:', crawlerName);
    console.log(' Script Path:', scriptPath);

    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({
        success: false,
        error: 'Script not found'
      });
    }

    fs.unlinkSync(scriptPath);
    console.log(' Script deleted successfully');

    res.json({
      success: true,
      message: 'Python script deleted successfully'
    });
  } catch (error: any) {
    console.error(' Failed to delete script:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete Python script'
    });
  }
});

/**
 * POST /crawler-directories/:crawlerName/notify-item-added
 * Notify that a new item was added to Redis (called by Python scripts or Redis Pub/Sub)
 */
router.post('/crawler-directories/:crawlerName/notify-item-added', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const { itemKey, totalCount } = req.body;

    console.log(` [Notify Item Added] Crawler: ${crawlerName}, Key: ${itemKey}, Total: ${totalCount}`);

    // Fetch the item from Redis - try multiple key patterns
    let redisKey = `crawl4ai:${crawlerName}:kitaplar:${itemKey}`;
    let itemData = await crawl4aiRedis.get(redisKey);

    // Fallback: try without 'kitaplar' subdirectory
    if (!itemData) {
      redisKey = `crawl4ai:${crawlerName}:${itemKey}`;
      itemData = await crawl4aiRedis.get(redisKey);
    }

    if (!itemData) {
      console.warn(`️ Item not found in Redis: ${redisKey}`);
      return res.status(404).json({ success: false, error: 'Item not found in Redis' });
    }

    const item = JSON.parse(itemData);
    console.log(` Found item in Redis: ${item.product_name || item.title || 'Untitled'}`);

    // Transform to CrawledItem format expected by frontend
    const crawledItem = {
      key: redisKey,
      title: item.product_name || item.title || 'Untitled',
      data: item,
      timestamp: new Date().toISOString()
    };

    // Broadcast via WebSocket
    const { LiveDataBroadcastService } = require('../services/live-data-broadcast.service');
    const { WebSocketConnectionService } = require('../services/websocket-connection.service');
    const wsService = WebSocketConnectionService.getInstance();
    const broadcastService = LiveDataBroadcastService.getInstance(wsService);

    console.log(` Broadcasting to WebSocket clients...`);
    broadcastService.broadcastCrawlerItemAdded({
      directoryName: crawlerName,
      item: crawledItem,
      totalItems: totalCount || 0,
      timestamp: new Date().toISOString()
    });
    console.log(` WebSocket broadcast sent`);

    res.json({ success: true, message: 'Item broadcast sent' });
  } catch (error: any) {
    console.error(' Failed to notify item added:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /crawler-directories/:crawlerName/state
 * Get crawler state.json content for resume/progress monitoring
 */
router.get('/crawler-directories/:crawlerName/state', async (req: Request, res: Response) => {
  try {
    const { crawlerName } = req.params;
    const stateFilePath = path.join(__dirname, '../../python-services/crawlers', `${crawlerName}_state.json`);

    if (!fs.existsSync(stateFilePath)) {
      return res.status(404).json({
        success: false,
        error: 'State file not found',
        hasState: false
      });
    }

    // Read and parse the state file
    const stateContent = fs.readFileSync(stateFilePath, 'utf-8');
    const stateData = JSON.parse(stateContent);

    res.json({
      success: true,
      hasState: true,
      state: stateData,
      lastModified: fs.statSync(stateFilePath).mtime
    });
  } catch (error: any) {
    console.error(' Failed to get state file:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get state file',
      hasState: false
    });
  }
});

// =======================
// Redis → Socket.IO Bridge for Real-time Script Logs
// =======================

/**
 * Initialize Redis subscriber to forward script logs to Socket.IO clients
 * This bridges Redis pub/sub with Socket.IO for real-time log streaming
 */
export function initializeScriptLogBridge() {
  // Import getSocketIO dynamically to avoid circular dependency
  const { getSocketIO } = require('../server');
  const io = getSocketIO();

  if (!io) {
    console.warn('️  Socket.IO not available - script logs will not be streamed');
    return;
  }

  // Create dedicated subscriber client
  const subscriber = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: 6379,
    db: 0,
  });

  // Subscribe to all script log channels using pattern
  subscriber.psubscribe('script_log:*', (err, count) => {
    if (err) {
      console.error(' Failed to subscribe to script logs:', err);
      return;
    }
    console.log(` Subscribed to script_log:* (${count} patterns)`);
  });

  // Forward messages to Socket.IO
  subscriber.on('pmessage', (pattern, channel, message) => {
    try {
      const logData = JSON.parse(message);
      const { jobId, type, message: logMessage, exitCode, timestamp } = logData;

      // Emit to all connected Socket.IO clients
      io.emit('script_log', {
        jobId,
        type,
        message: logMessage,
        exitCode,
        timestamp
      });

      console.log(` Forwarded log [${type}] for job ${jobId}`);
    } catch (error) {
      console.error(' Failed to parse/forward script log:', error);
    }
  });

  subscriber.on('error', (err) => {
    console.error(' Redis subscriber error:', err);
  });

  console.log(' Script log bridge initialized');
}

/**
 * POST /analyzer
 * Analyze a crawled item with AI using template-based metadata extraction
 */
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { itemId, crawlerName, template, content } = req.body;

    if (!itemId || !crawlerName || !template || !content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: itemId, crawlerName, template, content'
      });
    }

    // Import the PDF metadata service to reuse the extraction logic
    const { PdfMetadataService } = require('../services/pdf/pdf-metadata.service');
    const metadataService = new PdfMetadataService();

    // Extract metadata using the same service as documents
    // For crawled web pages, we pass the HTML/text content directly
    const extractionOptions = {
      apiKey: process.env.GEMINI_API_KEY,
      deepseekApiKey: process.env.DEEPSEEK_API_KEY,
      template: template.id || template,
      templateData: template,
      analysisPrompt: template.extraction_prompt
    };

    // Use the text extraction method since we already have the content
    const result = await metadataService.extractMetadataFromText(
      content,
      itemId,
      extractionOptions
    );

    // Store the metadata back to Redis
    const itemKey = `${crawlerName}:${itemId}`;
    const existingData = await crawl4aiRedis.get(itemKey);

    if (existingData) {
      const parsedData = JSON.parse(existingData);
      parsedData.metadata = {
        ...parsedData.metadata,
        analysis: {
          ...result.metadata,
          template: template.id || template,
          analyzedAt: new Date().toISOString()
        }
      };

      await crawl4aiRedis.set(itemKey, JSON.stringify(parsedData));
    }

    res.json({
      success: true,
      metadata: result.metadata,
      itemId
    });

  } catch (error: any) {
    console.error(' Failed to analyze crawl item:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze item'
    });
  }
});

/**
 * GET /items/:crawlerName/:itemId
 * Get a single crawled item by crawler name and item ID
 * Used by n8n workflows and external integrations
 */
router.get('/items/:crawlerName/:itemId', async (req: Request, res: Response) => {
  try {
    const { crawlerName, itemId } = req.params;

    if (!crawlerName || !itemId) {
      return res.status(400).json({
        success: false,
        error: 'Crawler name and item ID are required'
      });
    }

    // Construct the full Redis key
    const itemKey = `${crawlerName}:${itemId}`;

    // Fetch from Redis
    const rawData = await crawl4aiRedis.get(itemKey);

    if (!rawData) {
      return res.status(404).json({
        success: false,
        error: `Item ${itemId} not found in crawler ${crawlerName}`
      });
    }

    // Parse the data
    const parsedData = JSON.parse(rawData);

    res.json({
      success: true,
      item: {
        id: itemId,
        crawlerName,
        fullKey: itemKey,
        data: parsedData.data || {},
        rawData: parsedData.rawData || parsedData.markdown || '',
        metadata: parsedData.metadata || {},
        scrapedAt: parsedData.timestamp || parsedData.scraped_at || null,
        url: parsedData.url || null
      }
    });

  } catch (error: any) {
    console.error(' Failed to fetch crawled item:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch item'
    });
  }
});

export default router;
