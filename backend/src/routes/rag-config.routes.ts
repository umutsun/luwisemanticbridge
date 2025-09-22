import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

// Database connections
const asbPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

const lawPool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/postgres'
});

// Turkish law tables configuration
const TURKISH_LAW_TABLES = {
  OZELGELER: {
    name: 'OZELGELER',
    displayName: 'Özelgeler',
    searchColumns: ['KONU', 'OZET', 'MADDE_METNI'],
    database: 'postgres'
  },
  DANISTAYKARARLARI: {
    name: 'DANISTAYKARARLARI',
    displayName: 'Danıştay Kararları',
    searchColumns: ['KARAR_METNI', 'KARAR_OZETI'],
    database: 'postgres'
  },
  MAKALELER: {
    name: 'MAKALELER',
    displayName: 'Makaleler',
    searchColumns: ['BASLIK', 'ICERIK', 'OZET'],
    database: 'postgres'
  },
  SORUCEVAP: {
    name: 'SORUCEVAP',
    displayName: 'Soru-Cevap',
    searchColumns: ['SORU', 'CEVAP'],
    database: 'postgres'
  }
};

// Get RAG configuration
router.get('/config', async (req: Request, res: Response) => {
  try {
    // Get settings from database
    const settingsResult = await asbPool.query(`
      SELECT setting_key, setting_value
      FROM chatbot_settings
      WHERE setting_key IN ('ai_provider', 'openai_api_key', 'claude_api_key', 'gemini_api_key',
                           'system_prompt', 'temperature', 'max_tokens', 'fallback_enabled',
                           'openai_model', 'claude_model', 'gemini_model')
    `);
    
    const settings: { [key: string]: any } = {};
    settingsResult.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    // Get table statistics
    const tableStats = [];
    for (const [key, config] of Object.entries(TURKISH_LAW_TABLES)) {
      try {
        const countResult = await lawPool.query(
          `SELECT COUNT(*) as count FROM public."${config.name}"`
        );
        
        const embeddingResult = await lawPool.query(
          `SELECT COUNT(*) as count FROM public."${config.name}" WHERE embedding IS NOT NULL`
        );
        
        tableStats.push({
          tableName: config.name,
          displayName: config.displayName,
          totalRecords: parseInt(countResult.rows[0].count),
          embeddedRecords: parseInt(embeddingResult.rows[0].count),
          searchColumns: config.searchColumns,
          database: config.database
        });
      } catch (err) {
        console.error(`Error getting stats for ${config.name}:`, err);
      }
    }
    
    res.json({
      aiProvider: settings.ai_provider || 'openai',
      fallbackEnabled: settings.fallback_enabled === 'true',
      systemPrompt: settings.system_prompt || '',
      temperature: parseFloat(settings.temperature) || 0.1,
      maxTokens: parseInt(settings.max_tokens) || 2048,
      models: {
        openai: settings.openai_model || 'gpt-3.5-turbo',
        claude: settings.claude_model || 'claude-3-haiku-20240307',
        gemini: settings.gemini_model || 'gemini-1.5-flash'
      },
      tables: tableStats,
      apiKeys: {
        openai: !!settings.openai_api_key,
        claude: !!settings.claude_api_key,
        gemini: !!settings.gemini_api_key
      }
    });
  } catch (error) {
    console.error('Get RAG config error:', error);
    res.status(500).json({ error: 'Failed to fetch RAG configuration' });
  }
});

