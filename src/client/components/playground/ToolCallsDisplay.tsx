import React, { useState } from 'react';
import { Wrench, ChevronDown, ChevronUp } from 'lucide-react';
import type { ToolCall } from '@shared/types';

interface ToolCallsDisplayProps {
  toolCalls: ToolCall[];
  toolResults?: Map<string, string>; // Map from tool_call_id to result
}

/**
 * Component to display tool calls made by the assistant
 * Shows both input arguments and output results in one place
 */
export const ToolCallsDisplay: React.FC<ToolCallsDisplayProps> = ({ toolCalls, toolResults }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const tryFormatJSON = (jsonString: string): string => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonString;
    }
  };

  return (
    <div className="mt-3 p-3 bg-[#0f1410] border border-emerald-900/30 rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider hover:text-emerald-300 transition-colors"
      >
        <Wrench className="w-4 h-4" />
        Tool Calls ({toolCalls.length})
        {isExpanded ? (
          <ChevronUp className="w-3 h-3 ml-1" />
        ) : (
          <ChevronDown className="w-3 h-3 ml-1" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-2">
          {toolCalls.map((call, index) => {
            const result = call.id ? toolResults?.get(call.id) : undefined;

            return (
              <div key={call.id || index} className="p-3 bg-[#0a0a0a] border border-[#262626] rounded">
                {/* Tool Header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-white">{call.function.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{call.id}</span>
                </div>

                {/* Input Arguments */}
                <div className="mb-2">
                  <div className="text-[10px] text-emerald-400 font-medium mb-1">📥 Input</div>
                  <pre className="p-2 bg-[#111] rounded text-[10px] text-gray-400 overflow-x-auto border border-emerald-900/20">
                    {tryFormatJSON(call.function.arguments)}
                  </pre>
                </div>

                {/* Output Result */}
                {result && (
                  <div>
                    <div className="text-[10px] text-blue-400 font-medium mb-1">📤 Output</div>
                    <pre className="p-2 bg-[#111] rounded text-[10px] text-gray-400 overflow-x-auto border border-blue-900/20">
                      {tryFormatJSON(result)}
                    </pre>
                  </div>
                )}

                {!result && (
                  <div className="text-[10px] text-gray-600 italic">
                    Waiting for result...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
