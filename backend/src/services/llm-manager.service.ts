import { asembPool } from '../config/database.config';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

export interface LLMProvider {
  name: string;
  apiKey: string;
  model: string;
  isInitialized: boolean;
  supportsEmbeddings?: boolean;
  embeddingModel?: string;
  client?: any;
}

export class LLMManager {
  private static instance: LLMManager;
  private providers: Map<string, LLMProvider> = new Map();
  private defaultProvider: string = 'gemini';  // Use Gemini as default since it has embeddings support
  private actualModel: string = 'claude-3-5-sonnet-20241022';
  private fallbackOrder: string[] = [];
  private lastSettingsCheck: number = 0;
  private readonly SETTINGS_CACHE_TTL = 30000; // 30 seconds
  private config: {
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
  } = {
    systemPrompt: 'Sen bir yardımcı asistansın.',
    temperature: 0.3,
    maxTokens: 4096
  };
  private embeddingConfig: { provider: string; model: string } = {
    provider: 'google',  // Use Google to avoid OpenAI API key issues
    model: 'text-embedding-004'
  };
  private lastLoggedConfig: { provider?: string; model?: string } = {};

  static getInstance(): LLMManager {
    if (!LLMManager.instance) {
      LLMManager.instance = new LLMManager();
    }
    return LLMManager.instance;
  }

  constructor() {
    this.initializeProviders();

    if (process.env.EMBEDDING_PROVIDER) {
      const normalizedProvider = this.normalizeProviderName(process.env.EMBEDDING_PROVIDER);
      this.embeddingConfig = {
        provider: normalizedProvider,
        model: this.resolveEmbeddingModelName(normalizedProvider, process.env.EMBEDDING_MODEL || this.embeddingConfig.model)
      };
    }

    this.loadSettingsFromDatabase();
    
    // EMERGENCY FIX: Immediately check and fix deprecated Claude model
    this.fixClaudeModel();
  }

  /**
   * Initialize all LLM providers with environment variables as fallback
   */
  private initializeProviders(): void {
    this.providers.set('claude', {
      name: 'claude',
      apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-3-5-sonnet-20241022',  // Correct Claude model name
      isInitialized: false,
      supportsEmbeddings: false
    });

    this.providers.set('openai', {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4o-mini',  // Correct OpenAI model name
      isInitialized: false,
      supportsEmbeddings: true,
      embeddingModel: 'text-embedding-3-large'
    });

    this.providers.set('gemini', {
      name: 'gemini',
      apiKey: process.env.GEMINI_API_KEY || '',
      model: 'gemini-1.5-flash-latest',  // Use valid Gemini model name
      isInitialized: false,
      supportsEmbeddings: true,
      embeddingModel: 'text-embedding-004'
    });

    this.providers.set('deepseek', {
      name: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      model: 'deepseek-chat',  // DeepSeek chat model
      isInitialized: false,
      supportsEmbeddings: false  // DeepSeek doesn't support embeddings
    });
  }

