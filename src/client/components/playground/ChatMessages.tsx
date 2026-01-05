import React, { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { useChatStore } from '@client/stores/chatStore';
import { ChatMessageItem } from './ChatMessageItem';

interface ChatMessagesProps {
  isLoading?: boolean;
}

/**
 * Chat messages list container with auto-scroll
 */
export const ChatMessages: React.FC<ChatMessagesProps> = ({ isLoading }) => {
  const { currentSession } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const messages = currentSession?.messages || [];
    if (messages.length > prevMessageCount.current) {
      prevMessageCount.current = messages.length;
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [currentSession?.messages]);

  // Also scroll during streaming
  useEffect(() => {
    if (isLoading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isLoading]);

  const messages = currentSession?.messages || [];

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-6 space-y-4"
    >
      {messages.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full text-gray-600">
          <Sparkles className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">Start a conversation</p>
          <p className="text-xs mt-2 text-gray-700">Select a model and enter a message</p>
        </div>
      )}

      {messages.map(message => (
        <ChatMessageItem key={message.id} message={message} allMessages={messages} />
      ))}

      {isLoading && messages.length === 0 && (
        <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
        </div>
      )}
    </div>
  );
};
