/**
 * 全链路轮转验证测试
 *
 * 验证从客户端请求 → 输入适配器 → pi-ai 处理 → 输出适配器 → SSE 的完整链路中，
 * 数据没有被丢失或篡改。
 *
 * 测试方法：
 * 1. 构造一个标准的 OpenAI 请求（含 system/user/assistant/tool/tool_calls 等）
 * 2. 通过输入适配器转 pi-ai context
 * 3. 从 context 重建上游请求体（模拟 pi-ai 的 buildParams）
 * 4. 对比重建后的请求体是否完整保留了原始数据
 */
// @ts-nocheck — 测试文件不需要严格类型检查
import { describe, it, expect } from 'vitest';
import { openaiToPiContext } from '../../input/openai.adapter';
import { piResponseToOpenaiJson, createOpenaiSSEConverter } from '../../output/openai.adapter';

// ============================================================
// 辅助函数
// ============================================================

/**
 * 将 pi-ai context 中的 messages 转回 OpenAI 格式，
 * 模拟 pi-ai 的 convertMessages() 行为
 */
function piContextToOpenaiMessages(
  systemPrompt: string | undefined,
  messages: any[],
): any[] {
  const result: any[] = [];

  // system prompt → system message（pi-ai 的行为）
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        result.push({ role: 'user', content: msg.content });
      } else if (Array.isArray(msg.content)) {
        // 多模态内容
        result.push({
          role: 'user',
          content: msg.content.map((block: any) => {
            if (block.type === 'text') return { type: 'text', text: block.text };
            if (block.type === 'image') return { type: 'image_url', image_url: { url: `data:${block.mimeType};base64,${block.data}` } };
            return block;
          }),
        });
      }
    } else if (msg.role === 'assistant') {
      const asstMsg: any = { role: 'assistant' };
      const textParts: string[] = [];
      const toolCalls: any[] = [];

      for (const block of msg.content || []) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'toolCall') {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.arguments),
            },
          });
        }
      }

      if (textParts.length > 0) {
        asstMsg.content = textParts.join('');
      } else {
        asstMsg.content = '';
      }
      if (toolCalls.length > 0) {
        asstMsg.tool_calls = toolCalls;
      }

      result.push(asstMsg);
    } else if (msg.role === 'toolResult') {
      result.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        name: msg.toolName,
        content: msg.content?.[0]?.text || '',
      });
    }
  }

  return result;
}

// ============================================================
// 测试用例
// ============================================================

