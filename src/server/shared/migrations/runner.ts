import type { DatabaseSync } from 'node:sqlite';
import type { Migration, MigrationResult } from './types';
import { MigrationRisk } from './types';

/**
 * 检查列是否存在
 */
function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  return columns.some((col: any) => col.name === column);
}

/**
 * 检查表是否存在
 */
function hasTable(db: DatabaseSync, table: string): boolean {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(table) as any;
  return !!result;
}

/**
 * 检查索引是否存在
 */
function hasIndex(db: DatabaseSync, index: string): boolean {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name=?"
  ).get(index) as any;
  return !!result;
}

/**
 * 获取危险等级 emoji
 */
function getRiskEmoji(risk: MigrationRisk): string {
  switch (risk) {
    case MigrationRisk.SAFE:
      return '🟢';
    case MigrationRisk.MODERATE:
      return '🟡';
    case MigrationRisk.DANGEROUS:
      return '🔴';
  }
}

/**
 * 创建 _migrations 表
 */
function createMigrationsTable(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    executed_at INTEGER NOT NULL
  );`);
}

/**
 * 获取已执行的迁移
 */
function getExecutedMigrations(db: DatabaseSync): Set<string> {
  if (!hasTable(db, '_migrations')) {
    return new Set();
  }

  const rows = db.prepare('SELECT version FROM _migrations').all() as any[];
  return new Set(rows.map((row) => row.version));
}

/**
 * 记录已执行的迁移
 */
function recordMigration(db: DatabaseSync, migration: Migration): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('INSERT INTO _migrations (version, name, executed_at) VALUES (?, ?, ?)')
    .run(migration.version, migration.name, now);
}

/**
 * 执行单个迁移
 */
async function executeMigration(
  db: DatabaseSync,
  migration: Migration
): Promise<MigrationResult> {
  const emoji = getRiskEmoji(migration.risk);
  console.log(`\n${emoji} [Migration ${migration.version}] ${migration.name}`);
  console.log(`  Description: ${migration.description}`);

  try {
    await migration.up(db);
    recordMigration(db, migration);

    console.log(`  ✅ Migration completed`);
    return {
      version: migration.version,
      name: migration.name,
      success: true,
      executedAt: Date.now(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ❌ Migration failed: ${errorMsg}`);
    return {
      version: migration.version,
      name: migration.name,
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * 运行所有待执行的迁移
 */
export async function runMigrations(
  db: DatabaseSync,
  migrations: Migration[]
): Promise<MigrationResult[]> {
  console.log('\n' + '='.repeat(60));
  console.log('🔄 Running database migrations...');
  console.log('='.repeat(60));

  // 确保 _migrations 表存在
  createMigrationsTable(db);

  // 获取已执行的迁移
  const executedVersions = getExecutedMigrations(db);

  // 过滤出未执行的迁移
  const pendingMigrations = migrations.filter((m) => !executedVersions.has(m.version));

  if (pendingMigrations.length === 0) {
    console.log('✅ No pending migrations to run');
    console.log('='.repeat(60) + '\n');
    return [];
  }

  console.log(`Found ${pendingMigrations.length} pending migration(s):\n`);

  // 按版本号顺序执行
  const sortedMigrations = pendingMigrations.sort((a, b) =>
    a.version.localeCompare(b.version)
  );

  const results: MigrationResult[] = [];
  for (const migration of sortedMigrations) {
    const result = await executeMigration(db, migration);
    results.push(result);

    if (!result.success) {
      console.error('\n' + '='.repeat(60));
      console.error(`❌ Migration failed: ${migration.version} - ${migration.name}`);
      console.error('='.repeat(60) + '\n');
      // 继续执行其他迁移，但记录错误
    }
  }

  // 总结
  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Migration Summary:`);
  console.log(`  ✅ Success: ${successCount}`);
  if (failureCount > 0) {
    console.log(`  ❌ Failed: ${failureCount}`);
  }
  console.log('='.repeat(60) + '\n');

  return results;
}

// 导出辅助函数供迁移使用
export const MigrationHelpers = {
  hasColumn,
  hasTable,
  hasIndex,
};
