import { Router, Request, Response } from 'express';
import pool from '../config/database';

const router = Router();

const AVAILABLE_GEMINI_MODELS = [
  'gemini-pro',
];

// Get AI settings
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key IN ('google_api_key', 'gemini_model', 'max_tokens')");
    
    const settings = result.rows.reduce((acc: any, row: any) => {
      acc[row.setting_key] = row.setting_value;
      return acc;
    }, {});

    res.json({
      settings: {
        google_api_key: settings.google_api_key || '',
        gemini_model: 'gemini-pro', // Always default to the correct model
        max_tokens: settings.max_tokens || 4096,
      },
      models: AVAILABLE_GEMINI_MODELS,
    });
  } catch (error) {
    console.error('Error fetching AI settings:', error);
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

// Update AI settings
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const { google_api_key, gemini_model, max_tokens } = req.body;

    const settings = {
      google_api_key,
      gemini_model,
      max_tokens,
    };

    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        await pool.query(
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
    console.error('Error updating AI settings:', error);
    res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

export default router;
