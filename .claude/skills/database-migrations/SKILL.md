---
name: database-migrations
description: >
  Manages database schema changes and migrations for SQLite database.
  Use when: modifying database.ts, creating new tables, adding columns,
  or when git changes affect src/server/shared/database.ts or migrations/ directory.
  Triggers: commit preparation, database schema changes, adding new migrations.
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob]
---

# Database Migrations

本项目使用结构化的迁移系统管理 SQLite 数据库 schema 变更。

## 📁 目录结构

```
src/server/shared/
├── database.ts              # 数据库连接和基础表定义
└── migrations/
    ├── types.ts             # MigrationRisk 枚举和接口
    ├── runner.ts            # 迁移执行器
    ├── index.ts             # 迁移管理器
    └── migrations/
        ├── 001_xxx.ts       # 迁移文件（按版本号排序）
        ├── 002_xxx.ts
        └── ...
```

## 🔄 启动时机

**每次应用启动时自动执行迁移**：

```
npm start
    │
    ▼
src/server/index.ts
    │
    ▼
await initDatabase()  # async 函数
    │
    ├─► 创建基础表 (CREATE TABLE IF NOT EXISTS)
    │
    └─► await runMigrations(sqlite, ALL_MIGRATIONS)
         │
         ├─► 读取 _migrations 表
         ├─► 过滤未执行的迁移
         └─► 按版本号顺序执行
```

## ⚠️ 提交前检查清单

修改数据库相关代码前，必须完成：

### 1. 识别变更类型

| 变更类型 | 需要迁移? | 示例 |
|---------|----------|------|
| 新增表 | ✅ 是 | CREATE TABLE 新表 |
| 新增列 | ✅ 是 | ALTER TABLE ADD COLUMN |
| 修改表结构 | ✅ 是 | 重建表、修改约束 |
| 新增索引 | ✅ 是 | CREATE INDEX |
| 仅修改查询逻辑 | ❌ 否 | SELECT 语句优化 |
| 仅修改服务层 | ❌ 否 | 不涉及 schema |

### 2. 创建迁移文件

```bash
# 1. 创建新迁移文件
# 命名格式: XXX_description.ts (XXX = 递增版本号)
touch src/server/shared/migrations/migrations/010_add_feature_x.ts

# 2. 编辑迁移文件
```

迁移文件模板：

```typescript
import type { DatabaseSync } from 'node:sqlite';
import type { Migration } from '../types';
import { MigrationRisk } from '../types';

export const migration_010_feature_x: Migration = {
  version: '010',
  name: 'add_feature_x',
  risk: MigrationRisk.SAFE,  // 选择合适的危险等级
  description: 'Add new_column for feature X',

  up: async (db: DatabaseSync) => {
    // ⚠️ 关键：先查询再执行，避免重复执行
    const columns = db.prepare('PRAGMA table_info(table_name)').all() as any[];
    const hasColumn = columns.some((col: any) => col.name === 'new_column');

    if (hasColumn) {
      console.log('  ⏭️  Column already exists, skipping');
      return;  // 已存在则跳过
    }

    // 执行迁移
    console.log('  📝 Adding new_column...');
    db.exec(`ALTER TABLE table_name ADD COLUMN new_column TEXT;`);
  },

  down: async (_db: DatabaseSync) => {
    console.log('  ⚠️  SQLite does not support DROP COLUMN');
  },
};
```

### 3. 更新 migrations/index.ts

```typescript
// 1. 导入新迁移
import { migration_010_feature_x } from './migrations/010_add_feature_x';

// 2. 添加到 ALL_MIGRATIONS 数组
export const ALL_MIGRATIONS: Migration[] = [
  // ... 现有迁移
  migration_010_feature_x,  // 添加到末尾
];
```

### 4. 本地测试

```bash
# 1. 删除测试数据库
rm -f data/gateway.db

# 2. 启动应用，验证迁移执行
npm start

# 3. 检查 _migrations 表
sqlite3 data/gateway.db "SELECT * FROM _migrations ORDER BY executed_at;"

# 4. 验证 schema
sqlite3 data/gateway.db ".schema table_name"

# 5. 再次启动，确保不会重复执行
npm start
# 应该看到: ✅ No pending migrations to run
```

