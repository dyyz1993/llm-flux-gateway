# Docker 启动时数据库表处理流程

## 📊 完整流程图

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. Docker 容器启动                                                   │
│  ENTRYPOINT ["./scripts/docker-entrypoint.sh"]                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. docker-entrypoint.sh 执行                                         │
│  文件: scripts/docker-entrypoint.sh                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ├──► 注入环境变量 (VITE_API_BASE_URL)
                             │
                             ├──► 恢复默认配置 (vendors.yaml)
                             │
                             ├──► 创建 data 目录: mkdir -p /app/data
                             │
                             └──► 🎯 关键: 数据库 Schema 同步
                                    npx drizzle-kit push
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │  drizzle-kit push 分析         │
                    │  配置: drizzle.config.ts       │
                    │  Schema: src/server/shared/schema.ts │
                    └───────────┬───────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
    ┌───────────────────────┐       ┌───────────────────────┐
    │  情况 A: 数据库文件不存在 │       │  情况 B: 数据库文件存在  │
    │  /app/data/gateway.db  │       │  /app/data/gateway.db  │
    └───────────┬───────────┘       └───────────┬───────────┘
                │                               │
                │                               │
                ▼                               ▼
    ┌───────────────────────┐       ┌───────────────────────┐
    │  drizzle-kit:          │       │  drizzle-kit:          │
    │  ✅ 创建数据库文件      │       │  📊 读取现有表结构      │
    │  ✅ 创建所有表          │       │  📊 对比 schema.ts      │
    └───────────┬───────────┘       └───────────┬───────────┘
                │                               │
                └───────────────┬───────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. 应用启动 (npm start → node dist-server/index.js)                │
│     入口: src/server/prod.ts → src/server/index.ts                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. initDatabase() 执行                                              │
│  文件: src/server/index.ts:18                                        │
│  await initDatabase();                                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. database.ts initDatabase() 函数                                  │
│  文件: src/server/shared/database.ts:10-250                          │
└────────────────────────────┬────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ 执行 PRAGMA    │  │ CREATE TABLE   │  │ 迁移逻辑       │
│ foreign_keys=ON│  │ IF NOT EXISTS  │  │ ALTER TABLE    │
│ journal_mode=WAL│  │ (创建表)       │  │ (添加新列)     │
└────────────────┘  └────────────────┘  └────────────────┘
```

---

## 🔍 详细处理逻辑

### 阶段 1: drizzle-kit push (Docker 容器启动时)

**位置**: `scripts/docker-entrypoint.sh:25`

```bash
npx drizzle-kit push
```

#### 情况 A: 数据库文件不存在 (`/app/data/gateway.db`)

```
✅ Action: 创建数据库文件
✅ Action: 根据 drizzle.config.ts 读取 schema
✅ Action: 读取 src/server/shared/schema.ts
✅ Action: 创建所有表 (api_keys, vendor_templates, assets, routes, etc.)
✅ Action: 创建索引
```

**示例输出**:
```
正在同步数据库 schema...
No config path provided, using default 'drizzle.config.ts'
Reading config file '/app/drizzle.config.ts'
SQLite database connecting...
sqlite database connecting...
✭ 12 tables
✭ 0 indexes
✭ 0 foreign keys
✭ 0 check constraints
Are you sure you want to push schema? » yes
✅ Creating tables...
✅ Tables created!
```

#### 情况 B: 数据库文件存在

```
📊 Action: 读取现有表结构
📊 Action: 对比 schema.ts 定义
📊 Action: 差异分析

┌─ 如果表结构完全一致 ─────────────────────┐
│ ✅ Skip: 无需修改                         │
│ ℹ️  No changes to push                   │
└──────────────────────────────────────────┘

┌─ 如果表结构不一致 ───────────────────────┐
│ ⚠️  Detect: 发现差异                      │
│ ❓ Ask: 是否执行变更?                     │
│    --force: 自动确认（生产环境推荐）      │
│                                           │
│ 可能的操作:                               │
│  ✅ CREATE TABLE (新增表)                 │
│  ⚠️  ALTER TABLE ADD COLUMN (新增列)     │
│  🚫 ALTER TABLE DROP COLUMN (数据丢失!)  │
│  🚫 DROP TABLE (数据丢失!)               │
└──────────────────────────────────────────┘
```

**示例输出 - 无需修改**:
```
ℹ️  No changes to push
```

**示例输出 - 需要修改**:
```
⚠️  The following changes will be applied:
• Table: assets
  ✅ Add column: valid_from
  ✅ Add column: valid_until

