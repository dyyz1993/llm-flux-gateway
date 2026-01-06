# GLM 多次 finish_reason 问题调研报告

**调研日期**: 2026-01-06
**问题编号**: GLM-MULTI-FINISH-001
**严重程度**: 🔴 高（导致递归调用）

---

## 执行摘要

GLM API 在返回工具调用的 SSE 流时格式不符合 OpenAI 标准，导致客户端多次触发 `onComplete` 回调，造成递归调用问题。

**核心问题**:
1. GLM 返回**多个带有 `finish_reason` 的 chunk**
2. 第二次请求时 GLM 返回**同时包含 `content` 和 `tool_calls`** 的响应（不符合标准）
3. 客户端 `useAIStream.ts` 对重复的 `finish_reason` 缺少防御

**影响范围**:
- 所有使用 GLM 且启用工具调用的流式请求
- 可能导致无限递归或重复的工具执行

---

## 问题现象

### 用户报告的 SSE 日志

```javascript
// 第1次请求 - GLM 返回多个 finish_reason
{"finish_reason":"tool_calls"}  // 第1个
{"finish_reason":"stop"}        // 第2个
{"finish_reason":"stop"}        // 第3个（有时还有）

// 第2次请求 - 非标准格式
{
  "content": "The current weather is...",  // 有文本内容
  "tool_calls": [{                          // 同时有 tool_calls！
    "arguments": "{\"city\": \"San Francisco\"}{\"city\": \"San Francisco\"}"  // 重复的无效JSON
  }]
}
```

### 标准 OpenAI 格式（对比）

```javascript
// ✅ 正确: 有 tool_calls 时 content 应为 null 或空
{
  "content": null,
  "tool_calls": [{
    "id": "call_123",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"city\": \"San Francisco\"}"
    }
  }],
  "finish_reason": "tool_calls"
}
```

---

## 架构调研

### 1. 协议转换层 (Server-Side)

#### GLM Converter
**文件**: `/src/server/module-protocol-transpiler/converters/glm.converter.ts`

**关键发现**:
- GLM converter 使用 `OpenAISSEParser` 解析流（第 536-538 行）
- **没有特殊处理多个 `finish_reason` 的逻辑**
- GLM 声称 OpenAI 兼容，但实际返回混合格式（snake_case + camelCase）

```typescript
// GLMConverter.getStreamParser()
getStreamParser(): any {
  // GLM uses OpenAI-compatible SSE format
  const { OpenAISSEParser } = require('../parsers/openai-sse-parser');
  return new OpenAISSEParser();  // ⚠️ 没有特殊处理
}
```

#### OpenAI SSE Parser
**文件**: `/src/server/module-protocol-transpiler/parsers/openai-sse-parser.ts`

**关键发现**:
- Parser 本身**不过滤重复的 `finish_reason`**
- 只是简单地映射字段（第 175 行）:
  ```typescript
  finishReason: this.mapFinishReason(choice.finish_reason)
  ```
- **防御逻辑应该在客户端**，因为服务端无法判断什么是"重复"

---

### 2. 客户端流处理 (Client-Side)

#### useAIStream Hook
**文件**: `/src/client/hooks/useAIStream.ts`

**关键发现**:

**现有防御**（第 353-354 行）:
```typescript
let completed = false; // 🔒 防止 onComplete 重复调用
let completionCount = 0; // 🔍 DEBUG: Track how many times completion is triggered
```

