# 多层转换验证测试方案

> 验证每一层转换的正确性，而不是只验证端到端

---

## 📊 验证层级定义

每个场景需要验证 **4 个转换层**：

```
用户请求 (Layer 0)
    ↓ 转换层 1
中间格式 Layer A (sourceFormat → Internal)
    ↓ 转换层 2
上游请求 Layer B (Internal → targetFormat)
    ↓ 上游处理
上游响应 Layer C (targetFormat)
    ↓ 转换层 3
中间格式 Layer D (targetFormat → Internal)
    ↓ 转换层 4
用户响应 Layer E (Internal → sourceFormat)
```

**关键**: 每一层都要单独验证，不能跳过！

---

## 🎯 8 种场景 × 多层验证矩阵

### 场景 1: Anthropic → OpenAI → Anthropic

#### 1.1 非流式 - 验证层级

| 层级 | 输入 | 转换 | 输出 | 验证点 | 代码位置 |
|------|------|------|------|--------|---------|
| **Layer 0** | 用户请求 | - | Anthropic Request | ✅ 原始数据 | 测试输入 |
| **Layer 1** | Anthropic Request | `convertRequestToInternal()` | Internal Format | ✅ max_tokens → maxTokens<br>✅ system → messages[0]<br>✅ tools 格式转换 | `anthropic.converter.ts:439-580` |
| **Layer 2** | Internal Format | `convertRequestFromInternal()` | OpenAI Request | ✅ maxTokens → max_tokens<br>✅ messages 保持<br>✅ tools 格式转换 | `openai.converter.ts:107-129` |
| **Layer 3** | OpenAI Response | `convertResponseToInternal()` | Internal Format | ✅ prompt_tokens → promptTokens<br>✅ tool_calls → toolCalls<br>✅ GLM 混合格式处理 | `openai.converter.ts:135-225` |
| **Layer 4** | Internal Format | `convertResponseFromInternal()` | Anthropic Response | ✅ promptTokens → input_tokens<br>✅ content[] 重建<br>✅ tool_use 块格式 | `anthropic.converter.ts:788-895` |

#### 1.2 流式 - 验证层级

| 层级 | 输入 | 转换 | 输出 | 验证点 | 代码位置 |
|------|------|------|------|--------|---------|
| **Layer 0** | 用户请求 | - | Anthropic Request (stream=true) | ✅ stream: true | 测试输入 |
| **Layer 1** | Anthropic Request | `convertRequestToInternal()` | Internal Format | ✅ stream 字段保留 | `anthropic.converter.ts:439-580` |
| **Layer 2** | Internal Format | `convertRequestFromInternal()` | OpenAI Request | ✅ stream: true | `openai.converter.ts:107-129` |
| **Layer 3** | OpenAI SSE Chunk | `convertStreamChunkToInternal()` | Internal Chunk | ✅ 每个 chunk 转换正确<br>✅ delta.content 累积<br>✅ delta.tool_calls 累积 | `openai.converter.ts:282-318` |
| **Layer 4** | Internal Chunk | `convertStreamChunkFromInternal()` | Anthropic SSE | ✅ content_block_delta<br>✅ input_json_delta<br>✅ message_delta | `anthropic.converter.ts:1393-1593` |

---

### 场景 2: OpenAI → OpenAI → OpenAI

#### 2.1 非流式 - 验证层级

