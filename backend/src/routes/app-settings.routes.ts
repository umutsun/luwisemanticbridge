import { Router } from 'express';
import { SettingsService } from '../services/settings.service';
import { getLLMProviders, getAppConfig } from '../config/database.config';

const router = Router();

// Get all settings for frontend initialization
router.get('/all', async (req, res) => {
  try {
    const settingsService = SettingsService.getInstance();
    const settings = await settingsService.getAllSettings();

    // Extract app settings
    const appSettings = {};
    const chatbotSettings = {};
    const dashboardSettings = {};

    // Separate settings by prefix
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith('chatbot_')) {
        chatbotSettings[key.replace('chatbot_', '')] = value;
      } else if (key.startsWith('dashboard_')) {
        dashboardSettings[key.replace('dashboard_', '')] = value;
      } else {
        appSettings[key] = value;
      }
    }

    res.json({
      success: true,
      data: {
        app: appSettings,
        chatbot: chatbotSettings,
        dashboard: dashboardSettings,
        databases: {
          asemb: settings.asemb_database,
          customer: settings.customer_database
        },
        redis: settings.redis_config
      }
    });
  } catch (error) {
    console.error('Failed to get settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load settings from database'
    });
  }
});

// Get LLM providers configuration
router.get('/llm', async (req, res) => {
  try {
    const settingsService = SettingsService.getInstance();
    const llmProviders = await settingsService.getLLMProviders();

    res.json({
      success: true,
      data: llmProviders
    });
  } catch (error) {
    console.error('Failed to get LLM providers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load LLM providers from database'
    });
  }
});

// Get app configuration
router.get('/app', async (req, res) => {
  try {
    const settingsService = SettingsService.getInstance();
    const settings = await settingsService.getAllSettings();

    res.json({
      success: true,
      data: settings.app_config
    });
  } catch (error) {
    console.error('Failed to get app config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load app configuration from database'
    });
  }
});

export default router;