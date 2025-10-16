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
                OR key LIKE 'deepseek.%' OR key LIKE 'llmSettings.%'`,

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
               WHERE key LIKE 'scraper.%'`
    };

    const query = categoryQueries[category as string];
    if (!query) {
      return res.json({});
    }

    const result = await lsembPool.query(query);
    console.log(`🔧 [SETTINGS] Found ${result.rows.length} settings for category: ${category}`);

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
        return res.status(400).json({ error: `Invalid temperature value: ${value}` });
      }

      if (key.includes('chunkSize') && (typeof value !== 'number' || value < 100 || value > 5000)) {
        return res.status(400).json({ error: `Invalid chunkSize value: ${value}` });
      }

      if (key.includes('similarityThreshold') && (typeof value !== 'number' || value < 0 || value > 1)) {
        return res.status(400).json({ error: `Invalid similarityThreshold value: ${value}` });
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

export default router;