/**
 * Anthropic 输出适配器
 *
 * 将 pi-ai 的统一事件流 / AssistantMessage 转换为 Anthropic 兼容格式。
 *
 * 流式: pi-ai AssistantMessageEvent → Anthropic SSE (event: xxx\ndata: {...}\n\n)
 * 非流式: pi-ai AssistantMessage → Anthropic Messages API 响应
 */
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';

// ============================================================
// 流式转换
// ============================================================

/**
 * 将 pi-ai 的 AssistantMessageEvent 转换为 Anthropic SSE 事件行。
 */
export function* piEventToAnthropicSSE(event: AssistantMessageEvent): Generator<string> {
  switch (event.type) {
    case 'start': {
      // message_start: 声明消息开始
      yield sseEvent('message_start', {
        type: 'message_start',
        message: {
          id: `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      });
      break;
    }

    case 'text_start': {
      // content_block_start (text)
      yield sseEvent('content_block_start', {
        type: 'content_block_start',
        index: event.contentIndex,
        content_block: { type: 'text', text: '' },
      });
      break;
    }

    case 'text_delta': {
      yield sseEvent('content_block_delta', {
        type: 'content_block_delta',
        index: event.contentIndex,
        delta: { type: 'text_delta', text: event.delta },
      });
      break;
    }

    case 'text_end': {
      yield sseEvent('content_block_stop', {
        type: 'content_block_stop',
        index: event.contentIndex,
      });
      break;
    }

    case 'thinking_start': {
      yield sseEvent('content_block_start', {
        type: 'content_block_start',
        index: event.contentIndex,
        content_block: { type: 'thinking', thinking: '' },
      });
      break;
    }

    case 'thinking_delta': {
      yield sseEvent('content_block_delta', {
        type: 'content_block_delta',
        index: event.contentIndex,
        delta: { type: 'thinking_delta', thinking: event.delta },
      });
      break;
    }

    case 'thinking_end': {
      yield sseEvent('content_block_stop', {
        type: 'content_block_stop',
        index: event.contentIndex,
      });
      break;
    }

    case 'toolcall_start': {
      // Anthropic 的 tool_use 在 content_block_start 时就带着完整信息
      // 但由于 pi-ai 在 start 时还没有 name 和 arguments，我们等到 end 才发送
      // 中间不发送 delta（Anthropic 不流式传输 tool arguments）
      break;
    }

    case 'toolcall_delta': {
      // Anthropic 不支持增量 tool arguments
      break;
    }

    case 'toolcall_end': {
      // 发送完整 tool_use content block
      yield sseEvent('content_block_start', {
        type: 'content_block_start',
        index: event.contentIndex,
        content_block: {
          type: 'tool_use',
          id: event.toolCall.id,
          name: event.toolCall.name,
          input: event.toolCall.arguments,
        },
      });
      yield sseEvent('content_block_stop', {
        type: 'content_block_stop',
        index: event.contentIndex,
      });
      break;
    }

    case 'done': {
      // message_delta: 结束原因 + usage
      const u = event.message.usage;
      yield sseEvent('message_delta', {
        type: 'message_delta',
        delta: {
          stop_reason: mapAnthropicStopReason(event.reason),
          stop_sequence: null,
        },
        usage: {
          input_tokens: u.input,
          output_tokens: u.output,
          cache_read_input_tokens: u.cacheRead,
          cache_write_input_tokens: u.cacheWrite,
        },
      });
      // message_stop
      yield sseEvent('message_stop', {
        type: 'message_stop',
      });
      break;
    }

    case 'error': {
      yield sseEvent('error', {
        type: 'error',
        error: {
          type: 'api_error',
          message: event.error.errorMessage ?? 'Unknown error',
        },
      });
      break;
    }
  }
}

// ============================================================
// 非流式转换
// ============================================================

/**
 * 将 pi-ai 的 AssistantMessage 转换为 Anthropic Messages API 响应。
 */
export function piResponseToAnthropicJson(msg: AssistantMessage): Record<string, any> {
  const content = msg.content.map(block => {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'thinking':
        return { type: 'thinking', thinking: block.thinking };
      case 'toolCall':
        return {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.arguments,
        };
      default:
        return block;
    }
  });

  return {
    id: msg.responseId ?? `msg_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content,
    stop_reason: mapAnthropicStopReason(msg.stopReason),
    stop_sequence: null,
    usage: {
      input_tokens: msg.usage.input,
      output_tokens: msg.usage.output,
      cache_read_input_tokens: msg.usage.cacheRead,
      cache_write_input_tokens: msg.usage.cacheWrite,
    },
  };
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 构造 Anthropic SSE 事件行
 * 格式: "event: {eventType}\ndata: {json}\n\n"
 */
function sseEvent(eventType: string, data: Record<string, any>): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * 映射 pi-ai stopReason → Anthropic stop_reason
 */
function mapAnthropicStopReason(reason: string): string {
  switch (reason) {
    case 'stop': return 'end_turn';
    case 'length': return 'max_tokens';
    case 'toolUse': return 'tool_use';
    case 'error': return null as any;
    case 'aborted': return null as any;
    default: return reason;
  }
}
