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

// ============================================================
// AgentTool 定义
// ============================================================

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
];

// ============================================================
// 获取模型（优先用已注册的 provider，否则用 pi-ai 内置）
// ============================================================

async function getModel(): Promise<{ model: Model<Api>; apiKey?: string } | null> {
  try {
    // 先从已注册的 provider 找
    const { getModelsInstance } = await import('../../pi-providers/index');
    const catalog = getModelsInstance();
    let m = catalog.getModel('opencode-go', 'deepseek-v4-flash');

    if (m) return { model: m };

    // 没有注册的 → 用 pi-ai 内置，从 DB 拿 key
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
    const builtin = builtinModels();
    m = builtin.getModel('opencode-go', 'deepseek-v4-flash')
      || builtin.getModels().find(x => x.reasoning);

    if (!m) return null;

    // 从 DB 找对应 key
    const { queryFirst } = await import('../../shared/database');
    const asset = queryFirst('SELECT api_key FROM assets WHERE vendor_id = ? LIMIT 1', [m.provider]);
    return { model: m, apiKey: asset?.api_key };
  } catch { return null; }
}

// ============================================================
// API Route
// ============================================================

router.post('/chat', async (c) => {
  const { message, history } = await c.req.json();
  if (!message) return c.json({ reply: '请说点什么。' });

  // 获取模型
  const modelInfo = await getModel();
  if (!modelInfo) {
    // 没有 AI 模型可用 → 规则降级
    return c.json({ reply: await fallbackReply(message) });
  }

  const { model, apiKey } = modelInfo;

  // 创建 Agent
  const agent = new Agent({
    initialState: {
      systemPrompt: '你是网关配置助手。根据用户的需求调用工具来管理网关配置。用中文回复。',
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