  /**
   * Load settings from database
   */
  private async loadSettingsFromDatabase(): Promise<void> {
    try {
      const result = await asembPool.query(`
        SELECT key, value
        FROM settings
        WHERE key IN (
          'activeChatModel',
          'llmSettings.activeChatModel',
          'systemPrompt',
          'llmSettings.systemPrompt',
          'temperature',
          'llmSettings.temperature',
          'maxTokens',
          'llmSettings.maxTokens',
          'anthropic.apiKey', 'claude.apiKey',
          'openai.apiKey',
          'google.apiKey', 'gemini.apiKey',
          'deepseek.apiKey',
          'llmSettings.claudeModel',
          'llmSettings.openaiModel',
          'llmSettings.geminiModel',
          'llmSettings.deepseekModel',
          'llmSettings.activeChatModel',
          'embedding_provider', 'embedding_model',
          'embeddings.provider', 'embeddings.model',
          'llmSettings.embeddingProvider', 'llmSettings.embeddingModel'
        )
      `);

      const settings: Record<string, any> = {};
      result.rows.forEach(row => {
        settings[row.key] = row.value;
      });

      // Update default provider - RESPECT DATABASE SETTINGS
      const activeModel = settings.activeChatModel || settings['llmSettings.activeChatModel'] || 'anthropic/claude-3-5-sonnet-20241022';
      const extractedProvider = this.extractProviderFromModel(activeModel);

      console.log(`🔧 Settings from DB - Active model: ${activeModel}, Extracted provider: ${extractedProvider}`);

      // IMPORTANT: Only change provider if it's different from current
      if (this.defaultProvider !== extractedProvider) {
        console.log(`🔄 Switching default provider from ${this.defaultProvider} to ${extractedProvider} based on database settings`);
        this.defaultProvider = extractedProvider;
      } else {
        console.log(`✅ Keeping current provider ${this.defaultProvider} as it matches database settings`);
      }

      // Store the actual model name without provider prefix
      this.actualModel = activeModel.includes('/') ? activeModel.split('/')[1] : activeModel;

      // FORCE UPDATE: Always replace deprecated Claude model
      if (this.actualModel === 'claude-3-sonnet-20240229') {
        console.warn('🔄 FORCE UPDATING deprecated Claude model claude-3-sonnet-20240229 to claude-3-5-sonnet-20241022');
        this.actualModel = 'claude-3-5-sonnet-20241022';
        
        // Also update the database setting to prevent future issues
        try {
          await asembPool.query(
            'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
            ['anthropic/claude-3-5-sonnet-20241022', 'llmSettings.activeChatModel']
          );
          console.log('✅ Updated active chat model in database');
        } catch (error) {
          console.warn('⚠️ Failed to update database setting:', error);
        }
      }
      // Map common model names to their actual API names
      else if (this.actualModel === 'claude-3-5-sonnet' || this.actualModel === 'claude-3-5-sonnet-20241022') {
        // Use latest Claude 3.5 Sonnet model
        this.actualModel = 'claude-3-5-sonnet-20241022';
      } else if (this.actualModel === 'claude-3-sonnet') {
        // Map deprecated model to latest version
        console.warn('⚠️ Deprecated Claude model detected, upgrading to claude-3-5-sonnet-20241022');
        this.actualModel = 'claude-3-5-sonnet-20241022';
      } else if (this.actualModel === 'claude-3-opus') {
        this.actualModel = 'claude-3-opus-20240229';
      } else if (this.actualModel === 'deepseek-chat') {
        this.actualModel = 'deepseek-chat'; // DeepSeek uses the same name
      } else if (this.actualModel === 'gemini-1.5-pro' || this.actualModel === 'gemini-pro') {
        // Map to valid Gemini model
        this.actualModel = 'gemini-1.5-pro-latest';
      } else if (this.actualModel === 'gemini-1.5-flash') {
        this.actualModel = 'gemini-1.5-flash-latest';
      }

      // Store configuration
      this.config = {
        systemPrompt: settings.systemPrompt || settings['llmSettings.systemPrompt'] || 'Sen bir yardımcı asistansın.',
        temperature: parseFloat(settings.temperature || settings['llmSettings.temperature'] || '0.3'),
        maxTokens: parseInt(settings.maxTokens || settings['llmSettings.maxTokens'] || '4096')
      };

      // Update API keys and models
      this.updateProviderSettings('claude', {
        apiKey: settings['anthropic.apiKey'] || settings['claude.apiKey'] || this.providers.get('claude')?.apiKey,
        model: this.actualModel === 'claude-3-sonnet-20240229' ? 'claude-3-5-sonnet-20241022' : (this.actualModel || 'claude-3-5-sonnet-20241022')
      });

      this.updateProviderSettings('openai', {
        apiKey: settings['openai.apiKey'] || this.providers.get('openai')?.apiKey,
        model: settings['llmSettings.openaiModel'] || 'gpt-4o-mini'  // Correct default model
      });

      this.updateProviderSettings('gemini', {
        apiKey: settings['google.apiKey'] || settings['gemini.apiKey'] || this.providers.get('gemini')?.apiKey,
        model: settings['llmSettings.geminiModel'] || 'gemini-1.5-flash-latest'  // Use valid model name
      });

      this.updateProviderSettings('deepseek', {
        apiKey: settings['deepseek.apiKey'] || this.providers.get('deepseek')?.apiKey,
        model: settings['llmSettings.deepseekModel'] || 'deepseek-chat'
      });

      const embeddingProviderSetting = settings['embedding_provider'] || settings['embeddings.provider'] || settings['llmSettings.embeddingProvider'];
      const embeddingModelSetting = settings['embedding_model'] || settings['embeddings.model'] || settings['llmSettings.embeddingModel'];
      if (embeddingProviderSetting || embeddingModelSetting) {
        const normalizedProvider = this.normalizeProviderName(embeddingProviderSetting || this.embeddingConfig.provider);
        this.embeddingConfig = {
          provider: normalizedProvider,
          model: this.resolveEmbeddingModelName(normalizedProvider, embeddingModelSetting || this.embeddingConfig.model)
        };
      }

      // Set fallback order (default provider first, then others)
      this.fallbackOrder = this.generateFallbackOrder();

      // Only log on startup or when changed
      if (!this.lastLoggedConfig || this.lastLoggedConfig.provider !== this.defaultProvider || this.lastLoggedConfig.model !== this.actualModel) {
        console.log(`🤖 LLM Manager - Default provider: ${this.defaultProvider}`);
        console.log(`🤖 LLM Manager - Model: ${this.actualModel}`);
        console.log(`🤖 LLM Manager - Fallback order: ${this.fallbackOrder.join(', ')}`);
        this.lastLoggedConfig = { provider: this.defaultProvider, model: this.actualModel };
      }

    } catch (error) {
      console.warn('⚠️ Failed to load LLM settings from database:', error);
    }
  }

