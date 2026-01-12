/**
 * Anthropic Streaming Conversion Tests
 *
 * Tests SSE stream chunk conversion between Anthropic and OpenAI formats.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicConverter } from '../anthropic.converter';

describe('AnthropicConverter - Streaming Conversion', () => {
  let converter: AnthropicConverter;

  beforeEach(() => {
    converter = new AnthropicConverter();
  });

  describe('Anthropic -> Internal (convertStreamChunkToInternal)', () => {
    it('should convert message_start event', () => {
      const anthropicChunk = JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          usage: {
            input_tokens: 10,
            output_tokens: 0,
          },
        },
      });

      const result = converter.convertStreamChunkToInternal(anthropicChunk);

      expect(result.success).toBe(true);
      expect(result.data! as any).toHaveProperty('id', 'msg_123');
      expect(result.data! as any).toHaveProperty('object', 'chat.completion.chunk');
      expect(result.data! as any).toHaveProperty('model', 'claude-3-5-sonnet-20241022');
      expect(result.data! as any).toHaveProperty('created');
      expect((result.data! as any).choices).toHaveLength(1);
      expect((result.data! as any).choices?.[0].delta).toEqual({ role: 'assistant' });
      expect((result.data! as any).choices?.[0].finishReason).toBeNull();
      expect(result.metadata!?.fieldsConverted).toBeGreaterThan(0);
    });

    it('should convert content_block_start event for text', () => {
      const anthropicChunk = JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      });

      const result = converter.convertStreamChunkToInternal(anthropicChunk);

      expect(result.success).toBe(true);
      // content_block_start doesn't emit content, just initializes state
      expect(result.metadata).toBeDefined();
    });

    it('should convert content_block_delta event for text (after message_start)', () => {
      // First initialize stream state with message_start
      const messageStart = JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      });
      converter.convertStreamChunkToInternal(messageStart);

      // Now test content_block_delta
      const anthropicChunk = JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Hello, world!',
        },
      });

      const result = converter.convertStreamChunkToInternal(anthropicChunk);

      expect(result.success).toBe(true);
      expect(result.data! as any).toHaveProperty('choices');
      expect((result.data! as any).choices).toHaveLength(1);
      expect((result.data! as any).choices?.[0].delta.content).toBe('Hello, world!');
      expect((result.data! as any).choices?.[0].finishReason).toBeNull();
    });

    it('should convert message_delta event with stop_reason (after message_start)', () => {
      // First initialize stream state
      const messageStart = JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      });
      converter.convertStreamChunkToInternal(messageStart);

      // Now test message_delta
      const anthropicChunk = JSON.stringify({
        type: 'message_delta',
        delta: {
          stop_reason: 'end_turn',
        },
        usage: {
          output_tokens: 15,
        },
      });

      const result = converter.convertStreamChunkToInternal(anthropicChunk);

      expect(result.success).toBe(true);
      expect((result.data! as any).choices).toHaveLength(1);
      expect((result.data! as any).choices?.[0].finishReason).toBe('stop'); // end_turn -> stop
      expect(result.data! as any).toHaveProperty('usage');
      expect((result.data! as any).usage?.completionTokens).toBe(15);
    });

    it('should convert message_stop event (after message_start)', () => {
      // First initialize stream state
      const messageStart = JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        },
      });
      converter.convertStreamChunkToInternal(messageStart);

      // Now test message_stop
      const anthropicChunk = JSON.stringify({
        type: 'message_stop',
      });

      const result = converter.convertStreamChunkToInternal(anthropicChunk);

      expect(result.success).toBe(true);
      // ✅ FIX: message_stop now returns empty chunk to preserve finishReason from message_delta
      // This prevents overwriting 'tool_calls' with 'stop'
      expect(result.data! as any).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
    });

    it('should handle ping event without error', () => {
      const anthropicChunk = JSON.stringify({
        type: 'ping',
      });

      const result = converter.convertStreamChunkToInternal(anthropicChunk);

      expect(result.success).toBe(true);
      // Ping events should be marked as empty to be filtered out
      expect(result.data! as any).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
    });

    it('should handle content_block_stop event', () => {
      const anthropicChunk = JSON.stringify({
        type: 'content_block_stop',
        index: 0,
      });

      const result = converter.convertStreamChunkToInternal(anthropicChunk);

      expect(result.success).toBe(true);
      // content_block_stop should be marked as empty to be filtered out
      expect(result.data! as any).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidChunk = 'not valid json';

      const result = converter.convertStreamChunkToInternal(invalidChunk);

      expect(result.success).toBe(true);
      // Invalid JSON should be marked as empty to be filtered out
      expect(result.data! as any).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
    });

    it('should handle missing type field', () => {
      const invalidChunk = JSON.stringify({
        foo: 'bar',
      });

      const result = converter.convertStreamChunkToInternal(invalidChunk);

      expect(result.success).toBe(true);
      // Events without type field should be marked as empty to be filtered out
      expect(result.data! as any).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
    });
  });

  describe('Internal -> Anthropic (convertStreamChunkFromInternal)', () => {
    it('should convert first chunk with role to message_start', () => {
      const internalChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'claude-3-5-sonnet-20241022',
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finishReason: null,
        }],
      };

      const result = converter.convertStreamChunkFromInternal(internalChunk as any);

      expect(result.success).toBe(true);
      expect(typeof result.data! as any).toBe('string');
      const sse = result.data! as any as string;
      expect(sse).toContain('event: message_start');
      expect(sse).toContain('"type":"message_start"');  // No space after colon
      expect(sse).toContain('"id":"chatcmpl-123"');
      expect(sse).toContain('"role":"assistant"');
    });

    it('should convert content delta to content_block_delta', () => {
      const internalChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'claude-3-5-sonnet-20241022',
        choices: [{
          index: 0,
          delta: { content: 'Hello' },
          finishReason: null,
        }],
      };

      const result = converter.convertStreamChunkFromInternal(internalChunk as any);

      expect(result.success).toBe(true);
      const sse = result.data! as any as string;
      expect(sse).toContain('event: content_block_start');
      expect(sse).toContain('event: content_block_delta');
      expect(sse).toContain('"text":"Hello"');
    });

    it('should convert finish_reason to message_delta and message_stop', () => {
      const internalChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'claude-3-5-sonnet-20241022',
        choices: [{
          index: 0,
          delta: {},
          finishReason: 'stop',
        }],
      };

      const result = converter.convertStreamChunkFromInternal(internalChunk as any);

      expect(result.success).toBe(true);
      const sse = result.data! as any as string;
      expect(sse).toContain('event: message_delta');
      expect(sse).toContain('"stop_reason":"end_turn"'); // stop -> end_turn
      expect(sse).toContain('event: message_stop');
    });

    it('should map finish_reason: length to max_tokens', () => {
      const internalChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'claude-3-5-sonnet-20241022',
        choices: [{
          index: 0,
          delta: {},
          finishReason: 'length',
        }],
      };

      const result = converter.convertStreamChunkFromInternal(internalChunk as any);

      expect(result.success).toBe(true);
      const sse = result.data! as any as string;
      expect(sse).toContain('"stop_reason":"max_tokens"');
    });

    it('should map finish_reason: tool_calls to tool_use', () => {
      const internalChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'claude-3-5-sonnet-20241022',
        choices: [{
          index: 0,
          delta: {},
          finishReason: 'tool_calls',
        }],
      };

      const result = converter.convertStreamChunkFromInternal(internalChunk as any);

      expect(result.success).toBe(true);
      const sse = result.data! as any as string;
      expect(sse).toContain('"stop_reason":"tool_use"');
    });
  });

  describe('Round-trip Conversion', () => {
    it('should maintain data integrity through round-trip', () => {
      // Simulate a stream of Anthropic events
      const events = [
        { type: 'message_start', message: { id: 'msg_123', model: 'claude-3', role: 'assistant', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '!' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
        { type: 'message_stop' },
      ];

      // Convert Anthropic -> Internal
      const internalChunks: any[] = [];
      for (const event of events) {
        const result = converter.convertStreamChunkToInternal(JSON.stringify(event));
        if (result.success && Object.keys(result.data! as any).length > 0) {
          internalChunks.push(result.data! as any);
        }
      }

      // Verify we got content chunks
      const contentChunks = internalChunks.filter(c => c.choices?.[0]?.delta?.content);
      expect(contentChunks.length).toBeGreaterThanOrEqual(1);
      expect(contentChunks[0].choices?.[0].delta.content).toBe('Hello');

      // Verify we got finish_reason
      const finalChunks = internalChunks.filter(c => c.choices?.[0]?.finishReason);
      expect(finalChunks.length).toBeGreaterThanOrEqual(1);
      expect(finalChunks[0].choices?.[0].finishReason).toBe('stop');
    });
  });
});
