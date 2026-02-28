import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Terminal, CheckCircle, ImagePlus, X } from 'lucide-react';
import { QuickPrompts } from './QuickPrompts';
import { copyToClipboard } from '@client/utils/clipboard';
import { getApiBaseUrl } from '@client/services/apiClient';

export interface ImageAttachment {
  id: string;
  url: string;
  base64: string;
  mimeType: string;
  name: string;
}

interface ChatInputProps {
  onSend: (message: string, images?: ImageAttachment[]) => void;
  isLoading?: boolean;
  disabled?: boolean;
  currentSession?: {
    model: string;
    keyId: string;
    messages: Array<{ role: string; content: string }>;
  } | null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const ChatInput: React.FC<ChatInputProps> = ({ onSend, isLoading, disabled, currentSession }) => {
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSendingRef = useRef(false);

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
    if ((!trimmed && images.length === 0) || isLoading || disabled || isSendingRef.current) return;

    isSendingRef.current = true;

    onSend(trimmed, images.length > 0 ? images : undefined);
    setMessage('');
    setImages([]);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setTimeout(() => {
      isSendingRef.current = false;
    }, 100);
  };

  const handleQuickPrompt = (prompt: string) => {
    setMessage(prompt);
    textareaRef.current?.focus();
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        console.warn('Skipping non-image file:', file.name);
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        console.warn('Image too large (max 10MB):', file.name);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const attachment: ImageAttachment = {
          id: generateId(),
          url: base64,
          base64: base64.split(',')[1] || '',
          mimeType: file.type,
          name: file.name,
        };
        setImages(prev => [...prev, attachment]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleCopyCurl = async () => {
    if (!currentSession) return;

    const messages = currentSession.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const curlCommand = `curl -X POST ${getApiBaseUrl() || window.location.origin}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "model": "${currentSession.model}",
    "messages": ${JSON.stringify(messages, null, 2)}
  }'`;

    try {
      await copyToClipboard(curlCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy cURL command. Please select and copy manually.');
    }
  };

  const canSend = (message.trim() || images.length > 0) && !isLoading && !disabled;

  return (
    <div className="border-t border-[#262626] bg-[#0a0a0a]">
      <div className="px-4 pt-3">
        <QuickPrompts onSelectPrompt={handleQuickPrompt} disabled={isLoading || disabled} />
      </div>

      <div className="p-4">
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {images.map(img => (
              <div
                key={img.id}
                className="relative group"
              >
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-16 h-16 object-cover rounded-lg border border-[#333]"
                />
                <button
                  onClick={() => handleRemoveImage(img.id)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-gray-300 truncate px-1 rounded-b-lg">
                  {img.name}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 items-end">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isLoading}
            className={`p-3 rounded-xl transition-all ${
              disabled || isLoading
                ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
                : 'bg-[#1a1a1a] hover:bg-[#262626] text-gray-400 hover:text-white'
            }`}
            title="Attach image"
          >
            <ImagePlus className="w-5 h-5" />
          </button>

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled || isLoading}
              placeholder={images.length > 0 ? "Add a message (optional)..." : "Type your message... (Enter to send, Shift+Enter for new line)"}
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
            disabled={!canSend}
            className={`p-3 rounded-xl font-bold transition-all ${
              !canSend
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
            {images.length > 0 
              ? `${images.length} image${images.length > 1 ? 's' : ''} attached • Press Enter to send`
              : 'Press Enter to send, Shift+Enter for new line'}
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