  /**
   * Extract provider name from model string (e.g., "anthropic/claude-3-sonnet" -> "claude")
   */
  private extractProviderFromModel(modelString: string): string {
    if (modelString.includes('claude') || modelString.includes('anthropic')) return 'claude';
    if (modelString.includes('openai') || modelString.includes('gpt')) return 'openai';
    if (modelString.includes('gemini') || modelString.includes('google')) return 'gemini';
    if (modelString.includes('deepseek')) return 'deepseek';
    return 'gemini';  // Default to Gemini since it has embeddings support
  }

  private normalizeProviderName(provider?: string): string {
    if (!provider) {
      return 'openai';
    }
    const normalized = provider.toLowerCase();
    if (normalized.includes('claude') || normalized.includes('anthropic')) {
      return 'claude';
    }
    if (normalized.includes('gemini') || normalized.includes('google')) {
      return 'gemini';
    }
    if (normalized.includes('deepseek')) {
      return 'deepseek';
    }
    if (normalized.includes('openai') || normalized.includes('gpt')) {
      return 'openai';
    }
    return normalized;
  }

  private resolveEmbeddingModelName(provider: string, requestedModel?: string): string {
    const prov = this.providers.get(provider);
    const defaultModel = prov?.embeddingModel || (provider === 'gemini' ? 'text-embedding-004' : 'text-embedding-3-small');

    if (!requestedModel) {
      return defaultModel;
    }

    const trimmed = requestedModel.trim();
    if (!trimmed) {
      return defaultModel;
    }

    if (provider === 'openai' && !trimmed.startsWith('text-embedding')) {
      return defaultModel;
    }

    if (provider === 'gemini' && !trimmed.toLowerCase().includes('embedding')) {
      return defaultModel;
    }

    return trimmed;
  }

  private providerSupportsEmbeddings(provider: string): boolean {
    const prov = this.providers.get(provider);
    return !!prov?.supportsEmbeddings;
  }

  private getEmbeddingProviderOrder(preferredProvider?: string): string[] {
    // DeepSeek doesn't support embeddings, so exclude it from embeddings
    // Google embeddings are prioritized for performance
    const embeddingProviders = ['google', 'openai', 'gemini'];
    const fallback = [...this.fallbackOrder].filter(p => embeddingProviders.includes(p));
    const normalizedPreferred = preferredProvider ? this.normalizeProviderName(preferredProvider) : undefined;

    if (normalizedPreferred && embeddingProviders.includes(normalizedPreferred)) {
      return Array.from(new Set([normalizedPreferred, ...fallback]));
    }

    // Default order: Google -> Gemini -> OpenAI (Gemini prioritized since it's default)
    return ['google', 'gemini', 'openai'];
  }

