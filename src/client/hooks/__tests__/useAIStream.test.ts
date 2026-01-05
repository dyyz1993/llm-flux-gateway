/**
 * useAIStream Tool Calls Parsing Unit Tests
 *
 * 验证 OpenAI SDK 流式响应中 tool_calls 的解析逻辑
 */

import { describe, it, expect } from 'vitest';

// 模拟真实的 OpenAI SSE chunk 数据
interface MockChunk {
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 复制 useAIStream.ts 中的 tool calls 累积逻辑
 */
function accumulateToolCalls(chunks: MockChunk[]): Map<number, any> {
  const accumulatedToolCalls = new Map<number, any>();

  for (const chunk of chunks) {
    const toolCalls = chunk.choices?.[0]?.delta?.tool_calls;

    if (toolCalls) {
      toolCalls.forEach((newCall) => {
        const index = newCall.index ?? accumulatedToolCalls.size;
        const existing = accumulatedToolCalls.get(index);

        if (!existing) {
          // 第一次遇到这个 tool call - 创建
          accumulatedToolCalls.set(index, {
            id: newCall.id,
            type: newCall.type || 'function',
            function: {
              name: newCall.function?.name || '',
              arguments: newCall.function?.arguments || '',
            },
            index,
          });
        } else if (newCall.function?.arguments) {
          // 后续 chunk - 累积 arguments
          existing.function.arguments += newCall.function.arguments;
        }
      });
    }
  }

  return accumulatedToolCalls;
}

describe('useAIStream - OpenAI Tool Calls 解析', () => {
  describe('单个 tool call 的完整流程', () => {
    it('应该解析用户提供的 4 个 chunk 示例', () => {
      // Chunk 1: role: assistant
      const chunk1: MockChunk = {
        choices: [{
          index: 0,
          delta: { role: 'assistant' },
          finish_reason: null,
        }],
      };

      // Chunk 2: tool_calls 初始化
      const chunk2: MockChunk = {
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_2026010408220300c4193c456d4b35_0',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '',
              },
            }],
          },
          finish_reason: null,
        }],
      };

