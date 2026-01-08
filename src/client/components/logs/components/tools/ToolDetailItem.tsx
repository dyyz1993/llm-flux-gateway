import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ToolDefinition } from '@shared/types';

interface ToolDetailItemProps {
  tool: ToolDefinition;
}

export const ToolDetailItem: React.FC<ToolDetailItemProps> = ({ tool }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const params = tool.function.parameters;
  const properties = params?.properties || {};
  const required = params?.required || [];

  return (
    <div data-class-id="ToolDetailItem" className="border border-[#262626] rounded-md overflow-hidden bg-[#0f0f0f]">
      <div
        className="px-3 py-2 flex items-center cursor-pointer hover:bg-[#1a1a1a] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <span className={`text-xs transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} shrink-0`}>
            <ChevronRight className="w-3 h-3 text-gray-500" />
          </span>
          <span className="text-sm font-bold text-indigo-300 font-mono shrink-0">{tool.function.name}</span>
          <span className="text-xs text-gray-500 truncate max-w-[300px] hidden sm:block" title={tool.function.description}>- {tool.function.description}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 bg-[#050505] border-t border-[#262626]">
          {Object.keys(properties).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(properties).map(([key, val]: [string, unknown]) => (
                <div key={key} className="text-xs font-mono border-l-2 border-[#262626] pl-3 py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-semibold">{key}</span>
                    {required.includes(key) && <span className="text-red-500" title="Required">*</span>}
                    <span className="text-yellow-600/80 text-[10px] bg-[#1a1a1a] px-1 rounded">
                      {(val as { type: string }).type}
                    </span>
                  </div>
                  <div className="text-gray-400 mt-1 pl-0.5 leading-relaxed break-words overflow-wrap-anywhere">
                    {(val as { description?: string }).description}
                    {(val as { enum?: string[] }).enum && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {(val as { enum: string[] }).enum.map((e: string) => (
                          <span key={e} className="text-[10px] bg-[#1a1a1a] border border-[#333] px-1.5 rounded text-gray-500">
                            "{e}"
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-600 italic">No parameters defined (void)</p>
          )}
        </div>
      )}
    </div>
  );
};
