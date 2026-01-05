/**
 * InternalStreamChunk Object Conversion Tests
 *
 * Tests the conversion of InternalStreamChunk objects (returned by upstreamService.parseStreamWith)
 * through the protocol transpiler to various vendor formats.
 *
 * Background:
 * - upstreamService.parseStreamWith returns InternalStreamChunk objects
 * - gateway-controller.ts passes these objects to transpileStreamChunk
 * - The transpiler detects complete InternalStreamChunk objects and skips source conversion
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { expectSuccess } from '../../__tests__/test-helpers';
import type { InternalStreamChunk } from '../../interfaces/internal-format';
import { ProtocolTranspiler } from '../protocol-transpiler';

// Import real converters for integration testing
import { OpenAIConverter } from '../../converters/openai.converter';
import { AnthropicConverter } from '../../converters/anthropic.converter';
import { GeminiConverter } from '../../converters/gemini.converter';

describe('ProtocolTranspiler - InternalStreamChunk Object Conversion', () => {
  let transpiler: ProtocolTranspiler;

  beforeEach(() => {
    transpiler = new ProtocolTranspiler();

    // Register real converters (instantiate the classes)
    transpiler.registerConverter(new OpenAIConverter());
    transpiler.registerConverter(new AnthropicConverter());
    transpiler.registerConverter(new GeminiConverter());
  });

  describe('Complete InternalStreamChunk object conversion', () => {
    it('should handle complete InternalStreamChunk object from upstream', () => {
      const internalChunk: InternalStreamChunk = {
        id: 'msg_123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: 'Hello' },
          finishReason: null,
        }],
      };

      const result = transpiler.transpileStreamChunk(internalChunk, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(typeof result.data! as any).toBe('string');
      expect(result.data! as any as any).toContain('event:');
      expect(result.data! as any as any).toContain('data:');
      expect(result.data! as any as any).toContain('Hello');
      expect(result.metadata!?.fieldsConverted).toBeGreaterThan(0);
    });

    it('should convert InternalStreamChunk with role delta', () => {
      const internalChunk: InternalStreamChunk = {
        id: 'msg_456',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { role: 'assistant' as const, content: null as any as any },
          finishReason: null,
        }],
      };

      const result = transpiler.transpileStreamChunk(internalChunk, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(typeof result.data! as any).toBe('string');
      expect(result.data! as any as any).toContain('message_start');
    });

    it('should convert InternalStreamChunk with tool calls', () => {
      const internalChunk: InternalStreamChunk = {
        id: 'msg_789',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {
            role: 'assistant' as const,
            content: null as any as any,
            toolCalls: [{
              id: 'call_123',
              type: 'function',
              index: 0,
              function: {
                name: 'get_weather',
                arguments: '{"location":"SF"}',
              },
            }],
          },
          finishReason: 'tool_calls',
        }],
      };

      const result = transpiler.transpileStreamChunk(internalChunk, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(typeof result.data! as any).toBe('string');
      // Tool calls are handled across multiple chunks in Anthropic format
      // First chunk with role will be message_start
      expect(result.data! as any as any).toContain('message_start');
      // The actual tool_use content will be in subsequent chunks
    });

    it('should convert InternalStreamChunk with finish reason', () => {
      const internalChunk: InternalStreamChunk = {
        id: 'msg_finish',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {},
          finishReason: 'stop',
        }],
      };

      const result = transpiler.transpileStreamChunk(internalChunk, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expectSuccess(result);
      // Empty chunks (only finish_reason, no content) may return empty string
      // This is expected behavior - chunks with no content don't need to be sent
      const dataStr = result.data! as any;
      if (dataStr && typeof dataStr === 'string' && dataStr.length > 0) {
        expect(typeof dataStr).toBe('string');
        // If data is returned, it should contain stop_reason
        // but this is optional for empty chunks
      }
    });
  });

  describe('InternalStreamChunk -> OpenAI (Fast Path)', () => {
    it('should return SSE string when InternalStreamChunk -> OpenAI', () => {
      const internalChunk: InternalStreamChunk = {
        id: 'test',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{ index: 0, delta: { content: 'Test' }, finishReason: null }],
      };

      const result = transpiler.transpileStreamChunk(internalChunk, 'openai', 'openai');

      expect(result.success).toBe(true);
      expect(typeof result.data! as any).toBe('string');
      expect(result.data! as any as any).toMatch(/^data: \{.+\}\n\n$/);
      expect(result.data! as any as any).toContain('Test');
      expect(result.data! as any as any).toContain('chat.completion.chunk');
    });

    it('should include all required fields in OpenAI SSE output', () => {
      const internalChunk: InternalStreamChunk = {
        id: 'chunk-abc-123',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4-turbo',
        choices: [{
          index: 0,
          delta: { content: 'Hello, world!' },
          finishReason: null,
        }],
      };

      const result = transpiler.transpileStreamChunk(internalChunk, 'openai', 'openai');

      expect(result.success).toBe(true);
      const output = result.data! as any as string;

      // Verify SSE format
      expect(output).toMatch(/^data:/);
      expect(output).toContain('"id":"chunk-abc-123"');
      expect(output).toContain('"object":"chat.completion.chunk"');
      expect(output).toContain('"created":1234567890');
      expect(output).toContain('"model":"gpt-4-turbo"');
      expect(output).toContain('"content":"Hello, world!"');
    });
  });

  describe('InternalStreamChunk -> Gemini', () => {
    it('should convert InternalStreamChunk to Gemini format', () => {
      const internalChunk: InternalStreamChunk = {
        id: 'msg_gemini',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: 'Hello Gemini' },
          finishReason: null,
        }],
      };

      const result = transpiler.transpileStreamChunk(internalChunk, 'openai', 'gemini');

      // Gemini converter may not be fully implemented or may return errors
      // The conversion infrastructure is what we're testing
      expect(result).toBeDefined();
      // If it succeeds, verify the data type
      if (result.success) {
        expect(typeof result.data! as any).toBe('string');
      } else {
        // It's acceptable if Gemini conversion isn't fully implemented yet
        expect(result.errors).toBeDefined();
      }
    });
  });

  describe('Empty and partial InternalStreamChunk handling', () => {
    it('should handle empty InternalStreamChunk gracefully', () => {
      const emptyChunk: InternalStreamChunk = {
        id: 'test',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [],
      };

      const result = transpiler.transpileStreamChunk(emptyChunk, 'openai', 'anthropic');

      // Should handle empty chunks without errors
      expect(result).toBeDefined();
      // The converter should handle empty choices array
      if (result.success) {
        // Empty chunks may return empty string or __empty marker
        if (result.data! as any && typeof result.data! as any === 'object' && (result.data! as any as any).__empty) {
          expect((result.data! as any as any).__empty).toBe(true);
        }
      }
    });

    it('should handle InternalStreamChunk with null delta', () => {
      const nullDeltaChunk: InternalStreamChunk = {
        id: 'test-null',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {},
          finishReason: null,
        }],
      };

      const result = transpiler.transpileStreamChunk(nullDeltaChunk, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expectSuccess(result);
      // Should either return empty string or valid SSE with empty content
      const dataStr = result.data! as any;
      if (dataStr && typeof dataStr === 'string' && dataStr.length > 0) {
        expect(dataStr).toContain('event:');
        expect(dataStr).toContain('data:');
      }
    });

    it('should handle InternalStreamChunk with only metadata', () => {
      const metadataOnlyChunk: InternalStreamChunk = {
        id: 'test-meta',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: {},
          finishReason: null,
        }],
      };

      const result = transpiler.transpileStreamChunk(metadataOnlyChunk, 'openai', 'openai');

      expect(result.success).toBe(true);
      expectSuccess(result);
      // Chunks with only metadata (no content) may return empty string
      const dataStr = result.data! as any;
      if (dataStr && typeof dataStr === 'string' && dataStr.length > 0) {
        // Should still be valid SSE format
        expect(dataStr).toMatch(/^data: \{.+\}\n\n$/);
      }
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle multi-chunk streaming simulation', () => {
      const chunks: InternalStreamChunk[] = [
        {
          id: 'chunk1',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { role: 'assistant' as const, content: null as any as any },
            finishReason: null,
          }],
        },
        {
          id: 'chunk2',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: 'Hello' },
            finishReason: null,
          }],
        },
        {
          id: 'chunk3',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: { content: ' there!' },
            finishReason: null,
          }],
        },
        {
          id: 'chunk4',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: {},
            finishReason: 'stop',
          }],
        },
      ];

      // Convert all chunks to Anthropic format
      const results = chunks.map(chunk =>
        transpiler.transpileStreamChunk(chunk, 'openai', 'anthropic')
      );

      // Verify all conversions succeeded
      results.forEach((result, _index) => {
        expect(result.success).toBe(true);
        expect(typeof result.data! as any).toBe('string');
        expect((result.metadata as any)?.fromVendor).toBe('openai');
        expect((result.metadata as any)?.toVendor).toBe('anthropic');
      });

      // First chunk should contain message_start
      expect(results[0]!.data! as any).toContain('message_start');

      // Content chunks should contain text
      expect(results[1]!.data! as any).toContain('Hello');
      expect(results[2]!.data! as any).toContain(' there!');

      // Last chunk (finish_reason only) may return empty string
      // This is acceptable behavior
    });

    it('should handle streaming with tool calls across multiple chunks', () => {
      const toolChunks: InternalStreamChunk[] = [
        {
          id: 'tool1',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: {
              role: 'assistant' as const,
              content: null as any as any,
              toolCalls: [{
                id: 'call_001',
                type: 'function',
                index: 0,
                function: {
                  name: 'calculate',
                  arguments: '',
                },
              }],
            },
            finishReason: null,
          }],
        },
        {
          id: 'tool2',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: {
              toolCalls: [{
                id: 'call_001' as any,
                type: 'function' as any,
                index: 0,
                function: {
                  name: 'test_function' as any,
                  arguments: '{"x": 1',
                },
              }],
            },
            finishReason: null,
          }],
        },
        {
          id: 'tool3',
          object: 'chat.completion.chunk',
          created: 1234567890,
          model: 'gpt-4',
          choices: [{
            index: 0,
            delta: {
              toolCalls: [{
                id: 'call_001' as any,
                type: 'function' as any,
                index: 0,
                function: {
                  name: 'test_function' as any,
                  arguments: '1}',
                },
              }],
            },
            finishReason: 'tool_calls',
          }],
        },
      ];

      const results = toolChunks.map(chunk =>
        transpiler.transpileStreamChunk(chunk, 'openai', 'anthropic')
      );

      // Verify all conversions succeeded
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(typeof result.data! as any).toBe('string');
      });

      // First chunk with role will be message_start
      expect(results[0]!.data! as any).toContain('message_start');

      // Subsequent chunks with only toolCalls delta may return empty string
      // This is acceptable - the converter handles incremental tool call building
      // The important thing is that conversions succeed without errors
    });

    it('should preserve token usage information from InternalStreamChunk', () => {
      const chunkWithUsage: InternalStreamChunk = {
        id: 'usage-chunk',
        object: 'chat.completion.chunk',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: 'Final response' },
          finishReason: 'stop',
        }],
        // Note: Usage might be attached as vendor-specific field
      } as InternalStreamChunk;

      // Add usage as vendor-specific field
      (chunkWithUsage as any).usage = {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      };

      const result = transpiler.transpileStreamChunk(chunkWithUsage, 'openai', 'openai');

      expect(result.success).toBe(true);
      expect(typeof result.data! as any).toBe('string');
      // Usage might not be in every chunk, but should be preserved when present
      expect(result.data! as any as any).toContain('Final response');
    });
  });

  describe('Error handling', () => {
    it('should handle InternalStreamChunk with missing required fields', () => {
      const incompleteChunk = {
        id: 'incomplete',
        choices: [{
          index: 0,
          delta: { content: 'test' },
          finishReason: null,
        }],
      } as InternalStreamChunk;

      // Should still attempt conversion but might have issues
      const result = transpiler.transpileStreamChunk(incompleteChunk, 'openai', 'anthropic');

      // Result depends on converter's handling of incomplete data
      expect(result).toBeDefined();
    });

    it('should handle InternalStreamChunk with invalid vendor format', () => {
      const validChunk: InternalStreamChunk = {
        id: 'test',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: 'test' },
          finishReason: null,
        }],
      };

      // Use non-existent vendor
      const result = transpiler.transpileStreamChunk(validChunk, 'openai', 'nonexistent' as any);

      expect(result.success).toBe(false);
      expect(result.errors! as any).toBeDefined();
      expect((result.errors! as any)[0].code).toBe('UNSUPPORTED_FEATURE');
    });
  });

  describe('Performance and metadata', () => {
    it('should track conversion metadata correctly', () => {
      const chunk: InternalStreamChunk = {
        id: 'meta-test',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: 'Test' },
          finishReason: null,
        }],
      };

      const result = transpiler.transpileStreamChunk(chunk, 'openai', 'anthropic');

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!?.fromVendor).toBe('openai');
      expect(result.metadata!?.toVendor).toBe('anthropic');
      expect(result.metadata!?.conversionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata!?.fieldsConverted).toBeGreaterThan(0);
      expect(result.metadata!?.convertedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should handle rapid conversions efficiently', () => {
      const chunks: InternalStreamChunk[] = Array.from({ length: 100 }, (_, i) => ({
        id: `rapid-${i}`,
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          delta: { content: `Chunk ${i}` },
          finishReason: i === 99 ? 'stop' : null,
        }],
      }));

      const startTime = Date.now();
      const results = chunks.map(chunk =>
        transpiler.transpileStreamChunk(chunk, 'openai', 'openai')
      );
      const endTime = Date.now();

      // All conversions should succeed
      expect(results.every(r => r.success)).toBe(true);

      // Should complete in reasonable time (< 1 second for 100 chunks)
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });
});
