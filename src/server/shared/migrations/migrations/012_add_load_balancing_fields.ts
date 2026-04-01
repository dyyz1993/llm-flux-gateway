import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_012_load_balancing: Migration = {
  version: '012',
  name: 'add_load_balancing_fields',
  description: 'Add weight, health_status, fail_count fields to api_key_routes for load balancing support',
  risk: MigrationRisk.SAFE,
  createdAt: '2026-04-01',

  up: async (db) => {
    db.exec(`ALTER TABLE api_key_routes ADD COLUMN weight INTEGER NOT NULL DEFAULT 100`);
    db.exec(`ALTER TABLE api_key_routes ADD COLUMN health_status TEXT NOT NULL DEFAULT 'healthy'`);
    db.exec(`ALTER TABLE api_key_routes ADD COLUMN fail_count INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE api_key_routes ADD COLUMN success_count INTEGER NOT NULL DEFAULT 0`);
    db.exec(`ALTER TABLE api_key_routes ADD COLUMN last_check_at INTEGER`);
    db.exec(`ALTER TABLE api_key_routes ADD COLUMN last_success_at INTEGER`);
    db.exec(`ALTER TABLE api_key_routes ADD COLUMN last_fail_at INTEGER`);
    db.exec(`ALTER TABLE api_key_routes ADD COLUMN avg_latency_ms INTEGER`);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_api_key_routes_health ON api_key_routes(health_status)`);

    console.log('[Migration 012] Added load balancing fields to api_key_routes');
  },

  down: async (_db) => {
    console.log('[Migration 012] Down migration not supported for ALTER TABLE in SQLite');
    console.log('[Migration 012] To rollback, restore from backup or recreate the table');
  },
};
