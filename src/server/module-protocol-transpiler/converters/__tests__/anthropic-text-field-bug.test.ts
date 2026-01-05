/**
 * Test for Issue: text field format bug in convertResponseFromInternal
 *
 * Bug: When message.content is an array (structured content), the old code
 *      would directly assign the entire array to the text field, causing
 *      `.text.trim is not a function` errors.
 *
 * Fix: Check if message.content is a string or array, and handle appropriately.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicConverter } from '../anthropic.converter';

describe('AnthropicConverter - Text Field Format Bug Fix', () => {
  let converter: AnthropicConverter;

  beforeEach(() => {
    converter = new AnthropicConverter();
  });

  describe('convertResponseFromInternal with structured content', () => {
    it('should handle string content correctly', () => {
      const internalResponse = {
        id: 'msg_123',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'Simple string response',
            },
            finishReason: 'stop' as const,
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const anthropicResponse = result.data!;

      expect(Array.isArray(anthropicResponse!.content)).toBe(true);
      expect(anthropicResponse!.content).toHaveLength(1);
      expect(anthropicResponse!.content[0].type).toBe('text');
      expect(typeof anthropicResponse!.content[0].text).toBe('string');
      expect(anthropicResponse!.content[0].text).toBe('Simple string response');

      // Verify we can call string methods on text field
      expect(() => anthropicResponse!.content[0].text.trim()).not.toThrow();
      expect(anthropicResponse!.content[0].text.trim()).toBe('Simple string response');
    });

    it('should handle array content with text blocks correctly', () => {
      const internalResponse = {
        id: 'msg_456',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text' as const, text: 'Text from array content' },
              ],
            },
            finishReason: 'stop' as const,
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const anthropicResponse = result.data!;

      expect(Array.isArray(anthropicResponse!.content)).toBe(true);
      expect(anthropicResponse!.content).toHaveLength(1);
      expect(anthropicResponse!.content[0].type).toBe('text');
      expect(typeof anthropicResponse!.content[0].text).toBe('string');
      expect(anthropicResponse!.content[0].text).toBe('Text from array content');

      // Verify we can call string methods on text field
      expect(() => anthropicResponse!.content[0].text.trim()).not.toThrow();
      expect(anthropicResponse!.content[0].text.trim()).toBe('Text from array content');
    });

    it('should handle array content with thinking + text blocks correctly', () => {
      const internalResponse = {
        id: 'msg_789',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'thinking' as const, thinking: 'Let me think...' },
                { type: 'text' as const, text: 'Here is my answer.' },
              ],
            },
            finishReason: 'stop' as const,
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
        },
        extended_thinking: {
          thinking_blocks: [
            { type: 'thinking' as const, content: 'Let me think...' },
          ],
        },
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const anthropicResponse = result.data!;

      expect(Array.isArray(anthropicResponse!.content)).toBe(true);
      expect(anthropicResponse!.content).toHaveLength(2);

      // First block should be thinking
      expect(anthropicResponse!.content[0].type).toBe('thinking');
      expect(anthropicResponse!.content[0].content).toBe('Let me think...');

      // Second block should be text with STRING type
      expect(anthropicResponse!.content[1].type).toBe('text');
      expect(typeof anthropicResponse!.content[1].text).toBe('string');
      expect(anthropicResponse!.content[1].text).toBe('Here is my answer.');

      // Verify we can call string methods on text field
      expect(() => anthropicResponse!.content[1].text.trim()).not.toThrow();
      expect(anthropicResponse!.content[1].text.trim()).toBe('Here is my answer.');
    });

    it('should handle array content with text + tool_use blocks correctly', () => {
      const internalResponse = {
        id: 'msg_tool',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text' as const, text: 'I will search for that.' },
                {
                  type: 'tool_use' as const,
                  id: 'toolu_123',
                  name: 'web_search',
                  input: { query: 'test' },
                },
              ],
              toolCalls: [
                {
                  id: 'toolu_123',
                  type: 'function' as const,
                  function: {
                    name: 'web_search',
                    arguments: '{"query":"test"}',
                  },
                },
              ],
            },
            finishReason: 'tool_calls' as const,
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 15,
          totalTokens: 25,
        },
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const anthropicResponse = result.data!;

      expect(Array.isArray(anthropicResponse!.content)).toBe(true);
      expect(anthropicResponse!.content).toHaveLength(2);

      // First block should be text with STRING type
      expect(anthropicResponse!.content[0].type).toBe('text');
      expect(typeof anthropicResponse!.content[0].text).toBe('string');
      expect(anthropicResponse!.content[0].text).toBe('I will search for that.');

      // Verify we can call string methods on text field
      expect(() => anthropicResponse!.content[0].text.trim()).not.toThrow();
      expect(anthropicResponse!.content[0].text.trim()).toBe('I will search for that.');

      // Second block should be tool_use
      expect(anthropicResponse!.content[1].type).toBe('tool_use');
      expect(anthropicResponse!.content[1].id).toBe('toolu_123');
      expect(anthropicResponse!.content[1].name).toBe('web_search');
    });

    it('should not duplicate tool_use blocks', () => {
      const internalResponse = {
        id: 'msg_no_dup',
        object: 'chat.completion' as const,
        created: Date.now(),
        model: 'claude-3-5-sonnet-20241022',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: [
                { type: 'text' as const, text: 'Text before tool.' },
                {
                  type: 'tool_use' as const,
                  id: 'toolu_456',
                  name: 'calculator',
                  input: { expression: '2+2' },
                },
              ],
              toolCalls: [
                {
                  id: 'toolu_456',
                  type: 'function' as const,
                  function: {
                    name: 'calculator',
                    arguments: '{"expression":"2+2"}',
                  },
                },
              ],
            },
            finishReason: 'tool_calls' as const,
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 10,
          totalTokens: 20,
        },
      };

      const result = converter.convertResponseFromInternal(internalResponse);

      expect(result.success).toBe(true);
      const anthropicResponse = result.data!;

      // Should have exactly 2 blocks: text and tool_use (not duplicated)
      expect(anthropicResponse!.content).toHaveLength(2);

      // Count tool_use blocks
      const toolUseCount = anthropicResponse!.content.filter(
        (block: any) => block.type === 'tool_use'
      ).length;
      expect(toolUseCount).toBe(1);

      // Verify text block is correct
      expect(anthropicResponse!.content[0].type).toBe('text');
      expect(typeof anthropicResponse!.content[0].text).toBe('string');
      expect(anthropicResponse!.content[0].text).toBe('Text before tool.');
    });
  });

  describe('round-trip conversion (anthropic -> internal -> anthropic)', () => {
    it('should preserve text field as string through full round-trip with thinking', () => {
      const originalAnthropic = {
        id: 'msg_round1',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          { type: 'thinking' as const, content: 'Thinking process...' },
          { type: 'text' as const, text: 'Final answer.' },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn' as const,
        usage: {
          input_tokens: 10,
          output_tokens: 15,
        },
      };

      // Step 1: Anthropic -> Internal
      const toInternalResult = converter.convertResponseToInternal(originalAnthropic);
      expect(toInternalResult.success).toBe(true);

      // Step 2: Internal -> Anthropic
      const fromInternalResult = converter.convertResponseFromInternal(toInternalResult.data!);
      expect(fromInternalResult.success).toBe(true);

      const finalAnthropic = fromInternalResult.data!;

      // Verify structure is preserved
      expect(Array.isArray(finalAnthropic.content)).toBe(true);
      expect(finalAnthropic.content).toHaveLength(2);

      // Verify text field is a string
      const textBlock = finalAnthropic.content.find((b: any) => b.type === 'text');
      expect(textBlock).toBeDefined();
      expect(typeof textBlock.text).toBe('string');
      expect(textBlock.text).toBe('Final answer.');

      // Verify we can call string methods
      expect(() => textBlock.text.trim()).not.toThrow();
      expect(textBlock.text.trim()).toBe('Final answer.');
    });

    it('should preserve text field as string through full round-trip with tool_use', () => {
      const originalAnthropic = {
        id: 'msg_round2',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          { type: 'text' as const, text: 'Calling tool now.' },
          {
            type: 'tool_use' as const,
            id: 'toolu_789',
            name: 'test_func',
            input: { param: 'value' },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use' as const,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      // Step 1: Anthropic -> Internal
      const toInternalResult = converter.convertResponseToInternal(originalAnthropic);
      expect(toInternalResult.success).toBe(true);

      // Step 2: Internal -> Anthropic
      const fromInternalResult = converter.convertResponseFromInternal(toInternalResult.data!);
      expect(fromInternalResult.success).toBe(true);

      const finalAnthropic = fromInternalResult.data!;

      // Verify structure is preserved
      expect(Array.isArray(finalAnthropic.content)).toBe(true);
      expect(finalAnthropic.content).toHaveLength(2);

      // Verify text field is a string
      const textBlock = finalAnthropic.content.find((b: any) => b.type === 'text');
      expect(textBlock).toBeDefined();
      expect(typeof textBlock.text).toBe('string');
      expect(textBlock.text).toBe('Calling tool now.');

      // Verify we can call string methods
      expect(() => textBlock.text.trim()).not.toThrow();
      expect(textBlock.text.trim()).toBe('Calling tool now.');
    });
  });
});
