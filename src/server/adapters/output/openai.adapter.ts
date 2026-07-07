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
 * 流式转换器：pi-ai 事件 → OpenAI SSE
 *
 * 上游（如 DeepSeek）的 SSE 模式：
 *   - 每行都包含 id/object/created/model/usage 等顶层字段
 *   - reasoning 阶段：每条 chunk 包含 content:null + reasoning_content:"增量"
 *   - text 阶段：每条 chunk 包含 content:"增量"（无 reasoning_content）
 *
 * 我们的转换器同样增量输出 reasoning_content，匹配上游实时行为。
 *
 * 注意：上游在从 reasoning 切换到 text 时，第一个 content chunk 会带
 * reasoning_content: null 作为过渡标记。我们也要匹配这一行为。
 */
export function createOpenaiSSEConverter() {
  let hasSeenThinking = false;
  let responseId = '';
  let responseModel = '';
  let responseCreated = 0;
  let toolCallIndex = 0; // tool_calls 自己的索引（从 0 开始），与 pi-ai contentIndex 解耦
  const fallbackId = `chatcmpl-${Date.now()}`;
  const fallbackCreated = Math.floor(Date.now() / 1000);

  function makeChunk(extra: Record<string, any>): string {
    // id/created 一旦生成就保持不变（不因 done 事件的 responseId 覆盖）
    // 注意：key 顺序匹配上游 — id, object, created, model, choices, usage
    const chunk: Record<string, any> = {
      id: responseId || fallbackId,
      object: 'chat.completion.chunk',
      created: responseCreated || fallbackCreated,
      model: responseModel,
    };
    // 先合并 choices，后加 usage，匹配上游 key 顺序
    if (extra.choices) {
      chunk.choices = extra.choices;
      delete extra.choices;
    }
    chunk.usage = null;
    // 合并剩余字段（如 error）
    Object.assign(chunk, extra);
    return sse(chunk);
  }

  return {
    reset(id?: string, model?: string, created?: number) {
      hasSeenThinking = false;
      toolCallIndex = 0;
      if (id) responseId = id;
      if (model) responseModel = model;
      if (created) responseCreated = created;
    },

    *eventToSSE(event: AssistantMessageEvent): Generator<string> {
      // 从事件中提取元数据（只取第一次，不覆盖已设置的值）
      if (event.type === 'done' && event.message) {
        if (!responseModel && event.message.model) responseModel = event.message.model;
        if (!responseCreated && event.message.timestamp) responseCreated = Math.floor(event.message.timestamp / 1000);
      }
      if (event.type === 'start' && event.partial?.model && !responseModel) {
        responseModel = event.partial.model;
      }

      switch (event.type) {
        case 'start': {
          hasSeenThinking = false;
          yield makeChunk({
            choices: [{ index: 0, finish_reason: null, logprobs: null, delta: { role: 'assistant', content: null, reasoning_content: '' } }],
          });
          break;
        }

        case 'text_delta': {
          if (hasSeenThinking) {
            hasSeenThinking = false;
            yield makeChunk({
              choices: [{ index: 0, finish_reason: null, logprobs: null, delta: { content: event.delta, reasoning_content: null } }],
            });
          } else {
            yield makeChunk({
              choices: [{ index: 0, finish_reason: null, logprobs: null, delta: { content: event.delta } }],
            });
          }
          break;
        }

        case 'text_end': break;

        case 'thinking_delta': {
          hasSeenThinking = true;
          yield makeChunk({
            choices: [{ index: 0, finish_reason: null, logprobs: null, delta: { content: null, reasoning_content: event.delta } }],
          });
          break;
        }

        case 'thinking_start':
        case 'thinking_end': break;

        case 'toolcall_start': {
          const tcIdx = toolCallIndex++;
          yield makeChunk({
            choices: [{ index: 0, finish_reason: null, logprobs: null, delta: { tool_calls: [{ index: tcIdx, id: '', type: 'function', function: { name: '', arguments: '' } }] } }],
          });
          break;
        }

        case 'toolcall_delta': {
          // delta 阶段用当前 toolCallIndex - 1（刚才 start 时已经 +1）
          yield makeChunk({
            choices: [{ index: 0, finish_reason: null, logprobs: null, delta: { tool_calls: [{ index: toolCallIndex - 1, function: { arguments: event.delta } }] } }],
          });
          break;
        }

        case 'toolcall_end': {
          yield makeChunk({
            choices: [{ index: 0, finish_reason: null, logprobs: null, delta: { tool_calls: [{ index: toolCallIndex - 1, id: event.toolCall.id, type: 'function', function: { name: event.toolCall.name, arguments: JSON.stringify(event.toolCall.arguments) } }] } }],
          });
          break;
        }

        case 'done': {
          const u = event.message.usage;
          const usageChunk: Record<string, any> = {
            choices: [{ index: 0, finish_reason: mapStopReason(event.reason), logprobs: null, delta: {} }],
            usage: {
              prompt_tokens: u.input, completion_tokens: u.output, total_tokens: u.totalTokens,
              prompt_tokens_details: { cached_tokens: u.cacheRead },
              completion_tokens_details: { reasoning_tokens: u.reasoning ?? 0 },
            },
          };
          yield makeChunk(usageChunk);
          yield 'data: [DONE]\n\n';
          break;
        }

        case 'error': {
          yield makeChunk({ error: { message: event.error.errorMessage ?? 'Unknown error', type: 'upstream_error' } });
          yield 'data: [DONE]\n\n';
          break;
        }
      }
    },
  };
}

// 保留简单版本（无状态，单事件直接映射，用于测试）
export function* piEventToOpenaiSSE(event: AssistantMessageEvent): Generator<string> {
  const converter = createOpenaiSSEConverter();
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
  const reasoningContent = extractReasoningContent(msg.content);
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

  // reasoning_content 字段（deepseek 兼容）
  if (reasoningContent) {
    response.choices[0].message.reasoning_content = reasoningContent;
  }

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
 * 从 content blocks 中提取 reasoning/thinking 内容（非流式 response 的 reasoning_content 字段）
 */
function extractReasoningContent(content: AssistantMessage['content']): string | null {
  const blocks = content.filter((b): b is { type: 'thinking'; thinking: string } => b.type === 'thinking');
  if (blocks.length === 0) return null;
  return blocks.map(t => t.thinking).join('');
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
