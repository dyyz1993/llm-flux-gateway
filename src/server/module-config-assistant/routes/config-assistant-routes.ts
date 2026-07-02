/**
 * 配置助手 API
 *
 * 聊天式配置管理。接收自然语言指令，调用 config-manager 工具执行。
 *
 * POST /api/config-assistant/chat
 *   { message: "帮我加个 opencode 的 key", history: [...] }
 *   → { reply: "...", action: "...", success: true }
 */
import { Hono } from 'hono';
import * as tools from '../../config-manager/tools';

const router = new Hono();

// ============================================================
// 意图识别 → 工具调用
// ============================================================

interface Intent {
  action: string;
  params: Record<string, string>;
  confidence: number;
}

function parseIntent(message: string): Intent | null {
  const msg = message.toLowerCase().trim();

  // 查看配置
  if (/^(查看|显示|列表|有哪些|list|show)/.test(msg)) {
    if (/厂商|vendor|供应商/.test(msg)) return { action: 'list_vendors', params: {}, confidence: 0.9 };
    if (/key|密钥|api/.test(msg)) return { action: 'list_keys', params: {}, confidence: 0.9 };
    if (/路由|route/.test(msg)) return { action: 'list_routes', params: {}, confidence: 0.9 };
    if (/备份|backup/.test(msg)) return { action: 'list_backups', params: {}, confidence: 0.9 };
    return { action: 'list_all', params: {}, confidence: 0.7 };
  }

  // 快速配置
  const quickMatch = msg.match(/快速配置|加入|添加|接入|quick.*setup|add.*provider|setup/);
  if (quickMatch) {
    const providerMatch = msg.match(/provider[=:\s]+(\S+)|厂商[=:\s]*(\S+)/);
    const keyMatch = msg.match(/key[=:\s]+(sk-\S+)/);
    if (providerMatch && keyMatch) {
      return {
        action: 'quick_setup',
        params: {
          provider: providerMatch[1] || providerMatch[2] || '',
          key: keyMatch[1] || '',
        },
        confidence: 0.85,
      };
    }
    // 缺参数也返回意图，让前端继续追问
    return {
      action: 'quick_setup',
      params: {
        provider: providerMatch?.[1] || providerMatch?.[2] || '',
        key: keyMatch?.[1] || '',
      },
      confidence: 0.6,
    };
  }

  // 添加 API Key
  const addKeyMatch = msg.match(/加.*(key|密钥|api.?key)|添加.*(key|密钥)/);
  if (addKeyMatch) {
    const keyMatch = msg.match(/(sk-\S+)/);
    const nameMatch = msg.match(/(?:叫|名字?|名称?)[=:：\s]*(\S+)/);
    return {
      action: 'add_key',
      params: {
        key: keyMatch?.[1] || '',
        name: nameMatch?.[1] || '未命名 Key',
      },
      confidence: 0.8,
    };
  }

  // 备份
  if (/备份|backup|存档/.test(msg)) {
    const desc = msg.replace(/备份|backup|存档|创建/g, '').trim();
    return { action: 'backup', params: { description: desc || '用户手动备份' }, confidence: 0.9 };
  }

  // 恢复
  const restoreMatch = msg.match(/恢复|回滚|rollback|restore.*(snap_\w+)/);
  if (restoreMatch) {
    return { action: 'restore', params: { snapshotId: restoreMatch[1] || '' }, confidence: 0.85 };
  }

  // 帮助
  if (/帮助|help|\?|怎么/.test(msg)) {
    return { action: 'help', params: {}, confidence: 0.9 };
  }

  return null;
}

// ============================================================
// 工具执行 + 自然语言回复
// ============================================================

