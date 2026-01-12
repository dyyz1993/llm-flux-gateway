import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_001_add_is_favorited: Migration = {
  version: '001',
  name: 'add_is_favorited_to_request_logs',
  risk: MigrationRisk.SAFE,
  description: 'Add is_favorited column to request_logs table for favoriting logs',
  createdAt: '2025-01-12',

  up: async (db: DatabaseSync) => {
    const columns = db.prepare('PRAGMA table_info(request_logs)').all() as any[];
    const hasColumn = columns.some((col: any) => col.name === 'is_favorited');

    if (hasColumn) {
      console.log('  ⏭️  Column already exists, skipping');
      return;
    }

    console.log('  📝 Adding is_favorited column...');
    db.exec(`ALTER TABLE request_logs ADD COLUMN is_favorited INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_favorited ON request_logs(is_favorited);`);
    console.log('  📝 Created index idx_request_logs_favorited');
  },

  down: async (_db: DatabaseSync) => {
    // SQLite doesn't support DROP COLUMN, need to recreate table
    console.log('  ⚠️  SQLite does not support DROP COLUMN - manual intervention required');
  },
};
