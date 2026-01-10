/**
 * Unified System Configuration
 *
 * Centralizes all configuration management with clear priority:
 * 1. Runtime config (database) - highest priority, can be changed via System UI
 * 2. Environment variables - .env files
 * 3. Code defaults - fallback values
 */

interface SystemConfigSchema {
  // Logging
  maxLogsCount: number;
  logRetentionDays: number;
  autoCleanupLogs: boolean;
  preserveFavoritedLogs: boolean;

  // Database
  databasePath: string;
  databaseBackupEnabled: boolean;
  databaseBackupInterval: number; // hours

  // API
  corsOrigins: string[];
  rateLimitEnabled: boolean;
  rateLimitRequests: number;
  rateLimitWindow: number; // seconds
  requestTimeout: number; // seconds

  // Monitoring
  healthCheckInterval: number; // seconds
  performanceMonitoring: boolean;
  errorLogLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Default configuration values (lowest priority)
 */
const DEFAULTS: SystemConfigSchema = {
  // Logging
  maxLogsCount: 5000,
  logRetentionDays: 30,
  autoCleanupLogs: true,
  preserveFavoritedLogs: true,

  // Database
  databasePath: './data/gateway.db',
  databaseBackupEnabled: false,
  databaseBackupInterval: 24,

  // API
  corsOrigins: ['http://localhost:3000'],
  rateLimitEnabled: false,
  rateLimitRequests: 100,
  rateLimitWindow: 60,
  requestTimeout: 300,

  // Monitoring
  healthCheckInterval: 60,
  performanceMonitoring: true,
  errorLogLevel: 'info',
};

/**
 * Configuration from environment variables (medium priority)
 */
function fromEnv(): Partial<SystemConfigSchema> {
  return {
    maxLogsCount: parseInt(process.env.MAX_LOGS_COUNT || String(DEFAULTS.maxLogsCount)),
    logRetentionDays: parseInt(process.env.LOG_RETENTION_DAYS || String(DEFAULTS.logRetentionDays)),
    databasePath: process.env.DATABASE_PATH || DEFAULTS.databasePath,
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || DEFAULTS.corsOrigins,
  };
}

/**
 * Current effective configuration
 * Note: Runtime config from database should override these
 */
export const config: SystemConfigSchema = {
  ...DEFAULTS,
  ...fromEnv(),
};

/**
 * Config keys that are stored in database for runtime modification
 */
export const RUNTIME_CONFIG_KEYS = {
  maxLogsCount: { key: 'max_logs_count', category: 'log', dataType: 'number' as const, description: 'Maximum number of logs to keep' },
  logRetentionDays: { key: 'log_retention_days', category: 'log', dataType: 'number' as const, description: 'Days to keep logs before cleanup' },
  autoCleanupLogs: { key: 'auto_cleanup_logs', category: 'log', dataType: 'boolean' as const, description: 'Automatically cleanup old logs' },
  preserveFavoritedLogs: { key: 'preserve_favorited_logs', category: 'log', dataType: 'boolean' as const, description: 'Never delete favorited logs' },
  rateLimitEnabled: { key: 'rate_limit_enabled', category: 'api', dataType: 'boolean' as const, description: 'Enable API rate limiting' },
  rateLimitRequests: { key: 'rate_limit_requests', category: 'api', dataType: 'number' as const, description: 'Max requests per window' },
  rateLimitWindow: { key: 'rate_limit_window', category: 'api', dataType: 'number' as const, description: 'Rate limit window in seconds' },
  requestTimeout: { key: 'request_timeout', category: 'api', dataType: 'number' as const, description: 'Request timeout in seconds' },
  healthCheckInterval: { key: 'health_check_interval', category: 'monitoring', dataType: 'number' as const, description: 'Health check interval in seconds' },
  performanceMonitoring: { key: 'performance_monitoring', category: 'monitoring', dataType: 'boolean' as const, description: 'Enable performance monitoring' },
  errorLogLevel: { key: 'error_log_level', category: 'monitoring', dataType: 'string' as const, description: 'Error logging level' },
} as const;

export type RuntimeConfigKey = keyof typeof RUNTIME_CONFIG_KEYS;

/**
 * Initialize config with validation
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required environment variables
  if (!process.env.GEMINI_API_KEY) {
    errors.push('GEMINI_API_KEY is required');
  }

  // Validate numeric ranges
  if (config.maxLogsCount < 0) {
    errors.push('MAX_LOGS_COUNT must be non-negative');
  }

  if (config.logRetentionDays < 1) {
    errors.push('LOG_RETENTION_DAYS must be at least 1');
  }

  if (config.rateLimitRequests < 1) {
    errors.push('RATE_LIMIT_REQUESTS must be at least 1');
  }

  if (config.rateLimitWindow < 1) {
    errors.push('RATE_LIMIT_WINDOW must be at least 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
