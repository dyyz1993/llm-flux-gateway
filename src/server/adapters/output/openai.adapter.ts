/**
 * OpenAI 输出适配器
 *
 * 将 pi-ai 的统一事件流 / AssistantMessage 转换为 OpenAI 兼容格式。
 *
 * 流式: pi-ai AssistantMessageEvent → OpenAI SSE (data: {...}\n\n)
 * 非流式: pi-ai AssistantMessage → OpenAI chat.completion JSON
 */
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';

// ============================================================
// 流式转换
// ============================================================

/**
 * 上游（如 DeepSeek）会把 reasoning_content 和 content 合并到同一个 chunk 中发送。
 * pi-ai 则分成了 thinking_delta 和 text_delta 两个独立事件。
 * 为了还原上游行为，创建一个带状态的流式转换器，将紧邻的 thinking_delta + text_delta 合并。
 */
export function createOpenaiSSEConverter() {
  let pendingReasoning = '';

  return {
    /**
     * 重置状态（新流开始时调用）
     */
    reset() {
      pendingReasoning = '';
    },

    /**
     * 将 pi-ai 事件转换为 SSE 行，带 reasoning 合并
     */
    *eventToSSE(event: AssistantMessageEvent): Generator<string> {
      switch (event.type) {
        case 'start': {
          pendingReasoning = '';
          yield sse({
            choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
          });
          break;
        }

        case 'text_delta': {
          if (pendingReasoning) {
            yield sse({
              choices: [{ index: 0, delta: { content: event.delta, reasoning_content: pendingReasoning }, finish_reason: null }],
            });
            pendingReasoning = '';
          } else {
            yield sse({
              choices: [{ index: 0, delta: { content: event.delta }, finish_reason: null }],
            });
          }
          break;
        }

        case 'text_end': break;

        case 'thinking_delta': {
          pendingReasoning += event.delta;
          break;
        }

        case 'thinking_start':
        case 'thinking_end': break;

        case 'toolcall_start': {
          yield sse({
            choices: [{ index: 0, delta: {
              tool_calls: [{ index: event.contentIndex, id: '', type: 'function', function: { name: '', arguments: '' } }],
            }, finish_reason: null }],
          });
          break;
        }

        case 'toolcall_delta': {
          yield sse({
            choices: [{ index: 0, delta: {
              tool_calls: [{ index: event.contentIndex, function: { arguments: event.delta } }],
            }, finish_reason: null }],
          });
          break;
        }

        case 'toolcall_end': {
          yield sse({
            choices: [{ index: 0, delta: {
              tool_calls: [{ index: event.contentIndex, id: event.toolCall.id, type: 'function',
                function: { name: event.toolCall.name, arguments: JSON.stringify(event.toolCall.arguments) },
              }],
            }, finish_reason: null }],
          });
          break;
        }

        case 'done': {
          if (pendingReasoning) {
            yield sse({
              choices: [{ index: 0, delta: { reasoning_content: pendingReasoning }, finish_reason: null }],
            });
            pendingReasoning = '';
          }
          const usageChunk: Record<string, any> = {
            choices: [{ index: 0, delta: {}, finish_reason: mapStopReason(event.reason) }],
          };
          const u = event.message.usage;
          usageChunk.usage = {
            prompt_tokens: u.input, completion_tokens: u.output, total_tokens: u.totalTokens,
            prompt_tokens_details: { cached_tokens: u.cacheRead },
            completion_tokens_details: { reasoning_tokens: u.reasoning ?? 0 },
          };
          if (event.message.responseId) usageChunk.id = event.message.responseId;
          usageChunk.model = event.message.model;
          usageChunk.created = Math.floor(event.message.timestamp / 1000);
          yield sse(usageChunk);
          yield 'data: [DONE]\n\n';
          break;
        }

        case 'error': {
          if (pendingReasoning) {
            yield sse({
              choices: [{ index: 0, delta: { reasoning_content: pendingReasoning }, finish_reason: null }],
            });
            pendingReasoning = '';
          }
          yield sse({ error: { message: event.error.errorMessage ?? 'Unknown error', type: 'upstream_error' } });
          yield 'data: [DONE]\n\n';
          break;
        }
      }
    },
  };
}

// 保留简单版本（无状态，单事件直接映射，用于测试）
export function* piEventToOpenaiSSE(event: AssistantMessageEvent): Generator<string> {
  // 复用 converter 的核心逻辑，但不做 reasoning 缓存（单事件模式）
  const converter = createOpenaiSSEConverter();
  
  // thinking_delta 在单事件模式下需要直接输出
  if (event.type === 'thinking_delta') {
    yield sse({
      choices: [{ index: 0, delta: { reasoning_content: event.delta }, finish_reason: null }],
    });
    return;
  }

  yield* converter.eventToSSE(event);
}

// ============================================================
// 非流式转换
// ============================================================

/**
 * 将 pi-ai 的 AssistantMessage 转换为 OpenAI chat.completion 响应。
 */
export function piResponseToOpenaiJson(msg: AssistantMessage): Record<string, any> {
  const content = extractTextContent(msg.content);
  const toolCalls = extractToolCallsFromContent(msg.content);

  const response: Record<string, any> = {
    id: msg.responseId ?? `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(msg.timestamp / 1000),
    model: msg.model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: content ?? null,
      },
      finish_reason: mapStopReason(msg.stopReason),
    }],
    usage: {
      prompt_tokens: msg.usage.input,
      completion_tokens: msg.usage.output,
      total_tokens: msg.usage.totalTokens,
      prompt_tokens_details: {
        cached_tokens: msg.usage.cacheRead,
      },
      completion_tokens_details: {
        reasoning_tokens: msg.usage.reasoning ?? 0,
      },
    },
  };

  if (toolCalls.length > 0) {
    response.choices[0].message.tool_calls = toolCalls;
    // 如果 content 为空且有 tool_calls，设为 null
    if (!content) {
      response.choices[0].message.content = null;
    }
  }

  return response;
}

// ============================================================
// 内部辅助函数
// ============================================================

/**
 * 构造 SSE 行
 */
function sse(data: Record<string, any>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * 映射 pi-ai stopReason → OpenAI finish_reason
 */
function mapStopReason(reason: string): string {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'toolUse': return 'tool_calls';
    case 'error': return null as any; // 错误场景会在 error 事件中处理
    case 'aborted': return null as any;
    default: return reason;
  }
}

/**
 * 从 content blocks 中提取纯文本
 */
function extractTextContent(content: AssistantMessage['content']): string | null {
  const texts = content.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
  if (texts.length === 0) return null;
  return texts.map(t => t.text).join('');
}

/**
 * 从 content blocks 中提取工具调用（OpenAI 格式）
 */
function extractToolCallsFromContent(content: AssistantMessage['content']): Array<{
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}> {
  const calls = content.filter((b): b is { type: 'toolCall'; id: string; name: string; arguments: Record<string, any> } => b.type === 'toolCall');
  return calls.map(tc => ({
    id: tc.id,
    type: 'function' as const,
    function: {
      name: tc.name,
      arguments: JSON.stringify(tc.arguments),
    },
  }));
}
