import React, { useMemo } from 'react';
import { Bot, Terminal } from 'lucide-react';
import { Message } from '@shared/types';
import { formatContent } from '../../utils/contentFormatters';
import { ExpandableContent } from './ExpandableContent';
import { CopyButton } from './CopyButton';

interface ResponseViewerProps {
  msg: Message;
}

export const ResponseViewer: React.FC<ResponseViewerProps> = ({ msg }) => {
  // Prepare copy text - raw message JSON
  const messageJson = useMemo(() => {
    return JSON.stringify(msg, null, 2);
  }, [msg]);

  const toolCalls = msg.tool_calls || msg.toolCalls;

  return (
    <div data-class-id="ResponseViewer" className="bg-[#0f1410] border border-emerald-900/30 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-emerald-500" />
          <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-wide">Model Output</h4>
        </div>
        <CopyButton text={messageJson} title="Copy output" />
      </div>

      {toolCalls && toolCalls.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 italic">Model requested tool execution:</p>
          {toolCalls.map((tc, idx) => (
            <div key={idx} className="border border-[#262626] rounded-lg overflow-hidden bg-[#0f0f0f]">
              <div className="px-3 py-2 bg-[#1a1a1a] border-b border-[#262626] flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-mono font-bold text-indigo-300 truncate" title={tc.function.name}>{tc.function.name}</span>
              </div>
              <div className="p-3 bg-[#050505]">
                <ExpandableContent
                  content={(() => {
                    try {
                      return JSON.stringify(JSON.parse(tc.function.arguments), null, 2);
                    } catch {
                      return tc.function.arguments;
                    }
                  })()}
                  maxLength={300}
                  maxLines={8}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ExpandableContent
          content={formatContent(msg.content || '')}
          maxLength={500}
          maxLines={10}
          className="text-sm text-gray-200 leading-relaxed border-l-2 border-emerald-500/20 pl-4"
        />
      )}
    </div>
  );
};
