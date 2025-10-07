import { Router, Request, Response } from 'express';
import { asembPool } from '../config/database.config';
const axios = require('axios');

const router = Router();

// Get all settings
router.get('/all', async (req: Request, res: Response) => {
  try {
    const result = await asembPool.query('SELECT key, value FROM settings');

    const settings: { [key: string]: string } = {};
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
    const result = await asembPool.query('SELECT key, value FROM settings');

    const config: any = {
      app: {},
      database: {},
      redis: {},
      openai: {},
      anthropic: {},
      deepseek: {},
      ollama: {},
      huggingface: {},
      google: {},
      jina: {},
      smtp: {},
      n8n: {},
      scraper: {},
      embeddings: {},
      dataSource: {},
      llmSettings: {},
      ragSettings: {},
      security: {},
      logging: {}
    };

    // Load configuration from environment (.env.asemb)
    config.database = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      name: process.env.POSTGRES_DB || 'asemb',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
      ssl: false,
      maxConnections: 20
    };

    config.redis = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || '',
      db: parseInt(process.env.REDIS_DB || '2')
    };

    // Initialize API keys from environment
    config.openai = {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      maxTokens: 4096,
      temperature: 0.7
    };

    config.google = {
      apiKey: process.env.GEMINI_API_KEY || '',
      projectId: process.env.GOOGLE_PROJECT_ID || ''
    };

    config.anthropic = {
      apiKey: process.env.CLAUDE_API_KEY || '',
      model: 'claude-3-opus-20240229',
      maxTokens: 4096
    };

    config.deepseek = {
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-coder'
    };

    config.huggingface = {
      apiKey: process.env.HUGGINGFACE_API_KEY || '',
      model: 'sentence-transformers/all-MiniLM-L6-v2',
      endpoint: 'https://api-inference.huggingface.co/models/'
    };

    config.n8n = {
      url: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678',
      apiKey: process.env.N8N_API_KEY || ''
    };

    // Initialize SMTP configuration
    config.smtp = {
      gmail: {
        enabled: false,
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: '',
          pass: ''
        }
      },
      brevo: {
        enabled: false,
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: {
          user: '',
          pass: ''
        }
      }
    };

    // Initialize embeddings configuration
    config.embeddings = {
      provider: process.env.EMBEDDING_PROVIDER || 'openai',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '100'),
      maxTokens: parseInt(process.env.EMBEDDING_MAX_TOKENS || '8192'),
      dimension: parseInt(process.env.EMBEDDING_DIMENSION || '1536'),
      enabled: process.env.EMBEDDINGS_ENABLED !== 'false',
      useLocal: process.env.USE_LOCAL_EMBEDDINGS === 'true',
      localModel: process.env.LOCAL_EMBEDDING_MODEL || 'all-MiniLM-L6-v2'
    };

    // Initialize RAG settings
    config.ragSettings = {
      similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.001'),
      maxResults: parseInt(process.env.RAG_MAX_RESULTS || '10'),
      minResults: parseInt(process.env.RAG_MIN_RESULTS || '3'),
      enableHybridSearch: process.env.RAG_ENABLE_HYBRID_SEARCH !== 'false',
      enableKeywordBoost: process.env.RAG_ENABLE_KEYWORD_BOOST !== 'false'
    };

    config.app = {
      name: process.env.COMPOSE_PROJECT_NAME || 'Alice Semantic Bridge',
      description: 'AI-Powered Knowledge Management System',
      logoUrl: '',
      locale: 'tr'
    };

    // Initialize API key objects to ensure they exist
    config.openai.apiKey = config.openai.apiKey || '';
    config.google.apiKey = config.google.apiKey || '';
    config.anthropic.apiKey = config.anthropic.apiKey || '';
    config.huggingface.apiKey = config.huggingface.apiKey || '';

    result.rows.forEach(row => {
      const key = row.key;
      const value = row.value;

      // Special handling for ai_settings
      if (key === 'ai_settings') {
        try {
          let aiSettings;
          // Check if value is already an object or needs to be parsed from JSON string
          if (typeof value === 'object') {
            aiSettings = value;
          } else if (typeof value === 'string' && value !== '[object Object]') {
            aiSettings = JSON.parse(value);
          } else {
            // Skip invalid ai_settings
            return;
          }
          // Map to the expected structure
          if (aiSettings.openaiApiKey) {
            config.openai.apiKey = aiSettings.openaiApiKey;
          }
          if (aiSettings.openaiApiBase) {
            // Store base URL if needed
          }
          if (aiSettings.embeddingProvider) {
            config.llmSettings.embeddingProvider = aiSettings.embeddingProvider;
          }
          if (aiSettings.embeddingModel) {
            config.llmSettings.embeddingModel = aiSettings.embeddingModel;
          }
        } catch (e) {
          console.error('Error parsing ai_settings:', e);
        }
      }
      // Handle regular nested keys
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
      // Handle API keys - check both flat key format and nested format
      else if (key === 'openai_api_key' || key === 'openai.apiKey') {
        config.openai.apiKey = value;
      } else if (key === 'google_api_key' || key === 'google.apiKey') {
        config.google.apiKey = value;
      } else if (key === 'anthropic_api_key' || key === 'anthropic.apiKey') {
        config.anthropic.apiKey = value;
      } else if (key === 'huggingface_api_key' || key === 'huggingface.apiKey') {
        config.huggingface.apiKey = value;
      }
      // Handle migration settings
      else if (key === 'migration_source_db') {
        // Store in config if needed
      }
    });

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
    } else {
      // Update existing setting
      await asembPool.query(
        'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
        [value, key]
      );
    }

    res.json({ success: true, key, value });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Get database configuration
