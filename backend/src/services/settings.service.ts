import { asembPool } from '../config/database.config';
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

export class SettingsService {
  private static instance: SettingsService;

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }
    return SettingsService.instance;
  }

  // Get port configurations from settings
  async getPortConfig(): Promise<ServicePortConfig> {
    try {
      const client = await asembPool.connect();

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
      const client = await asembPool.connect();

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
      const client = await asembPool.connect();

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
      const client = await asembPool.connect();

      try {
        await client.query(`
          INSERT INTO settings (key, value, category, description)
          VALUES ($1, $2::jsonb, $3, $4)
          ON CONFLICT (key)
          DO UPDATE SET
            value = $2::jsonb,
            updated_at = CURRENT_TIMESTAMP
        `, [keyName, JSON.stringify(keyValue), category, `API key for ${keyName}`]);

        return { success: true };
      } finally {
        client.release();
      }
    } catch (error: any) {
      logger.error(`Failed to save API key ${keyName}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Get all API keys
  async getApiKeys(): Promise<Record<string, string>> {
    try {
      const client = await asembPool.connect();

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
}