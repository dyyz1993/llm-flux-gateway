import React from 'react';
import { User, Bot, ImageIcon } from 'lucide-react';
import type { ChatMessage } from '@shared/types';
import { ToolCallsDisplay } from './ToolCallsDisplay';

interface ContentBlock {
  type: string;
  text?: string;
  image_url?: { url: string; detail?: string };
  source?: { type: string; url?: string; media_type?: string; data?: string };
}

interface ChatMessageItemProps {
  message: ChatMessage;
  allMessages?: ChatMessage[]; // All messages to find tool results
}

/**
 * Parse content that may be a string or an array of content blocks
 */
function parseContent(content: string | unknown): ContentBlock[] {
  // If it's already a string
  if (typeof content === 'string') {
    // Try to parse as JSON array (for multimodal content stored as string)
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Not JSON, return as text block
    }
    return [{ type: 'text', text: content }];
  }

  // If it's an array
  if (Array.isArray(content)) {
    return content;
  }

  // Fallback
  return [{ type: 'text', text: String(content) }];
}

/**
 * Render an image block with preview
 */
function ImagePreview({ block }: { block: ContentBlock }) {
  let imageUrl = '';
  
  // OpenAI format
  if (block.image_url?.url) {
    imageUrl = block.image_url.url;
  }
  // Anthropic format
  else if (block.source?.url) {
    imageUrl = block.source.url;
  }
  // Anthropic base64 format
  else if (block.source?.type === 'base64' && block.source.data && block.source.media_type) {
    imageUrl = `data:${block.source.media_type};base64,${block.source.data}`;
  }

  if (!imageUrl) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[#262626] rounded-lg text-gray-400 text-xs">
        <ImageIcon className="w-4 h-4" />
        <span>[Image unavailable]</span>
      </div>
    );
  }

  // Check if it's a base64 image or URL
  const isBase64 = imageUrl.startsWith('data:image');
  const displayUrl = isBase64 ? imageUrl : imageUrl;

  return (
    <div className="my-1">
      <img
        src={displayUrl}
        alt="Attached image"
        className="max-w-[200px] max-h-[200px] object-cover rounded-lg border border-[#333]"
        onError={(e) => {
          // Hide broken image and show placeholder
          e.currentTarget.style.display = 'none';
          const parent = e.currentTarget.parentElement;
          if (parent) {
            parent.innerHTML = `
              <div class="flex items-center gap-2 px-3 py-2 bg-[#262626] rounded-lg text-gray-400 text-xs">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                <span>[Image failed to load]</span>
              </div>
            `;
          }
        }}
      />
      {!isBase64 && (
        <a
          href={imageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block mt-1 text-[10px] text-gray-500 hover:text-gray-400 truncate max-w-[200px]"
        >
          {imageUrl}
        </a>
      )}
    </div>
  );
}

/**
 * Format content blocks for display
 */
function formatContent(content: string | unknown): string {
  const blocks = parseContent(content);
  
  return blocks.map((block) => {
    if (block.type === 'text') {
      return block.text || '';
    }
    if (block.type === 'image_url' || block.type === 'image') {
      return '[Image]';
    }
    if (block.type === 'tool_use') {
      return `[Tool: ${block.text || 'unknown'}]`;
    }
    if (block.type === 'tool_result') {
      return `[Tool Result]`;
    }
    return '';
  }).filter(Boolean).join('\n');
}

/**
 * Single chat message component
 */
export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({ message, allMessages }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool';

  // Don't display tool messages separately - they're shown in the assistant's ToolCallsDisplay
  if (isTool) {
    return null;
  }

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="px-4 py-2 bg-[#1a1a1a] border border-[#333] rounded-full">
          <span className="text-xs text-gray-500">{formatContent(message.content)}</span>
        </div>
      </div>
    );
  }

  // Parse content blocks
  const contentBlocks = React.useMemo(() => parseContent(message.content), [message.content]);

  // Check if message has images
  const hasImages = contentBlocks.some(b => b.type === 'image_url' || b.type === 'image');

  // Collect tool results if this is an assistant message with tool calls
  const toolResults = React.useMemo(() => {
    if (!message.toolCalls || message.toolCalls.length === 0 || !allMessages) {
      return undefined;
    }

    const results = new Map<string, string>();
    const messageIndex = allMessages.findIndex(m => m.id === message.id);

    // Look for tool messages that come after this assistant message
    for (let i = messageIndex + 1; i < allMessages.length; i++) {
      const nextMessage = allMessages[i];

      if (nextMessage?.role === 'tool' && nextMessage.toolCallId) {
        // Find the tool call this result belongs to
        const toolCall = message.toolCalls?.find(tc => tc.id === nextMessage.toolCallId);
        if (toolCall) {
          results.set(toolCall.id!, formatContent(nextMessage.content || ''));
        }
      } else if (nextMessage?.role === 'assistant' && nextMessage.toolCalls && nextMessage.toolCalls.length > 0) {
        // Stop if we hit another assistant message with its own tool calls (new tool execution round)
        break;
      }
    }

    return results;
  }, [message, allMessages]);

  return (
    <div className={`flex gap-3 mb-6 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-indigo-600' : 'bg-emerald-600'
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-white" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : 'text-left'}`}>
        <div className={`inline-block px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-indigo-600 text-white'
            : 'bg-[#1a1a1a] text-gray-100 border border-[#262626]'
        }`}>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">
            {/* Render content blocks */}
            {contentBlocks.map((block, index) => {
              if (block.type === 'text') {
                return <span key={index}>{block.text}</span>;
              }
              if (block.type === 'image_url' || block.type === 'image') {
                return <ImagePreview key={index} block={block} />;
              }
              if (block.type === 'tool_use') {
                return (
                  <span key={index} className="text-gray-400 text-xs">
                    [Tool: {block.text || 'unknown'}]
                  </span>
                );
              }
              return null;
            })}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-current opacity-50 animate-pulse ml-1" />
            )}
          </div>

          {/* Token usage */}
          {message.tokens && (
            <div className={`mt-2 text-[10px] opacity-60 ${isUser ? 'text-indigo-200' : 'text-gray-500'}`}>
              {message.tokens.prompt} + {message.tokens.completion} = {message.tokens.prompt + message.tokens.completion} tokens
            </div>
          )}
        </div>

        {/* Tool Calls with Results */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallsDisplay toolCalls={message.toolCalls} toolResults={toolResults} />
        )}

        {/* Timestamp */}
        <div className="mt-1 text-[10px] text-gray-600">
          {new Date(message.timestamp).toLocaleTimeString()}
          {hasImages && ' • 🖼️'}
        </div>
      </div>
    </div>
  );
};
