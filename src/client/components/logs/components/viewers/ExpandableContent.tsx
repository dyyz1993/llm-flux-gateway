import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { tryFormatJson, shouldTruncate } from '../../utils/contentFormatters';

interface ExpandableContentProps {
  content: string | unknown;
  maxLength?: number;
  maxLines?: number;
  className?: string;
}

export const ExpandableContent: React.FC<ExpandableContentProps> = ({
  content,
  maxLength = 500,
  maxLines = 10,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(!shouldTruncate(content, maxLength, maxLines));
  const needsTruncation = shouldTruncate(content, maxLength, maxLines);

  // Format JSON if applicable
  const { formatted, isJson } = useMemo(() => tryFormatJson(content), [content]);

  // Convert content to string for length check
  const contentStr = String(content);

  if (!needsTruncation) {
    return (
      <pre
        data-class-id="ExpandableContent"
        className={`text-xs font-mono whitespace-pre-wrap break-words overflow-wrap-break-word ${isJson ? 'text-emerald-300' : 'text-gray-400'} ${className}`}
        style={{
          wordBreak: 'break-word',
        }}
      >
        {formatted}
      </pre>
    );
  }

  return (
    <div data-class-id="ExpandableContent">
      <pre
        className={`text-xs font-mono whitespace-pre-wrap break-words overflow-wrap-break-word ${isJson ? 'text-emerald-300' : 'text-gray-400'} ${className} ${!isExpanded ? 'line-clamp-10' : ''}`}
        style={{
          maxHeight: isExpanded ? 'none' : '200px',
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {formatted}
      </pre>
      {needsTruncation && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
        >
          {isExpanded ? (
            <span>Show less <ChevronUp className="w-3 h-3 inline" /></span>
          ) : (
            <span>Show more ({typeof content === 'string' && contentStr.length > maxLength ? `${contentStr.length} chars` : `${formatted.split('\n').length} lines`}) <ChevronDown className="w-3 h-3 inline" /></span>
          )}
        </button>
      )}
    </div>
  );
};
