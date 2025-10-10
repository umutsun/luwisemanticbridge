import { Router, Request, Response } from 'express';
import { asembPool } from '../config/database.config';
import { authenticateToken } from '../middleware/auth.middleware';
const axios = require('axios');

const router = Router();

// Apply authentication middleware to all routes
// router.use(authenticateToken); // Temporarily disabled for testing

// Get all settings
router.get('/all', async (req: Request, res: Response) => {
  try {
    const result = await asembPool.query('SELECT key, value FROM settings');

    const settings: { [key: string]: any } = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get configuration in nested format (for frontend)
router.get('/', async (req: Request, res: Response) => {
  try {
    console.log('🔧 [SETTINGS] Loading configuration from database...');

    // Get all settings from database
    const result = await asembPool.query('SELECT key, value FROM settings');
    console.log(`🔧 [SETTINGS] Found ${result.rows.length} settings in database`);

    // Initialize default configuration
    const config: any = {
      app: {
        name: 'Mali Müşavir Asistanı',
        description: 'Context Engine',
        logoUrl: '',
        locale: 'tr'
      },
      database: {
        type: 'postgresql',
        host: 'localhost',
        port: 5432,
        name: 'alice_semantic_bridge',
        user: 'postgres',
        password: 'postgres',
        ssl: false,
        maxConnections: 20
      },
      redis: {
        host: 'localhost',
        port: 6379,
        password: '',
        db: 0
      },
      openai: {
        apiKey: '',
        model: 'gpt-4-turbo-preview',
        embeddingModel: 'text-embedding-3-small',
        maxTokens: 4096,
        temperature: 0.7
      },
      google: {
        apiKey: '',
        projectId: ''
      },
      anthropic: {
        apiKey: '',
        model: 'claude-3-opus-20240229',
        maxTokens: 4096
      },
      deepseek: {
        apiKey: '',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-coder'
      },
      ollama: {
        baseUrl: 'http://localhost:11434',
        model: 'llama2',
        embeddingModel: 'nomic-embed-text'
      },
      huggingface: {
        apiKey: '',
        model: 'sentence-transformers/all-MiniLM-L6-v2',
        endpoint: 'https://api-inference.huggingface.co/models/'
      },
      embeddings: {
        chunkSize: 1000,
        chunkOverlap: 200,
        batchSize: 10,
        provider: 'google',
        model: 'google/text-embedding-004',
        normalizeEmbeddings: true,
        cacheEmbeddings: true
      },
      llmSettings: {
        embeddingProvider: 'google',
        embeddingModel: 'google/text-embedding-004',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaEmbeddingModel: 'nomic-embed-text',
        temperature: 0.1,
        topP: 0.9,
        maxTokens: 2048,
        presencePenalty: 0,
        frequencyPenalty: 0,
        ragWeight: 95,
        llmKnowledgeWeight: 5,
        streamResponse: true,
        systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.',
        activeChatModel: 'deepseek/deepseek-chat',
        activeEmbeddingModel: 'google/text-embedding-004',
        responseStyle: 'professional',
        language: 'tr'
      },
      ragSettings: {
        similarityThreshold: 0.014,
        maxResults: 15,
        minResults: 5,
        enableHybridSearch: true,
        enableKeywordBoost: true,
        enableParallelLLM: true,
        parallelLLMCount: 5,
        parallelLLMBatchSize: 3
      },
      security: {
        enableAuth: false,
        jwtSecret: '',
        sessionTimeout: 3600,
        rateLimit: 100,
        corsOrigins: ['http://localhost:3000']
      },
      logging: {
        level: 'info',
        file: 'logs/asb.log',
        maxSize: '10m',
        maxFiles: 5
      }
    };

    // Process database settings
    const apiKeysFound: { [key: string]: boolean } = {
      openai: false,
      google: false,
      anthropic: false,
      deepseek: false,
      huggingface: false
    };

    result.rows.forEach(row => {
      const key = row.key;
      const value = row.value;

      // Handle API keys - prioritize database values
      // Check multiple possible key formats
      // Handle API keys - prioritize database values
    // Only set if value is not empty to prevent overwriting with empty strings
    if (key === 'openai.apiKey' || key === 'openai_apiKey' || key === 'openai.api_key') {
      if (value && value.trim() !== '') {
        config.openai.apiKey = value;
        apiKeysFound.openai = true;
        console.log('✅ [SETTINGS] Loaded OpenAI API key from database (key:', key, ')');
      }
    } else if (key === 'google.apiKey' || key === 'google_apiKey' || key === 'google.api_key') {
      if (value && value.trim() !== '') {
        config.google.apiKey = value;
        apiKeysFound.google = true;
        console.log('✅ [SETTINGS] Loaded Google API key from database (key:', key, ')');
      }
    } else if (key === 'anthropic.apiKey' || key === 'anthropic_apiKey' || key === 'anthropic.api_key') {
      if (value && value.trim() !== '') {
        config.anthropic.apiKey = value;
        apiKeysFound.anthropic = true;
        console.log('✅ [SETTINGS] Loaded Anthropic API key from database (key:', key, ')');
      }
    } else if (key === 'deepseek.apiKey' || key === 'deepseek_apiKey' || key === 'deepseek.api_key') {
      if (value && value.trim() !== '') {
        config.deepseek.apiKey = value;
        apiKeysFound.deepseek = true;
        console.log('✅ [SETTINGS] Loaded DeepSeek API key from database (key:', key, ')');
      }
    } else if (key === 'huggingface.apiKey' || key === 'huggingface_apiKey' || key === 'huggingface.api_key') {
      if (value && value.trim() !== '') {
        config.huggingface.apiKey = value;
        apiKeysFound.huggingface = true;
        console.log('✅ [SETTINGS] Loaded HuggingFace API key from database (key:', key, ')');
      }
    }
      // Handle Google Project ID
      else if (key === 'google.projectId' || key === 'google_projectId') {
        config.google.projectId = value || '';
        console.log('✅ [SETTINGS] Loaded Google Project ID from database');
      }
      // Handle nested keys with dot notation
      else if (key.includes('.')) {
        const keys = key.split('.');
        let current = config;

        // Navigate to the correct nested level
        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }

        // Set the value
        const lastKey = keys[keys.length - 1];

        // Try to parse as JSON, if fails keep as string
        try {
          current[lastKey] = JSON.parse(value);
        } catch {
          // Handle numeric values
          if (!isNaN(Number(value)) && value !== '') {
            current[lastKey] = Number(value);
          } else if (value === 'true' || value === 'false') {
            current[lastKey] = value === 'true';
          } else {
            current[lastKey] = value;
          }
        }
      }
    });

    // If API keys not found in database, try environment variables as fallback
    if (!apiKeysFound.openai && process.env.OPENAI_API_KEY) {
      config.openai.apiKey = process.env.OPENAI_API_KEY;
      console.log('⚠️ [SETTINGS] Using OpenAI API key from environment (fallback)');
    }
    if (!apiKeysFound.google && process.env.GEMINI_API_KEY) {
      config.google.apiKey = process.env.GEMINI_API_KEY;
      console.log('⚠️ [SETTINGS] Using Google API key from environment (fallback)');
    }
    if (!apiKeysFound.anthropic && process.env.CLAUDE_API_KEY) {
      config.anthropic.apiKey = process.env.CLAUDE_API_KEY;
      console.log('⚠️ [SETTINGS] Using Anthropic API key from environment (fallback)');
    }
    if (!apiKeysFound.deepseek && process.env.DEEPSEEK_API_KEY) {
      config.deepseek.apiKey = process.env.DEEPSEEK_API_KEY;
      console.log('⚠️ [SETTINGS] Using DeepSeek API key from environment (fallback)');
    }
    if (!apiKeysFound.huggingface && process.env.HUGGINGFACE_API_KEY) {
      config.huggingface.apiKey = process.env.HUGGINGFACE_API_KEY;
      console.log('⚠️ [SETTINGS] Using HuggingFace API key from environment (fallback)');
    }

    console.log('🔧 [SETTINGS] API Keys Status:');
    console.log(`  - OpenAI: ${config.openai.apiKey ? '✅ SET' : '❌ EMPTY'}`);
    console.log(`  - Google: ${config.google.apiKey ? '✅ SET' : '❌ EMPTY'}`);
    console.log(`  - Anthropic: ${config.anthropic.apiKey ? '✅ SET' : '❌ EMPTY'}`);
    console.log(`  - DeepSeek: ${config.deepseek.apiKey ? '✅ SET' : '❌ EMPTY'}`);
    console.log(`  - HuggingFace: ${config.huggingface.apiKey ? '✅ SET' : '❌ EMPTY'}`);

    res.json(config);
  } catch (error) {
    console.error('Error fetching configuration:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Save entire configuration
router.put('/', async (req: Request, res: Response) => {
  try {
    const config = req.body;
    const updates: { key: string; value: string }[] = [];

    // Flatten the config object into key-value pairs
    const flattenConfig = (obj: any, prefix = '') => {
      Object.entries(obj).forEach(([key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          flattenConfig(value, fullKey);
        } else {
          updates.push({
            key: fullKey,
            value: typeof value === 'string' ? value : JSON.stringify(value)
          });
        }
      });
    };

    flattenConfig(config);

    // Save all settings
    for (const update of updates) {
      await asembPool.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key)
         DO UPDATE SET value = $2`,
        [update.key, update.value]
      );
    }

    console.log(`✅ [SETTINGS] Saved ${updates.length} settings to database`);
    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (error) {
    console.error('Error saving configuration:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// Get specific setting
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const result = await asembPool.query(
      'SELECT value FROM settings WHERE key = $1',
      [key]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ value: result.rows[0].value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Update setting
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    let { value } = req.body;

    // Handle case where value might be wrapped or null
    if (value === null || value === undefined) {
      return res.status(400).json({ error: 'Value cannot be null or undefined' });
    }

    // If value is already a string and looks like JSON, parse and stringify to validate
    if (typeof value === 'string') {
      try {
        // Try to parse as JSON to validate, then stringify back
        const parsed = JSON.parse(value);
        value = JSON.stringify(parsed);
      } catch {
        // If it's not valid JSON, keep as is
        value = String(value);
      }
    } else {
      // If it's an object or other type, stringify it
      value = JSON.stringify(value);
    }

    // Check if setting exists
    const checkResult = await asembPool.query(
      'SELECT key FROM settings WHERE key = $1',
      [key]
    );

    if (checkResult.rows.length === 0) {
      // Insert new setting
      await asembPool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2)',
        [key, value]
      );
      console.log(`✅ [SETTINGS] Inserted new setting: ${key}`);
    } else {
      // Update existing setting
      await asembPool.query(
        'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
        [value, key]
      );
      console.log(`✅ [SETTINGS] Updated setting: ${key}`);
    }

    res.json({ success: true, key, value });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Save OpenAI API key
router.post('/openai-api-key', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Save to database
    await asembPool.query(
      `INSERT INTO settings (key, value, description)
       VALUES ('openai.apiKey', $1, 'OpenAI API Key')
       ON CONFLICT (key)
       DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [apiKey]
    );

    console.log('✅ [SETTINGS] Saved OpenAI API key to database');
    res.json({ success: true, message: 'OpenAI API key saved successfully' });
  } catch (error) {
    console.error('Error saving OpenAI API key:', error);
    res.status(500).json({ error: 'Failed to save OpenAI API key' });
  }
});

// Get OpenAI API key
router.get('/openai-api-key', async (req: Request, res: Response) => {
  try {
    const result = await asembPool.query(
      'SELECT value FROM settings WHERE key = $1',
      ['openai.apiKey']
    );

    if (result.rows.length === 0) {
      return res.json({ apiKey: '' });
    }

    res.json({ apiKey: result.rows[0].value });
  } catch (error) {
    console.error('Error fetching OpenAI API key:', error);
    res.status(500).json({ error: 'Failed to fetch OpenAI API key' });
  }
});

// Test OpenAI API Key
router.post('/openai-api-key/test', async (req: Request, res: Response) => {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'API key is required' });
  }

  try {
    const openai = new (require('openai'))({ apiKey });
    // A simple, low-cost call to check the key and quota status
    await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: 'test'
    });
    res.json({ success: true, message: 'OpenAI connection successful and key has quota.' });
  } catch (error: any) {
    console.error('OpenAI test failed:', error);

    // The OpenAI library now uses structured errors
    if (error.status === 401) {
      return res.status(401).json({ success: false, error: 'Invalid OpenAI API Key.' });
    }

    if (error.status === 429 && error.code === 'insufficient_quota') {
      return res.status(429).json({ success: true, message: 'API key is valid, but you have exceeded your current quota. Please check your plan and billing details.' });
    }

    const errorMessage = error.error?.message || error.message || 'Unknown error';
    res.status(400).json({ success: false, error: `OpenAI connection failed: ${errorMessage}` });
  }
});

