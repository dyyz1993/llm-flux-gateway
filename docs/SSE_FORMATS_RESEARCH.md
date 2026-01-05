# LLM API SSE 流式响应格式调研

## 问题背景

当前 `upstream.service.ts` 只支持 OpenAI 格式的 SSE 流式响应，导致使用 Anthropic 格式的供应商（如智谱 AI）的响应无法被正确解析，`chunkCount` 为 0，响应内容丢失。

---

## 1. OpenAI SSE 格式

### 特点
- **简单格式**：只使用 `data:` 前缀
- **无事件类型**：没有 `event:` 字段
- **直接数据**：每个 chunk 都是完整的 JSON 对象

### 示例

```
data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4","choices":[{"index":0,"delta":{"content":" world"}}]}

data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1694268190,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

### 数据结构

```typescript
{
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: [{
    index: number;
    delta: {
      content?: string;
      role?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }];
}
```

### 工具调用格式

工具调用通过 `delta.tool_calls` 数组逐步构建：

```
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"web_search","arguments":"{\"query\":\"weather\""}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"}"}}]}}]}
```

---

## 2. Anthropic SSE 格式

### 特点
- **事件驱动**：使用 `event:` 字段标识事件类型
- **复杂结构**：响应由多个事件类型组成
- **分层架构**：message → content_block → delta

### 事件流程

```
1. message_start        - 消息开始
2. content_block_start  - 内容块开始（文本或工具调用）
3. content_block_delta  - 内容块增量更新
4. content_block_stop   - 内容块结束
5. message_delta        - 消息级更新（token 计数）
6. message_stop         - 消息结束
```

### 示例

#### 文本响应

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_123","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}

event: message_stop
data: {"type":"message_stop"}
```

#### 工具调用响应

```
event: message_start
data: {"type":"message_start",...}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_123","name":"web_search","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"query\":\"weather"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":" in SF"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":15}}

event: message_stop
data: {"type":"message_stop"}
```

### 事件类型详解

#### message_start
```typescript
{
  type: "message_start";
  message: {
    id: string;
    role: "assistant";
    content: Array<ContentBlock>;
    model: string;
    stop_reason: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}
```

#### content_block_start
```typescript
// 文本块
{
  type: "content_block_start";
  index: number;
  content_block: {
    type: "text";
    text: "";
  };
}

// 工具调用块
{
  type: "content_block_start";
  index: number;
  content_block: {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, any>;
  };
}
```

#### content_block_delta
```typescript
// 文本增量
{
  type: "content_block_delta";
  index: number;
  delta: {
    type: "text_delta";
    text: string;
  };
}

// 工具调用参数增量（JSON 片段）
{
  type: "content_block_delta";
  index: number;
  delta: {
    type: "input_json_delta";
    partial_json: string; // JSON 片段，需要拼接
  };
}
```

---

## 3. Gemini SSE 格式

### 特点
- **混合格式**：同时支持 OpenAI 兼容模式和原生格式
- **原生格式**：使用 `candidates` 结构
- **OpenAI 兼容**：通过特定端点支持 OpenAI 格式

### 原生格式示例

```
data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"},"finishReason":"","index":0}]}

data: {"candidates":[{"content":{"parts":[{"text":" world"}],"role":"model"},"finishReason":"","index":0}]}

data: {"candidates":[{"content":{"parts":[{"text":"!"}],"role":"model"},"finishReason":"STOP","index":0}]}
```

### 数据结构

```typescript
{
  candidates: [{
    content: {
      parts: [{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, any>;
        };
        functionResponse?: {
          name: string;
          response: Record<string, any>;
        };
      }];
      role: "model";
    };
    finishReason: string;
    index: number;
  }];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}
```

---

## 4. 智谱 AI (Zhipu AI) 格式

### 特点
- **Anthropic 兼容**：完全遵循 Anthropic Messages API 格式
- **端点**：`https://open.bigmodel.cn/api/anthropic/messages`
- **事件类型**：与 Anthropic 完全一致

### 兼容性

智谱 AI 提供 Claude API 兼容接口，可以使用 Anthropic SDK 直接调用，只需修改：
- API Key
- Base URL

### SSE 格式

与 Anthropic 格式**完全相同**，参见上文 Anthropic 部分。

---

