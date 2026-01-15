import React, { useState } from 'react';
import { CheckCircle, Copy } from 'lucide-react';
import { copyToClipboard } from '@client/utils/clipboard';

interface CopyButtonProps {
  text: string;
  title?: string;
  className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ text, title = 'Copy', className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[CopyButton] Failed to copy to clipboard:', error);
    }
  };

  return (
    <button
      data-class-id="CopyButton"
      onClick={handleCopy}
      className={`p-1.5 rounded hover:bg-[#333] transition-colors ${copied ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'} ${className}`}
      title={copied ? 'Copied!' : title}
    >
      {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};