**处理逻辑**（第 391-420 行）:
```typescript
if (chunk.choices[0]?.finish_reason && !completed) {
  completionCount++;
  console.log(`[useAIStream] 🔍 Completion trigger #${completionCount}, finish_reason: ${chunk.choices[0]?.finish_reason}`);

  completed = true; // 🔒 设置标志

  if (chunk.usage && params.onComplete) {
    params.onComplete({
      prompt: chunk.usage.prompt_tokens || 0,
      completion: chunk.usage.completion_tokens || 0,
    });
  }
} else if (chunk.choices[0]?.finish_reason && completed) {
  console.warn(`[useAIStream] ⚠️ Duplicate finish_reason detected (trigger #${completionCount + 1}), ignoring!`);
}
```

**问题**:
- ✅ 已有 `completed` 标志防止重复调用
- ✅ 已有日志记录重复的 `finish_reason`
- ⚠️ **但问题依然存在**，说明防御不够强

---

### 3. 测试覆盖情况

#### 已有测试
| 测试文件 | 覆盖场景 | 状态 |
|---------|---------|------|
| `openai.streaming.test.ts` | OpenAI 格式流式解析 | ✅ |
| `anthropic.streaming.test.ts` | Anthropic 格式流式解析 | ✅ |
| `glm-token-extraction.test.ts` | GLM token 提取（非流式） | ✅ |
| `anthropic-glm-fields.test.ts` | GLM 特有字段处理 | ✅ |

#### ❌ 缺失的测试
- **GLM 流式响应测试**: 没有 GLM 特定的流式测试
- **多个 finish_reason 测试**: 没有测试客户端如何处理重复的 `finish_reason`
- **工具调用递归测试**: 没有验证工具调用后是否会触发递归

---

## 根因分析

### 问题 1: GLM API 非标准行为

**证据**:
1. GLM 返回多个 `finish_reason` chunk
2. GLM 在 tool_calls 响应中同时包含 `content` 和 `tool_calls`
3. GLM 的 `arguments` 字段包含重复的无效 JSON

**结论**: GLM API **不符合 OpenAI 标准**

---

### 问题 2: 客户端防御不够强

**当前防御**:
- `completed` 标志在**每次流请求**时重置
- 如果有多个流请求（递归调用），每个请求都有自己的 `completed` 标志
- **无法防止跨请求的递归**

**问题场景**:
```
请求 #1: 收到 finish_reason="tool_calls"
  → 设置 completed=true
  → 执行工具调用
  → 触发请求 #2

请求 #2: 又收到 finish_reason="tool_calls"
  → completed 重置为 false（新请求）
  → 再次触发工具调用
  → 无限循环！
```

---

### 问题 3: 缺少 GLM 特殊处理

**当前架构**:
- GLM 使用 `OpenAISSEParser`
- 没有专门的 `GLMSSEParser`
- 没有过滤重复的 `finish_reason` chunk

**应该有的处理**:
- 服务端: 在 `GLMConverter` 或 `GLMSSEParser` 中去重 `finish_reason`
- 客户端: 增强递归检测机制

---

## 修复建议

### 方案 A: 服务端修复（推荐）

**目标**: 在服务端过滤 GLM 的重复 `finish_reason`

**实施步骤**:

#### 1. 创建 GLM SSE Parser

**文件**: `/src/server/module-protocol-transpiler/parsers/glm-sse-parser.ts`

```typescript
import { OpenAISSEParser } from './openai-sse-parser';
import type { InternalStreamChunk } from '../interfaces/internal-format';

export class GLMSSEParser extends OpenAISSEParser {
  private lastFinishReason: string | null = null;
  private hasSeenFinishReason = false;

  async *parse(stream: ReadableStream<Uint8Array>): AsyncGenerator<InternalStreamChunk, void, unknown> {
    this.resetCounters();

    for await (const chunk of super.parse(stream)) {
      // 去重 finish_reason
      if (chunk.choices && chunk.choices[0]) {
        const currentFinishReason = chunk.choices[0].finishReason;

        if (currentFinishReason !== null) {
          if (this.hasSeenFinishReason) {
            // 已见过 finish_reason，忽略后续的
            console.warn(`[GLMSSEParser] ⚠️ Ignoring duplicate finish_reason: ${currentFinishReason}`);
            continue;
          }

          this.hasSeenFinishReason = true;
          this.lastFinishReason = currentFinishReason;
        }
      }

      yield chunk;
    }
  }

  resetCounters() {
    super.resetCounters();
    this.lastFinishReason = null;
    this.hasSeenFinishReason = false;
  }
}
```

#### 2. 更新 GLM Converter

**文件**: `/src/server/module-protocol-transpiler/converters/glm.converter.ts`

```typescript
getStreamParser(): any {
  // Use GLM-specific SSE parser with deduplication
  const { GLMSSEParser } = require('../parsers/glm-sse-parser');
  return new GLMSSEParser();
}
```

#### 3. 添加测试

**文件**: `/src/server/module-protocol-transpiler/parsers/__tests__/glm-sse-parser.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { GLMSSEParser } from '../glm-sse-parser';

