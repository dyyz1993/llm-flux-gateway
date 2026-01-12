import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_010_original_request_columns: Migration = {
  version: '010',
  name: 'add_original_request_columns',
  risk: MigrationRisk.SAFE,
  description: 'Add original_request_format and original_request_raw columns to request_logs',
  createdAt: '2025-01-12',

  up: async (db: DatabaseSync) => {
    const columns = db.prepare('PRAGMA table_info(request_logs)').all() as any[];
    const hasOriginalRequestFormat = columns.some((col: any) => col.name === 'original_request_format');
    const hasOriginalRequestRaw = columns.some((col: any) => col.name === 'original_request_raw');

    if (hasOriginalRequestFormat && hasOriginalRequestRaw) {
      console.log('  ⏭️  All columns already exist, skipping');
      return;
    }

    if (!hasOriginalRequestFormat) {
      console.log('  📝 Adding original_request_format column...');
      db.exec(`ALTER TABLE request_logs ADD COLUMN original_request_format TEXT;`);
    }

    if (!hasOriginalRequestRaw) {
      console.log('  📝 Adding original_request_raw column...');
      db.exec(`ALTER TABLE request_logs ADD COLUMN original_request_raw TEXT;`);
    }
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  SQLite does not support DROP COLUMN - manual intervention required');
  },
};
