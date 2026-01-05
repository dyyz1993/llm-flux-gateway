import React, { useState, useEffect } from 'react';
import type { Asset, Vendor, VendorModel } from '@shared/types';
import { useAssetsStore } from '@client/stores/assetsStore';
import * as ApiClient from '@client/services/apiClient';
import { Wallet, Copy, Check, Trash2, Plus, Edit2, X, Globe, ChevronRight, ChevronLeft, Zap, Play, Loader2, Clock } from 'lucide-react';

type WizardStep = 1 | 2 | 3;

export const AssetManager: React.FC = () => {
  // ✅ Use individual selectors for stability
  const assets = useAssetsStore((state) => state.assets);
  const loading = useAssetsStore((state) => state.loading);
  const error = useAssetsStore((state) => state.error);
  const fetchAssets = useAssetsStore((state) => state.fetchAssets);
  const createAsset = useAssetsStore((state) => state.createAsset);
  const updateAssetData = useAssetsStore((state) => state.updateAssetData);
  const updateAssetStatus = useAssetsStore((state) => state.updateAssetStatus);
  const duplicateAsset = useAssetsStore((state) => state.duplicateAsset);
  const deleteAsset = useAssetsStore((state) => state.deleteAsset);

  const [copiedId, setCopiedId] = useState<string | null>(null as any);
  const [isCreating, setIsCreating] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null as any);
  const [editingId, setEditingId] = useState<string | null>(null as any);
  const [editForm, setEditForm] = useState<Partial<Asset>>({});

  // Model validation state
  const [validatingAssetId, setValidatingAssetId] = useState<string | null>(null as any);
  const [validationResults, setValidationResults] = useState<Array<{
    modelId: string;
    displayName: string;
    success: boolean;
    response?: string;
    error?: string;
    latencyMs?: number;
  }> | null>(null);

  // Success state for onboarding flow
  const [createdAsset, setCreatedAsset] = useState<Asset | null>(null as any);

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorModels, setVendorModels] = useState<VendorModel[]>([]);
  const [wizardForm, setWizardForm] = useState<{
    name: string;
    vendorId: string;
    vendorDisplayName?: string;
    apiKey: string;
    validFrom?: Date;
    validUntil?: Date;
    modelIds: string[];
  }>({
    name: '',
    vendorId: '',
    apiKey: '',
    modelIds: [],
  });

  // Fetch assets on mount
  useEffect(() => {
    fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch vendors when wizard opens
  useEffect(() => {
    if (isCreating && vendors.length === 0) {
      ApiClient.fetchVendors().then((result) => {
        if (result.success && result.data!) {
          setVendors(result.data!);
        }
      });
    }
  }, [isCreating, vendors.length]);

  // Fetch vendor models when vendor is selected
  useEffect(() => {
    if (wizardForm.vendorId) {
      ApiClient.fetchVendorModels(wizardForm.vendorId).then((result) => {
        if (result.success && result.data!) {
          setVendorModels(result.data!);
        }
      });
    }
  }, [wizardForm.vendorId]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreate = () => {
    setWizardStep(1);
    setWizardForm({
      name: '',
      vendorId: '',
      apiKey: '',
      modelIds: [],
    });
    setIsCreating(true);
  };

  const handleWizardNext = () => {
    if (wizardStep < 3) {
      setWizardStep(wizardStep + 1 as WizardStep);
    }
  };

  const handleWizardBack = () => {
    if (wizardStep > 1) {
      setWizardStep(wizardStep - 1 as WizardStep);
    }
  };

  const handleVendorSelect = (vendor: Vendor) => {
    setWizardForm({
      ...wizardForm,
      vendorId: vendor.id,
      vendorDisplayName: vendor.displayName,
    });
  };

  const handleModelToggle = (modelId: string) => {
    setWizardForm({
      ...wizardForm,
      modelIds: wizardForm.modelIds.includes(modelId)
        ? wizardForm.modelIds.filter((id) => id !== modelId)
        : [...wizardForm.modelIds, modelId],
    });
  };

  const handleWizardSubmit = async () => {
    setIsCreating(true);
    const result = await createAsset({
      name: wizardForm.name,
      vendorId: wizardForm.vendorId,
      apiKey: wizardForm.apiKey,
      validFrom: wizardForm.validFrom,
      validUntil: wizardForm.validUntil,
      modelIds: wizardForm.modelIds,
    });

    if (result) {
      setCreatedAsset(result);
      setIsCreating(false);
      setWizardStep(1);
    } else {
      setIsCreating(false);
      alert('Failed to create asset');
    }
  };

  const handleDuplicate = async (id: string) => {
    setIsDuplicating(id);
    const result = await duplicateAsset(id);
    setIsDuplicating(null);

    if (!result) {
      alert('Failed to duplicate asset');
    }
  };

  const handleEdit = (asset: Asset) => {
    setEditingId(asset.id);
    setEditForm(asset);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;

    const success = await updateAssetData(editingId, editForm);
    if (success) {
      setEditingId(null);
      setEditForm({});
    } else {
      alert('Failed to update asset');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleToggleStatus = async (id: string, currentStatus: 'active' | 'suspended') => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const success = await updateAssetStatus(id, newStatus);
    if (!success) {
      alert('Failed to update asset status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this asset? This action cannot be undone.')) return;

    const success = await deleteAsset(id);
    if (!success) {
      alert('Failed to delete asset');
    }
  };

  const handleQuickTest = async (asset: Asset) => {
    if (!asset.models || asset.models.length === 0) {
      alert('This asset has no models to test. Please add models first.');
      return;
    }

    setValidatingAssetId(asset.id);
    setValidationResults(null);

    try {
      const result = await ApiClient.validateAssetModels(asset.id);

      if (result.success && result.data!) {
        setValidationResults(result.data!.results);
        // Refresh assets to get updated validation status
        await fetchAssets();
      } else {
        alert(result.error || 'Failed to validate models');
      }
    } catch (error: any) {
      alert(error.message || 'Failed to validate models');
    } finally {
      setValidatingAssetId(null);
    }
  };

  const formatDate = (date: Date | null | string) => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading && assets.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading assets...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Assets</h2>
          <p className="text-gray-400 text-sm mt-1">
            Manage vendor API credentials and budgets.
          </p>
        </div>
        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          {isCreating ? 'Creating...' : 'Add Asset'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {createdAsset && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-lg">
              <Check className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                Asset Created Successfully!
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                <span className="text-white font-medium">{createdAsset.name}</span> is ready to use.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Store asset ID for route creation and navigate
                    sessionStorage.setItem('newAssetId', createdAsset.id);
                    window.location.hash = '#/routes';
                  }}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                  Create Route
                </button>
                <button
                  onClick={() => setCreatedAsset(null)}
                  className="text-gray-400 hover:text-white px-4 py-2 text-sm font-medium transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {assets.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-12 text-center">
          <Wallet className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No assets yet</h3>
          <p className="text-gray-500 text-sm mb-6">
            Add your first asset to start tracking API usage
          </p>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Your First Asset
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="bg-[#0a0a0a] border border-[#262626] rounded-xl overflow-hidden hover:border-[#404040] transition-colors"
            >
              {/* Header */}
              <div className="p-4 flex items-center justify-between border-b border-[#262626] bg-[#111]">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-[#1a1a1a] rounded-lg text-indigo-400">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    {editingId === asset.id ? (
                      <input
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="text-white font-medium bg-[#0a0a0a] border border-[#333] px-2 py-1 rounded focus:border-indigo-500 focus:outline-none"
                      />
                    ) : (
                      <h3 className="text-white font-medium">{asset.name}</h3>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <Globe className="w-3 h-3" />
                      <span>{asset.vendorDisplayName || asset.vendorId || 'Unknown Vendor'}</span>
                      {asset.models && asset.models.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-gray-400">
                            {asset.models.map((m) => m.displayName).join(', ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editingId === asset.id ? (
                    <>
                      <button
                        onClick={handleSaveEdit}
                        className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                        title="Save"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleEdit(asset)}
                      className="p-2 rounded-lg hover:bg-[#262626] text-gray-400 hover:text-white transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                  <div className="w-px h-4 bg-[#333]" />
                  <button
                    onClick={() => handleToggleStatus(asset.id, asset.status)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all ${
                      asset.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                        : 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'
                    }`}
                  >
                    {asset.status === 'active' ? 'Active' : 'Suspended'}
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 grid grid-cols-1 gap-6">
                {/* Details */}
                <div className="space-y-4">
                  {/* API Key */}
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-semibold">API Key</label>
                    {editingId === asset.id ? (
                      <div className="mt-1 relative">
                        <input
                          type="text"
                          value={editForm.apiKey || ''}
                          onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
                          className="w-full bg-[#0a0a0a] border border-[#333] text-white text-sm px-3 py-2 rounded-md focus:border-indigo-500 focus:outline-none font-mono pr-20"
                        />
                      </div>
                    ) : (
                      <div className="mt-1 flex items-center gap-2 bg-[#1a1a1a] border border-[#333] px-3 py-2 rounded-md">
                        <span className="text-gray-400 font-mono text-sm flex-1 truncate">
                          {asset.apiKey.substring(0, 12)}...{asset.apiKey.substring(asset.apiKey.length - 4)}
                        </span>
                        <button
                          onClick={() => handleCopy(asset.id, asset.apiKey)}
                          className="text-gray-500 hover:text-white transition-colors p-1"
                          title="Copy API key"
                        >
                          {copiedId === asset.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Available Models */}
                  {asset.models && asset.models.length > 0 && (
                    <div>
                      <label className="text-xs text-gray-500 uppercase font-semibold">Available Models</label>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {asset.models.map((model) => {
                          const validation = model.validation;
                          const isValidated = validation !== undefined;
                          const isValid = validation?.success;

                          return (
                            <span
                              key={model.id}
                              className={`text-xs px-2.5 py-1 rounded-md border flex items-center gap-1.5 ${
                                !isValidated
                                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                  : isValid
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                              }`}
                              title={isValidated ? (isValid ? `✓ Valid (${validation?.latencyMs}ms)` : `✗ ${validation?.error}`) : 'Not tested yet'}
                            >
                              <Zap className="w-3 h-3" />
                              {model.displayName}
                              {isValidated && (
                                <span className="ml-0.5">
                                  {isValid ? (
                                    <Check className="w-3 h-3" />
                                  ) : (
                                    <X className="w-3 h-3" />
                                  )}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                      {asset.models.some((m) => m.validation) && (
                        <div className="mt-1.5 text-xs text-gray-500">
                          Last validated: {new Date(Math.max(...asset.models.filter((m) => m.validation).map((m) => m.validation!.validatedAt))).toLocaleString()}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#151515] rounded-lg p-3 border border-[#262626]">
                      <div className="text-xs text-gray-500 mb-1">Created</div>
                      <div className="text-sm text-gray-300">{formatDate(asset.createdAt)}</div>
                    </div>
                    <div className="bg-[#151515] rounded-lg p-3 border border-[#262626]">
                      <div className="text-xs text-gray-500 mb-1">Updated</div>
                      <div className="text-sm text-gray-300">{formatDate(asset.updatedAt)}</div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleQuickTest(asset)}
                      disabled={asset.status !== 'active'}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:bg-emerald-500/5 disabled:cursor-not-allowed text-emerald-500 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      Quick Test
                    </button>
                    <button
                      onClick={() => handleDuplicate(asset.id)}
                      disabled={isDuplicating === asset.id}
                      className="flex-1 flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:bg-indigo-500/5 disabled:cursor-not-allowed text-indigo-500 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      {isDuplicating === asset.id ? 'Duplicating...' : 'Duplicate'}
                    </button>
                    <button
                      onClick={() => handleDelete(asset.id)}
                      className="flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wizard Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-[#262626] bg-[#111]">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white">Add New Asset</h3>
                <button
                  onClick={() => setIsCreating(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Progress Steps */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    wizardStep >= 1 ? 'bg-indigo-500 text-white' : 'bg-[#262626] text-gray-500'
                  }`}>1</div>
                  <span className={`text-sm ${wizardStep >= 1 ? 'text-white' : 'text-gray-500'}`}>Vendor</span>
                </div>
                <div className="flex-1 h-px bg-[#262626] mx-2" />
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    wizardStep >= 2 ? 'bg-indigo-500 text-white' : 'bg-[#262626] text-gray-500'
                  }`}>2</div>
                  <span className={`text-sm ${wizardStep >= 2 ? 'text-white' : 'text-gray-500'}`}>Account</span>
                </div>
                <div className="flex-1 h-px bg-[#262626] mx-2" />
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    wizardStep >= 3 ? 'bg-indigo-500 text-white' : 'bg-[#262626] text-gray-500'
                  }`}>3</div>
                  <span className={`text-sm ${wizardStep >= 3 ? 'text-white' : 'text-gray-500'}`}>Models</span>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <h4 className="text-white font-medium">Select Vendor</h4>
                  <p className="text-gray-400 text-sm">Choose the API vendor for this asset</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {vendors.map((vendor) => (
                      <button
                        key={vendor.id}
                        onClick={() => handleVendorSelect(vendor)}
                        className={`p-4 rounded-lg border text-left transition-all ${
                          wizardForm.vendorId === vendor.id
                            ? 'bg-indigo-500/10 border-indigo-500'
                            : 'bg-[#1a1a1a] border-[#333] hover:border-[#404040]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {vendor.iconUrl && (
                            <img src={vendor.iconUrl} alt={vendor.displayName} className="w-8 h-8 rounded" />
                          )}
                          <div>
                            <div className="text-white font-medium">{vendor.displayName}</div>
                            <div className="text-xs text-gray-500">{vendor.name}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <h4 className="text-white font-medium">Configure Account</h4>
                  <p className="text-gray-400 text-sm">
                    Vendor: <span className="text-white font-medium">{wizardForm.vendorDisplayName}</span>
                  </p>
                  <div>
                    <label className="text-sm text-gray-400">Asset Name</label>
                    <input
                      type="text"
                      value={wizardForm.name}
                      onChange={(e) => setWizardForm({ ...wizardForm, name: e.target.value })}
                      placeholder="My OpenAI Account"
                      className="mt-1 w-full bg-[#1a1a1a] border border-[#333] text-white px-3 py-2 rounded-md focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">API Key</label>
                    <input
                      type="password"
                      value={wizardForm.apiKey}
                      onChange={(e) => setWizardForm({ ...wizardForm, apiKey: e.target.value })}
                      placeholder="sk-..."
                      className="mt-1 w-full bg-[#1a1a1a] border border-[#333] text-white px-3 py-2 rounded-md focus:border-indigo-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <h4 className="text-white font-medium">Select Available Models</h4>
                  <p className="text-gray-400 text-sm">Choose which models this asset can access</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {vendorModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => handleModelToggle(model.modelId)}
                        className={`w-full p-3 rounded-lg border text-left transition-all ${
                          wizardForm.modelIds.includes(model.modelId)
                            ? 'bg-indigo-500/10 border-indigo-500'
                            : 'bg-[#1a1a1a] border-[#333] hover:border-[#404040]'
                        }`}
                      >
                        <div className="text-white font-medium">{model.displayName}</div>
                        {model.description && (
                          <div className="text-xs text-gray-500 mt-0.5">{model.description}</div>
                        )}
                      </button>
                    ))}
                  </div>
                  {wizardForm.modelIds.length > 0 && (
                    <div className="text-sm text-gray-400">
                      Selected: <span className="text-white font-medium">{wizardForm.modelIds.length} models</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#262626] bg-[#111] flex items-center justify-between">
              <button
                onClick={handleWizardBack}
                disabled={wizardStep === 1}
                className="flex items-center gap-2 text-gray-400 hover:text-white disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsCreating(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                {wizardStep < 3 ? (
                  <button
                    onClick={handleWizardNext}
                    disabled={
                      (wizardStep === 1 && !wizardForm.vendorId) ||
                      (wizardStep === 2 && (!wizardForm.name || !wizardForm.apiKey))
                    }
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleWizardSubmit}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Create Asset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validation Results Modal */}
      {validationResults && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-[#262626] bg-[#111]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white">Model Validation Results</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Tested {validationResults.length} model{validationResults.length > 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  onClick={() => setValidationResults(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {validationResults.map((result) => (
                  <div
                    key={result.modelId}
                    className={`p-4 rounded-lg border ${
                      result.success
                        ? 'bg-emerald-500/5 border-emerald-500/20'
                        : 'bg-red-500/5 border-red-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Status icon and model name */}
                        <div className="flex items-center gap-2 mb-2">
                          {result.success ? (
                            <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <X className="w-5 h-5 text-red-400 flex-shrink-0" />
                          )}
                          <span className="text-white font-medium">{result.displayName}</span>
                        </div>

                        {/* Response or error */}
                        {result.success ? (
                          <div className="text-sm text-gray-400">
                            Response: <span className="text-emerald-400">"{result.response}"</span>
                          </div>
                        ) : (
                          <div className="text-sm text-red-400">
                            Error: {result.error}
                          </div>
                        )}

                        {/* Latency */}
                        {result.latencyMs !== undefined && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{result.latencyMs}ms</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="mt-6 pt-6 border-t border-[#262626]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">
                        {validationResults.filter((r) => r.success).length} passed
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <X className="w-4 h-4 text-red-400" />
                      <span className="text-red-400 font-medium">
                        {validationResults.filter((r) => !r.success).length} failed
                      </span>
                    </div>
                    {validationResults.filter((r) => r.success).length > 0 && (
                      <div className="text-gray-500">
                        Avg: {Math.round(validationResults.filter((r) => r.success).reduce((sum, r) => sum + (r.latencyMs || 0), 0) / validationResults.filter((r) => r.success).length)}ms
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setValidationResults(null)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {validatingAssetId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-6 flex items-center gap-4">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
            <div>
              <div className="text-white font-medium">Validating Models...</div>
              <div className="text-sm text-gray-400 mt-1">This may take a moment</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