describe('GLMSSEParser - finish_reason Deduplication', () => {
  it('should filter out duplicate finish_reason chunks', async () => {
    const mockStream = createMockStream([
      '{"choices":[{"finish_reason":"tool_calls"}]}',
      '{"choices":[{"finish_reason":"stop"}]}',  // Duplicate
      '{"choices":[{"finish_reason":"stop"}]}',  // Duplicate
    ]);

    const parser = new GLMSSEParser();
    const chunks = [];

    for await (const chunk of parser.parse(mockStream)) {
      chunks.push(chunk);
    }

    // Should only yield the first finish_reason
    expect(chunks).toHaveLength(1);
    expect(chunks[0].choices[0].finishReason).toBe('tool_calls');
  });
});
```

---

### 方案 B: 客户端增强防御（补充）

**目标**: 在客户端检测和防止递归调用

**实施步骤**:

#### 1. 添加递归检测

**文件**: `/src/client/hooks/useAIStream.ts`

```typescript
// 在 useAIStream 函数级别添加递归计数器
const RECURSION_DEPTH_LIMIT = 5;
const recursionDepthRef = useRef(0);
const lastToolCallTimeRef = useRef(0);

const stream = useCallback(async (options: StreamOptions) => {
  const {
    isRecursive = false,
    onComplete,
    ...
  } = options;

  // 检测递归深度
  if (!isRecursive) {
    const now = Date.now();
    const timeSinceLastCall = now - lastToolCallTimeRef.current;

    // 如果上次工具调用后很短时间内又调用，可能是递归
    if (timeSinceLastCall < 1000) {
      recursionDepthRef.current++;
    } else {
      recursionDepthRef.current = 0;
    }

    if (recursionDepthRef.current > RECURSION_DEPTH_LIMIT) {
      console.error('[useAIStream] 🔴 RECURSION DEPTH LIMIT REACHED!');
      params.onError('Maximum recursion depth exceeded. Possible loop detected.');
      return;
    }
  }

  // ... 现有逻辑 ...

  // 在工具调用完成时更新时间戳
  if (chunk.choices[0]?.finish_reason === 'tool_calls') {
    lastToolCallTimeRef.current = Date.now();
  }
}, [isLoading, setIsLoading]);
```

#### 2. 验证 tool_calls 格式

```typescript
// 在 streamOpenAI 函数中添加验证
if (toolCalls) {
  // 验证 arguments 是否为有效 JSON
  for (const tc of accumulatedToolCalls.values()) {
    try {
      // 尝试解析 arguments
      const parsed = JSON.parse(tc.function.arguments);

      // 检查是否有重复的内容（GLM bug）
      const argsStr = JSON.stringify(parsed);
      if (argsStr.includes('}{')) {
        console.error('[useAIStream] 🔴 GLM BUG DETECTED: Malformed tool arguments');
        console.error('[useAIStream] Invalid arguments:', tc.function.arguments);

        // 跳过这个工具调用
        continue;
      }
    } catch (e) {
      console.error('[useAIStream] 🔴 Failed to parse tool arguments:', tc.function.arguments);
      continue;
    }
  }
}
```

---

### 方案 C: 组合方案（最佳实践）

**推荐**:
1. ✅ **服务端修复**（方案 A）: 去重 `finish_reason`
2. ✅ **客户端增强**（方案 B）: 递归检测和格式验证
3. ✅ **添加测试**: 覆盖 GLM 特殊行为

---

## 实施优先级

| 优先级 | 方案 | 工作量 | 风险 | 收益 |
|-------|------|--------|------|------|
| 🔴 P0 | 方案 A: 服务端去重 | 中 | 低 | 高（彻底解决） |
| 🟡 P1 | 方案 B: 客户端防御 | 低 | 低 | 中（兜底保护） |
| 🟢 P2 | 添加 GLM 测试 | 中 | 无 | 高（防止回归） |

---

## 相关文档

- [Anthropic SSE Standard Format](/.claude/skills/anthropic-sse-standard.md)
- [GLM Tool Calling 16 Combinations Report](/docs/research/glm-tool-calling-16-combinations-report.md)
- [Protocol Transformation Rules](/.claude/rules/protocol-transformation-rules.md)

---

## 结论

**问题根源**: GLM API 不符合 OpenAI 标准，返回多个 `finish_reason` 和混合的 content/tool_calls

**最佳修复方案**:
1. 在服务端创建 `GLMSSEParser` 去重 `finish_reason`
2. 在客户端添加递归深度检测和格式验证
3. 添加 GLM 特定的测试用例

**预期效果**:
- 彻底解决 GLM 工具调用的递归问题
- 提升系统鲁棒性，防止类似问题
- 完善测试覆盖，防止回归