// Update RAG configuration
router.put('/config', async (req: Request, res: Response) => {
  try {
    const {
      aiProvider,
      fallbackEnabled,
      systemPrompt,
      temperature,
      maxTokens,
      openaiApiKey,
      claudeApiKey,
      geminiApiKey,
      openaiModel,
      claudeModel,
      geminiModel
    } = req.body;
    
    // Update settings in database
    const updates = [
      { key: 'ai_provider', value: aiProvider },
      { key: 'fallback_enabled', value: fallbackEnabled.toString() },
      { key: 'system_prompt', value: systemPrompt },
      { key: 'temperature', value: temperature.toString() },
      { key: 'max_tokens', value: maxTokens.toString() }
    ];
    
    if (openaiApiKey) {
      updates.push({ key: 'openai_api_key', value: openaiApiKey });
    }
    if (claudeApiKey) {
      updates.push({ key: 'claude_api_key', value: claudeApiKey });
    }
    if (geminiApiKey) {
      updates.push({ key: 'gemini_api_key', value: geminiApiKey });
    }
    if (openaiModel) {
      updates.push({ key: 'openai_model', value: openaiModel });
    }
    if (claudeModel) {
      updates.push({ key: 'claude_model', value: claudeModel });
    }
    if (geminiModel) {
      updates.push({ key: 'gemini_model', value: geminiModel });
    }
    
    for (const update of updates) {
      await asbPool.query(
        `INSERT INTO chatbot_settings (setting_key, setting_value) 
         VALUES ($1, $2) 
         ON CONFLICT (setting_key) 
         DO UPDATE SET setting_value = $2`,
        [update.key, update.value]
      );
    }
    
    res.json({ success: true, message: 'RAG configuration updated' });
  } catch (error) {
    console.error('Update RAG config error:', error);
    res.status(500).json({ error: 'Failed to update RAG configuration' });
  }
});

