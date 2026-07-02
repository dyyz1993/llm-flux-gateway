/**
 * Gemini 输入适配器测试
 *
 * 覆盖 AGENTS.md I20-I23
 */
import { describe, it, expect } from 'vitest';
import { geminiToPiContext } from '../../input/gemini.adapter';

describe('Gemini → pi-ai Context', () => {
  it('I20: contents → pi-ai messages', () => {
    const { context } = geminiToPiContext({
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there!' }] },
      ],
    });
    expect(context.messages).toHaveLength(2);
    expect(context.messages[0]).toMatchObject({ role: 'user' });
    expect(context.messages[1]).toMatchObject({ role: 'assistant' });
    expect((context.messages[1] as any).content[0].text).toBe('Hi there!');
  });

  it('I21: system_instruction → systemPrompt', () => {
    const { context } = geminiToPiContext({
      system_instruction: { parts: [{ text: 'You are Gemini.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    });
    expect(context.systemPrompt).toBe('You are Gemini.');
  });

  it('I22: generationConfig → options', () => {
    const { options } = geminiToPiContext({
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2048,
        topP: 0.95,
        topK: 40,
      },
    });
    expect(options.temperature).toBe(0.8);
    expect(options.maxTokens).toBe(2048);
    expect(options.topP).toBe(0.95);
    expect(options.topK).toBe(40);
  });

  it('I23: tools (function_declarations) → pi-ai Tool', () => {
    const { context } = geminiToPiContext({
      contents: [{ role: 'user', parts: [{ text: 'weather' }] }],
      tools: [{
        functionDeclarations: [{
          name: 'get_weather',
          description: 'Get weather',
          parameters: { type: 'object', properties: { city: { type: 'string' } } },
        }],
      }],
    });
    expect(context.tools).toHaveLength(1);
    expect(context.tools![0]!.name).toBe('get_weather');
  });

  it('functionCall in model response → toolCall', () => {
    const { context } = geminiToPiContext({
      contents: [{
        role: 'model',
        parts: [{
          functionCall: { name: 'get_weather', args: { city: 'Tokyo' } },
        }],
      }],
    });
    const msg = context.messages[0] as any;
    expect(msg.content[0].type).toBe('toolCall');
    expect(msg.content[0].name).toBe('get_weather');
    expect(msg.content[0].arguments).toEqual({ city: 'Tokyo' });
  });
});
