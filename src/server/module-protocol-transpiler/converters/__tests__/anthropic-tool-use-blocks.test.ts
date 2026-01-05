/**
 * Anthropic Converter - Tool Use Blocks Tests
 *
 * Tests the conversion of assistant messages containing tool_use blocks.
 *
 * Background:
 * - Tool use blocks are used when assistant wants to call tools/functions
 * - Each tool_use block has: id, name, input, and optional cache_control
 * - Assistant messages can contain multiple tool_use blocks
 * - Assistant messages can mix tool_use blocks with text and cache_control
 *
 * This test suite verifies that tool_use blocks are correctly preserved
 * when converting from internal format to Anthropic format.
 */

import { describe, it, expect } from 'vitest';
import { expectSuccess } from '../../__tests__/test-helpers';
import { AnthropicConverter } from '../anthropic.converter';
import type { InternalRequest } from '../../interfaces/internal-format';

describe('AnthropicConverter - Tool Use Blocks', () => {
  const converter = new AnthropicConverter();

  describe('Single tool_use block', () => {
    it('should preserve a single tool_use block in assistant message', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'What files are in the current directory?',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_abc123',
                name: 'Bash',
                input: {
                  command: 'ls',
                  description: 'List files in current directory',
                },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const anthropicRequest = result.data!;

      // Verify message structure
      expect((anthropicRequest.messages as any)).toHaveLength(2);
      expect((anthropicRequest.messages as any)?.[0].role).toBe('user');
      expect((anthropicRequest.messages as any)?.[0].content).toBe('What files are in the current directory?');

      // Verify assistant message with tool_use block
      const assistantMsg = (anthropicRequest.messages as any)[1];
      expect(assistantMsg.role).toBe('assistant');
      expect(Array.isArray(assistantMsg.content)).toBe(true);
      expect(assistantMsg.content).toHaveLength(1);

      // Verify tool_use block structure
      const toolUseBlock = assistantMsg.content[0];
      expect(toolUseBlock.type).toBe('tool_use');
      expect(toolUseBlock.id).toBe('call_abc123');
      expect(toolUseBlock.name).toBe('Bash');
      expect(toolUseBlock.input).toEqual({
        command: 'ls',
        description: 'List files in current directory',
      });
    });

    it('should preserve tool_use block with cache_control', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'List files',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_xyz789',
                name: 'Bash',
                input: {
                  command: 'ls -la',
                },
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMsg = (data.messages as any)[1];

      // Verify tool_use block with cache_control
      expect(assistantMsg.content).toHaveLength(1);
      expect(assistantMsg.content[0].type).toBe('tool_use');
      expect(assistantMsg.content[0].id).toBe('call_xyz789');
      expect(assistantMsg.content[0].name).toBe('Bash');
      expect(assistantMsg.content[0].input).toEqual({ command: 'ls -la' });
      expect(assistantMsg.content[0].cache_control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('Multiple tool_use blocks', () => {
    it('should preserve multiple tool_use blocks in assistant message', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'List files and show directory tree',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_abc123',
                name: 'Bash',
                input: {
                  command: 'find . -type f -name "*.swift" | head -20',
                  description: 'List Swift source files',
                },
              },
              {
                type: 'tool_use',
                id: 'call_def456',
                name: 'Bash',
                input: {
                  command: 'ls -la /Users/xuyingzhou/Project/study-mac-app/quite-note',
                  description: 'List root directory contents',
                },
              },
              {
                type: 'tool_use',
                id: 'call_ghi789',
                name: 'Bash',
                input: {
                  command: 'tree -L 3 -I \'node_modules|.git|.build\' /Users/xuyingzhou/Project/study-mac-app/quite-note',
                  description: 'Show directory tree structure',
                },
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMsg = (data.messages as any)[1];

      // Verify all three tool_use blocks are preserved
      expect(Array.isArray(assistantMsg.content)).toBe(true);
      expect(assistantMsg.content).toHaveLength(3);

      // Verify first tool_use block
      expect(assistantMsg.content[0].type).toBe('tool_use');
      expect(assistantMsg.content[0].id).toBe('call_abc123');
      expect(assistantMsg.content[0].name).toBe('Bash');
      expect(assistantMsg.content[0].input.command).toBe('find . -type f -name "*.swift" | head -20');

      // Verify second tool_use block
      expect(assistantMsg.content[1].type).toBe('tool_use');
      expect(assistantMsg.content[1].id).toBe('call_def456');
      expect(assistantMsg.content[1].name).toBe('Bash');
      expect(assistantMsg.content[1].input.command).toBe('ls -la /Users/xuyingzhou/Project/study-mac-app/quite-note');

      // Verify third tool_use block with cache_control
      expect(assistantMsg.content[2].type).toBe('tool_use');
      expect(assistantMsg.content[2].id).toBe('call_ghi789');
      expect(assistantMsg.content[2].name).toBe('Bash');
      expect(assistantMsg.content[2].input.command).toBe('tree -L 3 -I \'node_modules|.git|.build\' /Users/xuyingzhou/Project/study-mac-app/quite-note');
      expect(assistantMsg.content[2].cache_control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('Mixed content (text + tool_use)', () => {
    it('should preserve text and tool_use blocks together', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Find TypeScript files',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I\'ll search for TypeScript files in the project.',
              },
              {
                type: 'tool_use',
                id: 'call_ts_search',
                name: 'Bash',
                input: {
                  command: 'find . -name "*.ts" -type f',
                },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMsg = (data.messages as any)[1];

      // Verify both text and tool_use blocks are preserved
      expect(Array.isArray(assistantMsg.content)).toBe(true);
      expect(assistantMsg.content).toHaveLength(2);

      // Verify text block comes first
      expect(assistantMsg.content[0].type).toBe('text');
      expect(assistantMsg.content[0].text).toBe('I\'ll search for TypeScript files in the project.');

      // Verify tool_use block comes after text
      expect(assistantMsg.content[1].type).toBe('tool_use');
      expect(assistantMsg.content[1].id).toBe('call_ts_search');
      expect(assistantMsg.content[1].name).toBe('Bash');
      expect(assistantMsg.content[1].input.command).toBe('find . -name "*.ts" -type f');
    });

    it('should preserve text, tool_use, and another tool_use', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Show me the project structure',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I\'ll explore the project structure for you.',
              },
              {
                type: 'tool_use',
                id: 'call_files',
                name: 'Bash',
                input: {
                  command: 'ls',
                },
              },
              {
                type: 'tool_use',
                id: 'call_tree',
                name: 'Bash',
                input: {
                  command: 'tree -L 2',
                },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMsg = (data.messages as any)[1];

      // Verify all blocks are preserved
      expect(Array.isArray(assistantMsg.content)).toBe(true);
      expect(assistantMsg.content).toHaveLength(3);

      expect(assistantMsg.content[0].type).toBe('text');
      expect(assistantMsg.content[0].text).toBe('I\'ll explore the project structure for you.');

      expect(assistantMsg.content[1].type).toBe('tool_use');
      expect(assistantMsg.content[1].id).toBe('call_files');

      expect(assistantMsg.content[2].type).toBe('tool_use');
      expect(assistantMsg.content[2].id).toBe('call_tree');
    });
  });

  describe('Mixed content (tool_use + cache_control)', () => {
    it('should preserve tool_use and cache_control blocks', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Search for files',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_search',
                name: 'Bash',
                input: {
                  command: 'find . -name "*.ts"',
                },
              },
              {
                type: 'cache_control',
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMsg = (data.messages as any)[1];

      // Verify both blocks are preserved
      expect(Array.isArray(assistantMsg.content)).toBe(true);
      expect(assistantMsg.content).toHaveLength(2);

      expect(assistantMsg.content[0].type).toBe('tool_use');
      expect(assistantMsg.content[0].id).toBe('call_search');

      expect(assistantMsg.content[1].type).toBe('cache_control');
      expect(assistantMsg.content[1].cache_control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('Complete scenario (text + tool_use + cache_control)', () => {
    it('should preserve all block types in correct order', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Explore the codebase',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I\'ll help you explore the codebase structure.',
              },
              {
                type: 'tool_use',
                id: 'call_explore_1',
                name: 'Bash',
                input: {
                  command: 'find . -type f -name "*.swift" | head -20',
                  description: 'List Swift source files',
                },
              },
              {
                type: 'tool_use',
                id: 'call_explore_2',
                name: 'Bash',
                input: {
                  command: 'ls -la /Users/xuyingzhou/Project/study-mac-app/quite-note',
                  description: 'List root directory contents',
                },
              },
              {
                type: 'tool_use',
                id: 'call_explore_3',
                name: 'Bash',
                input: {
                  command: 'tree -L 3 -I \'node_modules|.git|.build\' /Users/xuyingzhou/Project/study-mac-app/quite-note',
                  description: 'Show directory tree structure',
                },
                cache_control: { type: 'ephemeral' },
              },
              {
                type: 'cache_control',
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMsg = (data.messages as any)[1];

      // Verify all blocks are preserved in correct order
      expect(Array.isArray(assistantMsg.content)).toBe(true);
      expect(assistantMsg.content).toHaveLength(5);

      // Verify text block
      expect(assistantMsg.content[0].type).toBe('text');
      expect(assistantMsg.content[0].text).toBe('I\'ll help you explore the codebase structure.');

      // Verify first tool_use block
      expect(assistantMsg.content[1].type).toBe('tool_use');
      expect(assistantMsg.content[1].id).toBe('call_explore_1');
      expect(assistantMsg.content[1].name).toBe('Bash');
      expect(assistantMsg.content[1].input.command).toBe('find . -type f -name "*.swift" | head -20');

      // Verify second tool_use block
      expect(assistantMsg.content[2].type).toBe('tool_use');
      expect(assistantMsg.content[2].id).toBe('call_explore_2');
      expect(assistantMsg.content[2].name).toBe('Bash');
      expect(assistantMsg.content[2].input.command).toBe('ls -la /Users/xuyingzhou/Project/study-mac-app/quite-note');

      // Verify third tool_use block with cache_control
      expect(assistantMsg.content[3].type).toBe('tool_use');
      expect(assistantMsg.content[3].id).toBe('call_explore_3');
      expect(assistantMsg.content[3].name).toBe('Bash');
      expect(assistantMsg.content[3].cache_control).toEqual({ type: 'ephemeral' });

      // Verify cache_control block at the end
      expect(assistantMsg.content[4].type).toBe('cache_control');
      expect(assistantMsg.content[4].cache_control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('Real data from request 4e5a1a4b', () => {
    it('should match the exact structure from real data', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                text: 'You are Claude Code, Anthropic\'s official CLI for Claude.',
                cache_control: { type: 'ephemeral' },
              },
              {
                type: 'text',
                text: 'You are a file search specialist for Claude Code.',
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
          {
            role: 'user',
            content: 'Please explore the project',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_acabbaf8ef00414bbcaa0899',
                name: 'Bash',
                input: {
                  command: 'find . -type f -name "*.swift" | head -20',
                  description: 'List Swift source files',
                },
              },
              {
                type: 'tool_use',
                id: 'call_15b8c589c54144fabea284ab',
                name: 'Bash',
                input: {
                  command: 'ls -la /Users/xuyingzhou/Project/study-mac-app/quite-note',
                  description: 'List root directory contents',
                },
              },
              {
                type: 'tool_use',
                id: 'call_fc10b6b5b5734368a600abc4',
                name: 'Bash',
                input: {
                  command: 'tree -L 3 -I \'node_modules|.git|.build\' /Users/xuyingzhou/Project/study-mac-app/quite-note',
                  description: 'Show directory tree structure',
                },
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const anthropicRequest = result.data!;

      // Verify system blocks
      expect(Array.isArray(anthropicRequest.system)).toBe(true);
      expect((anthropicRequest.system as any)).toHaveLength(2);
      expect((anthropicRequest.system as any)[0].cache_control.type).toBe('ephemeral');
      expect((anthropicRequest.system as any)[1].cache_control.type).toBe('ephemeral');

      // Verify assistant message with tool_use blocks
      const assistantMsg = (anthropicRequest.messages as any)[1];
      expect(assistantMsg.role).toBe('assistant');
      expect(Array.isArray(assistantMsg.content)).toBe(true);
      expect(assistantMsg.content).toHaveLength(3);

      // Verify each tool_use block
      expect(assistantMsg.content[0]).toMatchObject({
        type: 'tool_use',
        id: 'call_acabbaf8ef00414bbcaa0899',
        name: 'Bash',
        input: {
          command: 'find . -type f -name "*.swift" | head -20',
          description: 'List Swift source files',
        },
      });

      expect(assistantMsg.content[1]).toMatchObject({
        type: 'tool_use',
        id: 'call_15b8c589c54144fabea284ab',
        name: 'Bash',
        input: {
          command: 'ls -la /Users/xuyingzhou/Project/study-mac-app/quite-note',
          description: 'List root directory contents',
        },
      });

      expect(assistantMsg.content[2]).toMatchObject({
        type: 'tool_use',
        id: 'call_fc10b6b5b5734368a600abc4',
        name: 'Bash',
        input: {
          command: 'tree -L 3 -I \'node_modules|.git|.build\' /Users/xuyingzhou/Project/study-mac-app/quite-note',
          description: 'Show directory tree structure',
        },
        cache_control: { type: 'ephemeral' },
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle tool_use with empty input', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Do something',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_empty',
                name: 'NoParamsTool',
                input: {},
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMsg = (data.messages as any)[1];

      expect(assistantMsg.content[0].type).toBe('tool_use');
      expect(assistantMsg.content[0].id).toBe('call_empty');
      expect(assistantMsg.content[0].name).toBe('NoParamsTool');
      expect(assistantMsg.content[0].input).toEqual({});
    });

    it('should handle tool_use with complex nested input', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Process data',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_complex',
                name: 'DataProcessor',
                input: {
                  config: {
                    mode: 'advanced',
                    options: {
                      verbose: true,
                      retries: 3,
                    },
                  },
                  data: [
                    { id: 1, value: 'test' },
                    { id: 2, value: 'data' },
                  ],
                },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMsg = (data.messages as any)[1];

      expect(assistantMsg.content[0].type).toBe('tool_use');
      expect(assistantMsg.content[0].input).toEqual({
        config: {
          mode: 'advanced',
          options: {
            verbose: true,
            retries: 3,
          },
        },
        data: [
          { id: 1, value: 'test' },
          { id: 2, value: 'data' },
        ],
      });
    });

    it('should handle assistant message with only tool_use (no text)', () => {
      const request: InternalRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'user',
            content: 'Get weather',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_weather',
                name: 'get_weather',
                input: { city: 'San Francisco' },
              },
            ],
          },
        ],
        maxTokens: 4096,
      };

      const result = converter.convertRequestFromInternal(request);
      expect(result.success).toBe(true);
      const data = expectSuccess(result) as any;
      const assistantMsg = (data.messages as any)[1];

      // Should have array content with just the tool_use block
      expect(Array.isArray(assistantMsg.content)).toBe(true);
      expect(assistantMsg.content).toHaveLength(1);
      expect(assistantMsg.content[0].type).toBe('tool_use');
    });
  });
});
