import { ToolCall } from '@shared/types';

/**
 * Check if a log entry represents a streaming request
 * Detects streaming by checking the original_response JSON for the "streamed" flag
 */
export function isStreamingRequest(log: { originalResponse?: string | null; timeToFirstByteMs?: number | null } | null): boolean {
  if (!log?.originalResponse) return false;

  try {
    const originalResponse = JSON.parse(log.originalResponse);
    return originalResponse.streamed === true;
  } catch {
    // If parsing fails, check for secondary indicators
    // TTFB field is only populated for streaming requests
    return log.timeToFirstByteMs !== undefined && log.timeToFirstByteMs !== null;
  }
}

/**
 * Copy text to clipboard and show feedback
 */
export async function copyToClipboard(text: string, onSuccess?: () => void): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    if (onSuccess) onSuccess();
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to parse and format JSON content, returns original if parsing fails
 * Handles both string content and structured content (arrays, objects)
 */
export function tryFormatJson(content: string | unknown): { formatted: string; isJson: boolean } {
  // If content is not a string, convert it to string
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

  try {
    const parsed = JSON.parse(contentStr);
    return {
      formatted: JSON.stringify(parsed, null, 2),
      isJson: true,
    };
  } catch {
    return { formatted: contentStr, isJson: false };
  }
}

/**
 * Try to parse tool_calls from responseContent when finish_reason is "tool_calls"
 * Returns the tool_calls array if found, null otherwise
 */
export function tryParseToolCallsFromResponse(responseContent: string | undefined): ToolCall[] | null {
  if (!responseContent) {
    return null;
  }

  try {
    const parsed = JSON.parse(responseContent);

    // Case 1: Direct array of tool_calls
    if (Array.isArray(parsed)) {
      // Check if first item looks like a tool call
      if (parsed.length > 0 && parsed[0].type === 'function' && parsed[0].function) {
        return parsed;
      }
    }

    // Case 2: OpenAI format with choices array
    if (parsed.choices && Array.isArray(parsed.choices) && parsed.choices.length > 0) {
      const choice = parsed.choices[0];
      if (choice.message && choice.message.tool_calls) {
        return choice.message.tool_calls;
      }
    }

    // Case 3: Direct message with tool_calls
    if (parsed.message && parsed.message.tool_calls) {
      return parsed.message.tool_calls;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Format content that may be a string or an array of content blocks (Anthropic format)
 * Converts content to a string representation suitable for display
 */
export function formatContent(content: string | unknown): string {
  // If it's already a string, return as-is
  if (typeof content === 'string') {
    // Try to parse as JSON in case it's a stringified content array
    if (content.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return formatContent(parsed);
        }
      } catch {
        // Not valid JSON, return as-is
      }
    }
    return content;
  }

  // If content is not a string but an object/array (already parsed), handle it
  // This can happen when response_content is stored as a parsed object in the database

  // If it's an array (Anthropic content blocks format), format it
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === 'string') {
        return block;
      }
      if (block?.type === 'text') {
        return block.text || '';
      }
      if (block?.type === 'image_url' || block?.type === 'image') {
        return `[Image: ${block.image_url?.url || block.source?.type || 'unknown'}]`;
      }
      if (block?.type === 'tool_use') {
        // Show complete tool_use details
        const parts = [`\n[Tool Use: ${block.name || 'unknown'}`];
        if (block.id) parts.push(`ID: ${block.id}`);
        if (block.input && Object.keys(block.input).length > 0) {
          parts.push(`Input: ${JSON.stringify(block.input, null, 2)}`);
        }
        if (block.cache_control) {
          parts.push(`Cache: enabled`);
        }
        parts.push(']');
        return parts.join('\n  ');
      }
      if (block?.type === 'thinking') {
        // Show thinking content with signature if present
        const parts = [`\n[Thinking]`];
        if (block.thinking) {
          parts.push(block.thinking);
        }
        if (block.signature) {
          parts.push(`\n[Signature: ${block.signature.slice(0, 20)}...]`);
        }
        parts.push('[/Thinking]');
        return parts.join('\n');
      }
      if (block?.type === 'cache_control') {
        return `[Cache Control: ${block.cache_control?.type || 'ephemeral'}]`;
      }
      if (block?.type === 'tool_result') {
        const parts = [`\n[Tool Result: ${block.tool_use_id || 'unknown'}`];
        if (block.content) {
          parts.push(typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content, null, 2));
        }
        if (block.is_error) {
          parts.push(`[Error: ${block.is_error}]`);
        }
        parts.push(']');
        return parts.join('\n  ');
      }
      // Fallback for unknown block types - show full JSON for debugging
      return `[Unknown Block Type: ${JSON.stringify(block, null, 2)}]`;
    }).join('\n');
  }

  // Fallback: convert to JSON string
  return JSON.stringify(content, null, 2);
}

/**
 * Check if content should be truncated (based on length and lines)
 * Handles both string content and structured content (arrays)
 */
export function shouldTruncate(content: string | unknown, maxLength = 500, maxLines = 10): boolean {
  // Convert non-string content to string for length check
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  if (contentStr.length > maxLength) return true;
  const lines = contentStr.split('\n');
  return lines.length > maxLines;
}

/**
 * Check if content is structured (JSON array of content blocks)
 * Returns true if the content is an array (Anthropic structured format)
 */
export function isStructuredContent(content: string | unknown[] | undefined): boolean {
  if (!content) return false;

  // If it's already an array, it's structured content
  if (Array.isArray(content)) return true;

  // If it's a string, try to parse it
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed.startsWith('[')) return false;
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed);
    } catch {
      return false;
    }
  }

  return false;
}
