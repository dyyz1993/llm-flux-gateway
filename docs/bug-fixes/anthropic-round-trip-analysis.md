# Anthropic 格式往返转换分析

## 需求描述

**核心需求**: Anthropic 格式响应经过内部转换后，能够**几乎还原**为原始的 Anthropic 格式。

**转换流程**:
```
Anthropic Response (原始)
    ↓ convertResponseToInternal()
Internal Format (统一格式)
    ↓ convertResponseFromInternal()
Anthropic Response (还原后) ≈ 原始
```

---

## 用户提供的数据

**原始 Anthropic 响应**:
```json
{
  "id": "msg_20260107131610ae4107434e2944f8",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7",
  "content": [
    {
      "type": "tool_use",
      "id": "call_326f82523b21434ba5dfe827",
      "name": "get_weather",
      "input": {
        "city": "San Francisco"
      }
    }
  ],
  "stop_reason": "tool_use",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 786,
    "output_tokens": 12,
    "cache_read_input_tokens": 0,
    "server_tool_use": {
      "web_search_requests": 0
    },
    "service_tier": "standard"
  }
}
```

---

## 当前实现分析

### 方法 1: convertResponseToInternal (Anthropic → Internal)

**文件**: `anthropic.converter.ts:[586-782]`

**核心逻辑**:
```typescript
// 1. 验证必需字段
if (!anthropicResp.id) return failure(...);
if (!anthropicResp.content) return failure(...);
if (!anthropicResp.model) return failure(...);

// 2. 字段归一化 (snake_case → camelCase)
const normalizedResponse = normalizeToCamelCase(anthropicResp, true);

// 3. 提取 content 数组中的 tool_use 块
for (const block of anthropicResp.content) {
  if (block.type === 'tool_use') {
    // 添加到 content 数组（保留结构）
    contentBlocks.push({
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: block.input,
    });

    // 同时添加到 tool_calls（OpenAI 兼容）
    tool_calls.push({
      id: block.id,
      type: 'function',
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input),
      },
    });
  }
}

// 4. 构建 Internal Format
const internalResponse: InternalResponse = {
  id: anthropicResp.id,
  object: 'chat.completion',
  model: anthropicResp.model,
  choices: [{
    message: {
      role: 'assistant',
      content: contentBlocks,  // ← 保留 content 数组
      toolCalls: tool_calls,   // ← 同时提供 tool_calls
    },
    finishReason: stopReasonMap[anthropicResp.stop_reason],
  }],
  usage: {
    promptTokens: anthropicResp.usage.input_tokens,
    completionTokens: anthropicResp.usage.output_tokens,
    // ...
  },
};
```

**转换后的 Internal Format**:
```json
{
  "id": "msg_20260107131610ae4107434e2944f8",
  "object": "chat.completion",
  "model": "glm-4.7",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": [
        {
          "type": "tool_use",
          "id": "call_326f82523b21434ba5dfe827",
          "name": "get_weather",
          "input": { "city": "San Francisco" }
        }
      ],
      "toolCalls": [
        {
          "id": "call_326f82523b21434ba5dfe827",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"city\":\"San Francisco\"}"
          }
        }
      ]
    },
    "finishReason": "tool_calls"
  }],
  "usage": {
    "promptTokens": 786,
    "completionTokens": 12
  }
}
```

### 方法 2: convertResponseFromInternal (Internal → Anthropic)

**文件**: `anthropic.converter.ts:[788-895]`

**核心逻辑**:
```typescript
// 1. 提取 choice
const choice = response.choices[0];
const message = choice.message;

// 2. 构建 content 数组
const content: any[] = [];

// 3. 处理 message.content
if (Array.isArray(message.content)) {
  for (const block of message.content) {
    if (block.type === 'text') {
      content.push({ type: 'text', text: block.text });
    }
    // tool_use 块在下一步处理
  }
}

// 4. 处理 toolCalls
if (message.toolCalls) {
  for (const tool_call of message.toolCalls) {
    content.push({
      type: 'tool_use',
      id: tool_call.id,
      name: tool_call.function.name,
      input: JSON.parse(tool_call.function.arguments || '{}'),
    });
  }
}

// 5. 构建 Anthropic 响应
const anthropicResponse = {
  id: response.id,
  type: 'message',
  role: 'assistant',
  content: content,
  model: response.model,
  stop_reason: stopReasonMap[choice.finishReason],
  usage: {
    input_tokens: response.usage.promptTokens,
    output_tokens: response.usage.completionTokens,
  },
};
```

**还原后的 Anthropic 格式**:
```json
{
  "id": "msg_20260107131610ae4107434e2944f8",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7",
  "content": [
    {
      "type": "tool_use",
      "id": "call_326f82523b21434ba5dfe827",
      "name": "get_weather",
      "input": { "city": "San Francisco" }
    }
  ],
  "stop_reason": "tool_use",
  "usage": {
    "input_tokens": 786,
    "output_tokens": 12
  }
}
```

---

## 字段对比分析

### 核心字段（能够保留）

