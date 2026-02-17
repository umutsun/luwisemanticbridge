// OPTIMIZED SETTINGS ROUTES
// Implements high-performance caching, category filtering, and validation

import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { settingsCache } from '../services/cache.service';

const router = Router();

// Cache middleware with performance tracking
// 🔧 NEW: Supports X-Bypass-Cache header for testing
function cacheMiddleware(req: Request, res: Response, next: any) {
  const startTime = Date.now();
  const key = `settings:${req.originalUrl}`;

  // 🔧 NEW: Check for cache bypass header (for testing)
  const bypassCache = req.headers['x-bypass-cache'] === 'true' ||
                      req.headers['x-bypass-cache'] === '1';

  if (bypassCache) {
    console.log(`⚠️ [CACHE] Bypassed for ${key} (X-Bypass-Cache header)`);
    // Clear the cache entry to ensure fresh data
    settingsCache.delete(key);
  } else {
    const cached = settingsCache.get(key);
    if (cached !== null) {
      const duration = Date.now() - startTime;
      console.log(` [CACHE] Hit for ${key} (${duration}ms)`);
      return res.json(cached);
    }
  }

  console.log(` [API] Miss for ${key}`);

  // Override res.json to cache response (skip if bypass)
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    console.log(` [API] Response in ${duration}ms${bypassCache ? ' (no cache)' : ', caching...'}`);

    // Cache with 30s TTL (skip if bypass header present)
    if (!bypassCache) {
      settingsCache.set(key, data, 30000);
    }

    return originalJson.call(this, data);
  };

  next();
}

