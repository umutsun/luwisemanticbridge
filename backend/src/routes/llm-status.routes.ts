import { Router, Request, Response } from 'express';
import { LLMManager } from '../services/llm-manager.service';

const router = Router();

// Get LLM provider status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const llmManager = LLMManager.getInstance();
    const status = await llmManager.getProviderStatus();
    const isAnyAvailable = await llmManager.isAnyProviderAvailable();

    res.json({
      success: true,
      data: {
        providers: status,
        anyAvailable: isAnyAvailable,
        message: isAnyAvailable ? 'LLM providers are available' : 'No LLM providers available'
      }
    });
  } catch (error) {
    console.error('Error getting LLM status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get LLM status'
    });
  }
});

// Test LLM connection
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { message = 'Test message' } = req.body;
    const llmManager = LLMManager.getInstance();

    const response = await llmManager.generateChatResponse(message, {
      maxTokens: 100,
      temperature: 0.1
    });

    res.json({
      success: true,
      data: {
        response: response.content,
        provider: response.provider,
        model: response.model
      }
    });
  } catch (error) {
    console.error('Error testing LLM:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test LLM'
    });
  }
});

// Refresh LLM settings
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const llmManager = LLMManager.getInstance();
    await llmManager.refreshSettings();

    res.json({
      success: true,
      message: 'LLM settings refreshed'
    });
  } catch (error) {
    console.error('Error refreshing LLM settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh LLM settings'
    });
  }
});

export default router;