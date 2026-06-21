/**
 * Tests for the gateway-level image stripping helper.
 *
 * The function is invoked at the controller before the target converter
 * runs, so it must handle every content shape we may see coming out of
 * the protocol transpiler.
 */
// @ts-nocheck - test asserts access array members that the strict checker flags as possibly undefined
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isVisionModel,
  stripImagesFromInternalRequest,
  NON_VISION_MODEL_PREFIXES,
} from '../vision-filter';

describe('isVisionModel', () => {
  it('returns false for known non-vision prefixes', () => {
    expect(isVisionModel('deepseek-chat')).toBe(false);
    expect(isVisionModel('deepseek-v4-flash')).toBe(false);
    expect(isVisionModel('deepseek-reasoner')).toBe(false);
  });

  it('returns true for vision-capable model names', () => {
    expect(isVisionModel('gpt-4o')).toBe(true);
    expect(isVisionModel('claude-3-5-sonnet-20241022')).toBe(true);
    expect(isVisionModel('gemini-1.5-pro')).toBe(true);
  });

  it('returns true for empty/undefined model names', () => {
    expect(isVisionModel('')).toBe(true);
    expect(isVisionModel(undefined as any)).toBe(true);
  });
});

describe('stripImagesFromInternalRequest', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns 0 for an empty / invalid request', () => {
    expect(stripImagesFromInternalRequest(undefined)).toBe(0);
    expect(stripImagesFromInternalRequest(null)).toBe(0);
    expect(stripImagesFromInternalRequest({})).toBe(0);
    expect(stripImagesFromInternalRequest({ messages: 'not-an-array' })).toBe(0);
  });

  it('removes image_url blocks from a mixed array and keeps text', () => {
    const request = {
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'https://x.com/a.png' } },
          ],
        },
      ],
    };
    const removed = stripImagesFromInternalRequest(request);
    expect(removed).toBe(1);
    expect(request.messages[0].content).toEqual([
      { type: 'text', text: 'What is in this image?' },
    ]);
  });

  it('sets content to null when every block is an image_url', () => {
    const request = {
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://x.com/a.png' } },
            { type: 'image_url', image_url: { url: 'https://x.com/b.png' } },
          ],
        },
      ],
    };
    const removed = stripImagesFromInternalRequest(request);
    expect(removed).toBe(2);
    expect(request.messages[0].content).toBeNull();
  });

  it('handles a single image_url object as the whole content', () => {
    const request = {
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'user',
          content: { type: 'image_url', image_url: { url: 'https://x.com/a.png' } },
        },
      ],
    };
    const removed = stripImagesFromInternalRequest(request);
    expect(removed).toBe(1);
    expect(request.messages[0].content).toBeNull();
  });

  it('leaves text-only messages untouched', () => {
    const request = {
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'first' },
            { type: 'text', text: 'second' },
          ],
        },
      ],
    };
    const removed = stripImagesFromInternalRequest(request);
    expect(removed).toBe(0);
    expect(request.messages[0].content).toBe('Hello');
    expect(request.messages[1].content).toBe('Hi there');
    expect(request.messages[2].content).toHaveLength(2);
  });

  it('preserves non-image block types (thinking, text, etc.)', () => {
    const request = {
      model: 'deepseek-reasoner',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'think' },
            { type: 'image_url', image_url: { url: 'x' } },
            { type: 'thinking', thinking: 'hmm' },
          ],
        },
      ],
    };
    const removed = stripImagesFromInternalRequest(request);
    expect(removed).toBe(1);
    expect(request.messages[0].content).toHaveLength(2);
    expect(request.messages[0].content[0].type).toBe('text');
    expect(request.messages[0].content[1].type).toBe('thinking');
  });

  it('strips image_url from tool_calls.arguments JSON', () => {
    const request = {
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'tool',
          toolCallId: 'call_1',
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'lookup',
                arguments: JSON.stringify({
                  content: [
                    { type: 'text', text: 'desc' },
                    { type: 'image_url', image_url: { url: 'x' } },
                  ],
                }),
              },
            },
          ],
        },
      ],
    };
    const removed = stripImagesFromInternalRequest(request);
    expect(removed).toBe(1);
    const args = JSON.parse(request.messages[0].toolCalls[0].function.arguments);
    expect(args.content).toHaveLength(1);
    expect(args.content[0].type).toBe('text');
  });

  it('strips a top-level image_url field on a message', () => {
    const request = {
      model: 'deepseek-v4-flash',
      messages: [
        {
          role: 'user',
          content: 'see image',
          image_url: { url: 'https://x.com/a.png' },
        } as any,
      ],
    };
    const removed = stripImagesFromInternalRequest(request);
    expect(removed).toBe(1);
    expect((request.messages[0] as any).image_url).toBeUndefined();
  });

  it('handles the historical "messages[367]" case — strips all image_url across 400+ messages', () => {
    const messages: any[] = [];
    for (let i = 0; i < 400; i++) {
      if (i === 50) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: 'look' },
            { type: 'image_url', image_url: { url: 'https://x.com/a.png' } },
          ],
        });
      } else if (i % 100 === 0) {
        messages.push({
          role: 'user',
          content: { type: 'image_url', image_url: { url: 'https://x.com/b.png' } },
        });
      } else {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: 'plain text',
        });
      }
    }

    const request = { model: 'deepseek-v4-flash', messages };
    const removed = stripImagesFromInternalRequest(request);
    // 1 (at i=50) + 4 (at i=0,100,200,300) = 5
    expect(removed).toBe(5);

    for (const m of request.messages) {
      if (Array.isArray(m.content)) {
        for (const block of m.content) {
          expect(block.type).not.toBe('image_url');
        }
      } else {
        expect(m.content).not.toEqual(
          expect.objectContaining({ type: 'image_url' })
        );
      }
    }
  });
});

describe('NON_VISION_MODEL_PREFIXES registry', () => {
  it('contains at least deepseek', () => {
    expect(NON_VISION_MODEL_PREFIXES).toContain('deepseek-');
  });
});