| 层级 | 输入 | 转换 | 输出 | 验证点 | 代码位置 |
|------|------|------|------|--------|---------|
| **Layer 0** | 用户请求 | - | OpenAI Request | ✅ 原始数据 | 测试输入 |
| **Layer 1** | OpenAI Request | `convertRequestToInternal()` | Internal Format | ✅ snake_case → camelCase<br>✅ tool_calls → toolCalls<br>✅ 字段归一化 | `openai.converter.ts:48-105` |
| **Layer 2** | Internal Format | `convertRequestFromInternal()` | OpenAI Request | ✅ camelCase → snakeCase<br>✅ toolCalls → tool_calls | `openai.converter.ts:107-129` |
| **Layer 3** | OpenAI Response | `convertResponseToInternal()` | Internal Format | ✅ snake_case → camelCase<br>✅ finish_reason → finishReason | `openai.converter.ts:135-225` |
| **Layer 4** | Internal Format | `convertResponseFromInternal()` | OpenAI Response | ✅ camelCase → snakeCase<br>✅ finishReason → finish_reason | `openai.converter.ts:227-276` |

#### 2.2 流式 - 验证层级

| 层级 | 输入 | 转换 | 输出 | 验证点 | 代码位置 |
|------|------|------|------|--------|---------|
| **Layer 0** | 用户请求 | - | OpenAI Request (stream=true) | ✅ stream: true | 测试输入 |
| **Layer 1** | OpenAI Request | `convertRequestToInternal()` | Internal Format | ✅ stream 字段保留 | `openai.converter.ts:48-105` |
| **Layer 2** | Internal Format | `convertRequestFromInternal()` | OpenAI Request | ✅ stream: true | `openai.converter.ts:107-129` |
| **Layer 3** | OpenAI SSE Chunk | `convertStreamChunkToInternal()` | Internal Chunk | ✅ delta 字段归一化 | `openai.converter.ts:282-318` |
| **Layer 4** | Internal Chunk | `convertStreamChunkFromInternal()` | OpenAI SSE | ✅ 字段去归一化 | `openai.converter.ts:368-406` |

---

### 场景 3: Anthropic → Anthropic → Anthropic

#### 3.1 非流式 - 验证层级

| 层级 | 输入 | 转换 | 输出 | 验证点 | 代码位置 |
|------|------|------|------|--------|---------|
| **Layer 0** | 用户请求 | - | Anthropic Request | ✅ 原始数据 | 测试输入 |
| **Layer 1** | Anthropic Request | `convertRequestToInternal()` | Internal Format | ✅ system → messages[0]<br>✅ tool_results 提取 | `anthropic.converter.ts:439-580` |
| **Layer 2** | Internal Format | `convertRequestFromInternal()` | Anthropic Request | ✅ messages[0] → system<br>✅ tool role → user message | `anthropic.converter.ts:67-433` |
| **Layer 3** | Anthropic Response | `convertResponseToInternal()` | Internal Format | ✅ content[] 解析<br>✅ tool_use 提取 | `anthropic.converter.ts:586-782` |
| **Layer 4** | Internal Format | `convertResponseFromInternal()` | Anthropic Response | ✅ content[] 重建<br>✅ tool_use 块格式 | `anthropic.converter.ts:788-895` |

#### 3.2 流式 - 验证层级

| 层级 | 输入 | 转换 | 输出 | 验证点 | 代码位置 |
|------|------|------|------|--------|---------|
| **Layer 0** | 用户请求 | - | Anthropic Request (stream=true) | ✅ stream: true | 测试输入 |
| **Layer 1** | Anthropic Request | `convertRequestToInternal()` | Internal Format | ✅ stream 字段保留 | `anthropic.converter.ts:439-580` |
| **Layer 2** | Internal Format | `convertRequestFromInternal()` | Anthropic Request | ✅ stream: true | `anthropic.converter.ts:67-433` |
| **Layer 3** | Anthropic SSE | `convertStreamChunkToInternal()` | Internal Chunk | ✅ message_start/delta/stop<br>✅ content_block 处理 | `anthropic.converter.ts:901-1387` |
| **Layer 4** | Internal Chunk | `convertStreamChunkFromInternal()` | Anthropic SSE | ✅ 事件类型映射<br>✅ 格式重建 | `anthropic.converter.ts:1393-1593` |

---

### 场景 4: OpenAI → Anthropic → OpenAI

#### 4.1 非流式 - 验证层级

