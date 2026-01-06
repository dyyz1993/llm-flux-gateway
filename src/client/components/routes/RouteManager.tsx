import React, { useState, useEffect } from 'react';
import type { RouteConfig } from '@shared/types';
import { useRoutesStore } from '@client/stores/routesStore';
import { useAssetsStore } from '@client/stores/assetsStore';
import { Plus, Trash2, Save, Edit3, ArrowRight, Server, FileJson, Globe, Check, ChevronRight as ArrowRightIcon } from 'lucide-react';
import { YamlOverrideEditor } from './YamlOverrideEditor';

export const RouteManager: React.FC = () => {
  // ✅ Use Zustand selector hooks (individual selectors for stability)
  const routes = useRoutesStore((state) => state.routes);
  const loading = useRoutesStore((state) => state.loading);
  const error = useRoutesStore((state) => state.error);
  const fetchRoutes = useRoutesStore((state) => state.fetchRoutes);
  const createRoute = useRoutesStore((state) => state.createRoute);
  const updateRouteData = useRoutesStore((state) => state.updateRouteData);
  const toggleRouteActive = useRoutesStore((state) => state.toggleRouteActive);
  const deleteRoute = useRoutesStore((state) => state.deleteRoute);

  // Get assets for dropdown
  const assets = useAssetsStore((state) => state.assets);
  const fetchAssets = useAssetsStore((state) => state.fetchAssets);

  const [editingId, setEditingId] = useState<string | null>(null as any);
  const [editForm, setEditForm] = useState<Partial<RouteConfig> & { assetId?: string }>({});
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    assetId: '',
  });

  // Success state for onboarding flow
  const [createdRoute, setCreatedRoute] = useState<RouteConfig | null>(null as any);

  // Highlight state for navigation from Keys page
  const [highlightedRouteId, setHighlightedRouteId] = useState<string | null>(null as any);

  // Fetch data on mount
  useEffect(() => {
    fetchRoutes();
    fetchAssets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for selectedRouteId from Keys page and highlight
  useEffect(() => {
    const selectedRouteId = sessionStorage.getItem('selectedRouteId');
    if (!selectedRouteId) return undefined;

    setHighlightedRouteId(selectedRouteId);
    // Clear after reading
    sessionStorage.removeItem('selectedRouteId');
    // Remove highlight after 3 seconds
    const timer = setTimeout(() => setHighlightedRouteId(null), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Scroll to highlighted route
  useEffect(() => {
    if (highlightedRouteId) {
      const element = document.getElementById(`route-${highlightedRouteId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [highlightedRouteId, routes]);

  // Check for newAssetId from Assets page and auto-fill
  useEffect(() => {
    const newAssetId = sessionStorage.getItem('newAssetId');
    if (newAssetId) {
      setCreateForm({
        name: '', // Let user enter name
        assetId: newAssetId,
      });
      // Clear after using
      sessionStorage.removeItem('newAssetId');
    }
  }, []);

  const handleCreate = async () => {
    if (!createForm.name || !createForm.assetId) return;

    setIsCreating(true);
    const result = await createRoute({
      name: createForm.name,
      assetId: createForm.assetId,
    });

    if (result) {
      setCreatedRoute(result);
      setCreateForm({
        name: '',
        assetId: '',
      });
    } else {
      alert('Failed to create route');
    }
    setIsCreating(false);
  };

  const handleEdit = (route: RouteConfig) => {
    setEditingId(route.id);
    setEditForm({
      name: route.name,
      assetId: route.assetId,
      overrides: route.overrides,
    } as any);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    const success = await updateRouteData(editingId, {
      name: editForm.name,
      assetId: editForm.assetId,
      overrides: editForm.overrides,
    } as any);

    if (success) {
      setEditingId(null);
      setEditForm({});
    } else {
      alert('Failed to update route');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this route?')) return;

    const success = await deleteRoute(id);
    if (!success) {
      alert('Failed to delete route');
    }
  };

  const getAssetById = (assetId: string) => {
    return assets.find(a => a.id === assetId);
  };

  if (loading && routes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading routes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Route Flux Configuration</h2>
          <p className="text-gray-400 text-sm mt-1">Manage routing rules and request transformations.</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {createdRoute && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-lg">
              <Check className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Route Created Successfully!
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                <span className="text-white font-medium">{createdRoute.name}</span> is ready to route requests.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Store route ID for key creation and navigate
                    sessionStorage.setItem('newRouteId', createdRoute.id);
                    window.location.hash = '#/keys';
                  }}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <ArrowRightIcon className="w-4 h-4" />
                  Generate API Key
                </button>
                <button
                  onClick={() => setCreatedRoute(null)}
                  className="text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create New Route Form */}
      <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-4">
        <h3 className="text-white font-medium mb-3">Create New Route</h3>
        <div className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Route name"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              className="flex-1 bg-[#1a1a1a] border border-[#333] text-white text-sm px-3 py-2 rounded-md focus:border-indigo-500 focus:outline-none"
            />
            <select
              value={createForm.assetId}
              onChange={(e) => setCreateForm({ ...createForm, assetId: e.target.value })}
              className="flex-1 bg-[#1a1a1a] border border-[#333] text-white text-sm px-3 py-2 rounded-md focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Select Asset...</option>
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name} ({asset.vendorDisplayName})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={isCreating || !createForm.name || !createForm.assetId}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              {isCreating ? 'Creating...' : 'Add Route'}
            </button>
          </div>
        </div>
      </div>

      {/* Routes List */}
      {routes.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-12 text-center">
          <Server className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No routes yet</h3>
          <p className="text-gray-500 text-sm">Create your first route to start forwarding requests</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {routes.map((route) => {
            const asset = getAssetById(route.assetId);
            const isHighlighted = highlightedRouteId === route.id;
            return (
              <div
                key={route.id}
                id={`route-${route.id}`}
                className={`bg-[#0a0a0a] border rounded-xl overflow-hidden transition-all ${
                  isHighlighted
                    ? 'border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] ring-2 ring-indigo-500/50'
                    : 'border-[#262626] hover:border-[#404040]'
                }`}
              >
                {/* Header */}
                <div className="p-4 flex items-center justify-between border-b border-[#262626] bg-[#111]">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${route.isActive ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-gray-600'}`} />
                    <div>
                      {editingId === route.id ? (
                        <input
                          type="text"
                          value={editForm.name || route.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="text-white font-medium bg-[#0a0a0a] border border-[#333] px-2 py-1 rounded focus:border-indigo-500 focus:outline-none"
                        />
                      ) : (
                        <h3 className="text-white font-medium">{route.name}</h3>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <Globe className="w-3 h-3" />
                        {asset && (
                          <span>{asset.vendorDisplayName}</span>
                        )}
                        {(asset as any)?.assetModels && (asset as any).assetModels.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-gray-400">
                              {(asset as any).assetModels.length} model{(asset as any).assetModels.length > 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingId === route.id ? (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                          title="Save"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          title="Cancel"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleEdit(route)}
                        className="p-2 rounded-lg hover:bg-[#262626] text-gray-400 hover:text-white transition-colors"
                        title="Edit"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    <div className="w-px h-4 bg-[#333]" />
                    <button
                      onClick={() => toggleRouteActive(route.id)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${
                        route.isActive
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'
                      }`}
                    >
                      {route.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Asset Info */}
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">Asset</label>
                      {editingId === route.id ? (
                        <select
                          value={editForm.assetId || route.assetId}
                          onChange={(e) => setEditForm({ ...editForm, assetId: e.target.value })}
                          className="w-full mt-1 bg-[#0a0a0a] border border-[#333] text-white text-sm px-3 py-2 rounded-md focus:border-indigo-500 focus:outline-none"
                        >
                          {assets.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.name} ({asset.vendorDisplayName})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="mt-1">
                          {asset ? (
                            <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] px-3 py-2 rounded-md">
                              <Server className="w-4 h-4 text-indigo-400" />
                              <div>
                                <div className="text-white font-medium">{asset.name}</div>
                                <div className="text-xs text-gray-500">{asset.vendorDisplayName}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-1 text-red-400 text-sm">Asset not found</div>
                          )}
                        </div>
                      )}
                    </div>

                    {asset && (
                      <>
                        <div>
                          <label className="text-xs text-gray-500 uppercase font-semibold">Base URL</label>
                          <div className="mt-1 bg-[#1a1a1a] border border-[#333] px-3 py-2 rounded-md">
                            <span className="text-gray-400 font-mono text-sm break-all">{asset.vendorBaseUrl || 'Not configured'}</span>
                          </div>
                        </div>

                        {(asset as any).assetModels && (asset as any).assetModels.length > 0 && (
                          <div>
                            <label className="text-xs text-gray-500 uppercase font-semibold">Available Models</label>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(asset as any).assetModels.map((modelId: string) => (
                                <span key={modelId} className="text-xs bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded border border-indigo-500/20">
                                  {modelId}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Right: Overrides */}
                  {editingId === route.id ? (
                    <div className="bg-[#151515] rounded-lg p-3 border border-[#262626]">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-2">
                          <FileJson className="w-3 h-3" />
                          Override Rules (YAML)
                        </label>
                      </div>
                      {/* Inline YAML editor without Save/Cancel buttons */}
                      <YamlOverrideEditor
                        rules={editForm.overrides || route.overrides}
                        onSave={(rules) => setEditForm({ ...editForm, overrides: rules })}
                        onCancel={() => {}}
                        embedded={true}
                      />
                    </div>
                  ) : (
                    <div className="bg-[#151515] rounded-lg p-3 border border-[#262626]">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-2">
                          <FileJson className="w-3 h-3" />
                          Override Rules
                        </label>
                        <span className="text-[10px] text-gray-600">{route.overrides.length} rules</span>
                      </div>
                      {route.overrides.length === 0 ? (
                        <p className="text-xs text-gray-600 italic">No override rules defined.</p>
                      ) : (
                        <div className="space-y-2">
                          {route.overrides.map((rule, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <span className="bg-[#262626] text-gray-300 px-1.5 py-0.5 rounded font-mono">{rule.field}</span>
                              <span className="text-gray-600">IN</span>
                              <span className="text-indigo-400 font-mono">[{rule.matchValues.join(', ')}]</span>
                              <ArrowRight className="w-3 h-3 text-gray-600" />
                              <span className="text-emerald-400 font-mono">{rule.rewriteValue}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delete button */}
                  <div className="md:col-span-2">
                    <button
                      onClick={() => handleDelete(route.id)}
                      className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Route
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
