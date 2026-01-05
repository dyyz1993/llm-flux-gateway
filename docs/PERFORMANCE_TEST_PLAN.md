# SSE 解析器性能测试方案

## 测试目标

验证解析器的：
1. ✅ 流式特性 - 不阻塞返回
2. ✅ 背压处理 - 内存不爆炸
3. ✅ 性能开销 - 延迟最小
4. ✅ 工具调用 - 正确解析

---

## 测试 1: 端到端延迟测试

### 目的
验证从上游发送到客户端接收的总延迟

### 测试代码

```typescript
// src/server/module-gateway/services/parsers/__tests__/latency.test.ts

import { describe, it, expect } from 'vitest';
import { AnthropicSSEParser } from '../anthropic-sse-parser';

describe('SSE Parser - Latency Test', () => {
  it('should yield chunks with minimal latency', async () => {
    const parser = new AnthropicSSEParser();

    // 模拟 SSE 流
    const mockStream = createMockStream([
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n',
    ]);

    const latencies: number[] = [];
    const startTime = Date.now();

    for await (const chunk of parser.parse(mockStream)) {
      const latency = Date.now() - startTime;
      latencies.push(latency);
    }

    // 验证延迟
    console.log('Latencies:', latencies);

    // 第一个 chunk 延迟应该 <50ms
    expect(latencies[0]).toBeLessThan(50);

    // 后续 chunk 延迟应该 <10ms
    for (let i = 1; i < latencies.length; i++) {
      expect(latencies[i] - latencies[i - 1]).toBeLessThan(10);
    }
  });
});

function createMockStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
        await new Promise(resolve => setTimeout(resolve, 1)); // 模拟网络延迟
      }
      controller.close();
    },
  });
}
```

### 预期结果

| Chunk | 延迟 | 说明 |
|-------|------|------|
| 第一个 | <50ms | 包含初始化时间 |
| 后续 | <10ms/chunk | 纯解析时间 |

---

## 测试 2: 内存占用测试

### 目的
验证长响应的内存增长

### 测试代码