| 层级 | 输入 | 转换 | 输出 | 验证点 | 代码位置 |
|------|------|------|------|--------|---------|
| **Layer 0** | 用户请求 | - | OpenAI Request | ✅ 原始数据 | 测试输入 |
| **Layer 1** | OpenAI Request | `convertRequestToInternal()` | Internal Format | ✅ snake_case → camelCase | `openai.converter.ts:48-105` |
| **Layer 2** | Internal Format | `convertRequestFromInternal()` | Anthropic Request | ✅ messages[0].role='system' → system<br>✅ tools 格式转换 | `anthropic.converter.ts:67-433` |
| **Layer 3** | Anthropic Response | `convertResponseToInternal()` | Internal Format | ✅ content[] 解析<br>✅ input_tokens → promptTokens | `anthropic.converter.ts:586-782` |
| **Layer 4** | Internal Format | `convertResponseFromInternal()` | OpenAI Response | ✅ content[] → string<br>✅ promptTokens → prompt_tokens | `openai.converter.ts:227-276` |

#### 4.2 流式 - 验证层级

| 层级 | 输入 | 转换 | 输出 | 验证点 | 代码位置 |
|------|------|------|------|--------|---------|
| **Layer 0** | 用户请求 | - | OpenAI Request (stream=true) | ✅ stream: true | 测试输入 |
| **Layer 1** | OpenAI Request | `convertRequestToInternal()` | Internal Format | ✅ stream 字段保留 | `openai.converter.ts:48-105` |
| **Layer 2** | Internal Format | `convertRequestFromInternal()` | Anthropic Request | ✅ stream: true | `anthropic.converter.ts:67-433` |
| **Layer 3** | Anthropic SSE | `convertStreamChunkToInternal()` | Internal Chunk | ✅ 跨厂商 chunk 转换 | `anthropic.converter.ts:901-1387` |
| **Layer 4** | Internal Chunk | `convertStreamChunkFromInternal()` | OpenAI SSE | ✅ 跨厂商 chunk 转换 | `openai.converter.ts:368-406` |

---

## 🧪 测试用例设计

### 测试文件结构

```
src/server/module-gateway/__tests__/
├── multi-layer-validation/
│   ├── scenario-1-anthropic-openai-anthropic.test.ts
│   │   ├── non-streaming.test.ts        # 非流式，4 层验证
│   │   └── streaming.test.ts            # 流式，4 层验证
│   ├── scenario-2-openai-openai-openai.test.ts
│   │   ├── non-streaming.test.ts
│   │   └── streaming.test.ts
│   ├── scenario-3-anthropic-anthropic-anthropic.test.ts
│   │   ├── non-streaming.test.ts
│   │   └── streaming.test.ts
│   └── scenario-4-openai-anthropic-openai.test.ts
│       ├── non-streaming.test.ts
│       └── streaming.test.ts
```

---

## 📝 测试用例模板

### 场景 1.1: Anthropic → OpenAI → Anthropic (非流式)

