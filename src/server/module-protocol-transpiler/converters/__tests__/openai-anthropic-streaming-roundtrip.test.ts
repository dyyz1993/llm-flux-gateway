/**
 * OpenAI ↔ Anthropic Streaming Round-Trip Tests
 *
 * 测试 OpenAI 格式（GLM 使用此格式）与 Anthropic 格式之间的双向流式转换。
 *
 * 协议对比：
 * | 特征 | Anthropic Claude | OpenAI | GLM（智谱AI） |
 * |------|------------------|--------|---------------|
 * | 协议 | SSE，事件驱动 | SSE，`data: [JSON]` | SSE，`data: [JSON]` |
 * | 起始标记 | `message_start` 事件 | 第一帧含`role`的`delta` | 第一帧含`role`的`delta` |
 * | 内容增量 | `content_block_delta` 事件 | `choices[0].delta.content` | `choices[0].delta.content` |
 * | content类型 | 数组（支持多内容块） | 字符串 | 字符串 |
 * | 结束标记 | `message_stop` 事件 | `finish_reason` | `finish_reason` |
 * | 结束原因字段 | `stop_reason` | `finish_reason` | `finish_reason` |
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIConverter } from '../openai.converter';
import { AnthropicConverter } from '../anthropic.converter';
import type { InternalStreamChunk } from '../../interfaces/internal-format';

describe('OpenAI ↔ Anthropic Streaming Round-Trip', () => {
  let openaiConverter: OpenAIConverter;
  let anthropicConverter: AnthropicConverter;

  beforeEach(() => {
    openaiConverter = new OpenAIConverter();
    anthropicConverter = new AnthropicConverter();
  });

  describe('Text Content Streaming: OpenAI → Anthropic', () => {
    it('should convert OpenAI text streaming to standard Anthropic SSE format', () => {
      const openaiChunks: Array<any> = [
        // Chunk 1: role
        {
          id: 'chatcmpl-001',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          }],
        },
        // Chunk 2: content "Hello"
        {
          id: 'chatcmpl-001',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: { content: 'Hello' },
            finish_reason: null,
          }],
        },
        // Chunk 3: content " World"
        {
          id: 'chatcmpl-001',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: { content: ' World' },
            finish_reason: null,
          }],
        },
        // Chunk 4: finish_reason = stop
        {
          id: 'chatcmpl-001',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
        },
      ];

      const anthropicEvents: string[] = [];
      for (const chunk of openaiChunks) {
        const toInternalResult = openaiConverter.convertStreamChunkToInternal(JSON.stringify(chunk));
        expect(toInternalResult.success).toBe(true);

        const internalChunk = toInternalResult.data! as InternalStreamChunk;
        if (Object.keys(internalChunk).length === 0) continue;

        const fromInternalResult = anthropicConverter.convertStreamChunkFromInternal(internalChunk);
        expect(fromInternalResult.success).toBe(true);

        const sseData = fromInternalResult.data!;
        anthropicEvents.push(sseData);
      }

      const fullOutput = anthropicEvents.join('\n');

      // 验证标准 Anthropic SSE 事件序列
      expect(fullOutput).toContain('event: message_start');
      expect(fullOutput).toContain('event: content_block_start');
      expect(fullOutput).toContain('event: content_block_delta');
      expect(fullOutput).toContain('event: content_block_stop');
      expect(fullOutput).toContain('event: message_delta');
      expect(fullOutput).toContain('event: message_stop');

      // 验证内容
      expect(fullOutput).toContain('"text":"Hello"');
      expect(fullOutput).toContain('"text":" World"');

      // 验证 stop_reason 映射: stop → end_turn
      expect(fullOutput).toContain('"stop_reason":"end_turn"');

      // 验证 id 和 model 在 message_start 中
      expect(fullOutput).toContain('"id":"chatcmpl-001"');
      expect(fullOutput).toContain('"model":"glm-4-air"');
    });

    it('should emit content_block_stop for each content block', () => {
      const openaiChunks = [
        {
          id: 'chatcmpl-stop-test',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          }],
        },
        {
          id: 'chatcmpl-stop-test',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: { content: 'Test' },
            finish_reason: null,
          }],
        },
        {
          id: 'chatcmpl-stop-test',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
        },
      ];

      const anthropicEvents: string[] = [];
      for (const chunk of openaiChunks) {
        const toInternalResult = openaiConverter.convertStreamChunkToInternal(JSON.stringify(chunk));
        expect(toInternalResult.success).toBe(true);

        const internalChunk = toInternalResult.data! as InternalStreamChunk;
        if (Object.keys(internalChunk).length === 0) continue;

        const fromInternalResult = anthropicConverter.convertStreamChunkFromInternal(internalChunk);
        expect(fromInternalResult.success).toBe(true);

        const sseData = fromInternalResult.data!;
        anthropicEvents.push(sseData);
      }

      const fullOutput = anthropicEvents.join('\n');

      // 验证 content_block_stop 在 content_block_delta 之后，message_delta 之前
      const blockStartIndex = fullOutput.indexOf('content_block_start');
      const deltaStartIndex = fullOutput.indexOf('content_block_delta');
      const stopIndex = fullOutput.indexOf('content_block_stop');
      const messageDeltaIndex = fullOutput.indexOf('message_delta');

      expect(blockStartIndex).toBeGreaterThanOrEqual(0);
      expect(deltaStartIndex).toBeGreaterThan(blockStartIndex);
      expect(stopIndex).toBeGreaterThan(deltaStartIndex);
      expect(messageDeltaIndex).toBeGreaterThan(stopIndex);

      // 验证 content_block_stop 的格式
      expect(fullOutput).toContain('"type":"content_block_stop"');
      expect(fullOutput).toContain('"index":0');
    });
  });

  describe('Tool Calls Streaming: OpenAI → Anthropic', () => {
    it('should convert OpenAI tool_calls streaming to Anthropic tool_use blocks', () => {
      const openaiToolChunks: Array<any> = [
        // Chunk 1: role
        {
          id: 'chatcmpl-tool-001',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          }],
        },
        // Chunk 2: tool_calls start (id and name)
        {
          id: 'chatcmpl-tool-001',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_abc123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '',
                },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 3: tool_calls arguments delta 1
        {
          id: 'chatcmpl-tool-001',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: {
                  arguments: '{"city"',
                },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 4: tool_calls arguments delta 2
        {
          id: 'chatcmpl-tool-001',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: {
                  arguments: ':"San Francisco"}',
                },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 5: finish_reason = tool_calls
        {
          id: 'chatcmpl-tool-001',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'tool_calls',
          }],
        },
      ];

      const anthropicEvents: string[] = [];
      for (const chunk of openaiToolChunks) {
        const toInternalResult = openaiConverter.convertStreamChunkToInternal(JSON.stringify(chunk));
        expect(toInternalResult.success).toBe(true);

        const internalChunk = toInternalResult.data! as InternalStreamChunk;
        if (Object.keys(internalChunk).length === 0) continue;

        const fromInternalResult = anthropicConverter.convertStreamChunkFromInternal(internalChunk);
        expect(fromInternalResult.success).toBe(true);

        const sseData = fromInternalResult.data!;
        anthropicEvents.push(sseData);
      }

      const fullOutput = anthropicEvents.join('\n');

      // 验证标准 Anthropic SSE 事件序列
      expect(fullOutput).toContain('event: message_start');
      expect(fullOutput).toContain('event: content_block_start');
      expect(fullOutput).toContain('event: content_block_delta');
      expect(fullOutput).toContain('event: content_block_stop');
      expect(fullOutput).toContain('event: message_delta');
      expect(fullOutput).toContain('event: message_stop');

      // 验证 tool_use 块
      expect(fullOutput).toContain('"type":"tool_use"');
      expect(fullOutput).toContain('"name":"get_weather"');
      expect(fullOutput).toContain('"id":"call_abc123"');

      // 验证参数增量
      expect(fullOutput).toContain('"partial_json":"{\\"city\\""');
      // 第二个参数增量是 ":\"San Francisco\"}"
      expect(fullOutput).toContain('"partial_json":":\\"San Francisco\\"}"');

      // 验证 stop_reason 映射: tool_calls → tool_use
      expect(fullOutput).toContain('"stop_reason":"tool_use"');
    });

    it('should emit content_block_stop for tool_use blocks', () => {
      const openaiChunks = [
        {
          id: 'chatcmpl-tool-stop',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          }],
        },
        {
          id: 'chatcmpl-tool-stop',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_xyz',
                type: 'function',
                function: { name: 'test_func', arguments: '' },
              }],
            },
            finish_reason: null,
          }],
        },
        {
          id: 'chatcmpl-tool-stop',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: { tool_calls: [{ index: 0, function: { arguments: '{}' } }] },
            finish_reason: 'tool_calls',
          }],
        },
      ];

      const anthropicEvents: string[] = [];
      for (const chunk of openaiChunks) {
        const toInternalResult = openaiConverter.convertStreamChunkToInternal(JSON.stringify(chunk));
        expect(toInternalResult.success).toBe(true);

        const internalChunk = toInternalResult.data! as InternalStreamChunk;
        if (Object.keys(internalChunk).length === 0) continue;

        const fromInternalResult = anthropicConverter.convertStreamChunkFromInternal(internalChunk);
        expect(fromInternalResult.success).toBe(true);

        const sseData = fromInternalResult.data!;
        anthropicEvents.push(sseData);
      }

      const fullOutput = anthropicEvents.join('\n');

      // 验证 tool_use 的 content_block_stop
      expect(fullOutput).toContain('"type":"content_block_stop"');
      expect(fullOutput).toContain('"index":0');
    });
  });

  describe('Finish Reason Mapping', () => {
    const finishReasonCases = [
      { openai: 'stop', anthropic: 'end_turn' },
      { openai: 'length', anthropic: 'max_tokens' },
      { openai: 'tool_calls', anthropic: 'tool_use' },
      { openai: 'content_filter', anthropic: 'stop_sequence' },
    ];

    finishReasonCases.forEach(({ openai, anthropic }) => {
      it(`should map finish_reason: ${openai} → stop_reason: ${anthropic}`, () => {
        const openaiChunk = {
          id: 'chatcmpl-finish-test',
          object: 'chat.completion.chunk',
          created: 1694268190,
          model: 'glm-4-air',
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: openai,
          }],
        };

        const toInternalResult = openaiConverter.convertStreamChunkToInternal(JSON.stringify(openaiChunk));
        expect(toInternalResult.success).toBe(true);
        const internalChunk = toInternalResult.data!;

        expect(internalChunk.choices[0]!.finishReason).toBe(openai);

        const toAnthropicResult = anthropicConverter.convertStreamChunkFromInternal(internalChunk);
        expect(toAnthropicResult.success).toBe(true);
        const anthropicSSE = toAnthropicResult.data!;

        expect(anthropicSSE).toContain(`"stop_reason":"${anthropic}"`);
      });
    });
  });

  describe('Field-by-Field Validation: OpenAI → Anthropic', () => {
    it('should preserve all standard OpenAI streaming fields', () => {
      const openaiChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1694268190,
        model: 'glm-4-plus',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            content: 'Hello',
          },
          finish_reason: null,
        }],
      };

      const toInternalResult = openaiConverter.convertStreamChunkToInternal(JSON.stringify(openaiChunk));
      const internalChunk = toInternalResult.data! as InternalStreamChunk;

      expect(internalChunk.id).toBe('chatcmpl-123');
      expect(internalChunk.object).toBe('chat.completion.chunk');
      expect(internalChunk.created).toBe(1694268190);
      expect(internalChunk.model).toBe('glm-4-plus');
      expect(internalChunk.choices).toHaveLength(1);
      expect(internalChunk.choices[0]!.index).toBe(0);
      expect(internalChunk.choices[0]!.delta.role).toBe('assistant');
      expect(internalChunk.choices[0]!.delta.content).toBe('Hello');
      expect(internalChunk.choices[0]!.finishReason).toBe(null);
    });

    it('should include id and model in message_start event', () => {
      const openaiChunk = {
        id: 'test-id-123',
        object: 'chat.completion.chunk',
        created: 1694268190,
        model: 'test-model',
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null,
        }],
      };

      const toInternalResult = openaiConverter.convertStreamChunkToInternal(JSON.stringify(openaiChunk));
      const internalChunk = toInternalResult.data! as InternalStreamChunk;

      const toAnthropicResult = anthropicConverter.convertStreamChunkFromInternal(internalChunk);
      const anthropicSSE = toAnthropicResult.data!;

      expect(anthropicSSE).toContain('"id":"test-id-123"');
      expect(anthropicSSE).toContain('"model":"test-model"');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content chunks', () => {
      const emptyChunk = {
        id: 'chatcmpl-empty',
        object: 'chat.completion.chunk',
        created: 1694268190,
        model: 'glm-4-air',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: null,
        }],
      };

      const result = openaiConverter.convertStreamChunkToInternal(JSON.stringify(emptyChunk));
      expect(result.success).toBe(true);
      const internalChunk = result.data! as InternalStreamChunk;
      expect(internalChunk).toBeDefined();
    });

    it('should handle null finish_reason', () => {
      const nullFinishChunk = {
        id: 'chatcmpl-null',
        object: 'chat.completion.chunk',
        created: 1694268190,
        model: 'glm-4-air',
        choices: [{
          index: 0,
          delta: { content: 'test' },
          finish_reason: null,
        }],
      };

      const toInternalResult = openaiConverter.convertStreamChunkToInternal(JSON.stringify(nullFinishChunk));
      expect(toInternalResult.success).toBe(true);
      const internalChunk = toInternalResult.data! as InternalStreamChunk;

      expect(internalChunk.choices[0]!.finishReason).toBe(null);
    });
  });
});