router.get('/database/config', async (req: Request, res: Response) => {
  try {
    const keys = ['db_host', 'db_port', 'db_name', 'db_user', 'db_password'];
    const result = await asembPool.query(
      'SELECT key, value FROM settings WHERE key = ANY($1)',
      [keys]
    );
    
    const config: { [key: string]: string } = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || '5432',
      database: process.env.POSTGRES_DB || 'asemb',
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || ''
    };
    
    result.rows.forEach(row => {
      switch(row.key) {
        case 'db_host': config.host = row.value; break;
        case 'db_port': config.port = row.value; break;
        case 'db_name': config.database = row.value; break;
        case 'db_user': config.username = row.value; break;
        case 'db_password': config.password = row.value; break;
      }
    });
    
    res.json(config);
  } catch (error) {
    console.error('Error fetching database config:', error);
    res.status(500).json({ error: 'Failed to fetch database config' });
  }
});

// Save OpenAI API key
router.post('/openai-api-key', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    
    // Check if setting exists
    const checkResult = await asembPool.query(
      'SELECT key FROM settings WHERE key = $1',
      ['openai_api_key']
    );
    
    if (checkResult.rows.length === 0) {
      // Insert new setting
      await asembPool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2)',
        ['openai_api_key', apiKey]
      );
    } else {
      // Update existing setting
      await asembPool.query(
        'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
        [apiKey, 'openai_api_key']
      );
    }
    
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
      ['openai_api_key']
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

