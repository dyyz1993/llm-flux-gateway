import React, { useState, useMemo } from 'react';
import { Terminal, ChevronRight, ChevronDown } from 'lucide-react';
import { ToolDefinition } from '@shared/types';
import { CopyButton } from '../viewers/CopyButton';
import { ToolDetailItem } from './ToolDetailItem';

interface ToolsViewerProps {
  tools: ToolDefinition[];
}

export const ToolsViewer: React.FC<ToolsViewerProps> = ({ tools }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Prepare copy text - formatted JSON of tools
  const toolsJson = useMemo(() => {
    return JSON.stringify(tools, null, 2);
  }, [tools]);

  return (
    <div data-class-id="ToolsViewer" className="bg-[#1a1a1a] rounded-lg border border-[#333] overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className="w-full flex items-center justify-between p-3 hover:bg-[#222] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-medium text-gray-200">Tools Configuration</span>
          <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20">
            {tools.length} definitions
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={toolsJson} title="Copy tools configuration" />
          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </div>
      </div>

      {isOpen && (
        <div className="p-3 border-t border-[#333] space-y-2 bg-[#111]">
          {tools.map((tool, idx) => (
            <ToolDetailItem key={idx} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
};
