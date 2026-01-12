import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_006_remove_duplicates: Migration = {
  version: '006',
  name: 'remove_duplicate_vendor_models',
  risk: MigrationRisk.MODERATE,
  description: 'Remove duplicate vendor_models entries (keeping oldest by id)',

  up: async (db: DatabaseSync) => {
    // 检查是否有重复
    const duplicates = db.prepare(`
      SELECT vendor_id, model_id, COUNT(*) as count
      FROM vendor_models
      GROUP BY vendor_id, model_id
      HAVING count > 1
    `).all() as any[];

    if (duplicates.length === 0) {
      console.log('  ✅ No duplicates found, skipping');
      return;
    }

    console.log(`  🧹 Found ${duplicates.length} duplicate(s), cleaning up...`);

    // 删除重复，保留id最小的
    db.exec(`
      DELETE FROM vendor_models
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM vendor_models
        GROUP BY vendor_id, model_id
      )
    `);

    const result = db.prepare('SELECT changes() as count').get() as any;
    console.log(`  ✅ Removed ${result.count} duplicate(s)`);
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  Cannot restore deleted duplicates - backup restore required');
  },
};
