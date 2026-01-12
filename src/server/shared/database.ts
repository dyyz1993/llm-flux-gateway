import { DatabaseSync } from 'node:sqlite';
import { runMigrations, ALL_MIGRATIONS } from './migrations';

const DATABASE_PATH = process.env.DATABASE_PATH || './data/gateway.db';

export const sqlite = new DatabaseSync(DATABASE_PATH);

sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('PRAGMA journal_mode = WAL');

export async function initDatabase() {
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

  // ============================================
  // Indexes
  // ============================================
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

  // ============================================
  // Run Migrations
  // ============================================
  // 执行数据库迁移，确保所有必要的表结构和数据迁移都已完成
  await runMigrations(sqlite, ALL_MIGRATIONS);

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
