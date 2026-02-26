import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Search, Filter, XCircle, MessageSquare, Key, Bell, Eye, Star, ChevronDown, Settings, Trash2, RefreshCw, Loader2
} from 'lucide-react';
import { RequestLog, ApiKey, Vendor } from '@shared/types';
import { ProtocolBadge, VendorBadge, StreamingBadge, RequestStatusBadge } from './badges';
import { isStreamingRequest } from '../utils/contentFormatters';

interface LogListProps {
  // Data
  apiKeys: ApiKey[];
  vendors: Vendor[];
  filteredLogs: RequestLog[];
  uniqueModels: string[];
  newLogIds: Set<string>;

  // UI State
  isLoading: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  searchTerm: string;
  selectedApiKey: string;
  viewMode: 'all' | 'favorites';
  showAdvancedFilter: boolean;
  showClearMenu: boolean;
  activeFilterCount: number;
  filterStatusCode: string;
  filterModel: string;
  filterTimeRange: string;
  filterHasTools: string;

  // Selection
  selectedLog: RequestLog | null;

  // Handlers
  onSearchChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onViewModeToggle: () => void;
  onAdvancedFilterToggle: () => void;
  onClearMenuToggle: () => void;
  onFilterChange: (filters: {
    statusCode?: string;
    model?: string;
    timeRange?: string;
    hasTools?: string;
  }) => void;
  onLogSelect: (log: RequestLog) => void;
  onToggleFavorite: (logId: string) => void;
  onRetry: (logId: string) => Promise<void>;
  onClearNewLogs: () => void;
  onClearReadLogs: () => void;
  onClearHistory: () => void;
  onLoadMore?: () => void;
}

