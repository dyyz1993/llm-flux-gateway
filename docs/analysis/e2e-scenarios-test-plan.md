# 端到端场景测试验证方案

> 目标: 验证 4 个场景 × 2 模式 (流式/非流式) = 8 种情况的协议转换正确性
>
> 特别关注: 流式响应的 originalResponse 完整性

---

## 📊 测试矩阵

| 场景 | 描述 | 非流式 | 流式 | 优先级 |
|------|------|--------|------|--------|
| **S1** | Anthropic → OpenAI → Anthropic | ⏳ 待测试 | ⏳ 待测试 | 🔴 高 |
| **S2** | OpenAI → OpenAI → OpenAI | ⏳ 待测试 | ⏳ 待测试 | 🟡 中 |
| **S3** | Anthropic → Anthropic → Anthropic | ⏳ 待测试 | ⏳ 待测试 | 🟡 中 |
| **S4** | OpenAI → Anthropic → OpenAI | ⏳ 待测试 | ⏳ 待测试 | 🔴 高 |

**总计**: 8 个测试用例

---

## 🎯 关键验证点

### 1. 数据完整性

| 字段 | 验证方法 | 期望结果 |
|------|---------|---------|
| **content** | 对比输入输出文本内容 | 完全一致 |
| **tool_calls** | 验证数量、name、arguments | 完全一致 |
| **usage** | 验证 token 统计 | 正确映射 |
| **id/model** | 验证元数据 | 保留或合理生成 |
| **finish_reason** | 验证结束原因映射 | 正确映射 |

### 2. 格式一致性

| 场景 | 请求格式 | 响应格式 | 验证点 |
|------|---------|---------|--------|
| S1 | Anthropic | Anthropic | `content[]`, `tool_use` 块保留 |
| S2 | OpenAI | OpenAI | `choices[]`, `tool_calls` 保留 |
| S3 | Anthropic | Anthropic | `system` 字段正确处理 |
| S4 | OpenAI | OpenAI | 工具调用格式转换正确 |

### 3. 流式响应特殊验证

| 验证点 | 非流式 | 流式 |
|--------|--------|------|
| **originalResponse** | 完整 JSON | ❌ 当前仅元数据 |
| **content** | 一次性获取 | 累积多个 chunk |
| **tool_calls** | 完整数组 | 最后一个 chunk 包含完整数组 |
| **finish_reason** | 包含在响应中 | 单独 chunk 发送 |

---

## 🚨 关键问题: 流式 originalResponse 不完整

### 问题描述

**位置**: `gateway-controller.ts:573-579`

**当前代码**:
```typescript
originalResponse: JSON.stringify({
  streamed: true,
  chunkCount,
  targetFormat,
  // ❌ 缺少完整 SSE 数据
  // ❌ 无法从日志重建完整的流式响应
})
```

### 影响

1. **调试困难**: 无法从 `logs/request-traces/` 重建完整 SSE 流
2. **前端问题**: 用户提到的 "前端看不到完整的流式的数据"
3. **日志不完整**: `originalResponse` 只有元数据，没有实际内容

### 解决方案

#### 选项 1: 存储完整原始 SSE (推荐)

```typescript
// gateway-controller.ts

// 在流式处理循环中收集原始 SSE
const rawSSEChunks: string[] = [];

for await (const chunk of upstreamService.streamRequest(...)) {
  rawSSEChunks.push(chunk);  // ✅ 收集原始数据

  // 解析和处理...
}

// 存储时包含完整数据
originalResponse: JSON.stringify({
  streamed: true,
  chunkCount: rawSSEChunks.length,
  targetFormat,
  rawSSE: rawSSEChunks.join('\n'),  // ✅ 完整原始 SSE
  accumulated: {
    contentBlocks,
    accumulatedText,
    toolCalls: Array.from(accumulatedToolCalls.values()),
  }
})
```

#### 选项 2: 使用累积结果重建

```typescript
// 使用 responseContent 重建完整响应
originalResponse: JSON.stringify({
  streamed: true,
  chunkCount,
  targetFormat,
  reconstructed: {
    // 重建为完整的响应格式
    id: finalChunkId,
    choices: [{
      message: {
        role: 'assistant',
        content: contentBlocks.length > 0 ? contentBlocks : accumulatedText,
        tool_calls: Array.from(accumulatedToolCalls.values()),
      },
      finish_reason: finalFinishReason,
    }],
    usage: finalUsage,
  }
})
```

---

## 🧪 测试用例设计

