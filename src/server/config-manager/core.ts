/**
 * 配置管理核心模块
 *
 * 提供配置变更的：备份、校验、应用、回滚 能力。
 * 所有配置修改必须经过此模块，确保可回滚。
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { queryAll, queryRun } from '../shared/database';

// ============================================================
// 备份管理
// ============================================================

const BACKUP_DIR = resolve(process.cwd(), 'data', 'config-backups');

function ensureBackupDir() {
  mkdirSync(BACKUP_DIR, { recursive: true });
}

export interface ConfigSnapshot {
  id: string;
  timestamp: string;
  description: string;
  tables: Record<string, any[]>;
}

/**
 * 创建配置快照（备份当前数据库状态）
 */
export function createSnapshot(description: string): ConfigSnapshot {
  ensureBackupDir();

  const tables = ['vendor_templates', 'assets', 'routes', 'api_keys', 'api_key_routes'];
  const snapshot: ConfigSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    description,
    tables: {},
  };

  for (const table of tables) {
    try {
      snapshot.tables[table] = queryAll(`SELECT * FROM ${table}`);
    } catch {
      snapshot.tables[table] = [];
    }
  }

  const filePath = join(BACKUP_DIR, `${snapshot.id}.json`);
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  console.log(`[ConfigManager] ✅ 备份已创建: ${filePath}`);
  return snapshot;
}

/**
 * 从快照恢复
 */
export function restoreSnapshot(snapshotId: string): { success: boolean; error?: string } {
  const filePath = join(BACKUP_DIR, `${snapshotId}.json`);
  if (!existsSync(filePath)) {
    return { success: false, error: `备份文件不存在: ${snapshotId}` };
  }

  try {
    const snapshot = JSON.parse(readFileSync(filePath, 'utf-8')) as ConfigSnapshot;

    // 禁用外键检查，按依赖顺序清空
    queryRun('PRAGMA foreign_keys = OFF');
    try {
      // 按依赖反序清空
      const clearOrder = ['api_key_routes', 'routes', 'assets', 'api_keys', 'vendor_models', 'vendor_templates'];
      for (const table of clearOrder) {
        if (snapshot.tables[table]) {
          queryRun(`DELETE FROM ${table}`);
          // 重新插入
          for (const row of snapshot.tables[table]) {
            const keys = Object.keys(row);
            const values = Object.values(row);
            const placeholders = keys.map(() => '?').join(',');
            queryRun(
              `INSERT INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`,
              values
            );
          }
        }
      }
    } finally {
      queryRun('PRAGMA foreign_keys = ON');
    }

    console.log(`[ConfigManager] ✅ 已从 ${snapshotId} 恢复 (${snapshot.description})`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * 列出所有可用备份
 */
export function listSnapshots(): { id: string; timestamp: string; description: string }[] {
  ensureBackupDir();
  const files = readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
  return files.map(f => {
    try {
      const s = JSON.parse(readFileSync(join(BACKUP_DIR, f), 'utf-8'));
      return { id: s.id, timestamp: s.timestamp, description: s.description };
    } catch {
      return { id: f.replace('.json', ''), timestamp: 'unknown', description: 'parse error' };
    }
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ============================================================
// 校验
// ============================================================

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * 校验 vendor 配置
 */
export function validateVendor(data: {
  name: string;
  baseUrl: string;
  endpoint?: string;
  models?: string[];
}): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push({ field: 'name', message: '厂商名称不能为空' });
  }

  if (!data.baseUrl || !data.baseUrl.startsWith('http')) {
    errors.push({ field: 'baseUrl', message: 'baseUrl 必须是有效的 HTTP/HTTPS 地址' });
  }

  if (data.models && data.models.length > 0) {
    for (const m of data.models) {
      if (m.includes(' ')) {
        errors.push({ field: 'models', message: `模型名不能包含空格: "${m}"` });
      }
    }
  }

  return errors;
}

/**
 * 校验 API Key
 */
export function validateApiKey(data: { name: string; key: string; vendorId?: string }): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.name || data.name.trim().length === 0) {
    errors.push({ field: 'name', message: '名称不能为空' });
  }

  if (!data.key || data.key.trim().length < 8) {
    errors.push({ field: 'key', message: 'API Key 长度不足（至少 8 位）' });
  }

  if (data.key && !/^sk-/.test(data.key) && !/^[a-f0-9]{32}$/i.test(data.key)) {
    // 部分 key 不以 sk- 开头，只是警告不强制
  }

  return errors;
}

/**
 * 校验路由配置
 */
export function validateRoute(data: {
  name: string;
  modelPattern: string;
  upstreamModel: string;
}): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!data.name) errors.push({ field: 'name', message: '路由名称不能为空' });
  if (!data.modelPattern) errors.push({ field: 'modelPattern', message: '模型匹配模式不能为空' });
  if (!data.upstreamModel) errors.push({ field: 'upstreamModel', message: '上游模型名不能为空' });

  return errors;
}

/**
 * 测试配置：尝试连接并验证
 */
export async function testConfig(config: {
  type: 'vendor' | 'route';
  baseUrl?: string;
  apiKey?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    if (config.type === 'vendor' && config.baseUrl) {
      const resp = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/v1/models`, {
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        return { success: true, message: `连接成功，状态码: ${resp.status}` };
      } else {
        return { success: false, message: `连接失败，状态码: ${resp.status}` };
      }
    }
    return { success: true, message: '跳过测试' };
  } catch (e: any) {
    return { success: false, message: `连接异常: ${e.message}` };
  }
}

// ============================================================
// 工具函数：应用配置变更（带自动回滚）
// ============================================================

export async function applyConfig<T>(
  description: string,
  applyFn: () => Promise<T>,
  verifyFn?: () => Promise<boolean>
): Promise<{ success: boolean; result?: T; error?: string; snapshotId?: string }> {
  // 1. 备份
  const snapshot = createSnapshot(description);

  try {
    // 2. 应用变更
    const result = await applyFn();

    // 3. 验证（可选）
    if (verifyFn) {
      const valid = await verifyFn();
      if (!valid) {
        throw new Error('验证失败，配置可能存在问题');
      }
    }

    return { success: true, result, snapshotId: snapshot.id };
  } catch (e: any) {
    // 4. 失败 → 自动回滚
    console.error(`[ConfigManager] ❌ 应用失败，正在回滚: ${e.message}`);
    const rollbackResult = restoreSnapshot(snapshot.id);
    return {
      success: false,
      error: e.message,
      snapshotId: rollbackResult.success ? snapshot.id : undefined,
    };
  }
}
