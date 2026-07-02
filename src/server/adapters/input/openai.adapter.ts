/**
 * OpenAI → pi-ai Context 输入适配器
 */
import type { Context, Message, Tool } from '@earendil-works/pi-ai';
import { Type } from '@earendil-works/pi-ai';

export function openaiToPiContext(body: Record<string, any>): {
  context: Context;
  options: Record<string, any>;
} {
  const rawMessages: any[] = body.messages ?? [];

  // 提取 system prompt
  const systemMsg = rawMessages.find((m: any) => m.role === 'system');
  const nonSystemMessages = rawMessages.filter((m: any) => m.role !== 'system');

  const messages: Message[] = nonSystemMessages.map((msg: any) => {
    switch (msg.role) {
      case 'user':
        return {
          role: 'user',
          content: normalizeContent(msg.content),
          timestamp: Date.now(),
        } as Message;

      case 'assistant': {
        const content: any[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: typeof msg.content === 'string' ? msg.content : '' });
        }
        // 处理 tool_calls
        for (const tc of msg.tool_calls ?? []) {
          content.push({
            type: 'toolCall' as const,
            id: tc.id,
            name: tc.function.name,
            arguments: safeParseJSON(tc.function.arguments),
          });
        }
        return {
          role: 'assistant',
          content,
          timestamp: Date.now(),
        } as Message;
      }

      case 'tool':
        return {
          role: 'toolResult' as const,
          toolCallId: msg.tool_call_id,
          toolName: msg.name ?? '',
          content: [{ type: 'text' as const, text: String(msg.content ?? '') }],
          isError: false,
          timestamp: Date.now(),
        } as Message;

      default:
        return {
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          timestamp: Date.now(),
        } as Message;
    }
  });

  // 转换 tools
  const tools: Tool[] | undefined = body.tools?.map((t: any) => {
    const fn = t.function ?? t;
    return {
      name: fn.name,
      description: fn.description ?? '',
      parameters: Type.Object(
        // 用 TypeBox 的 Unwrapped 接受任意 schema
        fn.parameters?.properties ?? {},
        { additionalProperties: true }
      ),
    } as unknown as Tool;
  });

  // 提取 options (temperature, max_tokens, top_p, etc.)
  const options: Record<string, any> = {};
  if (body.temperature !== undefined) options.temperature = body.temperature;
  if (body.max_tokens !== undefined) options.maxTokens = body.max_tokens;
  if (body.top_p !== undefined) options.topP = body.top_p;
  if (body.presence_penalty !== undefined) options.presencePenalty = body.presence_penalty;
  if (body.frequency_penalty !== undefined) options.frequencyPenalty = body.frequency_penalty;
  if (body.stop !== undefined) options.stop = body.stop;
  if (body.tool_choice !== undefined) options.toolChoice = body.tool_choice;

  return {
    context: {
      systemPrompt: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
      messages,
      tools: tools?.length ? tools : undefined,
    },
    options,
  };
}

// ============================================================
// 辅助函数
// ============================================================

function normalizeContent(content: any): string | any[] {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(part => {
      if (part.type === 'text') return { type: 'text', text: part.text };
      if (part.type === 'image_url') {
        return {
          type: 'image' as const,
          data: extractBase64Data(part.image_url?.url ?? ''),
          mimeType: inferMimeType(part.image_url?.url ?? ''),
        };
      }
      return part;
    });
  }
  return String(content);
}

function extractBase64Data(url: string): string {
  // data:image/jpeg;base64,/9j/... → /9j/...
  const comma = url.indexOf(',');
  if (comma !== -1) return url.slice(comma + 1);
  return url;
}

function inferMimeType(url: string): string {
  if (url.startsWith('data:')) {
    const semi = url.indexOf(';');
    if (semi !== -1) return url.slice(5, semi);
  }
  return 'image/jpeg';
}

function safeParseJSON(str: string): Record<string, any> {
  try { return JSON.parse(str); } catch { return {}; }
}