/**
 * @swagger
 * /settings:
 *   get:
 *     summary: Get application settings
 *     description: Retrieve settings by category or get all settings
 *     tags: [Settings]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [llm, embeddings, rag, prompts, chatbot, database, redis, n8n, security, app, scraper, translation, ocr]
 *         description: Settings category to retrieve
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SettingsObject'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Optimized category getter - returns ONLY the requested category
router.get('/', cacheMiddleware, async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    if (!category) {
      // Return minimal full config if no category - include active models, app description, and all database settings
      const result = await lsembPool.query(
        `SELECT key, value FROM settings
         WHERE key IN ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        ['app.name', 'app.description', 'app.version', 'app.locale', 'llmSettings.activeChatModel', 'llmSettings.activeEmbeddingModel',
         'database.host', 'database.port', 'database.name', 'database.user', 'database.password', 'database.ssl']
      );

      // Start with environment-based defaults for database
      const config: any = {
        app: {
          name: 'Mali Müşavir Asistanı',
          version: '1.0.0',
          locale: 'tr'
        },
        llmSettings: {
          activeChatModel: null,
          activeEmbeddingModel: null
        },
        database: {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT || '5432'),
          name: process.env.POSTGRES_DB || 'lsemb',
          user: process.env.POSTGRES_USER || 'postgres',
          password: '',
          ssl: false
        }
      };

      // Override defaults with values from database
      result.rows.forEach(row => {
        const [section, key] = row.key.split('.');
        if (!config[section]) config[section] = {};
        // Parse numeric values for database settings
        if (section === 'database' && key === 'port') {
          config[section][key] = parseInt(row.value) || 5432;
        } else if (section === 'database' && key === 'ssl') {
          config[section][key] = row.value === 'true' || row.value === true;
        } else {
          config[section][key] = row.value;
        }
      });

      return res.json(config);
    }

    // Category-specific optimized queries
    const categoryQueries = {
      llm: `SELECT key, value FROM settings
             WHERE key LIKE 'openai.%' OR key LIKE 'google.%' OR key LIKE 'anthropic.%'
                OR key LIKE 'deepseek.%' OR key LIKE 'llmSettings.%'
                OR key LIKE 'ollama.%' OR key LIKE 'huggingface.%' OR key LIKE 'openrouter.%'
                OR key LIKE 'voyage.%' OR key LIKE 'cohere.%' OR key LIKE 'jina.%'
                OR key LIKE 'apiStatus.%' OR key LIKE 'llmStatus.%'
                OR key LIKE 'ocrSettings.%' OR key LIKE 'ocrProvider%'`,

      embeddings: `SELECT key, value FROM settings
                  WHERE key LIKE 'embeddings.%' OR key LIKE 'embedding.%'`,

      rag: `SELECT key, value FROM settings
           WHERE key LIKE 'ragSettings.%' OR key LIKE 'rag.%'`,

      prompts: `SELECT key, value FROM settings
               WHERE key LIKE 'prompts.%'`,

      chatbot: `SELECT key, value FROM settings
               WHERE key LIKE 'chatbot.%'`,

      database: `SELECT key, value FROM settings
                WHERE key LIKE 'database.%'`,

      redis: `SELECT key, value FROM settings
              WHERE key LIKE 'redis.%'`,

      n8n: `SELECT key, value FROM settings
           WHERE key LIKE 'n8n.%'`,

      security: `SELECT key, value FROM settings
                WHERE key LIKE 'security.%' OR key LIKE 'jwt.%'`,

      app: `SELECT key, value FROM settings
           WHERE key LIKE 'app.%'`,

      scraper: `SELECT key, value FROM settings
               WHERE key LIKE 'scraper.%'`,

      translation: `SELECT key, value FROM settings
                   WHERE key LIKE 'deepl.%' OR key LIKE 'google.translate.%'`,

      ocr: `SELECT key, value FROM settings
           WHERE key LIKE 'ocr.%' OR key LIKE 'ocrSettings.%'`,

      prompts: `SELECT key, value FROM settings
               WHERE key LIKE 'prompts.%'`,

      chatbot: `SELECT key, value FROM settings
               WHERE key LIKE 'chatbot.%'`,

      redis: `SELECT key, value FROM settings
              WHERE key LIKE 'redis.%'`,

      relationships: `SELECT key, value FROM settings
                     WHERE key LIKE 'relationships.%'`
    };

    const query = categoryQueries[category as string];
    if (!query) {
      return res.json({});
    }

    const result = await lsembPool.query(query);
    console.log(` [OPTIMIZED] Found ${result.rows.length} settings for category: ${category}`);

    // DEBUG: Log raw database results for troubleshooting
    if (category === 'llm' || category === 'rag') {
      console.log(` [SETTINGS DEBUG] Raw DB results for ${category}:`,
        result.rows.slice(0, 10).map(r => `${r.key}=${r.value}`).join(', ')
      );
    }

    // DEBUG: Log minResults/maxResults specifically for RAG
    if (category === 'rag') {
      const minResultsRow = result.rows.find(r => r.key === 'ragSettings.minResults');
      const maxResultsRow = result.rows.find(r => r.key === 'ragSettings.maxResults');
      console.log(`📊 [RAG_SETTINGS] minResults=${minResultsRow?.value || 'NOT_FOUND'}, maxResults=${maxResultsRow?.value || 'NOT_FOUND'}`);
    }

    // Build category-specific response
    const config: any = {};

    result.rows.forEach(row => {
      const [section, ...keyParts] = row.key.split('.');
      const key = keyParts.join('.');

      if (!config[section]) {
        config[section] = {};
      }

      // Parse value
      try {
        config[section][key] = JSON.parse(row.value);
      } catch {
        config[section][key] = row.value;
      }
    });

    // NO hardcoded defaults - only return what's in database
    // User must configure settings in Settings UI

    // Build apiStatus object for LLM category (includes translation providers)
    if (category === 'llm') {
      const apiStatus: any = {};
      const providers = ['openai', 'google', 'anthropic', 'deepseek', 'huggingface', 'openrouter', 'deepl', 'voyage', 'cohere'];

      providers.forEach(provider => {
        // IMPORTANT: Check both provider config AND apiStatus for validation data
        const providerConfig = config[provider];
        const providerApiStatus = config.apiStatus?.[provider];

        // DEBUG: Log DeepL specifically
        if (provider === 'deepl' && process.env.DEBUG_SETTINGS === 'true') {
          console.log(' [DeepL Debug]', {
            hasProviderConfig: !!providerConfig,
            hasApiStatus: !!providerApiStatus,
            verifiedDate: providerConfig?.verifiedDate || providerApiStatus?.verifiedDate,
            status: providerConfig?.status || providerApiStatus?.status,
            apiKey: providerConfig?.apiKey ? 'EXISTS' : 'MISSING'
          });
        }

        if (providerConfig || providerApiStatus) {
          // Check if provider has validation data (either in provider config or apiStatus)
          const verifiedDate = providerConfig?.verifiedDate || providerApiStatus?.verifiedDate;
          const status = providerConfig?.status || providerApiStatus?.status || 'active';

          if (verifiedDate) {
            // Provider has been validated
            apiStatus[provider] = {
              status: status,
              message: providerApiStatus?.message || `${provider} API validated successfully`,
              lastChecked: providerApiStatus?.lastChecked || verifiedDate,
              verifiedDate: verifiedDate,
              responseTime: providerConfig?.avgResponseTime || providerApiStatus?.responseTime || 0
            };

            // DEBUG: Log successful validation
            if (provider === 'deepl') {
              console.log(' [DeepL] Validated status created:', apiStatus[provider]);
            }
          } else if (providerConfig?.apiKey) {
            // Provider has API key but not validated
            apiStatus[provider] = {
              status: 'inactive',
              message: 'API key not validated',
              lastChecked: null,
              verifiedDate: null
            };

            // DEBUG: Log inactive status
            if (provider === 'deepl') {
              console.log('️ [DeepL] Inactive status created (has API key but not validated)');
            }
          }
        } else {
          // DEBUG: Log when provider is skipped
          if (provider === 'deepl') {
            console.log(' [DeepL] Skipped - no config and no apiStatus');
          }
        }
      });

      config.apiStatus = apiStatus;

      // IMPORTANT: Do NOT query embeddings.* or embedding_* keys!
      // Only use llmSettings.* keys which are authoritative source
      // llmSettings.activeEmbeddingModel is already fetched in main query above

      // Construct activeEmbeddingModel from provider and model ONLY if it doesn't exist
      if (!config.llmSettings?.activeEmbeddingModel && config.llmSettings?.embeddingProvider && config.llmSettings?.embeddingModel) {
        config.llmSettings.activeEmbeddingModel = `${config.llmSettings.embeddingProvider}/${config.llmSettings.embeddingModel}`;
        console.log('️ [Settings] Constructed activeEmbeddingModel from separate fields:', config.llmSettings.activeEmbeddingModel);
      }

      // IMPORTANT: Ensure activeChatModel is in llmSettings
      // Query already fetches llmSettings.activeChatModel, just need to ensure it's in the right place
      if (!config.llmSettings) {
        config.llmSettings = {};
      }

      // If activeChatModel is in result but not in llmSettings, copy it
      result.rows.forEach(row => {
        if (row.key === 'llmSettings.activeChatModel') {
          config.llmSettings.activeChatModel = row.value;
        }
        if (row.key === 'llmSettings.activeEmbeddingModel') {
          config.llmSettings.activeEmbeddingModel = row.value;
        }
      });

      // Parse activeEmbeddingModel to get provider and model
      if (config.llmSettings?.activeEmbeddingModel) {
        const parts = config.llmSettings.activeEmbeddingModel.split('/');
        if (parts.length === 2) {
          config.llmSettings.embeddingProvider = parts[0];
          config.llmSettings.embeddingModel = parts[1];
        }
      }

      // CRITICAL: NO dynamic defaults - return what's in database OR use environment variables
      // Frontend/User MUST configure the model in Settings UI
      if (!config.llmSettings?.activeChatModel) {
        // NOTE: Claude 3.5 Sonnet was RETIRED by Anthropic on October 28, 2025 - use Claude Sonnet 4.5
        const envModel = process.env.LLM_MODEL || 'anthropic/claude-sonnet-4-5-20250929';
        console.warn('️ [Settings] No activeChatModel found in database, using environment variable:', envModel);
        config.llmSettings = config.llmSettings || {};
        config.llmSettings.activeChatModel = envModel;
      }

      if (!config.llmSettings?.activeEmbeddingModel) {
        // CORRECT: Use proper embedding model as fallback (NOT chat model!)
        const envEmbed = process.env.EMBEDDING_MODEL || 'openai/text-embedding-3-small';
        console.warn('️ [Settings] No activeEmbeddingModel found in database, using environment variable:', envEmbed);
        config.llmSettings = config.llmSettings || {};
        config.llmSettings.activeEmbeddingModel = envEmbed;
      }

      // Log active models
      console.log(` [Settings API Response] Category: ${category}`);
      console.log(`  ├─ Chat Model: ${config.llmSettings?.activeChatModel || 'NOT SET'}`);
      console.log(`  ├─ Embedding: ${config.llmSettings?.activeEmbeddingModel || 'NOT SET'}`);
      console.log(`  ├─ Embedding Provider: ${config.llmSettings?.embeddingProvider || 'NOT SET'}`);
      console.log(`  └─ Embedding Model: ${config.llmSettings?.embeddingModel || 'NOT SET'}`);
    }

    res.json(config);

  } catch (error) {
    console.error('Error fetching optimized settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * @swagger
 * /settings:
 *   post:
 *     summary: Update application settings
 *     description: Update one or more settings (key-value pairs)
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *             example:
 *               "llmSettings.activeChatModel": "anthropic/claude-3-5-sonnet"
 *               "llmSettings.temperature": 0.7
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Settings updated successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Optimized settings update with validation and cache invalidation
router.post('/', async (req: Request, res: Response) => {
  try {
    const settings = req.body;
    const updates = [];

    // Validate and prepare updates
    for (const [key, value] of Object.entries(settings)) {
      // Basic validation
      if (key.includes('temperature') && (typeof value !== 'number' || value < 0 || value > 2)) {
        return res.status(400).json({ error: `Invalid temperature value: ${value}. Must be between 0 and 2.` });
      }

      if (key.includes('chunkSize') && (typeof value !== 'number' || value < 100 || value > 5000)) {
        return res.status(400).json({ error: `Invalid chunkSize value: ${value}. Must be between 100 and 5000.` });
      }

      if (key.includes('similarityThreshold') && (typeof value !== 'number' || value < 0 || value > 1)) {
        return res.status(400).json({ error: `Invalid similarityThreshold value: ${value}. Must be between 0 and 1.` });
      }

      // CRITICAL VALIDATION: Prevent chat models from being saved as embedding models
      if ((key === 'llmSettings.activeEmbeddingModel' || key === 'llmSettings.embeddingModel') && typeof value === 'string') {
        const chatModelPatterns = ['gpt-4o', 'gpt-4', 'gpt-3.5', 'claude', 'gemini'];
        const isLikelyChatModel = chatModelPatterns.some(pattern =>
          value.toLowerCase().includes(pattern)
        ) && !value.toLowerCase().includes('embedding');

        if (isLikelyChatModel) {
          return res.status(400).json({
            error: `Invalid embedding model: "${value}" is a chat model, not an embedding model. Please use a model that includes "embedding" in its name (e.g., text-embedding-3-small, text-embedding-004).`
          });
        }
      }

      updates.push({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value)
      });
    }

    // Batch update - determine category from key prefix
    for (const update of updates) {
      // Extract category from key (e.g., "llmSettings.temperature" -> "llm")
      const keyPrefix = update.key.split('.')[0];
      const categoryMap: { [key: string]: string } = {
        'llmSettings': 'llm',
        'openai': 'llm',
        'anthropic': 'llm',
        'google': 'llm',
        'deepseek': 'llm',
        'voyage': 'llm',
        'cohere': 'llm',
        'huggingface': 'llm',
        'openrouter': 'llm',
        'embedding': 'embeddings',
        'ragSettings': 'rag',
        'embeddings': 'embeddings',
        'prompts': 'prompts',
        'chatbot': 'chatbot',
        'database': 'database',
        'redis': 'redis',
        'app': 'app'
      };
      const category = categoryMap[keyPrefix] || 'general';

      await lsembPool.query(
        `INSERT INTO settings (key, value, category)
         VALUES ($1, $2, $3)
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [update.key, update.value, category]
      );
    }

    // Clear cache intelligently
    const cleared = settingsCache.clearPattern('settings');
    console.log(`️ [CACHE] Cleared ${cleared} entries`);

    // CRITICAL: Reload LLM Manager settings to pick up changes immediately
    const llmManager = (await import('../services/llm-manager.service')).LLMManager.getInstance();
    await llmManager.reloadSettings();
    console.log(' [LLM Manager] Settings reloaded after update');

    // CRITICAL: Reload Semantic Search settings for RAG changes
    const hasRAGSettings = updates.some(u => u.key.startsWith('ragSettings.'));
    if (hasRAGSettings) {
      const { semanticSearch } = await import('../services/semantic-search.service');
      await semanticSearch.refreshRAGSettingsNow();
      console.log(' [Semantic Search] RAG settings reloaded after update');
    }

    res.json({ success: true, message: 'Settings updated successfully' });

  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Health check for settings service
router.get('/health', (req: Request, res: Response) => {
  const stats = settingsCache.getStats();
  res.json({
    status: 'healthy',
    cache: stats,
    timestamp: new Date().toISOString()
  });
});

// Specific category routes for direct access
router.get('/category/:categoryName', cacheMiddleware, async (req: Request, res: Response) => {
  try {
    const { categoryName } = req.params;

    // Map category names to query patterns
    const categoryQueries = {
      llm: `SELECT key, value FROM settings
             WHERE key LIKE 'openai.%' OR key LIKE 'google.%' OR key LIKE 'anthropic.%'
                OR key LIKE 'deepseek.%' OR key LIKE 'llmSettings.%'
                OR key LIKE 'ollama.%' OR key LIKE 'huggingface.%' OR key LIKE 'openrouter.%'
                OR key LIKE 'voyage.%' OR key LIKE 'cohere.%' OR key LIKE 'jina.%'
                OR key LIKE 'apiStatus.%' OR key LIKE 'llmStatus.%'
                OR key LIKE 'ocrSettings.%' OR key LIKE 'ocrProvider%'`,

      embeddings: `SELECT key, value FROM settings
                  WHERE key LIKE 'embeddings.%' OR key LIKE 'embedding.%'`,

      rag: `SELECT key, value FROM settings
           WHERE key LIKE 'ragSettings.%' OR key LIKE 'rag.%'`,

      database: `SELECT key, value FROM settings
                WHERE key LIKE 'database.%'`,

      security: `SELECT key, value FROM settings
                WHERE key LIKE 'security.%' OR key LIKE 'jwt.%'`,

      app: `SELECT key, value FROM settings
           WHERE key LIKE 'app.%'`,

      scraper: `SELECT key, value FROM settings
               WHERE key LIKE 'scraper.%'`,

      translation: `SELECT key, value FROM settings
                   WHERE key LIKE 'deepl.%' OR key LIKE 'google.translate.%'`,

      ocr: `SELECT key, value FROM settings
           WHERE key LIKE 'ocr.%' OR key LIKE 'ocrSettings.%'`,

      prompts: `SELECT key, value FROM settings
               WHERE key LIKE 'prompts.%'`,

      chatbot: `SELECT key, value FROM settings
               WHERE key LIKE 'chatbot.%'`,

      redis: `SELECT key, value FROM settings
              WHERE key LIKE 'redis.%'`
    };

    const query = categoryQueries[categoryName as keyof typeof categoryQueries];
    if (!query) {
      return res.status(404).json({ error: `Category '${categoryName}' not found` });
    }

    const result = await lsembPool.query(query);
    console.log(` [CATEGORY] Found ${result.rows.length} settings for category: ${categoryName}`);

    // Build category-specific response
    const config: any = {};

    result.rows.forEach(row => {
      const [section, ...keyParts] = row.key.split('.');
      const key = keyParts.join('.');

      if (!config[section]) {
        config[section] = {};
      }

      // Parse value
      try {
        config[section][key] = JSON.parse(row.value);
      } catch {
        config[section][key] = row.value;
      }
    });

    // Add essential defaults if missing (but no API keys from env)
    if (categoryName === 'llm' && !config.openai) {
      config.openai = {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4096,
        apiKey: ''  // Must be set in UI/database
      };
    }

    if (categoryName === 'embeddings' && !config.embeddings) {
      config.embeddings = {
        chunkSize: 1000,
        chunkOverlap: 200,
        batchSize: 10,
        provider: 'openai',
        model: 'text-embedding-ada-002',
        normalizeEmbeddings: true,
        cacheEmbeddings: true,
        enabled: true,
        useLocal: false,
        dimension: 1536,
        maxTokens: 8191
      };
    }

    if (categoryName === 'database' && !config.database) {
      config.database = {
        host: 'localhost',
        port: 5432,
        name: 'lsemb',
        user: 'postgres',
        password: '',
        ssl: false,
        maxConnections: 20
      };
    }

    res.json(config);

  } catch (error) {
    console.error(`Error fetching ${req.params.categoryName} settings:`, error);
    res.status(500).json({ error: `Failed to fetch ${req.params.categoryName} settings` });
  }
});

// Update specific category - direct PUT route
router.put('/:categoryName', async (req: Request, res: Response) => {
  try {
    const { categoryName } = req.params;
    const settings = req.body;

    // Validate category name
    const validCategories = ['llm', 'embeddings', 'rag', 'database', 'security', 'app', 'scraper', 'translation', 'prompts', 'chatbot', 'redis', 'ocr', 'advanced', 'storage', 'crawler', 'smtp', 'integrations', 'relationships'];
    if (!validCategories.includes(categoryName)) {
      return res.status(400).json({ error: `Invalid category: ${categoryName}` });
    }

    const updates = [];

    // Validate and prepare updates - flatten nested objects
    function flattenObject(obj: any, prefix = '') {
      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          flattenObject(value, fullKey);
        } else {
          const updateValue = typeof value === 'string' ? value : JSON.stringify(value);
          updates.push({
            key: fullKey,
            value: updateValue
          });
        }
      }
    }

    flattenObject(settings);

    // Log RAG settings updates for debugging
    if (categoryName === 'rag') {
      const hybridSetting = updates.find(u => u.key === 'ragSettings.enableHybridSearch');
      if (hybridSetting) {
        console.log('[Settings] RAG enableHybridSearch:', hybridSetting.value);
      }
      // DEBUG: Log minResults/maxResults updates
      const minResultsSetting = updates.find(u => u.key === 'ragSettings.minResults');
      const maxResultsSetting = updates.find(u => u.key === 'ragSettings.maxResults');
      console.log(`📊 [RAG_SETTINGS_SAVE] minResults=${minResultsSetting?.value || 'NOT_IN_UPDATE'}, maxResults=${maxResultsSetting?.value || 'NOT_IN_UPDATE'}`);
    }

    // Batch update
    for (const update of updates) {
      await lsembPool.query(
        `INSERT INTO settings (key, value, category)
         VALUES ($1, $2, $3)
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [update.key, update.value, categoryName]
      );
    }

    // Clear cache
    settingsCache.clearPattern('settings');

    // Reload LLM Manager if llm settings were updated
    if (categoryName === 'llm') {
      const { default: LLMManager } = await import('../services/llm-manager.service');
      const llmManager = LLMManager.getInstance();
      await llmManager.reloadSettings();
      console.log(` [Settings] LLM Manager reloaded`);
    }

    // CRITICAL: Reload Semantic Search settings for RAG changes
    if (categoryName === 'rag') {
      const { semanticSearch } = await import('../services/semantic-search.service');
      await semanticSearch.refreshRAGSettingsNow();
      console.log(` [Settings] Semantic Search RAG settings reloaded`);
    }

    console.log(` [Settings] ${categoryName}: ${updates.length} keys updated`);

    res.json({
      success: true,
      message: `${categoryName} settings updated successfully`,
      updatedKeys: updates.length
    });

  } catch (error) {
    console.error(` [SETTINGS UPDATE] Error updating ${req.params.categoryName} settings:`, error);
    res.status(500).json({ error: `Failed to update ${req.params.categoryName} settings` });
  }
});

// Update specific category - legacy route
router.put('/category/:categoryName', async (req: Request, res: Response) => {
  try {
    const { categoryName } = req.params;
    const settings = req.body;

    // Validate category name
    const validCategories = ['llm', 'embeddings', 'rag', 'database', 'security', 'app', 'scraper', 'translation', 'ocr', 'advanced', 'storage', 'crawler', 'smtp', 'integrations', 'relationships'];
    if (!validCategories.includes(categoryName)) {
      return res.status(400).json({ error: `Invalid category: ${categoryName}` });
    }

    const updates = [];

    // Validate and prepare updates
    for (const [key, value] of Object.entries(settings)) {
      // Flatten nested objects for storage
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const [subKey, subValue] of Object.entries(value)) {
          const fullKey = `${key}.${subKey}`;
          updates.push({
            key: fullKey,
            value: typeof subValue === 'string' ? subValue : JSON.stringify(subValue)
          });
        }
      } else {
        updates.push({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value)
        });
      }
    }

    // Batch update
    for (const update of updates) {
      await lsembPool.query(
        `INSERT INTO settings (key, value, category)
         VALUES ($1, $2, $3)
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [update.key, update.value, categoryName]
      );
    }

    // Clear cache
    const cleared = settingsCache.clearPattern('settings');
    console.log(`️ [CACHE] Cleared ${cleared} entries for category ${categoryName}`);

    res.json({
      success: true,
      message: `${categoryName} settings updated successfully`,
      updatedKeys: updates.length
    });

  } catch (error) {
    console.error(`Error updating ${req.params.categoryName} settings:`, error);
    res.status(500).json({ error: `Failed to update ${req.params.categoryName} settings` });
  }
});

// Get active template
router.get('/active-template', async (req: Request, res: Response) => {
  try {
    const result = await lsembPool.query(
      `SELECT value FROM settings WHERE key = 'template.active'`
    );
    const active = result.rows.length > 0 ? result.rows[0].value : 'base';
    console.log('🔍 [TEMPLATE] GET active-template:', { found: result.rows.length > 0, active });
    res.json({ active });
  } catch (error) {
    console.error('🔍 [TEMPLATE] Error fetching active template:', error);
    res.json({ active: 'base' }); // Return default on error
  }
});

// Set active template
router.post('/set-active-template', async (req: Request, res: Response) => {
  try {
    const { templateId } = req.body;
    console.log('🔍 [TEMPLATE] SET active-template:', { templateId });
    await lsembPool.query(
      `INSERT INTO settings (key, value, category, description, updated_at)
       VALUES ('template.active', $1, 'app', 'Active document template', CURRENT_TIMESTAMP)
       ON CONFLICT (key)
       DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [templateId]
    );
    console.log('🔍 [TEMPLATE] Template saved successfully:', templateId);
    res.json({ success: true, active: templateId });
  } catch (error) {
    console.error('🔍 [TEMPLATE] Error setting active template:', error);
    res.status(500).json({ error: 'Failed to set active template' });
  }
});

// =============================================
// SEMANTIC ANALYZER CONFIG SYNC ENDPOINTS
// =============================================

import { settingsService } from '../services/settings.service';

/**
 * @swagger
 * /settings/semantic-analyzer/sync:
 *   post:
 *     summary: Sync semantic analyzer config from DB to Redis
 *     description: Loads semantic analyzer settings from database and writes to Redis for Python service
 *     tags: [Settings, SemanticAnalyzer]
 *     responses:
 *       200:
 *         description: Config synced successfully
 *       500:
 *         description: Sync failed
 */
