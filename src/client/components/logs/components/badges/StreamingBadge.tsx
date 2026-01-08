import React from 'react';
import { Zap } from 'lucide-react';

interface StreamingBadgeProps {
  isStreaming: boolean;
}

export const StreamingBadge: React.FC<StreamingBadgeProps> = ({ isStreaming }) => {
  if (!isStreaming) return null;

  return (
    <span
      data-class-id="StreamingBadge"
      className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20 font-medium"
      title="Streaming Request"
    >
      <Zap className="w-2.5 h-2.5" />
      Stream
    </span>
  );
};
