import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getRequestLogs, toggleLogFavorite, clearAllNonFavoritedLogs, getFavoriteLogs } from '@client/services/analyticsService';
import { realtimeLogsService } from '@client/services/realtimeLogsService';
import { fetchVendors, fetchProtocolLog } from '@client/services/apiClient';
import { RequestLog, Role, Message, ToolDefinition, ApiKey, ToolCall, Vendor } from '@shared/types';
import { TOOL_TEMPLATES } from '@client/components/playground/toolTemplates';
import { ResponseParser, type ParsedResponse } from '@shared/response-parser';
import { ApiFormat } from '@server/module-protocol-transpiler';
import {
  Search, Filter, CheckCircle, XCircle, Terminal, Box,
  ArrowRight, Settings, MessageSquare, Bot, Cpu, ChevronDown, ChevronRight, ChevronUp, Code, Key, Bell, Copy, Star, Eye,
  Zap, Trash2
} from 'lucide-react';

// --- Helper Functions ---

/**
 * Check if a log entry represents a streaming request
 * Detects streaming by checking the original_response JSON for the "streamed" flag
 */
function isStreamingRequest(log: RequestLog | null): boolean {
  if (!log?.originalResponse) return false;

  try {
    const originalResponse = JSON.parse(log.originalResponse);
    return originalResponse.streamed === true;
  } catch {
    // If parsing fails, check for secondary indicators
    // TTFB field is only populated for streaming requests
    return log.timeToFirstByteMs !== undefined && log.timeToFirstByteMs !== null;
  }
}

/**
 * Copy text to clipboard and show feedback
 */
async function copyToClipboard(text: string, onSuccess?: () => void): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    if (onSuccess) onSuccess();
    return true;
  } catch {
    return false;
  }
}

/**
 * Try to parse and format JSON content, returns original if parsing fails
 * Handles both string content and structured content (arrays, objects)
 */
function tryFormatJson(content: string | any): { formatted: string; isJson: boolean } {
  // If content is not a string, convert it to string
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

  try {
    const parsed = JSON.parse(contentStr);
    return {
      formatted: JSON.stringify(parsed, null, 2),
      isJson: true,
    };
  } catch {
    return { formatted: contentStr, isJson: false };
  }
}

/**
 * Try to parse tool_calls from responseContent when finish_reason is "tool_calls"
 * Returns the tool_calls array if found, null otherwise
 */
function tryParseToolCallsFromResponse(responseContent: string | undefined): ToolCall[] | null {
  if (!responseContent) {
    return null;
  }

  try {
    const parsed = JSON.parse(responseContent);

    // Case 1: Direct array of tool_calls
    if (Array.isArray(parsed)) {
      // Check if first item looks like a tool call
      if (parsed!.length > 0 && parsed[0].type === 'function' && parsed[0].function) {
        return parsed;
      }
    }

    // Case 2: OpenAI format with choices array
    if (parsed.choices && Array.isArray(parsed.choices) && parsed.choices!.length > 0) {
      const choice = parsed.choices[0];
      if (choice.message && choice.message.tool_calls) {
        return choice.message.tool_calls;
      }
    }

    // Case 3: Direct message with tool_calls
    if (parsed.message && parsed.message.tool_calls) {
      return parsed.message.tool_calls;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Format content that may be a string or an array of content blocks (Anthropic format)
 * Converts content to a string representation suitable for display
 */
function formatContent(content: string | any): string {
  // If it's already a string, return as-is
  if (typeof content === 'string') {
    // Try to parse as JSON in case it's a stringified content array
    if (content.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return formatContent(parsed);
        }
      } catch {
        // Not valid JSON, return as-is
      }
    }
    return content;
  }

  // If content is not a string but an object/array (already parsed), handle it
  // This can happen when response_content is stored as a parsed object in the database

  // If it's an array (Anthropic content blocks format), format it
  if (Array.isArray(content)) {
    return content!.map((block) => {
      if (typeof block === 'string') {
        return block;
      }
      if (block?.type === 'text') {
        return block.text || '';
      }
      if (block?.type === 'image_url' || block?.type === 'image') {
        return `[Image: ${block.image_url?.url || block.source?.type || 'unknown'}]`;
      }
      if (block?.type === 'tool_use') {
        // Show complete tool_use details
        const parts = [`\n[Tool Use: ${block.name || 'unknown'}`];
        if (block.id) parts.push(`ID: ${block.id}`);
        if (block.input && Object.keys(block.input).length > 0) {
          parts.push(`Input: ${JSON.stringify(block.input, null, 2)}`);
        }
        if (block.cache_control) {
          parts.push(`Cache: enabled`);
        }
        parts.push(']');
        return parts.join('\n  ');
      }
      if (block?.type === 'thinking') {
        // Show thinking content with signature if present
        const parts = [`\n[Thinking]`];
        if (block.thinking) {
          parts.push(block.thinking);
        }
        if (block.signature) {
          parts.push(`\n[Signature: ${block.signature!.slice(0, 20)}...]`);
        }
        parts.push('[/Thinking]');
        return parts.join('\n');
      }
      if (block?.type === 'cache_control') {
        return `[Cache Control: ${block.cache_control?.type || 'ephemeral'}]`;
      }
      if (block?.type === 'tool_result') {
        const parts = [`\n[Tool Result: ${block.tool_use_id || 'unknown'}`];
        if (block.content) {
          parts.push(typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content, null, 2));
        }
        if (block.is_error) {
          parts.push(`[Error: ${block.is_error}]`);
        }
        parts.push(']');
        return parts.join('\n  ');
      }
      // Fallback for unknown block types - show full JSON for debugging
      return `[Unknown Block Type: ${JSON.stringify(block, null, 2)}]`;
    }).join('\n');
  }

  // Fallback: convert to JSON string
  return JSON.stringify(content, null, 2);
}

/**
 * Parse content blocks from responseContent
 * Returns categorized content blocks by type
 */
interface ParsedContentBlocks {
  textBlocks: string[];
  toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown>; cache_control?: any }>;
  thinkingBlocks: Array<{ thinking: string; signature?: string }>;
  cacheControlBlocks: Array<{ cache_control: any }>;
  imageBlocks: Array<{ url: string; detail?: string }>;
  otherBlocks: any[];
}

