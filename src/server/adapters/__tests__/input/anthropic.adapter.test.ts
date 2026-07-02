/**
 * Anthropic 输入适配器测试
 *
 * 覆盖 AGENTS.md I13-I19
 */
import { describe, it, expect } from 'vitest';
import { anthropicToPiContext } from '../../input/anthropic.adapter';

describe('Anthropic → pi-ai Context', () => {
  it('I13: system 字段 → context.systemPrompt', () => {
    const { context } = anthropicToPiContext({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(context.systemPrompt).toBe('You are a helpful assistant');
  });

  it('I14: messages → pi-ai Messages', () => {
    const { context } = anthropicToPiContext({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
      ],
    });
    expect(context.messages).toHaveLength(2);
    expect(context.messages[0]).toMatchObject({ role: 'user' });
    expect(context.messages[1]).toMatchObject({ role: 'assistant' });
  });

  it('I15: tool_use content block → toolCall', () => {
    const { context } = anthropicToPiContext({
      messages: [{
        role: 'assistant',
        content: [{
          type: 'tool_use',
          id: 'toolu_abc',
          name: 'get_weather',
          input: { city: 'Tokyo' },
        }],
      }],
    });
    const msg = context.messages[0] as any;
    expect(msg.content[0].type).toBe('toolCall');
    expect(msg.content[0].name).toBe('get_weather');
    expect(msg.content[0].arguments).toEqual({ city: 'Tokyo' });
  });

  it('I16: tool_result → toolResult', () => {
    const { context } = anthropicToPiContext({
      messages: [{
        role: 'tool_result',
        tool_use_id: 'toolu_abc',
        content: 'Sunny, 25°C',
      }],
    });
    expect((context.messages[0] as any).role).toBe('toolResult');
    expect((context.messages[0] as any).toolCallId).toBe('toolu_abc');
  });

  it('I17: thinking content block → thinking', () => {
    const { context } = anthropicToPiContext({
      messages: [{
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Step 1: analyze' },
          { type: 'text', text: 'Result: 42' },
        ],
      }],
    });
    const msg = context.messages[0] as any;
    expect(msg.content[0].type).toBe('thinking');
    expect(msg.content[0].thinking).toBe('Step 1: analyze');
    expect(msg.content[1].type).toBe('text');
    expect(msg.content[1].text).toBe('Result: 42');
  });

  it('I18: max_tokens → options.maxTokens', () => {
    const { options } = anthropicToPiContext({
      max_tokens: 2048,
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(options.maxTokens).toBe(2048);
  });

  it('I19: tools (input_schema) → pi-ai Tool', () => {
    const { context } = anthropicToPiContext({
      messages: [{ role: 'user', content: 'weather' }],
      tools: [{
        name: 'get_weather',
        description: 'Get weather',
        input_schema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      }],
    });
    expect(context.tools).toHaveLength(1);
    expect(context.tools![0]!.name).toBe('get_weather');
  });
});
