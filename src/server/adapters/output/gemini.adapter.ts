/**
 * Gemini 输出适配器
 *
 * 将 pi-ai 的统一事件流 / AssistantMessage 转换为 Google Gemini 兼容格式。
 *
 * 流式: pi-ai AssistantMessageEvent → Gemini SSE (data: {"candidates": [...],\n\n)
 * 非流式: pi-ai AssistantMessage → Gemini GenerateContentResponse
 */
import type { AssistantMessageEvent, AssistantMessage } from '@earendil-works/pi-ai';

// ============================================================
// 流式转换
// ============================================================

export function* piEventToGeminiSSE(event: AssistantMessageEvent): Generator<string> {
  switch (event.type) {
    case 'start':
    case 'text_start':
    case 'thinking_start':
    case 'thinking_end':
    case 'toolcall_start':
    case 'toolcall_delta': {
      // Gemini 不需要这些事件
      break;
    }

    case 'text_delta': {
      yield sseData({
        candidates: [{
          index: 0,
          content: {
            role: 'model',
            parts: [{ text: event.delta }],
          },
          finish_reason: null,
        }],
      });
      break;
    }

    case 'text_end': {
      // Gemini 不需要 text_end
      break;
    }

    case 'thinking_delta': {
      // Gemini 将 thinking 放在模型的 text 中，或者通过 safety_attributes
      // 简单处理：作为普通文本输出
      yield sseData({
        candidates: [{
          index: 0,
          content: {
            role: 'model',
            parts: [{ text: event.delta }],
          },
          finish_reason: null,
        }],
      });
      break;
    }

    case 'toolcall_end': {
      // Gemini 的 functionCall 在 parts 中
      yield sseData({
        candidates: [{
          index: 0,
          content: {
            role: 'model',
            parts: [{
              functionCall: {
                name: event.toolCall.name,
                args: event.toolCall.arguments,
              },
            }],
          },
          finish_reason: null,
        }],
      });
      break;
    }

    case 'done': {
      const u = event.message.usage;
      yield sseData({
        candidates: [{
          index: 0,
          content: { role: 'model', parts: [] },
          finish_reason: mapGeminiStopReason(event.reason),
        }],
        usageMetadata: {
          promptTokenCount: u.input,
          candidatesTokenCount: u.output,
          totalTokenCount: u.totalTokens,
          cachedContentTokenCount: u.cacheRead,
        },
      });
      break;
    }

    case 'error': {
      yield sseData({
        error: {
          code: 500,
          message: event.error.errorMessage ?? 'Unknown error',
          status: 'INTERNAL',
        },
      });
      break;
    }
  }
}

// ============================================================
// 非流式转换
// ============================================================

export function piResponseToGeminiJson(msg: AssistantMessage): Record<string, any> {
  const parts: any[] = msg.content.map(block => {
    switch (block.type) {
      case 'text':
        return { text: block.text };
      case 'thinking':
        return { text: block.thinking };
      case 'toolCall':
        return {
          functionCall: {
            name: block.name,
            args: block.arguments,
          },
        };
      default:
        return block;
    }
  });

  return {
    candidates: [{
      index: 0,
      content: {
        role: 'model',
        parts,
      },
      finish_reason: mapGeminiStopReason(msg.stopReason),
    }],
    usageMetadata: {
      promptTokenCount: msg.usage.input,
      candidatesTokenCount: msg.usage.output,
      totalTokenCount: msg.usage.totalTokens,
      cachedContentTokenCount: msg.usage.cacheRead,
    },
    modelVersion: msg.model,
  };
}

// ============================================================
// 辅助函数
// ============================================================

function sseData(data: Record<string, any>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function mapGeminiStopReason(reason: string): string {
  switch (reason) {
    case 'stop': return 'STOP';
    case 'length': return 'MAX_TOKENS';
    case 'toolUse': return 'STOP'; // Gemini 也用 STOP
    case 'error': return 'OTHER';
    case 'aborted': return 'OTHER';
    default: return 'OTHER';
  }
}