function parseContentBlocks(content: string | any): ParsedContentBlocks {
  const result: ParsedContentBlocks = {
    textBlocks: [],
    toolUseBlocks: [],
    thinkingBlocks: [],
    cacheControlBlocks: [],
    imageBlocks: [],
    otherBlocks: [],
  };

  let parsed: any;
  if (typeof content === 'string') {
    // Try to parse as JSON array
    if (content.trim().startsWith('[')) {
      try {
        parsed = JSON.parse(content);
      } catch {
        // Not valid JSON, treat as plain text
        result.textBlocks.push(content);
        return result;
      }
    } else {
      // Plain text
      result.textBlocks.push(content);
      return result;
    }
  } else if (Array.isArray(content)) {
    // Content is already parsed as an array
    parsed = content;
  } else if (typeof content === 'object' && content !== null) {
    // Content is an object, treat it as a single content block
    parsed = [content];
  } else {
    // Unknown type, treat as plain text
    result.textBlocks.push(String(content));
    return result;
  }

  // If it's an array, process each block
  if (Array.isArray(parsed)) {
    for (const block of parsed) {
      if (typeof block === 'string') {
        result.textBlocks.push(block);
      } else if (block?.type === 'text' && block.text) {
        result.textBlocks.push(block.text);
      } else if (block?.type === 'tool_use') {
        result.toolUseBlocks.push({
          id: block.id,
          name: block.name,
          input: block.input || {},
          cache_control: block.cache_control,
        });
      } else if (block?.type === 'thinking') {
        result.thinkingBlocks.push({
          thinking: block.thinking || block.content || '',
          signature: block.signature,
        });
      } else if (block?.type === 'cache_control') {
        result.cacheControlBlocks.push({
          cache_control: block.cache_control || { type: 'ephemeral' },
        });
      } else if (block?.type === 'image_url') {
        result.imageBlocks.push({
          url: block.image_url?.url || block.url || '',
          detail: block.image_url?.detail,
        });
      } else {
        result.otherBlocks.push(block);
      }
    }
  }

  return result;
}

/**
 * StructuredContentViewer Component - Displays categorized content blocks
 */
