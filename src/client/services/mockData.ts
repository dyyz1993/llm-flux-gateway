import { ApiKey, RequestLog, RouteConfig, Role, AnalyticsData, Message, ToolDefinition } from '@shared/types';

export const MOCK_KEYS: ApiKey[] = [
  {
    id: 'k1',
    keyToken: 'sk-flux-8293...192a',
    name: 'Production Client A',
    createdAt: new Date('2023-10-01'),
    lastUsedAt: new Date('2023-10-25 14:30'),
    updatedAt: new Date('2023-10-25 14:30'),
    status: 'active'
  },
  {
    id: 'k2',
    keyToken: 'sk-flux-1122...bbcc',
    name: 'Dev Team Test',
    createdAt: new Date('2023-10-05'),
    lastUsedAt: new Date('2023-10-25 12:15'),
    updatedAt: new Date('2023-10-25 12:15'),
    status: 'active'
  },
  {
    id: 'k3',
    keyToken: 'sk-flux-9988...ffee',
    name: 'Legacy App',
    createdAt: new Date('2023-09-15'),
    lastUsedAt: new Date('2023-10-20 09:00'),
    updatedAt: new Date('2023-10-20 09:00'),
    status: 'revoked'
  },
];

export const MOCK_ROUTES: RouteConfig[] = [
  {
    id: 'r_upgrade_v3',
    name: 'Gemini 3.0 Upgrade Path',
    assetId: 'asset_gemini_v3',
    isActive: true,
    configType: 'yaml',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    overrides: [
      {
        field: 'model',
        matchValues: ['gemini-2.5-flash-latest', 'gemini-2.5-flash'],
        rewriteValue: 'gemini-3-flash-preview'
      }
    ],
    assetBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    assetApiKey: '',
    assetModels: ['gemini-3-flash-preview']
  } as any,
  {
    id: 'r1',
    name: 'Legacy GPT Router',
    assetId: 'asset_gemini_legacy',
    isActive: true,
    configType: 'yaml',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    overrides: [
      { field: 'model', matchValues: ['gpt-3.5-turbo', 'gpt-4o-mini'], rewriteValue: 'gemini-1.5-flash' },
      { field: 'temperature', matchValues: ['0', '0.1'], rewriteValue: '0.2' }
    ],
    assetBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    assetApiKey: 'sk-google-AI...',
    assetModels: ['gemini-1.5-flash']
  } as any,
  {
    id: 'r2',
    name: 'Claude 3.5 Sonnet',
    assetId: 'asset_claude',
    isActive: true,
    configType: 'yaml',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    overrides: [],
    assetBaseUrl: 'https://api.anthropic.com/v1/',
    assetApiKey: 'sk-ant-123...',
    assetModels: ['claude-3-5-sonnet-20240620']
  } as any
];

const MOCK_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a city',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' },
          unit: { type: 'string', enum: ['c', 'f'] }
        },
        required: ['city']
      }
    }
  }
];

export const generateMockLogs = (count: number): RequestLog[] => {
  const logs: RequestLog[] = [];
  
  for (let i = 0; i < count; i++) {
    const isSuccess = Math.random() > 0.05;
    const hasTools = Math.random() > 0.6;
    const hasRewrite = Math.random() > 0.4;

    const messages: Message[] = [
      { role: Role.SYSTEM, content: "You are a helpful AI assistant." },
      { role: Role.USER, content: hasTools ? "What's the weather in Tokyo?" : "Explain quantum entanglement." }
    ];

    if (hasTools) {
      messages.push({
        role: Role.ASSISTANT,
        content: null,
        tool_calls: [{
          id: `call_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city": "Tokyo", "unit": "c"}' }
        }]
      });
      messages.push({
        role: Role.TOOL,
        name: 'get_weather',
        content: '{"temp": 22, "condition": "Cloudy"}'
      });
      messages.push({ role: Role.ASSISTANT, content: "It is currently 22°C and cloudy in Tokyo." });
    } else {
      messages.push({ role: Role.ASSISTANT, content: "Quantum entanglement is a phenomenon where..." });
    }

    logs.push({
      id: `req_${Math.random().toString(36).substring(2, 10)}`,
      timestamp: Math.floor((Date.now() - Math.floor(Math.random() * 1000000000)) / 1000),
      apiKeyId: Math.random() > 0.5 ? 'k1' : 'k2',
      routeId: Math.random() > 0.5 ? 'r1' : 'r2',
      originalModel: 'gpt-3.5-turbo',
      finalModel: hasRewrite ? 'gemini-1.5-flash' : 'gpt-3.5-turbo',
      method: 'POST',
      path: '/v1/chat/completions',
      messageCount: messages.length,
      firstMessage: messages[0]?.content || '',
      hasTools: hasTools,
      toolCount: hasTools ? 1 : 0,
      requestTools: hasTools ? MOCK_TOOLS : undefined,
      temperature: hasRewrite ? 0.2 : 0.7,
      promptTokens: 150 + Math.floor(Math.random() * 100),
      completionTokens: 50 + Math.floor(Math.random() * 200),
      totalTokens: 0, // calc later
      latencyMs: 200 + Math.floor(Math.random() * 2000),
      statusCode: isSuccess ? 200 : 500,
      messages: messages,
      overwrittenAttributes: hasRewrite ? {
        'model': { original: 'gpt-3.5-turbo', final: 'gemini-1.5-flash' },
        'temperature': { original: 0.1, final: 0.2 }
      } : {}
    });
    logs[i]!.totalTokens = logs[i]!.promptTokens + logs[i]!.completionTokens;
  }
  return logs.sort((a, b) => b.timestamp - a.timestamp);
};

export const MOCK_LOGS = generateMockLogs(50);

export const MOCK_ANALYTICS: AnalyticsData[] = Array.from({ length: 14 }).map((_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (13 - i));
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tokens: Math.floor(Math.random() * 50000) + 10000,
    requests: Math.floor(Math.random() * 500) + 50,
    cost: Math.random() * 2
  };
});