/**
 * Anthropic Streaming Integration Test
 *
 * Tests the complete conversion flow from real Anthropic SSE to OpenAI format
 * based on actual upstream data.
 */

import { describe, it, expect } from 'vitest';

import { AnthropicConverter } from '../anthropic.converter';

describe('AnthropicConverter - Real SSE Integration Test', () => {
  it('should convert real upstream SSE stream correctly', () => {
    const converter = new AnthropicConverter();

    // Real upstream SSE data from logs/sse-traces/anthropic-2026-01-03T07-13-18-920Z.log
    const rawSSEEvents = [
      '{"type":"message_start","message":{"id":"msg_202601031513181856df84e5504309","type":"message","role":"assistant","model":"glm-4-air","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}',
      '{"type":"ping"}',
      '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"！"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"有什么"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"可以帮助"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你的"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"吗"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"？"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"如果你"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"有任何"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"问题"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"或者"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"需要"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"帮助"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"，"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"请"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"随时"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"告诉我"}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"。"}}',
      '{"type":"content_block_stop","index":0}',
      '{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":532,"output_tokens":20,"cache_read_input_tokens":0,"server_tool_use":{"web_search_requests":0},"service_tier":"standard"}}',
      '{"type":"message_stop"}',
    ];

    const results: Array<{ success: boolean; data: any; hasContent: boolean }> = [];

    for (const event of rawSSEEvents) {
      const result = converter.convertStreamChunkToInternal(event);
      // Check if chunk has content (not marked as empty)
      const hasContent = !(result.data!.__empty) &&
                        (result.data!.choices?.[0]?.delta?.role ||
                         result.data!.choices?.[0]?.delta?.content ||
                         result.data!.choices?.[0]?.finishReason);

      results.push({
        success: result.success,
        data: result.data!,
        hasContent: !!hasContent,
      });
    }

    // Verify all conversions succeeded
    expect(results.every(r => r.success)).toBe(true);

    // Count chunks with actual content
    const contentChunks = results.filter(r => r.hasContent);
    console.log('Total events:', rawSSEEvents.length);
    console.log('Chunks with content:', contentChunks.length);
    console.log('Empty chunks:', results.filter(r => !r.hasContent).length);

    // Verify expected content chunks
    // Should have at least:
    // 1. message_start (role: assistant)
    // 2-19. 18 content_block_delta events with text
    // 20. message_delta (stop_reason) or message_stop (stop_reason)
    expect(contentChunks.length).toBeGreaterThanOrEqual(19);
    expect(contentChunks.length).toBeLessThanOrEqual(21);

    // Verify first chunk (message_start)
    expect(contentChunks[0]!.data!.choices?.[0].delta.role).toBe('assistant');
    expect(contentChunks[0]!.data!.id).toBe('msg_202601031513181856df84e5504309');

    // Verify text content chunks
    const textChunks = contentChunks.slice(1, 19);
    expect(textChunks[0]!.data!.choices?.[0].delta.content).toBe('你好');
    expect(textChunks[1]!.data!.choices?.[0].delta.content).toBe('！');
    expect(textChunks[17]!.data!.choices?.[0].delta.content).toBe('。');

    // Verify finish_reason chunks (may be at different indices depending on what's filtered)
    const finishReasonChunks = contentChunks.filter(c => c.data!.choices?.[0]?.finishReason);
    expect(finishReasonChunks.length).toBeGreaterThan(0);
    expect(finishReasonChunks[0]!.data!.choices?.[0].finishReason).toBe('stop');

    // If we have a message_delta chunk, check the usage
    const messageDeltaChunks = contentChunks.filter(c => c.data!.usage?.completion_tokens);
    if (messageDeltaChunks.length > 0) {
      expect(messageDeltaChunks[0]!.data!.usage.completion_tokens).toBe(20);
    }

    // Verify empty chunks
    const emptyChunks = results.filter(r => !r.hasContent);
    console.log('Empty chunk types:', emptyChunks.map((_, i) => {
      const idx = results.findIndex(r => r === emptyChunks[i]);
      return JSON.parse(rawSSEEvents[idx]!).type;
    }));
    expect(emptyChunks.length).toBeGreaterThanOrEqual(3); // at least ping, content_block_start, content_block_stop

    // Log all results for debugging
    console.log('\n=== Conversion Results ===');
    results.forEach((r, i) => {
      const eventType = JSON.parse(rawSSEEvents[i]!).type;
      console.log(`${i + 1}. ${eventType}:`, r.hasContent ? 'HAS CONTENT' : 'EMPTY');
      if (r.hasContent) {
        console.log('   ', JSON.stringify(r.data!));
      }
    });
  });
});
