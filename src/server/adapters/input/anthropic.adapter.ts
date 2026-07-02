/**
 * Anthropic → pi-ai Context 输入适配器
 */
import type { Context, Message, Tool } from '@earendil-works/pi-ai';

export function anthropicToPiContext(body: Record<string, any>): {
  context: Context;
  options: Record<string, any>;
} {
  const rawMessages: any[] = body.messages ?? [];

  // 提取 system prompt (Anthropic 用顶层的 system 字段)
  let systemPrompt: string | undefined;
  if (typeof body.system === 'string') {
    systemPrompt = body.system;
  } else if (Array.isArray(body.system)) {
    systemPrompt = body.system
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n');
  }

  const messages: Message[] = rawMessages.map((msg: any) => {
    switch (msg.role) {
      case 'user': {
        const content = normalizeAnthropicContent(msg.content);
        return { role: 'user', content, timestamp: Date.now() } as Message;
      }

      case 'assistant': {
        const content: any[] = [];
        const blocks = Array.isArray(msg.content) ? msg.content : [];

        for (const block of blocks) {
          switch (block.type) {
            case 'text':
              content.push({ type: 'text', text: block.text });
              break;
            case 'thinking':
              content.push({ type: 'thinking', thinking: block.thinking });
              break;
            case 'tool_use':
              content.push({
                type: 'toolCall' as const,
                id: block.id,
                name: block.name,
                arguments: block.input ?? {},
              });
              break;
          }
        }

        return { role: 'assistant', content, timestamp: Date.now() } as Message;
      }

      case 'tool_result': {
        const content: any[] = [];
        const rawContent = msg.content;
        if (typeof rawContent === 'string') {
          content.push({ type: 'text', text: rawContent });
        } else if (Array.isArray(rawContent)) {
          for (const block of rawContent) {
            if (block.type === 'text') content.push({ type: 'text', text: block.text });
            if (block.type === 'image') content.push({ type: 'image', data: block.source?.data ?? '', mimeType: block.source?.media_type ?? 'image/jpeg' });
          }
        }

        return {
          role: 'toolResult' as const,
          toolCallId: msg.tool_use_id ?? '',
          toolName: '',
          content,
          isError: msg.is_error ?? false,
          timestamp: Date.now(),
        } as Message;
      }

      default:
        return {
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          timestamp: Date.now(),
        } as Message;
    }
  });

  // 转换 tools (Anthropic 用 input_schema)
  const tools: Tool[] | undefined = body.tools?.map((t: any) => ({
    name: t.name,
    description: t.description ?? '',
    parameters: t.input_schema ?? {},
  }));

  // 提取 options
  const options: Record<string, any> = {};
  if (body.max_tokens !== undefined) options.maxTokens = body.max_tokens;
  if (body.temperature !== undefined) options.temperature = body.temperature;
  if (body.top_p !== undefined) options.topP = body.top_p;
  if (body.top_k !== undefined) options.topK = body.top_k;
  if (body.stop_sequences !== undefined) options.stop = body.stop_sequences;

  return {
    context: { systemPrompt, messages, tools: tools?.length ? tools : undefined },
    options,
  };
}

function normalizeAnthropicContent(content: any): string | any[] {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((block: any) => {
      switch (block.type) {
        case 'text': return { type: 'text', text: block.text };
        case 'image': {
          const src = block.source;
          return {
            type: 'image' as const,
            data: src?.data ?? '',
            mimeType: src?.media_type ?? 'image/jpeg',
          };
        }
        default: return block;
      }
    });
  }
  return String(content);
}
