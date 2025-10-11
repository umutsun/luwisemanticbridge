import { Router } from 'express';
import { SettingsService } from '../services/settings.service';
import { getLLMProviders, getAppConfig } from '../config/database.config';

const router = Router();

// Get all settings (root endpoint for frontend)
router.get('/', async (req, res) => {
  try {
    const settingsService = SettingsService.getInstance();
    const dbSettings = await settingsService.getAllSettings();

    // Transform flat key-value settings to nested structure expected by frontend
    const transformedSettings: any = {
      app: {
        name: dbSettings.app_name || 'Alice Semantic Bridge',
        description: dbSettings.app_description || 'AI-Powered Knowledge Management System',
        logoUrl: dbSettings.app_logo_url || '',
        locale: dbSettings.app_locale || 'tr'
      },
      database: {
        type: 'postgresql',
        host: dbSettings.db_host || 'localhost',
        port: parseInt(dbSettings.db_port) || 5432,
        name: dbSettings.db_name || 'alice_semantic_bridge',
        user: dbSettings.db_user || 'postgres',
        password: dbSettings.db_password || 'postgres',
        ssl: dbSettings.db_ssl === 'true',
        maxConnections: parseInt(dbSettings.db_max_connections) || 20
      },
      redis: {
        host: dbSettings.redis_host || 'localhost',
        port: parseInt(dbSettings.redis_port) || 6379,
        password: dbSettings.redis_password || '',
        db: parseInt(dbSettings.redis_db) || 0
      },
      openai: {
        apiKey: dbSettings.openai_api_key || '',
        model: dbSettings.openai_model || 'gpt-4-turbo-preview',
        embeddingModel: dbSettings.openai_embedding_model || 'text-embedding-3-small',
        maxTokens: parseInt(dbSettings.openai_max_tokens) || 4096,
        temperature: parseFloat(dbSettings.openai_temperature) || 0.7
      },
      google: {
        apiKey: dbSettings.google_api_key || '',
        projectId: dbSettings.google_project_id || ''
      },
      anthropic: {
        apiKey: dbSettings.anthropic_api_key || '',
        model: dbSettings.anthropic_model || 'claude-3-opus-20240229',
        maxTokens: parseInt(dbSettings.anthropic_max_tokens) || 4096
      },
      deepseek: {
        apiKey: dbSettings.deepseek_api_key || '',
        baseUrl: dbSettings.deepseek_base_url || 'https://api.deepseek.com',
        model: dbSettings.deepseek_model || 'deepseek-coder'
      },
      ollama: {
        baseUrl: dbSettings.ollama_base_url || 'http://localhost:11434',
        model: dbSettings.ollama_model || 'llama2',
        embeddingModel: dbSettings.ollama_embedding_model || 'nomic-embed-text'
      },
      embeddings: {
        chunkSize: parseInt(dbSettings.embedding_chunk_size) || 1000,
        chunkOverlap: parseInt(dbSettings.embedding_chunk_overlap) || 200,
        batchSize: parseInt(dbSettings.embedding_batch_size) || 10,
        provider: dbSettings.embedding_provider || 'google',
        model: dbSettings.embedding_model || 'google/text-embedding-004',
        normalizeEmbeddings: dbSettings.embedding_normalize_embeddings !== 'false',
        cacheEmbeddings: dbSettings.embedding_cache_embeddings !== 'false'
      },
      llmSettings: {
        embeddingProvider: dbSettings.llm_embedding_provider || 'google',
        embeddingModel: dbSettings.llm_embedding_model || 'google/text-embedding-004',
        ollamaBaseUrl: dbSettings.llm_ollama_base_url || 'http://localhost:11434',
        ollamaEmbeddingModel: dbSettings.llm_ollama_embedding_model || 'nomic-embed-text',
        temperature: parseFloat(dbSettings.llm_temperature) || 0.1,
        topP: parseFloat(dbSettings.llm_top_p) || 0.9,
        maxTokens: parseInt(dbSettings.llm_max_tokens) || 2048,
        presencePenalty: parseFloat(dbSettings.llm_presence_penalty) || 0,
        frequencyPenalty: parseFloat(dbSettings.llm_frequency_penalty) || 0,
        ragWeight: parseInt(dbSettings.llm_rag_weight) || 95,
        llmKnowledgeWeight: parseInt(dbSettings.llm_llm_knowledge_weight) || 5,
        streamResponse: dbSettings.llm_stream_response !== 'false',
        systemPrompt: dbSettings.llm_system_prompt || 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.',
        activeChatModel: dbSettings.llm_active_chat_model || 'deepseek/deepseek-chat',
        activeEmbeddingModel: dbSettings.llm_active_embedding_model || 'google/text-embedding-004',
        responseStyle: dbSettings.llm_response_style || 'professional',
        language: dbSettings.llm_language || 'tr'
      },
      ragSettings: {
        similarityThreshold: parseFloat(dbSettings.rag_similarity_threshold) || 0.001,
        maxResults: parseInt(dbSettings.rag_max_results) || 10,
        minResults: parseInt(dbSettings.rag_min_results) || 3,
        enableHybridSearch: dbSettings.rag_enable_hybrid_search !== 'false',
        enableKeywordBoost: dbSettings.rag_enable_keyword_boost !== 'false'
      },
      security: {
        enableAuth: dbSettings.security_enable_auth === 'true',
        jwtSecret: dbSettings.security_jwt_secret || '',
        sessionTimeout: parseInt(dbSettings.security_session_timeout) || 3600,
        rateLimit: parseInt(dbSettings.security_rate_limit) || 100,
        corsOrigins: dbSettings.security_cors_origins ? dbSettings.security_cors_origins.split(',') : ['http://localhost:3000']
      },
      logging: {
        level: dbSettings.logging_level || 'info',
        file: dbSettings.logging_file || 'logs/asb.log',
        maxSize: dbSettings.logging_max_size || '10m',
        maxFiles: parseInt(dbSettings.logging_max_files) || 5
      }
    };

    res.json(transformedSettings);
  } catch (error) {
    console.error('Failed to get settings:', error);
    res.status(500).json({
      error: 'Failed to load settings from database',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

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
          source: settings.source_database || settings.customer_database
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

// Update all settings
router.put('/', async (req, res) => {
  try {
    const settings = req.body;
    const settingsService = SettingsService.getInstance();

    // Transform nested settings back to flat key-value format
    const flatSettings: Record<string, string> = {};

    // Helper function to flatten nested object
    const flattenObject = (obj: any, prefix = '') => {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const newKey = prefix ? `${prefix}_${key}` : key;
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            flattenObject(obj[key], newKey);
          } else {
            flatSettings[newKey] = String(obj[key]);
          }
        }
      }
    };

    flattenObject(settings);

    // Save all settings to database
    for (const [key, value] of Object.entries(flatSettings)) {
      await settingsService.setSetting(key, value);
    }

    // If logging settings were updated, update the logger service
    if (flatSettings.logging_level || flatSettings.logging_file || flatSettings.logging_max_size || flatSettings.logging_max_files) {
      const { loggerService } = await import('../utils/logger.service');
      await loggerService.updateConfig({
        level: flatSettings.logging_level || 'info',
        file: flatSettings.logging_file || 'logs/asb.log',
        maxSize: flatSettings.logging_max_size || '10m',
        maxFiles: parseInt(flatSettings.logging_max_files) || 5
      });
    }

    // Return updated settings
    const updatedSettings = await settingsService.getAllSettings();
    const transformedSettings = { /* Same transformation logic as GET */ };

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: transformedSettings
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({
      error: 'Failed to update settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;