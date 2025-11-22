import { Router, Request, Response } from 'express';
import { SettingsService } from '../services/settings.service';
import { lsembPool } from '../config/database.config';
import { logger } from '../utils/logger';

const router = Router();
const settingsService = SettingsService.getInstance();

/**
 * @swagger
 * /rag/config:
 *   get:
 *     summary: Get RAG configuration
 *     tags: [RAG]
 *     responses:
 *       200:
 *         description: RAG configuration
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    // Get LLM providers config which includes RAG settings
    const config = await settingsService.getLLMProviders();

    // Extract relevant RAG settings
    const ragConfig = {
      aiProvider: config.llmSettings?.activeChatModel?.split('/')[0] || 'openai',
      fallbackEnabled: config.llmSettings?.fallback_enabled || false,
      ...config.llmSettings
    };

    res.json(ragConfig);
  } catch (error) {
    logger.error('Error fetching RAG config:', error);
    res.status(500).json({ error: 'Failed to fetch RAG configuration' });
  }
});

/**
 * @swagger
 * /rag/prompts:
 *   get:
 *     summary: Get RAG prompts
 *     tags: [RAG]
 *     responses:
 *       200:
 *         description: RAG prompts
 */
router.get('/prompts', async (req: Request, res: Response) => {
  try {
    const client = await lsembPool.connect();
    try {
      const result = await client.query(`
        SELECT key, value FROM settings
        WHERE key LIKE 'prompts.%'
      `);

      const prompts: Record<string, any> = {};
      for (const row of result.rows) {
        const key = row.key.replace('prompts.', '');
        prompts[key] = row.value;
      }
      res.json(prompts);
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Error fetching RAG prompts:', error);
    res.status(500).json({ error: 'Failed to fetch RAG prompts' });
  }
});

/**
 * @swagger
 * /rag/ai/settings:
 *   get:
 *     summary: Get AI settings (Legacy/Chatbot)
 *     tags: [RAG]
 *     responses:
 *       200:
 *         description: AI settings
 */
router.get('/ai/settings', async (req: Request, res: Response) => {
  try {
    const result = await lsembPool.query("SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key IN ('google_api_key', 'gemini_model', 'max_tokens')");

    const settings = result.rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});

    const AVAILABLE_GEMINI_MODELS = ['gemini-pro'];

    res.json({
      settings: {
        google_api_key: settings.google_api_key || '',
        gemini_model: 'gemini-pro',
        max_tokens: settings.max_tokens || 4096,
      },
      models: AVAILABLE_GEMINI_MODELS,
    });
  } catch (error) {
    logger.error('Error fetching AI settings:', error);
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

/**
 * @swagger
 * /rag/ai/settings:
 *   post:
 *     summary: Update AI settings (Legacy/Chatbot)
 *     tags: [RAG]
 *     responses:
 *       200:
 *         description: Success message
 */
router.post('/ai/settings', async (req: Request, res: Response) => {
  try {
    const { google_api_key, gemini_model, max_tokens } = req.body;

    const settings = {
      google_api_key,
      gemini_model,
      max_tokens,
    };

    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        await lsembPool.query(
          `INSERT INTO chatbot_settings (setting_key, setting_value, updated_at) 
           VALUES ($1, $2, CURRENT_TIMESTAMP) 
           ON CONFLICT (setting_key) 
           DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP`,
          [key, value]
        );
      }
    }

    res.json({ success: true, message: 'AI settings updated successfully' });
  } catch (error) {
    logger.error('Error updating AI settings:', error);
    res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

export default router;