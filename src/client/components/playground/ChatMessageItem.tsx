import React from 'react';
import { User, Bot } from 'lucide-react';
import type { ChatMessage } from '@shared/types';
import { ToolCallsDisplay } from './ToolCallsDisplay';

interface ChatMessageItemProps {
  message: ChatMessage;
  allMessages?: ChatMessage[]; // All messages to find tool results
}

/**
 * Format content that may be a string or an array of content blocks (Anthropic format)
 * Converts content to a string representation suitable for display
 */
function formatContent(content: string | any): string {
  // If it's already a string, return as-is
  if (typeof content === 'string') {
    return content;
  }

  // If it's an array (Anthropic content blocks format), format it
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === 'string') {
        return block;
      }
      if (block?.type === 'text') {
        return block.text || '';
      }
      if (block?.type === 'image') {
        return `[Image: ${block.source?.type || 'unknown'}]`;
      }
      if (block?.type === 'tool_use') {
        return `[Tool Use: ${block.name || 'unknown'}]`;
      }
      if (block?.type === 'tool_result') {
        return `[Tool Result: ${block.tool_use_id || 'unknown'}]`;
      }
      // Fallback for unknown block types
      return `[${block?.type || 'unknown'}]`;
    }).join('\n');
  }

  // Fallback: convert to JSON string
  return JSON.stringify(content, null, 2);
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
            {formatContent(message.content)}
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
        </div>
      </div>
    </div>
  );
};
