# Anthropic SSE Standard Format

## 概述

Anthropic Claude API 使用 Server-Sent Events (SSE) 流式传输响应消息。此文档记录了标准的事件格式和顺序，用于验证和调试流式响应。

---

## 标准事件流顺序

### 1. message_start

**用途**: 标记消息开始，包含消息 ID 和模型信息

**事件类型**: `message_start`

**格式**:
```json
{
  "type": "message_start",
  "message": {
    "id": "msg_123abc",
    "type": "message",
    "role": "assistant",
    "content": [],
    "model": "claude-3-5-sonnet-20241022",
    "stop_reason": null,
    "stop_sequence": null,
    "usage": {
      "input_tokens": 10,
      "output_tokens": 0
    }
  }
}
```

---

### 2. content_block_start

**用途**: 标记内容块开始，可以是文本或工具调用

**事件类型**: `content_block_start`

**格式（文本块）**:
```json
{
  "type": "content_block_start",
  "index": 0,
  "content_block": {
    "type": "text",
    "text": ""
  }
}
```

**格式（工具调用块）**:
```json
{
  "type": "content_block_start",
  "index": 0,
  "content_block": {
    "type": "tool_use",
    "id": "toolu_123abc",
    "name": "calculator",
    "input": {}
  }
}
```

---

### 3. content_block_delta

**用途**: 流式传输内容增量

**事件类型**: `content_block_delta`

**格式（文本增量）**:
```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "text_delta",
    "text": "Hello"
  }
}
```

**格式（工具参数增量）**:
```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "input_json_delta",
    "partial_json": "{\"exp"
  }
}
```

---

### 4. content_block_stop

**用途**: 标记内容块结束

**事件类型**: `content_block_stop`

**格式**:
```json
{
  "type": "content_block_stop",
  "index": 0
}
```

---

### 5. message_delta

**用途**: 标记消息结束，包含最终 token 计数和停止原因

**事件类型**: `message_delta`

**格式**:
```json
{
  "type": "message_delta",
  "delta": {
    "stop_reason": "end_turn",
    "stop_sequence": null
  },
  "usage": {
    "output_tokens": 50
  }
}
```

---

### 6. message_stop

**用途**: 标记整个消息流结束

**事件类型**: `message_stop`

**格式**:
```json
{
  "type": "message_stop"
}
```

---

## 停止原因 (stop_reason) 枚举

| 值 | 含义 |
|----|------|
| `end_turn` | 模型完成响应 |
| `max_tokens` | 达到 max_tokens 限制 |
| `stop_sequence` | 遇到 stop_sequence |
| `tool_use` | 模型请求使用工具 |
| `content_filter` | 内容被过滤 |

---

## 完整示例：文本生成

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}

event: message_stop
data: {"type":"message_stop"}
```

---

## 完整示例：工具调用

```
event: message_start
data: {"type":"message_start","message":{"id":"msg_456","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":15,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_789","name":"calculator","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"expression\":\"12"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"3 + 456\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":15}}

event: message_stop
data: {"type":"message_stop"}
```

---

## 关键规范要点

### ✅ 正确行为

1. **每个消息只有一次** `message_delta` 事件
2. **每个消息只有一次** `message_stop` 事件
3. **stop_reason 只出现在** `message_delta` 事件中
4. **工具调用时** `stop_reason` 为 `"tool_use"`
5. **正常完成时** `stop_reason` 为 `"end_turn"`

### ❌ 常见错误

1. **多个 `message_delta` 事件** → 会导致客户端多次触发回调
2. **多个 `stop_reason`** → 会导致递归调用
3. **工具调用时有 `content` 字段** → 不符合规范，tool_use 时 content 应为空
4. **缺少 `message_stop`** → 流未正确结束

---

## 用途

此 skill 用于：

1. **验证 SSE 流格式**: 检查实际响应是否符合标准
2. **调试流式问题**: 对比标准和实际响应，找出差异
3. **编写测试用例**: 作为参考确保测试覆盖所有场景
4. **客户端解析逻辑**: 确保解析器正确处理所有事件类型

---

## 相关文件

- **Anthropic Converter**: `/src/server/module-protocol-transpiler/converters/anthropic.converter.ts`
- **Anthropic SSE Parser**: `/src/server/module-protocol-transpiler/parsers/anthropic-sse-parser.ts`
- **客户端流处理**: `/src/client/hooks/useAIStream.ts`
- **测试用例**: `/src/server/module-protocol-transpiler/converters/__tests__/anthropic.streaming.test.ts`
