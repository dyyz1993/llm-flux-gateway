import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_002_add_endpoint: Migration = {
  version: '002',
  name: 'add_endpoint_to_vendor_templates',
  risk: MigrationRisk.SAFE,
  description: 'Add endpoint column to vendor_templates table for custom API endpoints',
  createdAt: '2025-01-12',

  up: async (db: DatabaseSync) => {
    const columns = db.prepare('PRAGMA table_info(vendor_templates)').all() as any[];
    const hasColumn = columns.some((col: any) => col.name === 'endpoint');

    if (hasColumn) {
      console.log('  ⏭️  Column already exists, skipping');
      return;
    }

    console.log('  📝 Adding endpoint column...');
    db.exec(`ALTER TABLE vendor_templates ADD COLUMN endpoint TEXT NOT NULL DEFAULT '/chat/completions';`);
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  SQLite does not support DROP COLUMN - manual intervention required');
  },
};
