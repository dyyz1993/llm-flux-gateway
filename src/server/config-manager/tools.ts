/**
 * 配置管理工具集
 *
 * 每个工具对应一个配置操作，带强校验和自动回滚。
 * 可被 agent 通过聊天调用，也可通过 CLI 使用。
 */
import { queryRun, queryAll, queryFirst } from '../shared/database';
import {
  createSnapshot,
  restoreSnapshot,
  listSnapshots,
  validateVendor,
  validateApiKey,
  validateRoute,
  applyConfig,
} from './core';

// ============================================================
// 工具: 查看当前配置
// ============================================================

export function listVendors() {
  return queryAll(`SELECT id, name, display_name, base_url, endpoint, status FROM vendor_templates ORDER BY name`);
}

export function listApiKeys() {
  return queryAll(`SELECT id, name, key_token as keyPrefix, status, created_at FROM api_keys ORDER BY name`);
}

export function listRoutes() {
  return queryAll(`
    SELECT r.id, r.name, r.is_active, r.priority,
           a.name as asset_name, v.name as vendor_name,
           r.overrides
    FROM routes r
    LEFT JOIN assets a ON r.asset_id = a.id
    LEFT JOIN vendor_templates v ON a.vendor_id = v.id
    ORDER BY r.priority DESC
  `);
}

export function listRouteKeyBindings() {
  return queryAll(`
    SELECT akr.id, akr.api_key_id, ak.key_token as key_token,
           akr.route_id, r.name as route_name,
           akr.priority, akr.health_status
    FROM api_key_routes akr
    JOIN api_keys ak ON akr.api_key_id = ak.id
    JOIN routes r ON akr.route_id = r.id
    ORDER BY ak.name, akr.priority
  `);
}

// ============================================================
// 工具: 添加厂商
// ============================================================

export interface AddVendorInput {
  name: string;
  baseUrl: string;
  endpoint?: string;
  models?: string[];
}

