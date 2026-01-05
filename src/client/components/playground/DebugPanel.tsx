import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Bug, Copy, Check } from 'lucide-react';

/**
 * Debug info for request transformation
 */
export interface DebugInfo {
  originalFormat: string;
  targetFormat: string;
  originalRequest: any;
  transformedRequest?: any;
  transformationErrors?: string[];
  transformationTime?: number;
}

/**
 * Props for DebugPanel component
 */
export interface DebugPanelProps {
  debugInfo: DebugInfo | null;
  onClear?: () => void;
}

/**
 * DebugPanel Component
 *
 * Displays transformation details for debugging protocol conversion.
 * Shows original request, transformed request, and any errors.
 */
export const DebugPanel: React.FC<DebugPanelProps> = ({ debugInfo, onClear }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null as any);

  if (!debugInfo) {
    return null;
  }

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatJson = (obj: any) => {
    return JSON.stringify(obj, null, 2);
  };

  const originalJson = formatJson(debugInfo.originalRequest);
  const transformedJson = debugInfo.transformedRequest
    ? formatJson(debugInfo.transformedRequest)
    : null;

  return (
    <div className="border-t border-[#262626] bg-[#0d0d0d]">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-[#151515] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-semibold text-gray-400">DEBUG: Request Transformation</span>
          <span className="text-xs text-gray-600">
            {debugInfo.originalFormat} → {debugInfo.targetFormat}
          </span>
          {debugInfo.transformationTime !== undefined && (
            <span className="text-xs text-gray-600">
              ({debugInfo.transformationTime.toFixed(2)}ms)
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Errors */}
          {debugInfo.transformationErrors && debugInfo.transformationErrors.length > 0 && (
            <div className="bg-red-950/10 border border-red-500/20 rounded-md p-3">
              <h4 className="text-xs font-semibold text-red-400 mb-2">Transformation Errors</h4>
              <ul className="text-xs text-red-300 space-y-1">
                {debugInfo.transformationErrors.map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Original Request */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-gray-400">
                Original ({debugInfo.originalFormat})
              </h4>
              <button
                onClick={() => handleCopy(originalJson, 'original')}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
              >
                {copied === 'original' ? (
                  <>
                    <Check className="w-3 h-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <pre className="bg-[#111] border border-[#222] rounded-md p-3 overflow-x-auto text-xs text-gray-300 font-mono">
              {originalJson}
            </pre>
          </div>

          {/* Transformed Request */}
          {transformedJson && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold text-gray-400">
                  Transformed ({debugInfo.targetFormat})
                </h4>
                <button
                  onClick={() => handleCopy(transformedJson, 'transformed')}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
                >
                  {copied === 'transformed' ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-[#111] border border-[#222] rounded-md p-3 overflow-x-auto text-xs text-gray-300 font-mono">
                {transformedJson}
              </pre>
            </div>
          )}

          {/* Clear Button */}
          {onClear && (
            <button
              onClick={() => {
                onClear();
                setIsExpanded(false);
              }}
              className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 border border-[#333] hover:border-[#444] rounded-md transition-colors"
            >
              Clear Debug Info
            </button>
          )}
        </div>
      )}
    </div>
  );
};