// Save Gemini API key
router.post('/gemini-api-key', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Save to database
    await asembPool.query(
      `INSERT INTO settings (key, value, description)
       VALUES ('google.apiKey', $1, 'Google Gemini API Key')
       ON CONFLICT (key)
       DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [apiKey]
    );

    console.log('✅ [SETTINGS] Saved Google API key to database');
    res.json({ success: true, message: 'Gemini API key saved successfully' });
  } catch (error) {
    console.error('Error saving Gemini API key:', error);
    res.status(500).json({ error: 'Failed to save Gemini API key' });
  }
});

// Get Gemini API key
router.get('/gemini-api-key', async (req: Request, res: Response) => {
  try {
    const result = await asembPool.query(
      'SELECT value FROM settings WHERE key = $1',
      ['google.apiKey']
    );

    if (result.rows.length === 0) {
      return res.json({ apiKey: '' });
    }

    res.json({ apiKey: result.rows[0].value });
  } catch (error) {
    console.error('Error fetching Gemini API key:', error);
    res.status(500).json({ error: 'Failed to fetch Gemini API key' });
  }
});

// Get AI settings
router.get('/ai', async (req: Request, res: Response) => {
  try {
    const keys = [
      'active_chat_model',
      'active_embedding_model',
      'temperature',
      'top_p',
      'max_tokens',
      'presence_penalty',
      'frequency_penalty',
      'rag_weight',
      'llm_knowledge_weight',
      'stream_response',
      'system_prompt',
      'response_style',
      'response_language',
      'google.apiKey',
      'openai.apiKey',
      'anthropic.apiKey',
      'deepseek.apiKey'
    ];

    const result = await asembPool.query(
      'SELECT key, value FROM settings WHERE key = ANY($1)',
      [keys]
    );

    const settings: any = {
      activeChatModel: 'google/gemini-pro',
      activeEmbeddingModel: 'google/text-embedding-004',
      temperature: 0.1,
      topP: 0.9,
      maxTokens: 2048,
      presencePenalty: 0,
      frequencyPenalty: 0,
      ragWeight: 95,
      llmKnowledgeWeight: 5,
      streamResponse: true,
      systemPrompt: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver. Context dışında bilgi verme.',
      responseStyle: 'professional',
      language: 'tr',
      openaiApiKey: '',
      googleApiKey: '',
      anthropicApiKey: '',
      deepseekApiKey: ''
    };

    result.rows.forEach(row => {
      switch(row.key) {
        case 'active_chat_model':
          settings.activeChatModel = row.value;
          break;
        case 'active_embedding_model':
          settings.activeEmbeddingModel = row.value;
          break;
        case 'temperature':
          settings.temperature = parseFloat(row.value);
          break;
        case 'top_p':
          settings.topP = parseFloat(row.value);
          break;
        case 'max_tokens':
          settings.maxTokens = parseInt(row.value);
          break;
        case 'presence_penalty':
          settings.presencePenalty = parseFloat(row.value);
          break;
        case 'frequency_penalty':
          settings.frequencyPenalty = parseFloat(row.value);
          break;
        case 'rag_weight':
          settings.ragWeight = parseInt(row.value);
          break;
        case 'llm_knowledge_weight':
          settings.llmKnowledgeWeight = parseInt(row.value);
          break;
        case 'stream_response':
          settings.streamResponse = row.value === 'true';
          break;
        case 'system_prompt':
          settings.systemPrompt = row.value;
          break;
        case 'response_style':
          settings.responseStyle = row.value;
          break;
        case 'response_language':
          settings.language = row.value;
          break;
        case 'google.apiKey':
          settings.googleApiKey = row.value;
          break;
        case 'openai.apiKey':
          settings.openaiApiKey = row.value;
          break;
        case 'anthropic.apiKey':
          settings.anthropicApiKey = row.value;
          break;
        case 'deepseek.apiKey':
          settings.deepseekApiKey = row.value;
          break;
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Error fetching AI settings:', error);
    res.status(500).json({
      error: 'AI ayarları alınamadı.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Save settings (general endpoint)
router.post('/', async (req: Request, res: Response) => {
  try {
    const settings = req.body;

    // Handle both LLM and RAG settings
    const settingsToSave = [];

    // LLM Settings
    if (settings.activeChatModel) {
      settingsToSave.push({ key: 'active_chat_model', value: settings.activeChatModel });
    }
    if (settings.activeEmbeddingModel) {
      settingsToSave.push({ key: 'active_embedding_model', value: settings.activeEmbeddingModel });
    }
    if (settings.temperature !== undefined) {
      settingsToSave.push({ key: 'temperature', value: settings.temperature.toString() });
    }
    if (settings.topP !== undefined) {
      settingsToSave.push({ key: 'top_p', value: settings.topP.toString() });
    }
    if (settings.maxTokens !== undefined) {
      settingsToSave.push({ key: 'max_tokens', value: settings.maxTokens.toString() });
    }
    if (settings.streamResponse !== undefined) {
      settingsToSave.push({ key: 'stream_response', value: settings.streamResponse.toString() });
    }

    // RAG Settings
    if (settings.similarityThreshold !== undefined) {
      settingsToSave.push({ key: 'similarity_threshold', value: settings.similarityThreshold.toString() });
    }
    if (settings.minResults !== undefined) {
      settingsToSave.push({ key: 'min_results', value: settings.minResults.toString() });
    }
    if (settings.maxResults !== undefined) {
      settingsToSave.push({ key: 'max_results', value: settings.maxResults.toString() });
    }
    if (settings.enableHybridSearch !== undefined) {
      settingsToSave.push({ key: 'enable_hybrid_search', value: settings.enableHybridSearch.toString() });
    }
    if (settings.enableKeywordBoost !== undefined) {
      settingsToSave.push({ key: 'enable_keyword_boost', value: settings.enableKeywordBoost.toString() });
    }
    if (settings.parallelLLMCount !== undefined) {
      settingsToSave.push({ key: 'parallel_llm_count', value: settings.parallelLLMCount.toString() });
    }
    if (settings.parallelLLMBatchSize !== undefined) {
      settingsToSave.push({ key: 'parallel_llm_batch_size', value: settings.parallelLLMBatchSize.toString() });
    }

    // Save each setting
    for (const setting of settingsToSave) {
      const checkResult = await asembPool.query(
        'SELECT key FROM settings WHERE key = $1',
        [setting.key]
      );

      if (checkResult.rows.length === 0) {
        await asembPool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2)',
          [setting.key, setting.value]
        );
      } else {
        await asembPool.query(
          'UPDATE settings SET value = $1 WHERE key = $2',
          [setting.value, setting.key]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Save AI settings (legacy endpoint)
router.post('/ai', async (req: Request, res: Response) => {
  try {
    const {
      activeChatModel,
      activeEmbeddingModel,
      temperature,
      topP,
      maxTokens,
      presencePenalty,
      frequencyPenalty,
      ragWeight,
      llmKnowledgeWeight,
      streamResponse,
      systemPrompt,
      responseStyle,
      language
    } = req.body;

    // Save each setting separately
    const settings = [
      { key: 'active_chat_model', value: activeChatModel },
      { key: 'active_embedding_model', value: activeEmbeddingModel },
      { key: 'temperature', value: temperature.toString() },
      { key: 'top_p', value: topP.toString() },
      { key: 'max_tokens', value: maxTokens.toString() },
      { key: 'presence_penalty', value: presencePenalty.toString() },
      { key: 'frequency_penalty', value: frequencyPenalty.toString() },
      { key: 'rag_weight', value: ragWeight.toString() },
      { key: 'llm_knowledge_weight', value: llmKnowledgeWeight.toString() },
      { key: 'stream_response', value: streamResponse.toString() },
      { key: 'system_prompt', value: systemPrompt },
      { key: 'response_style', value: responseStyle },
      { key: 'response_language', value: language },
      // RAG Settings
      { key: 'similarity_threshold', value: ragSettings.similarityThreshold.toString() },
      { key: 'min_results', value: ragSettings.minResults.toString() },
      { key: 'max_results', value: ragSettings.maxResults.toString() },
      { key: 'enable_hybrid_search', value: ragSettings.enableHybridSearch.toString() },
      { key: 'enable_keyword_boost', value: ragSettings.enableKeywordBoost.toString() },
      { key: 'parallel_llm_count', value: ragSettings.parallelLLMCount.toString() },
      { key: 'parallel_llm_batch_size', value: ragSettings.parallelLLMBatchSize.toString() }
    ];

    for (const setting of settings) {
      // Check if setting exists
      const checkResult = await asembPool.query(
        'SELECT key FROM settings WHERE key = $1',
        [setting.key]
      );

      if (checkResult.rows.length === 0) {
        // Insert new setting
        await asembPool.query(
          'INSERT INTO settings (key, value) VALUES ($1, $2)',
          [setting.key, setting.value]
        );
      } else {
        // Update existing setting
        await asembPool.query(
          'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
          [setting.value, setting.key]
        );
      }
    }

    console.log('✅ [SETTINGS] Saved AI settings to database');
    res.json({
      success: true,
      message: 'AI ayarları başarıyla kaydedildi.'
    });
  } catch (error) {
    console.error('Error saving AI settings:', error);
    res.status(500).json({
      error: 'AI ayarları kaydedilemedi.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test API key - Generic endpoint for multiple providers
router.post('/test/:provider', async (req: Request, res: Response) => {
  const { provider } = req.params;
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'API key is required' });
  }

  try {
    switch(provider) {
      case 'openai':
        const openai = new (require('openai'))({ apiKey });
        await openai.models.list(); // Simple API call to test the key
        res.json({ success: true, message: 'OpenAI API key is valid' });
        break;

      case 'google':
        // Test Google API key
        await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        res.json({ success: true, message: 'Google API key is valid' });
        break;

      case 'anthropic':
        // Test Anthropic API key
        const Anthropic = require('@anthropic-ai/sdk');
        const anthropic = new Anthropic({ apiKey });
        await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        });
        res.json({ success: true, message: 'Anthropic API key is valid' });
        break;
      case 'deepseek':
        // Test DeepSeek API key
        await axios.post('https://api.deepseek.com/v1/chat/completions', {
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1
        }, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        res.json({ success: true, message: 'DeepSeek API key is valid' });
        break;

      default:
        res.status(400).json({ success: false, error: 'Unsupported provider' });
    }
  } catch (error: any) {
    console.error(`${provider} API test failed:`, error);

    if (error.status === 401 || error.response?.status === 401) {
      res.status(401).json({ success: false, error: `Invalid ${provider} API key` });
    } else if (error.status === 429 || error.response?.status === 429) {
      res.status(429).json({ success: false, error: `${provider} API quota exceeded` });
    } else {
      res.status(400).json({
        success: false,
        error: error.message || error.response?.data?.error?.message || 'API test failed'
      });
    }
  }
});

// Initialize default settings
router.post('/initialize-defaults', async (req: Request, res: Response) => {
  try {
    // Default embeddings settings
    const defaultEmbeddingSettings = [
      { key: 'embedding_chunk_size', value: '1000', description: 'Default chunk size for text embeddings' },
      { key: 'embedding_chunk_overlap', value: '200', description: 'Default chunk overlap for text embeddings' },
      { key: 'embedding_batch_size', value: '10', description: 'Default batch size for embedding generation' },
      { key: 'embedding_normalize', value: 'true', description: 'Whether to normalize embeddings' },
      { key: 'embedding_cache', value: 'true', description: 'Whether to cache embeddings' },
      { key: 'embedding_provider', value: 'openai', description: 'Default embedding provider' },
      { key: 'embedding_model', value: 'text-embedding-3-small', description: 'Default embedding model' }
    ];

    // Insert defaults if they don't exist
    for (const setting of defaultEmbeddingSettings) {
      const checkResult = await asembPool.query(
        'SELECT key FROM settings WHERE key = $1',
        [setting.key]
      );

      if (checkResult.rows.length === 0) {
        await asembPool.query(
          `INSERT INTO settings (key, value, description)
           VALUES ($1, $2, $3)`,
          [setting.key, setting.value, setting.description]
        );
        console.log(`✅ Initialized default setting: ${setting.key} = ${setting.value}`);
      }
    }

    res.json({
      success: true,
      message: 'Default settings initialized successfully',
      initialized: defaultEmbeddingSettings.length
    });
  } catch (error) {
    console.error('Error initializing default settings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to initialize default settings'
    });
  }
});

// Save system prompt configuration
router.post('/config/prompts', async (req: Request, res: Response) => {
  try {
    console.log('🔧 [SETTINGS] Saving system prompt configuration...');
    const { prompt, temperature, maxTokens } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Save prompt to database
    await asembPool.query(
      `INSERT INTO settings (key, value, category, description)
       VALUES ('llmSettings.systemPrompt', $1, 'llm', 'System prompt for AI assistant')
       ON CONFLICT (key)
       DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
      [prompt]
    );

    // Save temperature if provided
    if (temperature !== undefined) {
      await asembPool.query(
        `INSERT INTO settings (key, value, category, description)
         VALUES ('llmSettings.temperature', $1, 'llm', 'Temperature for AI responses')
         ON CONFLICT (key)
         DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [temperature.toString()]
      );
    }

    // Save maxTokens if provided
    if (maxTokens !== undefined) {
      await asembPool.query(
        `INSERT INTO settings (key, value, category, description)
         VALUES ('llmSettings.maxTokens', $1, 'llm', 'Maximum tokens for AI responses')
         ON CONFLICT (key)
         DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
        [maxTokens.toString()]
      );
    }

    console.log('✅ [SETTINGS] System prompt configuration saved successfully');
    res.json({
      success: true,
      message: 'System prompt configuration saved successfully',
      prompt: prompt,
      temperature: temperature || 0.7,
      maxTokens: maxTokens || 2048
    });
  } catch (error) {
    console.error('❌ [SETTINGS] Error saving system prompt configuration:', error);
    res.status(500).json({ error: 'Failed to save system prompt configuration' });
  }
});