export async function addVendor(input: AddVendorInput) {
  const errors = validateVendor(input);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  return applyConfig(
    `添加厂商: ${input.name}`,
    async () => {
      const id = input.name.toLowerCase().replace(/\s+/g, '-');
      const now = Math.floor(Date.now() / 1000);

      queryRun(
        `INSERT INTO vendor_templates (id, name, display_name, base_url, endpoint, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [id, input.name, input.name, input.baseUrl, input.endpoint || '/chat/completions', now]
      );

      // 添加模型
      if (input.models && input.models.length > 0) {
        for (const modelId of input.models) {
          queryRun(
            `INSERT OR IGNORE INTO vendor_models (id, vendor_id, model_id, display_name, status, created_at)
             VALUES (?, ?, ?, ?, 'active', ?)`,
            [`${id}:${modelId}`, id, modelId, modelId, now]
          );
        }
      }

      return { id, name: input.name, baseUrl: input.baseUrl };
    },
    async () => {
      const v = queryFirst(`SELECT id FROM vendor_templates WHERE id = ?`, [input.name.toLowerCase().replace(/\s+/g, '-')]);
      return !!v;
    }
  );
}

// ============================================================
// 工具: 添加 API Key
// ============================================================

export interface AddApiKeyInput {
  name: string;
  key: string;
  vendorId?: string;
}

export async function addApiKey(input: AddApiKeyInput) {
  const errors = validateApiKey(input);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  return applyConfig(
    `添加 API Key: ${input.name}`,
    async () => {
      const id = `key-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Math.floor(Date.now() / 1000);

      queryRun(
        `INSERT INTO api_keys (id, key_token, name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`,
        [id, input.key, input.name, now, now]
      );

      return { id, name: input.name, keyPrefix: input.key.slice(0, 12) + '...' };
    },
    async () => {
      const k = queryFirst(`SELECT id FROM api_keys WHERE key_token = ?`, [input.key]);
      return !!k;
    }
  );
}

// ============================================================
// 工具: 添加路由（带模型映射）
// ============================================================

export interface AddRouteInput {
  name: string;
  modelPattern: string | string[];  // 匹配的模型名（支持多个）
  upstreamModel: string;             // 上游实际模型名
  vendorId: string;                  // 厂商 ID
  apiKeyId?: string;                 // 可用的 API Key ID
  apiKey?: string;                   // 或直接传 API Key（自动创建 asset）
}

export async function addRoute(input: AddRouteInput) {
  const patterns = Array.isArray(input.modelPattern) ? input.modelPattern : [input.modelPattern];
  const errors = validateRoute({ name: input.name, modelPattern: patterns.join(','), upstreamModel: input.upstreamModel });
  if (errors.length > 0) {
    return { success: false, errors };
  }

  return applyConfig(
    `添加路由: ${input.name} (${patterns.join(',')} → ${input.upstreamModel})`,
    async () => {
      const routeId = `${input.name.toLowerCase().replace(/\s+/g, '-')}-route`;
      const now = Math.floor(Date.now() / 1000);
      let assetId: string;

      // 1. 查找或创建 asset
      if (input.apiKey) {
        // 直接传了 key → 创建 asset
        assetId = `asset-${routeId}`;
        queryRun(
          `INSERT OR IGNORE INTO assets (id, name, vendor_id, api_key, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'active', ?, ?)`,
          [assetId, `${input.name} Key`, input.vendorId, input.apiKey, now, now]
        );
      } else if (input.apiKeyId) {
        // 已有 key id → 查找 asset
        const existing = queryFirst(
          `SELECT id FROM assets WHERE vendor_id = ? LIMIT 1`,
          [input.vendorId]
        );
        if (existing) {
          assetId = existing.id;
        } else {
          // 没有对应 asset 但给了 apiKeyId → 创建一个
          assetId = `asset-${routeId}`;
          const keyRecord = queryFirst(`SELECT key_token FROM api_keys WHERE id = ?`, [input.apiKeyId]);
          if (!keyRecord) {
            throw new Error(`API Key 不存在: ${input.apiKeyId}`);
          }
          queryRun(
            `INSERT OR IGNORE INTO assets (id, name, vendor_id, api_key, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'active', ?, ?)`,
            [assetId, `${input.name} Key`, input.vendorId, keyRecord.key_token, now, now]
          );
        }
      } else {
        throw new Error('需要提供 apiKey 或 apiKeyId');
      }

      // 2. 创建路由
      const overrides = JSON.stringify([{
        field: 'model',
        matchValues: patterns,
        rewriteValue: input.upstreamModel,
      }]);

      queryRun(
        `INSERT OR REPLACE INTO routes (id, name, asset_id, overrides, is_active, priority, config_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 10, 'manual', ?, ?)`,
        [routeId, input.name, assetId, overrides, now, now]
      );

      return { id: routeId, name: input.name, patterns, upstreamModel: input.upstreamModel };
    },
    async () => {
      const r = queryFirst(`SELECT id FROM routes WHERE id = ?`, [`${input.name.toLowerCase().replace(/\s+/g, '-')}-route`]);
      return !!r;
    }
  );
}

// ============================================================
// 工具: 绑定路由到 API Key
// ============================================================

export async function bindRouteToKey(routeId: string, apiKeyId: string, priority = 10) {
  return applyConfig(
    `绑定路由 ${routeId} → Key ${apiKeyId}`,
    async () => {
      const now = Math.floor(Date.now() / 1000);
      const id = `akr-${routeId}-${apiKeyId}`;
      queryRun(
        `INSERT OR REPLACE INTO api_key_routes (id, api_key_id, route_id, priority, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, apiKeyId, routeId, priority, now]
      );
      return { id, routeId, apiKeyId };
    },
    async () => {
      const r = queryFirst(`SELECT id FROM api_key_routes WHERE route_id = ? AND api_key_id = ?`, [routeId, apiKeyId]);
      return !!r;
    }
  );
}

// ============================================================
// 工具: 删除配置（带级联检查）
// ============================================================

export async function deleteVendor(vendorId: string) {
  const routes = queryAll(`SELECT r.id, r.name FROM routes r JOIN assets a ON r.asset_id = a.id WHERE a.vendor_id = ?`, [vendorId]);
  if (routes.length > 0) {
    return {
      success: false,
      error: `厂商 "${vendorId}" 下有 ${routes.length} 个路由在使用，请先删除路由`,
      routes,
    };
  }

  return applyConfig(
    `删除厂商: ${vendorId}`,
    async () => {
      queryRun(`DELETE FROM vendor_models WHERE vendor_id = ?`, [vendorId]);
      queryRun(`DELETE FROM assets WHERE vendor_id = ?`, [vendorId]);
      queryRun(`DELETE FROM vendor_templates WHERE id = ?`, [vendorId]);
      return { deleted: vendorId };
    }
  );
}

export async function deleteRoute(routeId: string) {
  return applyConfig(
    `删除路由: ${routeId}`,
    async () => {
      // 先解除所有 key 绑定
      queryRun(`DELETE FROM api_key_routes WHERE route_id = ?`, [routeId]);
      queryRun(`DELETE FROM routes WHERE id = ?`, [routeId]);
      return { deleted: routeId };
    }
  );
}

// ============================================================
// 工具: 备份与恢复
// ============================================================

export function backup(description: string) {
  return createSnapshot(description);
}

export function rollback(snapshotId: string) {
  return restoreSnapshot(snapshotId);
}

export function showBackups() {
  return listSnapshots();
}

// ============================================================
// 工具: 快速配置（用 pi-ai 内置厂商简化流程）
// ============================================================

export interface QuickSetupInput {
  /** pi-ai 内置厂商 ID: 'openai', 'anthropic', 'deepseek', 'opencode-go' 等 */
  providerId: string;
  /** API Key */
  apiKey: string;
  /** 给这个 key 起个名字 */
  keyName?: string;
  /** 匹配的模型名（不传则用厂商所有模型） */
  models?: string[];
}

/**
 * 快速配置：一行命令添加一个厂商 + key + 路由
 * 利用 pi-ai 内置的厂商信息，不需要手动填 baseUrl/endpoint
 */
export async function quickSetup(input: QuickSetupInput) {
  // 从 pi-ai 获取厂商信息
  let providerInfo: { baseUrl?: string; models: { id: string }[] } | null = null;
  try {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
    const catalog = builtinModels();
    const p = catalog.getProvider(input.providerId);
    const ms = catalog.getModels(input.providerId);
    if (p && ms.length > 0) {
      providerInfo = {
        baseUrl: p.baseUrl,
        models: ms as any as { id: string }[],
      };
    }
  } catch { /* ignore */ }

  if (!providerInfo) {
    return {
      success: false,
      error: `未找到 pi-ai 内置厂商 "${input.providerId}"。可用厂商: openai, anthropic, deepseek, opencode-go, google, mistral, groq...`,
    };
  }

  const displayName = input.providerId.charAt(0).toUpperCase() + input.providerId.slice(1);
  const models = input.models || providerInfo.models.slice(0, 5).map(m => m.id);

  // 1. 添加厂商
  const vendorResult = await addVendor({
    name: displayName,
    baseUrl: providerInfo.baseUrl || `https://api.${input.providerId}.com/v1`,
    models,
  });
  if (!vendorResult.success) return vendorResult;
  const vendorId = (vendorResult as any).result.id;

  // 2. 添加 API Key
  const keyResult = await addApiKey({
    name: input.keyName || `${displayName} Key`,
    key: input.apiKey,
    vendorId,
  });
  if (!keyResult.success) return keyResult;
  const apiKeyId = (keyResult as any).result.id;

  // 3. 添加路由（用第一个模型名作为路由名）
  const routeResult = await addRoute({
    name: `${displayName} Route`,
    modelPattern: models,
    upstreamModel: models[0]!,
    vendorId,
    apiKeyId,
  });
  if (!routeResult.success) return routeResult;

  // 4. 绑定到 key
  const bindResult = await bindRouteToKey((routeResult as any).result.id, apiKeyId);

  return {
    success: true,
    vendor: vendorResult,
    key: keyResult,
    route: routeResult,
    bind: bindResult,
    summary: `✅ 已配置 ${displayName}: ${models.length} 个模型, key=${input.apiKey.slice(0, 12)}...`,
  };
}