// Save embedding settings
router.post('/embedding', async (req: Request, res: Response) => {
  try {
    const {
      embeddingProvider,
      embeddingModel,
      ollamaBaseUrl,
      ollamaEmbeddingModel,
      huggingfaceApiKey,
      mistralApiKey,
      chunkSize,
      chunkOverlap,
      batchSize,
      normalizeEmbeddings,
      cacheEmbeddings
    } = req.body;

    // Save each setting separately
    const settings = [
      { key: 'embedding_provider', value: embeddingProvider || 'openai' },
      { key: 'embedding_model', value: embeddingModel || 'text-embedding-3-small' },
      { key: 'ollama_base_url', value: ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434' },
      { key: 'ollama_embedding_model', value: ollamaEmbeddingModel || 'nomic-embed-text' },
      { key: 'huggingface_api_key', value: huggingfaceApiKey || '' },
      { key: 'mistral_api_key', value: mistralApiKey || '' },
      { key: 'embedding_chunk_size', value: (chunkSize || 1000).toString() },
      { key: 'embedding_chunk_overlap', value: (chunkOverlap || 200).toString() },
      { key: 'embedding_batch_size', value: (batchSize || 10).toString() },
      { key: 'embedding_normalize', value: (normalizeEmbeddings !== false).toString() },
      { key: 'embedding_cache', value: (cacheEmbeddings !== false).toString() }
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

    res.json({
      success: true,
      message: 'Embedding ayarları başarıyla kaydedildi.',
      settings: {
        provider: embeddingProvider,
        model: embeddingModel,
        chunkSize,
        chunkOverlap,
        batchSize
      }
    });
  } catch (error) {
    console.error('Error saving embedding settings:', error);
    res.status(500).json({
      error: 'Embedding ayarları kaydedilemedi.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get embedding settings
router.get('/embedding', async (req: Request, res: Response) => {
  try {
    const keys = [
      'embedding_provider',
      'embedding_model',
      'ollama_base_url',
      'ollama_embedding_model',
      'huggingface_api_key',
      'embedding_chunk_size',
      'embedding_chunk_overlap',
      'embedding_batch_size',
      'embedding_normalize',
      'embedding_cache'
    ];

    const result = await asembPool.query(
      'SELECT key, value FROM settings WHERE key = ANY($1)',
      [keys]
    );

    const settings: any = {
      provider: 'openai',
      model: 'text-embedding-3-small',
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      ollamaEmbeddingModel: 'nomic-embed-text',
      huggingfaceApiKey: '',
      chunkSize: 1000,
      chunkOverlap: 200,
      batchSize: 10,
      normalizeEmbeddings: true,
      cacheEmbeddings: true
    };

    result.rows.forEach(row => {
      switch(row.key) {
        case 'embedding_provider':
          settings.provider = row.value;
          break;
        case 'embedding_model':
          settings.model = row.value;
          break;
        case 'ollama_base_url':
          settings.ollamaBaseUrl = row.value;
          break;
        case 'ollama_embedding_model':
          settings.ollamaEmbeddingModel = row.value;
          break;
        case 'huggingface_api_key':
          settings.huggingfaceApiKey = row.value;
          break;
        case 'embedding_chunk_size':
          settings.chunkSize = parseInt(row.value) || 1000;
          break;
        case 'embedding_chunk_overlap':
          settings.chunkOverlap = parseInt(row.value) || 200;
          break;
        case 'embedding_batch_size':
          settings.batchSize = parseInt(row.value) || 10;
          break;
        case 'embedding_normalize':
          settings.normalizeEmbeddings = row.value === 'true';
          break;
        case 'embedding_cache':
          settings.cacheEmbeddings = row.value !== 'false';
          break;
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Error fetching embedding settings:', error);
    res.status(500).json({
      error: 'Embedding ayarları alınamadı.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Test embedding connection
router.post('/embedding/test', async (req: Request, res: Response) => {
  try {
    const {
      embeddingProvider,
      embeddingModel,
      ollamaBaseUrl,
      huggingfaceApiKey
    } = req.body;

    let testResult = { success: false, message: '' };

    switch(embeddingProvider) {
      case 'openai':
        // Get OpenAI API key from settings
        const openaiKeyResult = await asembPool.query(
          'SELECT value FROM settings WHERE key = $1',
          ['openai_api_key']
        );

        if (!openaiKeyResult.rows.length || !openaiKeyResult.rows[0].value) {
          return res.json({
            success: false,
            error: 'OpenAI API key bulunamadı. Lütfen AI Services sekmesinden ekleyin.'
          });
        }

        const openai = new (require('openai'))({
          apiKey: openaiKeyResult.rows[0].value
        });

        await openai.embeddings.create({
          model: embeddingModel || 'text-embedding-3-small',
          input: 'test connection'
        });

        testResult = {
          success: true,
          message: `OpenAI (${embeddingModel}) bağlantısı başarılı!`
        };
        break;

      case 'ollama':
        // Test Ollama connection
        try {
          const response = await axios.post(`${ollamaBaseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/api/embeddings`, {
            model: embeddingModel || 'nomic-embed-text',
            prompt: 'test connection'
          });

          if (response.data && response.data.embedding) {
            testResult = {
              success: true,
              message: `Ollama (${embeddingModel}) bağlantısı başarılı!`
            };
          } else {
            throw new Error('Invalid response from Ollama');
          }
        } catch (ollamaError) {
          return res.status(500).json({
            success: false,
            error: `Ollama'ya bağlanılamadı. Lütfen Ollama'nın çalıştığından ve modelin yüklü olduğundan emin olun.`
          });
        }
        break;

      case 'huggingface':
        // HuggingFace test would require API implementation
        testResult = {
          success: true,
          message: 'HuggingFace embedding modeli seçildi. İşlem sırasında test edilecek.'
        };
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Geçersiz embedding provider.'
        });
    }

    res.json(testResult);
  } catch (error) {
    console.error('Embedding test error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get prompts configuration
router.get('/config/prompts', async (req: Request, res: Response) => {
  try {
    const result = await asembPool.query(
      `SELECT key, value FROM settings
       WHERE key LIKE '%prompt%'
       OR key IN ('temperature', 'max_tokens')`
    );

    const prompts: any = {
      system_prompt: 'You are a helpful assistant.',
      user_prompt_template: 'Question: {question}',
      temperature: '0.1',
      max_tokens: '4096',
      // Add default prompts
    };

    result.rows.forEach(row => {
      prompts[row.key] = row.value;
    });

    res.json(prompts);
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// Save prompts configuration
router.post('/config/prompts', async (req: Request, res: Response) => {
  try {
    const { prompt, temperature, maxTokens, name } = req.body;

    // Save system prompt
    if (prompt !== undefined) {
      await asembPool.query(
        `INSERT INTO settings (key, value, description)
         VALUES ('system_prompt', $1, 'System prompt for AI assistant')
         ON CONFLICT (key)
         DO UPDATE SET value = $1`,
        [prompt]
      );
    }

    // Save temperature
    if (temperature !== undefined) {
      await asembPool.query(
        `INSERT INTO settings (key, value, description)
         VALUES ('temperature', $1, 'Temperature for AI responses')
         ON CONFLICT (key)
         DO UPDATE SET value = $1`,
        [temperature.toString()]
      );
    }

    // Save max tokens
    if (maxTokens !== undefined) {
      await asembPool.query(
        `INSERT INTO settings (key, value, description)
         VALUES ('max_tokens', $1, 'Maximum tokens for AI responses')
         ON CONFLICT (key)
         DO UPDATE SET value = $1`,
        [maxTokens.toString()]
      );
    }

    // Save prompt name if provided
    if (name) {
      await asembPool.query(
        `INSERT INTO settings (key, value, description)
         VALUES ('prompt_name', $1, 'Name of the custom prompt')
         ON CONFLICT (key)
         DO UPDATE SET value = $1`,
        [name]
      );
    }

    res.json({
      success: true,
      message: 'Prompt settings saved successfully',
      settings: {
        prompt,
        temperature,
        maxTokens,
        name
      }
    });
  } catch (error) {
    console.error('Error saving prompts:', error);
    res.status(500).json({
      error: 'Failed to save prompt settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get PostgreSQL status
router.get('/services/postgres/status', async (req: Request, res: Response) => {
  try {
    const start = Date.now();
    await asembPool.query('SELECT 1');
    const responseTime = Date.now() - start;

    res.json({
      status: 'connected',
      responseTime,
      maxConnections: asembPool.options.max || 20,
      totalConnections: asembPool.totalCount,
      idleConnections: asembPool.idleCount,
      waitingConnections: asembPool.waitingCount
    });
  } catch (error) {
    res.json({
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get Redis status
router.get('/services/redis/status', async (req: Request, res: Response) => {
  try {
    const { redis } = require('../server');

    if (!redis || !redis.status) {
      return res.json({
        status: 'disconnected',
        error: 'Redis client not initialized'
      });
    }

    const start = Date.now();
    await redis.ping();
    const responseTime = Date.now() - start;

    // Get memory usage
    const info = await redis.info('memory');
    const usedMemory = info.match(/used_memory:(\d+)/);
    const maxMemory = info.match(/maxmemory:(\d+)/);

    res.json({
      status: redis.status,
      responseTime,
      connected: redis.status === 'ready',
      usedMemory: usedMemory ? parseInt(usedMemory[1]) : 0,
      maxMemory: maxMemory ? parseInt(maxMemory[1]) : 0
    });
  } catch (error) {
    res.json({
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
      'gemini_api_key'
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
      language: 'tr'
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

// Save AI settings
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
      { key: 'response_language', value: language }
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

// Save Gemini API key
router.post('/gemini-api-key', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Check if setting exists
    const checkResult = await asembPool.query(
      'SELECT key FROM settings WHERE key = $1',
      ['gemini_api_key']
    );

    if (checkResult.rows.length === 0) {
      // Insert new setting
      await asembPool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2)',
        ['gemini_api_key', apiKey]
      );
    } else {
      // Update existing setting
      await asembPool.query(
        'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
        [apiKey, 'gemini_api_key']
      );
    }

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
      ['gemini_api_key']
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

// AI Provider Priority endpoints
router.get('/ai-provider-priority', async (req: Request, res: Response) => {
  try {
    const result = await asembPool.query(
      'SELECT value FROM settings WHERE key = $1',
      ['ai_provider_priority']
    );

    if (result.rows.length === 0) {
      // Return default priority
      return res.json({
        priority: ['gemini', 'claude', 'openai', 'fallback']
      });
    }

    res.json({
      priority: JSON.parse(result.rows[0].value)
    });
  } catch (error) {
    console.error('Error fetching AI provider priority:', error);
    res.status(500).json({ error: 'Failed to fetch AI provider priority' });
  }
});

router.post('/ai-provider-priority', async (req: Request, res: Response) => {
  try {
    const { priority } = req.body;

    // Validate priority array
    if (!Array.isArray(priority) || priority.length === 0) {
      return res.status(400).json({ error: 'Invalid priority array' });
    }

    // Check if setting exists
    const checkResult = await asembPool.query(
      'SELECT key FROM settings WHERE key = $1',
      ['ai_provider_priority']
    );

    if (checkResult.rows.length === 0) {
      // Insert new setting
      await asembPool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2)',
        ['ai_provider_priority', JSON.stringify(priority)]
      );
    } else {
      // Update existing setting
      await asembPool.query(
        'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
        [JSON.stringify(priority), 'ai_provider_priority']
      );
    }

    res.json({
      success: true,
      priority,
      message: 'AI provider priority updated successfully'
    });
  } catch (error) {
    console.error('Error updating AI provider priority:', error);
    res.status(500).json({ error: 'Failed to update AI provider priority' });
  }
});

// Gemini model endpoints
router.get('/gemini-model', async (req: Request, res: Response) => {
  try {
    const result = await asembPool.query(
      'SELECT value FROM settings WHERE key = $1',
      ['gemini_model']
    );

    if (result.rows.length === 0) {
      // Return default model
      return res.json({
        model: 'gemini-1.5-flash'
      });
    }

    res.json({
      model: result.rows[0].value
    });
  } catch (error) {
    console.error('Error fetching Gemini model:', error);
    res.status(500).json({ error: 'Failed to fetch Gemini model' });
  }
});

router.post('/gemini-model', async (req: Request, res: Response) => {
  try {
    const { model } = req.body;

    // Validate model
    const validModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];
    if (!validModels.includes(model)) {
      return res.status(400).json({ error: 'Invalid Gemini model' });
    }

    // Check if setting exists
    const checkResult = await asembPool.query(
      'SELECT key FROM settings WHERE key = $1',
      ['gemini_model']
    );

    if (checkResult.rows.length === 0) {
      // Insert new setting
      await asembPool.query(
        'INSERT INTO settings (key, value) VALUES ($1, $2)',
        ['gemini_model', model]
      );
    } else {
      // Update existing setting
      await asembPool.query(
        'UPDATE settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2',
        [model, 'gemini_model']
      );
    }

    res.json({
      success: true,
      model,
      message: 'Gemini model updated successfully'
    });
  } catch (error) {
    console.error('Error updating Gemini model:', error);
    res.status(500).json({ error: 'Failed to update Gemini model' });
  }
});

// Get all services status (for the dashboard services page)
router.get('/services/status', async (req: Request, res: Response) => {
  try {
    const services: { [key: string]: any } = {};

    // PostgreSQL status
    try {
      const start = Date.now();
      await asembPool.query('SELECT 1');
      services.postgres = {
        status: 'connected',
        responseTime: Date.now() - start,
        maxConnections: asembPool.options.max || 20,
        totalConnections: asembPool.totalCount,
        idleConnections: asembPool.idleCount,
        waitingConnections: asembPool.waitingCount
      };
    } catch (error: any) {
      services.postgres = {
        status: 'disconnected',
        error: error.message
      };
    }

    // Redis status
    try {
      const { redis } = require('../server');

      if (redis && redis.status) {
        const start = Date.now();
        await redis.ping();
        const responseTime = Date.now() - start;

        const info = await redis.info('memory');
        const usedMemory = info.match(/used_memory:(\d+)/);
        const maxMemory = info.match(/maxmemory:(\d+)/);

        services.redis = {
          status: redis.status,
          responseTime,
          connected: redis.status === 'ready',
          usedMemory: usedMemory ? parseInt(usedMemory[1]) : 0,
          maxMemory: maxMemory ? parseInt(maxMemory[1]) : 0
        };
      } else {
        services.redis = {
          status: 'disconnected',
          error: 'Redis client not initialized'
        };
      }
    } catch (error: any) {
      services.redis = {
        status: 'disconnected',
        error: error.message
      };
    }

    // Check embedding service
    try {
      const embeddingResult = await asembPool.query(
        'SELECT value FROM settings WHERE key = $1',
        ['embedding_provider']
      );

      const embeddingProvider = embeddingResult.rows[0]?.value || 'openai';
      services.embedding = {
        status: 'configured',
        provider: embeddingProvider
      };
    } catch (error) {
      services.embedding = {
        status: 'error',
        error: 'Failed to fetch embedding settings'
      };
    }

    // Check LLM services
    try {
      const llmResult = await asembPool.query(
        'SELECT key, value FROM settings WHERE key IN ($1, $2, $3)',
        ['openai_api_key', 'gemini_api_key', 'claude_api_key', 'deepseek_api_key']
      );

      const llmServices: { [key: string]: boolean } = {};
      llmResult.rows.forEach(row => {
        llmServices[row.key] = !!row.value;
      });

      services.llm = {
        status: 'configured',
        providers: {
          openai: !!llmServices.openai_api_key,
          gemini: !!llmServices.gemini_api_key,
          claude: !!llmServices.claude_api_key,
          deepseek: !!llmServices.deepseek_api_key
        }
      };
    } catch (error) {
      services.llm = {
        status: 'error',
        error: 'Failed to fetch LLM settings'
      };
    }

    res.json({
      services,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching services status:', error);
    res.status(500).json({ error: 'Failed to fetch services status' });
  }
});

// Generic service action endpoint
router.post('/services/:service/:action', async (req: Request, res: Response) => {
  const { service, action } = req.params;

  try {
    switch(service) {
      case 'redis':
        const { redis } = require('../server');
        if (action === 'restart') {
          // Reconnect Redis
          await redis.quit();
          await redis.connect();
          res.json({ success: true, message: 'Redis restarted successfully' });
        } else {
          res.status(400).json({ error: 'Invalid action for Redis' });
        }
        break;

      case 'postgres':
        if (action === 'test') {
          await asembPool.query('SELECT 1');
          res.json({ success: true, message: 'PostgreSQL connection test successful' });
        } else {
          res.status(400).json({ error: 'Invalid action for PostgreSQL' });
        }
        break;

      default:
        res.status(400).json({ error: `Unknown service: ${service}` });
    }
  } catch (error: any) {
    console.error(`Service action error (${service}/${action}):`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Service action failed'
    });
  }
});

// Test connection endpoint (for individual services)
router.get('/test/:service', async (req: Request, res: Response) => {
  const { service } = req.params;

  try {
    switch(service) {
      case 'postgres':
        await asembPool.query('SELECT 1');
        res.json({ success: true, message: 'PostgreSQL connection successful' });
        break;

      case 'redis':
        const { redis } = require('../server');
        await redis.ping();
        res.json({ success: true, message: 'Redis connection successful' });
        break;

      case 'embedding':
        // Test embedding service
        const embeddingResult = await asembPool.query(
          'SELECT value FROM settings WHERE key = $1',
          ['embedding_provider']
        );

        const provider = embeddingResult.rows[0]?.value || 'openai';
        res.json({ success: true, message: `Embedding service configured with: ${provider}` });
        break;

      case 'llm':
        // Test LLM services
        const llmResult = await asembPool.query(
          'SELECT key, value FROM settings WHERE key IN ($1, $2, $3)',
          ['openai_api_key', 'gemini_api_key', 'claude_api_key', 'deepseek_api_key']
        );

        const providers: string[] = [];
        llmResult.rows.forEach(row => {
          if (row.value) {
            providers.push(row.key.replace('_api_key', ''));
          }
        });

        res.json({
          success: true,
          message: `LLM services configured: ${providers.join(', ') || 'none'}`
        });
        break;

      case 'smtp':
        // Test SMTP configuration
        const smtpResult = await asembPool.query(
          'SELECT key, value FROM settings WHERE key LIKE $1',
          ['smtp.%']
        );

        if (smtpResult.rows.length === 0) {
          res.json({
            success: true,
            message: 'No SMTP configuration found'
          });
        } else {
          const configuredProviders: string[] = [];
          smtpResult.rows.forEach(row => {
            if (row.key.includes('.enabled') && row.value === 'true') {
              const provider = row.key.split('.')[1];
              configuredProviders.push(provider);
            }
          });

          res.json({
            success: true,
            message: `SMTP services configured: ${configuredProviders.join(', ') || 'none'}`
          });
        }
        break;

      default:
        res.status(400).json({ error: `Unknown service: ${service}` });
    }
  } catch (error: any) {
    console.error(`Test connection error (${service}):`, error);
    res.status(500).json({
      success: false,
      error: error.message || 'Connection test failed'
    });
  }
});

// Refresh embedding settings
router.post('/embeddings/refresh', async (req: Request, res: Response) => {
  try {
    const { SemanticSearchService } = require('../services/semantic-search.service');
    const semanticSearch = new SemanticSearchService();

    await semanticSearch.refreshEmbeddingSettings();

    res.json({
      success: true,
      message: 'Embedding settings refreshed successfully'
    });
  } catch (error: any) {
    console.error('Error refreshing embedding settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to refresh embedding settings'
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

export default router;