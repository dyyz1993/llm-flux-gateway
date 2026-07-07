/**
 * 配置助手 API — 基于 pi-agent-core
 *
 * 用 @earendil-works/pi-agent-core 的 Agent 管理状态、
 * function calling、tool 执行循环。
 *
 * POST /api/config-assistant/chat
 *   { message: "帮我加个 opencode 的 key", history: [...] }
 *   → { reply: "...", action: "..." }
 */
import { Hono } from 'hono';
import { Type } from '@earendil-works/pi-ai';
import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { Model, Api } from '@earendil-works/pi-ai';
import * as tools from '../../config-manager/tools';

const router = new Hono();

const AGENT_SYSTEM_PROMPT = `你是网关 LLM Flux Gateway 的配置助手。你的职责是通过调用工具来管理网关配置。

## 核心概念

网关有四个核心配置对象，它们的关系是：

### 1. 厂商 (Vendor) — 上游 LLM 供应商
- 存储在 vendor_templates 表
- 字段: id(自动生成), name(显示名), display_name, base_url(API地址), endpoint(接口路径), status(active/inactive)
- baseUrl 是 API 的根地址，如 https://api.openai.com/v1
- endpoint 是接口路径，OpenAI 兼容用 /chat/completions，Anthropic 用 /messages
- 厂商本身不存 Key，Key 存在资产里

### 2. 资产 (Asset) — 上游供应商的 API Key
- 存储在 assets 表
- 字段: id, name(资产名), vendor_id(关联的厂商), api_key(真实的API Key), status(active/inactive)
- 一个厂商可以有多个资产（多个 Key）
- 资产是被网关用来调用上游 API 的凭证
- 注意区分：资产是"网关向上游付钱用的 Key"，不是客户端用的 Key

### 3. 平台 Key (ApiKey) — 客户端调用网关时的认证凭证
- 存储在 api_keys 表
- 字段: id, name(名称), key_token(Key 值，如 sk-flux-xxx), status(active/inactive)
- 客户端发请求时在 HTTP Header 中传: Authorization: Bearer sk-flux-xxx
- 一个平台 Key 可以关联多个路由（通过 api_key_routes 绑定表）
- 注意区分：平台 Key 是"客户端向网关认证用的 Key"，不是上游 Key

### 4. 路由 (Route) — 模型到上游的映射规则
- 存储在 routes 表
- 字段: id, name(路由名), asset_id(关联的资产), overrides(JSON映射规则), is_active, priority(优先级), request_format(协议格式)
- overrides 示例: [{"field":"model","matchValues":["gpt-4o","deepseek"],"rewriteValue":"deepseek-v4-flash"}]
  - matchValues: 客户端请求时传的模型名（支持多个）
  - rewriteValue: 实际调用的上游模型名
- request_format: openai / anthropic / gemini
- 路由通过 api_key_routes 表绑定到平台 Key

## 数据流（完整请求链路）

客户端请求 → 带平台 Key → 网关鉴权 → 路由匹配(model名) → 找到对应资产 → 用资产的 API Key 调上游

## 两条调试路径

1. 🔌 直连模式: 直接用资产的 API Key + 模型名，通过 pi-ai 内置的厂商配置调上游
   - 用途: 调试"这个 Key 和这个模型能不能通"
   - 不需要路由配置，不需要平台 Key

2. 🛣️ 路由模式: 选一个平台 Key，走网关的完整路由链路
   - 用途: 调试"路由配置是否正确"
   - 会经过: 平台 Key 鉴权 → 路由匹配 → 资产 Key 调上游
   - 需要平台 Key 已经绑定了路由

## 快捷接入流程（用户给一个厂商名+Key，AI 应该自动完成以下步骤）

当用户说"帮我接入 XXX，key=sk-xxx"时，按顺序执行：

第1步: 调用 list_vendors 检查厂商是否已存在（如果已存在则跳过 1）
第2步: 调用 quick_setup(providerId, apiKey) → 添加厂商+资产+路由
第3步: 调用 add_platform_key(name, key?=自动生成) → 创建一个平台 Key
       - key 参数不用传，工具会自动生成 sk-flux-{随机16位}
       - 名称用 "{厂商名} 测试 Key"
第4步: 调用 run_bash 测试连接:
       curl -s -X POST http://localhost:3001/v1/chat/completions \
         -H "Content-Type: application/json" \
         -H "Authorization: Bearer {刚创建的平台Key}" \
         -d '{"model":"{路由匹配的模型名}","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'
第5步: 给用户返回:
       - 配置成功摘要（厂商/模型/路由名）
       - 测试结果（通/不通）
       - 可直接用的 curl 命令

## 常用操作

- quick_setup: 一键添加厂商+资产+路由
- 添加平台 Key 后需要通过 quick_setup 或手动配置路由才能使用
- 添加资产前必须先有厂商
- 操作前会自动备份，失败了可以 restore_config 恢复到之前的状态`;