// Search in embedded documents
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, tables = Object.keys(TURKISH_LAW_TABLES), limit = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Get API key from settings
    const apiKeyResult = await asbPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'openai_api_key'"
    );
    const apiKey = apiKeyResult.rows[0]?.setting_value || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'OpenAI API key not configured' });
    }
    
    // Generate embedding for query
    const openai = new OpenAI({ apiKey });
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: query
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    
    // Search in each table
    const results = [];
    for (const tableName of tables) {
      if (!TURKISH_LAW_TABLES[tableName as keyof typeof TURKISH_LAW_TABLES]) continue;
      
      const config = TURKISH_LAW_TABLES[tableName as keyof typeof TURKISH_LAW_TABLES];
      
      try {
        // Perform vector similarity search
        const searchQuery = `
          SELECT *, 
                 1 - (embedding <=> $1::vector) as similarity
          FROM public."${config.name}"
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> $1::vector
          LIMIT $2
        `;
        
        const searchResult = await lawPool.query(searchQuery, [
          `[${queryEmbedding.join(',')}]`,
          limit
        ]);
        
        results.push(...searchResult.rows.map(row => ({
          ...row,
          table: config.displayName,
          tableName: config.name
        })));
      } catch (err) {
        console.error(`Search error in ${config.name}:`, err);
      }
    }
    
    // Sort by similarity and return top results
    results.sort((a, b) => b.similarity - a.similarity);
    
    res.json({
      query,
      results: results.slice(0, limit * 2),
      totalFound: results.length
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Chat with RAG
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, conversationId, useRag = true } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get settings
    const settingsResult = await asbPool.query(`
      SELECT setting_key, setting_value 
      FROM chatbot_settings 
      WHERE setting_key IN ('ai_provider', 'openai_api_key', 'claude_api_key', 
                           'gemini_api_key', 'system_prompt', 'temperature', 'max_tokens')
    `);
    
    const settings: { [key: string]: any } = {};
    settingsResult.rows.forEach(row => {
      settings[row.setting_key] = row.setting_value;
    });
    
    let context = '';
    
    // If RAG is enabled, search for relevant documents
    if (useRag) {
      const searchResponse = await fetch('http://localhost:8083/api/v2/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: message, 
          limit: 5 
        })
      });
      
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.results && searchData.results.length > 0) {
          context = searchData.results.map((r: any, i: number) => 
            `[Kaynak ${i + 1} - ${r.table}]: ${JSON.stringify(r)}`
          ).join('\n\n');
        }
      }
    }
    
    // Prepare the prompt
    const systemPrompt = settings.system_prompt || `Sen Türkiye vergi ve mali mevzuat konusunda uzman bir asistansın.
    Aşağıdaki bağlamda verilen bilgilere dayanarak cevap ver.`;
    
    const fullPrompt = useRag && context 
      ? `${systemPrompt}\n\nBağlam:\n${context}\n\nKullanıcı Sorusu: ${message}`
      : message;
    
    let response = '';
    const provider = settings.ai_provider || 'openai';
    
    try {
      // Try primary provider
      if (provider === 'openai' && settings.openai_api_key) {
        const openai = new OpenAI({ apiKey: settings.openai_api_key });
        const completion = await openai.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: useRag && context ? `Bağlam:\n${context}\n\nSoru: ${message}` : message }
          ],
          temperature: parseFloat(settings.temperature) || 0.1,
          max_tokens: parseInt(settings.max_tokens) || 2048
        });
        response = completion.choices[0].message.content || '';
      } else if (provider === 'claude' && settings.claude_api_key) {
        const anthropic = new Anthropic({ apiKey: settings.claude_api_key });
        const completion = await anthropic.messages.create({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: fullPrompt }],
          max_tokens: parseInt(settings.max_tokens) || 2048
        });
        response = completion.content[0].type === 'text' ? completion.content[0].text : '';
      } else if (provider === 'gemini' && settings.gemini_api_key) {
        const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
        const model = genAI.getGenerativeModel({ model: settings.gemini_model || 'gemini-pro' });
        const result = await model.generateContent(fullPrompt);
        response = result.response.text();
      }
    } catch (primaryError) {
      console.error(`Primary provider (${provider}) failed:`, primaryError);
      
      // Try fallback providers
      const fallbackProviders = ['openai', 'claude', 'gemini'].filter(p => p !== provider);
      
      for (const fallback of fallbackProviders) {
        try {
          if (fallback === 'openai' && settings.openai_api_key) {
            const openai = new OpenAI({ apiKey: settings.openai_api_key });
            const completion = await openai.chat.completions.create({
              model: settings.openai_model || 'gpt-3.5-turbo',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: useRag && context ? `Bağlam:\n${context}\n\nSoru: ${message}` : message }
              ],
              temperature: 0.1,
              max_tokens: parseInt(settings.max_tokens) || 2048
            });
            response = completion.choices[0].message.content || '';
            break;
          } else if (fallback === 'claude' && settings.claude_api_key) {
            const anthropic = new Anthropic({ apiKey: settings.claude_api_key });
            const completion = await anthropic.messages.create({
              model: settings.claude_model || 'claude-3-haiku-20240307',
              messages: [{ role: 'user', content: fullPrompt }],
              max_tokens: parseInt(settings.max_tokens) || 2048
            });
            response = completion.content[0].type === 'text' ? completion.content[0].text : '';
            break;
          } else if (fallback === 'gemini' && settings.gemini_api_key) {
            const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
            const model = genAI.getGenerativeModel({ model: settings.gemini_model || 'gemini-pro' });
            const result = await model.generateContent(fullPrompt);
            response = result.response.text();
            break;
          }
        } catch (fallbackError) {
          console.error(`Fallback provider (${fallback}) failed:`, fallbackError);
        }
      }
    }
    
    if (!response) {
      return res.status(500).json({ error: 'All AI providers failed' });
    }
    
    // Save conversation if needed
    if (conversationId) {
      await asbPool.query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
        [conversationId, 'user', message]
      );
      await asbPool.query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)`,
        [conversationId, 'assistant', response]
      );
    }
    
    res.json({
      response,
      context: useRag ? context : null,
      provider: settings.ai_provider
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Chat failed' });
  }
});

// Test AI providers
router.post('/test-provider', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey } = req.body;
    
    const testMessage = 'Merhaba, bu bir test mesajıdır. Lütfen kısa bir yanıt ver.';
    
    try {
      if (provider === 'openai') {
        const openai = new OpenAI({ apiKey });
        const completion = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo', // Use default for testing
          messages: [{ role: 'user', content: testMessage }],
          max_tokens: 50
        });
        res.json({ success: true, response: completion.choices[0].message.content });
      } else if (provider === 'claude') {
        const anthropic = new Anthropic({ apiKey });
        const completion = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307', // Use default for testing
          messages: [{ role: 'user', content: testMessage }],
          max_tokens: 50
        });
        res.json({ success: true, response: completion.content[0].type === 'text' ? completion.content[0].text : '' });
      } else if (provider === 'gemini') {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' }); // Use default for testing
        const result = await model.generateContent(testMessage);
        res.json({ success: true, response: result.response.text() });
      } else {
        res.status(400).json({ error: 'Invalid provider' });
      }
    } catch (error) {
      res.json({ success: false, error: (error as Error).message });
    }
  } catch (error) {
    console.error('Test provider error:', error);
    res.status(500).json({ error: 'Test failed' });
  }
});

// Prompts management
router.post('/prompts', async (req: Request, res: Response) => {
  try {
    const { prompt, temperature = 0.1, maxTokens = 2048, name = 'Custom System Prompt' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Save to chatbot_settings
    await asbPool.query(
      `INSERT INTO chatbot_settings (setting_key, setting_value)
       VALUES ('system_prompt', $1)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1`,
      [prompt]
    );

    // Save temperature and max tokens
    await asbPool.query(
      `INSERT INTO chatbot_settings (setting_key, setting_value)
       VALUES ('temperature', $1)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1`,
      [temperature.toString()]
    );

    await asbPool.query(
      `INSERT INTO chatbot_settings (setting_key, setting_value)
       VALUES ('max_tokens', $1)
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = $1`,
      [maxTokens.toString()]
    );

    res.json({
      success: true,
      message: 'Prompt saved successfully',
      prompt,
      temperature,
      maxTokens
    });
  } catch (error) {
    console.error('Save prompt error:', error);
    res.status(500).json({ error: 'Failed to save prompt' });
  }
});

// Get related topics based on user query
router.post('/related-topics', async (req: Request, res: Response) => {
  try {
    const { query, limit = 7, excludeIds = [] } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log(`🔍 Searching for related topics: "${query}" (limit: ${limit}, exclude: ${excludeIds.length} items)`);

    // Use semantic search to find related content
    const { semanticSearch } = require('../services/semantic-search.service');

    // Check if we should use unified embeddings or rag_data
    let useUnifiedEmbeddings = process.env.USE_UNIFIED_EMBEDDINGS === 'true';

    // Check database setting if not set in environment
    if (process.env.USE_UNIFIED_EMBEDDINGS === undefined) {
      try {
        const settingResult = await asbPool.query(
          "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'use_unified_embeddings'"
        );
        useUnifiedEmbeddings = settingResult.rows[0]?.setting_value === 'true';
      } catch (error) {
        // Default to false if setting not found
      }
    }

    let searchResults = [];
    if (useUnifiedEmbeddings) {
      searchResults = await semanticSearch.unifiedSemanticSearch(query, limit + 5); // Get more to filter
    } else {
      searchResults = await semanticSearch.hybridSearch(query, limit + 5); // Get more to filter
    }

    console.log(`Found ${searchResults.length} raw results for related topics`);

    // Filter out excluded IDs and apply relevance threshold
    const filteredResults = searchResults.filter(result => {
      const score = result.score || (result.similarity_score * 100) || 0;
      const resultId = result.id || result.source_id;

      // Exclude specified IDs and low-relevance results
      return score >= 40 && !excludeIds.includes(resultId?.toString());
    });

    // Sort by relevance score and limit results
    const sortedResults = filteredResults
      .sort((a, b) => {
        const scoreA = a.score || (a.similarity_score * 100) || 0;
        const scoreB = b.score || (b.similarity_score * 100) || 0;
        return scoreB - scoreA;
      })
      .slice(0, limit);

    console.log(`Filtered to ${sortedResults.length} related topics (score >= 40%, excluded ${excludeIds.length} items)`);

    // Format results for frontend
    const formattedResults = sortedResults.map((result, index) => {
      const score = result.score || (result.similarity_score * 100) || 0;
      const sourceTable = result.source_table || result.databaseInfo?.table || 'documents';

      // Determine category based on source table and content
      let category = 'Genel';
      if (sourceTable.toUpperCase().includes('OZELGE')) category = 'Özelge';
      else if (sourceTable.toUpperCase().includes('DANISTAY')) category = 'Danıştay Kararı';
      else if (sourceTable.toUpperCase().includes('MAKALE')) category = 'Makale';
      else if (sourceTable.toUpperCase().includes('SORUCEVAP')) category = 'Soru-Cevap';
      else if (sourceTable.toUpperCase().includes('MEVZUAT')) category = 'Mevzuat';

      // Generate a meaningful title
      let title = result.title || `${category} - Kaynak ${index + 1}`;

      // Clean up title prefixes
      title = title
        .replace(/^sorucevap -\s*/i, '')
        .replace(/^ozelgeler -\s*/i, '')
        .replace(/^danistaykararlari -\s*/i, '')
        .replace(/^makaleler -\s*/i, '')
        .replace(/ - ID: \d+/g, '')
        .replace(/ \(Part \d+\/\d+\)/g, '')
        .trim();

      // Truncate long titles
      if (title.length > 80) {
        title = title.substring(0, 77) + '...';
      }

      return {
        id: result.id || result.source_id || `related-${Date.now()}-${index}`,
        title: title,
        excerpt: result.excerpt || result.content || '',
        category: category,
        sourceTable: sourceTable,
        score: Math.round(score),
        relevanceScore: score,
        sourceId: result.source_id,
        metadata: result.metadata || {},
        databaseInfo: {
          table: sourceTable,
          id: result.source_id,
          hasMetadata: !!result.metadata
        },
        priority: index + 1,
        hasContent: !!(result.content || result.excerpt),
        contentLength: (result.content || result.excerpt || '').length
      };
    });

    res.json({
      query,
      results: formattedResults,
      totalFound: formattedResults.length,
      searchMethod: useUnifiedEmbeddings ? 'unified_embeddings' : 'hybrid_search'
    });

  } catch (error) {
    console.error('Related topics search error:', error);
    res.status(500).json({
      error: 'Failed to search related topics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get prompts
router.get('/prompts', async (req: Request, res: Response) => {
  try {
    // Get current system prompt and settings
    const result = await asbPool.query(`
      SELECT setting_key, setting_value
      FROM chatbot_settings
      WHERE setting_key IN ('system_prompt', 'temperature', 'max_tokens')
    `);

    const settings: { [key: string]: any } = {
      system_prompt: '',
      temperature: 0.1,
      max_tokens: 2048
    };

    result.rows.forEach(row => {
      if (row.setting_key === 'temperature' || row.setting_key === 'max_tokens') {
        settings[row.setting_key] = parseFloat(row.setting_value);
      } else {
        settings[row.setting_key] = row.setting_value;
      }
    });

    // Create a prompt object for the frontend
    const prompts = [{
      id: '1',
      name: 'Active System Prompt',
      prompt: settings.system_prompt,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }];

    res.json({ prompts });
  } catch (error) {
    console.error('Get prompts error:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// Update AI provider and LLM settings
router.put('/config', async (req: Request, res: Response) => {
  try {
    const { aiProvider, fallbackEnabled } = req.body;

    // Update settings in database
    await asbPool.query(`
      INSERT INTO chatbot_settings (setting_key, setting_value, updated_at)
      VALUES
        ('ai_provider', $1, NOW()),
        ('fallback_enabled', $2, NOW())
      ON CONFLICT (setting_key)
      DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_at = EXCLUDED.updated_at
    `, [aiProvider, fallbackEnabled?.toString() || 'false']);

    console.log(`AI Provider updated to: ${aiProvider}, Fallback: ${fallbackEnabled}`);

    res.json({
      success: true,
      message: 'AI provider settings updated',
      aiProvider,
      fallbackEnabled
    });
  } catch (error) {
    console.error('Update RAG config error:', error);
    res.status(500).json({ error: 'Failed to update RAG configuration' });
  }
});

// AI Settings endpoint (consolidated from rag-config)
router.get('/ai/settings', async (req: Request, res: Response) => {
  try {
    // Get all AI-related settings
    const keys = [
      'ai_provider',
      'fallback_enabled',
      'temperature',
      'max_tokens',
      'system_prompt',
      'openai_api_key',
      'claude_api_key',
      'gemini_api_key',
      'google_api_key',
      'openai_model',
      'claude_model',
      'gemini_model'
    ];

    const result = await asbPool.query(
      `SELECT setting_key, setting_value
       FROM chatbot_settings
       WHERE setting_key = ANY($1)`,
      [keys]
    );

    const settings: any = {
      aiProvider: 'openai',
      fallbackEnabled: false,
      temperature: 0.1,
      maxTokens: 2048,
      systemPrompt: '',
      models: {
        openai: 'gpt-3.5-turbo',
        claude: 'claude-3-haiku-20240307',
        gemini: 'gemini-1.5-flash'
      },
      apiKeys: {
        openai: false,
        claude: false,
        gemini: false
      }
    };

    result.rows.forEach(row => {
      const value = row.setting_value;

      switch(row.setting_key) {
        case 'ai_provider':
          settings.aiProvider = value;
          break;
        case 'fallback_enabled':
          settings.fallbackEnabled = value === 'true';
          break;
        case 'temperature':
          settings.temperature = parseFloat(value) || 0.1;
          break;
        case 'max_tokens':
          settings.maxTokens = parseInt(value) || 2048;
          break;
        case 'system_prompt':
          settings.systemPrompt = value;
          break;
        case 'openai_model':
          settings.models.openai = value;
          break;
        case 'claude_model':
          settings.models.claude = value;
          break;
        case 'gemini_model':
          settings.models.gemini = value;
          break;
        case 'openai_api_key':
          settings.apiKeys.openai = !!value;
          break;
        case 'claude_api_key':
          settings.apiKeys.claude = !!value;
          break;
        case 'gemini_api_key':
        case 'google_api_key':
          settings.apiKeys.gemini = !!value;
          break;
      }
    });

    res.json(settings);
  } catch (error) {
    console.error('Error fetching AI settings:', error);
    res.status(500).json({ error: 'Failed to fetch AI settings' });
  }
});

// Save AI settings
router.post('/ai/settings', async (req: Request, res: Response) => {
  try {
    const {
      aiProvider,
      fallbackEnabled,
      systemPrompt,
      temperature,
      maxTokens,
      openaiApiKey,
      claudeApiKey,
      geminiApiKey,
      openaiModel,
      claudeModel,
      geminiModel
    } = req.body;

    // Update settings in database
    const updates = [
      { key: 'ai_provider', value: aiProvider },
      { key: 'fallback_enabled', value: fallbackEnabled.toString() },
      { key: 'system_prompt', value: systemPrompt },
      { key: 'temperature', value: temperature.toString() },
      { key: 'max_tokens', value: maxTokens.toString() }
    ];

    if (openaiApiKey) {
      updates.push({ key: 'openai_api_key', value: openaiApiKey });
    }
    if (claudeApiKey) {
      updates.push({ key: 'claude_api_key', value: claudeApiKey });
    }
    if (geminiApiKey) {
      updates.push({ key: 'gemini_api_key', value: geminiApiKey });
    }
    if (openaiModel) {
      updates.push({ key: 'openai_model', value: openaiModel });
    }
    if (claudeModel) {
      updates.push({ key: 'claude_model', value: claudeModel });
    }
    if (geminiModel) {
      updates.push({ key: 'gemini_model', value: geminiModel });
    }

    for (const update of updates) {
      await asbPool.query(
        `INSERT INTO chatbot_settings (setting_key, setting_value)
         VALUES ($1, $2)
         ON CONFLICT (setting_key)
         DO UPDATE SET setting_value = $2`,
        [update.key, update.value]
      );
    }

    res.json({ success: true, message: 'AI settings updated' });
  } catch (error) {
    console.error('Update AI settings error:', error);
    res.status(500).json({ error: 'Failed to update AI settings' });
  }
});

export default router;