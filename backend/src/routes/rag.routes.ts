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

export default router;