router.post('/semantic-analyzer/sync', async (req: Request, res: Response) => {
  try {
    console.log('🔄 [SEMANTIC] Syncing semantic analyzer config to Redis...');
    const result = await settingsService.syncSemanticAnalyzerConfig();

    if (result.success) {
      console.log('✅ [SEMANTIC] Config synced successfully');
      res.json({
        success: true,
        message: 'Semantic analyzer config synced to Redis',
        keys: result.config ? Object.keys(result.config).length : 0
      });
    } else {
      console.warn('⚠️ [SEMANTIC] Sync failed:', result.error);
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error: any) {
    console.error('❌ [SEMANTIC] Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /settings/semantic-analyzer/config:
 *   get:
 *     summary: Get current semantic analyzer config from Redis
 *     description: Returns the current semantic analyzer configuration cached in Redis
 *     tags: [Settings, SemanticAnalyzer]
 *     responses:
 *       200:
 *         description: Config retrieved successfully
 *       404:
 *         description: No config found in Redis
 */
router.get('/semantic-analyzer/config', async (req: Request, res: Response) => {
  try {
    const config = await settingsService.getSemanticAnalyzerConfig();

    if (config) {
      res.json({
        success: true,
        config,
        syncedAt: config._synced_at
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No semantic analyzer config found in Redis. Run POST /settings/semantic-analyzer/sync first.'
      });
    }
  } catch (error: any) {
    console.error('❌ [SEMANTIC] Get config error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /settings/semantic-analyzer/{key}:
 *   put:
 *     summary: Update a specific semantic analyzer setting
 *     description: Updates a setting in DB and re-syncs to Redis
 *     tags: [Settings, SemanticAnalyzer]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Setting key (e.g., verdictPatterns, failMessages)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               value:
 *                 description: New value for the setting
 *     responses:
 *       200:
 *         description: Setting updated successfully
 *       500:
 *         description: Update failed
 */
router.put('/semantic-analyzer/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    console.log(`🔄 [SEMANTIC] Updating setting: ${key}`);
    const result = await settingsService.updateSemanticAnalyzerSetting(key, value);

    if (result.success) {
      console.log(`✅ [SEMANTIC] Setting ${key} updated and synced`);
      res.json({ success: true, key });
    } else {
      console.warn(`⚠️ [SEMANTIC] Update failed:`, result.error);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    console.error('❌ [SEMANTIC] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RAG ROUTING SCHEMA ENDPOINTS
// ============================================

/**
 * GET /settings/key/:key - Get a specific setting by key
 */
router.get('/key/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const result = await lsembPool.query(
      'SELECT key, value, category, description FROM settings WHERE key = $1',
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found', key });
    }

    const row = result.rows[0];
    let value = row.value;

    // Try to parse JSON value
    try {
      value = JSON.parse(value);
    } catch {
      // Keep as string if not valid JSON
    }

    res.json({
      key: row.key,
      value,
      category: row.category,
      description: row.description
    });
  } catch (error: any) {
    console.error('❌ [SETTINGS] Get key error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /settings/key/:key - Update a specific setting by key
 */
router.put('/key/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value, category, description } = req.body;

    // Stringify value if it's an object
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

    await lsembPool.query(
      `INSERT INTO settings (key, value, category, description, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (key) DO UPDATE SET
         value = $2,
         category = COALESCE($3, settings.category),
         description = COALESCE($4, settings.description),
         updated_at = NOW()`,
      [key, valueStr, category || null, description || null]
    );

    // Clear cache
    settingsCache.clear();

    console.log(`✅ [SETTINGS] Key ${key} saved`);
    res.json({ success: true, key });
  } catch (error: any) {
    console.error('❌ [SETTINGS] Put key error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /settings/rag-routing-schema/default - Get default RAG routing schema
 */
router.get('/rag-routing-schema/default', async (_req: Request, res: Response) => {
  try {
    // Import default schema from config
    const { DEFAULT_RAG_ROUTING_SCHEMA } = await import('../config/rag-routing-schema.config');
    res.json({ schema: DEFAULT_RAG_ROUTING_SCHEMA });
  } catch (error: any) {
    console.error('❌ [SETTINGS] Get default routing schema error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SMTP / EMAIL ENDPOINTS
// ═══════════════════════════════════════════════════════════════

/**
 * GET /settings/smtp/status - Get SMTP configuration status
 */
router.get('/smtp/status', async (_req: Request, res: Response) => {
  try {
    const { emailService } = await import('../services/email.service');
    const status = emailService.getStatus();
    res.json(status);
  } catch (error: any) {
    console.error('❌ [SMTP] Status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /settings/smtp/verify - Verify SMTP connection
 */
router.post('/smtp/verify', async (_req: Request, res: Response) => {
  try {
    const { emailService } = await import('../services/email.service');
    emailService.reset(); // Reset to pick up latest config
    const result = await emailService.verify();
    res.json(result);
  } catch (error: any) {
    console.error('❌ [SMTP] Verify error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /settings/smtp/test - Send test email
 */
router.post('/smtp/test', async (req: Request, res: Response) => {
  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, error: 'Email address required' });
    }

    const { emailService } = await import('../services/email.service');
    emailService.reset(); // Reset to pick up latest config
    const result = await emailService.sendTest(to);

    if (result.success) {
      console.log(`✅ [SMTP] Test email sent to ${to}`);
    } else {
      console.error(`❌ [SMTP] Test email failed: ${result.error}`);
    }

    res.json(result);
  } catch (error: any) {
    console.error('❌ [SMTP] Test error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
