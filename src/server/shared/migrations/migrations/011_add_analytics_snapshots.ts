import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_011_add_analytics_snapshots: Migration = {
  version: '011',
  name: 'add_analytics_snapshots',
  risk: MigrationRisk.SAFE,
  description: 'Add analytics_snapshots table for persistent statistics storage',
  createdAt: '2025-01-16',

  up: async (db: DatabaseSync) => {
    // Check if table already exists
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='analytics_snapshots'"
    ).all() as any[];

    if (tables.length > 0) {
      console.log('  ⏭️  analytics_snapshots table already exists, skipping');
      return;
    }

    console.log('  📝 Creating analytics_snapshots table...');
    db.exec(`
      CREATE TABLE analytics_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL UNIQUE,
        total_requests INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_prompt_tokens INTEGER DEFAULT 0,
        total_completion_tokens INTEGER DEFAULT 0,
        avg_latency REAL DEFAULT 0,
        avg_ttfb REAL DEFAULT 0,
        success_rate REAL DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      -- Create index on date for faster queries
      CREATE INDEX idx_analytics_snapshots_date ON analytics_snapshots(date DESC);
    `);

    console.log('  ✅ analytics_snapshots table created successfully');
  },

  down: async (db: DatabaseSync) => {
    console.log('  📝 Dropping analytics_snapshots table...');
    db.exec(`DROP TABLE IF EXISTS analytics_snapshots;`);
    console.log('  ✅ analytics_snapshots table dropped');
  },
};
