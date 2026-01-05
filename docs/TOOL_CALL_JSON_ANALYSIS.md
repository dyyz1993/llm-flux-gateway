# 工具调用 JSON 拼接分析

## 问题：工具调用的 JSON 拼接是否会阻塞？

### 短答案：**不会阻塞，但格式与 OpenAI 不一致**

---

## 1. Anthropic 的工具调用格式

### 流式响应格式

```
event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_123","name":"web_search","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"query\":\"wea"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"ther\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}
```

**关键点**：
- `partial_json` 是 JSON 的**片段**，不是完整的 JSON
- 需要客户端拼接这些片段
- 每个片段可能只是 JSON 的一部分（如 `{"query":"wea`）

---

## 2. 当前实现的拼接逻辑

### 代码分析

```typescript
// anthropic-sse-parser.ts:148-161
else if (data.delta.type === 'input_json_delta' && data.delta.partial_json) {
  if (block.toolCall) {
    // ① 累积片段
    block.toolCall.arguments += data.delta.partial_json;

    // ② 立即 yield 当前的累积状态
    yield this.createToolCallDeltaChunk(
      messageId,
      model,
      created,
      block.index,
      block.toolCall  // ← 传入完整的累积 arguments
    );
  }
}
```

### createToolCallDeltaChunk 实现

```typescript
// anthropic-sse-parser.ts:215-248
private createToolCallDeltaChunk(
  id: string,
  model: string,
  created: number,
  index: number,
  toolCall: { id: string; name: string; arguments: string }
): StreamChunk {
  // 尝试解析累积的 JSON（但只是为了验证）
  let parsedArgs: Record<string, any> = {};
  try {
    parsedArgs = JSON.parse(toolCall.arguments); // ← 可能失败
  } catch {
    // Arguments incomplete, continue accumulating
  }

  // 返回累积的完整 arguments（不是增量）
  return {
    ...this.createBaseChunk(id, model, created),
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index,
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments, // ← 累积的完整字符串
          },
        }],
      },
      finish_reason: null,
    }],
  };
}
```

---

## 3. 实际行为示例

### 场景：工具调用 `web_search({"query":"weather"})`

#### Anthropic 原始事件

| 事件 | partial_json | 累积后的 arguments |
|------|--------------|-------------------|
| 1 | `{"query":"wea` | `{"query":"wea` |
| 2 | `ther"` | `{"query":"weather"}` |

#### 当前实现的 yield

| Chunk # | yield 的 arguments | 说明 |
|---------|-------------------|------|
| 1 | `{"query":"wea` | ⚠️ 无效 JSON |
| 2 | `{"query":"weather"}` | ✅ 有效 JSON |

**问题**：
- ⚠️ Chunk 1 的 `arguments` 是无效的 JSON（`{"query":"wea` 缺少闭合引号和括号）
- ⚠️ 与 OpenAI 格式不一致

---

## 4. OpenAI 的工具调用格式

### 标准 OpenAI 流式格式

```
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"web_search","arguments":""}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"query\":\""}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"wea"}}]}}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ther\"}"}}]}}]}

data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}
```

**关键差异**：

| 特性 | OpenAI | 当前实现（Anthropic 转换） |
|------|--------|---------------------------|
| 第一个 chunk | `arguments: ""` | `arguments: ""` |
| 后续 chunk | **增量**片段 | **完整**累积字符串 |
| 格式 | 每个 chunk 独立 | 每个 chunk 依赖前面的 |

---

## 5. 阻塞分析

### ❓ 拼接是否会阻塞？

**答案：不会**

```typescript
block.toolCall.arguments += data.delta.partial_json;  // ← 字符串拼接，<1ms
yield this.createToolCallDeltaChunk(...);            // ← 立即 yield
```

- ✅ 字符串拼接非常快（<1ms）
- ✅ 立即 yield，不等待完整 JSON
- ✅ 不会阻塞流式返回

### ⚠️ 但格式有问题

当前实现 yield 的是**累积的完整字符串**，而不是**增量**：

```typescript
// 当前实现
Chunk 1: arguments = '{"query":"wea'
Chunk 2: arguments = '{"query":"weather"}'

// OpenAI 格式
Chunk 1: arguments = '{"query":"'
Chunk 2: arguments = 'wea'
Chunk 3: arguments = 'ther'
Chunk 4: arguments = '"}'
```

---

## 6. 是否需要修复？

### 取决于客户端期望

#### 如果客户端期望 OpenAI 格式

**需要修改**：改为增量 yield