describe('全链路数据保真度', () => {
  it('基础文字消息：输入输出无损', () => {
    const originalBody = {
      model: 'deepseek-v4-flash',
      stream: true,
      max_tokens: 100,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, how are you?' },
      ],
    };

    // 输入适配器 → pi-ai context
    const { context, options } = openaiToPiContext(originalBody);

    // 从 context 重建上游消息
    const rebuiltMessages = piContextToOpenaiMessages(
      context.systemPrompt,
      context.messages,
    );

    // 验证：system 消息保留
    expect(rebuiltMessages[0].role).toBe('system');
    expect(rebuiltMessages[0].content).toBe('You are a helpful assistant.');

    // 验证：user 消息保留
    expect(rebuiltMessages[1].role).toBe('user');
    expect(rebuiltMessages[1].content).toBe('Hello, how are you?');

    // 验证：options 保留
    expect(options.maxTokens).toBe(100);
  });

  it('带 tool_calls 的 assistant 消息：工具调用无损', () => {
    const originalBody = {
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_abc123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location":"Beijing","unit":"celsius"}',
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_abc123',
          name: 'get_weather',
          content: '{"temperature": 22, "condition": "sunny"}',
        },
      ],
    };

    const { context } = openaiToPiContext(originalBody);
    const rebuilt = piContextToOpenaiMessages(
      context.systemPrompt,
      context.messages,
    );

    // 验证：第一个是 assistant，带 tool_calls
    expect(rebuilt[0].role).toBe('assistant');
    expect(rebuilt[0].tool_calls).toBeDefined();
    expect(rebuilt[0].tool_calls!.length).toBe(1);
    expect(rebuilt[0].tool_calls![0].id).toBe('call_abc123');
    expect(rebuilt[0].tool_calls![0].function.name).toBe('get_weather');
    expect(JSON.parse(rebuilt[0].tool_calls![0].function.arguments)).toEqual({
      location: 'Beijing',
      unit: 'celsius',
    });

    // 验证：第二个是 tool 结果
    expect(rebuilt[1].role).toBe('tool');
    expect(rebuilt[1].tool_call_id).toBe('call_abc123');
    expect(rebuilt[1].name).toBe('get_weather');
    expect(rebuilt[1].content).toContain('22');
  });

  it('多项 tool_calls 全部保留', () => {
    const originalBody = {
      model: 'test-model',
      messages: [
        {
          role: 'assistant',
          content: 'Let me check both.',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"BJ"}' },
            },
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'get_time', arguments: '{"city":"BJ"}' },
            },
            {
              id: 'call_3',
              type: 'function',
              function: { name: 'get_news', arguments: '{"category":"tech"}' },
            },
          ],
        },
      ],
    };

    const { context } = openaiToPiContext(originalBody);
    const rebuilt = piContextToOpenaiMessages(
      context.systemPrompt,
      context.messages,
    );

    expect(rebuilt[0].tool_calls).toHaveLength(3);
    expect(rebuilt[0].tool_calls![0].id).toBe('call_1');
    expect(rebuilt[0].tool_calls![1].id).toBe('call_2');
    expect(rebuilt[0].tool_calls![2].id).toBe('call_3');
  });

  it('tool arguments 中特殊字符无损', () => {
    const originalBody = {
      model: 'test-model',
      messages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call_complex',
              type: 'function',
              function: {
                name: 'process_data',
                arguments: JSON.stringify({
                  query: "SELECT * FROM users WHERE name = 'O\\'Brien'",
                  filter: { tags: ['a', 'b', 'c'], count: 42 },
                  flag: true,
                  rating: 3.14,
                }),
              },
            },
          ],
        },
      ],
    };

    const { context } = openaiToPiContext(originalBody);
    const rebuilt = piContextToOpenaiMessages(
      context.systemPrompt,
      context.messages,
    );

    const args = JSON.parse(rebuilt[0].tool_calls![0].function.arguments);
    expect(args.query).toBe("SELECT * FROM users WHERE name = 'O\\'Brien'");
    expect(args.filter.tags).toEqual(['a', 'b', 'c']);
    expect(args.filter.count).toBe(42);
    expect(args.flag).toBe(true);
    expect(args.rating).toBe(3.14);
  });

  it('多模态消息（图片+文字）无损', () => {
    const originalBody = {
      model: 'test-model',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' },
            },
          ],
        },
      ],
    };

    const { context } = openaiToPiContext(originalBody);
    const rebuilt = piContextToOpenaiMessages(
      context.systemPrompt,
      context.messages,
    );

    expect(rebuilt[0].role).toBe('user');
    expect(Array.isArray(rebuilt[0].content)).toBe(true);
    const textBlock = rebuilt[0].content.find((b: any) => b.type === 'text');
    const imgBlock = rebuilt[0].content.find(
      (b: any) => b.type === 'image_url',
    );
    expect(textBlock.text).toBe('What is in this image?');
    expect(imgBlock.image_url.url).toContain('/9j/4AAQSkZJRg==');
  });

  it('options 完整映射', () => {
    const originalBody = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      top_p: 0.9,
      presence_penalty: 0.1,
      frequency_penalty: 0.2,
      stop: ['\n', '###'],
      tool_choice: 'auto' as const,
    };

    const { options } = openaiToPiContext(originalBody);

    expect(options.temperature).toBe(0.7);
    expect(options.topP).toBe(0.9);
    expect(options.presencePenalty).toBe(0.1);
    expect(options.frequencyPenalty).toBe(0.2);
    expect(options.stop).toEqual(['\n', '###']);
    expect(options.toolChoice).toBe('auto');
  });

  it('系统消息含特殊字符无损', () => {
    const originalBody = {
      model: 'test-model',
      messages: [
        {
          role: 'system',
          content:
            '你是 AI 助手。\n规则：\n1. 不要提"测试"\n2. 用 JSON 格式回复\n3. 特殊字符: \\\'"!@#$%^&*()',
        },
        { role: 'user', content: '你好' },
      ],
    };

    const { context } = openaiToPiContext(originalBody);
    const rebuilt = piContextToOpenaiMessages(
      context.systemPrompt,
      context.messages,
    );

    expect(rebuilt[0].content).toBe(originalBody.messages[0].content);
    expect(rebuilt[0].content).toContain('\\\'"!@#$%^&*()');
    expect(rebuilt[1].content).toBe('你好');
  });

  it('连续的 system/user/assistant 消息顺序保留', () => {
    const originalBody = {
      model: 'test-model',
      messages: [
        { role: 'system', content: 'S1' },
        { role: 'user', content: 'U1' },
        { role: 'assistant', content: 'A1' },
        { role: 'user', content: 'U2' },
        { role: 'assistant', content: 'A2' },
        { role: 'user', content: 'U3' },
      ],
    };

    const { context } = openaiToPiContext(originalBody);
    const rebuilt = piContextToOpenaiMessages(
      context.systemPrompt,
      context.messages,
    );

    expect(rebuilt).toHaveLength(6);
    expect(rebuilt[0].role).toBe('system');
    expect(rebuilt[0].content).toBe('S1');
    expect(rebuilt[1].role).toBe('user');
    expect(rebuilt[1].content).toBe('U1');
    expect(rebuilt[2].role).toBe('assistant');
    expect(rebuilt[2].content).toBe('A1');
    expect(rebuilt[3].role).toBe('user');
    expect(rebuilt[3].content).toBe('U2');
    expect(rebuilt[4].role).toBe('assistant');
    expect(rebuilt[4].content).toBe('A2');
    expect(rebuilt[5].role).toBe('user');
    expect(rebuilt[5].content).toBe('U3');
  });

  it('空机器助手消息（无 tool_calls）处理', () => {
    const originalBody = {
      model: 'test-model',
      messages: [
        {
          role: 'assistant',
          content: '',
        },
      ],
    };

    const { context } = openaiToPiContext(originalBody);
    const rebuilt = piContextToOpenaiMessages(
      context.systemPrompt,
      context.messages,
    );

    expect(rebuilt[0].role).toBe('assistant');
    expect(rebuilt[0].content).toBe('');
    expect(rebuilt[0].tool_calls).toBeUndefined();
  });

  it('output adapter 非流式包含 reasoning_content', () => {
    const msg = {
      role: 'assistant',
      api: 'openai-completions',
      provider: 'opencode-go',
      model: 'deepseek-v4-flash',
      responseId: 'test-123',
      stopReason: 'stop' as const,
      timestamp: Date.now(),
      content: [
        { type: 'thinking', thinking: 'The user wants a greeting.' },
        { type: 'text', text: 'Hello!' },
      ],
      usage: {
        input: 10,
        output: 5,
        totalTokens: 15,
        cacheRead: 0,
        cacheWrite: 0,
        reasoning: 8,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };

    const result = piResponseToOpenaiJson(msg as any);
    expect(result.choices[0].message.reasoning_content).toBe(
      'The user wants a greeting.',
    );
    expect(result.choices[0].message.content).toBe('Hello!');
    expect(result.usage.completion_tokens_details.reasoning_tokens).toBe(8);
  });

  it('output adapter 流式先 reasoning 后 content 的过渡标记', () => {
    const converter = createOpenaiSSEConverter();
    const msg = {
      role: 'assistant' as const,
      api: 'openai-completions',
      provider: 'opencode-go',
      model: 'test',
      content: [],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, reasoning: 0 },
      stopReason: 'stop' as const,
      timestamp: Date.now(),
    } as any;

    const lines = [
      ...converter.eventToSSE({ type: 'thinking_delta', contentIndex: 0, delta: '思考中', partial: msg }),
      ...converter.eventToSSE({ type: 'text_delta', contentIndex: 0, delta: 'Answer', partial: msg }),
    ];

    expect(lines).toHaveLength(2);
    // 第一个：thinking_delta → reasoning_content + content:null
    const thinkingChunk = JSON.parse(lines[0]!.slice(6));
    expect(thinkingChunk.choices[0].delta.reasoning_content).toBe('思考中');
    expect(thinkingChunk.choices[0].delta.content).toBeNull();

    // 第二个：text_delta（有过渡标记 reasoning_content:null）
    const textChunk = JSON.parse(lines[1]!.slice(6));
    expect(textChunk.choices[0].delta.content).toBe('Answer');
    expect(textChunk.choices[0].delta.reasoning_content).toBeNull();
  });

  it('工具调用完整轮转：assistant→tool→assistant', () => {
    const originalBody = {
      model: 'test-model',
      messages: [
        { role: 'system', content: 'Use tools.' },
        { role: 'user', content: 'Get weather in Beijing' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Beijing"}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'tc1',
          name: 'get_weather',
          content: '{"temp":22}',
        },
        {
          role: 'assistant',
          content: 'The weather in Beijing is 22°C.',
        },
      ],
    };

    const { context } = openaiToPiContext(originalBody);
    const rebuilt = piContextToOpenaiMessages(context.systemPrompt, context.messages);

    // 验证完整轮转
    expect(rebuilt).toHaveLength(5);
    expect(rebuilt[0].role).toBe('system');
    expect(rebuilt[1].role).toBe('user');
    expect(rebuilt[2].role).toBe('assistant');
    expect(rebuilt[2].tool_calls).toHaveLength(1);
    expect(rebuilt[3].role).toBe('tool');
    expect(rebuilt[3].tool_call_id).toBe('tc1');
    expect(rebuilt[3].name).toBe('get_weather');
    expect(rebuilt[4].role).toBe('assistant');
    expect(rebuilt[4].content).toBe('The weather in Beijing is 22°C.');
  });
});
