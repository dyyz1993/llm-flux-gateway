/**
 * 配置助手 — 聊天式配置管理
 *
 * 在网页上直接说话就能配置厂商、Key、路由。
 * 支持快速配置、查看、备份、恢复等操作。
 */
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Settings, Key } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  data?: any;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

interface ProviderOption {
  id: string;
  name: string;
  keyPrefix: string;
}

const QUICK_ACTIONS = [
  { label: '厂商', message: '查看厂商' },
  { label: '资产(上游Key)', message: '查看资产' },
  { label: 'Key(平台)', message: '查看平台 Key' },
  { label: '路由', message: '查看路由' },
  { label: '备份', message: '创建备份' },
];

export function ConfigAssistant() {
  const [messages, setMessages] = useState<Message[]>([{
    role: 'assistant',
    content: '🤖 你好！我是配置助手。\n\n点上面的快捷按钮查看配置，或者直接对我说：\n\n• "帮我接入 opencode-go，key=sk-xxx"\n• "加个平台 Key sk-xxx"\n• "添加路由 gpt-4 → deepseek"\n• "备份一下"',
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [mode, setMode] = useState<'direct' | 'route'>('direct');
  const chatEnd = useRef<HTMLDivElement>(null);

  // 加载可用模型和供应商
  useEffect(() => {
    Promise.all([
      fetch('/api/config-assistant/models').then(r => r.json()),
      fetch('/api/config-assistant/providers').then(r => r.json()),
    ]).then(([modelsData, providersData]) => {
      setModels(modelsData.data || []);
      if (modelsData.data?.length > 0) setSelectedModel(modelsData.data[0].id);
      setProviders(providersData.data || []);
      if (providersData.data?.length > 0) setSelectedProvider(providersData.data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(content: string) {
    if (!content.trim() || loading) return;

    const userMsg: Message = { role: 'user', content };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/config-assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          modelId: selectedModel || undefined,
          providerId: selectedProvider || undefined,
          mode,
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || '✅ 操作完成',
        data: data.data,
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ 请求失败: ${e.message}`,
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="config-assistant">
      <style>{`
        .config-assistant { max-width: 800px; margin: 0 auto; padding: 20px; display: flex; flex-direction: column; height: calc(100vh - 100px); }
        .ca-header { margin-bottom: 16px; }
        .ca-header h2 { margin: 0; font-size: 18px; display: flex; align-items: center; gap: 8px; }
        .ca-header p { margin: 4px 0 0; color: #888; font-size: 13px; }
        .ca-quick-actions { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
        .ca-quick-actions button { padding: 6px 14px; border: 1px solid #333; border-radius: 16px; background: transparent; color: #ccc; cursor: pointer; font-size: 13px; }
        .ca-quick-actions button:hover { border-color: #666; background: #222; }
        .ca-chat { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 8px 0; }
        .ca-message { display: flex; gap: 10px; max-width: 85%; }
        .ca-message.user { align-self: flex-end; flex-direction: row-reverse; }
        .ca-message .avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px; }
        .ca-message.user .avatar { background: #2563eb; }
        .ca-message.assistant .avatar { background: #333; }
        .ca-message .bubble { padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
        .ca-message.user .bubble { background: #2563eb; color: #fff; }
        .ca-message.assistant .bubble { background: #1a1a2e; color: #ddd; border: 1px solid #333; }
        .ca-input-area { display: flex; gap: 8px; margin-top: 12px; }
        .ca-input-area input { flex: 1; padding: 10px 14px; border: 1px solid #333; border-radius: 8px; background: #111; color: #eee; font-size: 14px; outline: none; }
        .ca-input-area input:focus { border-color: #2563eb; }
        .ca-input-area button { padding: 10px 18px; border: none; border-radius: 8px; background: #2563eb; color: #fff; cursor: pointer; }
        .ca-input-area button:disabled { opacity: 0.5; }
        .ca-model-selector { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .ca-model-selector label { color: #888; font-size: 13px; white-space: nowrap; }
        .ca-model-selector select { flex: 1; padding: 6px 10px; border: 1px solid #333; border-radius: 6px; background: #111; color: #ccc; font-size: 13px; outline: none; max-width: 300px; }
        .ca-model-selector select:focus { border-color: #2563eb; }
        .ca-loading { display: flex; align-items: center; gap: 8px; color: #888; font-size: 13px; padding: 8px 0; }
        .ca-loading .dots { display: flex; gap: 3px; }
        .ca-loading .dot { width: 6px; height: 6px; border-radius: 50%; background: #555; animation: pulse 1s infinite; }
        .ca-loading .dot:nth-child(2) { animation-delay: 0.2s; }
        .ca-loading .dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
      `}</style>

      <div className="ca-header">
        <h2><Bot size={20} /> 配置助手</h2>
        <p>通过聊天管理厂商、API Key 和路由配置</p>
      </div>

      <div className="ca-quick-actions">
        {QUICK_ACTIONS.map(a => (
          <button key={a.label} onClick={() => sendMessage(a.message)}>{a.label}</button>
        ))}
      </div>

      {providers.length > 0 && (
        <div className="ca-model-selector">
          <label><Key size={14} /> Key</label>
          <select value={selectedProvider} onChange={e => setSelectedProvider(e.target.value)}>
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.name} — {p.keyPrefix}</option>
            ))}
          </select>
        </div>
      )}

      <div className="ca-chat">
        {messages.map((msg, i) => (
          <div key={i} className={`ca-message ${msg.role}`}>
            <div className="avatar">{msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}</div>
            <div className="bubble">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="ca-loading">
            <div className="dots">
              <div className="dot" /><div className="dot" /><div className="dot" />
            </div>
            处理中...
          </div>
        )}
        <div ref={chatEnd} />
      </div>

      <div className="ca-input-area">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入指令，例如：快速配置 opencode-go..."
          disabled={loading}
        />
        <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
          <Send size={18} />
        </button>
      </div>

      <div className="ca-model-selector" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={() => setMode(mode === 'direct' ? 'route' : 'direct')}
          style={{
            padding: '4px 10px', border: '1px solid #333', borderRadius: 6,
            background: mode === 'direct' ? '#2563eb' : 'transparent',
            color: mode === 'direct' ? '#fff' : '#888',
            cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap',
          }}
          title="直连：用 API Key 直接调模型。路由：走网关路由配置调模型"
        >
          {mode === 'direct' ? '🔌 直连' : '🛣️ 路由'}
        </button>
        {models.length > 0 && (
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}
            style={{ flex: 1, padding: '6px 10px', border: '1px solid #333', borderRadius: 6, background: '#111', color: '#ccc', fontSize: 13, outline: 'none' }}>
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