const StructuredContentViewer: React.FC<{
  content: string | any;
  className?: string;
}> = ({ content, className = '' }) => {
  const blocks = useMemo(() => parseContentBlocks(content), [content]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['thinking', 'tool_use', 'text']));

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

  const hasContent = blocks.textBlocks!.length > 0 || blocks.toolUseBlocks!.length > 0 ||
    blocks.thinkingBlocks!.length > 0 || blocks.cacheControlBlocks!.length > 0 ||
    blocks.imageBlocks!.length > 0 || blocks.otherBlocks!.length > 0;

  if (!hasContent) {
    return <div className="text-gray-500 italic">No content available</div>;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Thinking Blocks - First */}
      {blocks.thinkingBlocks!.length > 0 && (
        <div className="bg-[#0a0a0a] border border-purple-500/20 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('thinking')}
            className="w-full px-3 py-2 flex items-center justify-between bg-purple-500/5 hover:bg-purple-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-purple-400">Thinking Process</span>
              <span className="text-xs text-gray-500">({blocks.thinkingBlocks!.length})</span>
            </div>
            {expandedSections.has('thinking') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {expandedSections.has('thinking') && (
            <div className="p-3 border-t border-purple-500/10 space-y-3">
              {blocks.thinkingBlocks!.map((block, idx) => (
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
                      <span className="font-mono">{block.signature!.slice(0, 20)}...</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tool Use Blocks - Second */}
      {blocks.toolUseBlocks!.length > 0 && (
        <div className="bg-[#0a0a0a] border border-indigo-500/20 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('tool_use')}
            className="w-full px-3 py-2 flex items-center justify-between bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-medium text-indigo-400">Tool Calls</span>
              <span className="text-xs text-gray-500">({blocks.toolUseBlocks!.length})</span>
            </div>
            {expandedSections.has('tool_use') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {expandedSections.has('tool_use') && (
            <div className="p-3 border-t border-indigo-500/10 space-y-3">
              {blocks.toolUseBlocks!.map((tool, idx) => (
                <div key={idx} className="border border-[#262626] rounded-lg overflow-hidden bg-[#0f0f0f]">
                  <div className="px-3 py-2 bg-[#1a1a1a] border-b border-[#262626] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm font-mono font-bold text-indigo-300">{tool.name}</span>
                    </div>
                    {tool.id && (
                      <span className="text-xs text-gray-500 font-mono">{tool.id!.slice(0, 8)}...</span>
                    )}
                  </div>
                  <div className="p-3">
                    <ExpandableContent
                      content={JSON.stringify(tool.input, null, 2)}
                      maxLength={300}
                      maxLines={8}
                      className="text-xs text-gray-300"
                    />
                    {tool.cache_control && (
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
      {blocks.textBlocks!.length > 0 && (
        <div className="bg-[#0a0a0a] border border-blue-500/20 rounded-lg overflow-hidden">
          <button
            onClick={() => toggleSection('text')}
            className="w-full px-3 py-2 flex items-center justify-between bg-blue-500/5 hover:bg-blue-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-400">Text Content</span>
              <span className="text-xs text-gray-500">({blocks.textBlocks!.length} blocks)</span>
            </div>
            {expandedSections.has('text') ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {expandedSections.has('text') && (
            <div className="p-3 border-t border-blue-500/10 space-y-3">
              {blocks.textBlocks!.map((text, idx) => (
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
      {blocks.cacheControlBlocks!.length > 0 && (
        <div className="bg-[#0a0a0a] border border-cyan-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-cyan-400">
            <Bell className="w-4 h-4" />
            <span className="text-sm font-medium">Cache Control</span>
            <span className="text-xs text-gray-500">({blocks.cacheControlBlocks!.length} blocks)</span>
          </div>
        </div>
      )}

      {/* Image Blocks */}
      {blocks.imageBlocks!.length > 0 && (
        <div className="bg-[#0a0a0a] border border-green-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <Eye className="w-4 h-4" />
            <span className="text-sm font-medium">Images</span>
            <span className="text-xs text-gray-500">({blocks.imageBlocks!.length})</span>
          </div>
          {blocks.imageBlocks!.map((img, idx) => (
            <div key={idx} className="text-xs text-gray-400 break-all font-mono">
              {img.url!.slice(0, 80)}...
            </div>
          ))}
        </div>
      )}

      {/* Other Blocks */}
      {blocks.otherBlocks!.length > 0 && (
        <div className="bg-[#0a0a0a] border border-gray-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Code className="w-4 h-4" />
            <span className="text-sm font-medium">Other Blocks</span>
            <span className="text-xs text-gray-500">({blocks.otherBlocks!.length})</span>
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

/**
 * Check if content should be truncated (based on length and lines)
 * Handles both string content and structured content (arrays)
 */
function shouldTruncate(content: string, maxLength = 500, maxLines = 10): boolean {
  // Convert non-string content to string for length check
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  if (contentStr!.length > maxLength) return true;
  const lines = contentStr.split('\n');
  return lines!.length > maxLines;
}

// --- Helper Functions ---

/**
 * Find vendor by model ID from vendors list
 */
const findVendorByModel = (modelId: string, vendors: Vendor[]): Vendor | undefined => {
  if (!modelId || !vendors!.length) return undefined;

  for (const vendor of vendors) {
    if (vendor.models?.some(m => m.modelId === modelId)) {
      return vendor;
    }
  }
  return undefined;
};

/**
 * Get protocol format display information
 */
const getProtocolInfo = (format: ApiFormat | undefined) => {
  const infoMap: Record<string, { displayName: string; color: string; bgColor: string; textColor: string; borderColor: string }> = {
    openai: { displayName: 'OpenAI', color: '#10a37f', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/20' },
    anthropic: { displayName: 'Anthropic', color: '#d97757', bgColor: 'bg-orange-500/10', textColor: 'text-orange-400', borderColor: 'border-orange-500/20' },
    gemini: { displayName: 'Gemini', color: '#4285f4', bgColor: 'bg-blue-500/10', textColor: 'text-blue-400', borderColor: 'border-blue-500/20' },
  };

  return infoMap[format || 'openai'] || infoMap.openai;
};

/**
 * Check if content is structured (JSON array of content blocks)
 * Returns true if the content is an array (Anthropic structured format)
 */
const isStructuredContent = (content: string | any[] | undefined): boolean => {
  if (!content) return false;

  // If it's already an array, it's structured content
  if (Array.isArray(content)) return true;

  // If it's a string, try to parse it
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed.startsWith('[')) return false;
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed);
    } catch {
      return false;
    }
  }

  return false;
};

// --- Sub-components ---

/**
 * Protocol Badge Component - Displays API protocol format
 */
const ProtocolBadge: React.FC<{ format: ApiFormat | undefined }> = ({ format }) => {
  if (!format) return null;

  const info = getProtocolInfo(format);
  if (!info) return null;

  return (
    <span
      className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase border ${info.bgColor} ${info.textColor} ${info.borderColor}`}
      title={`Protocol: ${info.displayName}`}
    >
      {format}
    </span>
  );
};

/**
 * Streaming Badge Component - Displays streaming indicator
 */
const StreamingBadge: React.FC<{ isStreaming: boolean }> = ({ isStreaming }) => {
  if (!isStreaming) return null;

  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20 font-medium"
      title="Streaming Request"
    >
      <Zap className="w-2.5 h-2.5" />
      Stream
    </span>
  );
};

/**
 * Vendor Badge Component - Displays LLM vendor information
 */
const VendorBadge: React.FC<{ modelName?: string; vendors: Vendor[] }> = ({
  modelName,
  vendors
}) => {
  const vendor = useMemo(() => findVendorByModel(modelName || '', vendors), [modelName, vendors]);

  if (!vendor) return null;

  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded border flex items-center gap-1"
      style={{
        backgroundColor: '#1a1a1a',
        borderColor: '#404040',
        color: '#e5e5e5',
      }}
      title={`Vendor: ${vendor.displayName || vendor.name}`}
    >
      {vendor.iconUrl && (
        <img src={vendor.iconUrl} className="w-3 h-3" alt={vendor.name} />
      )}
      <span className="font-medium">{vendor.displayName || vendor.name}</span>
    </span>
  );
};

/**
 * Copy button with feedback animation
 */
const CopyButton: React.FC<{
  text: string;
  title?: string;
  className?: string;
}> = ({ text, title = 'Copy', className = '' }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(text, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    if (!success) {
      console.error('[CopyButton] Failed to copy to clipboard');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded hover:bg-[#333] transition-colors ${copied ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'} ${className}`}
      title={copied ? 'Copied!' : title}
    >
      {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

const ToolDetailItem = ({ tool }: { tool: ToolDefinition }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const params = tool.function.parameters;
  const properties = params?.properties || {};
  const required = params?.required || [];

  return (
    <div className="border border-[#262626] rounded-md overflow-hidden bg-[#0f0f0f]">
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
                   {Object.entries(properties).map(([key, val]: [string, any]) => (
                       <div key={key} className="text-xs font-mono border-l-2 border-[#262626] pl-3 py-0.5">
                           <div className="flex items-center gap-2">
                               <span className="text-emerald-400 font-semibold">{key}</span>
                               {required.includes(key) && <span className="text-red-500" title="Required">*</span>}
                               <span className="text-yellow-600/80 text-[10px] bg-[#1a1a1a] px-1 rounded">
                                   {val.type}
                               </span>
                           </div>
                           <div className="text-gray-400 mt-1 pl-0.5 leading-relaxed break-words overflow-wrap-anywhere">
                               {val.description}
                               {val.enum && (
                                   <div className="flex gap-1 mt-1 flex-wrap">
                                       {val.enum!.map((e: string) => (
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

const ToolsViewer = ({ tools }: { tools: ToolDefinition[] }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Prepare copy text - formatted JSON of tools
  const toolsJson = useMemo(() => {
    return JSON.stringify(tools, null, 2);
  }, [tools]);

  return (
    <div className="bg-[#1a1a1a] rounded-lg border border-[#333] overflow-hidden">
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
            {tools!.length} definitions
          </span>
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={toolsJson} title="Copy tools configuration" />
          {isOpen ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
        </div>
      </div>

      {isOpen && (
        <div className="p-3 border-t border-[#333] space-y-2 bg-[#111]">
          {tools!.map((tool, idx) => (
            <ToolDetailItem key={idx} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Display content with optional truncation and expand/collapse
 * Handles both string content and structured content (arrays, objects)
 */
const ExpandableContent: React.FC<{
  content: string | any;
  maxLength?: number;
  maxLines?: number;
  className?: string;
}> = ({ content, maxLength = 500, maxLines = 10, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(!shouldTruncate(content, maxLength, maxLines));
  const needsTruncation = shouldTruncate(content, maxLength, maxLines);

  // Format JSON if applicable
  const { formatted, isJson } = useMemo(() => tryFormatJson(content), [content]);

  if (!needsTruncation) {
    return (
      <pre
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
    <div>
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
            <span>Show more ({typeof content === 'string' && content!.length > maxLength ? `${content!.length} chars` : `${formatted.split('\n').length} lines`}) <ChevronDown className="w-3 h-3 inline" /></span>
          )}
        </button>
      )}
    </div>
  );
};

const MessageBubble: React.FC<{ msg: Message }> = ({ msg }) => {
  const isUser = msg.role === Role.USER;
  const isSystem = msg.role === Role.SYSTEM;
  const isTool = msg.role === Role.TOOL;

  // Prepare copy text - raw message JSON
  const messageJson = useMemo(() => {
    return JSON.stringify(msg, null, 2);
  }, [msg]);

  return (
    <div className={`flex gap-4 p-4 rounded-lg border ${
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
            {msg.tool_calls && msg.tool_calls!.length > 0 && (
              <div className="space-y-2 mb-3">
                {msg.tool_calls!.map((tc, idx) => (
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

const ResponseViewer: React.FC<{ msg: Message }> = ({ msg }) => {
  // Prepare copy text - raw message JSON
  const messageJson = useMemo(() => {
    return JSON.stringify(msg, null, 2);
  }, [msg]);

  return (
    <div className="bg-[#0f1410] border border-emerald-900/30 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-emerald-500" />
          <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-wide">Model Output</h4>
        </div>
        <CopyButton text={messageJson} title="Copy output" />
      </div>

      {msg.tool_calls && msg.tool_calls!.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 italic">Model requested tool execution:</p>
          {msg.tool_calls!.map((tc, idx) => (
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

/**
 * Original Response Viewer - Displays upstream API response with special features
 */
const OriginalResponseViewer: React.FC<{
  originalResponse: string | undefined;
  originalResponseFormat: ApiFormat | undefined;
  // Database token fields (fallback when originalResponse doesn't contain usage)
  dbPromptTokens?: number;
  dbCompletionTokens?: number;
  dbTotalTokens?: number;
  // Request ID for fetching protocol log
  requestId?: string;
}> = ({ originalResponse, originalResponseFormat, dbPromptTokens, dbCompletionTokens, dbTotalTokens, requestId }) => {
  const [isRawJsonExpanded, setIsRawJsonExpanded] = useState(false);
  const [showProtocolLog, setShowProtocolLog] = useState(false);
  const [protocolLogContent, setProtocolLogContent] = useState<string | null>(null as any);
  const [protocolLogLoading, setProtocolLogLoading] = useState(false);
  const [protocolLogError, setProtocolLogError] = useState<string | null>(null as any);

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

    setProtocolLogLoading(true);
    setProtocolLogError(null);

    try {
      const result = await fetchProtocolLog(requestId);
      if (result.success && result.data!) {
        setProtocolLogContent(result.data!.content);
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
      <div className="p-6 border border-[#262626] border-dashed rounded-lg text-center text-gray-600 text-sm">
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

  // 🔧 Override token usage with database values if available (fallback for streaming responses)
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
    <div className="space-y-4">
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
          {featureBadges!.map((badge) => (
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
          {parsedResponse.extendedThinking && parsedResponse.extendedThinking!.length > 0 && !isStructuredContent(originalResponse) && (
            <div className="bg-purple-950/20 border border-purple-500/20 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-purple-900/10 border-b border-purple-500/20 flex items-center gap-2">
                <span className="text-lg">🧠</span>
                <span className="text-sm font-bold text-purple-400">Extended Thinking Blocks</span>
                <span className="text-xs text-purple-500">({parsedResponse.extendedThinking!.length} blocks)</span>
              </div>
              <div className="p-3 space-y-3 bg-[#0a0a0f]">
                {parsedResponse.extendedThinking!.map((block, idx) => (
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

// --- Main Component ---

export const LogExplorer: React.FC = () => {
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null as any);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApiKey, setSelectedApiKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'favorites'>('all' as any);
  const [showClearMenu, setShowClearMenu] = useState(false);
  const clearMenuRef = useRef<HTMLDivElement>(null);

  // localStorage keys for new logs tracking
  const NEW_LOGS_KEY = 'logs_new_log_ids';
  const READ_LOGS_KEY = 'logs_read_ids';

  // Load new log IDs from localStorage on mount
  const [newLogIds, setNewLogIds] = useState<Set<string>>((): Set<string> => {
    try {
      const stored = localStorage.getItem(NEW_LOGS_KEY);
      const readIds = JSON.parse(localStorage.getItem(READ_LOGS_KEY) || '[]') as string[];
      const newIds = new Set<string>(JSON.parse(stored || '[]'));
      // Remove already read logs from new logs
      readIds.forEach((id: string) => newIds.delete(id));
      return newIds;
    } catch {
      return new Set<string>();
    }
  });

  // Advanced filter states
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [filterStatusCode, setFilterStatusCode] = useState<string>('');
  const [filterModel, setFilterModel] = useState<string>('');
  const [filterTimeRange, setFilterTimeRange] = useState<string>('');
  const [filterHasTools, setFilterHasTools] = useState<string>('');

  const filteredLogs = logs!.filter(l => {
    const matchesSearch =
      l.id.includes(searchTerm) ||
      l.originalModel.includes(searchTerm) ||
      l.path.includes(searchTerm);

    const matchesKey = selectedApiKey ? l.apiKeyId === selectedApiKey : true;
    const matchesFavorite = showFavoritesOnly ? (l.isFavorited || false) : true;

    // Advanced filters
    const matchesStatusCode = filterStatusCode === ''
      ? true
      : filterStatusCode === '200'
        ? l.statusCode >= 200 && l.statusCode < 300
        : filterStatusCode === 'error'
          ? l.statusCode >= 400
          : l.statusCode.toString() === filterStatusCode;

    const matchesModel = filterModel === '' ? true : l.finalModel === filterModel;

    const matchesTimeRange = filterTimeRange === '' ? true : (() => {
      const now = Math.floor(Date.now() / 1000);
      const ranges: Record<string, number> = {
        '1h': 3600,
        '24h': 86400,
        '7d': 604800,
        '30d': 2592000,
      };
      const cutoff = ranges[filterTimeRange];
      return cutoff ? l.timestamp >= now - cutoff : true;
    })();

    const matchesTools = filterHasTools === ''
      ? true
      : filterHasTools === 'yes'
        ? l.hasTools
        : !l.hasTools;

    return matchesSearch && matchesKey && matchesFavorite &&
           matchesStatusCode && matchesModel && matchesTimeRange && matchesTools;
  });

  // Get unique models from logs for filter dropdown
  const uniqueModels = useMemo(() => {
    const models = new Set(logs!.map(l => l.finalModel));
    return Array.from(models).sort();
  }, [logs]);

  // Helper: Save new log IDs to localStorage
  const saveNewLogIds = (ids: Set<string>) => {
    try {
      localStorage.setItem(NEW_LOGS_KEY, JSON.stringify(Array.from(ids)));
    } catch (error) {
      console.error('[LogExplorer] Failed to save new log IDs:', error);
    }
  };

  // Helper: Save read log IDs to localStorage
  const saveReadLogIds = (ids: string[]) => {
    try {
      localStorage.setItem(READ_LOGS_KEY, JSON.stringify(ids));
    } catch (error) {
      console.error('[LogExplorer] Failed to save read log IDs:', error);
    }
  };

  // Helper: Mark log as read
  const markLogAsRead = (logId: string) => {
    setNewLogIds(prev => {
      const next = new Set(prev);
      next.delete(logId);
      saveNewLogIds(next);
      return next;
    });

    // Also add to read logs
    try {
      const readIds = JSON.parse(localStorage.getItem(READ_LOGS_KEY) || '[]');
      if (!readIds.includes(logId)) {
        readIds.push(logId);
        saveReadLogIds(readIds);
      }
    } catch (error) {
      console.error('[LogExplorer] Failed to mark log as read:', error);
    }
  };

  // Helper: Clear all read logs
  const clearReadLogs = () => {
    try {
      localStorage.removeItem(READ_LOGS_KEY);
      console.log('[LogExplorer] Cleared all read logs');
    } catch (error) {
      console.error('[LogExplorer] Failed to clear read logs:', error);
    }
  };

  // Helper: Clear all new log IDs
  const clearNewLogs = () => {
    try {
      localStorage.removeItem(NEW_LOGS_KEY);
      setNewLogIds(new Set());
      console.log('[LogExplorer] Cleared all new log IDs');
    } catch (error) {
      console.error('[LogExplorer] Failed to clear new log IDs:', error);
    }
  };

  // Count active filters
  const activeFilterCount = [
    filterStatusCode,
    filterModel,
    filterTimeRange,
    filterHasTools,
  ].filter(v => v !== '').length;

  // Handle favorite toggle
  const handleToggleFavorite = async (logId: string) => {
    try {
      const result = await toggleLogFavorite(logId);
      setLogs(prevLogs =>
        prevLogs!.map(log =>
          log.id === logId ? { ...log, isFavorited: result.isFavorited } : log
        )
      );
    } catch (error) {
      console.error('[LogExplorer] Failed to toggle favorite:', error);
    }
  };

  // Handle clear all non-favorited logs
  const handleClearHistory = async () => {
    const regularLogCount = logs!.filter(l => !l.isFavorited).length;

    if (regularLogCount === 0) {
      alert('No non-favorited logs to clear.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to clear ${regularLogCount} non-favorited log(s)?\n\nFavorited logs will be preserved.\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      const result = await clearAllNonFavoritedLogs();
      console.log('[LogExplorer] Cleared logs:', result);

      // Remove non-favorited logs from state
      setLogs(prevLogs => prevLogs!.filter(log => log.isFavorited));

      // Clear selected log if it's not favorited
      if (selectedLog && !selectedLog.isFavorited) {
        setSelectedLog(null);
      }

      alert(`Successfully cleared ${result.deletedCount} log(s).`);
    } catch (error) {
      console.error('[LogExplorer] Failed to clear logs:', error);
      alert('Failed to clear logs. Please try again.');
    }
  };

  // Load API Keys on mount
  useEffect(() => {
    fetch('/api/keys')
      .then(res => res.json())
      .then(data => setApiKeys(data.data! || []))
      .catch(err => console.error('[LogExplorer] Failed to load API keys:', err));
  }, []);

  // Load vendors on mount
  useEffect(() => {
    const loadVendors = async () => {
      try {
        const result = await fetchVendors();
        if (result.success && result.data!) {
          setVendors(result.data!);
        }
      } catch (err) {
        console.error('[LogExplorer] Failed to load vendors:', err);
      }
    };
    loadVendors();
  }, []);

  // Load logs when selectedApiKey or viewMode changes
  useEffect(() => {
    async function loadLogs() {
      setIsLoading(true);
      try {
        let data: RequestLog[];

        if (viewMode === 'favorites') {
          // Load all favorite logs (no limit)
          data = await getFavoriteLogs(1000);
        } else {
          // Load recent logs with limit
          data = await getRequestLogs({
            apiKeyId: selectedApiKey || undefined,
            limit: 100,
          });
        }

        setLogs(data);
      } catch (err) {
        console.error('[LogExplorer] Failed to load logs:', err);
        setLogs([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadLogs();
  }, [selectedApiKey, viewMode]);

  // Close clear menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clearMenuRef.current && !clearMenuRef.current.contains(event.target as Node)) {
        setShowClearMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // SSE connection for real-time logs
  useEffect(() => {
    realtimeLogsService.connect(selectedApiKey || undefined);

    const unsubscribe = realtimeLogsService.subscribe((newLog) => {
      setLogs(prevLogs => {
        if (prevLogs.some(l => l.id === newLog.id)) return prevLogs;

        // Add to new log IDs and persist to localStorage
        setNewLogIds(prev => {
          const next = new Set(prev).add(newLog.id);
          saveNewLogIds(next);
          return next;
        });

        return [newLog, ...prevLogs];
      });
    });

    return () => {
      unsubscribe();
      realtimeLogsService.disconnect();
    };
  }, [selectedApiKey]);

  // Helper to split messages into Context (Input) and Response (Output)
  // Logic: The last message is the response if it's from Assistant.
  const getMessageSplit = (log: RequestLog) => {
      const msgs = [...log.messages];
      if (msgs!.length === 0) {
          return { input: [], output: null };
      }
      const last = msgs[msgs!.length - 1];
      if (last?.role === Role.ASSISTANT) {
          return { input: msgs!.slice(0, -1), output: last };
      }
      return { input: msgs, output: null };
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-6 animate-in fade-in duration-500">
      {/* Left Panel: Log List */}
      <div className="w-1/3 flex flex-col gap-4 border-r border-[#262626] pr-4">
        <div className="space-y-2">
            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input 
                type="text" 
                placeholder="Search traces..." 
                className="w-full bg-[#0a0a0a] border border-[#262626] rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-600"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            {/* Filter Row */}
            <div className="flex gap-2">
                {/* View Mode Indicator */}
                <div className="px-3 py-2 bg-[#0a0a0a] border border-[#262626] rounded-lg flex items-center gap-2 text-xs text-gray-400">
                    {viewMode === 'favorites' ? (
                        <>
                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                            <span className="text-yellow-400">Favorites</span>
                            <span className="text-gray-600">({filteredLogs!.length})</span>
                        </>
                    ) : (
                        <>
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>All Logs</span>
                            <span className="text-gray-600">({filteredLogs!.length})</span>
                        </>
                    )}
                </div>

                 <div className="relative flex-1">
                     <select
                        value={selectedApiKey}
                        onChange={(e) => setSelectedApiKey(e.target.value)}
                        className="w-full appearance-none bg-[#0a0a0a] border border-[#262626] rounded-lg pl-9 pr-8 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-600 cursor-pointer"
                     >
                        <option value="">All API Keys</option>
                        {apiKeys!.map(k => (
                            <option key={k.id} value={k.id}>{k.name} ({k.keyToken!.slice(0, 8)}...)</option>
                        ))}
                     </select>
                     <Key className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                     <ChevronDown className="absolute right-3 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                 </div>
                 <button
                    onClick={() => {
                      const newMode = viewMode === 'favorites' ? 'all' : 'favorites';
                      setViewMode(newMode);
                      setShowFavoritesOnly(newMode === 'favorites');
                    }}
                    className={`px-3 py-2 rounded-lg border transition-colors ${
                      viewMode === 'favorites'
                        ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                        : 'bg-[#0a0a0a] border-[#262626] text-gray-400 hover:text-white'
                    }`}
                    title={viewMode === 'favorites' ? 'Show all logs' : 'Show favorites only'}
                  >
                    <Star className={`w-4 h-4 ${viewMode === 'favorites' ? 'fill-current' : ''}`} />
                  </button>
                 <button
                    onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
                    className={`relative px-3 py-2 rounded-lg border transition-colors ${
                      showAdvancedFilter || activeFilterCount > 0
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                        : 'bg-[#0a0a0a] border-[#262626] text-gray-400 hover:text-white'
                    }`}
                    title="Advanced Filter"
                  >
                    <Filter className="w-4 h-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-500 text-[10px] text-white rounded-full flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                 {/* Settings Menu Button */}
                 <div className="relative" ref={clearMenuRef}>
                    <button
                        onClick={() => setShowClearMenu(!showClearMenu)}
                        className={`px-3 py-2 rounded-lg border transition-colors ${
                            'bg-[#0a0a0a] border-[#262626] text-gray-400 hover:text-white'
                        }`}
                        title="Settings"
                    >
                        <Settings className="w-4 h-4" />
                    </button>

                    {/* Settings Menu Dropdown */}
                    {showClearMenu && (
                        <div className="absolute right-0 mt-2 w-56 bg-[#1a1a1a] border border-[#333] rounded-lg shadow-xl z-50">
                            <div className="p-2 space-y-1">
                                <div className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                                    Markers
                                </div>
                                <button
                                    onClick={() => {
                                        clearNewLogs();
                                        setShowClearMenu(false);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-[#262626] rounded flex items-center gap-2 transition-colors"
                                >
                                    <Bell className="w-3 h-3 text-indigo-400" />
                                    <span>Clear all NEW markers</span>
                                </button>
                                <button
                                    onClick={() => {
                                        clearReadLogs();
                                        setShowClearMenu(false);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-[#262626] rounded flex items-center gap-2 transition-colors"
                                >
                                    <Eye className="w-3 h-3 text-cyan-400" />
                                    <span>Clear read history</span>
                                </button>
                                <div className="px-3 py-2 text-[10px] text-gray-500">
                                    <div>NEW: {newLogIds.size} logs</div>
                                </div>

                                <div className="border-t border-[#333] my-1"></div>
                                <div className="px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                                    Danger Zone
                                </div>
                                <button
                                    onClick={() => {
                                        handleClearHistory();
                                        setShowClearMenu(false);
                                    }}
                                    className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-950/20 rounded flex items-center gap-2 transition-colors"
                                >
                                    <Trash2 className="w-3 h-3 text-red-400" />
                                    <span>Clear non-favorited logs</span>
                                </button>
                            </div>
                        </div>
                    )}
                 </div>
            </div>
        </div>

        {/* Advanced Filter Panel */}
        {showAdvancedFilter && (
          <div className="bg-[#0a0a0a] border border-[#262626] rounded-lg p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Advanced Filters
                {activeFilterCount > 0 && (
                  <span className="text-xs text-indigo-400">({activeFilterCount} active)</span>
                )}
              </h3>
              <button
                onClick={() => {
                  setFilterStatusCode('');
                  setFilterModel('');
                  setFilterTimeRange('');
                  setFilterHasTools('');
                }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Clear All
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Status Code Filter */}
              <div className="space-y-2">
                <label className="text-xs text-gray-500">Status Code</label>
                <select
                  value={filterStatusCode}
                  onChange={(e) => setFilterStatusCode(e.target.value)}
                  className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-600"
                >
                  <option value="">All</option>
                  <option value="200">Success (2xx)</option>
                  <option value="error">Error (4xx/5xx)</option>
                </select>
              </div>

              {/* Model Filter */}
              <div className="space-y-2">
                <label className="text-xs text-gray-500">Model</label>
                <select
                  value={filterModel}
                  onChange={(e) => setFilterModel(e.target.value)}
                  className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-600"
                >
                  <option value="">All Models</option>
                  {uniqueModels!.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>

              {/* Time Range Filter */}
              <div className="space-y-2">
                <label className="text-xs text-gray-500">Time Range</label>
                <select
                  value={filterTimeRange}
                  onChange={(e) => setFilterTimeRange(e.target.value)}
                  className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-600"
                >
                  <option value="">All Time</option>
                  <option value="1h">Last 1 hour</option>
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              </div>

              {/* Tools Filter */}
              <div className="space-y-2">
                <label className="text-xs text-gray-500">Tool Calls</label>
                <select
                  value={filterHasTools}
                  onChange={(e) => setFilterHasTools(e.target.value)}
                  className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-600"
                >
                  <option value="">All</option>
                  <option value="yes">With Tools</option>
                  <option value="no">Without Tools</option>
                </select>
              </div>
            </div>

            {/* Active Filters Display */}
            {activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[#262626]">
                {filterStatusCode && (
                  <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-1 rounded flex items-center gap-1">
                    Status: {filterStatusCode === '200' ? 'Success' : filterStatusCode === 'error' ? 'Error' : filterStatusCode}
                    <button onClick={() => setFilterStatusCode('')} className="hover:text-white">×</button>
                  </span>
                )}
                {filterModel && (
                  <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-1 rounded flex items-center gap-1">
                    Model: <span className="max-w-[200px] truncate" title={filterModel}>{filterModel}</span>
                    <button onClick={() => setFilterModel('')} className="hover:text-white">×</button>
                  </span>
                )}
                {filterTimeRange && (
                  <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-1 rounded flex items-center gap-1">
                    Time: {filterTimeRange === '1h' ? '1h' : filterTimeRange === '24h' ? '24h' : filterTimeRange === '7d' ? '7d' : '30d'}
                    <button onClick={() => setFilterTimeRange('')} className="hover:text-white">×</button>
                  </span>
                )}
                {filterHasTools && (
                  <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-1 rounded flex items-center gap-1">
                    Tools: {filterHasTools === 'yes' ? 'With' : 'Without'}
                    <button onClick={() => setFilterHasTools('')} className="hover:text-white">×</button>
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
          {isLoading ? (
            <div className="text-center py-10 text-gray-600 text-sm">Loading logs...</div>
          ) : filteredLogs!.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm">No logs found matching filters.</div>
          ) : (
            filteredLogs!.map(log => (
            <div
              key={log.id}
              onClick={() => {
                setSelectedLog(log);
                markLogAsRead(log.id);
              }}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedLog?.id === log.id
                  ? 'bg-[#1a1a1a] border-indigo-600/50 shadow-lg shadow-indigo-900/10'
                  : 'bg-[#0a0a0a] border-[#262626] hover:border-[#404040]'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(log.id);
                    }}
                    className={`p-1 rounded hover:bg-[#333] transition-colors ${
                      log.isFavorited ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'
                    }`}
                    title={log.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star className={`w-3.5 h-3.5 ${log.isFavorited ? 'fill-current' : ''}`} />
                  </button>
                  {log.statusCode === 200 ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  <span className="text-xs font-mono text-gray-500">#{log.id!.slice(-6)}</span>
                  {newLogIds.has(log.id) && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 text-[10px] rounded-full border border-indigo-500/20">
                      <Bell className="w-2.5 h-2.5" /> NEW
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-gray-600">{new Date(log.timestamp * 1000).toLocaleTimeString()}</span>
              </div>

              <div className="flex items-center gap-2 mb-2 flex-wrap">
                 <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                     log.method === 'POST' ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-800 text-gray-400'
                 }`}>{log.method}</span>
                 <span className="text-xs font-mono text-gray-400 truncate">{log.finalModel}</span>
                 {log.errorMessage && (
                   <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                     <XCircle className="w-2.5 h-2.5" /> Error
                   </span>
                 )}
                 {/* Protocol, Vendor, and Streaming Badges */}
                 <ProtocolBadge format={log.originalResponseFormat} />
                 <VendorBadge modelName={log.originalModel} vendors={vendors} />
                 <StreamingBadge isStreaming={isStreamingRequest(log)} />
              </div>

              {/* Optional: Show Key Name and baseUrl in list item if filtering is "All" */}
              {!selectedApiKey && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[#262626] flex-wrap">
                      <Key className="w-3 h-3 text-gray-600" />
                      <span className="text-[10px] text-gray-500 truncate">
                          {apiKeys.find(k => k.id === log.apiKeyId)?.name || 'Unknown Client'}
                      </span>
                      {log.baseUrl && (
                        <>
                          <span className="text-gray-700">•</span>
                          <span className="text-[10px] text-cyan-600 truncate" title={log.baseUrl}>
                            {log.baseUrl.replace('https://', '').replace('http://', '').split('/')[0]}
                          </span>
                        </>
                      )}
                  </div>
              )}
            </div>
          )))}
        </div>
      </div>

      {/* Right Panel: Detail View */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a] rounded-xl border border-[#262626]">
        {selectedLog ? (
          <div className="flex flex-col h-full">
            {/* 1. Header & Stats */}
            <div className="p-6 border-b border-[#262626] bg-[#111]">
               <div className="flex justify-between items-start mb-6">
                   <div>
                       <h2 className="text-lg font-bold text-white flex items-center gap-2">
                           <Code className="w-5 h-5 text-indigo-500" />
                           <span className="max-w-[500px] truncate" title={selectedLog.path}>{selectedLog.path}</span>
                       </h2>
                       <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 font-mono flex-wrap">
                           <span>ID: {selectedLog.id!.slice(-8)}</span>
                           <span>•</span>
                           <span>{new Date(selectedLog.timestamp * 1000).toLocaleString()}</span>
                           <span>•</span>
                           <span className="flex items-center gap-1">
                               <Key className="w-3 h-3" />
                               {apiKeys.find(k => k.id === selectedLog.apiKeyId)?.name}
                           </span>
                           {selectedLog.baseUrl && (
                             <>
                               <span>•</span>
                               <span className="flex items-center gap-1 text-cyan-400 truncate max-w-[200px]" title={selectedLog.baseUrl}>
                                 <Code className="w-3 h-3" />
                                 {selectedLog.baseUrl.replace('https://', '').replace('http://', '').split('/')[0]}
                               </span>
                             </>
                           )}
                           {/* Protocol and Vendor Info */}
                           {(selectedLog.originalResponseFormat || selectedLog.originalModel) && (
                             <>
                               <span>•</span>
                               <div className="flex items-center gap-2">
                                 <ProtocolBadge format={selectedLog.originalResponseFormat} />
                                 <VendorBadge modelName={selectedLog.originalModel} vendors={vendors} />
                                 <StreamingBadge isStreaming={isStreamingRequest(selectedLog)} />
                               </div>
                             </>
                           )}
                       </div>
                   </div>
                   <div className="text-right">
                       <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                           selectedLog.statusCode === 200 
                           ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
                           : 'bg-red-500/10 text-red-500 border-red-500/20'
                       }`}>
                           {selectedLog.statusCode === 200 ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                           {selectedLog.statusCode} {selectedLog.statusCode === 200 ? 'OK' : 'Error'}
                       </div>
                   </div>
               </div>

               <div className="grid grid-cols-6 gap-4">
                  <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Total</div>
                      <div className="text-sm font-mono text-white">{selectedLog.latencyMs}ms</div>
                  </div>
                  {selectedLog.timeToFirstByteMs && (
                    <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
                        <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">TTFB</div>
                        <div className="text-sm font-mono text-cyan-400">{selectedLog.timeToFirstByteMs}ms</div>
                    </div>
                  )}
                  <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Total Tokens</div>
                      <div className="text-sm font-mono text-white">{selectedLog.totalTokens}</div>
                  </div>
                  <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
                      <div className="text-[10px] text-blue-400 uppercase font-semibold mb-1">Prompt</div>
                      <div className="text-sm font-mono text-blue-300">{selectedLog.promptTokens}</div>
                  </div>
                  <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
                      <div className="text-[10px] text-emerald-400 uppercase font-semibold mb-1">Completion</div>
                      <div className="text-sm font-mono text-emerald-300">{selectedLog.completionTokens}</div>
                  </div>
                  <div className="p-3 bg-[#1a1a1a] rounded border border-[#333]">
                      <div className="text-[10px] text-gray-500 uppercase font-semibold mb-1">Comp Ratio</div>
                      <div className="text-sm font-mono text-gray-300">
                        {((selectedLog.completionTokens / selectedLog.totalTokens) * 100).toFixed(1)}%
                      </div>
                  </div>
               </div>

               {/* Error Message Display */}
               {selectedLog.errorMessage && (
                 <div className="mt-4 p-4 bg-red-950/20 border border-red-500/20 rounded-lg">
                   <div className="flex items-center gap-2 mb-3">
                     <XCircle className="w-4 h-4 text-red-500" />
                     <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Error Details</h4>
                     <CopyButton text={selectedLog.errorMessage} title="Copy error" className="ml-auto" />
                   </div>
                   <ExpandableContent
                     content={selectedLog.errorMessage}
                     maxLength={300}
                     maxLines={5}
                     className="text-sm text-red-300 font-mono leading-relaxed"
                   />
                 </div>
               )}
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                
                {/* 2. Request Configuration (Parameters & Tools) */}
                <section>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Settings className="w-3 h-3" /> Request Configuration
                    </h3>
                    <div className="space-y-4">
                        {/* Config Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                                <span className="text-xs text-gray-400">Temperature</span>
                                <span className="text-xs font-mono text-white">{selectedLog.temperature ?? (selectedLog.requestParams?.temperature ?? 0.7)}</span>
                            </div>
                            <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                                <span className="text-xs text-gray-400">Messages</span>
                                <span className="text-xs font-mono text-white">{selectedLog.messageCount}</span>
                            </div>
                            <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                                <span className="text-xs text-gray-400">Has Tools</span>
                                <span className={`text-xs font-mono ${selectedLog.hasTools ? 'text-indigo-400' : 'text-gray-500'}`}>
                                    {selectedLog.hasTools ? `Yes (${selectedLog.toolCount})` : 'No'}
                                </span>
                            </div>
                            {selectedLog.overwrittenModel && (
                                <div className="bg-[#1a1a1a] p-2.5 rounded border border-[#333] flex justify-between items-center">
                                    <span className="text-xs text-gray-400">Original</span>
                                    <span className="text-xs font-mono text-red-400 truncate" title={selectedLog.overwrittenModel}>{selectedLog.overwrittenModel}</span>
                                </div>
                            )}
                        </div>

                        {/* Tools Accordion */}
                        {selectedLog.requestTools && selectedLog.requestTools!.length > 0 && (
                            <ToolsViewer tools={selectedLog.requestTools} />
                        )}

                        {/* Overrides Display (if any) */}
                        {Object.keys(selectedLog.overwrittenAttributes).length > 0 && (
                             <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-lg p-3">
                                <h4 className="text-xs font-bold text-indigo-400 uppercase mb-2 flex items-center gap-2">
                                    <Box className="w-3 h-3" /> Attribute Overrides
                                </h4>
                                <div className="space-y-1">
                                    {Object.entries(selectedLog.overwrittenAttributes).map(([key, val]: [string, any]) => (
                                    <div key={key} className="flex items-center gap-3 text-xs font-mono min-w-0">
                                        <span className="text-gray-400 w-24 shrink-0">{key}</span>
                                        <span className="text-red-400 line-through decoration-red-400/50 truncate max-w-[150px]" title={String(val.original)}>{val.original}</span>
                                        <ArrowRight className="w-3 h-3 text-indigo-500 shrink-0" />
                                        <span className="text-emerald-400 font-bold truncate max-w-[150px]" title={String(val.final)}>{val.final}</span>
                                    </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* 3. Input Context (Message History) */}
                <section>
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <MessageSquare className="w-3 h-3" /> Input Context
                    </h3>
                    <div className="space-y-3">
                        {getMessageSplit(selectedLog).input!.map((msg, idx) => (
                            <MessageBubble key={idx} msg={msg} />
                        ))}
                    </div>
                </section>

                {/* 4. Model Output */}
                <section className="pb-6">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Cpu className="w-3 h-3" /> Final Output
                        {selectedLog.responseContent && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/10 text-purple-400 rounded border border-purple-500/20">Stream</span>
                        )}
                    </h3>

                    {/* Response Metadata */}
                    {selectedLog.responseParams && Object.keys(selectedLog.responseParams).length > 0 && (
                        <div className="mb-4 bg-[#1a1a1a] border border-[#333] rounded-lg p-3">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Response Metadata</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {selectedLog.responseParams.finish_reason && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-400">Finish Reason</span>
                                        <span className="text-xs font-mono text-white">{selectedLog.responseParams.finish_reason}</span>
                                    </div>
                                )}
                                {selectedLog.responseParams.model && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-400">Model</span>
                                        <span className="text-xs font-mono text-indigo-400 truncate" title={selectedLog.responseParams.model}>{selectedLog.responseParams.model}</span>
                                    </div>
                                )}
                                {selectedLog.responseParams.system_fingerprint && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-400">System FP</span>
                                        <span className="text-xs font-mono text-gray-500 truncate" title={selectedLog.responseParams.system_fingerprint}>{selectedLog.responseParams.system_fingerprint!.slice(0, 8)}</span>
                                    </div>
                                )}
                                {selectedLog.responseParams.id && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-400">Response ID</span>
                                        <span className="text-xs font-mono text-gray-500 truncate" title={selectedLog.responseParams.id}>{selectedLog.responseParams.id!.slice(0, 8)}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {isStructuredContent(selectedLog.responseContent) ? (
                        // Structured content (Anthropic format) - use StructuredContentViewer
                        <div className="p-5 bg-[#0f1410] border border-emerald-900/30 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Bot className="w-4 h-4 text-emerald-500" />
                                    <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-wide">Model Output</h4>
                                    <span className="text-xs bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
                                        Structured Content
                                    </span>
                                </div>
                                <CopyButton text={selectedLog.responseContent || ''} title="Copy response" />
                            </div>
                            <StructuredContentViewer content={selectedLog.responseContent || ''} />
                        </div>
                    ) : (selectedLog.responseContent && selectedLog.responseContent.trim().length > 0) ? (
                        // Plain text content - use formatContent
                        <div className="p-5 bg-[#0f1410] border border-emerald-900/30 rounded-lg">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Bot className="w-4 h-4 text-emerald-500" />
                                    <h4 className="text-sm font-bold text-emerald-500 uppercase tracking-wide">Model Output</h4>
                                </div>
                                <CopyButton text={selectedLog.responseContent} title="Copy response" />
                            </div>
                            <ExpandableContent
                              content={formatContent(selectedLog.responseContent)}
                              maxLength={500}
                              maxLines={10}
                              className="text-sm text-gray-200 leading-relaxed border-l-2 border-emerald-500/20 pl-4"
                            />
                        </div>
                    ) : selectedLog.responseParams?.finish_reason === 'tool_calls' ? (
                        (() => {
                            // First, try to use the responseToolCalls field from database
                            const toolCallsFromDb = selectedLog.responseToolCalls;
                            // Also try to get tool_calls from responseContent
                            const toolCallsFromResponse = tryParseToolCallsFromResponse(selectedLog.responseContent);
                            // Fallback: try to get tool_calls from messages array
                            const toolCallsFromMessages = selectedLog.messages
                                .filter(m => m.role === Role.ASSISTANT)
                                .flatMap(m => m.tool_calls || []);

                            // Use tool_calls in priority order: DB field > responseContent > messages
                            const toolCallsToShow = toolCallsFromDb && toolCallsFromDb!.length > 0
                                ? toolCallsFromDb
                                : (toolCallsFromResponse && toolCallsFromResponse!.length > 0
                                    ? toolCallsFromResponse
                                    : toolCallsFromMessages);

                            // Check if we have responseContent to display
                            const hasResponseContent = selectedLog.responseContent &&
                              (typeof selectedLog.responseContent === 'string'
                                ? selectedLog.responseContent.trim().length > 0
                                : (Array.isArray(selectedLog.responseContent) && (selectedLog.responseContent as any[]).length > 0)
                              );

                            // Prepare copy text - include both responseContent and tool_calls if available
                            let copyData: any = {};
                            if (hasResponseContent) {
                                try {
                                    copyData.responseContent = JSON.parse(selectedLog.responseContent ?? '');
                                } catch {
                                    copyData.responseContent = selectedLog.responseContent;
                                }
                            }
                            if (toolCallsToShow && toolCallsToShow!.length > 0) {
                                copyData.tool_calls = toolCallsToShow;
                            }
                            if (Object.keys(copyData).length === 0) {
                                copyData = { finish_reason: 'tool_calls', note: 'No tool calls data captured' };
                            }
                            const copyJson = JSON.stringify(copyData, null, 2);

                            return (
                                <div className="space-y-4">
                                    {/* Display tool_calls if available */}
                                    {toolCallsToShow && toolCallsToShow!.length > 0 && (
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
                                                {toolCallsToShow!.map((tc, idx) => {
                                                    // Find tool definition to get description
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

                                    {/* Display responseContent if available and separate from tool_calls */}
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
                                                <CopyButton text={selectedLog.responseContent || ''} title="Copy output" />
                                            </div>
                                            <StructuredContentViewer content={selectedLog.responseContent!} />
                                        </div>
                                    )}

                                    {/* No tool_calls and no responseContent */}
                                    {(!toolCallsToShow || toolCallsToShow!.length === 0) && !hasResponseContent && (
                                        <div className="p-6 bg-[#0a0a0a] border border-[#262626] border-dashed rounded-lg text-center">
                                            <div className="flex items-center justify-center gap-2 mb-3">
                                                <Terminal className="w-6 h-6 text-gray-600" />
                                                <p className="text-sm text-gray-500">
                                                    Tool calls requested (finish_reason: tool_calls)
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
                        })()
                    ) : getMessageSplit(selectedLog).output ? (
                        // Fallback: display output from messages (legacy behavior)
                        <ResponseViewer msg={getMessageSplit(selectedLog).output!} />
                    ) : (
                        <div className="p-8 border border-[#262626] border-dashed rounded-lg text-center text-gray-600 text-sm">
                            No response content generated (Stream or Error)
                        </div>
                    )}
                </section>

                {/* 5. Original Response (Upstream API) */}
                <section className="pb-6">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Eye className="w-3 h-3" /> Original Response
                        <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20">
                            Upstream API
                        </span>
                    </h3>
                    <OriginalResponseViewer
                        originalResponse={selectedLog.originalResponse}
                        originalResponseFormat={selectedLog.originalResponseFormat}
                        dbPromptTokens={selectedLog.promptTokens}
                        dbCompletionTokens={selectedLog.completionTokens}
                        dbTotalTokens={selectedLog.totalTokens}
                        requestId={selectedLog.id}
                    />
                </section>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
            <Box className="w-16 h-16 mb-4 opacity-20" />
            <p>Select a request to view trace details.</p>
          </div>
        )}
      </div>
    </div>
  );
};