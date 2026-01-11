import { queryAll, queryFirst, queryRun } from '@server/shared/database';
import type { SystemConfig } from '@server/shared/schema';

/**
 * System Config Service
 *
 * Manages runtime configuration stored in database
 */
export class SystemConfigService {
  /**
   * Get all configuration values
   */
  async getAllConfigs(): Promise<SystemConfig[]> {
    const configs = queryAll<any>('SELECT * FROM system_config ORDER BY category, key');
    return configs.map((c) => ({
      key: c.key,
      value: c.value,
      category: c.category,
      dataType: c.data_type,
      description: c.description,
      isReadOnly: Boolean(c.is_read_only),
      updatedAt: new Date(c.updated_at * 1000),
    }));
  }

  /**
   * Get configs by category
   */
  async getConfigsByCategory(category: string): Promise<SystemConfig[]> {
    const configs = queryAll<any>(
      'SELECT * FROM system_config WHERE category = ? ORDER BY key',
      [category]
    );
    return configs.map((c) => ({
      key: c.key,
      value: c.value,
      category: c.category,
      dataType: c.data_type,
      description: c.description,
      isReadOnly: Boolean(c.is_read_only),
      updatedAt: new Date(c.updated_at * 1000),
    }));
  }

  /**
   * Get a single config value
   */
  async getConfig(key: string): Promise<SystemConfig | null> {
    const config = queryFirst<any>('SELECT * FROM system_config WHERE key = ?', [key]);
    if (!config) return null;

    return {
      key: config.key,
      value: config.value,
      category: config.category,
      dataType: config.data_type,
      description: config.description,
      isReadOnly: Boolean(config.is_read_only),
      updatedAt: new Date(config.updated_at * 1000),
    };
  }

  /**
   * Get config value (parsed)
   */
  async getValue<T = any>(key: string): Promise<T | null> {
    const config = await this.getConfig(key);
    if (!config) return null;

    switch (config.dataType) {
      case 'number':
        return parseFloat(config.value) as T;
      case 'boolean':
        return (config.value === 'true' || config.value === '1') as T;
      case 'json':
        return JSON.parse(config.value) as T;
      default:
        return config.value as T;
    }
  }

  /**
   * Set a config value
   */
  async setConfig(key: string, value: any, dataType: string, category?: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);

    if (category) {
      queryRun(
        `INSERT INTO system_config (key, value, data_type, category, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           data_type = excluded.data_type,
           category = excluded.category,
           updated_at = excluded.updated_at`,
        [key, stringValue, dataType, category, now]
      );
    } else {
      // If category is not provided, try to find existing config's category
      const existing = queryFirst<any>('SELECT category FROM system_config WHERE key = ?', [key]);
      const finalCategory = category || (existing ? existing.category : 'general');

      queryRun(
        `INSERT INTO system_config (key, value, data_type, category, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           data_type = excluded.data_type,
           category = excluded.category,
           updated_at = excluded.updated_at`,
        [key, stringValue, dataType, finalCategory, now]
      );
    }
  }

  /**
   * Update multiple configs at once
   */
  async updateConfigs(updates: Record<string, any>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const runtimeKeys = require('../../shared/config').RUNTIME_CONFIG_KEYS;

    for (const [key, value] of Object.entries(updates)) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      const configInfo = runtimeKeys[key as keyof typeof runtimeKeys];

      if (configInfo) {
        queryRun(
          `INSERT INTO system_config (key, value, data_type, category, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             category = excluded.category,
             updated_at = excluded.updated_at`,
          [key, stringValue, configInfo.dataType, configInfo.category, now]
        );
      } else {
        queryRun(
          `UPDATE system_config 
           SET value = ?, updated_at = ?
           WHERE key = ?`,
          [stringValue, now, key]
        );
      }
    }
  }

  /**
   * Initialize default configs from env
   */
  async initializeDefaults(): Promise<void> {
    const defaults = [
      {
        key: 'max_logs_count',
        value: process.env.MAX_LOGS_COUNT || '5000',
        category: 'log',
        dataType: 'number',
        description: 'Maximum number of logs to keep (favorited logs are exempt)',
      },
      {
        key: 'log_retention_days',
        value: process.env.LOG_RETENTION_DAYS || '30',
        category: 'log',
        dataType: 'number',
        description: 'Number of days to keep logs before auto-cleanup',
      },
      {
        key: 'auto_cleanup_logs',
        value: 'true',
        category: 'log',
        dataType: 'boolean',
        description: 'Automatically cleanup old logs when limit is reached',
      },
      {
        key: 'preserve_favorited_logs',
        value: 'true',
        category: 'log',
        dataType: 'boolean',
        description: 'Never delete favorited logs during cleanup',
      },
      {
        key: 'rate_limit_enabled',
        value: 'false',
        category: 'api',
        dataType: 'boolean',
        description: 'Enable API rate limiting',
      },
      {
        key: 'rate_limit_requests',
        value: '100',
        category: 'api',
        dataType: 'number',
        description: 'Maximum requests per rate limit window',
      },
      {
        key: 'rate_limit_window',
        value: '60',
        category: 'api',
        dataType: 'number',
        description: 'Rate limit time window in seconds',
      },
      {
        key: 'request_timeout',
        value: '120',
        category: 'api',
        dataType: 'number',
        description: 'Request timeout in seconds',
      },
      {
        key: 'health_check_interval',
        value: '60',
        category: 'monitoring',
        dataType: 'number',
        description: 'Health check interval in seconds',
      },
      {
        key: 'performance_monitoring',
        value: 'true',
        category: 'monitoring',
        dataType: 'boolean',
        description: 'Enable performance monitoring',
      },
      {
        key: 'error_log_level',
        value: 'info',
        category: 'monitoring',
        dataType: 'string',
        description: 'Error logging level (debug, info, warn, error)',
      },
    ];

    const now = Math.floor(Date.now() / 1000);

    for (const config of defaults) {
      // Only insert if not exists
      const exists = queryFirst<any>('SELECT 1 FROM system_config WHERE key = ?', [config.key]);
      if (!exists) {
        queryRun(
          `INSERT INTO system_config (key, value, category, data_type, description, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            config.key,
            config.value,
            config.category,
            config.dataType,
            config.description,
            now,
          ]
        );
      }
    }
  }

  /**
   * Get effective config value (database > env > default)
   */
  async getEffectiveValue<T = any>(key: string, envFallback?: string): Promise<T> {
    // Try database first
    const dbValue = await this.getValue<T>(key);
    if (dbValue !== null) return dbValue;

    // Fallback to env
    if (envFallback && process.env[envFallback]) {
      const envValue = process.env[envFallback];
      // Try to parse based on common patterns
      if (envValue === 'true' || envValue === 'false') {
        return (envValue === 'true') as T;
      }
      if (!isNaN(Number(envValue))) {
        return Number(envValue) as T;
      }
      return envValue as T;
    }

    return null as T;
  }
}

// Export singleton instance
export const systemConfigService = new SystemConfigService();