### 5. 更新 database.ts（如果需要）

如果是**新表**，在 `initDatabase()` 中添加：

```typescript
sqlite.exec(`CREATE TABLE IF NOT EXISTS new_table (
  id TEXT PRIMARY KEY,
  ...
);`);
```

**注意**：不要在 `database.ts` 中添加 ALTER TABLE 迁移逻辑，使用迁移文件。

## 🚨 危险等级说明

| 等级 | Emoji | 说明 | 示例 | 使用场景 |
|------|-------|------|------|---------|
| SAFE | 🟢 | 只添加列/索引，不影响现有数据 | ADD COLUMN, CREATE INDEX | 大多数新增功能 |
| MODERATE | 🟡 | 数据迁移或删除重复数据 | UPDATE 数据迁移, DELETE 清理 | 需要数据处理 |
| DANGEROUS | 🔴 | 重建表或不可逆操作 | DROP TABLE, 重建表 | 重大架构变更 |

选择原则：
- 优先使用 SAFE（ALTER TABLE ADD COLUMN）
- 避免使用 DANGEROUS（如果可能，设计为向后兼容）

## 🔒 线上安全检查

### 幂等性保证

**每个迁移必须先检查再执行**：

```typescript
// ✅ 正确 - 先检查
const columns = db.prepare('PRAGMA table_info(table_name)').all();
const hasColumn = columns.some((col) => col.name === 'new_column');

if (!hasColumn) {
  db.exec(`ALTER TABLE table_name ADD COLUMN new_column TEXT;`);
}

// ❌ 错误 - 直接执行（可能重复执行报错）
db.exec(`ALTER TABLE table_name ADD COLUMN new_column TEXT;`);
```

### 向后兼容检查

**确保旧数据不会损坏**：

```typescript
// ✅ 正确 - 使用默认值
db.exec(`ALTER TABLE table_name ADD COLUMN new_column TEXT DEFAULT 'default_value';`);

// ✅ 正确 - 允许 NULL
db.exec(`ALTER TABLE table_name ADD COLUMN optional_column INTEGER;`);

// ⚠️ 谨慎 - NOT NULL 无默认值
// 如果表已有数据，会失败
db.exec(`ALTER TABLE table_name ADD COLUMN required_column INTEGER NOT NULL DEFAULT 0;`);
```

### 回滚策略

SQLite 限制：
- ❌ 不支持 `DROP COLUMN`
- ❌ 不支持 `ALTER COLUMN` 修改类型
- ✅ 支持重建表（需要备份数据）

**无法回滚的迁移应在 down() 中说明**：

```typescript
down: async (_db: DatabaseSync) => {
  console.log('  ⚠️  Cannot rollback - backup restore required');
},
```

## 📝 提交信息规范

迁移相关提交应使用以下格式：

```
feat(database): add feature X column

- Add new_column to table_name for feature X
- Migration 010_add_feature_x
- Risk level: SAFE

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## 🧪 迁移验证

本地测试迁移的完整流程：

```bash
# 1. 备份现有数据库（如果有）
cp data/gateway.db data/gateway.db.backup

# 2. 删除数据库，模拟全新安装
rm -f data/gateway.db

# 3. 启动应用，验证迁移执行
npm start
# 查看日志，确认迁移执行

# 4. 检查迁移状态
sqlite3 data/gateway.db "SELECT * FROM _migrations;"

# 5. 验证表结构
sqlite3 data/gateway.db ".schema"

# 6. 再次启动，验证幂等性
npm start
# 应该看到: ✅ No pending migrations to run

# 7. 恢复备份（如果需要）
# cp data/gateway.db.backup data/gateway.db
```

## 🚨 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|---------|
| column already exists | 迁移重复执行 | 添加 PRAGMA 检查 |
| table has no column named | 迁移顺序错误 | 检查版本号依赖 |
| cannot drop column | SQLite 限制 | 在 down() 中说明 |

## 📚 参考资料

- [Migration System Implementation](../../src/server/shared/migrations/runner.ts)
- [Migration Types](../../src/server/shared/migrations/types.ts)
- [Existing Migrations](../../src/server/shared/migrations/migrations/)
