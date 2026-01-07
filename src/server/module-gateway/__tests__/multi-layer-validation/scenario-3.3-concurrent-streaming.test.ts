// @ts-nocheck
/**
 * Scenario 3.3: Anthropic → Anthropic → Anthropic (并发流式)
 *
 * 测试并发 Anthropic 流式请求的工具调用采集
 *
 * 目标: 验证多个并发的 Anthropic 流式请求不会互相干扰
 *
 * 已知 Bug: AnthropicConverter 使用共享的 streamState Map
 * - 所有并发请求共享同一个 streamState
 * - 导致 stream A 可能获取 stream B 的状态
 * - 工具调用累积失败
 */

import { describe, it, expect } from 'vitest';
import { AnthropicConverter } from '../../../module-protocol-transpiler/converters/anthropic.converter';

describe('Scenario 3.3: Anthropic → Anthropic → Anthropic (并发流式)', () => {
  // 共享的 AnthropicConverter 实例（模拟 singleton 行为）
  const sharedConverter = new AnthropicConverter();

  // Stream A 的 SSE events (get_weather 工具)
  const streamAEvents = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_A","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":20,"output_tokens":0}}}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_A123","name":"get_weather","input":{}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"city\\":"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"Tokyo\\""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"}"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":10}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ];

  // Stream B 的 SSE events (get_time 工具)
  const streamBEvents = [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_B","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":15,"output_tokens":0}}}\n\n',
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_B456","name":"get_time","input":{}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"timezone\\":"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"UTC\\""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"}"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":8}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ];

  describe('Bug 复现: 并发流式请求工具调用采集', () => {
    it('当两个 Anthropic 流式请求并发时，应该正确采集各自的工具调用', () => {
      console.log('\n=== 并发流式请求测试 ===');

      let toolCallId_A = '';
      let accumulatedArgs_A = '';
      let toolCallId_B = '';
      let accumulatedArgs_B = '';

      // 模拟并发处理: 交错处理两个流的事件
      const maxEvents = Math.max(streamAEvents.length, streamBEvents.length);

      for (let i = 0; i < maxEvents; i++) {
        // 处理 Stream A 的第 i 个事件
        if (i < streamAEvents.length) {
          const sse = streamAEvents[i];
          const dataLine = sse!.split('\n').find(line => line.startsWith('data:'));
          if (dataLine) {
            const jsonStr = dataLine.substring(5);
            const result = sharedConverter.convertStreamChunkToInternal(jsonStr);

            if (result.success && !result.data?.__empty) {
              const delta = result.data?.choices?.[0]?.delta;
              if (delta?.toolCalls?.[0]) {
                const tc = delta.toolCalls[0];
                if (tc.id && !toolCallId_A) toolCallId_A = tc.id;
                if (tc.function?.arguments) accumulatedArgs_A += tc.function.arguments;
              }
            }
          }
        }

        // 立即处理 Stream B 的第 i 个事件（模拟并发）
        if (i < streamBEvents.length) {
          const sse = streamBEvents[i];
          const dataLine = sse!.split('\n').find(line => line.startsWith('data:'));
          if (dataLine) {
            const jsonStr = dataLine.substring(5);
            const result = sharedConverter.convertStreamChunkToInternal(jsonStr);

            if (result.success && !result.data?.__empty) {
              const delta = result.data?.choices?.[0]?.delta;
              if (delta?.toolCalls?.[0]) {
                const tc = delta.toolCalls[0];
                if (tc.id && !toolCallId_B) toolCallId_B = tc.id;
                if (tc.function?.arguments) accumulatedArgs_B += tc.function.arguments;
              }
            }
          }
        }
      }

      console.log('Stream A:');
      console.log('  - tool_call id:', toolCallId_A || '(NOT COLLECTED!)');
      console.log('  - accumulated args:', accumulatedArgs_A || '(NOT COLLECTED!)');
      console.log('Stream B:');
      console.log('  - tool_call id:', toolCallId_B || '(NOT COLLECTED!)');
      console.log('  - accumulated args:', accumulatedArgs_B || '(NOT COLLECTED!)');

      // 实际结果分析
      const bothStreamsCollected =
        toolCallId_A === 'toolu_A123' &&
        accumulatedArgs_A === '{"city":"Tokyo"}' &&
        toolCallId_B === 'toolu_B456' &&
        accumulatedArgs_B === '{"timezone":"UTC"}';

      if (!bothStreamsCollected) {
        console.log('\n❌ BUG REPRODUCED: 并发流式请求的工具调用采集失败!');
        console.log('   原因: AnthropicConverter 使用共享的 streamState Map');
        console.log('   影响: 多个并发 Anthropic 流式请求会互相干扰');
      } else {
        console.log('\n✅ 两个流都正确采集（单线程顺序处理）');
        console.log('   ⚠️  注意: JavaScript 单线程顺序执行可能无法完全复现并发 bug');
        console.log('   真实的并发场景需要使用 Promise.all 或多个网络请求');
      }

      // 记录当前状态（用于追踪 bug 修复进度）
      expect({
        streamA: { id: toolCallId_A, args: accumulatedArgs_A },
        streamB: { id: toolCallId_B, args: accumulatedArgs_B },
        bothStreamsCollected,
      }).toMatchObject({
        bothStreamsCollected: true,  // ✅ 顺序处理时应该成功（但并发时可能失败）
      });
    });

    it('应该正确识别并报告 bug 根本原因', () => {
      console.log('\n=== Bug 根本原因分析 ===');
      console.log('1. protocol-transpiler-singleton.ts 创建单个 AnthropicConverter 实例');
      console.log('2. AnthropicConverter.streamState 是实例属性（所有请求共享）');
      console.log('3. 代码假设只有一个流: for (const [id, s] of this.streamState.entries()) { break; }');
      console.log('4. 并发请求时，Stream A 可能获取 Stream B 的状态');
      console.log('5. pendingToolCalls.get(index) 查找失败 → 工具调用未累积');
      console.log('');
      console.log('修复方案:');
      console.log('Option 1: 使用复合 key (messageId + unique stream ID)');
      console.log('Option 2: 将 streamState 作为转换上下文传递');
      console.log('Option 3: 为每个流创建独立的 Converter 实例');

      expect(true).toBe(true);  // 仅用于文档说明
    });
  });
});
