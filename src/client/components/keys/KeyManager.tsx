import React, { useState, useEffect } from 'react';
import type { ApiKey } from '@shared/types';
import { useKeysStore } from '@client/stores/keysStore';
import { copyToClipboard } from '@client/utils/clipboard';
import { useRoutesStore } from '@client/stores/routesStore';
import { useAssetsStore } from '@client/stores/assetsStore';
import { getApiBaseUrl } from '@client/services/apiClient';
import {
  Key, Copy, Plus, Trash2, Check, X, Edit2,
  ExternalLink, RotateCcw, Terminal
} from 'lucide-react';

export const KeyManager: React.FC = () => {
  // Keys state - use individual selectors to avoid object creation issues
  const keys = useKeysStore((state) => state.keys);
  const loading = useKeysStore((state) => state.loading);
  const error = useKeysStore((state) => state.error);

  // Get actions from store reference to avoid dependency issues
  const fetchKeys = useKeysStore((state) => state.fetchKeys);
  const createKey = useKeysStore((state) => state.createKey);
  const updateKeyStatus = useKeysStore((state) => state.updateKeyStatus);
  const updateKeyRoutes = useKeysStore((state) => state.updateKeyRoutes);
  const deleteKey = useKeysStore((state) => state.deleteKey);

  // Routes for dropdown
  const routes = useRoutesStore((state) => state.routes);
  const fetchRoutes = useRoutesStore((state) => state.fetchRoutes);

  // Assets for route details
  const assets = useAssetsStore((state) => state.assets);

  const [copiedId, setCopiedId] = useState<string | null>(null as any);
  const [isCreating, setIsCreating] = useState(false);

  // Edit routes state
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null as any);
  const [editRouteIds, setEditRouteIds] = useState<string[]>([]);

  // Create key form
  const [createForm, setCreateForm] = useState({
    name: '',
    routeIds: [] as string[],
  });

  // Success state for onboarding flow
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null as any);

  // Fetch keys and routes on mount
  useEffect(() => {
    fetchKeys();
    fetchRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for newRouteId from Routes page and auto-fill
  useEffect(() => {
    const newRouteId = sessionStorage.getItem('newRouteId');
    if (newRouteId) {
      setCreateForm({
        name: '',
        routeIds: [newRouteId],
      });
      // Clear after using
      sessionStorage.removeItem('newRouteId');
    }
  }, []);

  const handleCopy = async (id: string, keyToken: string) => {
    try {
      await copyToClipboard(keyToken);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy key token:', error);
      alert('Failed to copy to clipboard. Please select and copy manually.');
    }
  };

  const handleGenerateKey = async () => {
    if (!createForm.name) {
      alert('Please enter a client name');
      return;
    }

    if (createForm.routeIds.length === 0) {
      alert('Please select at least one route');
      return;
    }

    setIsCreating(true);
    const result = await createKey(createForm.name, createForm.routeIds);

    if (result) {
      setCreatedKey(result);
      setCreateForm({ name: '', routeIds: [] });

      // Auto-copy the key to clipboard
      try {
        await copyToClipboard(result.keyToken);
        setCopiedId(result.id);
      } catch (error) {
        console.error('Failed to auto-copy key token:', error);
      }
    } else {
      alert('Failed to create key');
    }
    setIsCreating(false);
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this key?')) return;

    const success = await updateKeyStatus(id, 'revoked');
    if (!success) {
      alert('Failed to revoke key');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this key? This action cannot be undone.')) return;

    const success = await deleteKey(id);
    if (!success) {
      alert('Failed to delete key');
    }
  };

  const handleEditRoutes = (key: ApiKey) => {
    setEditingKey(key);
    setEditRouteIds(key.routes?.map(r => r.routeId) || []);
  };

  const handleSaveRoutes = async () => {
    if (!editingKey) return;

    const success = await updateKeyRoutes(editingKey.id, editRouteIds);
    if (success) {
      setEditingKey(null);
      setEditRouteIds([]);
    } else {
      alert('Failed to update routes');
    }
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditRouteIds([]);
  };

  const toggleEditRouteSelection = (routeId: string) => {
    setEditRouteIds((prev) =>
      prev.includes(routeId)
        ? prev.filter((id) => id !== routeId)
        : [...prev, routeId]
    );
  };

  const toggleRouteSelection = (routeId: string) => {
    setCreateForm((prev) => ({
      ...prev,
      routeIds: prev.routeIds.includes(routeId)
        ? prev.routeIds.filter((id) => id !== routeId)
        : [...prev.routeIds, routeId],
    }));
  };

  const formatDate = (date: Date | null | string) => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatKeyToken = (token: string) => {
    if (token.length <= 20) return token;
    return `${token.substring(0, 12)}...${token.substring(token.length - 4)}`;
  };

  if (loading && keys.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading keys...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Access Keys</h2>
          <p className="text-gray-400 text-sm mt-1">
            Manage internal keys for client applications.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {createdKey && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-lg">
              <Check className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                API Key Generated Successfully!
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                <span className="text-white font-medium">{createdKey.name}</span> is ready to use.
                {copiedId === createdKey.id && (
                  <span className="ml-2 text-emerald-400">Copied to clipboard!</span>
                )}
              </p>

              {/* Usage Example */}
              <div className="bg-[#0a0a0a] rounded-lg p-4 border border-[#262626]">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs text-gray-500 uppercase font-semibold">Curl Example</span>
                </div>
                <code className="text-xs text-gray-300 font-mono block whitespace-pre-wrap bg-[#1a1a1a] p-3 rounded border border-[#333]">
{`curl -X POST ${getApiBaseUrl() || window.location.origin}/v1/chat/completions \\
  -H "Authorization: Bearer ${createdKey.keyToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}
                </code>
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => handleCopy(createdKey.id, createdKey.keyToken)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  {copiedId === createdKey.id ? 'Copied!' : 'Copy Key'}
                </button>
                <button
                  onClick={() => setCreatedKey(null)}
                  className="text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create New Key Form */}
      <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-4">
        <h3 className="text-white font-medium mb-3">Generate New API Key</h3>
        <div className="space-y-4">
          {/* Name input */}
          <div>
            <input
              type="text"
              placeholder="Client name (e.g., 'Production App A')"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              className="w-full bg-[#1a1a1a] border border-[#333] text-white text-sm px-3 py-2 rounded-md focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Route selection */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">
              Select Routes
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {routes.map((route) => (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => toggleRouteSelection(route.id)}
                  className={`text-left px-3 py-2 rounded-md border transition-colors ${
                    createForm.routeIds.includes(route.id)
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                      : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-[#404040]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${route.isActive ? 'bg-emerald-500' : 'bg-gray-600'}`} />
                    <span className="text-sm font-medium">{route.name}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {route.assetName} • {route.assetVendorDisplayName}
                  </div>
                </button>
              ))}
            </div>
            {createForm.routeIds.length === 0 && (
              <p className="text-xs text-amber-500 mt-2">Please select at least one route</p>
            )}
          </div>

          {/* Create button */}
          <button
            onClick={handleGenerateKey}
            disabled={isCreating || !createForm.name || createForm.routeIds.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {isCreating ? 'Generating...' : 'Generate API Key'}
          </button>
        </div>
      </div>

      {/* Keys List */}
      {keys.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-12 text-center">
          <Key className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No API keys yet</h3>
          <p className="text-gray-500 text-sm">
            Generate your first API key to start using the gateway
          </p>
        </div>
      ) : (
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-[#111] border-b border-[#262626]">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Client Name
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Key Token
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Routes
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Last Used
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626]">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-[#111] transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#1a1a1a] rounded-lg text-indigo-400">
                        <Key className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-medium text-white">{k.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-gray-400 bg-[#1a1a1a] px-2 py-1 rounded border border-[#333]">
                        {formatKeyToken(k.keyToken)}
                      </code>
                      <button
                        onClick={() => handleCopy(k.id, k.keyToken)}
                        className="text-gray-500 hover:text-white transition-colors"
                        title="Copy full key"
                      >
                        {copiedId === k.id ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {k.routes && k.routes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {k.routes.map((assoc) => {
                          const route = routes.find(r => r.id === assoc.routeId);
                          const asset = route ? assets.find(a => a.id === route.assetId) : null;
                          const tooltipInfo = [
                            `Route: ${assoc.routeName}`,
                            asset && `Asset: ${asset.name}`,
                            asset && `Vendor: ${asset.vendorDisplayName}`,
                            `Priority: ${assoc.priority}`,
                            route && route.isActive ? '● Active' : '○ Disabled',
                          ].filter(Boolean).join('\n');

                          return (
                            <button
                              key={assoc.routeId}
                              onClick={() => {
                                sessionStorage.setItem('selectedRouteId', assoc.routeId);
                                window.location.hash = '#/routes';
                              }}
                              className="flex items-center gap-1 text-xs bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded border border-indigo-500/20 cursor-pointer hover:bg-indigo-500/20 hover:border-indigo-500/30 transition-colors"
                              title={tooltipInfo}
                            >
                              {assoc.routeName}
                              <ExternalLink className="w-3 h-3 opacity-60" />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-600 italic">No routes</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(k.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(k.lastUsedAt)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                        k.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}
                    >
                      {k.status === 'active' ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {k.status === 'active' ? (
                        <>
                          <button
                            onClick={() => handleEditRoutes(k)}
                            className="p-1.5 hover:bg-indigo-500/10 text-gray-400 hover:text-indigo-500 rounded transition-colors"
                            title="Edit Routes"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRevoke(k.id)}
                            className="p-1.5 hover:bg-amber-500/10 text-gray-400 hover:text-amber-500 rounded transition-colors"
                            title="Revoke"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(k.id)}
                            className="p-1.5 hover:bg-red-500/10 text-gray-400 hover:text-red-500 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleDelete(k.id)}
                          className="p-1.5 hover:bg-red-500/10 text-gray-400 hover:text-red-500 rounded transition-colors"
                          title="Delete permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Routes Dialog */}
      {editingKey && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6 max-w-2xl w-full mx-4">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">Edit Routes</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {editingKey.name} • {formatKeyToken(editingKey.keyToken)}
                </p>
              </div>
              <button
                onClick={handleCancelEdit}
                className="p-1 hover:bg-[#262626] rounded transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-500 uppercase font-semibold mb-2 block">
                Select Routes
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {routes.map((route) => {
                  const isSelected = editRouteIds.includes(route.id);
                  const isCurrentlyAssociated = editingKey.routes?.some(r => r.routeId === route.id);

                  return (
                    <button
                      key={route.id}
                      type="button"
                      onClick={() => toggleEditRouteSelection(route.id)}
                      className={`text-left px-3 py-2 rounded-md border transition-colors ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                          : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-[#404040]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${route.isActive ? 'bg-emerald-500' : 'bg-gray-600'}`} />
                        <span className="text-sm font-medium">{route.name}</span>
                        {isCurrentlyAssociated && !isSelected && (
                          <span className="text-xs text-amber-500">(Will be removed)</span>
                        )}
                        {!isCurrentlyAssociated && isSelected && (
                          <span className="text-xs text-emerald-500">(New)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {route.assetName} • {route.assetVendorDisplayName}
                      </div>
                    </button>
                  );
                })}
              </div>
              {editRouteIds.length === 0 && (
                <p className="text-xs text-amber-500 mt-2">
                  Warning: Key with no routes will not be able to access any endpoints
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#262626] text-white rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRoutes}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
