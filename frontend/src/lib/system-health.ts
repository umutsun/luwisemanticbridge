import config from '@/config/api.config';

export interface SystemHealth {
  database: {
    connected: boolean;
    error?: string;
  };
  settings: {
    loaded: boolean;
    error?: string;
  };
  redis: {
    connected: boolean;
    error?: string;
  };
}

export interface HealthCheckResult {
  healthy: boolean;
  health: SystemHealth;
  errors: string[];
}

class SystemHealthService {
  private static instance: SystemHealthService;
  private health: SystemHealth = {
    database: { connected: false },
    settings: { loaded: false },
    redis: { connected: false }
  };
  private lastCheck = 0;
  private checkInterval = 30000; // 30 seconds

  static getInstance(): SystemHealthService {
    if (!SystemHealthService.instance) {
      SystemHealthService.instance = new SystemHealthService();
    }
    return SystemHealthService.instance;
  }

  async checkSystemHealth(): Promise<HealthCheckResult> {
    const now = Date.now();
    if (now - this.lastCheck < this.checkInterval && this.health.database.connected) {
      return this.formatHealthResult();
    }

    const errors: string[] = [];

    try {
      // 1. Check Asemb Database Connection
      await this.checkDatabaseConnection(errors);

      // 2. Only check settings if database is connected
      if (this.health.database.connected) {
        await this.checkSettingsLoaded(errors);
        await this.checkRedisConnection(errors);
      }

      this.lastCheck = now;
    } catch (error) {
      const errorMessage = `System health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMessage);
      console.error('System health check failed:', error);
    }

    return this.formatHealthResult(errors);
  }

  private async checkDatabaseConnection(errors: string[]): Promise<void> {
    try {
      const response = await fetch(config.getApiUrl('/api/v2/health'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
      }

      const healthData = await response.json();

      if (healthData.status === 'healthy' && healthData.services?.postgres === 'connected') {
        this.health.database = { connected: true };
        console.log('✅ Asemb Database connection verified');
      } else {
        const error = healthData.error || 'Database connection failed';
        this.health.database = { connected: false, error };
        errors.push(`ASemb Database connection failed: ${error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      this.health.database = { connected: false, error: errorMessage };
      errors.push(`ASemb Database connection failed: ${errorMessage}`);
      console.error('Database connection check failed:', error);
    }
  }

  private async checkSettingsLoaded(errors: string[]): Promise<void> {
    try {
      const response = await fetch(config.getApiUrl('/api/v2/settings/'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Settings check failed: ${response.status} ${response.statusText}`);
      }

      const settingsData = await response.json();

      if (settingsData && typeof settingsData === 'object') {
        this.health.settings = { loaded: true };
        console.log('✅ Settings loaded successfully');
      } else {
        const error = 'Settings response invalid';
        this.health.settings = { loaded: false, error };
        errors.push(`Settings loading failed: ${error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown settings error';
      this.health.settings = { loaded: false, error: errorMessage };
      errors.push(`Settings loading failed: ${errorMessage}`);
      console.error('Settings loading check failed:', error);
    }
  }

  private async checkRedisConnection(errors: string[]): Promise<void> {
    try {
      const response = await fetch(config.getApiUrl('/api/v2/health'), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Redis health check failed: ${response.status} ${response.statusText}`);
      }

      const healthData = await response.json();

      if (healthData.services?.redis === 'connected') {
        this.health.redis = { connected: true };
        console.log('✅ Redis connection verified');
      } else {
        const error = 'Redis connection failed';
        this.health.redis = { connected: false, error };
        errors.push(`Redis connection failed: ${error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown Redis error';
      this.health.redis = { connected: false, error: errorMessage };
      console.error('Redis connection check failed:', error);
    }
  }

  private formatHealthResult(errors: string[] = []): HealthCheckResult {
    const healthy = this.health.database.connected &&
                   this.health.settings.loaded &&
                   this.health.redis.connected;

    return {
      healthy,
      health: { ...this.health },
      errors
    };
  }

  getCurrentHealth(): SystemHealth {
    return { ...this.health };
  }

  isDatabaseConnected(): boolean {
    return this.health.database.connected;
  }

  areSettingsLoaded(): boolean {
    return this.health.settings.loaded;
  }

  isRedisConnected(): boolean {
    return this.health.redis.connected;
  }

  reset(): void {
    this.health = {
      database: { connected: false },
      settings: { loaded: false },
      redis: { connected: false }
    };
    this.lastCheck = 0;
  }
}

export const systemHealthService = SystemHealthService.getInstance();
export default systemHealthService;