/**
 * 配置助手 API — AI + function calling
 *
 * 优先用 pi-ai + LLM 理解自然语言，调用 config-manager 工具执行。
 * AI 不可用时自动降级为规则匹配。
 *
 * POST /api/config-assistant/chat
 *   { message: "帮我加个 opencode 的 key", history: [...] }
 *   → { reply: "...", action: "..." }
 */
import { Hono } from 'hono';
import { Type } from '@earendil-works/pi-ai';
import type { Tool, Context } from '@earendil-works/pi-ai';
import * as tools from '../../config-manager/tools';

const router = new Hono();

// ============================================================
// LLM 工具定义
// ============================================================

const assistantTools: Tool[] = [
  {
    name: 'list_vendors',
    description: '列出所有已配置的厂商/供应商',
    parameters: Type.Object({}),
  },
  {
    name: 'list_api_keys',
    description: '列出所有已配置的 API Key',
    parameters: Type.Object({}),
  },
  {
    name: 'list_routes',
    description: '列出所有路由配置',
    parameters: Type.Object({}),
  },
  {
    name: 'quick_setup',
    description: '快速接入一个厂商。自动添加厂商、API Key、路由并绑定。',
    parameters: Type.Object({
      providerId: Type.String({ description: 'pi-ai 内置厂商 ID, 如 opencode-go, openai, anthropic, deepseek' }),
      apiKey: Type.String({ description: 'API Key' }),
      keyName: Type.Optional(Type.String({ description: 'Key 名称（可选）' })),
    }),
  },
  {
    name: 'add_api_key',
    description: '添加一个 API Key',
    parameters: Type.Object({
      name: Type.String({ description: 'Key 名称' }),
      key: Type.String({ description: 'API Key 字符串' }),
    }),
  },
  {
    name: 'backup_config',
    description: '创建当前配置的备份快照',
    parameters: Type.Object({
      description: Type.Optional(Type.String({ description: '备份说明' })),
    }),
  },
  {
    name: 'list_backups',
    description: '查看所有可用的备份快照',
    parameters: Type.Object({}),
  },
  {
    name: 'restore_config',
    description: '从备份快照恢复配置',
    parameters: Type.Object({
      snapshotId: Type.String({ description: '备份快照 ID' }),
    }),
  },
  {
    name: 'show_help',
    description: '显示帮助信息，列出所有可用功能',
    parameters: Type.Object({}),
  },
];

// ============================================================
// 工具执行器
// ============================================================

const toolImpl: Record<string, (args: any) => Promise<string>> = {
  async list_vendors() {
    const v = await tools.listVendors();
    return v.length ? v.map((x: any) => `• ${x.name} (${x.base_url})`).join('\n') : '暂无厂商';
  },
  async list_api_keys() {
    const k = await tools.listApiKeys();
    return k.length ? k.map((x: any) => `• ${x.name}: ${(x.keyPrefix||'').slice(0,16)}...`).join('\n') : '暂无 Key';
  },
  async list_routes() {
    const r = await tools.listRoutes();
    return r.length ? r.map((x: any) => `• ${x.name} → ${x.vendor_name||'?'}`).join('\n') : '暂无路由';
  },
  async quick_setup(a: any) {
    const r = await tools.quickSetup({ providerId: a.providerId, apiKey: a.apiKey, keyName: a.keyName });
    return r.success ? `✅ ${r.summary || '配置成功'}` : `❌ ${r.error || '失败'}`;
  },
  async add_api_key(a: any) {
    const r = await tools.addApiKey({ name: a.name, key: a.key });
    return r.success ? `✅ Key "${a.name}" 已添加` : `❌ ${r.error || '失败'}`;
  },
  async backup_config(a: any) {
    const r = tools.backup(a.description || 'AI 备份');
    return `✅ 备份已创建: \`${r.id}\``;
  },
  async list_backups() {
    const b = tools.showBackups();
    return b.length ? b.map((x: any) => `• ${x.id}: ${x.description}`).join('\n') : '暂无备份';
  },
  async restore_config(a: any) {
    const r = tools.rollback(a.snapshotId);
    return r.success ? '✅ 已恢复' : `❌ ${r.error}`;
  },
  show_help() {
    return [
      '我能帮你管理网关配置：',
      '',
      '• "帮我接入 opencode-go，key=sk-xxx" — 一键配置',
      '• "查看厂商 / 查看 Key / 查看路由"',
      '• "帮我加个 key sk-xxxx" — 添加 Key',
      '• "备份一下 / 恢复到 snap_xxx"',
    ].join('\n');
  },
};

