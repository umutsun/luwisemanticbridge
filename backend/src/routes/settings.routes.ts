import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// Use the main database connection
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

// Get all settings
router.get('/all', async (req: Request, res: Response) => {
  try {
    const result = await pgPool.query('SELECT setting_key, setting_value FROM chatbot_settings');
    
    const settings: { [key: string]: string } = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Get specific setting
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const result = await pgPool.query(
      'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
      [key]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    
    res.json({ value: result.rows[0].setting_value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

// Update setting
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    // Check if setting exists
    const checkResult = await pgPool.query(
      'SELECT setting_key FROM chatbot_settings WHERE setting_key = $1',
      [key]
    );
    
    if (checkResult.rows.length === 0) {
      // Insert new setting
      await pgPool.query(
        'INSERT INTO chatbot_settings (setting_key, setting_value) VALUES ($1, $2)',
        [key, value]
      );
    } else {
      // Update existing setting
      await pgPool.query(
        'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
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
    const result = await pgPool.query(
      'SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key = ANY($1)',
      [keys]
    );
    
    const config: { [key: string]: string } = {
      host: '91.99.229.96',
      port: '5432',
      database: 'asemb',
      username: 'postgres',
      password: 'Semsiye!22'
    };
    
    result.rows.forEach(row => {
      switch(row.setting_key) {
        case 'db_host': config.host = row.setting_value; break;
        case 'db_port': config.port = row.setting_value; break;
        case 'db_name': config.database = row.setting_value; break;
        case 'db_user': config.username = row.setting_value; break;
        case 'db_password': config.password = row.setting_value; break;
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
    const checkResult = await pgPool.query(
      'SELECT setting_key FROM chatbot_settings WHERE setting_key = $1',
      ['openai_api_key']
    );
    
    if (checkResult.rows.length === 0) {
      // Insert new setting
      await pgPool.query(
        'INSERT INTO chatbot_settings (setting_key, setting_value) VALUES ($1, $2)',
        ['openai_api_key', apiKey]
      );
    } else {
      // Update existing setting
      await pgPool.query(
        'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
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
    const result = await pgPool.query(
      'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
      ['openai_api_key']
    );
    
    if (result.rows.length === 0) {
      return res.json({ apiKey: '' });
    }
    
    res.json({ apiKey: result.rows[0].setting_value });
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
      { key: 'ollama_base_url', value: ollamaBaseUrl || 'http://localhost:11434' },
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
      const checkResult = await pgPool.query(
        'SELECT setting_key FROM chatbot_settings WHERE setting_key = $1',
        [setting.key]
      );

      if (checkResult.rows.length === 0) {
        // Insert new setting
        await pgPool.query(
          'INSERT INTO chatbot_settings (setting_key, setting_value) VALUES ($1, $2)',
          [setting.key, setting.value]
        );
      } else {
        // Update existing setting
        await pgPool.query(
          'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
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

    const result = await pgPool.query(
      'SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key = ANY($1)',
      [keys]
    );

    const settings: any = {
      provider: 'openai',
      model: 'text-embedding-3-small',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaEmbeddingModel: 'nomic-embed-text',
      huggingfaceApiKey: '',
      chunkSize: 1000,
      chunkOverlap: 200,
      batchSize: 10,
      normalizeEmbeddings: true,
      cacheEmbeddings: true
    };

    result.rows.forEach(row => {
      switch(row.setting_key) {
        case 'embedding_provider':
          settings.provider = row.setting_value;
          break;
        case 'embedding_model':
          settings.model = row.setting_value;
          break;
        case 'ollama_base_url':
          settings.ollamaBaseUrl = row.setting_value;
          break;
        case 'ollama_embedding_model':
          settings.ollamaEmbeddingModel = row.setting_value;
          break;
        case 'huggingface_api_key':
          settings.huggingfaceApiKey = row.setting_value;
          break;
        case 'embedding_chunk_size':
          settings.chunkSize = parseInt(row.setting_value) || 1000;
          break;
        case 'embedding_chunk_overlap':
          settings.chunkOverlap = parseInt(row.setting_value) || 200;
          break;
        case 'embedding_batch_size':
          settings.batchSize = parseInt(row.setting_value) || 10;
          break;
        case 'embedding_normalize':
          settings.normalizeEmbeddings = row.setting_value === 'true';
          break;
        case 'embedding_cache':
          settings.cacheEmbeddings = row.setting_value !== 'false';
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
        const openaiKeyResult = await pgPool.query(
          'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
          ['openai_api_key']
        );

        if (!openaiKeyResult.rows.length || !openaiKeyResult.rows[0].setting_value) {
          return res.json({
            success: false,
            error: 'OpenAI API key bulunamadı. Lütfen AI Services sekmesinden ekleyin.'
          });
        }

        const openai = new (require('openai'))({
          apiKey: openaiKeyResult.rows[0].setting_value
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
        const axios = require('axios');

        // Test Ollama connection
        try {
          const response = await axios.post(`${ollamaBaseUrl || 'http://localhost:11434'}/api/embeddings`, {
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
          testResult = {
            success: false,
            error: `Ollama'ya bağlanılamadı. Lütfen Ollama'nın çalıştığından ve modelin yüklü olduğundan emin olun.`
          };
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
        testResult = {
          success: false,
          error: 'Geçersiz embedding provider.'
        };
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
    const result = await pgPool.query(
      'SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key LIKE $1',
      ['%prompt%']
    );

    const prompts: { [key: string]: string } = {
      system_prompt: 'You are a helpful assistant.',
      user_prompt_template: 'Question: {question}',
      // Add default prompts
    };

    result.rows.forEach(row => {
      prompts[row.setting_key] = row.setting_value;
    });

    res.json(prompts);
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// Get PostgreSQL status
router.get('/services/postgres/status', async (req: Request, res: Response) => {
  try {
    const start = Date.now();
    await pgPool.query('SELECT 1');
    const responseTime = Date.now() - start;

    res.json({
      status: 'connected',
      responseTime,
      maxConnections: pgPool.options.max || 20,
      totalConnections: pgPool.totalCount,
      idleConnections: pgPool.idleCount,
      waitingConnections: pgPool.waitingCount
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

    const result = await pgPool.query(
      'SELECT setting_key, setting_value FROM chatbot_settings WHERE setting_key = ANY($1)',
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
      switch(row.setting_key) {
        case 'active_chat_model':
          settings.activeChatModel = row.setting_value;
          break;
        case 'active_embedding_model':
          settings.activeEmbeddingModel = row.setting_value;
          break;
        case 'temperature':
          settings.temperature = parseFloat(row.setting_value);
          break;
        case 'top_p':
          settings.topP = parseFloat(row.setting_value);
          break;
        case 'max_tokens':
          settings.maxTokens = parseInt(row.setting_value);
          break;
        case 'presence_penalty':
          settings.presencePenalty = parseFloat(row.setting_value);
          break;
        case 'frequency_penalty':
          settings.frequencyPenalty = parseFloat(row.setting_value);
          break;
        case 'rag_weight':
          settings.ragWeight = parseInt(row.setting_value);
          break;
        case 'llm_knowledge_weight':
          settings.llmKnowledgeWeight = parseInt(row.setting_value);
          break;
        case 'stream_response':
          settings.streamResponse = row.setting_value === 'true';
          break;
        case 'system_prompt':
          settings.systemPrompt = row.setting_value;
          break;
        case 'response_style':
          settings.responseStyle = row.setting_value;
          break;
        case 'response_language':
          settings.language = row.setting_value;
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
      const checkResult = await pgPool.query(
        'SELECT setting_key FROM chatbot_settings WHERE setting_key = $1',
        [setting.key]
      );

      if (checkResult.rows.length === 0) {
        // Insert new setting
        await pgPool.query(
          'INSERT INTO chatbot_settings (setting_key, setting_value) VALUES ($1, $2)',
          [setting.key, setting.value]
        );
      } else {
        // Update existing setting
        await pgPool.query(
          'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
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
    const checkResult = await pgPool.query(
      'SELECT setting_key FROM chatbot_settings WHERE setting_key = $1',
      ['gemini_api_key']
    );

    if (checkResult.rows.length === 0) {
      // Insert new setting
      await pgPool.query(
        'INSERT INTO chatbot_settings (setting_key, setting_value) VALUES ($1, $2)',
        ['gemini_api_key', apiKey]
      );
    } else {
      // Update existing setting
      await pgPool.query(
        'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
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
    const result = await pgPool.query(
      'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
      ['gemini_api_key']
    );

    if (result.rows.length === 0) {
      return res.json({ apiKey: '' });
    }

    res.json({ apiKey: result.rows[0].setting_value });
  } catch (error) {
    console.error('Error fetching Gemini API key:', error);
    res.status(500).json({ error: 'Failed to fetch Gemini API key' });
  }
});

// AI Provider Priority endpoints
router.get('/ai-provider-priority', async (req: Request, res: Response) => {
  try {
    const result = await pgPool.query(
      'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
      ['ai_provider_priority']
    );

    if (result.rows.length === 0) {
      // Return default priority
      return res.json({
        priority: ['gemini', 'claude', 'openai', 'fallback']
      });
    }

    res.json({
      priority: JSON.parse(result.rows[0].setting_value)
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
    const checkResult = await pgPool.query(
      'SELECT setting_key FROM chatbot_settings WHERE setting_key = $1',
      ['ai_provider_priority']
    );

    if (checkResult.rows.length === 0) {
      // Insert new setting
      await pgPool.query(
        'INSERT INTO chatbot_settings (setting_key, setting_value) VALUES ($1, $2)',
        ['ai_provider_priority', JSON.stringify(priority)]
      );
    } else {
      // Update existing setting
      await pgPool.query(
        'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
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
    const result = await pgPool.query(
      'SELECT setting_value FROM chatbot_settings WHERE setting_key = $1',
      ['gemini_model']
    );

    if (result.rows.length === 0) {
      // Return default model
      return res.json({
        model: 'gemini-1.5-flash'
      });
    }

    res.json({
      model: result.rows[0].setting_value
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
    const checkResult = await pgPool.query(
      'SELECT setting_key FROM chatbot_settings WHERE setting_key = $1',
      ['gemini_model']
    );

    if (checkResult.rows.length === 0) {
      // Insert new setting
      await pgPool.query(
        'INSERT INTO chatbot_settings (setting_key, setting_value) VALUES ($1, $2)',
        ['gemini_model', model]
      );
    } else {
      // Update existing setting
      await pgPool.query(
        'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
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

export default router;