### 测试文件结构

```
src/server/module-gateway/__tests__/
├── scenarios/
│   ├── scenario-1-anthropic-openai-anthropic.test.ts
│   ├── scenario-2-openai-openai-openai.test.ts
│   ├── scenario-3-anthropic-anthropic-anthropic.test.ts
│   └── scenario-4-openai-anthropic-openai.test.ts
```

### 测试用例模板

```typescript
// scenario-1-anthropic-openai-anthropic.test.ts

import { describe, it, expect } from 'vitest';
import { GatewayController } from '../gateway-controller';

describe('Scenario 1: Anthropic → OpenAI → Anthropic', () => {
  describe('非流式', () => {
    it('应当正确转换 basic text response', async () => {
      // 1. 准备 Anthropic 格式请求
      const anthropicRequest = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      };

      // 2. 发送到 /v1/messages
      const response = await fetch('http://localhost:3000/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(anthropicRequest),
      });

      // 3. 验证响应格式是 Anthropic
      const data = await response.json();
      expect(data.type).toBe('message');
      expect(data.role).toBe('assistant');
      expect(Array.isArray(data.content)).toBe(true);

      // 4. 验证内容不丢失
      const textContent = data.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      expect(textContent).toBeTruthy();

      // 5. 验证 usage 正确映射
      expect(data.usage).toMatchObject({
        input_tokens: expect.any(Number),
        output_tokens: expect.any(Number),
      });
    });

    it('应当正确转换 tool_use response', async () => {
      const requestWithTools = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        tools: [{
          name: 'get_weather',
          description: 'Get weather info',
          input_schema: {
            type: 'object',
            properties: {
              city: { type: 'string' }
            }
          }
        }],
        messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
      };

      const response = await fetch('/v1/messages', {
        method: 'POST',
        body: JSON.stringify(requestWithTools),
      });

      const data = await response.json();

      // 验证 tool_use 块
      expect(data.content).toBeInstanceOf(Array);
      const toolUseBlock = data.content.find((b: any) => b.type === 'tool_use');
      expect(toolUseBlock).toBeDefined();
      expect(toolUseBlock.name).toBe('get_weather');
      expect(typeof toolUseBlock.input).toBe('object');  // ✅ 对象，不是 JSON 字符串
      expect(toolUseBlock.input).toHaveProperty('city');

      // 验证 id 格式
      expect(toolUseBlock.id).toMatch(/^[a-z0-9_]+$/);

      // 验证 stop_reason
      expect(data.stop_reason).toBe('tool_use');
    });
  });

  describe('流式', () => {
    it('应当正确累积 text chunks', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        stream: true,
        messages: [{ role: 'user', content: 'Say "Hello World"' }],
      };

      const response = await fetch('/v1/messages', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      // 验证 Content-Type
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      // 收集所有 chunks
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const chunks: any[] = [];

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.substring(6));
            chunks.push(data);
          }
        }
      }

      // 验证 chunk 结构
      expect(chunks.length).toBeGreaterThan(0);

      // 验证 message_start
      expect(chunks[0].type).toBe('message_start');

      // 验证 content_block_delta
      const contentDeltas = chunks.filter((c: any) => c.type === 'content_block_delta');
      expect(contentDeltas.length).toBeGreaterThan(0);

      // 验证 message_delta (finish)
      const messageDeltas = chunks.filter((c: any) => c.type === 'message_delta');
      expect(messageDeltas.length).toBeGreaterThan(0);
      expect(messageDeltas[0].delta.stop_reason).toBeTruthy();

      // 验证 message_stop
      expect(chunks[chunks.length - 1].type).toBe('message_stop');
    });

    it('应当正确累积 tool_use chunks', async () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        stream: true,
        tools: [{
          name: 'get_weather',
          description: 'Get weather',
          input_schema: {
            type: 'object',
            properties: { city: { type: 'string' } }
          }
        }],
        messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
      };

      const response = await fetch('/v1/messages', {
        method: 'POST',
        body: JSON.stringify(request),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const chunks: any[] = [];

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        const text = decoder.decode(value);
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            chunks.push(JSON.parse(line.substring(6)));
          }
        }
      }

      // 验证 content_block_start (tool_use)
      const toolUseStarts = chunks.filter((c: any) =>
        c.type === 'content_block_start' &&
        c.content_block?.type === 'tool_use'
      );
      expect(toolUseStarts.length).toBeGreaterThan(0);

      // 验证 content_block_delta (input_json_delta)
      const jsonDeltas = chunks.filter((c: any) =>
        c.type === 'content_block_delta' &&
        c.delta?.type === 'input_json_delta'
      );
      expect(jsonDeltas.length).toBeGreaterThan(0);

      // 累积完整的 tool_use input
      let fullInput = '';
      for (const delta of jsonDeltas) {
        fullInput += delta.delta.partial_json;
      }

      // 验证累积结果是有效的 JSON
      expect(() => JSON.parse(fullInput)).not.toThrow();
      const parsedInput = JSON.parse(fullInput);
      expect(parsedInput).toHaveProperty('city');
    });
  });
});
```