// ============================================================
// AI 调用（pi-ai function calling）
// ============================================================

async function callAI(msg: string, history: { role: string; content: string }[]):
  Promise<{ reply: string; action?: string }> {
  try {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
    const catalog = builtinModels();

    // 找模型，用查询参数传 key
    let model = catalog.getModel('opencode-go', 'deepseek-v4-flash')
      || catalog.getModel('openai', 'gpt-4o-mini')
      || catalog.getModels().find(m => m.reasoning);

    if (!model) throw new Error('no model');

    const opts: Record<string, any> = { maxTokens: 1024 };

    // 从 DB 找 API Key
    try {
      const { queryFirst } = await import('../../shared/database');
      const asset = queryFirst('SELECT api_key FROM assets WHERE vendor_id = ? LIMIT 1', [model.provider]);
      if (asset) opts.apiKey = asset.api_key;
    } catch { /* 没 key 也能试试 */ }

    const ctx: Context = {
      systemPrompt: '你是网关配置助手。根据用户需求调用工具管理配置，用中文回复。',
      messages: [
        ...history.slice(-6).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: Date.now(),
        })),
        { role: 'user' as const, content: msg, timestamp: Date.now() },
      ],
      tools: assistantTools,
    };

    const resp = await catalog.complete(model, ctx, opts);

    // 工具调用
    const calls = resp.content.filter((b): b is any => b.type === 'toolCall');
    if (calls.length > 0) {
      const results: string[] = [];
      for (const c of calls) {
        const fn = toolImpl[c.name];
        if (fn) results.push(`工具 ${c.name}: ${await fn(c.arguments)}`);
      }

      // 把结果给 LLM 总结
      ctx.messages.push(resp);
      for (const c of calls) {
        ctx.messages.push({
          role: 'toolResult',
          toolCallId: c.id,
          toolName: c.name,
          content: [{ type: 'text', text: results.join('\n') }],
          isError: false,
          timestamp: Date.now(),
        });
      }

      const final = await catalog.complete(model, ctx, { maxTokens: 512 });
      const text = final.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      return { reply: text || '已完成', action: calls[0]!.name };
    }

    // 纯文本
    const txt = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    if (txt) return { reply: txt };
  } catch { /* 降级 */ }

  return fallback(msg);
}

// ============================================================
// 规则降级
// ============================================================

async function fallback(msg: string): Promise<{ reply: string; action?: string }> {
  const m = msg.toLowerCase();

  if (/^(查看|显示|列表|有哪些)/.test(m)) {
    if (/厂商|vendor/.test(m)) return { reply: `📋 厂商:\n${await toolImpl.list_vendors()}`, action: 'list_vendors' };
    if (/key|密钥/.test(m)) return { reply: `📋 Key:\n${await toolImpl.list_api_keys()}`, action: 'list_api_keys' };
    return { reply: `📋 厂商:\n${await toolImpl.list_vendors()}\n\nKey:\n${await toolImpl.list_api_keys()}` };
  }

  if (/快速配置|帮我接入|添加.*厂商|setup/.test(m)) {
    const p = m.match(/opencode-go|openai|anthropic|deepseek/);
    const k = m.match(/(sk-\S+)/);
    if (p && k) return { reply: await toolImpl.quick_setup({ providerId: p[0], apiKey: k[0] }), action: 'quick_setup' };
    return { reply: '请指定厂商和 Key，例如：快速配置 opencode-go，key=sk-xxx' };
  }

  if (/备份/.test(m)) return { reply: await toolImpl.backup_config({}), action: 'backup_config' };
  if (/帮助|help/.test(m)) return { reply: await toolImpl.show_help() };

  return { reply: '🤔 没理解，试试说"帮助"' };
}

// ============================================================
// API
// ============================================================

router.post('/chat', async (c) => {
  const { message, history } = await c.req.json();
  if (!message) return c.json({ reply: '请说点什么。' });
  const result = await callAI(message, history || []);
  return c.json(result);
});

export default router;
