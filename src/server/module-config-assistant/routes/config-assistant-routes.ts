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

网关有四个核心配置对象：

1. **厂商 (Vendor)** — 上游 LLM 供应商，如 OpenAI、Anthropic、opencode-go
   - 每个厂商有 baseUrl（API 地址）和 endpoint（接口路径）
   - 厂商信息存储在 vendor_templates 表

2. **资产 (Asset)** — 上游供应商的 API Key
   - 每个资产关联一个厂商（vendor_id）
   - 存在 assets 表
   - 资产是网关调用上游 API 时使用的 Key

3. **平台 Key (ApiKey)** — 客户端调用网关时使用的认证 Key
   - 存在 api_keys 表
   - 客户端请求时在 Authorization header 中传递
   - 每个 Key 可以绑定到不同的路由

4. **路由 (Route)** — 模型到上游的映射规则
   - 定义哪个模型名匹配到哪个上游厂商的哪个模型
   - 通过 overrides 字段配置映射规则
   - 通过 api_key_routes 表绑定到平台 Key

## 数据流

客户端请求 → 平台 Key 鉴权 → 路由匹配(model名) → 找到对应厂商 → 用资产 Key 调上游

## 常用操作

- quick_setup: 一键添加厂商+资产+路由，适合快速接入
- 添加平台 Key 后需要通过 bind_route_to_key 绑定路由才能使用
- 操作前会自动备份，失败了可以 restore_config 恢复`;

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
    description: '添加客户端调用网关时使用的认证 Key',
    parameters: Type.Object({
      name: Type.String({ description: 'Key 名称' }),
      key: Type.String({ description: 'Key 字符串，建议以 sk-flux- 开头' }),
    }),
    execute: async (_id, args) => {
      const { queryRun } = await import('../../shared/database');
      const now = Math.floor(Date.now() / 1000);
      const id = `key-${Date.now()}`;
      queryRun(
        'INSERT INTO api_keys (id, key_token, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, args.key, args.name, 'active', now, now]
      );
      return { content: [{ type: 'text', text: `✅ 平台 Key "${args.name}" 已添加` }] };
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
];

// ============================================================
// 获取模型（优先用已注册的 provider，否则用 pi-ai 内置）
// ============================================================

async function getModel(requestedModel?: string, requestedProvider?: string): Promise<{ model: Model<Api>; apiKey?: string } | null> {
  try {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
    const builtin = builtinModels();
    const { queryFirst } = await import('../../shared/database');

    // 如果指定了 provider，用它的 key
    if (requestedProvider) {
      const asset = queryFirst('SELECT api_key FROM assets WHERE vendor_id = ? LIMIT 1', [requestedProvider]);
      if (asset) {
        // 找该 provider 下的模型
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
          return { model: m }; // 没 key 也能试试
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
  const { message, history, modelId, providerId } = await c.req.json();
  if (!message) return c.json({ reply: '请说点什么。' });

  // 获取模型（支持指定模型和供应商）
  const modelInfo = await getModel(modelId, providerId);
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

    return c.json({ reply: replyText || '已完成', action });
  } catch (e: any) {
    return c.json({ reply: `❌ ${e.message}` });
  }
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