```typescript
// 修改后的实现
else if (data.delta.type === 'input_json_delta') {
  if (block.toolCall) {
    // 只保存累积状态用于验证
    block.toolCall.arguments += data.delta.partial_json;

    // Yield 增量（与 OpenAI 一致）
    yield {
      ...this.createBaseChunk(id, model, created),
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index,
            function: {
              arguments: data.delta.partial_json, // ← 只 yield 当前增量
            },
          }],
        },
        finish_reason: null,
      }],
    };
  }
}
```

#### 如果客户端能处理当前格式

**当前实现可用**：
- 客户端需要理解每个 chunk 的 `arguments` 是累积的完整字符串
- 最后一个 chunk 的 `arguments` 是完整的 JSON

---

## 7. 客户端处理对比

### OpenAI 格式客户端

```typescript
let accumulatedArgs = '';
for await (const chunk of stream) {
  const toolCalls = chunk.choices[0].delta.tool_calls;
  if (toolCalls) {
    for (const call of toolCalls) {
      if (call.function?.arguments) {
        // 累积增量
        accumulatedArgs += call.function.arguments;
      }
    }
  }
}

// 使用 accumulatedArgs
const args = JSON.parse(accumulatedArgs);
```

### 当前格式客户端

```typescript
for await (const chunk of stream) {
  const toolCalls = chunk.choices[0].delta.tool_calls;
  if (toolCalls) {
    for (const call of toolCalls) {
      if (call.function?.arguments) {
        // 直接使用（已经是完整的累积字符串）
        try {
          const args = JSON.parse(call.function.arguments);
          // 使用 args
        } catch {
          // JSON 还不完整，等待下一个 chunk
        }
      }
    }
  }
}
```

---

## 8. 推荐方案

### 选项 A: 保持当前格式（简单）

**优点**：
- ✅ 实现简单
- ✅ 每个_chunk_ 独立可解析（最后一个是完整 JSON）

**缺点**：
- ⚠️ 与 OpenAI 格式不一致
- ⚠️ 客户端需要适配

**适用场景**：
- 客户端由你控制
- 不需要完全兼容 OpenAI

### 选项 B: 改为 OpenAI 格式（兼容）

**优点**：
- ✅ 与 OpenAI 完全兼容
- ✅ 可使用现有客户端库

**缺点**：
- ⚠️ 实现稍复杂
- ⚠️ 客户端必须累积增量

**适用场景**：
- 需要兼容 OpenAI SDK
- 客户端无法修改

---

## 9. 性能对比

| 指标 | 当前格式 | OpenAI 格式 |
|------|----------|-------------|
| 字符串拼接 | 每次拼接完整字符串 | 每次拼接增量 |
| 内存占用 | 稍高（保存完整字符串） | 稍低（只保存增量） |
| 客户端复杂度 | 低（直接解析） | 高（需要累积） |
| 兼容性 | 与 OpenAI 不一致 | 与 OpenAI 一致 |

---

## 10. 总结

### ✅ 当前实现的优点

1. **不阻塞** - 立即 yield，延迟 <1ms
2. **简单** - 客户端可以直接解析最后一个 chunk
3. **可靠** - 每个_chunk_ 包含完整的状态

### ⚠️ 需要考虑的问题

1. **格式不一致** - 与 OpenAI 格式不同
2. **中间 chunk 无效** - 只有最后一个 chunk 是有效 JSON
3. **客户端适配** - 需要特殊处理

### 🎯 建议

**如果你的目标是兼容 OpenAI 客户端**：
- 修改为增量 yield（选项 B）

**如果客户端由你控制**：
- 保持当前格式（选项 A）

---

## 11. 实现修改（如果选择选项 B）

### 修改后的代码

```typescript
else if (data.delta.type === 'input_json_delta') {
  if (block.toolCall) {
    // 保存累积状态
    block.toolCall.arguments += data.delta.partial_json;

    // Yield 增量（OpenAI 格式）
    yield {
      ...this.createBaseChunk(messageId, model, created),
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: block.index,
            function: {
              // 只 yield 当前增量，不是累积字符串
              arguments: data.delta.partial_json,
            },
          }],
        },
        finish_reason: null,
      }],
    };
  }
}
```

### 处理 tool_use start

```typescript
case 'content_block_start': {
  if (data.content_block.type === 'tool_use') {
    // 初始化 tool call
    block.toolCall = {
      id: data.content_block.id!,
      name: data.content_block.name!,
      arguments: '',
    };

    // Yield 第一个 chunk（空 arguments）
    yield {
      ...this.createBaseChunk(messageId, model, created),
      choices: [{
        index: 0,
        delta: {
          tool_calls: [{
            index: data.index,
            id: data.content_block.id!,
            type: 'function',
            function: {
              name: data.content_block.name!,
              arguments: '', // ← OpenAI 格式：第一个 chunk 空字符串
            },
          }],
        },
        finish_reason: null,
      }],
    };
  }
  break;
}
```

这样就能完全兼容 OpenAI 格式了。

