/**
 * Responses API Streaming Conversion Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResponsesConverter } from '../responses.converter';

describe('ResponsesConverter - Streaming', () => {
  let converter: ResponsesConverter;

  beforeEach(() => {
    converter = new ResponsesConverter();
  });

  it('should convert internal chunk to Responses API SSE format', () => {
    const internalChunk = {
      id: 'resp_123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        delta: { content: 'Hello' },
        finishReason: null,
      }],
    };

    const result = converter.convertStreamChunkFromInternal(internalChunk as any);

    expect(result.success).toBe(true);
    const sse = result.data! as any as string;

    // Should have event and data lines
    expect(sse).toContain('event:');
    expect(sse).toContain('data:');

    // Should be proper SSE format
    expect(sse).toMatch(/^event: [\w.]+\ndata: \{.+\}\n\n$/s);

    console.log('SSE output:', sse);
  });

  it('should use response.created event for first chunk with role', () => {
    const internalChunk = {
      id: 'resp_123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        delta: { role: 'assistant' },
        finishReason: null,
      }],
    };

    const result = converter.convertStreamChunkFromInternal(internalChunk as any);

    expect(result.success).toBe(true);
    const sse = result.data! as any as string;

    expect(sse).toContain('event: response.created');
    expect(sse).toContain('"type":"response.created"');

    console.log('SSE output:', sse);
  });

  it('should use response.done event for chunk with finish_reason', () => {
    const internalChunk = {
      id: 'resp_123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        delta: {},
        finishReason: 'stop',
      }],
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };

    const result = converter.convertStreamChunkFromInternal(internalChunk as any);

    expect(result.success).toBe(true);
    const sse = result.data! as any as string;

    expect(sse).toContain('event: response.done');

    // Parse and validate data structure
    const dataMatch = sse.match(/data: (.+)/);
    expect(dataMatch).toBeTruthy();
    const data = JSON.parse(dataMatch![1]!);

    // Validate Responses API format
    expect(data).toHaveProperty('type', 'response.done');
    expect(data).toHaveProperty('response');
    expect(data.response).toHaveProperty('id', 'resp_123');
    expect(data.response).toHaveProperty('status', 'completed');
    expect(data.response).toHaveProperty('created_at', 1234567890);
    expect(data.response).toHaveProperty('model', 'gpt-4o');
    expect(data.response).toHaveProperty('usage');
    expect(data.response.usage).toHaveProperty('input_tokens', 10);
    expect(data.response.usage).toHaveProperty('output_tokens', 20);
    expect(data.response.usage).toHaveProperty('total_tokens', 30);

    // Should NOT have Chat Completions fields
    expect(data).not.toHaveProperty('choices');
    expect(data).not.toHaveProperty('finish_reason');

    console.log('SSE output:', sse);
  });

  it('should use response!.output_text.delta event for content chunks', () => {
    const internalChunk = {
      id: 'resp_123',
      object: 'chat.completion.chunk',
      created: 1234567890,
      model: 'gpt-4o',
      choices: [{
        index: 0,
        delta: { content: 'Hello' },
        finishReason: null,
      }],
    };

    const result = converter.convertStreamChunkFromInternal(internalChunk as any);

    expect(result.success).toBe(true);
    const sse = result.data! as any as string;

    // Check event type
    expect(sse).toContain('event: response.output_text.delta');

    // Parse and validate data structure
    const dataMatch = sse.match(/data: (.+)/);
    expect(dataMatch).toBeTruthy();
    const data = JSON.parse(dataMatch![1]!);

    // Validate Responses API format (not Chat Completions format)
    expect(data).toHaveProperty('type', 'response.output_text.delta');
    expect(data).toHaveProperty('delta');
    expect(data.delta).toHaveProperty('type', 'content');
    expect(data.delta).toHaveProperty('content', 'Hello');

    // Should NOT have Chat Completions fields
    expect(data).not.toHaveProperty('choices');
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('object');

    console.log('SSE output:', sse);
  });

  it('should maintain consistent SSE format for all chunks', () => {
    const chunks = [
      { role: 'assistant' },  // First chunk
      { content: 'Hello' },
      { content: ' World' },
      { finishReason: 'stop' },  // Last chunk
    ];

    const results = chunks.map((delta) => {
      const chunk = {
        id: 'resp_123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4o',
        choices: [{
          index: 0,
          delta,
          finishReason: delta.finishReason || null,
        }],
      } as any;

      return converter.convertStreamChunkFromInternal(chunk);
    });

    // All should succeed
    expect(results.every(r => r.success)).toBe(true);

    // All should be proper SSE format
    results.forEach((r, i) => {
      const sse = r.data! as string;
      expect(sse).toMatch(/^event: [\w.]+\ndata: \{.+\}\n\n$/s);
      console.log(`Chunk ${i + 1}:`, sse);
    });

    // Verify event types
    expect(results[0]!.data).toContain('event: response.created');
    expect(results[1]!.data).toContain('event: response.output_text.delta');
    expect(results[2]!.data).toContain('event: response.output_text.delta');
    expect(results[3]!.data).toContain('event: response.done');
  });
});
