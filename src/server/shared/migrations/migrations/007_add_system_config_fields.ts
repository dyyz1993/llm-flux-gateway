import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_007_system_config: Migration = {
  version: '007',
  name: 'add_system_config_fields',
  risk: MigrationRisk.SAFE,
  description: 'Add description and is_read_only columns to system_config table',

  up: async (db: DatabaseSync) => {
    const columns = db.prepare('PRAGMA table_info(system_config)').all() as any[];
    const hasDescription = columns.some((col: any) => col.name === 'description');
    const hasIsReadOnly = columns.some((col: any) => col.name === 'is_read_only');

    if (hasDescription && hasIsReadOnly) {
      console.log('  ⏭️  Columns already exist, skipping');
      return;
    }

    if (!hasDescription) {
      console.log('  📝 Adding description column...');
      db.exec(`ALTER TABLE system_config ADD COLUMN description TEXT;`);
    }

    if (!hasIsReadOnly) {
      console.log('  📝 Adding is_read_only column...');
      db.exec(`ALTER TABLE system_config ADD COLUMN is_read_only INTEGER NOT NULL DEFAULT 0;`);
    }
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  SQLite does not support DROP COLUMN - manual intervention required');
  },
};
