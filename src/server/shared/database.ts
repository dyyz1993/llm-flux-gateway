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
    priority INTEGER NOT NULL DEFAULT 0,
    request_format TEXT NOT NULL DEFAULT 'openai',
    response_format TEXT NOT NULL DEFAULT 'openai',
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
    cached_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    message_count INTEGER DEFAULT 0,
    first_message TEXT,
    has_tools INTEGER DEFAULT 0,
    tool_count INTEGER DEFAULT 0,
    overwritten_model TEXT,
    overwritten_fields TEXT,
    timestamp INTEGER NOT NULL,
    is_favorited INTEGER NOT NULL DEFAULT 0,
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

  // Migration: Add format conversion columns to routes table if not exists
  try {
    const columns = sqlite.prepare("PRAGMA table_info(routes)").all() as any[];
    const hasRequestFormatColumn = columns.some((col: any) => col.name === 'request_format');
    const hasResponseFormatColumn = columns.some((col: any) => col.name === 'response_format');

    if (!hasRequestFormatColumn) {
      console.log('[Database] Adding request_format column to routes...');
      sqlite.exec(`ALTER TABLE routes ADD COLUMN request_format TEXT NOT NULL DEFAULT 'openai';`);
      console.log('[Database] Migration completed: request_format column added to routes');
    }

    if (!hasResponseFormatColumn) {
      console.log('[Database] Adding response_format column to routes...');
      sqlite.exec(`ALTER TABLE routes ADD COLUMN response_format TEXT NOT NULL DEFAULT 'openai';`);
      console.log('[Database] Migration completed: response_format column added to routes');
    }

    // Create indexes for format columns to improve query performance
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_routes_request_format ON routes(request_format);`);
    sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_routes_response_format ON routes(response_format);`);
  } catch (error) {
    console.error('[Database] Migration failed:', error);
  }

  // Migration: Add updated_at column and handle legacy route_name in routes table
  try {
    const columns = sqlite.prepare("PRAGMA table_info(routes)").all() as any[];
    const hasUpdatedAtColumn = columns.some((col: any) => col.name === 'updated_at');
    const hasRouteNameColumn = columns.some((col: any) => col.name === 'route_name');
    const hasNameColumn = columns.some((col: any) => col.name === 'name');

    // Handle legacy route_name column
    if (hasRouteNameColumn && !hasNameColumn) {
      console.log('[Database] Detected legacy route_name column, adding new name column...');
      sqlite.exec(`ALTER TABLE routes ADD COLUMN name TEXT;`);
      sqlite.exec(`UPDATE routes SET name = route_name WHERE name IS NULL;`);
      console.log('[Database] Migration completed: copied route_name to name');
    }

    if (!hasUpdatedAtColumn) {
      console.log('[Database] Adding updated_at column to routes...');
      sqlite.exec(`ALTER TABLE routes ADD COLUMN updated_at INTEGER NOT NULL DEFAULT ${Date.now()};`);
      console.log('[Database] Migration completed: updated_at column added to routes');
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
