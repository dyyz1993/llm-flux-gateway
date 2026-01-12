import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_008_stream_column: Migration = {
  version: '008',
  name: 'add_stream_to_request_logs',
  risk: MigrationRisk.SAFE,
  description: 'Add stream column to request_logs table for tracking streaming requests',

  up: async (db: DatabaseSync) => {
    const columns = db.prepare('PRAGMA table_info(request_logs)').all() as any[];
    const hasStream = columns.some((col: any) => col.name === 'stream');

    if (hasStream) {
      console.log('  ⏭️  Column already exists, skipping');
      return;
    }

    console.log('  📝 Adding stream column...');
    db.exec(`ALTER TABLE request_logs ADD COLUMN stream INTEGER DEFAULT 0;`);
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  SQLite does not support DROP COLUMN - manual intervention required');
  },
};
