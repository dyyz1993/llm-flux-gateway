import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_009_temperature_params: Migration = {
  version: '009',
  name: 'migrate_temperature_to_request_params',
  risk: MigrationRisk.MODERATE,
  description: 'Migrate temperature column data to request_params JSON field',
  createdAt: '2025-01-12',

  up: async (db: DatabaseSync) => {
    // Step 1: 检查是否需要迁移
    const needsMigration = db.prepare(`
      SELECT COUNT(*) as count
      FROM request_logs
      WHERE temperature IS NOT NULL
        AND temperature != ''
        AND (request_params IS NULL OR request_params = 'null' OR request_params = '')
    `).get() as any;

    if (needsMigration.count > 0) {
      console.log(`  📦 Migrating ${needsMigration.count} logs: temperature → request_params...`);
      db.exec(`
        UPDATE request_logs
        SET request_params = json_object('temperature', CAST(temperature AS REAL))
        WHERE temperature IS NOT NULL
          AND temperature != ''
          AND (request_params IS NULL OR request_params = 'null' OR request_params = '')
      `);
      console.log('  ✅ Step 1 completed: created request_params');
    }

    // Step 2: 合并到已存在的request_params
    const needsMerge = db.prepare(`
      SELECT COUNT(*) as count
      FROM request_logs
      WHERE temperature IS NOT NULL
        AND temperature != ''
        AND request_params IS NOT NULL
        AND request_params != 'null'
        AND request_params != ''
        AND json_extract(request_params, '$.temperature') IS NULL
    `).get() as any;

    if (needsMerge.count > 0) {
      console.log(`  📦 Merging temperature into request_params for ${needsMerge.count} logs...`);
      db.exec(`
        UPDATE request_logs
        SET request_params = json_patch(
          COALESCE(request_params, '{}'),
          json_object('temperature', CAST(temperature AS REAL))
        )
        WHERE temperature IS NOT NULL
          AND temperature != ''
          AND request_params IS NOT NULL
          AND request_params != 'null'
          AND request_params != ''
          AND json_extract(request_params, '$.temperature') IS NULL
      `);
      console.log('  ✅ Step 2 completed: merged temperature');
    }

    if (needsMigration.count > 0 || needsMerge.count > 0) {
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN temperature IS NOT NULL AND temperature != '' THEN 1 ELSE 0 END) as with_temp,
          SUM(CASE WHEN json_extract(request_params, '$.temperature') IS NOT NULL THEN 1 ELSE 0 END) as with_temp_in_params
        FROM request_logs
      `).get() as any;

      console.log(`  📊 Migration stats: ${stats.with_temp_in_params}/${stats.with_temp} logs with temperature in params`);
    } else {
      console.log('  ✅ No migration needed');
    }
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  Cannot reverse data migration - backup restore required');
  },
};
