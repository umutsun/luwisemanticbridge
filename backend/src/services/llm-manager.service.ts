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
  private defaultProvider: string = 'claude';
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
    provider: (process.env.EMBEDDING_PROVIDER as string || 'openai').toLowerCase(),
    model: process.env.EMBEDDING_MODEL as string || 'text-embedding-3-small'
  };

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
  }

  /**
   * Initialize all LLM providers with environment variables as fallback
   */
  private initializeProviders(): void {
    this.providers.set('claude', {
      name: 'claude',
      apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-3-sonnet-20240229',
      isInitialized: false,
      supportsEmbeddings: false
    });

    this.providers.set('openai', {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4',
      isInitialized: false,
      supportsEmbeddings: true,
      embeddingModel: 'text-embedding-3-small'
    });

    this.providers.set('gemini', {
      name: 'gemini',
      apiKey: process.env.GEMINI_API_KEY || '',
      model: 'gemini-1.5-pro',
      isInitialized: false,
      supportsEmbeddings: true,
      embeddingModel: 'text-embedding-004'
    });

    this.providers.set('deepseek', {
      name: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      model: 'deepseek-chat',
      isInitialized: false,
      supportsEmbeddings: false
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

      // Update default provider
      const activeModel = settings.activeChatModel || settings['llmSettings.activeChatModel'] || 'anthropic/claude-3-sonnet';
      this.defaultProvider = this.extractProviderFromModel(activeModel);

      // Store configuration
      this.config = {
        systemPrompt: settings.systemPrompt || settings['llmSettings.systemPrompt'] || 'Sen bir yardımcı asistansın.',
        temperature: parseFloat(settings.temperature || settings['llmSettings.temperature'] || '0.3'),
        maxTokens: parseInt(settings.maxTokens || settings['llmSettings.maxTokens'] || '4096')
      };

      // Update API keys and models
      this.updateProviderSettings('claude', {
        apiKey: settings['anthropic.apiKey'] || settings['claude.apiKey'] || this.providers.get('claude')?.apiKey,
        model: settings['llmSettings.claudeModel'] || 'claude-3-sonnet-20240229'
      });

      this.updateProviderSettings('openai', {
        apiKey: settings['openai.apiKey'] || this.providers.get('openai')?.apiKey,
        model: settings['llmSettings.openaiModel'] || 'gpt-4'
      });

      this.updateProviderSettings('gemini', {
        apiKey: settings['google.apiKey'] || settings['gemini.apiKey'] || this.providers.get('gemini')?.apiKey,
        model: settings['llmSettings.geminiModel'] || 'gemini-1.5-pro'
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

      console.log(`🤖 LLM Manager - Default provider: ${this.defaultProvider}`);
      console.log(`🤖 LLM Manager - Model: ${activeModel}`);
      console.log(`🤖 LLM Manager - Fallback order: ${this.fallbackOrder.join(', ')}`);
      console.log(`🤖 LLM Manager - Config:`, this.config);

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
    return 'claude';
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
    const fallback = [...this.fallbackOrder];
    const normalizedPreferred = preferredProvider ? this.normalizeProviderName(preferredProvider) : undefined;
    const order = normalizedPreferred ? [normalizedPreferred, ...fallback] : fallback;
    return Array.from(new Set(order));
  }

  /**
   * Update provider settings
   */
  private updateProviderSettings(provider: string, settings: { apiKey?: string; model?: string; embeddingModel?: string; supportsEmbeddings?: boolean }): void {
    const prov = this.providers.get(provider);
    if (prov) {
      if (settings.apiKey !== undefined) prov.apiKey = settings.apiKey;
      if (settings.model !== undefined) prov.model = settings.model;
      if (settings.embeddingModel !== undefined) prov.embeddingModel = settings.embeddingModel;
      if (settings.supportsEmbeddings !== undefined) prov.supportsEmbeddings = settings.supportsEmbeddings;
      prov.isInitialized = false;
    }
  }

  /**
   * Generate fallback order with default provider first
   */
  private generateFallbackOrder(): string[] {
    const allProviders = ['claude', 'openai', 'gemini', 'deepseek'];
    const order = [this.defaultProvider];

    // Add other providers
    for (const p of allProviders) {
      if (p !== this.defaultProvider) {
        order.push(p);
      }
    }

    return Array.from(new Set(order));
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
          prov.client = new Anthropic({ apiKey: prov.apiKey });
          break;
        case 'openai':
          prov.client = new OpenAI({ apiKey: prov.apiKey });
          break;
        case 'gemini':
          prov.client = new GoogleGenerativeAI(prov.apiKey);
          break;
        case 'deepseek':
          prov.client = new OpenAI({
            apiKey: prov.apiKey,
            baseURL: 'https://api.deepseek.com'
          });
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

    const preferredProvider = this.normalizeProviderName(options.provider || this.embeddingConfig.provider);
    const providerOrder = this.getEmbeddingProviderOrder(preferredProvider);
    const errors: string[] = [];

    for (const provider of providerOrder) {
      const prov = this.providers.get(provider);
      if (!prov || !prov.apiKey) {
        continue;
      }

      if (!this.providerSupportsEmbeddings(provider)) {
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
      case 'openai':
      case 'deepseek': {
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
    } = {}
  ): Promise<{ content: string; provider: string; model: string }> {
    await this.refreshSettingsIfNeeded();

    // Use provided options || fall back to config from database
    const temperature = options.temperature ?? this.config.temperature;
    const maxTokens = options.maxTokens ?? this.config.maxTokens;
    const systemPrompt = options.systemPrompt ?? this.config.systemPrompt;
    const provider = await this.getAvailableProvider();

    if (!provider) {
      throw new Error('LLM e bağlanılamadı. Lütfen API anahtarlarınızı kontrol edin.');
    }

    const prov = this.providers.get(provider);
    if (!prov || !prov.client) {
      throw new Error(`Provider ${provider} not initialized`);
    }

    console.log(`🤖 Using ${provider} for chat response`);

    try {
      switch (provider) {
        case 'claude':
          const claudeResponse = await prov.client.messages.create({
            model: prov.model,
            max_tokens: maxTokens,
            temperature: temperature,
            system: systemPrompt,
            messages: [{ role: 'user', content: message }]
          });
          return {
            content: claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : '',
            provider: 'Claude',
            model: prov.model
          };

        case 'openai':
          const openaiResponse = await prov.client.chat.completions.create({
            model: prov.model,
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
            model: prov.model
          };

        case 'gemini':
          const geminiModel = prov.client.getGenerativeModel({ model: prov.model });
          const geminiResponse = await geminiModel.generateContent([
            { role: 'user', parts: [{ text: `System: ${systemPrompt}` }] },
            { role: 'user', parts: [{ text: message }] }
          ]);
          return {
            content: geminiResponse.response.text() || '',
            provider: 'Gemini',
            model: prov.model
          };

        case 'deepseek':
          const deepseekResponse = await prov.client.chat.completions.create({
            model: prov.model,
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
            model: prov.model
          };

        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error) {
      console.error(`❌ Chat response failed with ${provider}:`, error);

      // Try fallback
      const currentIndex = this.fallbackOrder.indexOf(provider);
      const nextProviders = this.fallbackOrder.slice(currentIndex + 1);

      for (const nextProvider of nextProviders) {
        try {
          console.log(`🔄 Falling back to ${nextProvider}...`);
          const nextProv = this.providers.get(nextProvider);
          if (nextProv && nextProv.apiKey) {
            if (!nextProv.isInitialized) {
              this.initializeProvider(nextProvider);
            }
            return await this.generateChatResponse(message, options);
          }
        } catch (e) {
          console.warn(`⚠️ Fallback to ${nextProvider} also failed:`, e);
        }
      }

      throw new Error('LLM e bağlanılamadı. Lütfen daha sonra tekrar deneyin.');
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

  updateEmbeddingConfig(config: { provider?: string; model?: string }): void {
    const provider = config.provider ? this.normalizeProviderName(config.provider) : this.embeddingConfig.provider;
    const model = this.resolveEmbeddingModelName(provider, config.model || this.embeddingConfig.model);
    this.embeddingConfig = { provider, model };
  }
}

export default LLMManager.getInstance();
