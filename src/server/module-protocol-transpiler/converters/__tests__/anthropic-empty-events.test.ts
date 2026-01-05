/**
 * Anthropic Empty Event Filtering Tests
 *
 * Tests that empty Anthropic SSE events (ping, content_block_stop, etc.)
 * are correctly marked with __empty: true to be filtered out.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicConverter } from '../anthropic.converter';

describe('AnthropicConverter - Empty Event Filtering', () => {
  let converter: AnthropicConverter;

  beforeEach(() => {
    converter = new AnthropicConverter();
  });

  describe('Ping Event', () => {
    it('should mark ping event as empty', () => {
      const pingEvent = JSON.stringify({
        type: 'ping',
      });

      const result = converter.convertStreamChunkToInternal(pingEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Content Block Stop Event', () => {
    it('should mark content_block_stop event as empty', () => {
      const contentBlockStopEvent = JSON.stringify({
        type: 'content_block_stop',
        index: 0,
      });

      const result = converter.convertStreamChunkToInternal(contentBlockStopEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Unknown Event Types', () => {
    it('should mark unknown event types as empty', () => {
      const unknownEvent = JSON.stringify({
        type: 'unknown_event_type',
        data: 'some data',
      });

      const result = converter.convertStreamChunkToInternal(unknownEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Parse Errors', () => {
    it('should mark invalid JSON as empty', () => {
      const invalidJson = 'this is not valid json';

      const result = converter.convertStreamChunkToInternal(invalidJson);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Missing Event Type', () => {
    it('should mark events without type field as empty', () => {
      const noTypeEvent = JSON.stringify({
        data: 'some data',
        index: 0,
      });

      const result = converter.convertStreamChunkToInternal(noTypeEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Message Stop Without State', () => {
    it('should mark message_stop event without stream state as empty', () => {
      // Send message_stop without initializing stream state
      const messageStopEvent = JSON.stringify({
        type: 'message_stop',
      });

      const result = converter.convertStreamChunkToInternal(messageStopEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Message Start Without Message Data', () => {
    it('should mark message_start event without message data as empty', () => {
      const messageStartNoMessage = JSON.stringify({
        type: 'message_start',
      });

      const result = converter.convertStreamChunkToInternal(messageStartNoMessage);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Content Block Start Without Data', () => {
    it('should mark content_block_start without content_block as empty', () => {
      const noContentBlockEvent = JSON.stringify({
        type: 'content_block_start',
        index: 0,
      });

      const result = converter.convertStreamChunkToInternal(noContentBlockEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Content Block Start Without State', () => {
    it('should mark content_block_start without stream state as empty', () => {
      const contentBlockStartEvent = JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'text',
          text: '',
        },
      });

      const result = converter.convertStreamChunkToInternal(contentBlockStartEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Content Block Delta Without Delta Data', () => {
    it('should mark content_block_delta without delta as empty', () => {
      const noDeltaEvent = JSON.stringify({
        type: 'content_block_delta',
        index: 0,
      });

      const result = converter.convertStreamChunkToInternal(noDeltaEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Content Block Delta Without State', () => {
    it('should mark content_block_delta without stream state as empty', () => {
      const contentBlockDeltaEvent = JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Hello',
        },
      });

      const result = converter.convertStreamChunkToInternal(contentBlockDeltaEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Message Delta Without State', () => {
    it('should mark message_delta without stream state as empty', () => {
      const messageDeltaEvent = JSON.stringify({
        type: 'message_delta',
        delta: {
          stop_reason: 'end_turn',
        },
        usage: {
          output_tokens: 10,
        },
      });

      const result = converter.convertStreamChunkToInternal(messageDeltaEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Message Delta Without Stop Reason', () => {
    it('should mark message_delta without stop_reason as empty', () => {
      // First initialize stream state
      const messageStartEvent = JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
        },
      });
      converter.convertStreamChunkToInternal(messageStartEvent);

      // Now send message_delta without stop_reason
      const messageDeltaNoStopEvent = JSON.stringify({
        type: 'message_delta',
        delta: {},
        usage: {
          output_tokens: 5,
        },
      });

      const result = converter.convertStreamChunkToInternal(messageDeltaNoStopEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Non-Tool Content Block Start', () => {
    it('should mark non-tool_use content_block_start as empty (e.g., thinking block)', () => {
      // First initialize stream state
      const messageStartEvent = JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
        },
      });
      converter.convertStreamChunkToInternal(messageStartEvent);

      // Now send content_block_start for thinking block
      const thinkingBlockStartEvent = JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'thinking',
          thinking: '',
        },
      });

      const result = converter.convertStreamChunkToInternal(thinkingBlockStartEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Unknown Delta Type', () => {
    it('should mark content_block_delta with unknown delta type as empty', () => {
      // First initialize stream state
      const messageStartEvent = JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
        },
      });
      converter.convertStreamChunkToInternal(messageStartEvent);

      // Now send content_block_delta with unknown delta type
      const unknownDeltaEvent = JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'unknown_delta_type',
          data: 'some data',
        },
      });

      const result = converter.convertStreamChunkToInternal(unknownDeltaEvent);

      expect(result.success).toBe(true);
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
      expect(result.metadata!?.fieldsConverted).toBe(0);
    });
  });

  describe('Valid Events Should Not Be Empty', () => {
    it('should NOT mark valid message_start as empty', () => {
      const messageStartEvent = JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
        },
      });

      const result = converter.convertStreamChunkToInternal(messageStartEvent);

      expect(result.success).toBe(true);
      expect(result.data!).not.toHaveProperty('__empty');
      expect(result.data!).toHaveProperty('id', 'msg_123');
      expect(result.data!).toHaveProperty('object', 'chat.completion.chunk');
      expect(result.metadata!?.fieldsConverted).toBeGreaterThan(0);
    });

    it('should NOT mark valid content_block_delta with text as empty', () => {
      // First initialize stream state
      const messageStartEvent = JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: null,
        },
      });
      converter.convertStreamChunkToInternal(messageStartEvent);

      // Now send valid content_block_delta
      const contentBlockDeltaEvent = JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Hello, world!',
        },
      });

      const result = converter.convertStreamChunkToInternal(contentBlockDeltaEvent);

      expect(result.success).toBe(true);
      expect(result.data!).not.toHaveProperty('__empty');
      expect(result.data!).toHaveProperty('choices');
      expect((result.data!.choices as any)?.[0].delta.content).toBe('Hello, world!');
      expect((result.metadata! as any)?.fieldsConverted).toBeGreaterThan(0);
    });
  });
});
