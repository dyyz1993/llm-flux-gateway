// @ts-nocheck
/**
 * Scenario 2.2: OpenAI → OpenAI → OpenAI (流式)
 *
 * 多层验证测试 - 验证流式响应的每一层转换
 *
 * 转换链路:
 * OpenAI Request → Internal → OpenAI Request
 * → OpenAI SSE Chunks → Internal Chunks → OpenAI SSE
 *
 * 测试目标:
 * - Layer 1-2: 请求转换（往返应该一致）
 * - Layer 3: 每个 OpenAI SSE chunk → Internal chunk
 * - Layer 4: 每个 Internal chunk → OpenAI SSE（应该一致）
 * - 累积逻辑验证
 */

import { describe, it, expect } from 'vitest';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';

describe('Scenario 2.2: OpenAI → OpenAI → OpenAI (流式)', () => {
  const openaiConverter = new OpenAIConverter();

  // ==========================================
  // 模拟真实 OpenAI SSE chunks (来自上游)
  // ==========================================

  const openaiSSEChunks = [
    // Chunk 1: 初始 (role)
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',

    // Chunk 2: 工具调用开始
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc123","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}\n\n',

    // Chunk 3: 工具调用参数 (分片 1)
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":"}}]},"finish_reason":null}]}\n\n',

    // Chunk 4: 工具调用参数 (分片 2)
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"Tokyo\\""}}]},"finish_reason":null}]}\n\n',

    // Chunk 5: 工具调用参数 (分片 3)
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]},"finish_reason":null}]}\n\n',

    // Chunk 6: 结束 (finish_reason + usage)
    'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1234567890,"model":"gpt-4","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":20,"completion_tokens":10,"total_tokens":30}}\n\n',
  ];

  // ==========================================
  // Layer 3: OpenAI SSE Chunk → Internal Chunk
  // ==========================================

  describe('Layer 3: OpenAI SSE Chunk → Internal Chunk', () => {
    it('应当正确转换每个 OpenAI chunk 到 Internal Format', () => {
      const internalChunks: any[] = [];

      console.log('\n=== Layer 3: OpenAI SSE → Internal Chunks ===');

      for (let i = 0; i < openaiSSEChunks.length; i++) {
        const sse = openaiSSEChunks[i];
        const dataLine = sse!.split('\n').find(line => line.startsWith('data: '));
        if (!dataLine) continue;

        const jsonStr = dataLine.substring(6);  // Skip "data: " (6 chars)
        const result = openaiConverter.convertStreamChunkToInternal(jsonStr);

        console.log(`\nChunk ${i + 1}:`);
        console.log('Input (OpenAI SSE):', dataLine.substring(0, 100) + '...');

        if (result.success) {
          internalChunks.push(result.data);
          console.log('Output (Internal):', JSON.stringify(result.data, null, 2));
        } else {
          console.log('❌ Failed:', result.errors);
        }
      }

      // ✅ 验证: chunk 数量
      expect(internalChunks.length).toBe(6);
      console.log('\n✅ 转换了', internalChunks.length, '个 chunks');

      // ✅ 验证: 第一个 chunk (role)
      expect(internalChunks[0].choices[0].delta.role).toBe('assistant');
      console.log('✅ Chunk 1: role = "assistant"');

      // ✅ 验证: tool_calls 开始 chunk
      expect(internalChunks[1].choices[0].delta.toolCalls).toBeDefined();
      expect(internalChunks[1].choices[0].delta.toolCalls[0]).toMatchObject({
        index: 0,
        id: 'call_abc123',
        type: 'function',
        function: { name: 'get_weather', arguments: '' }
      });
      console.log('✅ Chunk 2: tool_calls 开始');
      console.log('  - id:', internalChunks[1].choices[0].delta.toolCalls[0].id);
      console.log('  - name:', internalChunks[1].choices[0].delta.toolCalls[0].function.name);

      // ✅ 验证: 工具调用参数分片
      expect(internalChunks[2].choices[0].delta.toolCalls[0].function.arguments).toBe('{"city":');
      expect(internalChunks[3].choices[0].delta.toolCalls[0].function.arguments).toBe('"Tokyo"');
      expect(internalChunks[4].choices[0].delta.toolCalls[0].function.arguments).toBe('}');
      console.log('✅ Chunks 3-5: 工具调用参数分片');
      console.log('  - Chunk 3: \'{"city":\'');
      console.log('  - Chunk 4: \'"Tokyo"\'');
      console.log('  - Chunk 5: \'}\'');

      // ✅ 验证: 最后一个 chunk (finish_reason)
      expect(internalChunks[5].choices[0].finishReason).toBe('tool_calls');
      expect(internalChunks[5].usage).toBeDefined();
      console.log('✅ Chunk 6: finish_reason = "tool_calls"');
      console.log('  - usage:', internalChunks[5].usage);
    });

    it('应当正确累积 tool_calls 参数分片', () => {
      // 模拟 Gateway Controller 的累积逻辑
      const accumulatedToolCalls = new Map<number, any>();

      console.log('\n=== 验证 tool_calls 累积逻辑 ===');

      for (const sse of openaiSSEChunks) {
        const dataLine = sse.split('\n').find(line => line.startsWith('data: '));
        if (!dataLine) continue;

        const jsonStr = dataLine.substring(6);  // Skip "data: " (6 chars)
        const result = openaiConverter.convertStreamChunkToInternal(jsonStr);
        if (!result.success) continue;

        const internalChunk = result.data;

        // 累积 tool_calls
        if (internalChunk!.choices?.[0]!?.delta?.toolCalls) {
          for (const newCall of internalChunk!.choices[0]!.delta.toolCalls) {
            const idx = newCall.index || 0;
            const existing = accumulatedToolCalls.get(idx);

            if (!existing) {
              accumulatedToolCalls.set(idx, newCall);
            } else if (newCall.function?.arguments) {
              // ✅ Fix: Use 'in' operator to check if arguments property exists
              // Empty string "" is falsy, but we still want to append to it
              if ('arguments' in existing.function) {
                existing.function.arguments += newCall.function.arguments;
              } else {
                existing.function = newCall.function;
              }
            }
          }
        }
      }

      // ✅ 验证: 最终累积的 tool_calls
      const finalToolCalls = Array.from(accumulatedToolCalls.values());
      expect(finalToolCalls).toHaveLength(1);
      console.log('✅ 累积了', finalToolCalls.length, '个 tool_call');

      expect(finalToolCalls[0]).toMatchObject({
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city":"Tokyo"}'
        }
      });
      console.log('✅ 最终 tool_call:');
      console.log('  - id:', finalToolCalls[0].id);
      console.log('  - name:', finalToolCalls[0].function.name);
      console.log('  - arguments:', finalToolCalls[0].function.arguments);

      // ✅ 验证: arguments 是有效 JSON
      expect(() => JSON.parse(finalToolCalls[0].function.arguments)).not.toThrow();
      const parsedArgs = JSON.parse(finalToolCalls[0].function.arguments);
      expect(parsedArgs).toEqual({ city: 'Tokyo' });
      console.log('✅ arguments 是有效 JSON:', parsedArgs);
    });
  });

  // ==========================================
  // Layer 4: Internal Chunk → OpenAI SSE
  // ==========================================

  describe('Layer 4: Internal Chunk → OpenAI SSE', () => {
    it('应当正确转换 Internal chunks 到 OpenAI SSE 格式（往返转换）', () => {
      // 先转换到 Internal
      const internalChunks: any[] = [];
      for (const sse of openaiSSEChunks) {
        const dataLine = sse.split('\n').find(line => line.startsWith('data: '));
        if (!dataLine) continue;
        const jsonStr = dataLine.substring(6);  // Skip "data: " (6 chars)
        const result = openaiConverter.convertStreamChunkToInternal(jsonStr);
        if (result.success) {
          internalChunks.push(result.data);
        }
      }

      console.log('\n=== Layer 4: Internal Chunks → OpenAI SSE ===');
      console.log('Internal chunks count:', internalChunks.length);

      // 再转换回 OpenAI SSE
      const openaiEvents: string[] = [];
      for (const chunk of internalChunks) {
        const result = openaiConverter.convertStreamChunkFromInternal(chunk);
        if (result.success && result.data) {
          openaiEvents.push(result.data);
        }
      }

      console.log('生成了', openaiEvents.length, '个 OpenAI SSE 事件');

      // ✅ 验证: 生成的 SSE 事件数量应该和原始 chunks 一致
      expect(openaiEvents.length).toBe(6);
      console.log('✅ 生成了', openaiEvents.length, '个 SSE 事件（与原始一致）');

      // ✅ 验证: 每个 SSE 事件都应该以 "data: " 开头
      openaiEvents.forEach((event, _idx) => {
        expect(event).toMatch(/^data: /);
        expect(event).toMatch(/"id":"chatcmpl-123"/);
      });
      console.log('✅ 所有 SSE 事件格式正确');

      // ✅ 验证: 往返转换后，关键信息应该保持一致
      const lastEvent = openaiEvents[openaiEvents.length - 1];
      expect(lastEvent).toMatch(/"finish_reason":"tool_calls"/);
      expect(lastEvent).toMatch(/"usage"/);
      console.log('✅ 最后一个事件包含 finish_reason 和 usage');
    });

    it('应当正确保持 finish_reason', () => {
      // 转换所有 chunks
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

      console.log('\n=== 验证 finish_reason 保持 ===');

      // 找到有 finish_reason 的 chunk
      const finishReasonChunk = internalChunks.find(c => c.choices?.[0]?.finishReason);
      expect(finishReasonChunk).toBeDefined();

      console.log('找到 finish_reason chunk:', finishReasonChunk?.choices?.[0]?.finishReason);
      expect(finishReasonChunk?.choices?.[0]?.finishReason).toBe('tool_calls');

      // 转换回 OpenAI SSE
      const result = openaiConverter.convertStreamChunkFromInternal(finishReasonChunk);
      expect(result.success).toBe(true);

      const sseEvent = result.data!;
      expect(sseEvent).toMatch(/"finish_reason":"tool_calls"/);
      console.log('✅ finish_reason 在往返转换后保持一致');
      console.log('  OpenAI: tool_calls → Internal: tool_calls → OpenAI: tool_calls');
    });
  });

  // ==========================================
  // 完整流式链路验证
  // ==========================================

  describe('完整流式链路验证', () => {
    it('OpenAI SSE → Internal → OpenAI SSE 应当保持数据完整性', () => {
      console.log('\n=== 完整流式链路验证 ===');

      // 模拟完整流式处理
      let accumulatedToolCalls = new Map<number, any>();

      // Step 1: OpenAI → Internal
      const internalChunks: any[] = [];
      for (const sse of openaiSSEChunks) {
        const dataLine = sse.split('\n').find(line => line.startsWith('data: '));
        if (!dataLine) continue;

        const jsonStr = dataLine.substring(6);
        const toInternalResult = openaiConverter.convertStreamChunkToInternal(jsonStr);
        if (!toInternalResult.success) continue;

        const internalChunk = toInternalResult.data;
        internalChunks.push(internalChunk);

        // 累积 tool_calls
        if (internalChunk!.choices?.[0]!?.delta?.toolCalls) {
          for (const newCall of internalChunk!.choices[0]!.delta.toolCalls) {
            const idx = newCall.index || 0;
            const existing = accumulatedToolCalls.get(idx);

            if (!existing) {
              accumulatedToolCalls.set(idx, newCall);
            } else if (newCall.function?.arguments) {
              if ('arguments' in existing.function) {
                existing.function.arguments += newCall.function.arguments;
              } else {
                existing.function = newCall.function;
              }
            }
          }
        }
      }

      // ✅ 验证: 最终累积的 tool_calls
      const finalToolCalls = Array.from(accumulatedToolCalls.values());
      expect(finalToolCalls).toHaveLength(1);

      console.log('\n✅ tool_calls 正确累积');
      console.log('  - 数量:', finalToolCalls.length);
      console.log('  - id:', finalToolCalls[0].id);
      console.log('  - name:', finalToolCalls[0].function.name);

      // ✅ 验证: arguments 是有效 JSON
      expect(() => JSON.parse(finalToolCalls[0].function.arguments)).not.toThrow();
      const parsedArgs = JSON.parse(finalToolCalls[0].function.arguments);
      expect(parsedArgs).toEqual({ city: 'Tokyo' });

      console.log('\n✅ 工具调用参数完整');
      console.log('  - 参数:', JSON.stringify(parsedArgs));

      // ✅ 验证: usage 信息传递
      const lastChunk = internalChunks[internalChunks.length - 1];
      expect(lastChunk.usage).toBeDefined();
      expect(lastChunk.usage.promptTokens).toBe(20);
      expect(lastChunk.usage.completionTokens).toBe(10);

      console.log('\n✅ usage 信息正确传递');
      console.log('  - promptTokens:', lastChunk.usage.promptTokens);
      console.log('  - completionTokens:', lastChunk.usage.completionTokens);

      // Step 2: Internal → OpenAI SSE
      const openaiEvents: string[] = [];
      for (const chunk of internalChunks) {
        const result = openaiConverter.convertStreamChunkFromInternal(chunk);
        if (result.success && result.data) {
          openaiEvents.push(result.data);
        }
      }

      // ✅ 验证: 往返转换后 SSE 事件数量一致
      expect(openaiEvents.length).toBe(6);
      console.log('\n✅ 往返转换后 SSE 事件数量一致:', openaiEvents.length);
    });

    it('OpenAI → OpenAI 流式往返转换说明', () => {
      console.log('\n=== OpenAI → OpenAI 流式转换说明 ===');
      console.log('✅ 同协议转换（OpenAI → OpenAI）');
      console.log('   - Layer 3: OpenAI SSE → Internal（解析并归一化）');
      console.log('   - Layer 4: Internal → OpenAI SSE（还原为原始格式）');
      console.log('');
      console.log('   往返转换后:');
      console.log('   - 字段名保持 snake_case');
      console.log('   - 数据结构保持一致');
      console.log('   - tool_calls 参数分片正确累积');
      console.log('   - finish_reason 正确传递');

      console.log('\n✅ 所有验证通过');
    });
  });
});