| 字段 | 原始值 | Internal Format | 还原后 | 状态 |
|-----|-------|----------------|--------|-----|
| `id` | `msg_20260107...` | ✅ 保留 | ✅ 保留 | ✅ 完整 |
| `type` | `message` | ⚠️ 隐式（重建） | ✅ 重建 | ✅ 完整 |
| `role` | `assistant` | ✅ 保留 | ✅ 保留 | ✅ 完整 |
| `model` | `glm-4.7` | ✅ 保留 | ✅ 保留 | ✅ 完整 |
| `content[].type` | `tool_use` | ✅ 保留 | ✅ 保留 | ✅ 完整 |
| `content[].id` | `call_326f8...` | ✅ 保留 | ✅ 保留 | ✅ 完整 |
| `content[].name` | `get_weather` | ✅ 保留 | ✅ 保留 | ✅ 完整 |
| `content[].input` | `{city: "SF"}` | ✅ 保留（对象） | ✅ 保留（对象） | ✅ 完整 |
| `stop_reason` | `tool_use` | ✅ 映射到 `tool_calls` | ✅ 映射回 `tool_use` | ✅ 完整 |
| `usage.input_tokens` | 786 | ✅ 转为 `promptTokens` | ✅ 转回 | ✅ 完整 |
| `usage.output_tokens` | 12 | ✅ 转为 `completionTokens` | ✅ 转回 | ✅ 完整 |

### 扩展字段（可能丢失）

| 字段 | 原始值 | Internal Format | 还原后 | 状态 |
|-----|-------|----------------|--------|-----|
| `stop_sequence` | `null` | ❌ 丢失 | ❌ 丢失 | ⚠️ 缺失 |
| `usage.cache_read_input_tokens` | 0 | ✅ 转为 `cacheReadTokens` | ✅ 转回 | ✅ 完整 |
| `usage.server_tool_use` | `{web_search_requests: 0}` | ❌ 丢失 | ❌ 丢失 | ❌ 丢失 |
| `usage.service_tier` | `standard` | ❌ 丢失 | ❌ 丢失 | ❌ 丢失 |

---

## 问题总结

### ✅ 能够正确保留的字段

1. **核心响应字段**: `id`, `type`, `role`, `model`
2. **tool_use 块**: `type`, `id`, `name`, `input`（对象格式）
3. **基本 usage**: `input_tokens`, `output_tokens`
4. **stop_reason**: 正确双向映射

### ⚠️ 可能丢失的字段

1. **`stop_sequence`**: 原始值 `null`，转换中丢失
2. **`usage.server_tool_use`**: 厂商特有字段，未被识别
3. **`usage.service_tier`**: 厂商特有字段，未被识别

### 🔧 需要修复的地方

1. **保留 `stop_sequence` 字段**: 即使值为 `null`，也应该保留
2. **保留未知 usage 字段**: 对于无法识别的 usage 子字段，应该透传
3. **厂商特有字段**: 需要一个机制来保留未知字段

---

## 测试用例设计

### 测试文件结构

```
anthropic-round-trip.test.ts
├── 基本往返转换测试
│   ├── tool_use 块完整转换
│   ├── text 块完整转换
│   └── 混合内容转换
├── 字段保留测试
│   ├── 核心字段保留
│   ├── usage 字段保留
│   └── 厂商特有字段保留
├── 边界情况测试
│   ├── 空 content
│   ├── null stop_sequence
│   └── 嵌套 input 对象
└── 端到端集成测试
    └── 完整请求-响应流程
```

### 关键断言

```typescript
// 1. 核心结构断言
expect(result.id).toBe(original.id);
expect(result.type).toBe('message');
expect(result.role).toBe('assistant');
expect(result.model).toBe(original.model);

// 2. content 数组断言
expect(Array.isArray(result.content)).toBe(true);
expect(result.content).toHaveLength(original.content.length);
expect(result.content[0].type).toBe('tool_use');
expect(result.content[0].id).toBe(original.content[0].id);
expect(result.content[0].name).toBe(original.content[0].name);
expect(result.content[0].input).toEqual(original.content[0].input);

// 3. usage 断言
expect(result.usage.input_tokens).toBe(original.usage.input_tokens);
expect(result.usage.output_tokens).toBe(original.usage.output_tokens);

// 4. stop_reason 断言
expect(result.stop_reason).toBe('tool_use');

// 5. 可选字段断言
expect(result.stop_sequence).toBe(original.stop_sequence); // 应该保留 null
```

---

## 使用的内部方法

### 需要测试的方法

1. **AnthropicConverter.convertResponseToInternal()**
   - 文件: `anthropic.converter.ts:586-782`
   - 功能: Anthropic → Internal Format

2. **AnthropicConverter.convertResponseFromInternal()**
   - 文件: `anthropic.converter.ts:788-895`
   - 功能: Internal Format → Anthropic

3. **normalizeToCamelCase()**
   - 文件: `field-normalizer.ts`
   - 功能: snake_case → camelCase

4. **normalizeToSnakeCase()**
   - 文件: `field-normalizer.ts`
   - 功能: camelCase → snake_case

### 测试流程

```
原始 Anthropic 响应
    ↓
AnthropicConverter.convertResponseToInternal()
    ↓
Internal Format (验证中间状态)
    ↓
AnthropicConverter.convertResponseFromInternal()
    ↓
还原的 Anthropic 响应
    ↓
断言: 还原响应 ≈ 原始响应
```

---

## 下一步行动

1. ✅ **创建测试文件**: `anthropic-round-trip.test.ts`
2. ✅ **编写测试用例**: 覆盖所有场景
3. ✅ **运行测试**: 验证当前行为
4. ⚠️ **修复问题**: 根据测试结果修复丢失的字段
5. ✅ **重新测试**: 确保往返转换完整
