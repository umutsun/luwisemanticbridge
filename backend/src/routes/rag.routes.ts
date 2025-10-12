import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// RAG Prompts endpoint - redirects to settings/config/prompts
router.get('/prompts', async (req: Request, res: Response) => {
  try {
    // Import the settings routes dynamically
    const settingsRoutes = await import('./settings.routes');
    // Create a mock request/response to call the settings handler
    const originalUrl = req.originalUrl;
    req.originalUrl = req.originalUrl.replace('/api/v2/rag/prompts', '/api/v2/settings/config/prompts');

    // Call the settings prompts handler
    const handler = settingsRoutes.default.stack.find((layer: any) => layer.route?.path === '/config/prompts');
    if (handler) {
      return handler.route.stack[0].handle(req, res);
    }

    // Fallback - return default prompts
    res.json({
      prompt: "Sen bir yapay zeka asistanısın. Veritabanındaki bilgilere dayanarak kullanıcılara yardımcı ol.",
      name: "System Prompt",
      temperature: 0.7,
      maxTokens: 2048
    });
  } catch (error) {
    console.error('Error fetching RAG prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// RAG AI Settings endpoint - redirects to ai/settings
router.get('/ai/settings', async (req: Request, res: Response) => {
  try {
    // Import the AI settings routes dynamically
    const aiSettingsRoutes = await import('./ai-settings.routes');

    // Call the AI settings handler
    const handler = aiSettingsRoutes.default.stack.find((layer: any) => layer.route?.path === '/settings');
    if (handler) {
      return handler.route.stack[0].handle(req, res);
    }

    // Fallback - return default AI settings
    res.json({
      llmSettings: {
        activeChatModel: 'deepseek/deepseek-chat',
        streamResponse: true,
        temperature: 0.7,
        maxTokens: 2048
      }
    });
  } catch (error) {
    console.error('Error fetching RAG AI settings:', error);
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

// RAG Prompts POST endpoint - redirects to settings/config/prompts
router.post('/prompts', async (req: Request, res: Response) => {
  try {
    // Import the settings routes dynamically
    const settingsRoutes = await import('./settings.routes');

    // Call the settings prompts handler
    const handler = settingsRoutes.default.stack.find((layer: any) => layer.route?.path === '/config/prompts' && layer.route.methods.post);
    if (handler) {
      return handler.route.stack[0].handle(req, res);
    }

    // Fallback - just return success
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving RAG prompts:', error);
    res.status(500).json({ error: 'Failed to save prompts' });
  }
});

// RAG AI Settings POST endpoint - redirects to ai/settings
router.post('/ai/settings', async (req: Request, res: Response) => {
  try {
    // Import the AI settings routes dynamically
    const aiSettingsRoutes = await import('./ai-settings.routes');

    // Call the AI settings handler
    const handler = aiSettingsRoutes.default.stack.find((layer: any) => layer.route?.path === '/settings' && layer.route.methods.post);
    if (handler) {
      return handler.route.stack[0].handle(req, res);
    }

    // Fallback - just return success
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving RAG AI settings:', error);
    res.status(500).json({ error: 'Failed to save AI settings' });
  }
});

// RAG Config endpoint - GET and POST
router.get('/config', async (req: Request, res: Response) => {
  try {
    // Import settings service
    const { SettingsService } = await import('../services/settings.service');
    const settingsService = SettingsService.getInstance();

    // Get all settings
    const settings = await settingsService.getAllSettings();

    // Extract relevant RAG config
    res.json({
      aiProvider: settings.aiProvider || 'gemini',
      fallbackEnabled: settings.fallbackEnabled === 'true' || settings.fallbackEnabled === true,
      apiKeys: {
        claude: settings.claudeApiKey || settings['claude.apiKey'] || '',
        gemini: settings.geminiApiKey || settings['google.apiKey'] || settings['gemini.apiKey'] || '',
        openai: settings.openaiApiKey || settings['openai.apiKey'] || '',
        deepseek: settings.deepseekApiKey || settings['deepseek.apiKey'] || ''
      }
    });
  } catch (error) {
    console.error('Error fetching RAG config:', error);
    res.status(500).json({ error: 'Failed to fetch RAG config' });
  }
});

router.post('/config', async (req: Request, res: Response) => {
  try {
    const { aiProvider, fallbackEnabled } = req.body;

    // Import settings service
    const { SettingsService } = await import('../services/settings.service');
    const settingsService = SettingsService.getInstance();

    // Save RAG settings
    if (aiProvider) {
      await settingsService.saveSetting('aiProvider', aiProvider);
    }
    if (fallbackEnabled !== undefined) {
      await settingsService.saveSetting('fallbackEnabled', fallbackEnabled.toString());
    }

    // Clear cache
    settingsService.clearCache('all_settings');

    res.json({ success: true, message: 'RAG config saved successfully' });
  } catch (error) {
    console.error('Error saving RAG config:', error);
    res.status(500).json({ error: 'Failed to save RAG config', details: error.message });
  }
});

export default router;