## 格式对比总结

| 特性 | OpenAI | Anthropic/智谱 | Gemini (原生) |
|------|--------|----------------|---------------|
| **事件前缀** | 只有 `data:` | `event:` + `data:` | 只有 `data:` |
| **事件类型** | 无 | 6 种事件类型 | 无 |
| **工具调用** | `delta.tool_calls` | `content_block_start` + `content_block_delta` | `parts[].functionCall` |
| **Token 计数** | 最后一个 chunk | `message_delta` 事件 | `usageMetadata` |
| **结束标记** | `data: [DONE]` | `event: message_stop` | 最后一个数据块 |
| **复杂性** | 简单 | 复杂 | 中等 |

---

## 当前代码问题

### upstream.service.ts 分析

```typescript
// 当前实现：只能解析 OpenAI 格式
for (const line of lines) {
  if (trimmed.startsWith('data: ')) {
    const data = trimmed.slice(6);
    if (data === '[DONE]') continue;
    const chunk = JSON.parse(data);
    yield chunk;  // 期望 OpenAI 格式
  }
}
```

### 问题

1. **忽略 `event:` 字段**：Anthropic 的事件类型被丢弃
2. **无法识别工具调用**：`content_block_start` / `content_block_delta` 被当作普通数据
3. **chunkCount = 0**：没有 yield 任何数据

---

## 解决方案设计

### 方案 1: 统一格式转换器

**目标**：将所有供应商的 SSE 流转换为统一的 OpenAI 格式

**架构**：

```
┌─────────────────────────────────────────────────────────┐
│                   UpstreamService                        │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │ OpenAI       │    │ Anthropic    │    │ Gemini    │ │
│  │ Parser       │    │ Parser       │    │ Parser    │ │
│  └──────┬───────┘    └──────┬───────┘    └─────┬─────┘ │
│         │                   │                  │        │
│         └───────────────────┼──────────────────┘        │
│                             ▼                            │
│                  ┌────────────────┐                      │
│                  │ Normalized     │                      │
│                  │ OpenAI Format  │                      │
│                  └────────┬───────┘                      │
└───────────────────────────┼─────────────────────────────┘
                            ▼
                    Internal Stream
```

### 实现步骤

1. **创建供应商特定的 SSE 解析器**
   - `openai-sse-parser.ts` - OpenAI 格式
   - `anthropic-sse-parser.ts` - Anthropic/智谱格式
   - `gemini-sse-parser.ts` - Gemini 格式

2. **定义统一的输出格式**（OpenAI 兼容）

3. **修改 `upstream.service.ts`**
   - 检测供应商格式
   - 选择正确的解析器
   - 输出统一格式

### 代码结构

```typescript
// src/server/module-gateway/services/parsers/
├── base-sse-parser.ts        // 基础解析器接口
├── openai-sse-parser.ts      // OpenAI 格式解析器
├── anthropic-sse-parser.ts   // Anthropic/智谱格式解析器
├── gemini-sse-parser.ts      // Gemini 格式解析器
└── index.ts                  // 导出统一接口

// 修改 upstream.service.ts
import { createSSEParser } from './parsers';

async *streamRequest(options: StreamOptions): AsyncGenerator<StreamChunk> {
  const response = await fetch(url, ...);

  // 根据供应商选择解析器
  const parser = createSSEParser(options.vendorFormat);

  for await (const chunk of parser.parse(response.body)) {
    yield chunk;  // 统一 OpenAI 格式
  }
}
```

---

## 下一步

1. 实现 `base-sse-parser.ts` - 定义解析器接口
2. 实现 `anthropic-sse-parser.ts` - 最优先（智谱 AI）
3. 实现 `gemini-sse-parser.ts`
4. 修改 `upstream.service.ts` - 集成解析器
5. 测试各供应商的流式响应

---

## 参考资料

- [OpenAI Streaming Responses](https://platform.openai.com/docs/guides/streaming-responses)
- [Anthropic Streaming Messages](https://docs.anthropic.com/en/api/messages-streaming)
- [Anthropic Streaming Events Reference](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [Gemini API Reference](https://ai.google.dev/api)
- [智谱 AI Claude API 兼容文档](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction)
- [Zhipu AI GLM-4 API](https://open.bigmodel.cn/dev/api)
