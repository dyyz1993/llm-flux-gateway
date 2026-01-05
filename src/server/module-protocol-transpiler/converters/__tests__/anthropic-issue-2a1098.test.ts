/**
 * Test for Issue 2a1098 - Protocol Conversion Errors
 *
 * This test verifies the fixes for three specific issues:
 * 1. cacheControl should be cache_control (snake_case for Anthropic API)
 * 2. required array should match properties field names
 * 3. Assistant message thinking blocks should be preserved
 */

import { describe, it, expect } from 'vitest';
import { expectSuccess } from '../../__tests__/test-helpers';
import { AnthropicConverter } from '../anthropic.converter';

describe('AnthropicConverter - Issue 2a1098 Fixes', () => {
  const converter = new AnthropicConverter();

  describe('Cache Control Field Normalization', () => {
    it('should convert cacheControl to cache_control in system prompt', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'test',
          },
        ],
        system: [
          {
            type: 'text',
            text: 'You are a helpful assistant',
            cacheControl: { type: 'ephemeral' },
          },
          {
            type: 'text',
            text: 'Additional instructions',
            cacheControl: { type: 'ephemeral' },
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request as any);

      expect(result.success).toBe(true);
      const anthropicRequest = expectSuccess(result);

      // Verify system is an array
      expect(Array.isArray(anthropicRequest.system)).toBe(true);

      // Verify cacheControl was converted to cache_control
      expect((anthropicRequest.system as any)?.[0])?.toHaveProperty('cache_control');
      expect((anthropicRequest.system as any)?.[0]?.cache_control?.type).toBe('ephemeral');
      expect((anthropicRequest.system as any)?.[0])?.not.toHaveProperty('cacheControl');

      expect((anthropicRequest.system as any)?.[1])?.toHaveProperty('cache_control');
      expect((anthropicRequest.system as any)?.[1]?.cache_control?.type).toBe('ephemeral');
      expect((anthropicRequest.system as any)?.[1])?.not.toHaveProperty('cacheControl');
    });

    it('should convert cacheControl to cache_control in user messages', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                cacheControl: { type: 'ephemeral' },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request as any);

      expect(result.success).toBe(true);
      const anthropicRequest = expectSuccess(result);

      // Verify cacheControl was converted to cache_control
      expect((anthropicRequest.messages as any)?.[0]?.content?.[0])?.toHaveProperty('cache_control');
      expect((anthropicRequest.messages as any)?.[0]?.content?.[0]?.cache_control?.type).toBe('ephemeral');
      expect((anthropicRequest.messages as any)?.[0]?.content?.[0])?.not.toHaveProperty('cacheControl');
    });

    it('should preserve cache_control when already in snake_case', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request as any);

      expect(result.success).toBe(true);
      const anthropicRequest = expectSuccess(result);

      // Verify cache_control is preserved
      expect((anthropicRequest.messages as any)?.[0]?.content?.[0])?.toHaveProperty('cache_control');
      expect((anthropicRequest.messages as any)?.[0]?.content?.[0]?.cache_control?.type).toBe('ephemeral');
    });
  });

  describe('Tool Schema Field Name Consistency', () => {
    it('should preserve tool schema properties as-is (bc93cb fix)', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'Task',
              description: 'Launch a new agent',
              parameters: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  prompt: { type: 'string' },
                  subagentType: { type: 'string' },
                  taskId: { type: 'string' },
                },
                required: ['description', 'prompt', 'subagentType', 'taskId'],
              },
            },
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request as any);

      expect(result.success).toBe(true);
      const anthropicRequest = expectSuccess(result);

      const tool = (anthropicRequest.tools as any)?.[0];
      expect(tool).toBeDefined();

      // Verify properties are preserved as-is (not converted to snake_case)
      expect(tool?.input_schema?.properties)?.toHaveProperty('subagentType');
      expect(tool?.input_schema?.properties)?.toHaveProperty('taskId');

      // Verify required array matches properties exactly
      expect(tool?.input_schema?.required)?.toContain('subagentType');
      expect(tool?.input_schema?.required)?.toContain('taskId');
      expect(tool?.input_schema?.required)?.not.toContain('subagent_type');
      expect(tool?.input_schema?.required)?.not.toContain('task_id');
    });

    it('should preserve snake_case properties in tool schemas (bc93cb fix)', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'test' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'Task',
              description: 'Launch a new agent',
              parameters: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  prompt: { type: 'string' },
                  subagent_type: { type: 'string' },
                  task_id: { type: 'string' },
                },
                required: ['description', 'prompt', 'subagent_type', 'task_id'],
              },
            },
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request as any);

      expect(result.success).toBe(true);
      const anthropicRequest = expectSuccess(result);

      const tool = (anthropicRequest.tools as any)?.[0];

      // Verify everything stays in snake_case (not converted to camelCase)
      expect(tool?.input_schema?.properties)?.toHaveProperty('subagent_type');
      expect(tool?.input_schema?.properties)?.toHaveProperty('task_id');
      expect(tool?.input_schema?.required)?.toContain('subagent_type');
      expect(tool?.input_schema?.required)?.toContain('task_id');
      expect(tool?.input_schema?.properties)?.not.toHaveProperty('subagentType');
      expect(tool?.input_schema?.properties)?.not.toHaveProperty('taskId');
    });
  });

  describe('Assistant Message Thinking Blocks Preservation', () => {
    it('should preserve thinking blocks in assistant messages', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'thinking',
                thinking: 'Let me think about this...',
                signature: 'abc123',
              },
              {
                type: 'text',
                text: 'Here is my response',
              },
            ],
          },
          {
            role: 'user',
            content: 'test',
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request as any);

      expect(result.success).toBe(true);
      const anthropicRequest = expectSuccess(result);

      const assistantMsg = (anthropicRequest.messages as any)?.[0];

      // Verify content is an array with both thinking and text blocks
      expect(Array.isArray(assistantMsg?.content)).toBe(true);
      expect(assistantMsg?.content)?.toHaveLength(2);

      // Verify thinking block is preserved
      expect(assistantMsg?.content?.[0]?.type).toBe('thinking');
      expect(assistantMsg?.content?.[0]?.thinking).toBe('Let me think about this...');
      expect(assistantMsg?.content?.[0]?.signature).toBe('abc123');

      // Verify text block is preserved
      expect(assistantMsg?.content?.[1]?.type).toBe('text');
      expect(assistantMsg?.content?.[1]?.text).toBe('Here is my response');
    });

    it('should preserve thinking blocks with cache_control in assistant messages', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'thinking',
                thinking: 'Reasoning...',
              },
              {
                type: 'text',
                text: 'Response',
              },
              {
                type: 'cache_control',
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
          {
            role: 'user',
            content: 'test',
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request as any);

      expect(result.success).toBe(true);
      const anthropicRequest = expectSuccess(result);

      const assistantMsg = (anthropicRequest.messages as any)?.[0];

      // Verify all blocks are preserved
      expect(Array.isArray(assistantMsg?.content)).toBe(true);
      expect(assistantMsg?.content)?.toHaveLength(3);

      expect(assistantMsg?.content?.[0]?.type).toBe('thinking');
      expect(assistantMsg?.content?.[1]?.type).toBe('text');
      expect(assistantMsg?.content?.[2]?.type).toBe('cache_control');
    });

    it('should handle assistant messages with only text (backward compatibility)', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'assistant',
            content: 'Simple text response',
          },
          {
            role: 'user',
            content: 'test',
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request as any);

      expect(result.success).toBe(true);
      const anthropicRequest = expectSuccess(result);

      const assistantMsg = (anthropicRequest.messages as any)?.[0];

      // Verify content is a simple string (backward compatible)
      expect(typeof assistantMsg?.content).toBe('string');
      expect(assistantMsg?.content).toBe('Simple text response');
    });
  });

  describe('Combined Scenarios from Issue 2a1098', () => {
    it('should handle all three issues in a single request', () => {
      const request = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'thinking',
                thinking: 'The user just said "hi"',
              },
              {
                type: 'text',
                text: 'Hi! How can I help you?',
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'hi',
                cacheControl: { type: 'ephemeral' },
              },
            ],
          },
        ],
        system: [
          {
            type: 'text',
            text: 'You are Claude Code',
            cacheControl: { type: 'ephemeral' },
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'Task',
              parameters: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  prompt: { type: 'string' },
                  subagentType: { type: 'string' },
                },
                required: ['description', 'prompt', 'subagentType'],
              },
            },
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request as any);

      expect(result.success).toBe(true);
      const anthropicRequest = expectSuccess(result);

      // Verify cacheControl → cache_control in system
      expect((anthropicRequest.system as any)?.[0]?.cache_control?.type).toBe('ephemeral');
      expect((anthropicRequest.system as any)?.[0])?.not.toHaveProperty('cacheControl');

      // Verify cacheControl → cache_control in user message
      expect((anthropicRequest.messages as any)?.[1]?.content?.[0]?.cache_control?.type).toBe('ephemeral');
      expect((anthropicRequest.messages as any)?.[1]?.content?.[0])?.not.toHaveProperty('cacheControl');

      // Verify thinking blocks preserved in assistant message
      expect((anthropicRequest.messages as any)?.[0]?.content?.[0]?.type).toBe('thinking');
      expect((anthropicRequest.messages as any)?.[0]?.content?.[0]?.thinking).toBe('The user just said "hi"');

      // Verify tool schema properties preserved as-is (not converted to snake_case)
      const tool = (anthropicRequest.tools as any)?.[0];
      expect(tool?.input_schema?.properties)?.toHaveProperty('subagentType');
      expect(tool?.input_schema?.properties)?.not.toHaveProperty('subagent_type');
      expect(tool?.input_schema?.required)?.toContain('subagentType');
      expect(tool?.input_schema?.required)?.not.toContain('subagent_type');
    });
  });
});
