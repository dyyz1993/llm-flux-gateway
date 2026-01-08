import React, { useMemo, useState } from 'react';
import { ArrowRight, Terminal, ChevronDown, ChevronUp, Code } from 'lucide-react';
import { Role, Message } from '@shared/types';
import { formatContent } from '../../utils/contentFormatters';
import { ExpandableContent } from './ExpandableContent';
import { CopyButton } from './CopyButton';

interface MessageBubbleProps {
  msg: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ msg }) => {
  const isUser = msg.role === Role.USER;
  const isSystem = msg.role === Role.SYSTEM;
  const isTool = msg.role === Role.TOOL;
  const toolCalls = msg.tool_calls || msg.toolCalls;
  const [showProperties, setShowProperties] = useState(false);

  // Prepare copy text - raw message JSON
  const messageJson = useMemo(() => {
    return JSON.stringify(msg, null, 2);
  }, [msg]);

  // Extract properties excluding content and role (already displayed)
  const otherProperties = useMemo(() => {
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(msg)) {
      // Skip content and role as they are displayed separately
      if (key !== 'content' && key !== 'role') {
        props[key] = value;
      }
    }
    return props;
  }, [msg]);

  const hasOtherProperties = Object.keys(otherProperties).length > 0;

  return (
    <div
      data-class-id="MessageBubble"
      className={`flex gap-4 p-4 rounded-lg border ${
      isUser ? 'bg-[#1a1a1a] border-[#333]' :
      isSystem ? 'bg-[#111] border-[#262626] border-dashed' :
      isTool ? 'bg-[#0f121a] border-indigo-900/20' :
      'bg-indigo-950/10 border-indigo-500/10' // Assistant in input history
    }`}>
      <div className="w-20 flex-shrink-0 flex items-start justify-between">
        <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${
          isUser ? 'text-blue-400 border-blue-400/20 bg-blue-400/10' :
          isSystem ? 'text-orange-400 border-orange-400/20 bg-orange-400/10' :
          isTool ? 'text-purple-400 border-purple-400/20 bg-purple-400/10' :
          'text-emerald-400 border-emerald-400/20 bg-emerald-400/10'
        }`}>
          {msg.role}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Tool Calls Display - show input parameters only */}
            {toolCalls && toolCalls.length > 0 && (
              <div className="space-y-2 mb-3">
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
            )}

            {/* Regular Content (for non-tool messages) */}
            {(!isTool) && (
              <>
                {msg.content !== null && msg.content !== undefined ? (
                  <ExpandableContent
                    content={formatContent(msg.content)}
                    maxLength={500}
                    maxLines={10}
                    className="text-sm text-gray-300 leading-relaxed"
                  />
                ) : (
                  <span className="text-sm text-gray-500 italic">(No content)</span>
                )}
              </>
            )}

            {/* Tool Message Content - show the result */}
            {isTool && msg.content && (
              <div className="space-y-2">
                {msg.name && (
                  <div className="text-xs font-mono text-gray-500 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3" /> Result from <span className="text-indigo-400">{msg.name}</span>
                  </div>
                )}
                <ExpandableContent
                  content={formatContent(msg.content)}
                  maxLength={500}
                  maxLines={10}
                  className="text-sm text-gray-300 leading-relaxed"
                />
              </div>
            )}

            {/* Other Properties - collapsible */}
            {hasOtherProperties && (
              <div className="mt-3 pt-3 border-t border-[#262626]">
                <button
                  onClick={() => setShowProperties(!showProperties)}
                  className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  <Code className="w-3 h-3" />
                  <span>Message Properties</span>
                  <span className="text-[10px] bg-gray-800 px-1.5 py-0.5 rounded">{Object.keys(otherProperties).length}</span>
                  {showProperties ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {showProperties && (
                  <div className="mt-2 p-3 bg-[#050505] border border-[#262626] rounded-lg">
                    <ExpandableContent
                      content={JSON.stringify(otherProperties, null, 2)}
                      maxLength={500}
                      maxLines={15}
                      className="text-xs font-mono text-gray-400"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Copy Button */}
          <div className="flex-shrink-0">
            <CopyButton text={messageJson} title="Copy message" />
          </div>
        </div>
      </div>
    </div>
  );
};
