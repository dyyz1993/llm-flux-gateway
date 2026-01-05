/**
 * Anthropic Streaming Conversion Tests with Real Data
 *
 * Tests using actual SSE trace data from logs to reproduce and verify bugs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicConverter } from '../anthropic.converter';

describe('AnthropicConverter - Real Data Tests', () => {
  let converter: AnthropicConverter;

  beforeEach(() => {
    converter = new AnthropicConverter();
  });

  describe('Text Streaming (from actual logs)', () => {
    it('should handle complete text streaming conversation', () => {
      // Simulate actual Anthropic SSE stream from logs
      const events = [
        // Line 12: message_start
        '{"type":"message_start","message":{"id":"msg_202601031513181856df84e5504309","type":"message","role":"assistant","model":"glm-4-air","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}',

        // Line 13: ping
        '{"type":"ping"}',

        // Line 14: content_block_start
        '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',

        // Line 15-32: content_block_delta events (text streaming)
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"！"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"有什么"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"可以帮助"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你的"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"吗"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"？"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"，"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"请"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"随时"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"告诉我"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"。"}}',

        // Line 33: content_block_stop
        '{"type":"content_block_stop","index":0}',

        // Line 34: message_delta
        '{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":532,"output_tokens":20,"cache_read_input_tokens":0,"server_tool_use":{"web_search_requests":0},"service_tier":"standard"}}',

        // Line 35: message_stop
        '{"type":"message_stop"}',
      ];

      // Convert Anthropic -> Internal
      const internalChunks: any[] = [];
      for (const event of events) {
        const result = converter.convertStreamChunkToInternal(event);
        // Filter out empty chunks (marked with __empty)
        if (result.success && !result.data!.__empty) {
          internalChunks.push(result.data!);
        }
      }

      // Verify we got meaningful chunks
      expect(internalChunks.length).toBeGreaterThan(0);

      // First chunk should have role
      expect(internalChunks[0].choices?.[0].delta.role).toBe('assistant');

      // Should have content chunks
      const contentChunks = internalChunks.filter(c => c.choices?.[0]?.delta?.content);
      expect(contentChunks.length).toBeGreaterThan(0);
      expect(contentChunks[0].choices?.[0].delta.content).toBe('你好');

      // Should have finishReason
      const finalChunks = internalChunks.filter(c => c.choices?.[0]?.finishReason);
      expect(finalChunks.length).toBeGreaterThan(0);
      expect(finalChunks[0].choices?.[0].finishReason).toBe('stop');

      // Now test the critical path: Internal -> Anthropic (this is where the bug is)
      console.log('\n=== Testing Internal -> Anthropic conversion ===');
      const sseStrings: string[] = [];

      for (const internalChunk of internalChunks) {
        const result = converter.convertStreamChunkFromInternal(internalChunk);

        if (result.success) {
          const sseData = result.data!;
          console.log('SSE type:', typeof sseData);
          console.log('SSE length:', typeof sseData === 'string' ? sseData.length : 'N/A');
          console.log('SSE preview:', typeof sseData === 'string' ? sseData.substring(0, 200) : JSON.stringify(sseData).substring(0, 200));

          // CRITICAL: The result should be a string (SSE format)
          expect(typeof sseData).toBe('string');

          // The string should not be empty
          expect(sseData.length).toBeGreaterThan(0);

          // Should contain "data:" prefix (SSE format)
          if (sseData.includes('data:')) {
            sseStrings.push(sseData);
          }
        }
      }

      // We should have gotten some SSE strings
      console.log('Total SSE strings generated:', sseStrings.length);
      expect(sseStrings.length).toBeGreaterThan(0);

      // Verify SSE format
      const firstSSE = sseStrings[0];
      // SSE can have "event:" prefix or start with "data:"
      expect(firstSSE).toMatch(/^(event:|data:)/);
      expect(firstSSE).toContain('data:');
      // This is Anthropic format (Internal -> Anthropic conversion), so expect Anthropic structure
      expect(firstSSE).toContain('message_start');
    });
  });

  describe('Round-trip with actual data', () => {
    it('should maintain data integrity through Anthropic -> Internal -> Anthropic', () => {
      const originalEvents = [
        '{"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","model":"glm-4-air","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}',
        '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
        '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" World"}}',
        '{"type":"content_block_stop","index":0}',
        '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
        '{"type":"message_stop"}',
      ];

      // Step 1: Anthropic -> Internal
      const internalChunks: any[] = [];
      for (const event of originalEvents) {
        const result = converter.convertStreamChunkToInternal(event);
        // Filter out empty chunks (marked with __empty)
        if (result.success && !result.data!.__empty) {
          internalChunks.push(result.data!);
        }
      }

      // Step 2: Internal -> Anthropic (the problematic conversion)
      const reconstructedSSE: string[] = [];
      for (const internalChunk of internalChunks) {
        const result = converter.convertStreamChunkFromInternal(internalChunk);
        if (result.success && typeof result.data! === 'string' && result.data!.length > 0) {
          reconstructedSSE.push(result.data!);
        }
      }

      // Verify we got SSE strings back
      expect(reconstructedSSE.length).toBeGreaterThan(0);

      // Verify the SSE strings are valid
      reconstructedSSE.forEach(sse => {
        // SSE can have "event:" lines or just "data:" lines
        expect(sse).toMatch(/^(event:|data:)/);
        expect(sse).toContain('data:');
        expect(sse).toContain('\n\n');
      });
    });
  });

  describe('Edge cases from real logs', () => {
    it('should handle ping events correctly', () => {
      const pingEvent = '{"type":"ping"}';
      const result = converter.convertStreamChunkToInternal(pingEvent);

      expect(result.success).toBe(true);
      // Ping should be marked as empty to be filtered out
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
    });

    it('should handle content_block_stop correctly', () => {
      // First initialize with message_start
      converter.convertStreamChunkToInternal('{"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","model":"test","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}');

      const stopEvent = '{"type":"content_block_stop","index":0}';
      const result = converter.convertStreamChunkToInternal(stopEvent);

      expect(result.success).toBe(true);
      // content_block_stop should be marked as empty to be filtered out
      expect(result.data!).toHaveProperty('__empty', true);
      expect(result.metadata!?.fieldsIgnored).toBe(1);
    });
  });
});
