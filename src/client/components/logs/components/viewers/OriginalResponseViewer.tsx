import React, { useState, useMemo } from 'react';
import { Code, XCircle, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { ApiFormat } from '@server/module-protocol-transpiler';
import { ResponseParser, type ParsedResponse } from '@shared/response-parser';
import { fetchProtocolLog } from '@client/services/apiClient';
import { isStructuredContent } from '../../utils/contentFormatters';
import { ExpandableContent } from './ExpandableContent';
import { CopyButton } from './CopyButton';

interface OriginalResponseViewerProps {
  originalResponse: string | undefined;
  originalResponseFormat: ApiFormat | undefined;
  // Database token fields (fallback when originalResponse doesn't contain usage)
  dbPromptTokens?: number;
  dbCompletionTokens?: number;
  dbTotalTokens?: number;
  // Request ID for fetching protocol log
  requestId?: string;
}

export const OriginalResponseViewer: React.FC<OriginalResponseViewerProps> = ({
  originalResponse,
  originalResponseFormat,
  dbPromptTokens,
  dbCompletionTokens,
  dbTotalTokens,
  requestId
}) => {
  const [isRawJsonExpanded, setIsRawJsonExpanded] = useState(false);
  const [showProtocolLog, setShowProtocolLog] = useState(false);
  const [protocolLogContent, setProtocolLogContent] = useState<string | null>(null);
  const [protocolLogLoading, setProtocolLogLoading] = useState(false);
  const [protocolLogError, setProtocolLogError] = useState<string | null>(null);

  // Prepare raw JSON for copy - MUST be before early return to maintain hooks order
  const rawJson = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(originalResponse || ''), null, 2);
    } catch {
      return originalResponse || '';
    }
  }, [originalResponse]);

  // Fetch protocol transformation log
  const handleFetchProtocolLog = async () => {
    if (!requestId) return;

    // Toggle: if already shown with content, hide it
    if (showProtocolLog && protocolLogContent) {
      setShowProtocolLog(false);
      return;
    }

    setProtocolLogLoading(true);
    setProtocolLogError(null);

    try {
      const result = await fetchProtocolLog(requestId);
      if (result.success && result.data) {
        setProtocolLogContent(result.data.content);
        setShowProtocolLog(true);
      } else {
        setProtocolLogError(result.error || 'Failed to load protocol log');
      }
    } catch (error) {
      setProtocolLogError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setProtocolLogLoading(false);
    }
  };

  if (!originalResponse || !originalResponseFormat) {
    return (
      <div data-class-id="OriginalResponseViewer" className="p-6 border border-[#262626] border-dashed rounded-lg text-center text-gray-600 text-sm">
        No original response data captured.
      </div>
    );
  }

  // Parse the original response
  let parsedResponse: ParsedResponse | null = null;
  let parseError: string | null = null;

  try {
    const responseJson = JSON.parse(originalResponse);
    parsedResponse = ResponseParser.parse(responseJson, originalResponseFormat);
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'Unknown parse error';
  }

  // Override token usage with database values if available (fallback for streaming responses)
  if (parsedResponse && parsedResponse.usage) {
    const hasZeroTokens = parsedResponse.usage.promptTokens === 0 &&
                          parsedResponse.usage.completionTokens === 0 &&
                          parsedResponse.usage.totalTokens === 0;

    if (hasZeroTokens && (dbPromptTokens !== undefined || dbCompletionTokens !== undefined || dbTotalTokens !== undefined)) {
      parsedResponse.usage.promptTokens = dbPromptTokens || 0;
      parsedResponse.usage.completionTokens = dbCompletionTokens || 0;
      parsedResponse.usage.totalTokens = dbTotalTokens || (dbPromptTokens || 0) + (dbCompletionTokens || 0);
    }
  }

  // Get feature badges
  const featureBadges = parsedResponse ? ResponseParser.getFeatureBadges(parsedResponse) : [];

  return (
    <div data-class-id="OriginalResponseViewer" className="space-y-4">
      {/* Format Badge and Features */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-1 rounded border font-mono uppercase">
            {originalResponseFormat === 'openai' && 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}
            {originalResponseFormat === 'anthropic' && 'bg-orange-500/10 text-orange-400 border-orange-500/20'}
            {originalResponseFormat === 'gemini' && 'bg-blue-500/10 text-blue-400 border-blue-500/20'}
            {originalResponseFormat}
          </span>

          {/* Feature Badges */}
          {featureBadges.map((badge) => (
            <span
              key={badge.key}
              className="text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1"
              style={{
                backgroundColor: `${badge.color}10`,
                borderColor: `${badge.color}30`,
                color: badge.color,
              }}
              title={badge.label}
            >
              <span>{badge.icon}</span>
              <span>{badge.label}</span>
              {badge.value !== undefined && <span className="font-mono">({badge.value})</span>}
            </span>
          ))}
        </div>

        <CopyButton text={rawJson} title="Copy raw response" />
      </div>

      {/* Parse Error */}
      {parseError && (
        <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 text-xs mb-1">
            <XCircle className="w-3 h-3" />
            <span className="font-bold">Parse Error</span>
          </div>
          <p className="text-xs text-red-300">{parseError}</p>
        </div>
      )}

      {/* Parsed Response Details */}
      {parsedResponse && (
        <div className="space-y-4">
          {/* Extended Thinking Blocks - Only show if not already displayed in StructuredContentViewer */}
          {parsedResponse.extendedThinking && parsedResponse.extendedThinking.length > 0 && !isStructuredContent(originalResponse) && (
            <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-purple-900/10 border-b border-purple-500/20 flex items-center gap-2">
                <span className="text-lg">🧠</span>
                <span className="text-sm font-bold text-purple-400">Extended Thinking Blocks</span>
                <span className="text-xs text-purple-500">({parsedResponse.extendedThinking.length} blocks)</span>
              </div>
              <div className="p-3 space-y-3 bg-[#0a0a0f]">
                {parsedResponse.extendedThinking.map((block, idx) => (
                  <div key={idx} className="border-l-2 border-purple-500/20 pl-3">
                    <ExpandableContent
                      content={block.content}
                      maxLength={500}
                      maxLines={10}
                      className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning Tokens */}
          {parsedResponse.usage.reasoning?.reasoningTokens && (
            <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold mb-2">
                <span>🔢</span>
                <span>Reasoning Tokens</span>
              </div>
              <div className="text-sm font-mono text-white">
                {parsedResponse.usage.reasoning.reasoningTokens.toLocaleString()} tokens
              </div>
              {parsedResponse.usage.reasoning.reasoningEffort && (
                <div className="mt-2 text-xs text-gray-400">
                  Effort: <span className="text-indigo-300 font-mono">{parsedResponse.usage.reasoning.reasoningEffort}</span>
                </div>
              )}
            </div>
          )}

          {/* Cache Details */}
          {parsedResponse.usage.cache && (
            <div className="bg-blue-950/20 border border-blue-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-bold mb-2">
                <span>💾</span>
                <span>Cache Details</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {parsedResponse.usage.cache.cacheReadTokens !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Cache Read:</span>
                    <span className="text-blue-300 font-mono">{parsedResponse.usage.cache.cacheReadTokens.toLocaleString()}</span>
                  </div>
                )}
                {parsedResponse.usage.cache.cacheWriteTokens !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Cache Write:</span>
                    <span className="text-blue-300 font-mono">{parsedResponse.usage.cache.cacheWriteTokens.toLocaleString()}</span>
                  </div>
                )}
                {parsedResponse.usage.cache.cachedContentTokens !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Cached Content:</span>
                    <span className="text-blue-300 font-mono">{parsedResponse.usage.cache.cachedContentTokens.toLocaleString()}</span>
                  </div>
                )}
                {parsedResponse.usage.cache.acceptedPredictionTokens !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Accepted Prediction:</span>
                    <span className="text-blue-300 font-mono">{parsedResponse.usage.cache.acceptedPredictionTokens.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Token Usage Breakdown */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-gray-500 uppercase">Token Usage</span>
              {/* Data source indicator */}
              {(dbPromptTokens !== undefined || dbCompletionTokens !== undefined || dbTotalTokens !== undefined) &&
               parsedResponse?.usage &&
               (parsedResponse.usage.promptTokens === 0 || parsedResponse.usage.completionTokens === 0) && (
                <span className="text-[9px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded border border-blue-500/20">
                  From DB
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-blue-400">Prompt:</span>{' '}
                <span className="font-mono text-white">
                  {(parsedResponse?.usage?.promptTokens || 0).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-emerald-400">Completion:</span>{' '}
                <span className="font-mono text-white">
                  {(parsedResponse?.usage?.completionTokens || 0).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Total:</span>{' '}
                <span className="font-mono text-white font-bold">
                  {(parsedResponse?.usage?.totalTokens || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raw JSON Toggle */}
      <div className="border-t border-[#262626] pt-3">
        <button
          onClick={() => setIsRawJsonExpanded(!isRawJsonExpanded)}
          className="w-full flex items-center justify-between p-2 rounded hover:bg-[#1a1a1a] transition-colors"
        >
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Code className="w-3 h-3" />
            <span>Raw Original Response</span>
            <span className="text-[10px] text-gray-600">({originalResponseFormat})</span>
          </div>
          {isRawJsonExpanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {isRawJsonExpanded && (
          <div className="mt-3 p-3 bg-[#050505] border border-[#262626] rounded-lg overflow-hidden">
            <pre className="text-xs font-mono text-gray-400 overflow-x-auto whitespace-pre-wrap">
              {rawJson}
            </pre>
          </div>
        )}
      </div>

      {/* Protocol Transformation Log Link */}
      {requestId && (
        <div className="border-t border-[#262626] pt-3">
          <button
            onClick={handleFetchProtocolLog}
            disabled={protocolLogLoading}
            className="w-full flex items-center justify-between p-2 rounded hover:bg-[#1a1a1a] transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-xs text-blue-400">
              <Terminal className="w-3 h-3" />
              <span>{protocolLogLoading ? 'Loading...' : 'View Protocol Transformation Log'}</span>
            </div>
            {showProtocolLog ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>

          {protocolLogError && (
            <div className="mt-2 p-2 bg-red-950/20 border border-red-500/20 rounded text-xs text-red-400">
              {protocolLogError}
            </div>
          )}

          {showProtocolLog && protocolLogContent && (
            <div className="mt-3 p-3 bg-[#050505] border border-[#262626] rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              <pre className="text-[10px] font-mono text-gray-400 whitespace-pre-wrap break-words">
                {protocolLogContent}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