```typescript
// multi-layer-validation/scenario-1-anthropic-openai-anthropic/non-streaming.test.ts

import { describe, it, expect } from 'vitest';
import { AnthropicConverter } from '../../../module-protocol-transpiler/converters/anthropic.converter';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';

describe('Scenario 1: Anthropic → OpenAI → Anthropic (非流式)', () => {
  const anthropicConverter = new AnthropicConverter();
  const openaiConverter = new OpenAIConverter();

  // 测试数据: 真实 Anthropic 请求
  const anthropicRequest = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: 'You are a helpful assistant',
    messages: [
      { role: 'user', content: 'What is the weather in Tokyo?' }
    ],
    tools: [{
      name: 'get_weather',
      description: 'Get weather information',
      input_schema: {
        type: 'object',
        properties: {
          city: { type: 'string', description: 'City name' }
        },
        required: ['city']
      }
    }]
  };

  // 真实 OpenAI 响应（模拟上游返回）
  const openaiResponse = {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1234567890,
    model: 'gpt-4',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_abc123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"city":"Tokyo"}'
          }
        }]
      },
      finish_reason: 'tool_calls'
    }],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 10,
      total_tokens: 30
    }
  };

  describe('Layer 1: Anthropic Request → Internal Format', () => {
    it('应当正确转换 Anthropic 请求到 Internal Format', () => {
      const result = anthropicConverter.convertRequestToInternal(anthropicRequest);

      expect(result.success).toBe(true);
      const internal = result.data!;

      // ✅ 验证: max_tokens → maxTokens
      expect(internal.maxTokens).toBe(1024);

      // ✅ 验证: system → messages[0].role='system'
      expect(internal.messages[0].role).toBe('system');
      expect(internal.messages[0].content).toBe('You are a helpful assistant');

      // ✅ 验证: tools 格式转换
      expect(internal.tools).toBeDefined();
      expect(internal.tools![0]).toMatchObject({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather information',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' }
            }
          }
        }
      });

      // ✅ 验证: messages 保持不变 (除了 system)
      expect(internal.messages[1]).toEqual({
        role: 'user',
        content: 'What is the weather in Tokyo?'
      });

      console.log('✅ Layer 1 验证通过: Anthropic → Internal');
      console.log('  - max_tokens → maxTokens');
      console.log('  - system → messages[0].role="system"');
      console.log('  - tools 格式正确转换');
    });
  });

  describe('Layer 2: Internal Format → OpenAI Request', () => {
    it('应当正确转换 Internal Format 到 OpenAI 请求', () => {
      // 先得到 Internal Format
      const layer1Result = anthropicConverter.convertRequestToInternal(anthropicRequest);
      const internalRequest = layer1Result.data!;

      // 再转换到 OpenAI
      const result = openaiConverter.convertRequestFromInternal(internalRequest);

      expect(result.success).toBe(true);
      const openaiReq = result.data!;

      // ✅ 验证: maxTokens → max_tokens
      expect(openaiReq.max_tokens).toBe(1024);

      // ✅ 验证: messages 保持
      expect(openaiReq.messages).toBeDefined();
      expect(openaiReq.messages[0].role).toBe('system');

      // ✅ 验证: tools 格式转换回 OpenAI
      expect(openaiReq.tools).toBeDefined();
      expect(openaiReq.tools![0]).toMatchObject({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather information',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' }
            }
          }
        }
      });

      console.log('✅ Layer 2 验证通过: Internal → OpenAI Request');
      console.log('  - maxTokens → max_tokens');
      console.log('  - tools 格式正确转换');
    });
  });

  describe('Layer 3: OpenAI Response → Internal Format', () => {
    it('应当正确转换 OpenAI 响应到 Internal Format', () => {
      const result = openaiConverter.convertResponseToInternal(openaiResponse);

      expect(result.success).toBe(true);
      const internal = result.data!;

      // ✅ 验证: prompt_tokens → promptTokens
      expect(internal.usage?.promptTokens).toBe(20);

      // ✅ 验证: completion_tokens → completionTokens
      expect(internal.usage?.completionTokens).toBe(10);

      // ✅ 验证: tool_calls → toolCalls
      expect(internal.choices![0].message.toolCalls).toBeDefined();
      expect(internal.choices![0].message.toolCalls![0]).toMatchObject({
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city":"Tokyo"}'
        }
      });

      // ✅ 验证: finish_reason → finishReason
      expect(internal.choices![0].finishReason).toBe('tool_calls');

      console.log('✅ Layer 3 验证通过: OpenAI Response → Internal');
      console.log('  - prompt_tokens → promptTokens');
      console.log('  - tool_calls → toolCalls');
      console.log('  - finish_reason → finishReason');
    });
  });

  describe('Layer 4: Internal Format → Anthropic Response', () => {
    it('应当正确转换 Internal Format 到 Anthropic 响应', () => {
      // 先得到 Internal Format
      const layer3Result = openaiConverter.convertResponseToInternal(openaiResponse);
      const internalResponse = layer3Result.data!;

      // 再转换到 Anthropic
      const result = anthropicConverter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const anthropicResp = result.data!;

      // ✅ 验证: 基本结构
      expect(anthropicResp.type).toBe('message');
      expect(anthropicResp.role).toBe('assistant');

      // ✅ 验证: content 数组包含 tool_use 块
      expect(Array.isArray(anthropicResp.content)).toBe(true);
      const toolUseBlock = anthropicResp.content.find((b: any) => b.type === 'tool_use');
      expect(toolUseBlock).toBeDefined();

      // ✅ 验证: tool_use 块格式
      expect(toolUseBlock).toMatchObject({
        type: 'tool_use',
        id: 'call_abc123',
        name: 'get_weather',
        input: { city: 'Tokyo' }  // ✅ 对象，不是 JSON 字符串
      });

      // ✅ 验证: promptTokens → input_tokens
      expect(anthropicResp.usage.input_tokens).toBe(20);

      // ✅ 验证: completionTokens → output_tokens
      expect(anthropicResp.usage.output_tokens).toBe(10);

      // ✅ 验证: finishReason → stop_reason
      expect(anthropicResp.stop_reason).toBe('tool_use');

      console.log('✅ Layer 4 验证通过: Internal → Anthropic Response');
      console.log('  - content[] 包含 tool_use 块');
      console.log('  - input 是对象 (不是字符串)');
      console.log('  - usage 正确映射');
    });
  });

  describe('端到端验证', () => {
    it('完整往返转换后关键字段应当一致', () => {
      // 完整转换链
      const layer1 = anthropicConverter.convertRequestToInternal(anthropicRequest).data!;
      const layer2 = openaiConverter.convertRequestFromInternal(layer1).data!;
      const layer3 = openaiConverter.convertResponseToInternal(openaiResponse).data!;
      const layer4 = anthropicConverter.convertResponseFromInternal(layer3).data!;

      // ✅ 验证: tool_use 信息保持一致
      const originalTool = anthropicRequest.tools[0];
      const finalToolUse = (layer4.content as any[]).find((b: any) => b.type === 'tool_use');

      expect(finalToolUse.name).toBe(originalTool.name);
      expect(finalToolUse.input).toEqual({ city: 'Tokyo' });

      // ✅ 验证: 模型名称保留或合理生成
      expect(layer4.model).toBeDefined();

      console.log('✅ 端到端验证通过');
      console.log('  - 工具调用信息一致');
      console.log('  - 所有层转换正确');
    });
  });
});
```

