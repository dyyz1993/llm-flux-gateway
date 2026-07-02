/**
 * OpenAI 输入适配器测试
 *
 * 覆盖 AGENTS.md I01-I12
 */
import { describe, it, expect } from 'vitest';
import { openaiToPiContext } from '../../input/openai.adapter';

describe('OpenAI → pi-ai Context', () => {
  it('I01: 普通文本对话 → Messages', () => {
    const { context } = openaiToPiContext({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    });
    expect(context.systemPrompt).toBe('You are helpful');
    expect(context.messages).toHaveLength(2);
    expect(context.messages[0]).toMatchObject({ role: 'user' });
    expect(context.messages[1]).toMatchObject({ role: 'assistant' });
  });

  it('I02: System prompt → context.systemPrompt', () => {
    const { context } = openaiToPiContext({
      messages: [{ role: 'system', content: 'Be nice' }, { role: 'user', content: 'ok' }],
    });
    expect(context.systemPrompt).toBe('Be nice');
  });

  it('I03: 多轮对话顺序不变', () => {
    const { context } = openaiToPiContext({
      messages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' },
        { role: 'assistant', content: 'a2' },
      ],
    });
    expect(context.messages).toHaveLength(4);
    expect((context.messages[0] as any).content).toBe('q1');
    // assistant content 被转成 content blocks
    const lastMsg = context.messages[3] as any;
    expect(lastMsg.content).toBeInstanceOf(Array);
    expect(lastMsg.content[0].text).toBe('a2');
  });

  it('I04: tool_calls → AssistantMessage 中的 toolCall', () => {
    const { context } = openaiToPiContext({
      messages: [{
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
        }],
      }],
    });
    const msg = context.messages[0] as any;
    expect(msg.content).toHaveLength(1);
    expect(msg.content[0].type).toBe('toolCall');
    expect(msg.content[0].name).toBe('get_weather');
    expect(msg.content[0].arguments).toEqual({ city: 'Tokyo' });
  });

  it('I05: tool 角色消息 → toolResult', () => {
    const { context } = openaiToPiContext({
      messages: [{
        role: 'tool',
        tool_call_id: 'call_1',
        content: 'Sunny, 25°C',
      }],
    });
    expect((context.messages[0] as any).role).toBe('toolResult');
    expect((context.messages[0] as any).toolCallId).toBe('call_1');
  });

  it('I06: 图片输入 (image_url) → ImageContent', () => {
    const { context } = openaiToPiContext({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
        ],
      }],
    });
    const content = context.messages[0] as any;
    expect(Array.isArray(content.content)).toBe(true);
    expect(content.content[0].type).toBe('text');
    expect(content.content[1].type).toBe('image');
    expect(content.content[1].mimeType).toBe('image/png');
    expect(content.content[1].data).toBe('iVBORw0KGgo=');
  });

  it('I07: 参数 → options', () => {
    const { options } = openaiToPiContext({
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      max_tokens: 1000,
      top_p: 0.9,
      presence_penalty: 0.1,
      frequency_penalty: 0.2,
    });
    expect(options.temperature).toBe(0.7);
    expect(options.maxTokens).toBe(1000);
    expect(options.topP).toBe(0.9);
    expect(options.presencePenalty).toBe(0.1);
    expect(options.frequencyPenalty).toBe(0.2);
  });

  it('I08: tools → pi-ai Tool', () => {
    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'weather' }],
      tools: [{
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        },
      }],
    });
    expect(context.tools).toHaveLength(1);
    expect(context.tools![0]!.name).toBe('get_weather');
  });

  it('I09: tool_choice → options', () => {
    const { options } = openaiToPiContext({
      messages: [{ role: 'user', content: 'hi' }],
      tool_choice: 'auto',
    });
    expect(options.toolChoice).toBe('auto');
  });

  it('I10: stream 字段不影响转换', () => {
    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });
    expect(context.messages).toHaveLength(1);
  });

  it('I11: stop sequences → options', () => {
    const { options } = openaiToPiContext({
      messages: [{ role: 'user', content: 'hi' }],
      stop: ['\n', '###'],
    });
    expect(options.stop).toEqual(['\n', '###']);
  });
});
