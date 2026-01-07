import { DatabaseSync } from 'node:sqlite';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/gateway.db';

export const sqlite = new DatabaseSync(DATABASE_PATH);

sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('PRAGMA journal_mode = WAL');

export function initDatabase() {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_token TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    updated_at INTEGER NOT NULL
  );`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS vendor_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    endpoint TEXT NOT NULL DEFAULT '/chat/completions',
    icon_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL
  );`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS vendor_models (
    id TEXT PRIMARY KEY,
    vendor_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    UNIQUE(vendor_id, model_id),  -- ✅ 添加唯一约束
    FOREIGN KEY (vendor_id) REFERENCES vendor_templates(id)
  );`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    vendor_id TEXT NOT NULL,
    api_key TEXT NOT NULL,
    budget INTEGER,
    balance INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    valid_from INTEGER,
    valid_until INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (vendor_id) REFERENCES vendor_templates(id)
  );`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS asset_models (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS asset_model_validations (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    model_id TEXT NOT NULL,
    success INTEGER NOT NULL,
    response TEXT,
    error TEXT,
    latency_ms INTEGER,
    validated_at INTEGER,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    overrides TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    config_type TEXT NOT NULL DEFAULT 'yaml',
    priority INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
  );`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS api_key_routes (
    id TEXT PRIMARY KEY,
    api_key_id TEXT NOT NULL,
    route_id TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
  );`);

  sqlite.exec(`CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    api_key_id TEXT NOT NULL,
    route_id TEXT,
    original_model TEXT NOT NULL,
    final_model TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    request_tools TEXT,
    temperature TEXT,
    base_url TEXT,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER NOT NULL,
    time_to_first_byte_ms INTEGER,
    status_code INTEGER NOT NULL,
    error_message TEXT,
    messages TEXT NOT NULL,
    response_content TEXT,
    request_params TEXT,
    response_params TEXT,
    response_tool_calls TEXT,
    cached_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    first_message TEXT,
    has_tools INTEGER DEFAULT 0,
    tool_count INTEGER DEFAULT 0,
    overwritten_model TEXT,
    overwritten_fields TEXT,
    overwritten_attributes TEXT,
    timestamp INTEGER NOT NULL,
    is_favorited INTEGER NOT NULL DEFAULT 0,
    original_response TEXT,
    original_response_format TEXT,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE SET NULL
  );`);

  // Indexes
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_templates_status ON vendor_templates(status);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_vendor_models_vendor ON vendor_models(vendor_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_assets_vendor ON assets(vendor_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_asset_models_asset ON asset_models(asset_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_routes_asset ON routes(asset_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_routes_active ON routes(is_active);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_routes_priority ON routes(priority);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_api_key_routes_key ON api_key_routes(api_key_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_api_key_routes_route ON api_key_routes(route_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_api_key ON request_logs(api_key_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_route ON request_logs(route_id);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(final_model);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_has_tools ON request_logs(has_tools);`);

  // Migration: Add is_favorited column if not exists
  try {
    const columns = sqlite.prepare("PRAGMA table_info(request_logs)").all() as any[];
    const hasFavoritedColumn = columns.some((col: any) => col.name === 'is_favorited');

    if (!hasFavoritedColumn) {
      console.log('[Database] Adding is_favorited column to request_logs...');
      sqlite.exec(`ALTER TABLE request_logs ADD COLUMN is_favorited INTEGER NOT NULL DEFAULT 0;`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_favorited ON request_logs(is_favorited);`);
      console.log('[Database] Migration completed: is_favorited column added');
    }
  } catch (error) {
    console.error('[Database] Migration failed:', error);
  }

  // Migration: Add endpoint column to vendor_templates if not exists
  try {
    const columns = sqlite.prepare("PRAGMA table_info(vendor_templates)").all() as any[];
    const hasEndpointColumn = columns.some((col: any) => col.name === 'endpoint');

    if (!hasEndpointColumn) {
      console.log('[Database] Adding endpoint column to vendor_templates...');
      sqlite.exec(`ALTER TABLE vendor_templates ADD COLUMN endpoint TEXT NOT NULL DEFAULT '/chat/completions';`);
      console.log('[Database] Migration completed: endpoint column added to vendor_templates');
    }
  } catch (error) {
    console.error('[Database] Migration failed:', error);
  }

  // Migration: Add updated_at column and handle legacy route_name in routes table
  try {
    const columns = sqlite.prepare("PRAGMA table_info(routes)").all() as any[];
    const hasUpdatedAtColumn = columns.some((col: any) => col.name === 'updated_at');
    const hasRouteNameColumn = columns.some((col: any) => col.name === 'route_name');
    const hasNameColumn = columns.some((col: any) => col.name === 'name');
    const hasConfigTypeColumn = columns.some((col: any) => col.name === 'config_type');

    // Handle legacy route_name column - need to recreate table
    if (hasRouteNameColumn) {
      console.log('[Database] Detected legacy route_name column, recreating routes table...');

      // Create new table with correct schema
      sqlite.exec(`CREATE TABLE routes_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        overrides TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 1,
        config_type TEXT NOT NULL DEFAULT 'yaml',
        priority INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );`);

      // Copy data, mapping route_name to name
      sqlite.exec(`INSERT INTO routes_new (id, name, asset_id, overrides, is_active, config_type, priority, created_at, updated_at)
        SELECT id, ${hasNameColumn ? 'name' : 'route_name'} as name, asset_id, overrides, is_active,
               ${hasConfigTypeColumn ? 'config_type' : "'yaml'"} as config_type,
               priority, created_at, ${hasUpdatedAtColumn ? 'updated_at' : 'created_at'} as updated_at
        FROM routes;`);

      // Drop old table and rename new one
      sqlite.exec(`DROP TABLE routes;`);
      sqlite.exec(`ALTER TABLE routes_new RENAME TO routes;`);

      // Recreate indexes
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_routes_asset ON routes(asset_id);`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_routes_active ON routes(is_active);`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_routes_priority ON routes(priority);`);

      console.log('[Database] Migration completed: routes table recreated with name column');
    } else {
      // No route_name column, just add missing columns
      if (!hasUpdatedAtColumn) {
        console.log('[Database] Adding updated_at column to routes...');
        sqlite.exec(`ALTER TABLE routes ADD COLUMN updated_at INTEGER NOT NULL DEFAULT ${Date.now()};`);
        console.log('[Database] Migration completed: updated_at column added to routes');
      }

      if (!hasConfigTypeColumn) {
        console.log('[Database] Adding config_type column to routes...');
        sqlite.exec(`ALTER TABLE routes ADD COLUMN config_type TEXT NOT NULL DEFAULT 'yaml';`);
        console.log('[Database] Migration completed: config_type column added to routes');
      }
    }
  } catch (error) {
    console.error('[Database] Migration failed:', error);
  }

  // Migration: Add latency_ms and validated_at columns to asset_model_validations if not exists
  try {
    const columns = sqlite.prepare("PRAGMA table_info(asset_model_validations)").all() as any[];
    const hasLatencyMsColumn = columns.some((col: any) => col.name === 'latency_ms');
    const hasValidatedAtColumn = columns.some((col: any) => col.name === 'validated_at');

    if (!hasLatencyMsColumn) {
      console.log('[Database] Adding latency_ms column to asset_model_validations...');
      sqlite.exec(`ALTER TABLE asset_model_validations ADD COLUMN latency_ms INTEGER;`);
      console.log('[Database] Migration completed: latency_ms column added to asset_model_validations');
    }

    if (!hasValidatedAtColumn) {
      console.log('[Database] Adding validated_at column to asset_model_validations...');
      sqlite.exec(`ALTER TABLE asset_model_validations ADD COLUMN validated_at INTEGER;`);
      console.log('[Database] Migration completed: validated_at column added to asset_model_validations');
    }
  } catch (error) {
    console.error('[Database] Migration failed:', error);
  }

  // Migration: Add original_response columns to request_logs if not exists
  try {
    const columns = sqlite.prepare("PRAGMA table_info(request_logs)").all() as any[];
    const hasOriginalResponseColumn = columns.some((col: any) => col.name === 'original_response');
    const hasOriginalResponseFormatColumn = columns.some((col: any) => col.name === 'original_response_format');
    const hasOverwrittenAttributesColumn = columns.some((col: any) => col.name === 'overwritten_attributes');
    const hasResponseToolCallsColumn = columns.some((col: any) => col.name === 'response_tool_calls');

    if (!hasOriginalResponseColumn) {
      console.log('[Database] Adding original_response column to request_logs...');
      sqlite.exec(`ALTER TABLE request_logs ADD COLUMN original_response TEXT;`);
      console.log('[Database] Migration completed: original_response column added to request_logs');
    }

    if (!hasOriginalResponseFormatColumn) {
      console.log('[Database] Adding original_response_format column to request_logs...');
      sqlite.exec(`ALTER TABLE request_logs ADD COLUMN original_response_format TEXT;`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_original_format ON request_logs(original_response_format);`);
      console.log('[Database] Migration completed: original_response_format column added to request_logs');
    }

    if (!hasOverwrittenAttributesColumn) {
      console.log('[Database] Adding overwritten_attributes column to request_logs...');
      sqlite.exec(`ALTER TABLE request_logs ADD COLUMN overwritten_attributes TEXT;`);
      console.log('[Database] Migration completed: overwritten_attributes column added to request_logs');
    }

    if (!hasResponseToolCallsColumn) {
      console.log('[Database] Adding response_tool_calls column to request_logs...');
      sqlite.exec(`ALTER TABLE request_logs ADD COLUMN response_tool_calls TEXT;`);
      console.log('[Database] Migration completed: response_tool_calls column added to request_logs');
    }
  } catch (error) {
    console.error('[Database] Migration failed:', error);
  }

  // Migration: Remove duplicate vendor_models and add unique constraint logic
  try {
    // Check for duplicates
    const duplicates = sqlite.prepare(`
      SELECT vendor_id, model_id, COUNT(*) as count
      FROM vendor_models
      GROUP BY vendor_id, model_id
      HAVING count > 1
    `).all() as any[];

    if (duplicates.length > 0) {
      console.log(`[Database] Found ${duplicates.length} duplicate model entries, cleaning up...`);

      // Delete duplicates, keeping the oldest (smallest id)
      sqlite.exec(`
        DELETE FROM vendor_models
        WHERE id NOT IN (
          SELECT MIN(id)
          FROM vendor_models
          GROUP BY vendor_id, model_id
        )
      `);

      const deletedCount = sqlite.prepare('SELECT changes() as count').get() as any;
      console.log(`[Database] Migration completed: removed ${deletedCount.count} duplicate vendor_models`);
    }
  } catch (error) {
    console.error('[Database] Migration failed:', error);
  }

  // Migration: Migrate temperature column to request_params
  // This ensures all existing temperature data is preserved in request_params JSON
  try {
    // Step 1: Check if we need to migrate (logs with temperature but no request_params)
    const needsMigration = sqlite.prepare(`
      SELECT COUNT(*) as count
      FROM request_logs
      WHERE temperature IS NOT NULL
        AND temperature != ''
        AND (request_params IS NULL OR request_params = 'null' OR request_params = '')
    `).get() as any;

    if (needsMigration.count > 0) {
      console.log(`[Database] Migrating ${needsMigration.count} logs: temperature → request_params...`);

      // Migrate logs that have temperature but no request_params
      sqlite.exec(`
        UPDATE request_logs
        SET request_params = json_object('temperature', CAST(temperature AS REAL))
        WHERE temperature IS NOT NULL
          AND temperature != ''
          AND (request_params IS NULL OR request_params = 'null' OR request_params = '')
      `);

      console.log('[Database] Migration step 1 completed: created request_params for logs with temperature');
    }

    // Step 2: Merge temperature into existing request_params (if not already present)
    const needsMerge = sqlite.prepare(`
      SELECT COUNT(*) as count
      FROM request_logs
      WHERE temperature IS NOT NULL
        AND temperature != ''
        AND request_params IS NOT NULL
        AND request_params != 'null'
        AND request_params != ''
        AND json_extract(request_params, '$.temperature') IS NULL
    `).get() as any;

    if (needsMerge.count > 0) {
      console.log(`[Database] Merging temperature into request_params for ${needsMerge.count} logs...`);

      sqlite.exec(`
        UPDATE request_logs
        SET request_params = json_patch(
          COALESCE(request_params, '{}'),
          json_object('temperature', CAST(temperature AS REAL))
        )
        WHERE temperature IS NOT NULL
          AND temperature != ''
          AND request_params IS NOT NULL
          AND request_params != 'null'
          AND request_params != ''
          AND json_extract(request_params, '$.temperature') IS NULL
      `);

      console.log('[Database] Migration step 2 completed: merged temperature into existing request_params');
    }

    // Step 3: Verify migration
    if (needsMigration.count > 0 || needsMerge.count > 0) {
      const stats = sqlite.prepare(`
        SELECT
          COUNT(*) as total_logs,
          SUM(CASE WHEN temperature IS NOT NULL AND temperature != '' THEN 1 ELSE 0 END) as logs_with_temperature,
          SUM(CASE WHEN request_params IS NOT NULL AND request_params != 'null' AND request_params != '' THEN 1 ELSE 0 END) as logs_with_request_params,
          SUM(CASE WHEN json_extract(request_params, '$.temperature') IS NOT NULL THEN 1 ELSE 0 END) as logs_with_temperature_in_params
        FROM request_logs
      `).get() as any;

      console.log('[Database] Migration stats:', {
        totalLogs: stats.total_logs,
        logsWithTemperature: stats.logs_with_temperature,
        logsWithRequestParams: stats.logs_with_request_params,
        logsWithTemperatureInParams: stats.logs_with_temperature_in_params,
      });

      console.log('[Database] Migration completed: temperature → request_params');
      console.log('[Database] Note: The temperature column is kept for backward compatibility');
      console.log('[Database]       Future versions can remove it after verifying the migration');
    }
  } catch (error) {
    console.error('[Database] Migration failed:', error);
  }

  // Create favorited index (if not already created by migration)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_favorited ON request_logs(is_favorited);`);

  // ============================================
  // system_config - System Configuration
  // ============================================
  sqlite.exec(`CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT NOT NULL,
    data_type TEXT NOT NULL DEFAULT 'string',
    description TEXT,
    is_read_only INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_system_config_category ON system_config(category);`);

  // ============================================
  // admin_sessions - Admin Authentication Sessions
  // ============================================
  sqlite.exec(`CREATE TABLE IF NOT EXISTS admin_sessions (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);`);

  // ============================================
  // login_attempts - Login Failure Tracking (Anti-Brute Force)
  // ============================================
  sqlite.exec(`CREATE TABLE IF NOT EXISTS login_attempts (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 1,
    last_attempt INTEGER NOT NULL,
    blocked_until INTEGER DEFAULT NULL
  );`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip);`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_login_attempts_blocked ON login_attempts(blocked_until);`);

  console.log(`[Database] Initialized: ${DATABASE_PATH}`);
}

export function closeDatabase() {
  sqlite.close();
  console.log('[Database] Connection closed');
}

export function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  const stmt = sqlite.prepare(sql);
  return stmt.all(...params) as T[];
}

export function queryFirst<T = any>(sql: string, params: any[] = []): T | undefined {
  const stmt = sqlite.prepare(sql);
  return stmt.get(...params) as T | undefined;
}

export function queryRun(sql: string, params: any[] = []) {
  const stmt = sqlite.prepare(sql);
  return stmt.run(...params);
}

export const db = sqlite;
