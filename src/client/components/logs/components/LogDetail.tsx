import React from 'react';
import {
  Code, CheckCircle, XCircle, Key, Settings, MessageSquare, Cpu, Eye, Box, ArrowRight, Bot, Terminal, Loader2, RefreshCw
} from 'lucide-react';
import { RequestLog, ApiKey, Vendor, Role, Message } from '@shared/types';
import { TOOL_TEMPLATES } from '@client/components/playground/toolTemplates';
import { ProtocolBadge, VendorBadge, StreamingBadge } from './badges';
import {
  ExpandableContent,
  CopyButton,
  StructuredContentViewer,
  OriginalResponseViewer,
  MessageBubble,
  ResponseViewer,
} from './viewers';
import { ToolsViewer } from './tools';
import { isStructuredContent, formatContent, tryParseToolCallsFromResponse, isStreamingRequest } from '../utils/contentFormatters';
import { getMessageSplit } from '../utils/logHelpers';

interface LogDetailProps {
  selectedLog: RequestLog | null;
  apiKeys: ApiKey[];
  vendors: Vendor[];
  onRetry?: (logId: string) => Promise<void>;
}

export const LogDetail: React.FC<LogDetailProps> = ({ selectedLog, apiKeys, vendors, onRetry }) => {
  const [isRetrying, setIsRetrying] = React.useState(false);

  if (!selectedLog) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a] rounded-xl border border-[#262626]">
        <div data-class-id="LogDetail" className="flex-1 flex flex-col items-center justify-center text-gray-600">
          <Box className="w-16 h-16 mb-4 opacity-20" />
          <p>Select a request to view trace details.</p>
        </div>
      </div>
    );
  }

  const log = selectedLog;
  const apiKey = apiKeys.find(k => k.id === log.apiKeyId);

  /**
   * 处理日志重试
   * 100% 还原原始请求参数并重新发起
   */
  const handleRetry = async () => {
    if (isRetrying || !onRetry) return;
    
    setIsRetrying(true);
    try {
      await onRetry(log.id);
    } catch (error: any) {
      console.error('[LogDetail] Retry error:', error);
      alert(`Retry failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRetrying(false);
    }
  };

  /**
   * 生成 cURL 命令
   */
  const generateCurl = () => {
    if (!log) return '';
    const baseUrl = window.location.origin;
    const url = `${baseUrl}${log.path}`;
    const headers = [
      `'Content-Type: application/json'`,
      `'Authorization: Bearer YOUR_API_KEY'`
    ];
    
    if (log.originalRequestFormat && log.originalRequestFormat !== 'openai') {
      headers.push(`'X-Request-Format: ${log.originalRequestFormat}'`);
    }

    // Reconstruct body
    const body = {
      model: log.originalModel,
      messages: log.messages,
      stream: isStreamingRequest(log),
      ...(log.requestParams || {})
    };

    return `curl -X ${log.method} "${url}" \\\n  ${headers.map(h => `-H ${h}`).join(' \\\n  ')} \\\n  -d '${JSON.stringify(body, null, 2)}'`;
  };

  // ✅ Compatible field access: support both camelCase (Internal Format) and snake_case (Vendor API)
  // Most APIs use snake_case for finish_reason, but we use camelCase internally
  const finishReason = log.responseParams?.finishReason ?? log.responseParams?.finish_reason;
  const systemFingerprint = log.responseParams?.systemFingerprint ?? log.responseParams?.system_fingerprint;

  // Handle tool calls display
  const renderToolCallsOutput = () => {
    const toolCallsFromDb = log.responseToolCalls;
    const toolCallsFromResponse = tryParseToolCallsFromResponse(log.responseContent);
    const toolCallsFromMessages = log.messages
      .filter(m => m.role === Role.ASSISTANT)
      .flatMap(m => m.tool_calls || []);

    const toolCallsToShow = toolCallsFromDb && toolCallsFromDb.length > 0
      ? toolCallsFromDb
      : (toolCallsFromResponse && toolCallsFromResponse.length > 0
        ? toolCallsFromResponse
        : toolCallsFromMessages);

    const hasResponseContent = log.responseContent &&
      (typeof log.responseContent === 'string'
        ? log.responseContent.trim().length > 0
        : (Array.isArray(log.responseContent) && (log.responseContent as unknown[]).length > 0)
      );

    // Prepare copy text
    let copyData: Record<string, unknown> = {};
    if (hasResponseContent) {
      try {
        copyData.responseContent = JSON.parse(log.responseContent ?? '');
      } catch {
        copyData.responseContent = log.responseContent;
      }
    }
    if (toolCallsToShow && toolCallsToShow.length > 0) {
      copyData.tool_calls = toolCallsToShow;
    }
    if (Object.keys(copyData).length === 0) {
      copyData = { finishReason: 'tool_calls', note: 'No tool calls data captured' };
    }
    const copyJson = JSON.stringify(copyData, null, 2);

    return (
      <div className="space-y-4">
        {/* Display tool_calls if available */}
        {toolCallsToShow && toolCallsToShow.length > 0 && (
          <div className="bg-[#0f1410] border border-emerald-900/30 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-500" />
                <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-wide">Model Output</h4>
                <span className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">
                  Tool Calls
                </span>
              </div>
              <CopyButton text={copyJson} title="Copy output" />
            </div>
            <div className="space-y-3">
              <p className="text-xs text-gray-500 italic">Model requested tool execution:</p>
              {toolCallsToShow.map((tc, idx) => {
                const toolDef = Object.values(TOOL_TEMPLATES).find(
                  t => t.function.name === tc.function.name
                );
                const description = toolDef?.function.description;

                return (
                  <div key={idx} className="border border-[#262626] rounded-lg overflow-hidden bg-[#0f0f0f]">
                    <div className="px-3 py-2 bg-[#1a1a1a] border-b border-[#262626]">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                        <span className="text-sm font-mono font-bold text-indigo-300" title={tc.function.name}>
                          {tc.function.name}
                        </span>
                        {description && (
                          <span className="text-xs text-gray-400 truncate max-w-[300px]" title={description}>
                            - {description}
                          </span>
                        )}
                      </div>
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
                );
              })}
            </div>
          </div>
        )}

        {/* Display responseContent if available */}
        {hasResponseContent && (
          <div className="bg-[#0f1410] border border-emerald-900/30 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-500" />
                <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-wide">Model Output</h4>
                <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
                  Structured Content
                </span>
              </div>
              <CopyButton text={log.responseContent || ''} title="Copy output" />
            </div>
            <StructuredContentViewer content={log.responseContent!} />
          </div>
        )}

        {/* No tool_calls and no responseContent */}
        {(!toolCallsToShow || toolCallsToShow.length === 0) && !hasResponseContent && (
          <div className="p-6 bg-[#0a0a0a] border border-[#262626] border-dashed rounded-lg text-center">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Terminal className="w-6 h-6 text-gray-600" />
              <p className="text-sm text-gray-500">
                Tool calls requested (finishReason: tool_calls)
              </p>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              The specific tool call details were not captured in this log.
            </p>
            <CopyButton text={copyJson} title="Copy metadata" className="mt-4" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div data-class-id="LogDetail" className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a] rounded-xl border border-[#262626]">
      <div className="flex flex-col h-full">
        {/* Header & Stats */}
        <div className="p-6 border-b border-[#262626] bg-[#111]">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Code className="w-5 h-5 text-indigo-500" />
                <span className="max-w-[500px] truncate" title={log.path}>{log.path}</span>
              </h2>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 font-mono flex-wrap">
                <span>ID: {log.id!.slice(-8)}</span>
                <span>•</span>
                <span>{new Date(log.timestamp * 1000).toLocaleString()}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Key className="w-3 h-3" />
                  {apiKey?.name}
                </span>
                {log.baseUrl && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-cyan-400 truncate max-w-[200px]" title={log.baseUrl}>
                      <Code className="w-3 h-3" />
                      {log.baseUrl.replace('https://', '').replace('http://', '').split('/')[0]}
                    </span>
                  </>
                )}
                {(log.originalResponseFormat || log.originalModel) && (
                  <>
                    <span>•</span>
                    <div className="flex items-center gap-2">
                      <ProtocolBadge format={log.originalResponseFormat} />
                      <VendorBadge modelName={log.originalModel} vendors={vendors} />
                      <StreamingBadge isStreaming={isStreamingRequest(log)} />
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                log.statusCode === 0
                  ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 animate-pulse'
                  : log.statusCode >= 200 && log.statusCode < 300
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-500 border-red-500/20'
              }`}>
                {log.statusCode === 0 ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : log.statusCode >= 200 && log.statusCode < 300 ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                {log.statusCode === 0 ? 'Requesting...' : `${log.statusCode} ${log.statusCode >= 200 && log.statusCode < 300 ? 'OK' : 'Error'}`}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const curl = generateCurl();
                    navigator.clipboard.writeText(curl);
                    alert('cURL command copied to clipboard');
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#262626] hover:bg-[#333] text-gray-300 text-xs font-medium transition-colors border border-[#333]"
                  title="Copy as cURL"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Copy cURL
                </button>

                <button
                  onClick={handleRetry}
                  disabled={isRetrying || !onRetry}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    isRetrying 
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' 
                      : 'bg-indigo-500 hover:bg-indigo-600 text-white border-transparent shadow-lg shadow-indigo-500/20'
                  }`}
                >
                  {isRetrying ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {isRetrying ? 'Retrying...' : 'Retry Request'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-6 gap-4">
            <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
              <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Total</div>
              <div className="text-sm font-mono text-white">{log.latencyMs}ms</div>
            </div>
            {log.timeToFirstByteMs && (
              <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
                <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">TTFB</div>
                <div className="text-sm font-mono text-cyan-400">{log.timeToFirstByteMs}ms</div>
              </div>
            )}
            <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
              <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Total Tokens</div>
              <div className="text-sm font-mono text-white">{log.totalTokens}</div>
            </div>
            <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
              <div className="text-[10px] text-blue-400 uppercase font-semibold mb-1">Prompt</div>
              <div className="text-sm font-mono text-blue-300">{log.promptTokens}</div>
            </div>
            <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
              <div className="text-[10px] text-emerald-400 uppercase font-semibold mb-1">Completion</div>
              <div className="text-sm font-mono text-emerald-300">{log.completionTokens}</div>
            </div>
            <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
              <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Comp Ratio</div>
              <div className="text-sm font-mono text-gray-300">
                {((log.completionTokens / log.totalTokens) * 100).toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Error Message Display */}
          {log.errorMessage && (
            <div className="mt-4 p-4 bg-red-950/20 border border-red-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <XCircle className="w-4 h-4 text-red-500" />
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Error Details</h4>
                <CopyButton text={log.errorMessage} title="Copy error" className="ml-auto" />
              </div>
              <ExpandableContent
                content={log.errorMessage}
                maxLength={300}
                maxLines={5}
                className="text-sm text-red-300 font-mono leading-relaxed"
              />
            </div>
          )}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Request Configuration */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Settings className="w-3 h-3" /> Request Configuration
            </h3>
            <div className="space-y-4">
              {/* Config Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {log.requestParams?.temperature !== undefined && (
                  <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                    <span className="text-xs text-gray-400">Temperature</span>
                    <span className="text-xs font-mono text-white">{log.requestParams.temperature}</span>
                  </div>
                )}
                {log.requestParams?.maxTokens !== undefined && (
                  <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                    <span className="text-xs text-gray-400">Max Tokens</span>
                    <span className="text-xs font-mono text-white">{log.requestParams.maxTokens}</span>
                  </div>
                )}
                {log.requestParams?.topP !== undefined && (
                  <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                    <span className="text-xs text-gray-400">Top P</span>
                    <span className="text-xs font-mono text-white">{log.requestParams.topP}</span>
                  </div>
                )}
                {log.requestParams?.topK !== undefined && (
                  <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                    <span className="text-xs text-gray-400">Top K</span>
                    <span className="text-xs font-mono text-white">{log.requestParams.topK}</span>
                  </div>
                )}
                {log.requestParams?.frequencyPenalty !== undefined && log.requestParams.frequencyPenalty !== 0 && (
                  <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                    <span className="text-xs text-gray-400">Freq Penalty</span>
                    <span className="text-xs font-mono text-white">{log.requestParams.frequencyPenalty}</span>
                  </div>
                )}
                {log.requestParams?.presencePenalty !== undefined && log.requestParams.presencePenalty !== 0 && (
                  <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                    <span className="text-xs text-gray-400">Pres Penalty</span>
                    <span className="text-xs font-mono text-white">{log.requestParams.presencePenalty}</span>
                  </div>
                )}
                <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                  <span className="text-xs text-gray-400">Messages</span>
                  <span className="text-xs font-mono text-white">{log.messageCount}</span>
                </div>
                <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                  <span className="text-xs text-gray-400">Has Tools</span>
                  <span className={`text-xs font-mono ${log.hasTools ? 'text-indigo-400' : 'text-gray-500'}`}>
                    {log.hasTools ? `Yes (${log.toolCount})` : 'No'}
                  </span>
                </div>
                {log.overwrittenModel && (
                  <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                    <span className="text-xs text-gray-400">Original</span>
                    <span className="text-xs font-mono text-red-400 truncate" title={log.overwrittenModel}>{log.overwrittenModel}</span>
                  </div>
                )}
              </div>

              {/* Tools Accordion */}
              {log.requestTools && log.requestTools.length > 0 && (
                <ToolsViewer tools={log.requestTools} />
              )}

              {/* Overrides Display */}
              {Object.keys(log.overwrittenAttributes).length > 0 && (
                <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-3">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase mb-2 flex items-center gap-2">
                    <Box className="w-3 h-3" /> Attribute Overrides
                  </h4>
                  <div className="space-y-1">
                    {Object.entries(log.overwrittenAttributes).map(([key, val]: [string, unknown]) => (
                      <div key={key} className="flex items-center gap-3 text-xs font-mono min-w-0">
                        <span className="text-gray-400 w-24 shrink-0">{key}</span>
                        <span className="text-red-400 line-through decoration-red-400/50 truncate max-w-[150px]" title={String((val as { original: unknown }).original)}>{String((val as { original: unknown }).original)}</span>
                        <ArrowRight className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span className="text-emerald-400 font-bold truncate max-w-[150px]" title={String((val as { final: unknown }).final)}>{String((val as { final: unknown }).final)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Input Context */}
          <section>
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare className="w-3 h-3" /> Input Context
            </h3>
            <div className="space-y-3">
              {getMessageSplit(log).input.map((msg, idx) => (
                <MessageBubble key={idx} msg={msg as Message} />
              ))}
            </div>
          </section>

          {/* Model Output */}
          <section className="pb-6">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Cpu className="w-3 h-3" /> Final Output
              {log.responseContent && (
                <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">Stream</span>
              )}
            </h3>

            {/* Response Metadata */}
            {log.responseParams && Object.keys(log.responseParams).length > 0 && (
              <div className="mb-4 bg-[#1a1a1a] border border-[#333] rounded-lg p-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Response Metadata</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {finishReason && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Finish Reason</span>
                      <span className="text-xs font-mono text-white">{finishReason}</span>
                    </div>
                  )}
                  {log.responseParams.model && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Model</span>
                      <span className="text-xs font-mono text-indigo-400 truncate" title={log.responseParams.model}>{log.responseParams.model}</span>
                    </div>
                  )}
                  {systemFingerprint && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">System FP</span>
                      <span className="text-xs font-mono text-gray-500 truncate" title={systemFingerprint}>{systemFingerprint.slice(0, 8)}</span>
                    </div>
                  )}
                  {log.responseParams.id && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Response ID</span>
                      <span className="text-xs font-mono text-gray-500 truncate" title={log.responseParams.id}>{log.responseParams.id.slice(0, 8)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isStructuredContent(log.responseContent) ? (
              <div className="p-5 bg-[#0f1410] border border-emerald-900/30 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-emerald-500" />
                    <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-wide">Model Output</h4>
                    <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
                      Structured Content
                    </span>
                  </div>
                  <CopyButton text={log.responseContent || ''} title="Copy response" />
                </div>
                <StructuredContentViewer content={log.responseContent || ''} />
              </div>
            ) : (log.responseContent && log.responseContent.trim().length > 0) ? (
              <div className="p-5 bg-[#0f1410] border border-emerald-900/30 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-emerald-500" />
                    <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-wide">Model Output</h4>
                  </div>
                  <CopyButton text={log.responseContent} title="Copy response" />
                </div>
                <ExpandableContent
                  content={formatContent(log.responseContent)}
                  maxLength={500}
                  maxLines={10}
                  className="text-sm text-gray-200 leading-relaxed border-l-2 border-emerald-500/20 pl-4"
                />
              </div>
            ) : finishReason === 'tool_calls' ? (
              renderToolCallsOutput()
            ) : getMessageSplit(log).output ? (
              <ResponseViewer msg={getMessageSplit(log).output as Message} />
            ) : (
              <div className="p-8 border border-[#262626] border-dashed rounded-lg text-center text-gray-600 text-sm">
                No response content generated (Stream or Error)
              </div>
            )}
          </section>

          {/* Original Response */}
          <section className="pb-6">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Eye className="w-3 h-3" /> Original Response
              <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">
                Upstream API
              </span>
            </h3>
            <OriginalResponseViewer
              originalResponse={log.originalResponse}
              originalResponseFormat={log.originalResponseFormat}
              dbPromptTokens={log.promptTokens}
              dbCompletionTokens={log.completionTokens}
              dbTotalTokens={log.totalTokens}
              requestId={log.id}
            />
          </section>
        </div>
      </div>
    </div>
  );
};