// Get system prompt configuration
router.get('/config/prompts', async (req: Request, res: Response) => {
  try {
    console.log('🔧 [SETTINGS] Fetching system prompt configuration...');

    // Try to get prompt from database first
    let promptConfig = {
      prompt: '',
      name: 'System Prompt',
      temperature: 0.7,
      maxTokens: 2048
    };

    try {
      const result = await asembPool.query(
        `SELECT value FROM settings WHERE key = 'system.prompt' OR key = 'systemPrompt' OR key = 'llmSettings.systemPrompt'`
      );

      if (result.rows.length > 0) {
        promptConfig.prompt = result.rows[0].value;
        console.log('✅ [SETTINGS] Found system prompt in database');
      } else {
        // Use default prompt
        promptConfig.prompt = "Sen bir RAG asistanısın. SADECE verilen context'ten cevap ver. Context dışında bilgi verme.";
        console.log('⚠️ [SETTINGS] Using default system prompt');
      }
    } catch (dbError) {
      console.error('❌ [SETTINGS] Error fetching system prompt from database:', dbError);
      // Use default prompt
      promptConfig.prompt = "Sen bir RAG asistanısın. SADECE verilen context'ten cevap ver. Context dışında bilgi verme.";
    }

    // Try to get temperature and maxTokens from database
    try {
      const tempResult = await asembPool.query(
        `SELECT value FROM settings WHERE key = 'llmSettings.temperature' OR key = 'temperature'`
      );
      if (tempResult.rows.length > 0) {
        promptConfig.temperature = parseFloat(tempResult.rows[0].value) || 0.7;
      }
    } catch (tempError) {
      console.error('❌ [SETTINGS] Error fetching temperature from database:', tempError);
    }

    try {
      const tokensResult = await asembPool.query(
        `SELECT value FROM settings WHERE key = 'llmSettings.maxTokens' OR key = 'max_tokens'`
      );
      if (tokensResult.rows.length > 0) {
        promptConfig.maxTokens = parseInt(tokensResult.rows[0].value) || 2048;
      }
    } catch (tokensError) {
      console.error('❌ [SETTINGS] Error fetching maxTokens from database:', tokensError);
    }

    console.log('✅ [SETTINGS] Returning prompt configuration:', {
      name: promptConfig.name,
      hasPrompt: !!promptConfig.prompt,
      temperature: promptConfig.temperature,
      maxTokens: promptConfig.maxTokens
    });

    res.json(promptConfig);
  } catch (error) {
    console.error('❌ [SETTINGS] Error fetching system prompt configuration:', error);
    res.status(500).json({ error: 'Failed to fetch system prompt configuration' });
  }
});

export default router;