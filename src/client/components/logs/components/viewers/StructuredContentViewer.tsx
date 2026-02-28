import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Cpu, Terminal, MessageSquare, Bell, Code, Eye, Key } from 'lucide-react';
import { parseContentBlocks } from '../../utils/validators';
import { ExpandableContent } from './ExpandableContent';

interface StructuredContentViewerProps {
  content: string | unknown;
  className?: string;
}

export const StructuredContentViewer: React.FC<StructuredContentViewerProps> = ({ content, className = '' }) => {
  const blocks = useMemo(() => parseContentBlocks(content), [content]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['thinking', 'tool_use', 'text', 'images']));

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const hasContent = blocks.textBlocks.length > 0 || blocks.toolUseBlocks.length > 0 ||
    blocks.thinkingBlocks.length > 0 || blocks.cacheControlBlocks.length > 0 ||
    blocks.imageBlocks.length > 0 || blocks.otherBlocks.length > 0;

  if (!hasContent) {
    return <div data-class-id="StructuredContentViewer" className="text-gray-500 italic">No content available</div>;
  }

  return (
    <div data-class-id="StructuredContentViewer" className={`space-y-3 ${className}`}>
      {/* Thinking Blocks - First */}
      {blocks.thinkingBlocks.length > 0 && (
        <div className="bg-[#0a0a0a] border border-purple-500/20 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('thinking')}
            className="w-full px-3 py-2 flex items-center justify-between bg-purple-500/5 hover:bg-purple-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-400">Thinking Process</span>
              <span className="text-xs text-gray-500">({blocks.thinkingBlocks.length})</span>
            </div>
            {expandedSections.has('thinking') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {expandedSections.has('thinking') && (
            <div className="p-3 border-t border-purple-500/10 space-y-3">
              {blocks.thinkingBlocks.map((block, idx) => (
                <div key={idx} className="border border-purple-500/10 rounded-lg p-3 bg-purple-500/5">
                  <ExpandableContent
                    content={block.thinking}
                    maxLength={500}
                    maxLines={12}
                    className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap"
                  />
                  {block.signature && (
                    <div className="mt-2 pt-2 border-t border-purple-500/10 flex items-center gap-2 text-xs text-gray-500">
                      <Key className="w-3 h-3" />
                      <span className="font-mono">{block.signature.slice(0, 20)}...</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tool Use Blocks - Second */}
      {blocks.toolUseBlocks.length > 0 && (
        <div className="bg-[#0a0a0a] border border-indigo-500/20 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('tool_use')}
            className="w-full px-3 py-2 flex items-center justify-between bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-medium text-indigo-400">Tool Calls</span>
              <span className="text-xs text-gray-500">({blocks.toolUseBlocks.length})</span>
            </div>
            {expandedSections.has('tool_use') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {expandedSections.has('tool_use') && (
            <div className="p-3 border-t border-indigo-500/10 space-y-3">
              {blocks.toolUseBlocks.map((tool, idx) => (
                <div key={idx} className="border border-[#262626] rounded-lg overflow-hidden bg-[#0f0f0f]">
                  <div className="px-3 py-2 bg-[#1a1a1a] border-b border-[#262626] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm font-mono font-bold text-indigo-300">{tool.name}</span>
                    </div>
                    {tool.id && (
                      <span className="text-xs text-gray-500 font-mono">{tool.id.slice(0, 8)}...</span>
                    )}
                  </div>
                  <div className="p-3">
                    <ExpandableContent
                      content={String(JSON.stringify(tool.input || {}, null, 2))}
                      maxLength={300}
                      maxLines={8}
                      className="text-xs text-gray-300"
                    />
                    {(tool.cache_control != null && tool.cache_control !== undefined) && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-cyan-400">
                        <Bell className="w-3 h-3" />
                        <span>Cache enabled</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Text Content - Last */}
      {blocks.textBlocks.length > 0 && (
        <div className="bg-[#0a0a0a] border border-blue-500/20 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('text')}
            className="w-full px-3 py-2 flex items-center justify-between bg-blue-500/5 hover:bg-blue-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-400">Text Content</span>
              <span className="text-xs text-gray-500">({blocks.textBlocks.length} blocks)</span>
            </div>
            {expandedSections.has('text') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {expandedSections.has('text') && (
            <div className="p-3 border-t border-blue-500/10 space-y-3">
              {blocks.textBlocks.map((text, idx) => (
                <ExpandableContent
                  key={idx}
                  content={text}
                  maxLength={500}
                  maxLines={10}
                  className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cache Control Blocks */}
      {blocks.cacheControlBlocks.length > 0 && (
        <div className="bg-[#0a0a0a] border border-cyan-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-cyan-400">
            <Bell className="w-4 h-4" />
            <span className="text-sm font-medium">Cache Control</span>
            <span className="text-xs text-gray-500">({blocks.cacheControlBlocks.length} blocks)</span>
          </div>
        </div>
      )}

      {/* Image Blocks */}
      {blocks.imageBlocks.length > 0 && (
        <div className="bg-[#0a0a0a] border border-green-500/20 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('images')}
            className="w-full px-3 py-2 flex items-center justify-between bg-green-500/5 hover:bg-green-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-400">Images</span>
              <span className="text-xs text-gray-500">({blocks.imageBlocks.length})</span>
            </div>
            {expandedSections.has('images') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {expandedSections.has('images') && (
            <div className="p-3 border-t border-green-500/10">
              <div className="flex flex-wrap gap-3">
                {blocks.imageBlocks.map((img, idx) => {
                  const isBase64 = img.url.startsWith('data:image');
                  const displayUrl = isBase64 ? img.url : img.url;
                  
                  return (
                    <div key={idx} className="relative group">
                      <img
                        src={displayUrl}
                        alt={`Image ${idx + 1}`}
                        className="w-24 h-24 object-cover rounded-lg border border-[#333] hover:border-green-500/50 transition-colors cursor-pointer"
                        onClick={() => window.open(displayUrl, '_blank')}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = `
                              <div class="w-24 h-24 flex items-center justify-center bg-[#1a1a1a] rounded-lg border border-[#333] text-gray-500">
                                <span class="text-xs text-center p-2">Failed to load</span>
                              </div>
                            `;
                          }
                        }}
                      />
                      {!isBase64 && (
                        <a
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute bottom-0 left-0 right-0 bg-black/70 text-[8px] text-gray-300 truncate px-1 py-0.5 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          {img.url.slice(0, 30)}...
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Other Blocks */}
      {blocks.otherBlocks.length > 0 && (
        <div className="bg-[#0a0a0a] border border-gray-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Code className="w-4 h-4" />
            <span className="text-sm font-medium">Other Blocks</span>
            <span className="text-xs text-gray-500">({blocks.otherBlocks.length})</span>
          </div>
          <ExpandableContent
            content={JSON.stringify(blocks.otherBlocks, null, 2)}
            maxLength={300}
            maxLines={8}
            className="text-xs text-gray-400"
          />
        </div>
      )}

      {/* Empty State - Show when no content blocks */}
      {!hasContent && (
        <div className="p-6 bg-[#0a0a0a] border border-[#262626] border-dashed rounded-lg text-center text-gray-600 text-sm">
          No content available
        </div>
      )}
    </div>
  );
};