### 场景 1.2: Anthropic → OpenAI → Anthropic (流式)

```typescript
// multi-layer-validation/scenario-1-anthropic-openai-anthropic/streaming.test.ts

import { describe, it, expect } from 'vitest';
import { AnthropicConverter } from '../../../module-protocol-transpiler/converters/anthropic.converter';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';

describe('Scenario 1: Anthropic → OpenAI → Anthropic (流式)', () => {
  const anthropicConverter = new AnthropicConverter();
  const openaiConverter = new OpenAIConverter();

  // 模拟 OpenAI SSE chunks (真实数据格式)
  const openaiSSEChunks = [
    // Chunk 1: 初始
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',

    // Chunk 2: 工具调用开始
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc123","type":"function","function":{"name":"get_weather","arguments":""}}]}]}\n\n',

    // Chunk 3: 工具调用参数 (分片)
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"city\":"}}]}]}\n\n',

    // Chunk 4: 工具调用参数 (分片)
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"Tokyo"}]}}]}]}\n\n',

    // Chunk 5: 工具调用参数 (分片)
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"}"}}]}]}\n\n',

    // Chunk 6: 结束
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":20,"completion_tokens":10,"total_tokens":30}}\n\n',
  ];

  describe('Layer 3: OpenAI SSE Chunk → Internal Chunk', () => {
    it('应当正确转换每个 OpenAI chunk 到 Internal Format', () => {
      const internalChunks: any[] = [];

      for (const sse of openaiSSEChunks) {
        const dataLine = sse.split('\n').find(line => line.startsWith('data: '));
        if (!dataLine) continue;

        const jsonStr = dataLine.substring(6);
        const result = openaiConverter.convertStreamChunkToInternal(jsonStr);

        if (result.success) {
          internalChunks.push(result.data);
        }
      }

      // ✅ 验证: chunk 数量
      expect(internalChunks.length).toBe(6);

      // ✅ 验证: 第一个 chunk (role)
      expect(internalChunks[0].choices[0].delta.role).toBe('assistant');

      // ✅ 验证: tool_calls 开始 chunk
      expect(internalChunks[1].choices[0].delta.toolCalls).toBeDefined();
      expect(internalChunks[1].choices[0].delta.toolCalls[0]).toMatchObject({
        index: 0,
        id: 'call_abc123',
        type: 'function',
        function: { name: 'get_weather', arguments: '' }
      });

      // ✅ 验证: 工具调用参数累积
      expect(internalChunks[2].choices[0].delta.toolCalls[0].function.arguments).toBe('{"city":');
      expect(internalChunks[3].choices[0].delta.toolCalls[0].function.arguments).toBe('Tokyo');
      expect(internalChunks[4].choices[0].delta.toolCalls[0].function.arguments).toBe('"}');

      // ✅ 验证: 最后一个 chunk (finish_reason)
      expect(internalChunks[5].choices[0].finishReason).toBe('tool_calls');
      expect(internalChunks[5].usage).toBeDefined();

      console.log('✅ Layer 3 验证通过: OpenAI SSE → Internal Chunks');
      console.log(`  - 转换了 ${internalChunks.length} 个 chunks`);
      console.log('  - tool_calls 分片正确累积');
    });
  });

  describe('Layer 4: Internal Chunk → Anthropic SSE', () => {
    it('应当正确转换 Internal chunks 到 Anthropic SSE 格式', () => {
      const anthropicConverter = new AnthropicConverter();

      // 先转换到 Internal
      const internalChunks: any[] = [];
      for (const sse of openaiSSEChunks) {
        const dataLine = sse.split('\n').find(line => line.startsWith('data: '));
        if (!dataLine) continue;
        const jsonStr = dataLine.substring(6);
        const result = openaiConverter.convertStreamChunkToInternal(jsonStr);
        if (result.success) {
          internalChunks.push(result.data);
        }
      }

      // 再转换到 Anthropic SSE
      const anthropicEvents: string[] = [];
      for (const chunk of internalChunks) {
        const result = anthropicConverter.convertStreamChunkFromInternal(chunk);
        if (result.success && result.data) {
          anthropicEvents.push(result.data);
        }
      }

      // ✅ 验证: 事件类型
      const eventTypes = anthropicEvents
        .filter(e => e.includes('event:'))
        .map(e => e.match(/event: (\w+)/)?.[1]);

      expect(eventTypes).toContain('message_start');
      expect(eventTypes).toContain('content_block_start');
      expect(eventTypes).toContain('content_block_delta');
      expect(eventTypes).toContain('message_delta');
      expect(eventTypes).toContain('message_stop');

      // ✅ 验证: content_block_start (tool_use)
      const toolUseStartEvent = anthropicEvents.find(e =>
        e.includes('content_block_start') && e.includes('tool_use')
      );
      expect(toolUseStartEvent).toBeDefined();

      // ✅ 验证: input_json_delta 累积
      const jsonDeltaEvents = anthropicEvents.filter(e =>
        e.includes('input_json_delta')
      );

      // 累积参数
      let accumulatedArgs = '';
      for (const event of jsonDeltaEvents) {
        const match = event.match(/"partial_json":"([^"]*)"/);
        if (match) {
          accumulatedArgs += match[1].replace(/\\"/g, '"');
        }
      }

      // ✅ 验证: 累积结果是有效 JSON
      expect(() => JSON.parse(accumulatedArgs)).not.toThrow();
      const parsedArgs = JSON.parse(accumulatedArgs);
      expect(parsedArgs).toEqual({ city: 'Tokyo' });

      console.log('✅ Layer 4 验证通过: Internal Chunks → Anthropic SSE');
      console.log(`  - 生成了 ${anthropicEvents.length} 个 SSE 事件`);
      console.log('  - tool_use 参数正确累积');
    });
  });

  describe('完整流式链路验证', () => {
    it('OpenAI SSE → Internal → Anthropic SSE 应当保持数据完整性', () => {
      // 模拟完整流式处理
      let accumulatedToolCalls = new Map<number, any>();

      for (const sse of openaiSSEChunks) {
        const dataLine = sse.split('\n').find(line => line.startsWith('data: '));
        if (!dataLine) continue;

        const jsonStr = dataLine.substring(6);

        // Layer 3: OpenAI → Internal
        const toInternalResult = openaiConverter.convertStreamChunkToInternal(jsonStr);
        if (!toInternalResult.success) continue;

        const internalChunk = toInternalResult.data;

        // 累积 tool_calls (模拟 Gateway Controller 的逻辑)
        if (internalChunk.choices?.[0]?.delta?.toolCalls) {
          for (const newCall of internalChunk.choices[0].delta.toolCalls) {
            const idx = newCall.index || 0;
            const existing = accumulatedToolCalls.get(idx);

            if (existing?.function?.arguments && newCall.function?.arguments) {
              existing.function.arguments += newCall.function.arguments;
            } else {
              accumulatedToolCalls.set(idx, newCall);
            }
          }
        }
      }

      // ✅ 验证: 最终累积的 tool_calls
      const finalToolCalls = Array.from(accumulatedToolCalls.values());
      expect(finalToolCalls).toHaveLength(1);
      expect(finalToolCalls[0]).toMatchObject({
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city":"Tokyo"}'
        }
      });

      // ✅ 验证: arguments 是有效 JSON
      expect(() => JSON.parse(finalToolCalls[0].function.arguments)).not.toThrow();
      const parsedArgs = JSON.parse(finalToolCalls[0].function.arguments);
      expect(parsedArgs).toEqual({ city: 'Tokyo' });

      console.log('✅ 完整流式链路验证通过');
      console.log('  - tool_calls 正确累积');
      console.log('  - 参数完整拼接');
    });
  });
});
```

---

## 🚀 实施计划

### Phase 1: 修复流式 originalResponse (本周)

```bash
# 1. 修改 gateway-controller.ts
# 2. 添加 rawSSEChunks 收集
# 3. 运行测试验证
```

### Phase 2: 创建测试用例 (本周)

```bash
# 1. 创建 multi-layer-validation 目录
# 2. 实现 8 个测试文件
# 3. 使用真实数据或构造数据
```

### Phase 3: 运行验证 (下周)

```bash
# 1. 运行所有多层验证测试
# 2. 记录每一层的结果
# 3. 修复发现的问题
```

---

## 📊 验证矩阵总览

| 场景 | 模式 | Layer 1 | Layer 2 | Layer 3 | Layer 4 | 端到端 |
|------|------|---------|---------|---------|---------|--------|
| S1 | 非流式 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| S1 | 流式 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| S2 | 非流式 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| S2 | 流式 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| S3 | 非流式 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| S3 | 流式 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| S4 | 非流式 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| S4 | 流式 | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |

**总计**: 32 个验证点 (8 场景 × 4 层)

---

**文档版本**: v2.0
**更新日期**: 2026-01-07
**重点**: 每一层都要验证！
