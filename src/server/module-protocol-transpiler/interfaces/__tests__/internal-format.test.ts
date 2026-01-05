/**
 * Internal Format Type Tests
 *
 * Type validation tests for internal-format.ts.
 * These tests ensure type definitions are correct and can be instantiated.
 */

import { describe, it, expect } from 'vitest';
import type {
  MessageRole,
  FinishReason,
  InternalContentBlock,
  TextContentBlock,
  ImageUrlContentBlock,
  ThinkingContentBlock,
  CacheControlContentBlock,
  InternalMessage,
  InternalTool,
  InternalToolCall,
  InternalRequest,
  InternalRequestWithMetadata,
  InternalChoice,
  InternalUsage,
  InternalResponse,
  InternalResponseWithMetadata,
  InternalStreamChunk,
  InternalError,
  InternalMetadata,
} from '../internal-format';

describe('internal-format types', () => {
  describe('MessageRole', () => {
    it('should accept valid message roles', () => {
      const roles: MessageRole[] = ['system', 'user', 'assistant', 'tool'];
      expect(roles).toHaveLength(4);
      expect(roles).toContain('system');
      expect(roles).toContain('user');
      expect(roles).toContain('assistant');
      expect(roles).toContain('tool');
    });
  });

  describe('FinishReason', () => {
    it('should accept valid finish reasons', () => {
      const reasons: FinishReason[] = ['stop', 'length', 'tool_calls', 'content_filter'];
      expect(reasons).toHaveLength(4);
      expect(reasons).toContain('stop');
      expect(reasons).toContain('length');
      expect(reasons).toContain('tool_calls');
    });
  });

  describe('Content Block Types', () => {
    describe('TextContentBlock', () => {
      it('should create valid text content block', () => {
        const block: TextContentBlock = {
          type: 'text',
          text: 'Hello, world!',
        };

        expect(block.type).toBe('text');
        expect(block.text).toBe('Hello, world!');
      });

      it('should accept empty text', () => {
        const block: TextContentBlock = {
          type: 'text',
          text: '',
        };

        expect(block.text).toBe('');
      });
    });

    describe('ImageUrlContentBlock', () => {
      it('should create valid image URL content block', () => {
        const block: ImageUrlContentBlock = {
          type: 'image_url',
          image_url: {
            url: 'https://example.com/image.png',
          },
        };

        expect(block.type).toBe('image_url');
        expect(block.image_url.url).toBe('https://example.com/image.png');
      });

      it('should accept data URL', () => {
        const block: ImageUrlContentBlock = {
          type: 'image_url',
          image_url: {
            url: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
          },
        };

        expect(block.image_url.url).toMatch(/^data:image\//);
      });
    });

    describe('ThinkingContentBlock', () => {
      it('should create valid thinking content block', () => {
        const block: ThinkingContentBlock = {
          type: 'thinking',
          thinking: 'Let me think about this...',
        };

        expect(block.type).toBe('thinking');
        expect(block.thinking).toBe('Let me think about this...');
      });

      it('should accept multi-line thinking', () => {
        const block: ThinkingContentBlock = {
          type: 'thinking',
          thinking: 'Line 1\nLine 2\nLine 3',
        };

        expect(block.thinking).toContain('\n');
      });
    });

    describe('CacheControlContentBlock', () => {
      it('should create valid cache control content block', () => {
        const block: CacheControlContentBlock = {
          type: 'cache_control',
          cache_control: { type: 'ephemeral' },
        };

        expect(block.type).toBe('cache_control');
        expect(block.cache_control.type).toBe('ephemeral');
      });
    });

    describe('InternalContentBlock (union type)', () => {
      it('should accept all content block types', () => {
        const blocks: InternalContentBlock[] = [
          { type: 'text', text: 'Hello' },
          { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
          { type: 'thinking', thinking: 'Thinking...' },
          { type: 'cache_control', cache_control: { type: 'ephemeral' } },
        ];

        expect(blocks).toHaveLength(4);
      });

      it('should discriminate by type field', () => {
        const blocks: InternalContentBlock[] = [
          { type: 'text', text: 'Hello' },
          { type: 'thinking', thinking: 'Thinking' },
        ];

        const textBlock = blocks.find(b => b.type === 'text') as TextContentBlock;
        expect(textBlock?.text).toBe('Hello');

        const thinkingBlock = blocks.find(b => b.type === 'thinking') as ThinkingContentBlock;
        expect(thinkingBlock?.thinking).toBe('Thinking');
      });
    });
  });

  describe('InternalMessage', () => {
    it('should create valid message with string content', () => {
      const message: InternalMessage = {
        role: 'user',
        content: 'Hello, assistant!',
      };

      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, assistant!');
    });

    it('should create valid message with content blocks', () => {
      const message: InternalMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
        ],
      };

      expect(message.role).toBe('user');
      expect(Array.isArray(message.content)).toBe(true);
      expect(message.content).toHaveLength(2);
    });

    it('should create valid message with name field', () => {
      const message: InternalMessage = {
        role: 'user',
        content: 'Hello',
        name: 'John',
      };

      expect(message.name).toBe('John');
    });

    it('should create valid message with tool_calls', () => {
      const message: InternalMessage = {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'calculator',
              arguments: '{"a": 1, "b": 2}',
            },
          },
        ],
      };

      expect(message.toolCalls).toHaveLength(1);
      expect(message.toolCalls?.[0]?.function.name).toBe('calculator');
    });

    it('should create valid message with tool_call_id', () => {
      const message: InternalMessage = {
        role: 'tool',
        content: 'Result: 3',
        toolCallId: 'call_123',
      };

      expect(message.toolCallId).toBe('call_123');
    });

    it('should accept all message roles', () => {
      const roles: MessageRole[] = ['system', 'user', 'assistant', 'tool'];

      roles.forEach(role => {
        const message: InternalMessage = {
          role,
          content: 'Test',
        };
        expect(message.role).toBe(role);
      });
    });
  });

  describe('InternalTool', () => {
    it('should create valid tool definition', () => {
      const tool: InternalTool = {
        type: 'function',
        function: {
          name: 'calculator',
          description: 'Performs mathematical calculations',
          parameters: {
            type: 'object',
            properties: {
              a: { type: 'number' },
              b: { type: 'number' },
            },
            required: ['a', 'b'],
          },
        },
      };

      expect(tool.type).toBe('function');
      expect(tool.function.name).toBe('calculator');
      expect(tool.function.description).toBe('Performs mathematical calculations');
      expect(tool.function.parameters?.type).toBe('object');
    });

    it('should create tool without optional fields', () => {
      const tool: InternalTool = {
        type: 'function',
        function: {
          name: 'simple_tool',
        },
      };

      expect(tool.function.name).toBe('simple_tool');
      expect(tool.function.description).toBeUndefined();
      expect(tool.function.parameters).toBeUndefined();
    });

    it('should accept empty parameters object', () => {
      const tool: InternalTool = {
        type: 'function',
        function: {
          name: 'no_params',
          parameters: {
            type: 'object',
          },
        },
      };

      expect(tool.function.parameters?.properties).toBeUndefined();
      expect(tool.function.parameters?.required).toBeUndefined();
    });
  });

  describe('InternalToolCall', () => {
    it('should create valid tool call', () => {
      const toolCall: InternalToolCall = {
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location": "San Francisco"}',
        },
      };

      expect(toolCall.id).toBe('call_abc123');
      expect(toolCall.type).toBe('function');
      expect(toolCall.function.name).toBe('get_weather');
      expect(toolCall.function.arguments).toBe('{"location": "San Francisco"}');
    });

    it('should accept empty arguments string', () => {
      const toolCall: InternalToolCall = {
        id: 'call_xyz',
        type: 'function',
        function: {
          name: 'no_args',
          arguments: '{}',
        },
      };

      expect(toolCall.function.arguments).toBe('{}');
    });
  });

  describe('InternalRequest', () => {
    it('should create valid minimal request', () => {
      const request: InternalRequest = {
        model: 'gpt-4',
        messages: [],
      };

      expect(request.model).toBe('gpt-4');
      expect(request.messages).toEqual([]);
    });

    it('should create valid request with all standard fields', () => {
      const request: InternalRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_tool',
              parameters: { type: 'object' },
            },
          },
        ],
        tool_choice: 'auto',
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 1000,
        stop: ['END'],
      };

      expect(request.model).toBe('gpt-4');
      expect(request.messages).toHaveLength(2);
      expect(request.tools).toHaveLength(1);
      expect(request.tool_choice).toBe('auto');
      expect(request.temperature).toBe(0.7);
      expect(request.topP).toBe(0.9);
      expect(request.maxTokens).toBe(1000);
      expect(request.stop).toEqual(['END']);
    });

    it('should support string stop parameter', () => {
      const request: InternalRequest = {
        model: 'gpt-4',
        messages: [],
        stop: 'END_TOKEN',
      };

      expect(request.stop).toBe('END_TOKEN');
    });

    it('should support tool_choice with function', () => {
      const request: InternalRequest = {
        model: 'gpt-4',
        messages: [],
        tool_choice: { type: 'function', function: { name: 'calculator' } },
      };

      expect(request.tool_choice).toEqual({ type: 'function', function: { name: 'calculator' } });
    });

    it('should support extended thinking feature', () => {
      const request: InternalRequest = {
        model: 'claude-3-opus',
        messages: [],
        thinking: {
          type: 'enabled',
          budget_tokens: 10000,
        },
      };

      expect(request.thinking?.type).toBe('enabled');
      expect(request.thinking?.budget_tokens).toBe(10000);
    });

    it('should support thinking without budget', () => {
      const request: InternalRequest = {
        model: 'claude-3-opus',
        messages: [],
        thinking: {
          type: 'disabled',
        },
      };

      expect(request.thinking?.type).toBe('disabled');
      expect(request.thinking?.budget_tokens).toBeUndefined();
    });

    it('should support tool_choice none', () => {
      const request: InternalRequest = {
        model: 'gpt-4',
        messages: [],
        tool_choice: 'none',
      };

      expect(request.tool_choice).toBe('none');
    });
  });

  describe('InternalRequestWithMetadata', () => {
    it('should extend InternalRequest with metadata', () => {
      const request: InternalRequestWithMetadata = {
        model: 'gpt-4',
        messages: [],
        _metadata: {
          requestTimestamp: Date.now(),
          vendor: 'openai',
          originalFormat: 'openai',
        },
      };

      expect(request._metadata.vendor).toBe('openai');
      expect(request._metadata.originalFormat).toBe('openai');
      expect(request.model).toBe('gpt-4');
    });

    it('should allow optional metadata fields', () => {
      const request: InternalRequestWithMetadata = {
        model: 'gpt-4',
        messages: [],
        _metadata: {
          requestTimestamp: Date.now(),
          vendor: 'openai',
        },
      };

      expect(request._metadata.originalFormat).toBeUndefined();
    });
  });

  describe('InternalChoice', () => {
    it('should create valid choice', () => {
      const choice: InternalChoice = {
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello!',
        },
        finishReason: 'stop',
      };

      expect(choice.index).toBe(0);
      expect(choice.message.role).toBe('assistant');
      expect(choice.message.content).toBe('Hello!');
      expect(choice.finishReason).toBe('stop');
    });

    it('should accept null finish_reason', () => {
      const choice: InternalChoice = {
        index: 0,
        message: { role: 'assistant', content: '' },
        finishReason: null,
      };

      expect(choice.finishReason).toBeNull();
    });

    it('should accept optional logprobs', () => {
      const choice: InternalChoice = {
        index: 0,
        message: { role: 'assistant', content: 'Test' },
        finishReason: 'stop',
        logprobs: { tokens: ['Hello'], token_logprobs: [-0.1], top_logprobs: [], text_offset: [] },
      };

      expect(choice.logprobs).toBeDefined();
    });
  });

  describe('InternalUsage', () => {
    it('should create valid usage with required fields', () => {
      const usage: InternalUsage = {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      };

      expect(usage.promptTokens).toBe(10);
      expect(usage.completionTokens).toBe(20);
    });

    it('should accept all extended token fields', () => {
      const usage: InternalUsage = {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        promptTokensDetails: {
          cachedTokens: 5,
        },
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
        thinkingTokens: 15,
      };

      expect(usage.promptTokensDetails?.cachedTokens).toBe(5);
      expect(usage.cacheReadTokens).toBe(3);
      expect(usage.cacheWriteTokens).toBe(2);
      expect(usage.thinkingTokens).toBe(15);
    });

    it('should accept some extended token fields', () => {
      const usage: InternalUsage = {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        promptTokensDetails: {
          cachedTokens: 5,
        },
        thinkingTokens: 15,
      };

      expect(usage.promptTokensDetails?.cachedTokens).toBe(5);
      expect(usage.thinkingTokens).toBe(15);
      expect(usage.cacheReadTokens).toBeUndefined();
    });
  });

  describe('InternalResponse', () => {
    it('should create valid minimal response', () => {
      const response: InternalResponse = {
        id: 'resp-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [],
      };

      expect(response.id).toBe('resp-123');
      expect(response.object).toBe('chat.completion');
      expect(response.model).toBe('gpt-4');
      expect(response.choices).toEqual([]);
    });

    it('should create valid response with all fields', () => {
      const response: InternalResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1677652288,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        systemFingerprint: 'fp_123',
      };

      expect(response.choices).toHaveLength(1);
      expect(response.usage?.promptTokens).toBe(10);
      expect(response.systemFingerprint).toBe('fp_123');
    });

    it('should support extended thinking in response', () => {
      const response: InternalResponse = {
        id: 'resp-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'claude-3-opus',
        choices: [],
        extended_thinking: {
          thinking_blocks: [
            { type: 'thinking', content: 'Let me analyze this...' },
          ],
        },
      };

      expect(response.extended_thinking?.thinking_blocks?.length).toBe(1);
      expect(response.extended_thinking?.thinking_blocks?.[0]?.content).toBe('Let me analyze this...');
    });

    it('should support multiple choices', () => {
      const response: InternalResponse = {
        id: 'resp-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'Choice 1' }, finishReason: 'stop' },
          { index: 1, message: { role: 'assistant', content: 'Choice 2' }, finishReason: 'stop' },
        ],
      };

      expect(response.choices).toHaveLength(2);
    });

    it('should support all finish reasons', () => {
      const reasons: FinishReason[] = ['stop', 'length', 'tool_calls', 'content_filter'];

      reasons.forEach(finishReason => {
        const response: InternalResponse = {
          id: 'resp-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4',
          choices: [
            { index: 0, message: { role: 'assistant', content: '' }, finishReason },
          ],
        };
        expect(response.choices?.[0]?.finishReason).toBe(finishReason);
      });
    });
  });

  describe('InternalResponseWithMetadata', () => {
    it('should extend InternalResponse with metadata', () => {
      const response: InternalResponseWithMetadata = {
        id: 'resp-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [],
        _metadata: {
          requestTimestamp: Date.now(),
          vendor: 'openai',
          originalFormat: 'openai',
        },
      };

      expect(response!._metadata.vendor).toBe('openai');
      expect(response!._metadata.originalFormat).toBe('openai');
    });

    it('should allow optional metadata fields', () => {
      const response: InternalResponseWithMetadata = {
        id: 'resp-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [],
        _metadata: {
          requestTimestamp: Date.now(),
          vendor: 'openai',
        },
      };

      expect(response!._metadata.originalFormat).toBeUndefined();
    });
  });

  describe('InternalStreamChunk', () => {
    it('should create valid stream chunk', () => {
      const chunk: InternalStreamChunk = {
        id: 'chunk-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: { content: 'Hello' },
            finishReason: null,
          },
        ],
      };

      expect(chunk.id).toBe('chunk-123');
      expect(chunk.object).toBe('chat.completion.chunk');
      expect(chunk.choices?.[0]?.delta.content).toBe('Hello');
    });

    it('should support delta with role', () => {
      const chunk: InternalStreamChunk = {
        id: 'chunk-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant' },
            finishReason: null,
          },
        ],
      };

      expect(chunk.choices?.[0]?.delta.role).toBe('assistant');
    });

    it('should support delta with tool_calls', () => {
      const chunk: InternalStreamChunk = {
        id: 'chunk-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {
              toolCalls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: { name: 'calc', arguments: '{}' },
                },
              ],
            },
            finishReason: null,
          },
        ],
      };

      expect(chunk.choices?.[0]?.delta.toolCalls).toHaveLength(1);
    });

    it('should support finish_reason in stream chunk', () => {
      const chunk: InternalStreamChunk = {
        id: 'chunk-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            delta: {},
            finishReason: 'stop',
          },
        ],
      };

      expect(chunk.choices?.[0]?.finishReason).toBe('stop');
    });

    it('should support multiple choices in stream chunk', () => {
      const chunk: InternalStreamChunk = {
        id: 'chunk-123',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
          { index: 0, delta: { content: 'A' }, finishReason: null },
          { index: 1, delta: { content: 'B' }, finishReason: null },
        ],
      };

      expect(chunk.choices).toHaveLength(2);
    });
  });

  describe('InternalError', () => {
    it('should create valid error with all fields', () => {
      const error: InternalError = {
        type: 'invalid_request',
        message: 'Invalid API key',
        code: 401,
        param: 'api_key',
      };

      expect(error.message).toBe('Invalid API key');
      expect(error.type).toBe('invalid_request');
      expect(error.code).toBe(401);
      expect(error.param).toBe('api_key');
    });

    it('should create minimal error with only message', () => {
      const error: InternalError = {
        type: 'api_error',
        message: 'Something went wrong',
      };

      expect(error.message).toBe('Something went wrong');
      expect(error.type).toBe('api_error');
      expect(error.code).toBeUndefined();
    });
  });

  describe('InternalMetadata', () => {
    it('should accept required and optional fields', () => {
      const metadata: InternalMetadata = {
        requestTimestamp: Date.now(),
        vendor: 'anthropic',
        responseTimestamp: Date.now(),
        latencyMs: 150,
        originalFormat: 'anthropic',
        requestId: 'req-123',
      };

      expect(metadata.requestTimestamp).toBeGreaterThan(0);
      expect(metadata.vendor).toBe('anthropic');
      expect(metadata.responseTimestamp).toBeGreaterThan(0);
      expect(metadata.latencyMs).toBe(150);
      expect(metadata.originalFormat).toBe('anthropic');
      expect(metadata.requestId).toBe('req-123');
    });

    it('should accept vendor-specific metadata', () => {
      const metadata: InternalMetadata = {
        requestTimestamp: Date.now(),
        vendor: 'anthropic',
        vendorSpecific: {
          apiVersion: '2023-06-01',
          processingTimeMs: 150,
        },
      };

      expect(metadata.vendor).toBe('anthropic');
      expect(metadata.vendorSpecific?.apiVersion).toBe('2023-06-01');
      expect(metadata.vendorSpecific?.processingTimeMs).toBe(150);
    });
  });

  describe('Type compatibility scenarios', () => {
    it('should handle text-only message', () => {
      const message: InternalMessage = {
        role: 'user',
        content: 'Simple text message',
      };

      expect(typeof message.content).toBe('string');
    });

    it('should handle multi-modal message', () => {
      const message: InternalMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
        ],
      };

      expect(Array.isArray(message.content)).toBe(true);
      expect(message.content).toHaveLength(2);
    });

    it('should handle tool calling message', () => {
      const message: InternalMessage = {
        role: 'assistant',
        content: 'Let me call a tool',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'tool', arguments: '{}' },
          },
        ],
      };

      expect(message.toolCalls).toBeDefined();
      expect(message.toolCalls).toHaveLength(1);
    });

    it('should handle tool response message', () => {
      const message: InternalMessage = {
        role: 'tool',
        content: 'Tool execution result',
        toolCallId: 'call_1',
      };

      expect(message.role).toBe('tool');
      expect(message.toolCallId).toBe('call_1');
    });

    it('should handle streaming response with thinking', () => {
      const chunk: InternalStreamChunk = {
        id: 'chunk-1',
        object: 'chat.completion.chunk',
        created: Date.now(),
        model: 'claude-3-opus',
        choices: [
          {
            index: 0,
            delta: { content: '<thinking>' },
            finishReason: null,
          },
        ],
      };

      expect(chunk.choices?.[0]?.delta.content).toBe('<thinking>');
    });

    it('should handle complete response with usage and thinking', () => {
      const response: InternalResponse = {
        id: 'resp-1',
        object: 'chat.completion',
        created: Date.now(),
        model: 'claude-3-opus',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: [
                { type: 'text', text: 'Final answer' },
              ],
            },
            finishReason: 'stop',
          },
        ],
        usage: {
          promptTokens: 50,
          completionTokens: 100,
          totalTokens: 150,
          thinkingTokens: 200,
        },
        extended_thinking: {
          thinking_blocks: [
            { type: 'thinking', content: 'Reasoning...' },
          ],
        },
      };

      expect(response.choices?.[0]?.finishReason).toBe('stop');
      expect(response.usage?.thinkingTokens).toBe(200);
      expect(response.extended_thinking?.thinking_blocks?.length).toBe(1);
    });
  });
});
