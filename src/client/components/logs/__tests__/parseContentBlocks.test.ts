/**
 * Test parseContentBlocks function with various input types
 */

import { describe, it, expect } from 'vitest';

// Mock the parseContentBlocks function from LogExplorer
function parseContentBlocks(content: string | any) {
  const result: any = {
    textBlocks: [],
    toolUseBlocks: [],
    thinkingBlocks: [],
    cacheControlBlocks: [],
    imageBlocks: [],
    otherBlocks: [],
  };

  let parsed: any;
  if (typeof content === 'string') {
    // Try to parse as JSON array
    if (content.trim().startsWith('[')) {
      try {
        parsed = JSON.parse(content);
      } catch {
        // Not valid JSON, treat as plain text
        result.textBlocks.push(content);
        return result;
      }
    } else {
      // Plain text
      result.textBlocks.push(content);
      return result;
    }
  } else if (Array.isArray(content)) {
    // Content is already parsed as an array
    parsed = content;
  } else if (typeof content === 'object' && content !== null) {
    // Content is an object, treat it as a single content block
    parsed = [content];
  } else {
    // Unknown type, treat as plain text
    result.textBlocks.push(String(content));
    return result;
  }

  // If it's an array, process each block
  if (Array.isArray(parsed)) {
    for (const block of parsed) {
      if (typeof block === 'string') {
        result.textBlocks.push(block);
      } else if (block?.type === 'text' && block.text) {
        result.textBlocks.push(block.text);
      } else if (block?.type === 'tool_use') {
        result.toolUseBlocks.push({
          id: block.id,
          name: block.name,
          input: block.input || {},
          cache_control: block.cache_control,
        });
      } else if (block?.type === 'thinking') {
        result.thinkingBlocks.push({
          thinking: block.thinking || block.content || '',
          signature: block.signature,
        });
      } else if (block?.type === 'cache_control') {
        result.cacheControlBlocks.push({
          cache_control: block.cache_control || { type: 'ephemeral' },
        });
      } else if (block?.type === 'image_url') {
        result.imageBlocks.push({
          url: block.image_url?.url || block.url || '',
          detail: block.image_url?.detail,
        });
      } else {
        result.otherBlocks.push(block);
      }
    }
  }

  return result;
}

describe('parseContentBlocks', () => {
  it('should handle string content (plain text)', () => {
    const result = parseContentBlocks('Hello, world!');
    expect(result.textBlocks).toEqual(['Hello, world!']);
    expect(result.toolUseBlocks).toEqual([]);
  });

  it('should handle stringified JSON array', () => {
    const jsonStr = '[{"type":"text","text":"Hello"}]';
    const result = parseContentBlocks(jsonStr);
    expect(result.textBlocks).toEqual(['Hello']);
  });

  it('should handle already parsed array', () => {
    const arr = [{ type: 'text', text: 'Hello' }];
    const result = parseContentBlocks(arr);
    expect(result.textBlocks).toEqual(['Hello']);
  });

  it('should handle object content (single block)', () => {
    const obj = { type: 'text', text: 'Hello' };
    const result = parseContentBlocks(obj);
    expect(result.textBlocks).toEqual(['Hello']);
  });

  it('should handle mixed content blocks', () => {
    const content = [
      { type: 'thinking', thinking: 'Let me think...' },
      { type: 'text', text: 'Answer' },
      { type: 'tool_use', id: '123', name: 'search', input: { query: 'test' } },
    ];
    const result = parseContentBlocks(content);
    expect(result.thinkingBlocks).toHaveLength(1);
    expect(result.thinkingBlocks[0].thinking).toBe('Let me think...');
    expect(result.textBlocks).toEqual(['Answer']);
    expect(result.toolUseBlocks).toHaveLength(1);
    expect(result.toolUseBlocks[0].name).toBe('search');
  });

  it('should handle real-world data from database', () => {
    const realData = [
      {"type":"thinking","thinking":"用户想让我删除任务列表并继续工作。让我清空任务列表。"},
      {"type":"text","text":"好的，任务列表已清空。"},
      {"type":"tool_use","id":"call_356adb751d7c4d7babfda937","name":"TodoWrite","input":{"todos":[]}}
    ];
    const result = parseContentBlocks(realData);
    expect(result.thinkingBlocks).toHaveLength(1);
    expect(result.thinkingBlocks[0].thinking).toBe('用户想让我删除任务列表并继续工作。让我清空任务列表。');
    expect(result.textBlocks).toEqual(['好的，任务列表已清空。']);
    expect(result.toolUseBlocks).toHaveLength(1);
    expect(result.toolUseBlocks[0].name).toBe('TodoWrite');
  });

  it('should not throw on null or undefined', () => {
    expect(() => parseContentBlocks(null)).not.toThrow();
    expect(() => parseContentBlocks(undefined)).not.toThrow();
  });

  it('should handle empty array', () => {
    const result = parseContentBlocks([]);
    expect(result.textBlocks).toEqual([]);
    expect(result.toolUseBlocks).toEqual([]);
  });
});