const agentTools: AgentTool[] = [
  {
    name: 'list_vendors',
    label: '列出厂商',
    description: '列出所有已配置的厂商/供应商',
    parameters: Type.Object({}),
    execute: async () => {
      const v = await tools.listVendors();
      const text = v.length ? v.map((x: any) => `• ${x.name} (${x.base_url})`).join('\n') : '暂无厂商';
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'list_api_keys',
    label: '列出 Key',
    description: '列出所有已配置的 API Key',
    parameters: Type.Object({}),
    execute: async () => {
      const k = await tools.listApiKeys();
      const text = k.length ? k.map((x: any) => `• ${x.name}: ${(x.keyPrefix||'').slice(0,16)}...`).join('\n') : '暂无 Key';
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'list_routes',
    label: '列出路由',
    description: '列出所有路由配置',
    parameters: Type.Object({}),
    execute: async () => {
      const r = await tools.listRoutes();
      const text = r.length ? r.map((x: any) => `• ${x.name} → ${x.vendor_name||'?'}`).join('\n') : '暂无路由';
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'quick_setup',
    label: '快速配置',
    description: '快速接入一个厂商。自动添加厂商、API Key、路由并绑定。',
    parameters: Type.Object({
      providerId: Type.String({ description: '厂商 ID, 如 opencode-go, openai, anthropic, deepseek' }),
      apiKey: Type.String({ description: 'API Key' }),
      keyName: Type.Optional(Type.String({ description: 'Key 名称' })),
    }),
    execute: async (_id, args) => {
      const r = await tools.quickSetup({ providerId: args.providerId, apiKey: args.apiKey, keyName: args.keyName });
      const text = r.success ? `✅ ${r.summary || '配置成功'}` : `❌ ${r.error || '失败'}`;
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'add_api_key',
    label: '添加 Key',
    description: '添加一个 API Key',
    parameters: Type.Object({
      name: Type.String({ description: 'Key 名称' }),
      key: Type.String({ description: 'API Key 字符串' }),
    }),
    execute: async (_id, args) => {
      const r = await tools.addApiKey({ name: args.name, key: args.key });
      const text = r.success ? `✅ Key "${args.name}" 已添加` : `❌ ${r.error || '失败'}`;
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'backup_config',
    label: '备份配置',
    description: '创建当前配置的备份快照',
    parameters: Type.Object({
      description: Type.Optional(Type.String({ description: '备份说明' })),
    }),
    execute: async (_id, args) => {
      const result = tools.backup(args.description || 'AI 备份');
      return { content: [{ type: 'text', text: `✅ 备份已创建: \`${result.id}\`` }] };
    },
  },
  {
    name: 'list_backups',
    label: '查看备份',
    description: '查看所有可用的备份快照',
    parameters: Type.Object({}),
    execute: async () => {
      const b = tools.showBackups();
      const text = b.length ? b.map((x: any) => `• ${x.id}: ${x.description}`).join('\n') : '暂无备份';
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'restore_config',
    label: '恢复配置',
    description: '从备份快照恢复配置',
    parameters: Type.Object({
      snapshotId: Type.String({ description: '备份快照 ID' }),
    }),
    execute: async (_id, args) => {
      const r = tools.rollback(args.snapshotId);
      const text = r.success ? '✅ 已恢复' : `❌ ${r.error}`;
      return { content: [{ type: 'text', text }] };
    },
  },
  // ========================================
  // 资产（上游 API Key）
  // ========================================
  {
    name: 'list_assets',
    label: '列出资产',
    description: '列出所有上游 API Key（资产），每个资产关联一个厂商',
    parameters: Type.Object({}),
    execute: async () => {
      const { queryAll } = await import('../../shared/database');
      const assets = queryAll(`
        SELECT a.name, a.api_key, v.name as vendor, a.status
        FROM assets a JOIN vendor_templates v ON a.vendor_id = v.id
        ORDER BY v.name
      `) as any[];
      const text = assets.length
        ? assets.map((a: any) => `• ${a.name} → ${a.vendor} (${a.status}): ${(a.api_key||'').slice(0,16)}...`).join('\n')
        : '暂无资产';
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'add_asset',
    label: '添加资产',
    description: '添加上游 API Key（资产），需要指定厂商和 Key',
    parameters: Type.Object({
      vendorId: Type.String({ description: '厂商 ID，如 opencode-go、openai' }),
      apiKey: Type.String({ description: 'API Key' }),
      name: Type.Optional(Type.String({ description: '资产名称（可选）' })),
    }),
    execute: async (_id, args) => {
      const { queryRun, queryFirst } = await import('../../shared/database');
      const now = Math.floor(Date.now() / 1000);
      const id = `asset-${Date.now()}`;
      const vendor = queryFirst('SELECT name FROM vendor_templates WHERE id = ?', [args.vendorId]);
      if (!vendor) return { content: [{ type: 'text', text: `❌ 厂商不存在: ${args.vendorId}` }] };
      queryRun(
        'INSERT INTO assets (id, name, vendor_id, api_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, args.name || `${vendor.name} Key`, args.vendorId, args.apiKey, 'active', now, now]
      );
      return { content: [{ type: 'text', text: `✅ 资产已添加: ${args.name || vendor.name} Key` }] };
    },
  },
  // ========================================
  // 平台 Key（客户端认证用）
  // ========================================
  {
    name: 'list_platform_keys',
    label: '列出平台 Key',
    description: '列出所有客户端调用网关时使用的认证 Key',
    parameters: Type.Object({}),
    execute: async () => {
      const { queryAll } = await import('../../shared/database');
      const keys = queryAll('SELECT id, name, key_token, status FROM api_keys ORDER BY name') as any[];
      const text = keys.length
        ? keys.map((k: any) => `• ${k.name} (${k.status}): ${(k.key_token||'').slice(0,16)}...`).join('\n')
        : '暂无平台 Key';
      return { content: [{ type: 'text', text }] };
    },
  },
  {
    name: 'add_platform_key',
    label: '添加平台 Key',
    description: '添加客户端调用网关时使用的认证 Key。Key 值自动生成，格式 sk-flux-{随机12位}。',
    parameters: Type.Object({
      name: Type.String({ description: 'Key 名称，建议包含用途说明，如 "opencode-go 测试 Key"' }),
      key: Type.Optional(Type.String({ description: '自定义 Key 值（可选），不传则自动生成 sk-flux-{随机12位}' })),
    }),
    execute: async (_id, args) => {
      const { randomBytes } = await import('node:crypto');
      const keyValue = args.key || `sk-flux-${randomBytes(8).toString('hex')}`;
      const { queryRun } = await import('../../shared/database');
      const now = Math.floor(Date.now() / 1000);
      const id = `key-${Date.now()}`;
      queryRun(
        'INSERT INTO api_keys (id, key_token, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, keyValue, args.name, 'active', now, now]
      );
      return { content: [{ type: 'text', text: `✅ 平台 Key "${args.name}" 已添加\nKey 值: \`${keyValue}\`\n⚠️ 请复制保存，不再显示` }] };
    },
  },
  // ========================================
  // Bash 沙箱执行
  // ========================================
  {
    name: 'run_bash',
    label: '执行脚本',
    description: '在沙箱临时目录执行 shell 命令。用于调试、检查、运行脚本。不可用于生产操作。',
    parameters: Type.Object({
      command: Type.String({ description: '要执行的 shell 命令' }),
    }),
    execute: async (_id, args) => {
      const { execSync } = await import('node:child_process');
      const { mkdirSync, rmSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      const sandbox = join(tmpdir(), 'flux-sandbox');
      mkdirSync(sandbox, { recursive: true });
      try {
        const result = execSync(args.command, {
          cwd: sandbox,
          timeout: 10000,
          maxBuffer: 1024 * 100,
          encoding: 'utf-8',
          env: { ...process.env, PATH: process.env.PATH },
        });
        return { content: [{ type: 'text', text: result || '(无输出)' }] };
      } catch (e: any) {
        return { content: [{ type: 'text', text: `❌ ${e.stderr || e.message}` }] };
      }
    },
  },
  // ========================================
  // 删除操作
  // ========================================
  {
    name: 'delete_vendor',
    label: '删除厂商',
    description: '删除一个厂商。如果厂商下有资产或路由会阻止删除。',
    parameters: Type.Object({
      vendorId: Type.String({ description: '厂商 ID，如 opencode-go' }),
    }),
    execute: async (_id, args) => {
      const r = await tools.deleteVendor(args.vendorId);
      return { content: [{ type: 'text', text: r.success ? `✅ 已删除厂商 ${args.vendorId}` : `❌ ${r.error}` }] };
    },
  },
  {
    name: 'delete_route',
    label: '删除路由',
    description: '删除一个路由',
    parameters: Type.Object({
      routeId: Type.String({ description: '路由 ID' }),
    }),
    execute: async (_id, args) => {
      const r = await tools.deleteRoute(args.routeId);
      return { content: [{ type: 'text', text: r.success ? '✅ 已删除路由' : `❌ ${r.error}` }] };
    },
  },
  {
    name: 'delete_asset',
    label: '删除资产',
    description: '删除一个上游 API Key（资产）',
    parameters: Type.Object({
      assetId: Type.String({ description: '资产 ID' }),
    }),
    execute: async (_id, args) => {
      const { queryRun, queryFirst } = await import('../../shared/database');
      const asset = queryFirst('SELECT name FROM assets WHERE id = ?', [args.assetId]);
      if (!asset) return { content: [{ type: 'text', text: '❌ 资产不存在' }] };
      // 检查是否有路由在使用
      const routes = queryFirst('SELECT id FROM routes WHERE asset_id = ? LIMIT 1', [args.assetId]);
      if (routes) return { content: [{ type: 'text', text: '❌ 该资产下有路由在使用，请先删除路由' }] };
      queryRun('DELETE FROM assets WHERE id = ?', [args.assetId]);
      return { content: [{ type: 'text', text: `✅ 已删除资产` }] };
    },
  },
  {
    name: 'delete_platform_key',
    label: '删除平台 Key',
    description: '删除一个平台 Key（客户端认证用）',
    parameters: Type.Object({
      keyId: Type.String({ description: '平台 Key ID' }),
    }),
    execute: async (_id, args) => {
      const { queryRun, queryFirst } = await import('../../shared/database');
      const key = queryFirst('SELECT name FROM api_keys WHERE id = ?', [args.keyId]);
      if (!key) return { content: [{ type: 'text', text: '❌ Key 不存在' }] };
      queryRun('DELETE FROM api_key_routes WHERE api_key_id = ?', [args.keyId]);
      queryRun('DELETE FROM api_keys WHERE id = ?', [args.keyId]);
      return { content: [{ type: 'text', text: `✅ 已删除 Key "${key.name}"` }] };
    },
  },
];

// ============================================================
// 获取模型（优先用已注册的 provider，否则用 pi-ai 内置）
// ============================================================

async function getModel(
  requestedModel?: string,
  requestedProvider?: string,
  mode?: 'direct' | 'route'
): Promise<{ model: Model<Api>; apiKey?: string } | null> {
  try {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
    const builtin = builtinModels();
    const { queryFirst, queryAll } = await import('../../shared/database');

    // 路由模式：通过已注册的路由 Provider 调用
    if (mode === 'route') {
      const { getModelsInstance, registerPiRoute, mapRequestFormatToApi } = await import('../../pi-providers/index');
      const catalog = getModelsInstance();
      let m = catalog.getModel('opencode-go', 'deepseek-v4-flash');
      if (!m) {
        // 优先找 opencode 路由，再找其他
        const route = queryFirst(`
          SELECT r.id, r.name, v.base_url, v.endpoint, a.api_key,
                 r.overrides, r.request_format
          FROM routes r
          JOIN assets a ON r.asset_id = a.id
          JOIN vendor_templates v ON a.vendor_id = v.id
          WHERE r.is_active = 1 AND a.status = 'active'
          ORDER BY CASE WHEN v.id = 'opencode-go' THEN 0 ELSE 1 END, r.priority DESC
          LIMIT 1
        `) as any;
        if (route) {
          const overrides = JSON.parse(route.overrides || '[]');
          const modelOverride = overrides.find((o: any) => o.field === 'model');
          const upstreamModel = modelOverride?.rewriteValue || route.name;
          const apiType = mapRequestFormatToApi(route.request_format || 'openai');
          try {
            m = await registerPiRoute({
              id: route.id,
              name: route.name,
              baseUrl: route.base_url,
              apiType: apiType as any,
              upstreamModel,
              apiKey: route.api_key,
              responseFormat: 'openai',
            });
            return { model: m, apiKey: route.api_key };
          } catch { /* fall through */ }
        }
      } else {
        return { model: m };
      }
    }

    // 直连模式（默认）：用 pi-ai 内置 + DB 的 Key
    // 如果指定了 provider，用它的 key
    if (requestedProvider) {
      const asset = queryFirst('SELECT api_key FROM assets WHERE vendor_id = ? LIMIT 1', [requestedProvider]);
      if (asset) {
        const m = requestedModel
          ? builtin.getModel(requestedProvider, requestedModel)
          : builtin.getModels(requestedProvider)[0];
        if (m) return { model: m, apiKey: asset.api_key };
      }
    }

    // 如果指定了模型，在所有 provider 中查找
    if (requestedModel) {
      for (const p of builtin.getProviders()) {
        const m = builtin.getModel(p.id, requestedModel);
        if (m) {
          const asset = queryFirst('SELECT api_key FROM assets WHERE vendor_id = ? LIMIT 1', [p.id]);
          if (asset) return { model: m, apiKey: asset.api_key };
          return { model: m };
        }
      }
    }

    // 默认：找有 key 的 provider
    const assets = queryAll('SELECT DISTINCT vendor_id FROM assets WHERE status = ?', ['active']) as any[];
    for (const a of assets) {
      const models = builtin.getModels(a.vendor_id);
      if (models.length > 0) {
        return { model: models[0]!, apiKey: a.api_key };
      }
    }

    return null;
  } catch { return null; }
}

/**
 * 获取可用的模型列表（有 API Key 的）
 */
async function getAvailableModels(): Promise<{ id: string; name: string; provider: string }[]> {
  try {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
    const catalog = builtinModels();
    const { queryAll } = await import('../../shared/database');
    const assets = queryAll('SELECT DISTINCT vendor_id FROM assets WHERE status = ?', ['active']) as any[];

    const vendorIds = new Set(assets.map((a: any) => a.vendor_id));
    const result: { id: string; name: string; provider: string }[] = [];

    for (const vid of vendorIds) {
      const models = catalog.getModels(vid);
      for (const m of models.slice(0, 5)) {
        result.push({ id: m.id, name: m.name, provider: vid });
      }
    }

    return result;
  } catch { return []; }
}

// ============================================================
// API Route
// ============================================================

router.post('/chat', async (c) => {
  const { message, history, modelId, providerId, keyId, mode } = await c.req.json();
  if (!message) return c.json({ reply: '请说点什么。' });

  let modelInfo: { model: Model<Api>; apiKey?: string } | null = null;

  if (mode === 'route' && keyId) {
    // 路由模式 + 平台 Key：走网关路由
    const { getModelsInstance, registerPiRoute, mapRequestFormatToApi } = await import('../../pi-providers/index');
    const { queryFirst } = await import('../../shared/database');
    // 找到平台 Key 关联的路由
    const row = queryFirst(`
      SELECT r.id, r.name, v.base_url, v.endpoint, a.api_key,
             r.overrides, r.request_format
      FROM api_key_routes akr
      JOIN routes r ON akr.route_id = r.id
      JOIN assets a ON r.asset_id = a.id
      JOIN vendor_templates v ON a.vendor_id = v.id
      WHERE akr.api_key_id = ? AND r.is_active = 1
      ORDER BY akr.priority DESC
      LIMIT 1
    `, [keyId]) as any;

    if (row) {
      const overrides = JSON.parse(row.overrides || '[]');
      const modelOverride = overrides.find((o: any) => o.field === 'model');
      const upstreamModel = modelOverride?.rewriteValue || row.name;
      const apiType = mapRequestFormatToApi(row.request_format || 'openai');
      const m = await registerPiRoute({
        id: row.id, name: row.name, baseUrl: row.base_url,
        apiType: apiType as any, upstreamModel, apiKey: row.api_key,
        responseFormat: 'openai',
      });
      modelInfo = { model: m, apiKey: row.api_key };
    }
    if (!modelInfo) {
      return c.json({ reply: '❌ 该平台 Key 没有关联任何活跃路由' });
    }
  } else {
    // 直连模式（默认）
    modelInfo = await getModel(modelId, providerId);
  }
  if (!modelInfo) {
    // 没有 AI 模型可用 → 规则降级
    return c.json({ reply: await fallbackReply(message) });
  }

  const { model, apiKey } = modelInfo;

  // 创建 Agent
  const agent = new Agent({
    initialState: {
      systemPrompt: AGENT_SYSTEM_PROMPT,
      model,
      tools: agentTools,
      messages: [],
    },
    toolExecution: 'sequential',
    // 从 DB 动态获取 API Key
    getApiKey: apiKey ? async () => apiKey : undefined,
  });

  // 记录回复
  let replyText = '';

  agent.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      replyText += event.assistantMessageEvent.delta;
    }
  });

  try {
    // 恢复历史
    if (history?.length) {
      for (const h of history.slice(-10)) {
        if (h.role === 'user') {
          agent.state.messages.push({ role: 'user', content: h.content, timestamp: Date.now() });
        }
      }
    }

    // 执行 prompt
    await agent.prompt(message);

    // 从最后的消息中提取完整文本
    const lastMsg = agent.state.messages[agent.state.messages.length - 1];
    if (lastMsg?.role === 'assistant') {
      const text = (lastMsg as any).content?.filter?.((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      if (text) replyText = text;
    }

    // 检测调用了什么工具
    const toolCalls = agent.state.messages.filter(m =>
      (m as any).content?.some?.((b: any) => b.type === 'toolCall')
    );
    const action = toolCalls.length > 0
      ? (toolCalls[toolCalls.length - 1] as any).content.find((b: any) => b.type === 'toolCall')?.name
      : undefined;

    // AI 回复为空或只有"已完成"时降级到规则模式
    if (!replyText || replyText === '已完成' || replyText.length < 2) {
      const fallback = await fallbackReply(message);
      if (!fallback.startsWith('🤔')) {
        return c.json({ reply: fallback, action: undefined });
      }
    }

    return c.json({ reply: replyText || '已完成', action });
  } catch (e: any) {
    // AI 出错时降级到规则模式
    try {
      const fallback = await fallbackReply(message);
      return c.json({ reply: fallback, action: undefined });
    } catch {
      return c.json({ reply: `❌ ${e.message}` });
    }
  }
});

// 获取可用平台 Key（路由模式用）
router.get('/keys', async (c) => {
  try {
    const { queryAll } = await import('../../shared/database');
    const keys = queryAll('SELECT id, name, key_token, status FROM api_keys ORDER BY name') as any[];
    return c.json({ data: keys.map((k: any) => ({ id: k.id, name: k.name, keyPrefix: (k.key_token || '').slice(0, 16) + '...', status: k.status })) });
  } catch { return c.json({ data: [] }); }
});

// 直连配置 API（绕过 AI 模式，直接调用工具）
router.post('/setup', async (c) => {
  const { providerId, apiKey } = await c.req.json();
  if (!providerId || !apiKey) {
    return c.json({ success: false, error: '需要 providerId 和 apiKey' });
  }
  const result = await tools.quickSetup({ providerId, apiKey });
  return c.json(result);
});

// 获取可用模型列表
router.get('/models', async (c) => {
  const models = await getAvailableModels();
  return c.json({ data: models });
});

// 获取有 Key 的供应商列表
router.get('/providers', async (c) => {
  try {
    const { queryAll } = await import('../../shared/database');
    const assets = queryAll(`
      SELECT DISTINCT a.vendor_id as id, v.name, v.base_url, a.api_key
      FROM assets a
      JOIN vendor_templates v ON a.vendor_id = v.id
      WHERE a.status = 'active'
    `) as any[];
    return c.json({
      data: assets.map((a: any) => ({
        id: a.id,
        name: a.name,
        keyPrefix: (a.api_key || '').slice(0, 16) + '...',
        baseUrl: a.base_url,
      })),
    });
  } catch { return c.json({ data: [] }); }
});

// ============================================================
// 规则降级
// ============================================================

async function fallbackReply(msg: string): Promise<string> {
  const m = msg.toLowerCase();

  // 模拟 toolImpl 的行为
  if (/^(查看|显示|列表|有哪些)/.test(m)) {
    if (/厂商|vendor/.test(m)) {
      const v = await tools.listVendors();
      return `📋 厂商:\n${v.length ? v.map((x: any) => `• ${x.name}`).join('\n') : '暂无'}`;
    }
    if (/key|密钥/.test(m)) {
      const k = await tools.listApiKeys();
      return `📋 Key:\n${k.length ? k.map((x: any) => `• ${x.name}`).join('\n') : '暂无'}`;
    }
  }

  if (/快速配置|setup/.test(m)) {
    const p = m.match(/opencode-go|openai|anthropic|deepseek/);
    const k = m.match(/(sk-\S+)/);
    if (p && k) {
      const r = await tools.quickSetup({ providerId: p[0], apiKey: k[0] });
      return r.success ? `✅ 配置成功` : `❌ 失败: ${r.error}`;
    }
    return '请指定厂商和 Key，如：快速配置 opencode-go';
  }

  if (/备份/.test(m)) {
    const r = tools.backup('手动备份');
    return `✅ 备份已创建: \`${r.id}\``;
  }

  return '🤔 没理解，试试说"帮助"';
}

export default router;
