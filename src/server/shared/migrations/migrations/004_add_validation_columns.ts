import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_004_validation_columns: Migration = {
  version: '004',
  name: 'add_validation_columns',
  risk: MigrationRisk.SAFE,
  description: 'Add latency_ms and validated_at columns to asset_model_validations table',

  up: async (db: DatabaseSync) => {
    const columns = db.prepare('PRAGMA table_info(asset_model_validations)').all() as any[];
    const hasLatency = columns.some((col: any) => col.name === 'latency_ms');
    const hasValidatedAt = columns.some((col: any) => col.name === 'validated_at');

    if (hasLatency && hasValidatedAt) {
      console.log('  ⏭️  Columns already exist, skipping');
      return;
    }

    if (!hasLatency) {
      console.log('  📝 Adding latency_ms column...');
      db.exec(`ALTER TABLE asset_model_validations ADD COLUMN latency_ms INTEGER;`);
    }

    if (!hasValidatedAt) {
      console.log('  📝 Adding validated_at column...');
      db.exec(`ALTER TABLE asset_model_validations ADD COLUMN validated_at INTEGER;`);
    }
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  SQLite does not support DROP COLUMN - manual intervention required');
  },
};
