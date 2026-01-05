/**
 * OpenAI Converter Streaming Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIConverter } from '../openai.converter';

describe('OpenAIConverter - Streaming', () => {
  let converter: OpenAIConverter;

  beforeEach(() => {
    converter = new OpenAIConverter();
  });

  describe('empty chunk filtering', () => {
    it('should return empty string for completely empty chunk', () => {
      const emptyChunk = {} as any;

      const result = converter.convertStreamChunkFromInternal(emptyChunk);

      expect(result.success).toBe(true);
      expect(result.data! as any as any).toBe('');
      expect((result.metadata as any)!.fieldsIgnored).toBe(1);
    });

    it('should return empty string for chunk with only empty choices', () => {
      const chunkWithEmptyChoices = {
        choices: [{}],
      } as any;

      const result = converter.convertStreamChunkFromInternal(chunkWithEmptyChoices);

      expect(result.success).toBe(true);
      expect(result.data! as any as any).toBe('');
      expect((result.metadata as any)!.fieldsIgnored).toBe(1);
    });

    it('should return empty string for chunk with only empty delta', () => {
      const chunkWithEmptyDelta = {
        id: 'test-id',
        choices: [{ delta: {}, finishReason: null }],
      } as any;

      const result = converter.convertStreamChunkFromInternal(chunkWithEmptyDelta);

      expect(result.success).toBe(true);
      expect(result.data! as any as any).toBe('');
      expect((result.metadata as any)!.fieldsIgnored).toBe(1);
    });

    it('should filter out chunks with no meaningful content', () => {
      const chunks = [
        {}, // Completely empty
        { id: 'test' }, // Only id - NOT meaningful without role/content/finish_reason
        { model: 'gpt-4' }, // Only model - NOT meaningful
        { created: 1234567890 }, // Only created - NOT meaningful
        { object: 'chat.completion.chunk' }, // Only object - NOT meaningful
        { choices: [] }, // Empty choices array - NOT meaningful
        { choices: [{}] }, // Only empty choice - NOT meaningful
        { choices: [{ delta: {} }] }, // Only empty delta - NOT meaningful
      ] as any[];

      for (const chunk of chunks) {
        const result = converter.convertStreamChunkFromInternal(chunk);
        expect(result.data! as any as any).toBe('');
      }
    });
  });

  describe('meaningful chunk handling', () => {
    it('should return SSE format for chunk with role delta', () => {
      const roleChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finishReason: null,
        }],
      } as any;

      const result = converter.convertStreamChunkFromInternal(roleChunk);

      expect(result.success).toBe(true);
      expect(result.data! as any as any).toMatch(/^data: \{.+\}\n\n$/);
      expect(result.data! as any as any).toContain('"role":"assistant"');
      expect((result.metadata as any)!.fieldsConverted).toBe(1);
      expect((result.metadata as any)!.fieldsIgnored).toBe(0);
    });

    it('should return SSE format for chunk with content delta', () => {
      const contentChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: 'Hello' },
          finishReason: null,
        }],
      } as any;

      const result = converter.convertStreamChunkFromInternal(contentChunk);

      expect(result.success).toBe(true);
      expect(result.data! as any as any).toMatch(/^data: \{.+\}\n\n$/);
      expect(result.data! as any as any).toContain('"content":"Hello"');
      expect((result.metadata as any)!.fieldsConverted).toBe(1);
    });

    it('should return SSE format for chunk with finish_reason', () => {
      const finishChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {},
          finishReason: 'stop',
        }],
      } as any;

      const result = converter.convertStreamChunkFromInternal(finishChunk);

      expect(result.success).toBe(true);
      expect(result.data! as any as any).toMatch(/^data: \{.+\}\n\n$/);
      expect(result.data! as any as any).toContain('"finish_reason":"stop"');
      expect((result.metadata as any)!.fieldsConverted).toBe(1);
    });

    it('should return SSE format for chunk with usage', () => {
      const usageChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {},
          finishReason: null,
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      } as any;

      const result = converter.convertStreamChunkFromInternal(usageChunk);

      expect(result.success).toBe(true);
      expect(result.data! as any as any).toMatch(/^data: \{.+\}\n\n$/);
      expect(result.data! as any as any).toContain('"usage"');
      expect((result.metadata as any)!.fieldsConverted).toBe(1);
    });

    it('should return SSE format for chunk with tool_calls', () => {
      const toolCallsChunk = {
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {
            toolCalls: [{
              index: 0,
              id: 'call_123',
              function: {
                name: 'test_function',
                arguments: '{}',
              },
            }],
          },
          finishReason: null,
        }],
      } as any;

      const result = converter.convertStreamChunkFromInternal(toolCallsChunk);

      expect(result.success).toBe(true);
      expect(result.data! as any as any).toMatch(/^data: \{.+\}\n\n$/);
      expect(result.data! as any as any).toContain('"tool_calls"');
      expect((result.metadata as any)!.fieldsConverted).toBe(1);
    });

    it('should return empty string for chunk with id only (metadata)', () => {
      const idChunk = {
        id: 'chatcmpl-123',
      } as any;

      const result = converter.convertStreamChunkFromInternal(idChunk);

      expect(result.success).toBe(true);
      expect(result.data! as any as any).toBe(''); // id alone is NOT meaningful
      expect((result.metadata as any)!.fieldsIgnored).toBe(1);
    });
  });

  describe('SSE format validation', () => {
    it('should produce valid SSE format with data: prefix', () => {
      const chunk = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: 'Hello' },
          finishReason: null,
        }],
      } as any;

      const result = converter.convertStreamChunkFromInternal(chunk);

      expect(result.success).toBe(true);
      const sse = result.data! as any;

      // Should start with 'data: '
      expect(sse).toMatch(/^data: /);

      // Should end with double newline
      expect(sse).toMatch(/\n\n$/);

      // Should be valid JSON after 'data: '
      const jsonMatch = sse.match(/^data: (.+)\n\n$/);
      expect(jsonMatch).toBeTruthy();

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        expect(parsed.id).toBe('chatcmpl-123');
        expect(parsed.choices?.[0].delta.content).toBe('Hello');
      }
    });

    it('should handle special characters in content', () => {
      const chunk = {
        id: 'chatcmpl-123',
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: 'Hello\nWorld\t!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~' },
          finishReason: null,
        }],
      } as any;

      const result = converter.convertStreamChunkFromInternal(chunk);

      expect(result.success).toBe(true);
      const sse = result.data! as any;

      // Should be valid JSON
      const jsonMatch = sse.match(/^data: (.+)\n\n$/);
      expect(jsonMatch).toBeTruthy();

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        expect(parsed.choices?.[0].delta.content).toBe('Hello\nWorld\t!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~');
      }
    });
  });

  describe('real-world scenarios', () => {
    it('should handle typical streaming sequence', () => {
      const chunks = [
        // First chunk: role
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{ index: 0, delta: { role: 'assistant' }, finishReason: null }],
        },
        // Content chunks
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{ index: 0, delta: { content: 'Hello' }, finishReason: null }],
        },
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{ index: 0, delta: { content: ' World' }, finishReason: null }],
        },
        // Last chunk: finish_reason
        {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{ index: 0, delta: {}, finishReason: 'stop' }],
          usage: {
            promptTokens: 10,
            completionTokens: 3,
            totalTokens: 13,
          },
        },
      ] as any[];

      const results = chunks.map(chunk => converter.convertStreamChunkFromInternal(chunk));

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);

      // All should have non-empty output
      expect(results.every(r => (r.data! as string).trim().length > 0)).toBe(true);

      // All should be valid SSE format
      results.forEach(r => {
        expect(r.data! as string).toMatch(/^data: \{.+\}\n\n$/s);
      });

      // Verify content
      expect(results[0]!.data).toContain('"role":"assistant"');
      expect(results[1]!.data).toContain('"content":"Hello"');
      expect(results[2]!.data).toContain('"content":" World"');
      expect(results[3]!.data).toContain('"finish_reason":"stop"');
    });

    it('should handle mixed meaningful and empty chunks', () => {
      const chunks = [
        { id: 'chatcmpl-123' }, // Empty: id alone is NOT meaningful
        {}, // Empty
        { choices: [{ delta: { content: 'Hello' } }] }, // Meaningful: has content
        { model: 'gpt-4' }, // Empty: model alone is NOT meaningful
        {}, // Empty
        { choices: [{ finishReason: 'stop' }] }, // Meaningful: has finish_reason
      ] as any[];

      const results = chunks.map(chunk => converter.convertStreamChunkFromInternal(chunk));

      // All should succeed
      expect(results.every(r => r.success)).toBe(true);

      // Alternating empty and meaningful
      expect(results[0]!.data).toBe(''); // id alone - empty
      expect(results[1]!.data).toBe(''); // empty
      expect((results[2]!.data as string).trim().length).toBeGreaterThan(0); // content - meaningful
      expect(results[3]!.data).toBe(''); // model alone - empty
      expect(results[4]!.data).toBe(''); // empty
      expect((results[5]!.data as string).trim().length).toBeGreaterThan(0); // finish_reason - meaningful
    });
  });
});
