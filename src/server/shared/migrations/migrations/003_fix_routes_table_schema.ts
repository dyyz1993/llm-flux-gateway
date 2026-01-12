import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_003_routes_schema: Migration = {
  version: '003',
  name: 'fix_routes_table_schema',
  risk: MigrationRisk.DANGEROUS,
  description: 'Handle legacy route_name column and add updated_at, config_type columns (may recreate table)',

  up: async (db: DatabaseSync) => {
    const columns = db.prepare('PRAGMA table_info(routes)').all() as any[];
    const hasUpdatedAt = columns.some((col: any) => col.name === 'updated_at');
    const hasRouteName = columns.some((col: any) => col.name === 'route_name');
    const hasName = columns.some((col: any) => col.name === 'name');
    const hasConfigType = columns.some((col: any) => col.name === 'config_type');

    // 🔴 危险操作：检测到旧字段，需要重建表
    if (hasRouteName) {
      console.log('  🔴 Detected legacy route_name column, recreating routes table...');

      // 创建新表
      db.exec(`CREATE TABLE routes_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        overrides TEXT NOT NULL DEFAULT '[]',
        is_active INTEGER NOT NULL DEFAULT 1,
        config_type TEXT NOT NULL DEFAULT 'yaml',
        priority INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
      );`);

      // 迁移数据
      const nameField = hasName ? 'name' : 'route_name';
      const configTypeField = hasConfigType ? 'config_type' : "'yaml'";
      const updatedAtField = hasUpdatedAt ? 'updated_at' : 'created_at';

      db.exec(`INSERT INTO routes_new (id, name, asset_id, overrides, is_active, config_type, priority, created_at, updated_at)
        SELECT id, ${nameField}, asset_id, overrides, is_active,
               ${configTypeField},
               priority, created_at, ${updatedAtField}
        FROM routes;`);

      console.log(`  📦 Migrated data from routes to routes_new`);

      // 删除旧表，重命名新表
      db.exec(`DROP TABLE routes;`);
      db.exec(`ALTER TABLE routes_new RENAME TO routes;`);

      // 重建索引
      db.exec(`CREATE INDEX IF NOT EXISTS idx_routes_asset ON routes(asset_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_routes_active ON routes(is_active);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_routes_priority ON routes(priority);`);

      console.log('  ✅ Table recreated successfully');
      return;
    }

    // 只添加缺失的列
    if (!hasUpdatedAt) {
      console.log('  📝 Adding updated_at column...');
      db.exec(`ALTER TABLE routes ADD COLUMN updated_at INTEGER NOT NULL DEFAULT ${Date.now()};`);
    }

    if (!hasConfigType) {
      console.log('  📝 Adding config_type column...');
      db.exec(`ALTER TABLE routes ADD COLUMN config_type TEXT NOT NULL DEFAULT 'yaml';`);
    }
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  Cannot rollback table recreation - backup restore required');
  },
};