async function executeIntent(intent: Intent): Promise<{ reply: string; data?: any }> {
  try {
    switch (intent.action) {
      case 'list_vendors': {
        const vendors = await tools.listVendors();
        if (vendors.length === 0) return { reply: '📭 还没有配置任何厂商。试试说"快速配置 opencode-go"？' };
        const list = vendors.map((v: any) => `  • ${v.name} (${v.base_url})`).join('\n');
        return { reply: `📋 已配置的厂商 (${vendors.length} 个):\n${list}`, data: vendors };
      }

      case 'list_keys': {
        const keys = await tools.listApiKeys();
        if (keys.length === 0) return { reply: '📭 还没有配置任何 API Key。' };
        const list = keys.map((k: any) => `  • ${k.name}: ${(k.keyPrefix || '').slice(0, 16)}...`).join('\n');
        return { reply: `📋 API Key (${keys.length} 个):\n${list}`, data: keys };
      }

      case 'list_routes': {
        const routes = await tools.listRoutes();
        if (routes.length === 0) return { reply: '📭 还没有配置任何路由。' };
        const list = routes.map((r: any) => `  • ${r.name} → ${r.vendor_name || '?'} (优先级: ${r.priority})`).join('\n');
        return { reply: `📋 路由 (${routes.length} 个):\n${list}`, data: routes };
      }

      case 'list_backups': {
        const backups = tools.showBackups();
        if (backups.length === 0) return { reply: '📭 还没有备份。' };
        const list = backups.map((b: any) => `  • ${b.id}: ${b.description} (${b.timestamp})`).join('\n');
        return { reply: `📋 备份 (${backups.length} 个):\n${list}`, data: backups };
      }

      case 'list_all': {
        const [vendors, keys, routes, backups] = await Promise.all([
          tools.listVendors(),
          tools.listApiKeys(),
          tools.listRoutes(),
          Promise.resolve(tools.showBackups()),
        ]);
        return {
          reply: [
            `🏭 厂商: ${vendors.length} 个`,
            `🔑 API Key: ${keys.length} 个`,
            `🛣️ 路由: ${routes.length} 个`,
            `💾 备份: ${backups.length} 个`,
          ].join('\n'),
          data: { vendors, keys, routes, backups },
        };
      }

      case 'quick_setup': {
        const { provider, key } = intent.params;
        if (!provider || !key) {
          const missing = [];
          if (!provider) missing.push('厂商名 (如 opencode-go)');
          if (!key) missing.push('API Key');
          return { reply: `❌ 信息不全，需要提供: ${missing.join('、')}\n例如: "快速配置 opencode-go，key=sk-xxx"` };
        }
        const result = await tools.quickSetup({ providerId: provider, apiKey: key });
        if (result.success) {
          return { reply: `✅ 配置成功！\n${result.summary || ''}\n可以用 "查看路由" 确认。`, data: result };
        }
        return { reply: `❌ 配置失败: ${result.error || '未知错误'}`, data: result };
      }

      case 'add_key': {
        const { key, name } = intent.params;
        if (!key) return { reply: '❌ 需要提供 API Key，例如: "加个 key sk-xxxxx"' };
        const result = await tools.addApiKey({ name, key });
        if (result.success) {
          return { reply: `✅ Key "${name}" 已添加！`, data: result };
        }
        return { reply: `❌ 添加失败: ${result.error || '校验不通过'}`, data: result };
      }

      case 'backup': {
        const result = tools.backup(intent.params.description || '用户手动备份');
        return { reply: `✅ 备份已创建: \`${result.id}\`\n需要恢复时说: "恢复 ${result.id}"`, data: result };
      }

      case 'restore': {
        if (!intent.params.snapshotId) {
          const backups = tools.showBackups();
          if (backups.length === 0) return { reply: '📭 没有可恢复的备份。' };
          return { reply: `请指定要恢复的备份 ID:\n${backups.map((b: any) => `  • ${b.id}: ${b.description}`).join('\n')}` };
        }
        const result = tools.rollback(intent.params.snapshotId);
        if (result.success) return { reply: '✅ 已恢复到指定备份！' };
        return { reply: `❌ 恢复失败: ${result.error}` };
      }

      case 'help':
        return {
          reply: [
            '🤖 配置助手能做什么：',
            '',
            '  • "查看厂商" — 列出所有厂商',
            '  • "查看 Key" — 列出所有 API Key',
            '  • "查看路由" — 列出所有路由',
            '  • "快速配置 opencode-go，key=sk-xxx" — 一键接入',
            '  • "加个 key sk-xxxx" — 添加 API Key',
            '  • "创建备份" — 备份当前配置',
            '  • "恢复 snap_xxx" — 回滚到备份',
            '  • "帮助" — 显示此消息',
          ].join('\n'),
        };

      default:
        return { reply: `❌ 看不懂 "${intent.action}"，试试说"帮助"` };
    }
  } catch (e: any) {
    return { reply: `❌ 执行出错: ${e.message}` };
  }
}

// ============================================================
// API Routes
// ============================================================

router.post('/chat', async (c) => {
  const { message, history } = await c.req.json();
  if (!message || typeof message !== 'string') {
    return c.json({ reply: '请说点什么。' });
  }

  const intent = parseIntent(message);

  if (!intent) {
    return c.json({
      reply: '🤔 没理解你的意思。试试说 "帮助" 看看我能做什么。',
      intent: null,
    });
  }

  const result = await executeIntent(intent);

  return c.json({
    ...result,
    intent: intent.action,
    confidence: intent.confidence,
  });
});

export default router;
