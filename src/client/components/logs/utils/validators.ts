/**
 * Parse content blocks from responseContent
 * Returns categorized content blocks by type
 */
export interface ParsedContentBlocks {
  textBlocks: string[];
  toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown>; cache_control?: unknown }>;
  thinkingBlocks: Array<{ thinking: string; signature?: string }>;
  cacheControlBlocks: Array<{ cache_control: unknown }>;
  imageBlocks: Array<{ url: string; detail?: string }>;
  otherBlocks: unknown[];
}

export function parseContentBlocks(content: string | unknown): ParsedContentBlocks {
  const result: ParsedContentBlocks = {
    textBlocks: [],
    toolUseBlocks: [],
    thinkingBlocks: [],
    cacheControlBlocks: [],
    imageBlocks: [],
    otherBlocks: [],
  };

  let parsed: unknown;
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
