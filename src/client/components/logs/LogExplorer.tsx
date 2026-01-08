import React, { useState, useEffect, useMemo } from 'react';
import { getRequestLogs, toggleLogFavorite, clearAllNonFavoritedLogs, getFavoriteLogs } from '@client/services/analyticsService';
import { realtimeLogsService } from '@client/services/realtimeLogsService';
import { fetchVendors, fetchKeys } from '@client/services/apiClient';
import { RequestLog, ApiKey, Vendor } from '@shared/types';
import { LogList, LogDetail } from './components';

export const LogExplorer: React.FC = () => {
  // State
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedLog, setSelectedLog] = useState<RequestLog | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApiKey, setSelectedApiKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'favorites'>('all');

  // Advanced filter states
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [filterStatusCode, setFilterStatusCode] = useState<string>('');
  const [filterModel, setFilterModel] = useState<string>('');
  const [filterTimeRange, setFilterTimeRange] = useState<string>('');
  const [filterHasTools, setFilterHasTools] = useState<string>('');

  // UI states
  const [showClearMenu, setShowClearMenu] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // localStorage keys for new logs tracking
  const NEW_LOGS_KEY = 'logs_new_log_ids';
  const READ_LOGS_KEY = 'logs_read_ids';

  // Load new log IDs from localStorage on mount
  const [newLogIds, setNewLogIds] = useState<Set<string>>((): Set<string> => {
    try {
      const stored = localStorage.getItem(NEW_LOGS_KEY);
      const readIds = JSON.parse(localStorage.getItem(READ_LOGS_KEY) || '[]') as string[];
      const newIds = new Set<string>(JSON.parse(stored || '[]'));
      readIds.forEach((id: string) => newIds.delete(id));
      return newIds;
    } catch {
      return new Set<string>();
    }
  });

  // Count active filters
  const activeFilterCount = [
    filterStatusCode,
    filterModel,
    filterTimeRange,
    filterHasTools,
  ].filter(v => v !== '').length;

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
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
  }, [logs, searchTerm, selectedApiKey, showFavoritesOnly, filterStatusCode, filterModel, filterTimeRange, filterHasTools]);

  // Get unique models from logs for filter dropdown
  const uniqueModels = useMemo(() => {
    const models = new Set(logs.map(l => l.finalModel));
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

  // Handle favorite toggle
  const handleToggleFavorite = async (logId: string) => {
    try {
      const result = await toggleLogFavorite(logId);
      setLogs(prevLogs =>
        prevLogs.map(log =>
          log.id === logId ? { ...log, isFavorited: result.isFavorited } : log
        )
      );
    } catch (error) {
      console.error('[LogExplorer] Failed to toggle favorite:', error);
    }
  };

  // Handle clear all non-favorited logs
  const handleClearHistory = async () => {
    const regularLogCount = logs.filter(l => !l.isFavorited).length;

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

      setLogs(prevLogs => prevLogs.filter(log => log.isFavorited));

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
    fetchKeys()
      .then(result => setApiKeys(result.data! || []))
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
          data = await getFavoriteLogs(1000);
        } else {
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

  // SSE connection for real-time logs
  useEffect(() => {
    realtimeLogsService.connect(selectedApiKey || undefined);

    const unsubscribe = realtimeLogsService.subscribe((newLog) => {
      setLogs(prevLogs => {
        if (prevLogs.some(l => l.id === newLog.id)) return prevLogs;

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

  return (
    <div data-class-id="LogExplorer" className="flex h-[calc(100vh-4rem)] gap-6 animate-in fade-in duration-500">
      <LogList
        apiKeys={apiKeys}
        vendors={vendors}
        filteredLogs={filteredLogs}
        uniqueModels={uniqueModels}
        newLogIds={newLogIds}
        isLoading={isLoading}
        searchTerm={searchTerm}
        selectedApiKey={selectedApiKey}
        viewMode={viewMode}
        showAdvancedFilter={showAdvancedFilter}
        showClearMenu={showClearMenu}
        activeFilterCount={activeFilterCount}
        filterStatusCode={filterStatusCode}
        filterModel={filterModel}
        filterTimeRange={filterTimeRange}
        filterHasTools={filterHasTools}
        selectedLog={selectedLog}
        onSearchChange={setSearchTerm}
        onApiKeyChange={setSelectedApiKey}
        onViewModeToggle={() => {
          const newMode = viewMode === 'favorites' ? 'all' : 'favorites';
          setViewMode(newMode);
          setShowFavoritesOnly(newMode === 'favorites');
        }}
        onAdvancedFilterToggle={() => setShowAdvancedFilter(!showAdvancedFilter)}
        onClearMenuToggle={() => setShowClearMenu(!showClearMenu)}
        onFilterChange={(filters) => {
          if (filters.statusCode !== undefined) setFilterStatusCode(filters.statusCode);
          if (filters.model !== undefined) setFilterModel(filters.model);
          if (filters.timeRange !== undefined) setFilterTimeRange(filters.timeRange);
          if (filters.hasTools !== undefined) setFilterHasTools(filters.hasTools);
        }}
        onLogSelect={(log) => {
          setSelectedLog(log);
          markLogAsRead(log.id);
        }}
        onToggleFavorite={handleToggleFavorite}
        onClearNewLogs={clearNewLogs}
        onClearReadLogs={clearReadLogs}
        onClearHistory={handleClearHistory}
      />
      <LogDetail
        selectedLog={selectedLog}
        apiKeys={apiKeys}
        vendors={vendors}
      />
    </div>
  );
};