Are you sure you want to push schema? » yes
✅ Pushed 2 changes
```

---

### 阶段 2: initDatabase() (应用代码启动时)

**位置**: `src/server/index.ts:18` → `src/server/shared/database.ts:10`

```typescript
// src/server/index.ts
await initDatabase();
```

#### 执行内容

##### 1. SQLite 基础设置
```typescript
// database.ts:3-8
const DATABASE_PATH = process.env.DATABASE_PATH || './data/gateway.db';
export const sqlite = new DatabaseSync(DATABASE_PATH);
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec('PRAGMA journal_mode = WAL');
```

##### 2. CREATE TABLE IF NOT EXISTS
```typescript
// database.ts:11-56
sqlite.exec(`CREATE TABLE IF NOT EXISTS api_keys (...)`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS vendor_templates (...)`);
sqlite.exec(`CREATE TABLE IF NOT EXISTS assets (...)`);
// ... 其他表
```

**关键**: `IF NOT EXISTS` 确保如果表已存在则跳过，不会报错

##### 3. 创建索引
```typescript
// database.ts:137-154
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status)`);
// ... 其他索引
```

##### 4. 迁移逻辑 (Migration)
```typescript
// database.ts:156-230
// 检查列是否存在，不存在则添加
try {
  const columns = sqlite.prepare("PRAGMA table_info(request_logs)").all();
  const hasFavoritedColumn = columns.some((col: any) => col.name === 'is_favorited');

  if (!hasFavoritedColumn) {
    console.log('[Database] Adding is_favorited column to request_logs...');
    sqlite.exec(`ALTER TABLE request_logs ADD COLUMN is_favorited INTEGER NOT NULL DEFAULT 0;`);
  }
} catch (error) {
  console.error('[Database] Migration failed:', error);
}
```

**迁移列表**:
- ✅ `request_logs.is_favorited`
- ✅ `vendor_templates.endpoint`
- ✅ `routes.request_format`, `routes.response_format`
- ✅ `request_logs.original_response`, `request_logs.original_response_format`

---

## 📋 两阶段处理对比

| 阶段 | 工具 | 触发时机 | 处理内容 | 数据丢失风险 |
|------|------|---------|---------|------------|
| **drizzle-kit push** | 外部工具 | Docker entrypoint | Schema 同步，创建/修改表 | ⚠️ 有（DROP 操作） |
| **initDatabase()** | 应用代码 | Node.js 启动 | CREATE TABLE IF NOT EXISTS<br/>迁移 ALTER TABLE ADD | ✅ 无（只添加） |

---

## 🎯 最佳实践建议

### 生产环境 (Production)

在 `docker-entrypoint.sh` 中使用 `--force` 参数:

```bash
# 修改第 25 行
npx drizzle-kit push --force || echo "警告: 数据库同步失败"
```

**优点**: 避免交互式确认，自动应用变更

### 开发环境 (Development)

保留交互模式，手动确认变更:

```bash
npx drizzle-kit push
```

---

## 🐛 常见问题排查

### 问题 1: "Failed to create asset"

**原因**: 表结构与代码不匹配

**排查步骤**:
```bash
# 1. 检查数据库文件是否存在
ls -la /app/data/gateway.db

# 2. 查看表结构
sqlite3 /app/data/gateway.db ".schema assets"

# 3. 对比 schema 定义
grep -A 20 "export const assetsTable" src/server/shared/schema.ts
```

### 问题 2: drizzle-kit push 失败

**原因**: better-sqlite3 未正确构建

**解决方案**:
```bash
# 在 Dockerfile 中已处理
RUN npm prune --omit=dev --ignore-scripts && \
    npm install drizzle-kit --ignore-scripts
```

### 问题 3: 表已存在但结构不匹配

**症状**: 应用启动但查询失败

**解决**:
```bash
# 手动运行同步
docker exec -it <container> npx drizzle-kit push --force
```

---

## 📁 相关文件清单

| 文件 | 作用 | 行号 |
|------|------|------|
| `scripts/docker-entrypoint.sh` | Docker 入口，调用 drizzle-kit | 25 |
| `drizzle.config.ts` | Drizzle Kit 配置 | 全文 |
| `src/server/shared/schema.ts` | 数据库 Schema 定义 | 全文 |
| `src/server/index.ts` | 应用入口，调用 initDatabase | 18 |
| `src/server/shared/database.ts` | 数据库初始化和迁移逻辑 | 10-250 |
| `src/server/prod.ts` | 生产环境服务器入口 | - |

---

## 🔧 调试命令

```bash
# 查看 drizzle-kit push 执行的 SQL
npx drizzle-kit push --verbose

# 手动连接数据库查看表结构
sqlite3 /app/data/gateway.db ".schema"

# 查看特定表结构
sqlite3 /app/data/gateway.db "PRAGMA table_info(assets);"

# 查看所有表
sqlite3 /app/data/gateway.db ".tables"
```

