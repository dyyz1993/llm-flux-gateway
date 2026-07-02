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
 * 将 pi-ai 的 AssistantMessageEvent 转换为 OpenAI SSE 文本行。
 *
 * 输出格式: "data: {json}\n\n"
 * 返回生成器，每个事件可能产生 0-N 条 SSE 行。
 */
export function* piEventToOpenaiSSE(event: AssistantMessageEvent): Generator<string> {
  switch (event.type) {
    case 'start': {
      // 首条 chunk: 声明 assistant 角色
      yield sse({
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
      });
      break;
    }

    case 'text_delta': {
      yield sse({
        choices: [{ index: 0, delta: { content: event.delta }, finish_reason: null }],
      });
      break;
    }

    case 'text_end': {
      // OpenAI 不要求 text_end 事件，可忽略
      break;
    }

    case 'thinking_delta': {
      // OpenAI 将推理内容放在 reasoning_content 字段
      yield sse({
        choices: [{ index: 0, delta: { reasoning_content: event.delta }, finish_reason: null }],
      });
      break;
    }

    case 'thinking_start':
    case 'thinking_end': {
      // OpenAI 没有 thinking_start/end 的概念，忽略
      break;
    }

    case 'toolcall_start': {
      // 声明 tool_call 开始
      yield sse({
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: event.contentIndex,
              id: '',
              type: 'function',
              function: { name: '', arguments: '' },
            }],
          },
          finish_reason: null,
        }],
      });
      break;
    }

    case 'toolcall_delta': {
      // 追加 tool arguments 增量
      yield sse({
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: event.contentIndex,
              function: { arguments: event.delta },
            }],
          },
          finish_reason: null,
        }],
      });
      break;
    }

    case 'toolcall_end': {
      // 发送完整 tool_call 信息（id + name + arguments）
      yield sse({
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: event.contentIndex,
              id: event.toolCall.id,
              type: 'function',
              function: {
                name: event.toolCall.name,
                arguments: JSON.stringify(event.toolCall.arguments),
              },
            }],
          },
          finish_reason: null,
        }],
      });
      break;
    }

    case 'done': {
      // 最终 chunk: finish_reason + usage
      const usageChunk: Record<string, any> = {
        choices: [{
          index: 0,
          delta: {},
          finish_reason: mapStopReason(event.reason),
        }],
      };

      // usage
      const u = event.message.usage;
      usageChunk.usage = {
        prompt_tokens: u.input,
        completion_tokens: u.output,
        total_tokens: u.totalTokens,
        prompt_tokens_details: {
          cached_tokens: u.cacheRead,
        },
        completion_tokens_details: {
          reasoning_tokens: u.reasoning ?? 0,
        },
      };

      // id / created / model
      if (event.message.responseId) usageChunk.id = event.message.responseId;
      usageChunk.model = event.message.model;
      usageChunk.created = Math.floor(event.message.timestamp / 1000);

      yield sse(usageChunk);
      yield 'data: [DONE]\n\n';
      break;
    }

    case 'error': {
      // 错误: 发送错误信息 + [DONE]
      yield sse({
        error: {
          message: event.error.errorMessage ?? 'Unknown error',
          type: 'upstream_error',
        },
      });
      yield 'data: [DONE]\n\n';
      break;
    }
  }
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
