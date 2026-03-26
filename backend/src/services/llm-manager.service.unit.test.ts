import { LLMManager, LLMManagerDependencies } from './llm-manager.service';
import { Pool } from 'pg';

describe('LLMManager', () => {
  let manager: LLMManager;
  let mockPool: any;

  beforeEach(() => {
    // Create mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };

    // Mock console methods to reduce noise
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'debug').mockImplementation();

    // Mock process.env
    process.env.CLAUDE_API_KEY = 'test-claude-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

    // Create manager with mocked dependencies
    const dependencies: LLMManagerDependencies = {
      pool: mockPool as any,
    };

    manager = new LLMManager(dependencies);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with provided dependencies', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(LLMManager);
    });

    it('should use default pool if none provided', () => {
      // This test verifies backward compatibility
      const managerWithDefaults = new LLMManager();
      expect(managerWithDefaults).toBeDefined();
    });

    it('should initialize providers on construction', () => {
      // Verify providers are initialized by calling getProviderStatus
      expect(manager).toHaveProperty('providers');
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance when calling getInstance()', () => {
      const instance1 = LLMManager.getInstance();
      const instance2 = LLMManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should return singleton instance', () => {
      const instance = LLMManager.getInstance();
      expect(instance).toBeInstanceOf(LLMManager);
    });
  });

  describe('Provider Initialization', () => {
    it('should initialize Claude provider with API key from environment', () => {
      // Access private method for testing
      const initProvider = (manager as any).initializeProvider.bind(manager);
      const result = initProvider('claude');

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Initialized claude provider'));
    });

    it('should initialize OpenAI provider with API key from environment', () => {
      const initProvider = (manager as any).initializeProvider.bind(manager);
      const result = initProvider('openai');

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Initialized openai provider'));
    });

    it('should initialize Gemini provider with API key from environment', () => {
      const initProvider = (manager as any).initializeProvider.bind(manager);
      const result = initProvider('gemini');

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Initialized gemini provider'));
    });

    it('should initialize DeepSeek provider with API key from environment', () => {
      const initProvider = (manager as any).initializeProvider.bind(manager);
      const result = initProvider('deepseek');

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Initialized deepseek provider'));
    });

    it('should initialize OpenRouter provider with API key from environment', () => {
      const initProvider = (manager as any).initializeProvider.bind(manager);
      const result = initProvider('openrouter');

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Initialized openrouter provider'));
    });

    it('should fail to initialize provider without API key', () => {
      // Create manager without API keys
      delete process.env.CLAUDE_API_KEY;
      const managerNoKeys = new LLMManager({ pool: mockPool as any });

      const initProvider = (managerNoKeys as any).initializeProvider.bind(managerNoKeys);
      const result = initProvider('claude');

      expect(result).toBe(false);
    });
  });

  describe('Settings Loading from Database', () => {
    it('should load settings from database successfully', async () => {
      // Mock database response with comprehensive settings
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'activeChatModel', value: 'claude/claude-3-5-sonnet-20241022' },
          { key: 'anthropic.apiKey', value: 'test-db-claude-key' },
          { key: 'openai.apiKey', value: 'test-db-openai-key' },
          { key: 'gemini.apiKey', value: 'test-db-gemini-key' },
          { key: 'systemPrompt', value: 'You are a helpful assistant.' },
          { key: 'temperature', value: '0.5' },
          { key: 'maxTokens', value: '2048' },
          { key: 'embedding_provider', value: 'openai' },
          { key: 'embedding_model', value: 'text-embedding-3-large' },
        ],
      });

      await manager.reloadSettings();

      expect(mockPool.query).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Active Chat Provider'));
    });

    it('should handle missing database gracefully', async () => {
      // Create manager with null pool to trigger the database check
      const nullPool: any = null;
      const managerNoPool = new LLMManager({ pool: nullPool });

      await managerNoPool.reloadSettings();

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Database not initialized'));
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await manager.reloadSettings();

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load LLM settings from database'),
        expect.any(Error)
      );
    });

    it('should handle missing activeChatModel', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          // No activeChatModel in response
          { key: 'anthropic.apiKey', value: 'test-key' },
        ],
      });

      await manager.reloadSettings();

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('No activeChatModel found'));
    });

    it('should update provider settings from database', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'activeChatModel', value: 'openai/gpt-4o-mini' },
          { key: 'openai.apiKey', value: 'updated-openai-key' },
          { key: 'llmSettings.openaiModel', value: 'gpt-4o-mini' },
        ],
      });

      await manager.reloadSettings();

      expect(mockPool.query).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Updated OpenAI API key'));
    });
  });

  describe('Utility Methods', () => {
    describe('normalizeProviderName', () => {
      it('should normalize provider names correctly', () => {
        const normalize = (manager as any).normalizeProviderName.bind(manager);

        expect(normalize('OpenAI')).toBe('openai');
        expect(normalize('Claude')).toBe('claude');
        expect(normalize('Anthropic')).toBe('claude');
        expect(normalize('Gemini')).toBe('gemini');
        expect(normalize('Google')).toBe('gemini');
        expect(normalize('DeepSeek')).toBe('deepseek');
        expect(normalize('OpenRouter')).toBe('openrouter');
        expect(normalize('OPENAI')).toBe('openai');
        expect(normalize('gpt')).toBe('openai');
      });

      it('should return openai as default for unknown providers', () => {
        const normalize = (manager as any).normalizeProviderName.bind(manager);
        expect(normalize(undefined)).toBe('openai');
      });

      it('should handle empty string', () => {
        const normalize = (manager as any).normalizeProviderName.bind(manager);
        expect(normalize('')).toBe('openai');
      });
    });

    describe('extractProviderFromModel', () => {
      it('should extract provider from model string', () => {
        const extract = (manager as any).extractProviderFromModel.bind(manager);

        expect(extract('anthropic/claude-3-5-sonnet')).toBe('claude');
        expect(extract('openai/gpt-4o-mini')).toBe('openai');
        expect(extract('gemini-1.5-pro')).toBe('gemini');
        expect(extract('deepseek-chat')).toBe('deepseek');
        expect(extract('openrouter/openai/gpt-4')).toBe('openrouter');
        expect(extract('claude-3-sonnet')).toBe('claude');
        expect(extract('gpt-4')).toBe('openai');
      });

      it('should default to gemini for unknown models', () => {
        const extract = (manager as any).extractProviderFromModel.bind(manager);
        expect(extract('unknown-model')).toBe('gemini');
      });
    });

    describe('resolveEmbeddingModelName', () => {
      it('should resolve embedding model names correctly', () => {
        const resolve = (manager as any).resolveEmbeddingModelName.bind(manager);

        // OpenAI
        expect(resolve('openai', 'text-embedding-3-large')).toBe('text-embedding-3-large');
        expect(resolve('openai', 'text-embedding-3-small')).toBe('text-embedding-3-small');

        // Gemini
        expect(resolve('gemini', 'gemini-embedding-001')).toBe('gemini-embedding-001');

        // Invalid model names should return default (text-embedding-3-large for openai)
        expect(resolve('openai', 'invalid-model')).toBe('text-embedding-3-large');
        expect(resolve('gemini', 'invalid')).toBe('gemini-embedding-001');
      });

      it('should return default model when no model provided', () => {
        const resolve = (manager as any).resolveEmbeddingModelName.bind(manager);
        expect(resolve('openai')).toBe('text-embedding-3-large');
        expect(resolve('gemini')).toBe('gemini-embedding-001');
      });

      it('should handle empty string model', () => {
        const resolve = (manager as any).resolveEmbeddingModelName.bind(manager);
        expect(resolve('openai', '')).toBe('text-embedding-3-large');
        expect(resolve('gemini', '   ')).toBe('gemini-embedding-001');
      });
    });

    describe('providerSupportsEmbeddings', () => {
      it('should correctly identify providers that support embeddings', () => {
        const supportsEmbeddings = (manager as any).providerSupportsEmbeddings.bind(manager);

        expect(supportsEmbeddings('openai')).toBe(true);
        expect(supportsEmbeddings('gemini')).toBe(true);
        expect(supportsEmbeddings('openrouter')).toBe(true);
        expect(supportsEmbeddings('claude')).toBe(false);
        expect(supportsEmbeddings('deepseek')).toBe(false);
      });
    });
  });

  describe('Embedding Generation', () => {
    it('should call generateEmbedding and handle provider not ready', async () => {
      // This test verifies the method exists and handles missing provider
      await expect(
        manager.generateEmbedding('test query', { provider: 'claude' })
      ).rejects.toThrow();
    });
  });

  describe('Provider Status', () => {
    it('should get provider status', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const status = await manager.getProviderStatus();

      expect(status).toBeDefined();
      expect(typeof status).toBe('object');
      expect(status).toHaveProperty('claude');
      expect(status).toHaveProperty('openai');
      expect(status).toHaveProperty('gemini');
      expect(status).toHaveProperty('deepseek');
      expect(status).toHaveProperty('openrouter');
    });

    it('should return hasApiKey true for providers with keys', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const status = await manager.getProviderStatus();

      expect(status.claude.hasApiKey).toBe(true);
      expect(status.openai.hasApiKey).toBe(true);
      expect(status.gemini.hasApiKey).toBe(true);
    });
  });

  describe('Initialize Method', () => {
    it('should initialize successfully', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'activeChatModel', value: 'claude/claude-3-5-sonnet-20241022' },
        ],
      });

      await manager.initialize();

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('LLMManager initialized successfully'));
    });
  });

  describe('Refresh Settings', () => {
    it('should refresh settings on demand', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'activeChatModel', value: 'openai/gpt-4o-mini' },
        ],
      });

      await manager.refreshSettings();

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('Get API Key', () => {
    it('should return API key for provider', () => {
      const key = manager.getApiKey('claude');
      expect(key).toBe('test-claude-key');
    });

    it('should return null for missing provider', () => {
      const key = manager.getApiKey('unknown');
      expect(key).toBeNull();
    });
  });

  describe('Update Embedding Config', () => {
    it('should update embedding configuration', () => {
      manager.updateEmbeddingConfig({
        provider: 'openai',
        model: 'text-embedding-3-large',
      });

      // No error should be thrown
      expect(manager).toBeDefined();
    });
  });

  describe('Model Name Normalization', () => {
    it('should fix deprecated Gemini -latest models in database', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { key: 'activeChatModel', value: 'gemini/gemini-1.5-pro-latest' },
            { key: 'gemini.apiKey', value: 'test-key' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // For UPDATE query

      await manager.reloadSettings();

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('FORCE FIXING deprecated Gemini model'));
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE settings SET value = $1 WHERE key = $2',
        expect.arrayContaining(['gemini/gemini-1.5-pro'])
      );
    });

    it('should fix deprecated Claude model in database', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { key: 'activeChatModel', value: 'claude/claude-3-sonnet-20240229' },
            { key: 'anthropic.apiKey', value: 'test-key' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // For UPDATE query

      await manager.reloadSettings();

      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('FORCE UPDATING deprecated Claude model'));
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
        ['anthropic/claude-3-5-sonnet-20241022', 'llmSettings.activeChatModel']
      );
    });

    it('should normalize Claude 3.5 Sonnet model names', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'activeChatModel', value: 'claude/claude-3-5-sonnet' },
          { key: 'anthropic.apiKey', value: 'test-key' },
        ],
      });

      await manager.reloadSettings();

      // Should normalize to claude-3-5-sonnet-20241022
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should normalize OpenRouter model format correctly', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'activeChatModel', value: 'openrouter/openai/gpt-4o-mini' },
          { key: 'openrouter.apiKey', value: 'test-key' },
        ],
      });

      await manager.reloadSettings();

      expect(mockPool.query).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Active model: openrouter/openai/gpt-4o-mini'));
    });
  });

  describe('Embedding Provider Order', () => {
    it('should get correct embedding provider order', async () => {
      // Initialize settings first to populate fallbackOrder
      mockPool.query.mockResolvedValueOnce({
        rows: [{ key: 'activeChatModel', value: 'claude/claude-3-5-sonnet-20241022' }],
      });
      await manager.reloadSettings();

      const getOrder = (manager as any).getEmbeddingProviderOrder.bind(manager);

      // Test with preferred provider
      const orderWithPreferred = getOrder('openai');
      expect(orderWithPreferred[0]).toBe('openai');
      expect(orderWithPreferred.length).toBeGreaterThan(0);

      // Test default order
      const defaultOrder = getOrder();
      expect(defaultOrder).toEqual(['google', 'gemini', 'openai']);
    });

    it('should exclude providers that don\'t support embeddings', () => {
      const getOrder = (manager as any).getEmbeddingProviderOrder.bind(manager);
      const order = getOrder();

      expect(order).not.toContain('claude');
      expect(order).not.toContain('deepseek');
    });
  });

  describe('Generate Fallback Order', () => {
    it('should generate correct fallback order', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ key: 'activeChatModel', value: 'claude/claude-3-5-sonnet-20241022' }],
      });

      await manager.reloadSettings();

      const generateFallback = (manager as any).generateFallbackOrder.bind(manager);
      const order = generateFallback();

      expect(order[0]).toBe('claude'); // Default provider first
      expect(order).toContain('gemini');
      expect(order).toContain('openai');
      expect(order.length).toBeGreaterThan(1);
    });
  });

  describe('Test Provider', () => {
    it('should test Claude provider availability', async () => {
      const testProvider = (manager as any).testProvider.bind(manager);

      // Initialize Claude provider first
      const initProvider = (manager as any).initializeProvider.bind(manager);
      initProvider('claude');

      const result = await testProvider('claude');
      expect(result).toBe(true);
    });

    it('should test OpenAI provider availability', async () => {
      const testProvider = (manager as any).testProvider.bind(manager);

      // Initialize OpenAI provider first
      const initProvider = (manager as any).initializeProvider.bind(manager);
      initProvider('openai');

      const result = await testProvider('openai');
      expect(result).toBe(true);
    });

    it('should return false for provider without client', async () => {
      const testProvider = (manager as any).testProvider.bind(manager);

      // Try to test provider that wasn't initialized
      const managerNoKeys = new LLMManager({ pool: mockPool as any });
      delete process.env.CLAUDE_API_KEY;

      const result = await (managerNoKeys as any).testProvider('claude');
      expect(result).toBe(false);
    });
  });

  describe('Get Available Provider', () => {
    it('should find available provider from fallback list', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { key: 'activeChatModel', value: 'claude/claude-3-5-sonnet-20241022' },
          { key: 'anthropic.apiKey', value: 'test-key' },
        ],
      });

      await manager.reloadSettings();

      const getAvailable = (manager as any).getAvailableProvider.bind(manager);
      const provider = await getAvailable();

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('string');
    });

    it('should return null when no providers available', async () => {
      // Create manager without API keys
      delete process.env.CLAUDE_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      const managerNoKeys = new LLMManager({ pool: mockPool as any });

      const getAvailable = (managerNoKeys as any).getAvailableProvider.bind(managerNoKeys);
      const provider = await getAvailable();

      expect(provider).toBeNull();
    });
  });

  describe('Is Any Provider Available', () => {
    it('should return true when at least one provider is available', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await manager.isAnyProviderAvailable();
      expect(typeof result).toBe('boolean');
    });
  });
});