export const LogList: React.FC<LogListProps> = ({
  apiKeys,
  vendors,
  filteredLogs,
  uniqueModels,
  newLogIds,
  isLoading,
  isLoadingMore = false,
  hasMore = true,
  searchTerm,
  selectedApiKey,
  viewMode,
  showAdvancedFilter,
  showClearMenu,
  activeFilterCount,
  filterStatusCode,
  filterModel,
  filterTimeRange,
  filterHasTools,
  selectedLog,
  onSearchChange,
  onApiKeyChange,
  onViewModeToggle,
  onAdvancedFilterToggle,
  onClearMenuToggle,
  onFilterChange,
  onLogSelect,
  onToggleFavorite,
  onRetry,
  onClearNewLogs,
  onClearReadLogs,
  onClearHistory,
  onLoadMore,
}) => {
  const clearMenuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  // Scroll handler for infinite loading
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!onLoadMore || isLoadingMore || !hasMore) return;

    const target = e.target as HTMLDivElement;
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

    // Load more when user is within 100px of the bottom
    if (scrollBottom < 100) {
      onLoadMore();
    }
  }, [onLoadMore, isLoadingMore, hasMore]);

  // Close clear menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clearMenuRef.current && !clearMenuRef.current.contains(event.target as Node)) {
        if (showClearMenu) {
          onClearMenuToggle();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showClearMenu, onClearMenuToggle]);

  return (
    <div data-class-id="LogList" className="w-1/3 flex flex-col gap-4 border-r border-[#262626] pr-4">
      <div className="space-y-2">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search traces..."
            className="w-full bg-[#0a0a0a] border border-[#262626] rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-600"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
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
                <span className="text-gray-600">({filteredLogs.length})</span>
              </>
            ) : (
              <>
                <MessageSquare className="w-3.5 h-3.5" />
                <span>All Logs</span>
                <span className="text-gray-600">({filteredLogs.length})</span>
              </>
            )}
          </div>

          <div className="relative flex-1">
            <select
              value={selectedApiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              className="w-full appearance-none bg-[#0a0a0a] border border-[#262626] rounded-lg pl-9 pr-8 py-2 text-xs text-gray-300 focus:outline-none focus:border-indigo-600 cursor-pointer"
            >
              <option value="">All API Keys</option>
              {apiKeys.map(k => (
                <option key={k.id} value={k.id}>{k.name} ({k.keyToken!.slice(0, 8)}...)</option>
              ))}
            </select>
            <Key className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
            <ChevronDown className="absolute right-3 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
          </div>

          <button
            onClick={onViewModeToggle}
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
            onClick={onAdvancedFilterToggle}
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
              onClick={onClearMenuToggle}
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
                      onClearNewLogs();
                      onClearMenuToggle();
                    }}
                    className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-[#262626] rounded flex items-center gap-2 transition-colors"
                  >
                    <Bell className="w-3 h-3 text-indigo-400" />
                    <span>Clear all NEW markers</span>
                  </button>
                  <button
                    onClick={() => {
                      onClearReadLogs();
                      onClearMenuToggle();
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
                      onClearHistory();
                      onClearMenuToggle();
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
              onClick={() => onFilterChange({
                statusCode: '',
                model: '',
                timeRange: '',
                hasTools: '',
              })}
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
                onChange={(e) => onFilterChange({ statusCode: e.target.value })}
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
                onChange={(e) => onFilterChange({ model: e.target.value })}
                className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-indigo-600"
              >
                <option value="">All Models</option>
                {uniqueModels.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>

            {/* Time Range Filter */}
            <div className="space-y-2">
              <label className="text-xs text-gray-500">Time Range</label>
              <select
                value={filterTimeRange}
                onChange={(e) => onFilterChange({ timeRange: e.target.value })}
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
                onChange={(e) => onFilterChange({ hasTools: e.target.value })}
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
                  <button onClick={() => onFilterChange({ statusCode: '' })} className="hover:text-white">×</button>
                </span>
              )}
              {filterModel && (
                <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-1 rounded flex items-center gap-1">
                  Model: <span className="max-w-[200px] truncate" title={filterModel}>{filterModel}</span>
                  <button onClick={() => onFilterChange({ model: '' })} className="hover:text-white">×</button>
                </span>
              )}
              {filterTimeRange && (
                <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-1 rounded flex items-center gap-1">
                  Time: {filterTimeRange === '1h' ? '1h' : filterTimeRange === '24h' ? '24h' : filterTimeRange === '7d' ? '7d' : '30d'}
                  <button onClick={() => onFilterChange({ timeRange: '' })} className="hover:text-white">×</button>
                </span>
              )}
              {filterHasTools && (
                <span className="text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-1 rounded flex items-center gap-1">
                  Tools: {filterHasTools === 'yes' ? 'With' : 'Without'}
                  <button onClick={() => onFilterChange({ hasTools: '' })} className="hover:text-white">×</button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Log List */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto space-y-2 custom-scrollbar"
      >
        {isLoading ? (
          <div className="text-center py-10 text-gray-600 text-sm">Loading logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-10 text-gray-600 text-sm">No logs found matching filters.</div>
        ) : (
          <>
            {filteredLogs.map(log => (
            <div
              key={log.id}
              onClick={() => onLogSelect(log)}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedLog?.id === log.id
                  ? 'bg-[#1a1a1a] border-indigo-600/50 shadow-lg shadow-indigo-900/10'
                  : log.statusCode === 0
                    ? 'bg-indigo-500/5 border-indigo-500/20'
                    : 'bg-[#0a0a0a] border-[#262626] hover:border-[#404040]'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(log.id);
                    }}
                    className={`p-1 rounded hover:bg-[#333] transition-colors ${
                      log.isFavorited ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'
                    }`}
                    title={log.isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star className={`w-3.5 h-3.5 ${log.isFavorited ? 'fill-current' : ''}`} />
                  </button>

                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (retryingIds.has(log.id)) return;
                      
                      setRetryingIds(prev => new Set(prev).add(log.id));
                      try {
                        await onRetry(log.id);
                      } finally {
                        setRetryingIds(prev => {
                          const next = new Set(prev);
                          next.delete(log.id);
                          return next;
                        });
                      }
                    }}
                    disabled={retryingIds.has(log.id)}
                    className={`p-1 rounded hover:bg-[#333] transition-colors ${
                      retryingIds.has(log.id) ? 'text-indigo-400' : 'text-gray-600 hover:text-indigo-400'
                    }`}
                    title="Retry this request"
                  >
                    {retryingIds.has(log.id) ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <RequestStatusBadge statusCode={log.statusCode} />
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
              {log.routeId && (
                <span className="text-[9px] px-1 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20 max-w-[120px] truncate" title={`Route ID: ${log.routeId}`}>
                  {log.routeId}
                </span>
              )}
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
          ))}

            {/* Loading More Indicator */}
            {isLoadingMore && (
              <div className="text-center py-4 text-gray-600 text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Loading more logs...</span>
              </div>
            )}

            {/* End of List Indicator */}
            {!hasMore && filteredLogs.length > 0 && !isLoadingMore && (
              <div className="text-center py-4 text-gray-700 text-xs">
                No more logs to load
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
