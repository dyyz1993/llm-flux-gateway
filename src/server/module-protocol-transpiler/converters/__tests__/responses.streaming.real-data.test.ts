/**
 * Responses API Streaming - Real Data Test
 *
 * Tests based on actual upstream data to ensure no regression
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicConverter } from '../anthropic.converter';
import { ResponsesConverter } from '../responses.converter';

describe('ResponsesConverter - Real Data Integration', () => {
  let anthropicConverter: AnthropicConverter;
  let responsesConverter: ResponsesConverter;

  beforeEach(() => {
    anthropicConverter = new AnthropicConverter();
    responsesConverter = new ResponsesConverter();
  });

  it('should handle real Anthropic SSE stream correctly', () => {
    // Real upstream events from logs
    const rawEvents = [
      '{"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","content":[],"model":"glm-4-air"}}',
      '{"type":"ping"}',
      '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}',
      '{"type":"content_block_stop","index":0}',
      '{"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
      '{"type":"message_stop"}',
    ];

    const results: Array<{
      eventType: string;
      internalChunk: any;
      sseString: string;
      isEmptyInternal: boolean;
      shouldProduceOutput: boolean;
    }> = [];

    for (const event of rawEvents) {
      const eventType = JSON.parse(event).type;

      // Anthropic -> Internal
      const anthropicResult = anthropicConverter.convertStreamChunkToInternal(event);
      expect(anthropicResult.success).toBe(true);
      const internalChunk = anthropicResult.data!;

      // Internal -> Responses
      const responsesResult = responsesConverter.convertStreamChunkFromInternal(internalChunk);
      expect(responsesResult.success).toBe(true);
      const sseString = responsesResult.data! as string;

      // Check if internal chunk is empty
      const isEmptyInternal = Object.keys(internalChunk).length === 0 ||
                              (!internalChunk.choices?.[0]?.delta?.role &&
                               !internalChunk.choices?.[0]?.delta?.content &&
                               !(internalChunk.choices?.[0] as any)?.finish_reason &&
                               !internalChunk.id);

      // Check if this should produce output (non-empty SSE)
      const shouldProduceOutput = sseString.trim().length > 0;

      results.push({
        eventType,
        internalChunk,
        sseString,
        isEmptyInternal,
        shouldProduceOutput,
      });

      // Log for debugging
      console.log(`\n${eventType}:`);
      console.log('  Internal:', JSON.stringify(internalChunk));
      console.log('  Responses SSE:', sseString || '(empty string)');
      console.log('  isEmptyInternal:', isEmptyInternal);
      console.log('  shouldProduceOutput:', shouldProduceOutput);
    }

    // Verify results
    console.log('\n=== Summary ===');
    console.log('Total events:', rawEvents.length);
    console.log('Non-empty internal chunks:', results.filter(r => !r.isEmptyInternal).length);
    console.log('Empty internal chunks:', results.filter(r => r.isEmptyInternal).length);
    console.log('Events producing output:', results.filter(r => r.shouldProduceOutput).length);
    console.log('Events NOT producing output:', results.filter(r => !r.shouldProduceOutput).length);

    // CRITICAL: Empty internal chunks should produce EMPTY output
    const emptyChunks = results.filter(r => r.isEmptyInternal);
    console.log('\nEmpty internal chunks analysis:');
    emptyChunks.forEach((r) => {
      console.log(`  ${r.eventType}:`, r.sseString || '(empty - correct!)');
      expect(r.shouldProduceOutput).toBe(false);
      expect(r.sseString).toBe('');
    });

    // Non-empty chunks MUST produce proper SSE output
    const nonEmptyChunks = results.filter(r => !r.isEmptyInternal);
    console.log('\nNon-empty internal chunks analysis:');
    nonEmptyChunks.forEach((r) => {
      console.log(`  ${r.eventType}:`, r.sseString);
      expect(r.shouldProduceOutput).toBe(true);
      expect(r.sseString).toMatch(/^event: [\w.]+\ndata: \{.+\}\n\n$/s);
    });

    // CRITICAL: No "data: {}" or empty data objects should appear
    const hasEmptyData = results.some(r => r.sseString.includes('data: {}'));
    expect(hasEmptyData).toBe(false);

    // CRITICAL: No events with only "type" field in data
    const hasTypeOnlyData = results.some(r =>
      r.sseString.match(/data: \{"type":"[^"]+"\}\n\n$/)
    );
    expect(hasTypeOnlyData).toBe(false);
  });
});
