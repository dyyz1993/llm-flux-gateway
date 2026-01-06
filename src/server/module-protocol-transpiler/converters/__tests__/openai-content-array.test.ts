/**
 * OpenAI Converter - Content Array Handling Tests
 *
 * Tests the fix for handling content array format from Anthropic/GLM responses.
 *
 * Problem: When GLM returns Anthropic-style content array:
 *   content: [{type: "text", text: "..."}, {type: "tool_use", ...}]
 *
 * Expected: OpenAI format should extract text:
 *   content: "..."
 *   tool_calls: [...]
 */

import { describe, it, expect } from 'vitest';
import { OpenAIConverter } from '../openai.converter';
import type { InternalResponse, InternalContentBlock } from '../../interfaces/internal-format';

describe('OpenAIConverter - Content Array Handling', () => {
  const converter = new OpenAIConverter();

  describe('convertResponseFromInternal', () => {
    it('should extract text from content array with single text block', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'glm-4-flash',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Hello, how can I help you?' }
            ],
            toolCalls: []
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        expect(data.choices[0].message.content).toBe('Hello, how can I help you?');
        expect(data.choices[0].message.tool_calls).toEqual([]);
      }
    });

    it('should extract and join multiple text blocks from content array', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_456',
        object: 'chat.completion',
        created: 1234567890,
        model: 'glm-4-flash',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'First part. ' },
              { type: 'text', text: 'Second part. ' },
              { type: 'text', text: 'Third part.' }
            ],
            toolCalls: []
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        expect(data.choices[0].message.content).toBe('First part. Second part. Third part.');
      }
    });

    it('should filter out tool_use blocks and only keep text blocks', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_789',
        object: 'chat.completion',
        created: 1234567890,
        model: 'glm-4-flash',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me call the tool.' },
              {
                type: 'tool_use',
                id: 'toolu_abc123',
                name: 'weather',
                input: { location: 'Beijing' }
              } as InternalContentBlock
            ],
            toolCalls: [
              {
                id: 'toolu_abc123',
                type: 'function',
                function: {
                  name: 'weather',
                  arguments: '{"location":"Beijing"}'
                }
              }
            ]
          },
          finishReason: 'tool_calls'
        }],
        usage: {
          promptTokens: 15,
          completionTokens: 25,
          totalTokens: 40
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        // Content should only contain text, not tool_use blocks
        expect(data.choices[0].message.content).toBe('Let me call the tool.');
        // tool_calls should be preserved
        expect(data.choices[0].message.tool_calls).toHaveLength(1);
        expect(data.choices[0].message.tool_calls[0].id).toBe('toolu_abc123');
        expect(data.choices[0].message.tool_calls[0].function.name).toBe('weather');
      }
    });

    it('should handle GLM-style response with mixed text and tool_use blocks', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_glm001',
        object: 'chat.completion',
        created: 1234567890,
        model: 'glm-4-flash',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: '我来帮您依次调用这两个工具。' },
              {
                type: 'tool_use',
                id: 'toolu_001',
                name: 'get_weather',
                input: { city: 'San Francisco' }
              } as InternalContentBlock,
              { type: 'text', text: '正在获取天气信息...' },
              {
                type: 'tool_use',
                id: 'toolu_002',
                name: 'get_time',
                input: { timezone: 'UTC' }
              } as InternalContentBlock
            ],
            toolCalls: [
              {
                id: 'toolu_001',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city":"San Francisco"}'
                }
              },
              {
                id: 'toolu_002',
                type: 'function',
                function: {
                  name: 'get_time',
                  arguments: '{"timezone":"UTC"}'
                }
              }
            ]
          },
          finishReason: 'tool_calls'
        }],
        usage: {
          promptTokens: 50,
          completionTokens: 100,
          totalTokens: 150
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        // Content should concatenate all text blocks
        expect(data.choices[0].message.content).toBe('我来帮您依次调用这两个工具。正在获取天气信息...');
        // tool_calls should be preserved
        expect(data.choices[0].message.tool_calls).toHaveLength(2);
        expect(data.choices[0].message.tool_calls[0].function.name).toBe('get_weather');
        expect(data.choices[0].message.tool_calls[1].function.name).toBe('get_time');
      }
    });

    it('should handle empty text blocks (no text content)', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_empty',
        object: 'chat.completion',
        created: 1234567890,
        model: 'glm-4-flash',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_only',
                name: 'calculator',
                input: { expression: '2+2' }
              } as InternalContentBlock
            ],
            toolCalls: [
              {
                id: 'toolu_only',
                type: 'function',
                function: {
                  name: 'calculator',
                  arguments: '{"expression":"2+2"}'
                }
              }
            ]
          },
          finishReason: 'tool_calls'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        // Content should be empty string when no text blocks exist
        expect(data.choices[0].message.content).toBe('');
        // tool_calls should still be present
        expect(data.choices[0].message.tool_calls).toHaveLength(1);
      }
    });

    it('should preserve string content (no conversion needed)', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_string',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'This is already a string, no array.',
            toolCalls: []
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        expect(data.choices[0].message.content).toBe('This is already a string, no array.');
      }
    });

    it('should convert field names to snake_case after content extraction', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_camel',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Test content' }],
            toolCalls: []
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        // Check that field names are converted to snake_case
        expect(data.choices[0].finish_reason).toBe('stop');
        expect(data.choices[0].message.content).toBe('Test content');
        // Check usage fields are in snake_case
        expect(data.usage.prompt_tokens).toBe(10);
        expect(data.usage.completion_tokens).toBe(20);
        expect(data.usage.total_tokens).toBe(30);
      }
    });

    it('should handle thinking blocks by filtering them out', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_thinking',
        object: 'chat.completion',
        created: 1234567890,
        model: 'glm-4-flash',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: 'Let me think...' } as InternalContentBlock,
              { type: 'text', text: 'Here is my answer.' }
            ],
            toolCalls: []
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 15,
          completionTokens: 25,
          totalTokens: 40
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        // Only text blocks should be included
        expect(data.choices[0].message.content).toBe('Here is my answer.');
        // Thinking blocks should be filtered out
      }
    });

    it('should handle empty string content', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_empty_string',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: '',
            toolCalls: []
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 10,
          completionTokens: 0,
          totalTokens: 10
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        expect(data.choices[0].message.content).toBe('');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content array', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_empty_array',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [],
            toolCalls: []
          },
          finishReason: 'stop'
        }],
        usage: {
          promptTokens: 5,
          completionTokens: 0,
          totalTokens: 5
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        expect(data.choices[0].message.content).toBe('');
      }
    });

    it('should handle content with only tool_use blocks', () => {
      const internalResponse: InternalResponse = {
        id: 'msg_only_tools',
        object: 'chat.completion',
        created: 1234567890,
        model: 'test-model',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_tool1',
                name: 'search',
                input: { query: 'test' }
              } as InternalContentBlock,
              {
                type: 'tool_use',
                id: 'toolu_tool2',
                name: 'calculate',
                input: { expression: '1+1' }
              } as InternalContentBlock
            ],
            toolCalls: [
              {
                id: 'toolu_tool1',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '{"query":"test"}'
                }
              },
              {
                id: 'toolu_tool2',
                type: 'function',
                function: {
                  name: 'calculate',
                  arguments: '{"expression":"1+1"}'
                }
              }
            ]
          },
          finishReason: 'tool_calls'
        }],
        usage: {
          promptTokens: 20,
          completionTokens: 30,
          totalTokens: 50
        }
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        const data = result.data!;
        // Content should be empty (no text blocks)
        expect(data.choices[0].message.content).toBe('');
        // tool_calls should be preserved
        expect(data.choices[0].message.tool_calls).toHaveLength(2);
      }
    });
  });
});