```typescript
describe('SSE Parser - Memory Test', () => {
  it('should not consume excessive memory for long responses', async () => {
    const parser = new AnthropicSSEParser();

    // 模拟 100K 字符的响应
    const events = [];
    events.push('event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":10,"output_tokens":0}}}\n\n');

    for (let i = 0; i < 1000; i++) {
      const text = 'a'.repeat(100); // 每次 100 字符
      events.push(`event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${text}"}}\n\n`);
    }

    events.push('event: message_stop\ndata: {"type":"message_stop"}\n\n');

    // 获取初始内存
    const memoryBefore = process.memoryUsage().heapUsed;

    // 解析流
    const mockStream = createMockStream(events);
    let chunkCount = 0;

    for await (const chunk of parser.parse(mockStream)) {
      chunkCount++;
    }

    // 获取结束内存
    const memoryAfter = process.memoryUsage().heapUsed;
    const memoryUsed = (memoryAfter - memoryBefore) / 1024 / 1024;

    console.log(`Memory used: ${memoryUsed.toFixed(2)}MB for ${chunkCount} chunks`);

    // 验证内存增长 <5MB
    expect(memoryUsed).toBeLessThan(5);
    expect(chunkCount).toBe(1000);
  });
});
```

### 预期结果

| 响应大小 | 内存增长 | 说明 |
|----------|----------|------|
| 10KB | <1MB | 只保存必要状态 |
| 100KB | <5MB | 累积文本 + Map |
| 1MB | <10MB | 仍然可控 |

---

## 测试 3: 背压处理测试

### 目的
验证慢速客户端不会导致内存爆炸

### 测试代码

```typescript
describe('SSE Parser - Backpressure Test', () => {
  it('should handle slow client without excessive memory', async () => {
    const parser = new AnthropicSSEParser();

    // 模拟 100 个 chunk
    const events = [];
    for (let i = 0; i < 100; i++) {
      events.push(`event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"chunk ${i} "}}\n\n`);
    }

    const mockStream = createMockStream(events);

    const memorySnapshots: number[] = [];
    let chunkCount = 0;

    // 模拟慢速消费（每 10ms 消费一个）
    for await (const chunk of parser.parse(mockStream)) {
      chunkCount++;

      // 每 10 个 chunk 记录一次内存
      if (chunkCount % 10 === 0) {
        memorySnapshots.push(process.memoryUsage().heapUsed);
      }

      // 模拟慢速消费
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // 计算内存增长
    const memoryGrowth = (memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0]) / 1024 / 1024;

    console.log(`Memory growth during slow consumption: ${memoryGrowth.toFixed(2)}MB`);
    console.log(`Total chunks processed: ${chunkCount}`);

    // 验证内存增长 <2MB（背压生效，不会积压）
    expect(memoryGrowth).toBeLessThan(2);
    expect(chunkCount).toBe(100);
  });
});
```

### 预期结果

| 场景 | 内存增长 | 说明 |
|------|----------|------|
| 快速消费 | <1MB | 正常状态 |
| 慢速消费 (10ms/chunk) | <2MB | 背压生效 |
| 极慢消费 (100ms/chunk) | <2MB | 背压生效，解析器暂停 |

---

## 测试 4: 工具调用测试

### 目的
验证工具调用的 JSON 拼接正确

### 测试代码

```typescript
describe('SSE Parser - Tool Call Test', () => {
  it('should correctly accumulate tool call arguments', async () => {
    const parser = new AnthropicSSEParser();

    // 模拟工具调用
    const events = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_123","model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":10,"output_tokens":0}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_123","name":"web_search","input":{}}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"query\\":"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"weather"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":" in SF"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"}"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];

    const mockStream = createMockStream(events);
    const chunks: any[] = [];

    for await (const chunk of parser.parse(mockStream)) {
      chunks.push(chunk);
    }

    // 提取工具调用 chunks
    const toolCallChunks = chunks.filter(c => c.choices[0].delta.tool_calls);

    console.log('Tool call chunks:', toolCallChunks.map(c => c.choices[0].delta.tool_calls));

    // 验证最后一个 chunk 有完整的 JSON
    const lastChunk = toolCallChunks[toolCallChunks.length - 1];
    const args = lastChunk.choices[0].delta.tool_calls[0].function.arguments;
    const parsedArgs = JSON.parse(args);

    expect(parsedArgs).toEqual({ query: 'weather in SF' });
  });
});
```

### 预期结果

| Chunk | arguments | 状态 |
|-------|-----------|------|
| 1 | `{"query":"` | ❌ 无效 JSON |
| 2 | `{"query":"weather` | ❌ 无效 JSON |
| 3 | `{"query":"weather in SF` | ❌ 无效 JSON |
| 4 | `{"query":"weather in SF"}` | ✅ 有效 JSON |

---

## 测试 5: 并发测试

### 目的
验证多个并发请求的性能

### 测试代码

```typescript
describe('SSE Parser - Concurrency Test', () => {
  it('should handle multiple concurrent requests', async () => {
    const concurrency = 10;
    const streams = Array.from({ length: concurrency }, (_, i) =>
      createMockStream([
        `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_${i}","model":"claude-3-5-sonnet-20241022","usage":{"input_tokens":10,"output_tokens":0}}}\n\n`,
        `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Response ${i}"}}\n\n`,
        `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
      ])
    );

    const startTime = Date.now();

    // 并发解析
    const parsers = streams.map(stream => {
      const parser = new AnthropicSSEParser();
      return (async () => {
        let chunks = 0;
        for await (const chunk of parser.parse(stream)) {
          chunks++;
        }
        return chunks;
      })();
    });

    const results = await Promise.all(parsers);
    const duration = Date.now() - startTime;

    console.log(`Processed ${concurrency} concurrent streams in ${duration}ms`);
    console.log('Chunks per stream:', results);

    // 验证所有流都成功解析
    results.forEach(chunks => {
      expect(chunks).toBeGreaterThan(0);
    });

    // 验证总延迟合理（<1s）
    expect(duration).toBeLessThan(1000);
  });
});
```

### 预期结果

| 并发数 | 总延迟 | 说明 |
|--------|--------|------|
| 1 | <100ms | 基准 |
| 10 | <500ms | 线性增长 |
| 100 | <2000ms | 仍然可控 |

---

## 测试 6: 真实场景测试

### 目的
使用真实的智谱 AI API 进行端到端测试

### 测试代码

```typescript
describe('SSE Parser - Real API Test', () => {
  it('should parse real Zhipu AI streaming response', async () => {
    // 跳过如果没有 API key
    if (!process.env.ZHIPU_API_KEY) {
      console.log('Skipping real API test (no ZHIPU_API_KEY)');
      return;
    }

    const response = await fetch('https://open.bigmodel.cn/api/anthropic/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ZHIPU_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'glm-4.7',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: 'Say "Hello, Zhipu AI!"',
        }],
        stream: true,
      }),
    });

    expect(response.ok).toBe(true);

    // 使用解析器解析真实响应
    const parser = new AnthropicSSEParser();
    let chunkCount = 0;
    let fullText = '';
    let firstChunkTime = 0;

    const startTime = Date.now();

    for await (const chunk of parser.parse(response.body!)) {
      if (chunkCount === 0) {
        firstChunkTime = Date.now() - startTime;
      }

      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullText += content;
      }

      chunkCount++;
    }

    console.log(`Real API test: ${chunkCount} chunks in ${Date.now() - startTime}ms`);
    console.log(`First chunk latency: ${firstChunkTime}ms`);
    console.log(`Full text: "${fullText}"`);

    // 验证
    expect(chunkCount).toBeGreaterThan(0);
    expect(firstChunkTime).toBeLessThan(500); // 第一个 chunk <500ms
    expect(fullText).toContain('Hello');
  });
});
```

### 预期结果

| 指标 | 预期值 | 说明 |
|------|--------|------|
| Chunk 数 | >5 | 至少有几个 text_delta |
| 第一个 chunk 延迟 | <500ms | 网络往返 + 初始化 |
| 总延迟 | <2s | 100 tokens 应该很快 |
| 文本内容 | 包含 "Hello" | 正确解析 |

---

## 运行测试

```bash
# 运行所有测试
npm test -- src/server/module-gateway/services/parsers/__tests__

# 运行特定测试
npm test -- src/server/module-gateway/services/parsers/__tests__/latency.test.ts

# 查看覆盖率
npm test -- --coverage src/server/module-gateway/services/parsers/
```

---

## 性能基准

### 目标性能

| 指标 | 目标 | 说明 |
|------|------|------|
| 解析延迟 | <10ms/chunk | 纯解析时间 |
| 首字节延迟 | <100ms | 网络往返 + 解析 |
| 内存占用 | <100KB | 稳定状态 |
| 背压处理 | 自动暂停 | 不积压数据 |
| 并发支持 | 100+ | 同时处理多个请求 |

### 与原生 OpenAI 对比

| 实现方式 | 延迟 | 内存 | 复杂度 |
|----------|------|------|--------|
| 直接转发（无解析） | 0ms | 0KB | 低 |
| 当前解析器 | <10ms | <100KB | 中 |
| 完整格式转换 | <20ms | <200KB | 高 |

---

## 总结

### ✅ 解析器的优点

1. **真正的流式** - 边解析边返回
2. **自动背压** - 内存安全
3. **低延迟** - <10ms 解析开销
4. **可扩展** - 易于添加新格式

### ⚠️ 需要注意

1. **工具调用格式** - 与 OpenAI 略有不同
2. **错误处理** - 当前只输出警告
3. **监控指标** - 缺少背压监控

### 🎯 后续优化

1. 添加性能监控
2. 改进错误处理
3. 考虑工具调用格式兼容性