---

## 📝 验证清单

### 场景 1: Anthropic → OpenAI → Anthropic

- [ ] **非流式 - Basic**
  - [ ] text content 正确返回
  - [ ] usage 正确映射 (input_tokens/output_tokens)
  - [ ] stop_reason 正确 (end_turn/stop_sequence/tool_use)

- [ ] **非流式 - Tool Use**
  - [ ] content 数组包含 tool_use 块
  - [ ] tool_use.input 是对象 (不是 JSON 字符串)
  - [ ] tool_use.id 格式正确
  - [ ] tool_use.name 正确

- [ ] **流式 - Text**
  - [ ] message_start 事件正确
  - [ ] content_block_delta 正确累积
  - [ ] message_delta 包含 stop_reason
  - [ ] message_stop 事件存在
  - [ ] originalResponse 包含完整 SSE 数据

- [ ] **流式 - Tool Use**
  - [ ] content_block_start (tool_use) 正确
  - [ ] input_json_delta 正确累积
  - [ ] 最终 input 是有效 JSON
  - [ ] tool_use id 和 name 正确

### 场景 2: OpenAI → OpenAI → OpenAI

- [ ] **非流式**
  - [ ] choices[] 结构保留
  - [ ] tool_calls[] 正确
  - [ ] finish_reason 映射正确
  - [ ] usage 正确 (prompt_tokens/completion_tokens)

- [ ] **流式**
  - [ ] delta.content 正确累积
  - [ ] delta.tool_calls 正确累积
  - [ ] 最终 tool_calls 完整
  - [ ] finish_reason 在最后的 chunk

### 场景 3: Anthropic → Anthropic → Anthropic

- [ ] **非流式**
  - [ ] system 字段正确处理
  - [ ] tool_result 嵌入在 user message
  - [ ] content 数组结构保留

- [ ] **流式**
  - [ ] SSE 事件格式正确
  - [ ] content block 累积正确

### 场景 4: OpenAI → Anthropic → OpenAI

- [ ] **非流式**
  - [ ] 工具格式转换正确
  - [ ] content 字符串正确

- [ ] **流式**
  - [ ] 跨厂商累积正确
  - [ ] tool_calls 累积不丢失

---

## 🔧 实施步骤

### Step 1: 修复流式 originalResponse (本周)

```bash
# 修改 gateway-controller.ts
# 添加 rawSSEChunks 收集逻辑

# 测试验证
npm test -- scenario-1
```

### Step 2: 创建测试用例 (本周)

```bash
# 创建测试文件
mkdir -p src/server/module-gateway/__tests__/scenarios

# 使用模板创建 4 个场景测试
# scenario-1-anthropic-openai-anthropic.test.ts
# scenario-2-openai-openai-openai.test.ts
# scenario-3-anthropic-anthropic-anthropic.test.ts
# scenario-4-openai-anthropic-openai.test.ts
```

### Step 3: 运行测试验证 (下周)

```bash
# 运行所有场景测试
npm test -- src/server/module-gateway/__tests__/scenarios/

# 生成覆盖率报告
npm test -- --coverage
```

### Step 4: 修复发现的问题 (下周)

根据测试结果修复发现的数据丢失或格式问题。

---

## 📊 成功标准

### 功能标准

- ✅ 所有 8 个测试用例通过
- ✅ 流式响应的 originalResponse 包含完整数据
- ✅ tool_calls 在所有场景下正确往返
- ✅ usage 字段在所有场景下正确映射

### 性能标准

- ✅ 非流式响应 < 2s (P99)
- ✅ 流式首字节 < 500ms (P99)
- ✅ 流式 chunk 间隔 < 100ms (P99)

### 质量标准

- ✅ 测试覆盖率 > 90%
- ✅ 零数据丢失
- ✅ 零格式错误

---

**文档版本**: v1.0
**创建日期**: 2026-01-07
**负责人**: Backend Team