describe('OpenAIConverter - GLM Mixed Format (convertResponseToInternal)', () => {
  const converter = new OpenAIConverter();

  describe('convertResponseToInternal - GLM Format Handling', () => {
    it('should convert GLM response with tool_use content array to Internal format', () => {
      const glmResponse = {
        id: 'msg_2026010702051725c8baf07895474e',
        object: 'chat.completion',
        created: 1767722719,
        model: 'glm-4-air',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_2026010702051725c8baf07895474e_0',
                name: 'calculator',
                input: {
                  expression: '234 * 567 + 891'
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }],
        usage: {
          prompt_tokens: 1671,
          completion_tokens: 18,
          total_tokens: 1689
        }
      };

      const result = converter.convertResponseToInternal(glmResponse);

      expect(result.success).toBe(true);
      const internal = result.data!;

      // Verify tool_use was converted to tool_calls
      expect(internal.choices[0]?.message.toolCalls).toBeDefined();
      expect(internal.choices[0]?.message.toolCalls).toHaveLength(1);
      expect(internal.choices[0]?.message.toolCalls?.[0]?.id).toBe('call_2026010702051725c8baf07895474e_0');
      expect(internal.choices[0]?.message.toolCalls?.[0]?.type).toBe('function');
      expect(internal.choices[0]?.message.toolCalls?.[0]?.function?.name).toBe('calculator');

      // Verify usage was converted to camelCase
      expect(internal.usage?.promptTokens).toBe(1671);
      expect(internal.usage?.completionTokens).toBe(18);
      expect(internal.usage?.totalTokens).toBe(1689);
    });

    it('should handle GLM response with mixed text and tool_use blocks', () => {
      const glmResponse = {
        id: 'msg_glm001',
        object: 'chat.completion',
        created: 1767722719,
        model: 'glm-4-flash',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me calculate that for you.' },
              {
                type: 'tool_use',
                id: 'call_xyz',
                name: 'calculator',
                input: { expression: '2 + 2' }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 25,
          total_tokens: 75
        }
      };

      const result = converter.convertResponseToInternal(glmResponse);

      expect(result.success).toBe(true);
      const internal = result.data!;

      // Verify text was extracted
      expect(internal.choices[0]?.message.content).toBe('Let me calculate that for you.');

      // Verify tool_use was converted to tool_calls
      expect(internal.choices[0]?.message.toolCalls).toHaveLength(1);
      expect(internal.choices[0]?.message.toolCalls?.[0]?.function?.name).toBe('calculator');
    });

    it('should handle GLM response with camelCase usage fields', () => {
      const glmResponse = {
        id: 'msg_glm002',
        object: 'chat.completion',
        created: 1767722719,
        model: 'glm-4-air',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello'
          },
          finish_reason: 'stop'
        }],
        usage: {
          promptTokens: 100,  // camelCase
          completionTokens: 50,
          totalTokens: 150
        }
      };

      const result = converter.convertResponseToInternal(glmResponse);

      expect(result.success).toBe(true);
      const internal = result.data!;

      // Verify usage fields are preserved (already camelCase)
      expect(internal.usage?.promptTokens).toBe(100);
      expect(internal.usage?.completionTokens).toBe(50);
      expect(internal.usage?.totalTokens).toBe(150);
    });

    it('should handle GLM response with standard tool_calls (snake_case)', () => {
      const glmResponse = {
        id: 'msg_glm003',
        object: 'chat.completion',
        created: 1767722719,
        model: 'glm-4-air',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function',
                function: {
                  name: 'test_function',
                  arguments: '{}'
                }
              }
            ]
          },
          finish_reason: 'tool_calls'
        }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120
        }
      };

      const result = converter.convertResponseToInternal(glmResponse);

      expect(result.success).toBe(true);
      const internal = result.data!;

      // Verify tool_calls were extracted
      expect(internal.choices[0]?.message.toolCalls).toHaveLength(1);
      expect(internal.choices[0]?.message.toolCalls?.[0]?.id).toBe('call_abc');
    });
  });
});