      // Chunk 3: arguments 数据
      const chunk3: MockChunk = {
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              function: {
                arguments: '{"city": "San Francisco"}',
              },
            }],
          },
          finish_reason: null,
        }],
      };

      // Chunk 4: finish_reason: tool_calls
      const chunk4: MockChunk = {
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'tool_calls',
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 11,
          total_tokens: 11,
        },
      };

      const chunks = [chunk1, chunk2, chunk3, chunk4];
      const result = accumulateToolCalls(chunks);

      // 验证结果
      expect(result.size).toBe(1);

      const toolCall = result.get(0);
      expect(toolCall).toBeDefined();
      expect(toolCall.id).toBe('call_2026010408220300c4193c456d4b35_0');
      expect(toolCall.type).toBe('function');
      expect(toolCall.function.name).toBe('get_weather');
      expect(toolCall.function.arguments).toBe('{"city": "San Francisco"}');
    });

    it('应该正确累积分段的 arguments', () => {
      // 模拟 arguments 分多个 chunk 传输
      const chunks: MockChunk[] = [
        // Chunk 1: tool call 初始化
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_001',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '',
                },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 2: {"query":
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: {
                  arguments: '{"query":',
                },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 3: "test",
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: {
                  arguments: '"test"',
                },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 4: }
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: {
                  arguments: '}',
                },
              }],
            },
            finish_reason: null,
          }],
        },
      ];

      const result = accumulateToolCalls(chunks);

      expect(result.size).toBe(1);
      const toolCall = result.get(0);
      expect(toolCall.function.name).toBe('search');
      expect(toolCall.function.arguments).toBe('{"query":"test"}');
    });
  });

  describe('多个 tool calls', () => {
    it('应该正确处理多个并行的 tool calls', () => {
      const chunks: MockChunk[] = [
        // Chunk 1: 初始化两个 tool calls
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_001',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '',
                  },
                },
                {
                  index: 1,
                  id: 'call_002',
                  type: 'function',
                  function: {
                    name: 'get_time',
                    arguments: '',
                  },
                },
              ],
            },
            finish_reason: null,
          }],
        },
        // Chunk 2: 第一个 tool call 的 arguments
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: {
                  arguments: '{"city": "NYC"}',
                },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 3: 第二个 tool call 的 arguments
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 1,
                function: {
                  arguments: '{"timezone": "UTC"}',
                },
              }],
            },
            finish_reason: null,
          }],
        },
      ];

      const result = accumulateToolCalls(chunks);

      expect(result.size).toBe(2);

      const toolCall1 = result.get(0);
      expect(toolCall1.function.name).toBe('get_weather');
      expect(toolCall1.function.arguments).toBe('{"city": "NYC"}');

      const toolCall2 = result.get(1);
      expect(toolCall2.function.name).toBe('get_time');
      expect(toolCall2.function.arguments).toBe('{"timezone": "UTC"}');
    });
  });

  describe('标准 OpenAI 格式 vs GLM 格式对比', () => {
    it('标准 OpenAI 格式：arguments 分多个 chunk', () => {
      // 标准 OpenAI 格式 - arguments 流式传输
      const chunks: MockChunk[] = [
        // Chunk 1: tool call 初始化
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_abc',
                type: 'function',
                function: { name: 'get_weather', arguments: '' },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 2: arguments 第1部分
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: '{"city"' },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 3: arguments 第2部分
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: ': "SF"' },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 4: arguments 第3部分
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: '}' },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 5: finish_reason (delta 为空)
        {
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      ];

      const result = accumulateToolCalls(chunks);

      expect(result.size).toBe(1);
      const toolCall = result.get(0);
      expect(toolCall.function.arguments).toBe('{"city": "SF"}');
      expect(toolCall.id).toBe('call_abc');
      expect(toolCall.function.name).toBe('get_weather');
    });

    it('GLM 格式：arguments 单 chunk 全部发送', () => {
      // GLM 实际格式 - 一次发送完整 arguments
      const chunks: MockChunk[] = [
        // Chunk 1: role
        {
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          }],
        },
        // Chunk 2: 完整的 tool call
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_xxx_0',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city": "San Francisco"}',  // 完整 arguments
                },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 3: finish_reason + usage (delta 有 role 和 content)
        {
          choices: [{
            index: 0,
            delta: { role: 'assistant', content: '' },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 0, completion_tokens: 11, total_tokens: 11 },
        },
      ];

      const result = accumulateToolCalls(chunks);

      expect(result.size).toBe(1);
      const toolCall = result.get(0);
      expect(toolCall.function.arguments).toBe('{"city": "San Francisco"}');
      expect(toolCall.id).toBe('call_xxx_0');
      expect(toolCall.function.name).toBe('get_weather');
    });

    it('两种格式应该解析出相同的结果', () => {
      // 标准 OpenAI 格式
      const standardChunks: MockChunk[] = [
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_std',
                type: 'function',
                function: { name: 'test', arguments: '' },
              }],
            },
            finish_reason: null,
          }],
        },
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: '{"x":1}' },
              }],
            },
            finish_reason: null,
          }],
        },
        {
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        },
      ];

      // GLM 格式
      const glmChunks: MockChunk[] = [
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_glm',
                type: 'function',
                function: { name: 'test', arguments: '{"x":1}' },
              }],
            },
            finish_reason: null,
          }],
        },
        {
          choices: [{
            index: 0,
            delta: { role: 'assistant', content: '' },
            finish_reason: 'tool_calls',
          }],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        },
      ];

      const standardResult = accumulateToolCalls(standardChunks);
      const glmResult = accumulateToolCalls(glmChunks);

      // arguments 应该相同
      expect(standardResult.get(0).function.arguments).toBe(glmResult.get(0).function.arguments);
      expect(standardResult.get(0).function.name).toBe(glmResult.get(0).function.name);
    });
  });

  describe('RoutePlayground 第二次请求构建验证', () => {
    it('tool_results 格式应该符合 OpenAI 标准', () => {
      // 模拟 ToolExecutionService 返回的 tool results
      const toolResults = [
        {
          role: 'tool',
          tool_call_id: 'call_abc_123',
          content: '{"location": "San Francisco", "temperature": 72, "condition": "Sunny"}',
        },
      ];

      // 模拟第二次请求的 messages
      const requestMessages = [
        { role: 'user', content: 'What is the weather in SF?' },
      ];

      // 构建 messagesWithToolResults (复制 RoutePlayground.tsx 第 341-349 行)
      const messagesWithToolResults = [...requestMessages];
      messagesWithToolResults.push({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_abc_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"city": "San Francisco"}',
            },
          },
        ],
      } as any);
      messagesWithToolResults.push(...toolResults);

      // 验证格式
      expect(messagesWithToolResults).toHaveLength(3);
      expect(messagesWithToolResults[0]!).toEqual({ role: 'user', content: 'What is the weather in SF?' });
      expect(messagesWithToolResults[1]!.role).toBe('assistant');
      expect((messagesWithToolResults[1]! as any).tool_calls).toBeDefined();
      expect(messagesWithToolResults[2]!.role).toBe('tool');
      expect((messagesWithToolResults[2]! as any).tool_call_id).toBe('call_abc_123');
      expect(messagesWithToolResults[2]!.content).toContain('San Francisco');
    });

    it('应该检测 tool_results 是否正确添加到请求中', () => {
      // 第一次请求返回 tool_calls
      const accumulatedToolCalls = [
        {
          id: 'call_test_0',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"city": "NYC"}',
          },
        },
      ];

      // 模拟 tool execution
      const toolResults = [
        {
          role: 'tool',
          tool_call_id: 'call_test_0',
          content: '{"temp": 50}',
        },
      ];

      // 构建第二次请求
      const requestMessages = [{ role: 'user', content: 'Weather in NYC?' }];
      const messagesWithToolResults = [
        ...requestMessages,
        {
          role: 'assistant',
          content: '',
          tool_calls: accumulatedToolCalls,
        },
        ...toolResults,
      ];

      // 验证：tool_results 必须在 assistant message 之后
      expect(messagesWithToolResults[1]!.role).toBe('assistant');
      expect((messagesWithToolResults[1]! as any).tool_calls).toHaveLength(1);
      expect(messagesWithToolResults[2]!.role).toBe('tool');
      expect((messagesWithToolResults[2]! as any).tool_call_id).toBe('call_test_0');

      // 验证：tool_call_id 必须匹配
      expect((messagesWithToolResults[1]! as any).tool_calls[0].id).toBe((messagesWithToolResults[2]! as any).tool_call_id);
    });
  });

  describe('finish_reason 处理', () => {
    it('应该处理两次 finish_reason (tool_calls + stop)', () => {
      // 模拟用户提供的 GLM 响应
      const chunks: MockChunk[] = [
        // Chunk 1: role
        {
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null,
          }],
        },
        // Chunk 2: tool_calls 初始化
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_xxx_0',
                type: 'function',
                function: { name: 'get_weather', arguments: '' },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 3: arguments
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                function: { arguments: '{"city": "San Francisco"}' },
              }],
            },
            finish_reason: null,
          }],
        },
        // Chunk 4: finish_reason='tool_calls' + usage
        {
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'tool_calls',
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 11,
            total_tokens: 11,
          },
        },
        // Chunk 5: finish_reason='stop' (无 usage)
        {
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
        },
      ];

      let onCompleteCallCount = 0;
      const onCompletes: any[] = [];

      // 模拟 useAIStream.ts 的处理逻辑
      for (const chunk of chunks) {
        const toolCalls = chunk.choices?.[0]?.delta?.tool_calls;

        if (toolCalls) {
          // 处理 tool calls (调用前面定义的 accumulateToolCalls)
          accumulateToolCalls([chunk]);
        }

        // Handle completion - 这是关键逻辑
        if (chunk.choices?.[0]?.finish_reason) {
          if (chunk.usage) {
            onCompleteCallCount++;
            onCompletes.push({
              finish_reason: chunk.choices?.[0].finish_reason,
              tokens: {
                prompt: chunk.usage.prompt_tokens,
                completion: chunk.usage.completion_tokens,
              },
            });
          }
        }
      }

      // 验证：onComplete 只应该被调用一次（chunk 4，因为有 usage）
      expect(onCompleteCallCount).toBe(1);
      expect(onCompletes[0].finish_reason).toBe('tool_calls');
    });

    it('应该追踪有多少个 chunk 会触发 onComplete', () => {
      const chunks: MockChunk[] = [
        { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }, // 无 usage
      ];

      let triggerCount = 0;
      const triggers: any[] = [];

      for (const chunk of chunks) {
        if (chunk.choices?.[0]?.finish_reason) {
          if (chunk.usage) {
            triggerCount++;
            triggers.push({ finish_reason: chunk.choices?.[0].finish_reason });
          }
        }
      }

      expect(triggerCount).toBe(1);
      expect(triggers[0].finish_reason).toBe('tool_calls');
    });
  });

  describe('边界情况', () => {
    it('应该处理空的 tool_calls 数组', () => {
      const chunk: MockChunk = {
        choices: [{
          index: 0,
          delta: {
            tool_calls: [],
          },
          finish_reason: null,
        }],
      };

      const result = accumulateToolCalls([chunk]);
      expect(result.size).toBe(0);
    });

    it('应该处理没有 tool_calls 的 chunk', () => {
      const chunk: MockChunk = {
        choices: [{
          index: 0,
          delta: {
            content: 'Hello, world!',
          },
          finish_reason: null,
        }],
      };

      const result = accumulateToolCalls([chunk]);
      expect(result.size).toBe(0);
    });

    it('应该处理 tool call 只有 name 没有 arguments', () => {
      const chunk: MockChunk = {
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_003',
              type: 'function',
              function: {
                name: 'no_params',
                arguments: '',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      };

      const result = accumulateToolCalls([chunk]);
      expect(result.size).toBe(1);

      const toolCall = result.get(0);
      expect(toolCall.function.name).toBe('no_params');
      expect(toolCall.function.arguments).toBe('');
    });

    it('应该处理 index 不按顺序的情况', () => {
      const chunks: MockChunk[] = [
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 2,
                id: 'call_003',
                type: 'function',
                function: { name: 'third', arguments: '' },
              }],
            },
            finish_reason: null,
          }],
        },
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_001',
                type: 'function',
                function: { name: 'first', arguments: '' },
              }],
            },
            finish_reason: null,
          }],
        },
        {
          choices: [{
            index: 0,
            delta: {
              tool_calls: [{
                index: 1,
                id: 'call_002',
                type: 'function',
                function: { name: 'second', arguments: '' },
              }],
            },
            finish_reason: null,
          }],
        },
      ];

      const result = accumulateToolCalls(chunks);
      expect(result.size).toBe(3);

      expect(result.get(0).function.name).toBe('first');
      expect(result.get(1).function.name).toBe('second');
      expect(result.get(2).function.name).toBe('third');
    });
  });
});
