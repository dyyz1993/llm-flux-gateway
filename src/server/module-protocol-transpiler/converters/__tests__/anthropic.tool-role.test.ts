/**
 * Anthropic Converter - Tool Role Message Tests
 *
 * Tests the conversion of OpenAI tool role messages to Anthropic tool_result format.
 *
 * Background:
 * - OpenAI format uses separate messages with role="tool" for tool results
 * - Anthropic format embeds tool results as tool_result content blocks in user messages
 * - GLM API (Anthropic-compatible endpoint) only accepts 'user' or 'assistant' roles
 *
 * This test suite verifies that tool messages are correctly converted when converting
 * from OpenAI format to Anthropic format.
 */

import { describe, it, expect } from 'vitest';
import { AnthropicConverter } from '../anthropic.converter';
import type { InternalRequest } from '../../interfaces/internal-format';
import { expectSuccess } from '../../__tests__/test-helpers';

describe('AnthropicConverter - Tool Role Message Conversion', () => {
  const converter = new AnthropicConverter();

  describe('Basic tool role conversion', () => {
    it('should convert a single tool message to tool_result content block', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'What is the weather in San Francisco?',
          },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_abc123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city": "San Francisco"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_abc123',
            content: '{"temperature": "15°C", "condition": "Sunny"}',
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.messages).toBeDefined();

      // Should have 3 messages:
      // 1. User message with original query
      // 2. Assistant message (empty in this case)
      // 3. User message with tool_result content block
      expect(data.messages.length).toBe(3);

      expect((data.messages?.[0] as any).role).toBe('user');
      expect((data.messages?.[0] as any).content).toBe('What is the weather in San Francisco?');

      expect(data.messages[1].role).toBe('assistant');
      expect(data.messages[1].content).toBe('');

      expect(data.messages[2].role).toBe('user');
      expect(Array.isArray(data.messages[2].content)).toBe(true);
      expect(data.messages[2].content[0] as any).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_abc123',
        content: '{"temperature": "15°C", "condition": "Sunny"}',
      });
    });

    it('should convert multiple tool messages to multiple tool_result blocks', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'What is the weather in SF and NY?',
          },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_sf',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city": "San Francisco"}',
                },
              },
              {
                id: 'call_ny',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city": "New York"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_sf',
            content: '{"temperature": "15°C"}',
          },
          {
            role: 'tool',
            toolCallId: 'call_ny',
            content: '{"temperature": "10°C"}',
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.messages).toBeDefined();

      // Should have 3 messages (user, assistant, user with 2 tool_results)
      expect(data.messages.length).toBe(3);

      const userMessageWithToolResults = data.messages[2];
      expect(userMessageWithToolResults.role).toBe('user');
      expect(Array.isArray(userMessageWithToolResults.content)).toBe(true);
      expect(userMessageWithToolResults.content).toHaveLength(2);

      expect(userMessageWithToolResults.content[0] as any).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_sf',
        content: '{"temperature": "15°C"}',
      });

      expect(userMessageWithToolResults.content[1]).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_ny',
        content: '{"temperature": "10°C"}',
      });
    });

    it('should handle tool messages without tool_call_id', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'What is the weather?',
          },
          {
            role: 'assistant',
            content: '',
          },
          {
            role: 'tool',
            content: '{"temperature": "20°C"}',
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.messages).toBeDefined();
      expect(data.messages.length).toBe(3);

      // Should use a placeholder tool_use_id when tool_call_id is missing
      const userMessageWithToolResults = data.messages[2];
      expect(userMessageWithToolResults.role).toBe('user');
      expect(Array.isArray(userMessageWithToolResults.content)).toBe(true);
      expect((userMessageWithToolResults.content[0] as any).type).toBe('tool_result');
      expect((userMessageWithToolResults.content[0] as any).tool_use_id).toBe('unknown_0');
      expect((userMessageWithToolResults.content[0] as any).content).toBe('{"temperature": "20°C"}');
    });
  });

  describe('Complex conversation flows', () => {
    it('should handle multiple rounds of tool calls', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'What is the weather in SF?',
          },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city": "San Francisco"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_1',
            content: '{"temperature": "15°C"}',
          },
          {
            role: 'assistant',
            content: 'The weather in San Francisco is 15°C.',
          },
          {
            role: 'user',
            content: 'What about New York?',
          },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_2',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city": "New York"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_2',
            content: '{"temperature": "10°C"}',
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.messages).toBeDefined();

      // Should have 8 messages:
      // 1. User: What is the weather in SF?
      // 2. Assistant: (empty)
      // 3. User: tool_result for call_1
      // 4. Assistant: The weather in San Francisco is 15°C.
      // 5. User: What about New York?
      // 6. Assistant: (empty)
      // 7. User: tool_result for call_2
      expect(data.messages.length).toBe(7);

      // Verify first tool result
      expect(data.messages[2].role).toBe('user');
      expect(Array.isArray(data.messages[2].content)).toBe(true);
      expect(data.messages[2].content[0] as any).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_1',
        content: '{"temperature": "15°C"}',
      });

      // Verify assistant response
      expect((result.data!.messages as any)[3].role).toBe('assistant');
      expect((result.data!.messages as any)[3].content).toBe('The weather in San Francisco is 15°C.');

      // Verify second tool result
      expect((result.data!.messages as any)[6].role).toBe('user');
      expect(Array.isArray((result.data!.messages as any)[6].content)).toBe(true);
      expect((result.data!.messages as any)[6].content[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'call_2',
        content: '{"temperature": "10°C"}',
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle tool message with object content', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Get user info',
          },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'get_user',
                  arguments: '{"id": 123}',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_123',
            content: {
              name: 'John',
              age: 30,
            } as any,
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const toolResultMessage = data.messages[2];
      expect(toolResultMessage.role).toBe('user');
      expect(Array.isArray(toolResultMessage.content)).toBe(true);
      expect((toolResultMessage.content[0] as any).type).toBe('tool_result');
      expect((toolResultMessage.content[0] as any).tool_use_id).toBe('call_123');
      // Object content should be stringified
      expect((toolResultMessage.content[0] as any).content).toBe('{"name":"John","age":30}');
    });

    it('should handle no tool messages', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello!',
          },
          {
            role: 'assistant',
            content: 'Hi there!',
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.messages).toBeDefined();
      expect(data.messages.length).toBe(2);
      expect((data.messages?.[0] as any).role).toBe('user');
      expect(data.messages[1].role).toBe('assistant');
    });

    it('should preserve other message properties', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Hello',
            name: 'test_user' as any,
          },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'test',
                  arguments: '{}',
                },
              },
            ],
          },
          {
            role: 'tool',
            toolCallId: 'call_1',
            content: '{"result": "ok"}',
            name: 'test_tool',
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;

      // User message should preserve name property
      expect((data.messages?.[0] as any).name).toBe('test_user');

      // Tool result should be converted correctly
      expect(data.messages[2].role).toBe('user');
      expect(Array.isArray(data.messages[2].content)).toBe(true);
      expect((data.messages[2].content[0] as any).tool_use_id).toBe('call_1');
    });
  });

  describe('Real-world scenario from request 8defcc', () => {
    it('should match the exact conversion from real data', () => {
      const request: InternalRequest = {
        model: 'glm-4-air',
        messages: [
          {
            role: 'user',
            content: 'What is the current weather in San Francisco?',
          },
          {
            role: 'assistant',
            content: '',
          },
          {
            role: 'tool',
            content: '{"location":"San Francisco","temperature":"15°C","condition":"Sunny"}',
          },
        ],
        maxTokens: 4096,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a city',
              parameters: {
                type: 'object',
                properties: {
                  city: {
                    type: 'string',
                    description: 'City name',
                  },
                },
                required: ['city'],
              },
            },
          },
        ],
        stream: true,
      };

      const result = converter.convertRequestFromInternal(request);

      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      expect(data.model).toBe('glm-4-air');
      expect(data.max_tokens).toBe(4096);
      expect(data.stream).toBe(true);

      // Verify tool definitions are converted
      expect(data.tools).toBeDefined();
      expect(data.tools[0] as any).toEqual({
        name: 'get_weather',
        description: 'Get weather for a city',
        input_schema: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: 'City name',
            },
          },
          required: ['city'],
        },
      });

      // Verify messages are converted correctly
      expect((result.data!.messages as any).length).toBe(3);
      expect((result.data!.messages as any)[0]).toEqual({
        role: 'user',
        content: 'What is the current weather in San Francisco?',
      });
      expect((result.data!.messages as any)[1]).toEqual({
        role: 'assistant',
        content: '',
      });
      expect((result.data!.messages as any)[2].role).toBe('user');
      expect(Array.isArray((result.data!.messages as any)[2].content)).toBe(true);
      expect((result.data!.messages as any)[2].content[0]).toEqual({
        type: 'tool_result',
        tool_use_id: 'unknown_0',
        content: '{"location":"San Francisco","temperature":"15°C","condition":"Sunny"}',
      });
    });
  });
});
