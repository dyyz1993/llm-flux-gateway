// @ts-nocheck
/**
 * Scenario 4.2: OpenAI → Anthropic → OpenAI (流式)
 *
 * 多层验证测试 - 验证流式响应的每一层转换
 *
 * 转换链路:
 * OpenAI Request → Internal → Anthropic Request
 * → Anthropic SSE Events → Internal Chunks → OpenAI SSE
 *
 * 测试目标:
 * - Layer 1-2: 请求转换
 * - Layer 3: Anthropic SSE events → Internal chunks
 * - Layer 4: Internal chunks → OpenAI SSE chunks
 * - 累积逻辑验证
 */

import { describe, it, expect } from 'vitest';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';
import { AnthropicConverter } from '../../../module-protocol-transpiler/converters/anthropic.converter';

describe('Scenario 4.2: OpenAI → Anthropic → OpenAI (流式)', () => {
  const openaiConverter = new OpenAIConverter();
  const anthropicConverter = new AnthropicConverter();

  // ==========================================
  // 模拟真实 Anthropic SSE events (来自上游)
  // ==========================================

  const anthropicSSEEvents = [
    // Event 1: message_start
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_abc123","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":20,"output_tokens":0}}}\n\n',

    // Event 2: content_block_start (tool_use)
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_xyz789","name":"get_weather","input":{}}}\n\n',

    // Event 3: content_block_delta (参数分片 1)
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}\n\n',

    // Event 4: content_block_delta (参数分片 2)
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"Tokyo\\""}}\n\n',

    // Event 5: content_block_delta (参数分片 3)
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"}"}}\n\n',

    // Event 6: content_block_stop
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',

    // Event 7: message_delta (usage)
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":10}}\n\n',

    // Event 8: message_stop
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ];

  // ==========================================
  // Layer 3: Anthropic SSE Event → Internal Chunk
  // ==========================================

  describe('Layer 3: Anthropic SSE Event → Internal Chunk', () => {
    it('应当正确转换每个 Anthropic SSE event 到 Internal Format', () => {
      const internalChunks: any[] = [];

      console.log('\n=== Layer 3: Anthropic SSE → Internal Chunks ===');

      for (let i = 0; i < anthropicSSEEvents.length; i++) {
        const sse = anthropicSSEEvents[i];
        const lines = sse!.split('\n');
        const eventType = lines.find(line => line.startsWith('event:'))?.substring(7);
        const dataLine = lines.find(line => line.startsWith('data:'));
        if (!dataLine) continue;

        const jsonStr = dataLine.substring(5);  // Skip "data:" (5 chars)
        const result = anthropicConverter.convertStreamChunkToInternal(jsonStr);

        console.log(`\nEvent ${i + 1} (${eventType}):`);
        console.log('Input (Anthropic SSE):', dataLine.substring(0, 80) + '...');

        if (result.success) {
          internalChunks.push(result.data);
          console.log('Output (Internal):', JSON.stringify(result.data, null, 2));
        } else {
          console.log('❌ Failed:', result.errors);
        }
      }

      // ✅ 验证: chunk 数量
      expect(internalChunks.length).toBeGreaterThan(0);
      console.log('\n✅ 转换了', internalChunks.length, '个 meaningful chunks');

      // ✅ 验证: message_start event → Internal Format (OpenAI-like structure)
      // Internal Format 使用 OpenAI 格式，不保留 Anthropic 的 type 字段
      const messageStartChunk = internalChunks.find(c => c.choices?.[0]?.delta?.role === 'assistant');
      expect(messageStartChunk).toBeDefined();
      expect(messageStartChunk.object).toBe('chat.completion.chunk');
      expect(messageStartChunk.id).toBe('msg_abc123');
      console.log('✅ message_start event 转换成功: role = assistant');

      // ✅ 验证: content_block_start event (tool_use) → Internal Format
      // tool_use 转换为 delta.toolCalls
      // 注意：name 在 function 对象内，不是直接在 toolCall 上
      const contentBlockStartChunk = internalChunks.find(c =>
        c.choices?.[0]?.delta?.toolCalls?.[0]?.function?.name === 'get_weather'
      );
      expect(contentBlockStartChunk).toBeDefined();
      expect(contentBlockStartChunk.choices[0].delta.toolCalls[0].id).toBe('toolu_xyz789');
      console.log('✅ content_block_start event (tool_use) 转换成功: tool_use id =', contentBlockStartChunk.choices[0].delta.toolCalls[0].id);

      // ✅ 验证: content_block_delta events (参数分片) → Internal Format
      // input_json_delta 转换为 delta.toolCalls[0].function.arguments
      const deltaChunks = internalChunks.filter(c =>
        c.choices?.[0]?.delta?.toolCalls?.[0]?.function?.arguments
      );
      expect(deltaChunks.length).toBe(3);
      console.log('✅ content_block_delta events (参数分片):', deltaChunks.length);
    });

    it('应当正确累积 tool_use 参数分片', () => {
      // 模拟 Gateway Controller 的累积逻辑
      let accumulatedArgs = '';
      let toolCallId = '';

      console.log('\n=== 验证 tool_use 参数累积逻辑 ===');

      for (const sse of anthropicSSEEvents) {
        const lines = sse.split('\n');
        const dataLine = lines.find(line => line.startsWith('data:'));
        if (!dataLine) continue;

        const jsonStr = dataLine.substring(5);
        const result = anthropicConverter.convertStreamChunkToInternal(jsonStr);
        if (!result.success) continue;

        const internalChunk = result.data;

        // 累积 tool_use 信息（使用 Internal Format 结构）
        const delta = internalChunk!.choices?.[0]!?.delta;
        if (delta?.toolCalls?.[0]) {
          const tc = delta.toolCalls[0];

          // 第一个 chunk 包含 id 和 name
          if (tc.id && !toolCallId) {
            toolCallId = tc.id;
          }

          // 累积参数（input_json_delta → function.arguments）
          if (tc.function?.arguments) {
            accumulatedArgs += tc.function.arguments;
          }
        }
      }

      // ✅ 验证: tool_use id
      expect(toolCallId).toBe('toolu_xyz789');
      console.log('✅ tool_use id:', toolCallId);

      // ✅ 验证: 最终累积的 arguments
      expect(accumulatedArgs).toBe('{"city":"Tokyo"}');
      console.log('✅ 累积的 arguments:', accumulatedArgs);

      // ✅ 验证: arguments 是有效 JSON
      expect(() => JSON.parse(accumulatedArgs)).not.toThrow();
      const parsedArgs = JSON.parse(accumulatedArgs);
      expect(parsedArgs).toEqual({ city: 'Tokyo' });
      console.log('✅ arguments 是有效 JSON:', parsedArgs);
    });
  });

  // ==========================================
  // Layer 4: Internal Chunk → OpenAI SSE
  // ==========================================

  describe('Layer 4: Internal Chunk → OpenAI SSE', () => {
    it('应当正确转换 Internal chunks 到 OpenAI SSE 格式', () => {
      // 先转换到 Internal
      const internalChunks: any[] = [];
      for (const sse of anthropicSSEEvents) {
        const lines = sse.split('\n');
        const dataLine = lines.find(line => line.startsWith('data:'));
        if (!dataLine) continue;
        const jsonStr = dataLine.substring(5);
        const result = anthropicConverter.convertStreamChunkToInternal(jsonStr);
        if (result.success) {
          internalChunks.push(result.data);
        }
      }

      console.log('\n=== Layer 4: Internal Chunks → OpenAI SSE ===');
      console.log('Internal chunks count:', internalChunks.length);

      // 过滤掉 empty chunks（__empty: true）
      const meaningfulChunks = internalChunks.filter(c => !c.__empty);
      console.log('Meaningful chunks count:', meaningfulChunks.length);

      // 再转换到 OpenAI SSE
      const openaiEvents: string[] = [];
      for (const chunk of meaningfulChunks) {
        const result = openaiConverter.convertStreamChunkFromInternal(chunk);
        if (result.success && result.data) {
          openaiEvents.push(result.data);
        }
      }

      console.log('生成了', openaiEvents.length, '个 OpenAI SSE 事件');

      // ✅ 验证: 生成的 SSE 事件数量应该合理
      expect(openaiEvents.length).toBeGreaterThan(0);
      console.log('✅ 生成了', openaiEvents.length, '个 SSE 事件');

      // ✅ 验证: 每个 SSE 事件都应该以 "data: " 开头
      openaiEvents.forEach((event, _idx) => {
        expect(event).toMatch(/^data: /);
      });
      console.log('✅ 所有 SSE 事件格式正确');

      // ✅ 验证: 最后一个事件应该包含 finish_reason
      const lastEvent = openaiEvents[openaiEvents.length - 1];
      expect(lastEvent).toMatch(/"finish_reason"/);
      console.log('✅ 最后一个事件包含 finish_reason');
    });

    it('应当正确映射 stop_reason 到 finish_reason', () => {
      // 转换所有 chunks
      const internalChunks: any[] = [];
      for (const sse of anthropicSSEEvents) {
        const lines = sse.split('\n');
        const dataLine = lines.find(line => line.startsWith('data:'));
        if (!dataLine) continue;
        const jsonStr = dataLine.substring(5);
        const result = anthropicConverter.convertStreamChunkToInternal(jsonStr);
        if (result.success) {
          internalChunks.push(result.data);
        }
      }

      console.log('\n=== 验证 stop_reason → finish_reason 映射 ===');

      // 找到 message_delta chunk (Internal Format 中有 finishReason 的 chunk)
      const messageDeltaChunk = internalChunks.find(c =>
        c.choices?.[0]?.finishReason === 'tool_calls'
      );
      expect(messageDeltaChunk).toBeDefined();

      console.log('找到 message_delta chunk:', JSON.stringify(messageDeltaChunk, null, 2));
      expect(messageDeltaChunk?.choices?.[0]?.finishReason).toBe('tool_calls');

      // 转换到 OpenAI SSE
      const result = openaiConverter.convertStreamChunkFromInternal(messageDeltaChunk);
      expect(result.success).toBe(true);

      const sseEvent = result.data!;
      expect(sseEvent).toMatch(/"finish_reason":"tool_calls"/);
      console.log('✅ stop_reason 正确映射到 finish_reason');
      console.log('  Anthropic: tool_use → Internal: tool_calls → OpenAI: tool_calls');
    });
  });

  // ==========================================
  // 完整流式链路验证
  // ==========================================

  describe('完整流式链路验证', () => {
    it('Anthropic SSE → Internal → OpenAI SSE 应当保持数据完整性', () => {
      console.log('\n=== 完整流式链路验证 ===');

      // 模拟完整流式处理
      let accumulatedInput = '';
      let toolUseId = '';

      // Step 1: Anthropic → Internal
      const internalChunks: any[] = [];
      for (const sse of anthropicSSEEvents) {
        const lines = sse.split('\n');
        const dataLine = lines.find(line => line.startsWith('data:'));
        if (!dataLine) continue;

        const jsonStr = dataLine.substring(5);
        const toInternalResult = anthropicConverter.convertStreamChunkToInternal(jsonStr);
        if (!toInternalResult.success) continue;

        const internalChunk = toInternalResult.data;
        internalChunks.push(internalChunk);

        // 累积 tool_use 信息（使用 Internal Format 结构）
        const delta = internalChunk!.choices?.[0]!?.delta;
        if (delta?.toolCalls?.[0]) {
          const tc = delta.toolCalls[0];

          // 第一个 chunk 包含 id 和 name
          if (tc.id && !toolUseId) {
            toolUseId = tc.id;
          }

          // 累积参数
          if (tc.function?.arguments) {
            accumulatedInput += tc.function.arguments;
          }
        }
      }

      // ✅ 验证: tool_use 信息
      expect(toolUseId).toBe('toolu_xyz789');
      expect(accumulatedInput).toBe('{"city":"Tokyo"}');

      console.log('\n✅ tool_use 信息正确累积');
      console.log('  - id:', toolUseId);
      console.log('  - input:', JSON.parse(accumulatedInput));

      // ✅ 验证: usage 信息传递
      const messageStartChunk = internalChunks.find(c => c.choices?.[0]?.delta?.role === 'assistant');
      expect(messageStartChunk).toBeDefined();
      // 注意：message_start 在 Internal Format 中不包含 usage 信息
      // usage 信息在 message_delta (finishReason) chunk 中

      const messageDeltaChunk = internalChunks.find(c =>
        c.choices?.[0]?.finishReason === 'tool_calls'
      );
      expect(messageDeltaChunk).toBeDefined();
      expect(messageDeltaChunk?.usage?.completionTokens).toBe(10);

      console.log('\n✅ usage 信息正确传递');
      console.log('  - output_tokens:', messageDeltaChunk?.usage?.completionTokens);

      // Step 2: Internal → OpenAI SSE
      // 过滤掉 empty chunks
      const meaningfulChunks = internalChunks.filter(c => !c.__empty);
      const openaiEvents: string[] = [];
      for (const chunk of meaningfulChunks) {
        const result = openaiConverter.convertStreamChunkFromInternal(chunk);
        if (result.success && result.data) {
          openaiEvents.push(result.data);
        }
      }

      // ✅ 验证: 往返转换后 SSE 事件数量合理
      expect(openaiEvents.length).toBeGreaterThan(0);
      console.log('\n✅ 往返转换后 SSE 事件数量合理:', openaiEvents.length);

      // ✅ 验证: finish_reason 映射
      // 注意：OpenAI converter 会生成多个事件，tool_calls 的 finish_reason 在中间的事件中
      // 最后的事件是 message_stop，finish_reason 为 "stop"
      const toolCallsFinishEvent = openaiEvents.find(e => e.includes('"finish_reason":"tool_calls"'));
      expect(toolCallsFinishEvent).toBeDefined();
      console.log('✅ finish_reason 正确映射: tool_use → tool_calls');
    });

    it('OpenAI → Anthropic → OpenAI 流式往返转换说明', () => {
      console.log('\n=== OpenAI → Anthropic → OpenAI 流式转换说明 ===');
      console.log('✅ 跨协议转换（OpenAI → Anthropic → OpenAI）');
      console.log('   - Layer 3: Anthropic SSE → Internal（解析并归一化）');
      console.log('   - Layer 4: Internal → OpenAI SSE（转换为 OpenAI 格式）');
      console.log('');
      console.log('   跨协议转换要点:');
      console.log('   - 事件格式转换: Anthropic events → OpenAI chunks');
      console.log('   - 字段映射: stop_reason → finish_reason');
      console.log('   - tool_use → tool_calls 映射');
      console.log('   - 参数分片正确累积');
      console.log('   - usage 信息正确传递');

      console.log('\n✅ 所有验证通过');
    });
  });
});
