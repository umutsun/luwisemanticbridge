import { lsembPool } from '../config/database.config';
import { logger } from '../utils/logger';

export interface ServicePortConfig {
  redis?: {
    port: number;
    host?: string;
    password?: string;
    db?: number;
  };
  postgres?: {
    port: number;
    host?: string;
    database?: string;
    username?: string;
    password?: string;
  };
  n8n?: {
    port: number;
    webhookUrl?: string;
  };
  grafana?: {
    port: number;
  };
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface RedisConfig {
  host: string;
  port: number;
  db: number;
  password?: string;
}

export class SettingsService {
  private static instance: SettingsService;
  private cache: Map<string, { value: any; timestamp: number; ttl: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return Date.now() - cached.timestamp < cached.ttl;
  }

  private setCache(key: string, value: any, ttl: number = this.CACHE_TTL): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  }

  private getCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached || !this.isCacheValid(key)) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  private clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  // Get port configurations from settings
  async getPortConfig(): Promise<ServicePortConfig> {
    try {
      // Check if database is available
      if (!lsembPool) {
        logger.warn('Database not available for getPortConfig, returning defaults');
        return {};
      }

      const client = await lsembPool.connect();

      try {
        // Get all port-related settings
        const result = await client.query(`
          SELECT key, value
          FROM settings
          WHERE key LIKE '%_port' OR key LIKE '%_config'
          ORDER BY key
        `);

        const config: ServicePortConfig = {};

        for (const row of result.rows) {
          const key = row.key;
          const value = row.value;

          switch (key) {
            case 'redis_config':
              config.redis = value;
              break;
            case 'postgres_config':
              config.postgres = value;
              break;
            case 'n8n_config':
              config.n8n = value;
              break;
            case 'grafana_config':
              config.grafana = value;
              break;
          }
        }

        return config;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get port configurations:', error);
      // Return default empty config on error
      return {};
    }
  }

  // Save port configurations to settings
  async savePortConfig(config: ServicePortConfig): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await lsembPool.connect();

      try {
        // Start transaction
        await client.query('BEGIN');

        // Save each service configuration
        if (config.redis) {
          await client.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ('redis_config', $1::jsonb, 'ports', 'Redis connection configuration')
            ON CONFLICT (key)
            DO UPDATE SET
              value = $1::jsonb,
              updated_at = CURRENT_TIMESTAMP
          `, [JSON.stringify(config.redis)]);
        }

        if (config.postgres) {
          await client.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ('postgres_config', $1::jsonb, 'ports', 'PostgreSQL connection configuration for migration')
            ON CONFLICT (key)
            DO UPDATE SET
              value = $1::jsonb,
              updated_at = CURRENT_TIMESTAMP
          `, [JSON.stringify(config.postgres)]);
        }

        if (config.n8n) {
          await client.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ('n8n_config', $1::jsonb, 'ports', 'n8n service configuration')
            ON CONFLICT (key)
            DO UPDATE SET
              value = $1::jsonb,
              updated_at = CURRENT_TIMESTAMP
          `, [JSON.stringify(config.n8n)]);
        }

        if (config.grafana) {
          await client.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ('grafana_config', $1::jsonb, 'ports', 'Grafana service configuration')
            ON CONFLICT (key)
            DO UPDATE SET
              value = $1::jsonb,
              updated_at = CURRENT_TIMESTAMP
          `, [JSON.stringify(config.grafana)]);
        }

        await client.query('COMMIT');
        return { success: true };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('Failed to save port configurations:', error);
      return { success: false, error: error.message };
    }
  }

  // Get API key from settings
  async getApiKey(keyName: string): Promise<string | null> {
    try {
      const client = await lsembPool.connect();

      try {
        const result = await client.query(`
          SELECT value FROM settings WHERE key = $1
        `, [keyName]);

        if (result.rows.length > 0 && result.rows[0].value) {
          return result.rows[0].value;
        }
        return null;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error(`Failed to get API key ${keyName}:`, error);
      return null;
    }
  }

  // Save API key to settings
  async saveApiKey(keyName: string, keyValue: string, category: string = 'api_keys'): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await lsembPool.connect();

      try {
        await client.query(`
          INSERT INTO settings (key, value, category, description)
          VALUES ($1, $2::jsonb, $3, $4)
          ON CONFLICT (key)
          DO UPDATE SET
            value = $2::jsonb,
            updated_at = CURRENT_TIMESTAMP
        `, [keyName, JSON.stringify(keyValue), category, `API key for ${keyName}`]);

        // Clear cache when API key is updated
        this.clearCache('all_settings');
        logger.debug('Cache cleared due to API key update');

        return { success: true };
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error(`Failed to save API key ${keyName}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Get all settings
  async getAllSettings(): Promise<Record<string, any>> {
    const cacheKey = 'all_settings';

    // Check cache first
    const cached = this.getCache(cacheKey);
    if (cached) {
      logger.debug('Returning cached settings');
      return cached;
    }

    try {
      // Check if database is available
      if (!lsembPool) {
        logger.warn('Database not available for getAllSettings, returning environment variables');
        return this.getEnvironmentSettings();
      }

      const client = await lsembPool.connect();

      try {
        // Get settings from the settings table
        const result = await client.query(`
          SELECT key, value FROM settings
        `);

        const settings: Record<string, any> = {};

        // Process settings
        for (const row of result.rows) {
          settings[row.key] = row.value;
        }

        // Cache the result
        this.setCache(cacheKey, settings);
        logger.debug('Settings cached successfully');

        return settings;
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('Failed to get all settings from database, using environment variables:', error);
      return this.getEnvironmentSettings();
    }
  }

  // Get settings from environment variables
  private getEnvironmentSettings(): Record<string, any> {
    return {
      // AI Provider settings
      'llm.primary': process.env.LLM_PROVIDER || 'openai',
      'llm.fallback_enabled': process.env.AI_FALLBACK_ENABLED === 'true',
      'llm.fallback_provider': process.env.AI_FALLBACK_PROVIDER || 'claude',
      'openai.apiKey': process.env.OPENAI_API_KEY || '',
      'claude.apiKey': process.env.CLAUDE_API_KEY || '',
      'gemini.apiKey': process.env.GEMINI_API_KEY || '',
      'deepseek.apiKey': process.env.DEEPSEEK_API_KEY || '',
      'huggingface.apiKey': process.env.HUGGINGFACE_API_KEY || '',

      // Embedding settings
      'embedding.provider': process.env.EMBEDDING_PROVIDER || 'openai',
      'embedding.model': process.env.EMBEDDING_MODEL || 'text-embedding-3-small',

      // Database settings
      'database.host': process.env.POSTGRES_HOST || 'localhost',
      'database.port': process.env.POSTGRES_PORT || '5432',
      'database.name': process.env.POSTGRES_DB || 'lsemb',
      'database.user': process.env.POSTGRES_USER || 'postgres',
      'database.password': process.env.POSTGRES_PASSWORD || ''
    };
  }

  // Set a single setting
  async setSetting(key: string, value: string): Promise<void> {
    try {
      const client = await lsembPool.connect();

      try {
        // Upsert the setting
        await client.query(`
          INSERT INTO settings (key, value, created_at, updated_at)
          VALUES ($1, $2, NOW(), NOW())
          ON CONFLICT (key) DO UPDATE SET
            value = $2,
            updated_at = NOW()
        `, [key, value]);

        logger.info(`Setting ${key} updated successfully`);

        // Clear cache when setting is updated
        this.clearCache('all_settings');
        logger.debug('Cache cleared due to setting update');
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error(`Failed to set setting ${key}:`, error);
      throw error;
    }
  }

  // Get all API keys
  async getApiKeys(): Promise<Record<string, string>> {
    try {
      const client = await lsembPool.connect();

      try {
        const result = await client.query(`
          SELECT key, value FROM settings WHERE category = 'api_keys'
        `);

        const keys: Record<string, string> = {};
        for (const row of result.rows) {
          keys[row.key] = row.value;
        }
        return keys;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to get API keys:', error);
      return {};
    }
  }

  // Get LLM provider configurations
  async getLLMProviders(): Promise<any> {
    const cacheKey = 'llm_providers';

    // Check cache first
    const cached = this.getCache(cacheKey);
    if (cached) {
      logger.debug('Returning cached LLM providers');
      return cached;
    }

    try {
      // Check if database is available
      if (!lsembPool) {
        logger.warn('Database not available for getLLMProviders, returning defaults');
        return this.getDefaultLLMProviders();
      }

      const client = await lsembPool.connect();

      try {
        // Get all LLM provider settings from database
        const result = await client.query(`
          SELECT key, value FROM settings
          WHERE key LIKE 'llm_%' OR key LIKE '%_api_key' OR key LIKE '%_model'
          OR key LIKE 'openai_%' OR key LIKE 'anthropic_%' OR key LIKE 'google_%'
          OR key LIKE 'deepseek_%' OR key LIKE 'huggingface_%' OR key LIKE 'openrouter_%'
        `);

        const providers: any = {
          openai: {},
          anthropic: {},
          google: {},
          deepseek: {},
          huggingface: {},
          openrouter: {},
          llmSettings: {}
        };

        // Parse settings into provider structure
        for (const row of result.rows) {
          const key = row.key;
          const value = row.value;

          if (key.startsWith('openai_')) {
            const fieldName = key.replace('openai_', '');
            providers.openai[fieldName] = value;
          } else if (key.startsWith('anthropic_')) {
            const fieldName = key.replace('anthropic_', '');
            providers.anthropic[fieldName] = value;
          } else if (key.startsWith('google_')) {
            const fieldName = key.replace('google_', '');
            providers.google[fieldName] = value;
          } else if (key.startsWith('deepseek_')) {
            const fieldName = key.replace('deepseek_', '');
            providers.deepseek[fieldName] = value;
          } else if (key.startsWith('huggingface_')) {
            const fieldName = key.replace('huggingface_', '');
            providers.huggingface[fieldName] = value;
          } else if (key.startsWith('openrouter_')) {
            const fieldName = key.replace('openrouter_', '');
            providers.openrouter[fieldName] = value;
          } else if (key.startsWith('llm_')) {
            const fieldName = key.replace('llm_', '');
            providers.llmSettings[fieldName] = value;
          }
        }

        // Cache the result
        this.setCache(cacheKey, providers);
        logger.debug('LLM providers cached successfully');

        return providers;
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('Failed to get LLM providers from database:', error);
      return this.getDefaultLLMProviders();
    }
  }

  // Get default LLM provider configurations
  private getDefaultLLMProviders(): any {
    return {
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
      },
      google: {
        apiKey: process.env.GOOGLE_API_KEY || '',
        projectId: process.env.GOOGLE_PROJECT_ID || ''
      },
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
      },
      huggingface: {
        apiKey: process.env.HUGGINGFACE_API_KEY || ''
      },
      openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY || ''
      },
      llmSettings: {
        activeChatModel: process.env.LLM_ACTIVE_CHAT_MODEL || 'deepseek/deepseek-chat',
        activeEmbeddingModel: process.env.LLM_ACTIVE_EMBEDDING_MODEL || 'google/text-embedding-004'
      }
    };
  }

  /**
   * OCR ayarlarını al
   */
  async getOCRSettings(): Promise<{
    activeProvider: string;
    fallbackEnabled: boolean;
    fallbackProvider: string;
    cacheEnabled: boolean;
    cacheTTL: number;
    providers: {
      openai: { apiKey: string };
      gemini: { apiKey: string };
      replicate: { apiKey: string };
    };
  }> {
    try {
      const settings = await this.getAllSettings();

      return {
        activeProvider: settings.ocr_active_provider || 'auto',
        fallbackEnabled: settings.ocr_fallback_enabled !== false,
        fallbackProvider: settings.ocr_fallback_provider || 'tesseract',
        cacheEnabled: settings.ocr_cache_enabled !== false,
        cacheTTL: settings.ocr_cache_ttl || 7 * 24 * 60 * 60, // 7 gün
        providers: {
          openai: {
            apiKey: settings.openai_api_key || ''
          },
          gemini: {
            apiKey: settings.gemini_api_key || ''
          },
          replicate: {
            apiKey: settings.replicate_api_key || ''
          }
        }
      };
    } catch (error) {
      logger.error('OCR ayarları alınamadı:', error);
      return {
        activeProvider: 'auto',
        fallbackEnabled: true,
        fallbackProvider: 'tesseract',
        cacheEnabled: true,
        cacheTTL: 7 * 24 * 60 * 60,
        providers: {
          openai: { apiKey: '' },
          gemini: { apiKey: '' },
          replicate: { apiKey: '' }
        }
      };
    }
  }

  /**
   * OCR ayarlarını kaydet
   */
  async saveOCRSettings(settings: {
    activeProvider?: string;
    fallbackEnabled?: boolean;
    fallbackProvider?: string;
    cacheEnabled?: boolean;
    cacheTTL?: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const client = await lsembPool.connect();

      try {
        await client.query('BEGIN');

        // Her ayarı ayrı ayrı kaydet
        if (settings.activeProvider !== undefined) {
          await client.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ('ocr_active_provider', $1::jsonb, 'ocr', 'Active OCR provider')
            ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP
          `, [JSON.stringify(settings.activeProvider)]);
        }

        if (settings.fallbackEnabled !== undefined) {
          await client.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ('ocr_fallback_enabled', $1::jsonb, 'ocr', 'OCR fallback enabled')
            ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP
          `, [JSON.stringify(settings.fallbackEnabled)]);
        }

        if (settings.fallbackProvider !== undefined) {
          await client.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ('ocr_fallback_provider', $1::jsonb, 'ocr', 'Fallback OCR provider')
            ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP
          `, [JSON.stringify(settings.fallbackProvider)]);
        }

        if (settings.cacheEnabled !== undefined) {
          await client.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ('ocr_cache_enabled', $1::jsonb, 'ocr', 'OCR cache enabled')
            ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP
          `, [JSON.stringify(settings.cacheEnabled)]);
        }

        if (settings.cacheTTL !== undefined) {
          await client.query(`
            INSERT INTO settings (key, value, category, description)
            VALUES ('ocr_cache_ttl', $1::jsonb, 'ocr', 'OCR cache TTL in seconds')
            ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP
          `, [JSON.stringify(settings.cacheTTL)]);
        }

        await client.query('COMMIT');

        // Clear cache
        this.clearCache('all_settings');

        return { success: true };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error('OCR ayarları kaydedilemedi:', error);
      return { success: false, error: error.message };
    }
  }
}