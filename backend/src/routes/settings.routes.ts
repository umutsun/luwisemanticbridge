// OPTIMIZED SETTINGS ROUTES
// Implements high-performance caching, category filtering, and validation

import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { settingsCache } from '../services/cache.service';

const router = Router();

// Cache middleware with performance tracking
function cacheMiddleware(req: Request, res: Response, next: any) {
  const startTime = Date.now();
  const key = `settings:${req.originalUrl}`;
  const cached = settingsCache.get(key);

  if (cached !== null) {
    const duration = Date.now() - startTime;
    console.log(`📦 [CACHE] Hit for ${key} (${duration}ms)`);
    return res.json(cached);
  }

  console.log(`🌐 [API] Miss for ${key}`);

  // Override res.json to cache response
  const originalJson = res.json;
  res.json = function(data) {
    const duration = Date.now() - startTime;
    console.log(`⚡ [API] Response in ${duration}ms, caching...`);

    // Cache with 30s TTL
    settingsCache.set(key, data, 30000);

    return originalJson.call(this, data);
  };

  next();
}

// Optimized category getter - returns ONLY the requested category
router.get('/', cacheMiddleware, async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    if (!category) {
      // Return minimal full config if no category
      const result = await lsembPool.query(
        'SELECT key, value FROM settings WHERE key IN ($1, $2, $3)',
        ['app.name', 'app.version', 'app.locale']
      );

      const config = {
        app: {
          name: 'Mali Müşavir Asistanı',
          version: '1.0.0',
          locale: 'tr'
        }
      };

      result.rows.forEach(row => {
        const [section, key] = row.key.split('.');
        if (!config[section]) config[section] = {};
        config[section][key] = row.value;
      });

      return res.json(config);
    }

    // Category-specific optimized queries
    const categoryQueries = {
      llm: `SELECT key, value FROM settings
             WHERE key LIKE 'openai.%' OR key LIKE 'google.%' OR key LIKE 'anthropic.%'
                OR key LIKE 'deepseek.%' OR key LIKE 'llmSettings.%'
                OR key LIKE 'ollama.%' OR key LIKE 'huggingface.%' OR key LIKE 'openrouter.%'
                OR key LIKE 'apiStatus.%'`,

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

      security: `SELECT key, value FROM settings
                WHERE key LIKE 'security.%' OR key LIKE 'jwt.%'`,

      app: `SELECT key, value FROM settings
           WHERE key LIKE 'app.%'`,

      scraper: `SELECT key, value FROM settings
               WHERE key LIKE 'scraper.%'`,

      translation: `SELECT key, value FROM settings
                   WHERE key LIKE 'deepl.%' OR key LIKE 'google.translate.%'`,

      prompts: `SELECT key, value FROM settings
               WHERE key LIKE 'prompts.%'`,

      chatbot: `SELECT key, value FROM settings
               WHERE key LIKE 'chatbot.%'`,

      redis: `SELECT key, value FROM settings
              WHERE key LIKE 'redis.%'`
    };

    const query = categoryQueries[category as string];
    if (!query) {
      return res.json({});
    }

    const result = await lsembPool.query(query);
    console.log(`🔧 [OPTIMIZED] Found ${result.rows.length} settings for category: ${category}`);

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

    // Add only essential defaults if missing
    if (category === 'llm' && !config.openai) {
      config.openai = {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4096
      };
    }

    // Build apiStatus object for LLM category
    if (category === 'llm') {
      const apiStatus: any = {};
      const providers = ['openai', 'google', 'anthropic', 'deepseek', 'huggingface', 'openrouter'];

      providers.forEach(provider => {
        if (config[provider]) {
          // Check if provider has validation data
          if (config[provider].verifiedDate) {
            // Provider has been validated
            const status = config[provider].status || 'active';
            apiStatus[provider] = {
              status: status,
              message: `${provider} API validated successfully`,
              lastChecked: config[provider].verifiedDate,
              verifiedDate: config[provider].verifiedDate,
              responseTime: config[provider].avgResponseTime || 0
            };
          } else if (config[provider].apiKey) {
            // Provider has API key but not validated
            apiStatus[provider] = {
              status: 'inactive',
              message: 'API key not validated',
              lastChecked: null,
              verifiedDate: null
            };
          }
        }
      });

      config.apiStatus = apiStatus;
    }

    res.json(config);

  } catch (error) {
    console.error('Error fetching optimized settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

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

      updates.push({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value)
      });
    }

    // Batch update
    for (const update of updates) {
      await lsembPool.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [update.key, update.value]
      );
    }

    // Clear cache intelligently
    const cleared = settingsCache.clearPattern('settings');
    console.log(`🗑️ [CACHE] Cleared ${cleared} entries`);

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
                OR key LIKE 'ollama.%' OR key LIKE 'huggingface.%'`,

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
    console.log(`🔧 [CATEGORY] Found ${result.rows.length} settings for category: ${categoryName}`);

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
    const validCategories = ['llm', 'embeddings', 'rag', 'database', 'security', 'app', 'scraper', 'translation', 'prompts', 'chatbot', 'redis'];
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
          updates.push({
            key: fullKey,
            value: typeof value === 'string' ? value : JSON.stringify(value)
          });
        }
      }
    }

    flattenObject(settings);

    // Batch update
    for (const update of updates) {
      await lsembPool.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [update.key, update.value]
      );
    }

    // Clear cache
    const cleared = settingsCache.clearPattern('settings');
    console.log(`🗑️ [CACHE] Cleared ${cleared} entries for category ${categoryName}`);
    console.log(`💾 [DB] Updated ${updates.length} settings for category ${categoryName}:`, updates.map(u => u.key));

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

// Update specific category - legacy route
router.put('/category/:categoryName', async (req: Request, res: Response) => {
  try {
    const { categoryName } = req.params;
    const settings = req.body;

    // Validate category name
    const validCategories = ['llm', 'embeddings', 'rag', 'database', 'security', 'app', 'scraper', 'translation'];
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
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key)
         DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
        [update.key, update.value]
      );
    }

    // Clear cache
    const cleared = settingsCache.clearPattern('settings');
    console.log(`🗑️ [CACHE] Cleared ${cleared} entries for category ${categoryName}`);

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

export default router;