  /**
   * Update provider settings
   */
  private updateProviderSettings(provider: string, settings: { apiKey?: string; model?: string; embeddingModel?: string; supportsEmbeddings?: boolean }): void {
    const prov = this.providers.get(provider);
    if (prov) {
      const apiKeyChanged = settings.apiKey !== undefined && settings.apiKey !== prov.apiKey;

      if (settings.apiKey !== undefined) prov.apiKey = settings.apiKey;
      if (settings.model !== undefined) prov.model = settings.model;
      if (settings.embeddingModel !== undefined) prov.embeddingModel = settings.embeddingModel;
      if (settings.supportsEmbeddings !== undefined) prov.supportsEmbeddings = settings.supportsEmbeddings;

      // Only reset initialization if API key changed (requires new client)
      if (apiKeyChanged) {
        prov.isInitialized = false;
        prov.client = undefined; // Clear the old client
        console.log(`🔄 API key changed for ${provider}, client will be reinitialized`);
      }
    }
  }

  /**
   * Generate fallback order - Use active provider first, then proper fallbacks (excluding DeepSeek)
   */
  private generateFallbackOrder(): string[] {
    // Define fallback order with DeepSeek first since it's working
    const workingFallbacks = ['deepseek', 'claude', 'gemini', 'openai'];
    const order = [this.defaultProvider];

    // Add all providers in order
    for (const p of workingFallbacks) {
      if (p !== this.defaultProvider) {
        order.push(p);
      }
    }

    console.log(`🎯 Fallback order: ${order.join(' -> ')}`);
    return Array.from(new Set(order)); // Remove duplicates
  }

