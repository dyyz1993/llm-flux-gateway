/**
 * Gemini → pi-ai Context 输入适配器
 */
import type { Context, Message, Tool } from '@earendil-works/pi-ai';

export function geminiToPiContext(body: Record<string, any>): {
  context: Context;
  options: Record<string, any>;
} {
  // system_instruction
  let systemPrompt: string | undefined;
  const sysInstr = body.system_instruction;
  if (sysInstr) {
    const parts = sysInstr.parts ?? [];
    systemPrompt = parts.map((p: any) => p.text ?? '').join('\n');
  }

  // contents → messages
  const contents: any[] = body.contents ?? [];
  const messages: Message[] = contents.map((c: any) => {
    const role = c.role === 'model' ? 'assistant' : 'user';
    const parts = c.parts ?? [];

    if (role === 'user') {
      const content = parts.map((p: any) => {
        if (p.text) return { type: 'text' as const, text: p.text };
        if (p.inlineData) return { type: 'image' as const, data: p.inlineData.data ?? '', mimeType: p.inlineData.mimeType ?? 'image/jpeg' };
        if (p.functionResponse) return { type: 'text' as const, text: JSON.stringify(p.functionResponse.response) };
        return { type: 'text' as const, text: JSON.stringify(p) };
      });
      return { role: 'user' as const, content, timestamp: Date.now() } as Message;
    } else {
      // assistant
      const content: any[] = parts.map((p: any) => {
        if (p.text) return { type: 'text' as const, text: p.text };
        if (p.functionCall) return { type: 'toolCall' as const, id: `fc_${Date.now()}`, name: p.functionCall.name, arguments: p.functionCall.args ?? {} };
        return { type: 'text' as const, text: JSON.stringify(p) };
      });
      return { role: 'assistant' as const, content, timestamp: Date.now() } as Message;
    }
  });

  // tools (function_declarations)
  const tools: Tool[] | undefined = body.tools?.flatMap((t: any) => {
    const decls = t.functionDeclarations ?? [];
    return decls.map((d: any) => ({
      name: d.name,
      description: d.description ?? '',
      parameters: d.parameters ?? {},
    })) as Tool[];
  });

  // generationConfig → options
  const gc = body.generationConfig ?? {};
  const options: Record<string, any> = {};
  if (gc.temperature !== undefined) options.temperature = gc.temperature;
  if (gc.maxOutputTokens !== undefined) options.maxTokens = gc.maxOutputTokens;
  if (gc.topP !== undefined) options.topP = gc.topP;
  if (gc.topK !== undefined) options.topK = gc.topK;
  if (gc.stopSequences !== undefined) options.stop = gc.stopSequences;

  return {
    context: { systemPrompt, messages, tools: tools?.length ? tools : undefined },
    options,
  };
}
