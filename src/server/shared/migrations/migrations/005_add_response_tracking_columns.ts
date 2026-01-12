import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_005_response_tracking: Migration = {
  version: '005',
  name: 'add_response_tracking_columns',
  risk: MigrationRisk.SAFE,
  description: 'Add original_response, original_response_format, overwritten_attributes, response_tool_calls to request_logs',

  up: async (db: DatabaseSync) => {
    const columns = db.prepare('PRAGMA table_info(request_logs)').all() as any[];
    const hasOriginalResponse = columns.some((col: any) => col.name === 'original_response');
    const hasOriginalFormat = columns.some((col: any) => col.name === 'original_response_format');
    const hasOverwrittenAttrs = columns.some((col: any) => col.name === 'overwritten_attributes');
    const hasResponseToolCalls = columns.some((col: any) => col.name === 'response_tool_calls');

    if (hasOriginalResponse && hasOriginalFormat && hasOverwrittenAttrs && hasResponseToolCalls) {
      console.log('  ⏭️  All columns already exist, skipping');
      return;
    }

    if (!hasOriginalResponse) {
      console.log('  📝 Adding original_response column...');
      db.exec(`ALTER TABLE request_logs ADD COLUMN original_response TEXT;`);
    }

    if (!hasOriginalFormat) {
      console.log('  📝 Adding original_response_format column...');
      db.exec(`ALTER TABLE request_logs ADD COLUMN original_response_format TEXT;`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_request_logs_original_format ON request_logs(original_response_format);`);
    }

    if (!hasOverwrittenAttrs) {
      console.log('  📝 Adding overwritten_attributes column...');
      db.exec(`ALTER TABLE request_logs ADD COLUMN overwritten_attributes TEXT;`);
    }

    if (!hasResponseToolCalls) {
      console.log('  📝 Adding response_tool_calls column...');
      db.exec(`ALTER TABLE request_logs ADD COLUMN response_tool_calls TEXT;`);
    }
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  SQLite does not support DROP COLUMN - manual intervention required');
  },
};