  /**
   * Refresh settings if cache expired
   */
  private async refreshSettingsIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now - this.lastSettingsCheck > this.SETTINGS_CACHE_TTL) {
      this.lastSettingsCheck = now;
      await this.loadSettingsFromDatabase();
    }
  }

  /**
   * Initialize a provider client
   */
  private initializeProvider(provider: string): boolean {
    const prov = this.providers.get(provider);
    if (!prov || !prov.apiKey) return false;

    try {
      switch (provider) {
        case 'claude':
          console.log('🔧 Initializing Claude provider with API key:', prov.apiKey ? '✅ Present' : '❌ Missing');
          prov.client = new Anthropic({ apiKey: prov.apiKey });
          console.log('✅ Claude client created successfully');
          break;
        case 'openai':
          prov.client = new OpenAI({ apiKey: prov.apiKey });
          break;
        case 'gemini':
          prov.client = new GoogleGenerativeAI(prov.apiKey);
          break;
        case 'deepseek':
          console.log('🔧 Initializing DeepSeek provider with API key:', prov.apiKey ? '✅ Present' : '❌ Missing');
          try {
            const deepseekClient = new OpenAI({
              apiKey: prov.apiKey,
              baseURL: 'https://api.deepseek.com'
            });
            prov.client = deepseekClient;
            console.log('✅ DeepSeek OpenAI client created successfully');
            console.log('🔍 Verification - Client after assignment:', {
              hasClient: !!prov.client,
              clientType: typeof prov.client,
              hasChat: !!(prov.client && (prov.client as any).chat),
              hasCompletions: !!(prov.client && (prov.client as any).chat && (prov.client as any).chat.completions),
              hasCreate: !!(prov.client && (prov.client as any).chat && (prov.client as any).chat.completions && (prov.client as any).chat.completions.create)
            });
          } catch (error) {
            console.error('❌ Failed to create DeepSeek client:', error);
            return false;
          }
          break;
      }
      prov.isInitialized = true;
      console.log(`✅ Initialized ${provider} provider`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to initialize ${provider}:`, error);
      return false;
    }
  }

  /**
   * Get available provider with fallback
   */
  private async getAvailableProvider(): Promise<string | null> {
    await this.refreshSettingsIfNeeded();

    for (const provider of this.fallbackOrder) {
      const prov = this.providers.get(provider);
      if (!prov) continue;

      if (!prov.isInitialized) {
        if (!this.initializeProvider(provider)) continue;
      }

      // Test connection with a simple request
      if (await this.testProvider(provider)) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Test if provider is working
   */
  private async testProvider(provider: string): Promise<boolean> {
    const prov = this.providers.get(provider);
    if (!prov || !prov.client) return false;

    try {
      // Simple test - this could be enhanced per provider
      switch (provider) {
        case 'claude':
          // Claude doesn't have a simple test method, just check if client exists
          return true;
        case 'openai':
        case 'deepseek':
          await prov.client.models.list();
          return true;
        case 'gemini':
          await prov.client.getGenerativeModel({ model: prov.model });
          return true;
        default:
          return true;
      }
    } catch (error) {
      console.warn(`⚠️ Provider ${provider} test failed:`, error);
      prov.isInitialized = false;
      return false;
    }
  }

  /**
   * Generate embedding using available LLM provider
   */
  async generateEmbedding(text: string, options: { provider?: string; model?: string } = {}): Promise<number[]> {
    await this.refreshSettingsIfNeeded();

    // Force embedding provider to be one that supports embeddings
    let preferredProvider = options.provider || this.embeddingConfig.provider;
    preferredProvider = this.normalizeProviderName(preferredProvider);

    // If requested provider doesn't support embeddings, skip it
    if (!this.providerSupportsEmbeddings(preferredProvider)) {
      console.warn(`[LLMManager] Provider ${preferredProvider} doesn't support embeddings, using fallback...`);
      preferredProvider = this.embeddingConfig.provider; // Use default embedding provider
    }

    const providerOrder = this.getEmbeddingProviderOrder(preferredProvider);
    const errors: string[] = [];

    for (const provider of providerOrder) {
      const prov = this.providers.get(provider);
      if (!prov || !prov.apiKey) {
        continue;
      }

      if (!this.providerSupportsEmbeddings(provider)) {
        console.log(`[LLMManager] Skipping ${provider} - doesn't support embeddings`);
        continue;
      }

      if (!prov.isInitialized) {
        if (!this.initializeProvider(provider)) {
          continue;
        }
      }

      try {
        const model = this.resolveEmbeddingModelName(provider, provider === preferredProvider ? (options.model || this.embeddingConfig.model) : undefined);
        const embedding = await this.generateEmbeddingWithProvider(text, provider, model);
        console.log(`[LLMManager] Generated embedding using ${provider} (${model})`);
        return embedding;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[LLMManager] Embedding generation failed with ${provider}:`, message);
        errors.push(`${provider}: ${message}`);
      }
    }

    throw new Error(`All embedding providers failed${errors.length ? ` (${errors.join('; ')})` : ''}`);
  }


  /**
   * Generate embedding with specific provider
   */
  private async generateEmbeddingWithProvider(text: string, provider: string, model?: string): Promise<number[]> {
    const prov = this.providers.get(provider);
    if (!prov || !prov.client) {
      throw new Error(`Provider ${provider} not available`);
    }

    switch (provider) {
      case 'openai': {
        const response = await prov.client.embeddings.create({
          model: model || prov.embeddingModel || 'text-embedding-3-small',
          input: text
        });
        return response.data[0].embedding;
      }
      case 'gemini': {
        const geminiModel = prov.client.getGenerativeModel({ model: model || prov.embeddingModel || 'text-embedding-004' });
        const response = await geminiModel.embedContent({
          content: {
            parts: [{ text }]
          }
        });
        const values = response.embedding?.values;
        if (!values || !values.length) {
          throw new Error('Gemini embedding response did not include values');
        }
        return values;
      }
      default:
        throw new Error(`Provider ${provider} does not support embeddings`);
    }
  }


  /**
   * Generate chat response using available LLM provider
   */
  async generateChatResponse(
    message: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string;
      preferredProvider?: string; // Add preferred provider option
    } = {}
  ): Promise<{ content: string; provider: string; model: string; fallbackUsed?: boolean }> {
    await this.refreshSettingsIfNeeded();

    // Use provided options || fall back to config from database
    // Check if temperature is explicitly provided (not undefined)
    const temperature = options.temperature !== undefined ? options.temperature : this.config.temperature;
    const maxTokens = options.maxTokens !== undefined ? options.maxTokens : this.config.maxTokens;
    const systemPrompt = options.systemPrompt !== undefined ? options.systemPrompt : this.config.systemPrompt;

    console.log(`🌡️ LLM Manager - options.temperature: ${options.temperature}, final temperature: ${temperature}`);

    // Try the preferred provider first (default provider or user's choice)
    const preferredProvider = options.preferredProvider || this.defaultProvider;
    let provider = preferredProvider;

    // Check if preferred provider is available
    const prov = this.providers.get(provider);
    console.log(`🔍 Provider ${provider} state:`, {
      hasProvider: !!prov,
      isInitialized: prov?.isInitialized,
      hasApiKey: !!prov?.apiKey,
      hasClient: !!prov?.client,
      clientType: typeof prov?.client
    });

    // IMPORTANT: Don't try fallbacks if this is the active provider from settings
    // Only try fallbacks if this is a user-specified preferred provider that fails
    const isFromSettings = !options.preferredProvider; // If no preferred provider specified, this is from settings

    if (!prov || !prov.isInitialized || !prov.apiKey) {
      if (isFromSettings) {
        // This is the active provider from settings - initialize it instead of falling back
        console.log(`🔧 Initializing active provider from settings: ${provider}`);
        if (!this.initializeProvider(provider)) {
          throw new Error(`Active provider ${provider} failed to initialize. Please check configuration.`);
        }
      } else {
        // User specified a different provider - try fallbacks
        console.log(`⚠️ Preferred provider ${provider} not available, trying fallback...`);
        const availableProvider = await this.getAvailableProvider();
        if (!availableProvider) {
          throw new Error('LLM e bağlanılamadı. Lütfen API anahtarlarınızı kontrol edin.');
        }
        provider = availableProvider;
      }
    }

    if (!provider) {
      throw new Error('LLM e bağlanılamadı. Lütfen API anahtarlarınızı kontrol edin.');
    }

    const activeProv = this.providers.get(provider);
    if (!activeProv || !activeProv.client) {
      throw new Error(`Provider ${provider} not initialized`);
    }

    console.log(`🤖 Using ${provider} for chat response${provider !== preferredProvider ? ' (FALLBACK)' : ''}`);

    try {
      switch (provider) {
        case 'claude':
          if (!prov?.isInitialized || !prov?.client) {
            if (!this.initializeProvider(provider)) {
              throw new Error('Claude client is not initialized');
            }
          }

          console.log(`🤖 Calling Claude with model: ${prov!.model}, maxTokens: ${maxTokens}, temperature: ${temperature}`);

          const claudeResponse = await prov!.client.messages.create({
            model: prov!.model,
            max_tokens: maxTokens,
            temperature: temperature,
            system: systemPrompt,
            messages: [{ role: 'user', content: message }]
          });

          console.log(`✅ Claude response received, content blocks: ${claudeResponse.content?.length || 0}`);

          // Extract text content from Claude response
          let content = '';
          if (claudeResponse.content && claudeResponse.content.length > 0) {
            const textBlock = claudeResponse.content.find((block: any) => block.type === 'text');
            if (textBlock && textBlock.text) {
              content = textBlock.text;
            }
          }

          return {
            content: content,
            provider: 'Claude',
            model: prov!.model,
            fallbackUsed: provider !== preferredProvider
          };

        case 'openai':
          if (!prov?.isInitialized || !prov?.client) {
            if (!this.initializeProvider(provider)) {
              throw new Error('OpenAI client is not initialized');
            }
          }
          const openaiResponse = await prov!.client.chat.completions.create({
            model: prov!.model,
            max_tokens: maxTokens,
            temperature: temperature,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ]
          });
          return {
            content: openaiResponse.choices[0].message.content || '',
            provider: 'OpenAI',
            model: prov!.model,
            fallbackUsed: provider !== preferredProvider
          };

        case 'gemini':
          if (!prov?.isInitialized || !prov?.client) {
            if (!this.initializeProvider(provider)) {
              throw new Error('Gemini client is not initialized');
            }
          }
          // Check if client is properly initialized
          if (!prov?.client || typeof prov!.client.getGenerativeModel !== 'function') {
            throw new Error('Gemini client is not properly initialized');
          }

          // Map model names to valid Gemini models
          let geminiModelName = prov!.model;
          if (geminiModelName === 'gemini-1.5-pro') {
            geminiModelName = 'gemini-1.5-pro-latest';
          } else if (geminiModelName === 'gemini-1.5-flash') {
            geminiModelName = 'gemini-1.5-flash-latest';
          } else if (!geminiModelName.includes('gemini-')) {
            // Fallback to flash if invalid model
            geminiModelName = 'gemini-1.5-flash-latest';
          }

          const geminiModel = prov!.client.getGenerativeModel({ model: geminiModelName });

          // Gemini API expects a different format - no role field, just parts
          // Create the content parts properly
          const parts = [];
          
          // Add system prompt as a regular instruction
          if (systemPrompt) {
            parts.push({ text: `System: ${systemPrompt}` });
          }
          
          // Add user message
          parts.push({ text: message });
          
          // Generate content with proper format
          const geminiResponse = await geminiModel.generateContent({
            contents: [{ parts }]
          });
          
          return {
            content: geminiResponse.response.text() || '',
            provider: 'Gemini',
            model: geminiModelName,
            fallbackUsed: provider !== preferredProvider
          };

        case 'deepseek':
          // Force initialization every time for reliability
          console.log('🔧 Force initializing DeepSeek provider...');
          if (!this.initializeProvider(provider)) {
            throw new Error('DeepSeek client is not initialized');
          }
          // Triple-check after initialization
          if (!prov?.client) {
            console.error('❌ DeepSeek client is null after initialization');
            throw new Error('DeepSeek client creation failed');
          }
          console.log('✅ DeepSeek client verified:', {
            hasClient: !!prov!.client,
            isInitialized: prov!.isInitialized,
            hasChat: !!(prov!.client && (prov!.client as any).chat),
            hasCompletions: !!(prov!.client && (prov!.client as any).chat && (prov!.client as any).chat.completions)
          });
          // Ensure we're using the correct model name
          const deepseekModel = this.actualModel || prov!.model || 'deepseek-chat';
          console.log(`🤖 Using DeepSeek model: ${deepseekModel}`);
          const deepseekResponse = await prov!.client.chat.completions.create({
            model: deepseekModel,
            max_tokens: maxTokens,
            temperature: temperature,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ]
          });
          return {
            content: deepseekResponse.choices[0].message.content || '',
            provider: 'DeepSeek',
            model: deepseekModel,
            fallbackUsed: provider !== preferredProvider
          };

        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error: any) {
      console.error(`❌ Chat response failed with ${provider}:`, error);
      console.error(`Error details:`, {
        name: error.name,
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        type: error.type,
        error: error.error
      });

      // IMPORTANT: Don't use fallbacks for the active provider from settings
      // Only fallback if this was a user-specified preferred provider
      const isFromSettings = !options.preferredProvider;

      if (!isFromSettings && provider === preferredProvider) {
        console.log(`⚠️ User-specified provider ${provider} failed, trying fallback providers...`);

        // Try fallback providers (only for user-specified providers)
        const currentIndex = this.fallbackOrder.indexOf(provider);
        const nextProviders = this.fallbackOrder.slice(currentIndex + 1);

        for (const nextProvider of nextProviders) {
          try {
            console.log(`🔄 Falling back to ${nextProvider}...`);
            const nextProv = this.providers.get(nextProvider);
            if (nextProv && nextProv.apiKey) {
              if (!nextProv.isInitialized) {
                if (!this.initializeProvider(nextProvider)) {
                  console.warn(`⚠️ Failed to initialize fallback provider ${nextProvider}`);
                  continue;
                }
              }

              // Recursive call with fallback provider as preferred
              const result = await this.generateChatResponse(message, {
                ...options,
                preferredProvider: nextProvider
              });

              // Mark that fallback was used
              return {
                ...result,
                fallbackUsed: true
              };
            }
          } catch (e) {
            console.warn(`⚠️ Fallback to ${nextProvider} also failed:`, e);
          }
        }
      } else if (isFromSettings) {
        // This is the active provider from settings - try fallbacks to production providers only
        console.log(`⚠️ Active provider ${provider} from settings failed, trying fallback to production providers...`);

        // Try fallback providers (only production providers: Claude, Gemini, OpenAI)
        const currentIndex = this.fallbackOrder.indexOf(provider);
        const nextProviders = this.fallbackOrder.slice(currentIndex + 1);

        for (const nextProvider of nextProviders) {
          // Skip DeepSeek in fallbacks for production
          if (nextProvider === 'deepseek') {
            console.log(`⏭️ Skipping DeepSeek in fallbacks (testing only)`);
            continue;
          }

          try {
            console.log(`🔄 Falling back to ${nextProvider}...`);
            const nextProv = this.providers.get(nextProvider);
            if (nextProv && nextProv.apiKey) {
              if (!nextProv.isInitialized) {
                if (!this.initializeProvider(nextProvider)) {
                  console.warn(`⚠️ Failed to initialize fallback provider ${nextProvider}`);
                  continue;
                }
              }

              // Recursive call with fallback provider as preferred
              const result = await this.generateChatResponse(message, {
                ...options,
                preferredProvider: nextProvider
              });

              // Mark that fallback was used
              return {
                ...result,
                fallbackUsed: true
              };
            }
          } catch (e) {
            console.warn(`⚠️ Fallback to ${nextProvider} also failed:`, e);
          }
        }

        console.error(`❌ All production providers failed for active model ${provider}`);
      }

      throw new Error(`LLM provider ${provider} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if any provider is available
   */
  async isAnyProviderAvailable(): Promise<boolean> {
    const provider = await this.getAvailableProvider();
    return provider !== null;
  }

  /**
   * Get current provider status
   */
  async getProviderStatus(): Promise<Record<string, { available: boolean; model: string; hasApiKey: boolean }>> {
    await this.refreshSettingsIfNeeded();

    const status: Record<string, { available: boolean; model: string; hasApiKey: boolean }> = {};

    for (const [name, prov] of this.providers) {
      status[name] = {
        available: !!prov.apiKey && await this.testProvider(name),
        model: prov.model,
        hasApiKey: !!prov.apiKey
      };
    }

    return status;
  }

  /**
   * Force refresh of settings
   */
  async refreshSettings(): Promise<void> {
    this.lastSettingsCheck = 0;
    await this.loadSettingsFromDatabase();
  }

  /**
   * EMERGENCY FIX: Immediately check and fix deprecated Claude model
   */
  private async fixClaudeModel(): Promise<void> {
    try {
      // Check if we're using the deprecated model
      if (this.actualModel === 'claude-3-sonnet-20240229' ||
          this.defaultProvider === 'claude' && this.providers.get('claude')?.model === 'claude-3-sonnet-20240229') {
        
        console.warn('🚨 EMERGENCY: Detected deprecated Claude model, fixing immediately...');
        
        // Update to the new model
        const newModel = 'claude-3-5-sonnet-20241022';
        this.actualModel = newModel;
        
        // Update provider settings
        this.updateProviderSettings('claude', {
          model: newModel,
          apiKey: this.providers.get('claude')?.apiKey
        });
        
        // Fix in database immediately
        try {
          await asembPool.query(
            'UPDATE chatbot_settings SET setting_value = $1 WHERE setting_key = $2',
            [`anthropic/${newModel}`, 'llmSettings.activeChatModel']
          );
          
          await asembPool.query(
            'UPDATE settings SET value = $1 WHERE key = $2',
            [`anthropic/${newModel}`, 'activeChatModel']
          );
          
          console.log('✅ EMERGENCY: Fixed Claude model in database');
        } catch (dbError) {
          console.error('❌ EMERGENCY: Failed to fix Claude model in database:', dbError);
        }
      }
    } catch (error) {
      console.error('❌ EMERGENCY: Error in fixClaudeModel:', error);
    }
  }

  updateEmbeddingConfig(config: { provider?: string; model?: string }): void {
    const provider = config.provider ? this.normalizeProviderName(config.provider) : this.embeddingConfig.provider;
    const model = this.resolveEmbeddingModelName(provider, config.model || this.embeddingConfig.model);
    this.embeddingConfig = { provider, model };
  }
}

export default LLMManager.getInstance();
