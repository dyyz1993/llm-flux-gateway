import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Terminal, CheckCircle } from 'lucide-react';
import { QuickPrompts } from './QuickPrompts';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  // New props for curl generation
  currentSession?: {
    model: string;
    keyId: string;
    messages: Array<{ role: string; content: string }>;
  } | null;
}

/**
 * Chat input with auto-resize textarea
 */
export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading, disabled, currentSession }) => {
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSendingRef = useRef(false); // 🔒 防止快速点击

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }, [message]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || isLoading || disabled || isSendingRef.current) return;

    // 🔒 设置标志，防止快速点击
    isSendingRef.current = true;

    onSend(trimmed);
    setMessage('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // 🔒 延迟重置标志（等待状态更新）
    setTimeout(() => {
      isSendingRef.current = false;
    }, 100);
  };

  const handleQuickPrompt = (prompt: string) => {
    setMessage(prompt);
    textareaRef.current?.focus();
  };

  const handleCopyCurl = async () => {
    if (!currentSession) return;

    const messages = currentSession.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const curlCommand = `curl -X POST http://localhost:3000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "${currentSession.model}",
    "messages": ${JSON.stringify(messages, null, 2)}
  }'`;

    try {
      await navigator.clipboard.writeText(curlCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="border-t border-[#262626] bg-[#0a0a0a]">
      {/* Quick Prompts */}
      <div className="px-4 pt-3">
        <QuickPrompts onSelectPrompt={handleQuickPrompt} disabled={isLoading || disabled} />
      </div>

      {/* Input Area */}
      <div className="p-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled || isLoading}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              className={`w-full bg-[#111] border text-white text-sm px-4 py-3 rounded-xl resize-none focus:outline-none transition-all ${
                disabled || isLoading
                  ? 'border-[#262626] opacity-50 cursor-not-allowed'
                  : 'border-[#333] focus:border-indigo-600'
              }`}
              rows={1}
              style={{ maxHeight: '200px' }}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!message.trim() || isLoading || disabled}
            className={`p-3 rounded-xl font-bold transition-all ${
              !message.trim() || isLoading || disabled
                ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>

          {/* Copy curl button */}
          <button
            onClick={handleCopyCurl}
            disabled={!currentSession || currentSession.messages.length === 0}
            className={`p-3 rounded-xl font-medium transition-all ${
              !currentSession || currentSession.messages.length === 0
                ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
                : copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#1a1a1a] hover:bg-[#262626] text-gray-400 hover:text-white'
            }`}
            title={copied ? 'Copied!' : 'Copy as curl'}
          >
            {copied ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <Terminal className="w-5 h-5" />
            )}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="text-[10px] text-gray-600">
            Press Enter to send, Shift+Enter for new line
          </div>
          {currentSession && currentSession.messages.length > 0 && (
            <div className="text-[10px] text-gray-500">
              {currentSession.messages.length} messages • {currentSession.model}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
