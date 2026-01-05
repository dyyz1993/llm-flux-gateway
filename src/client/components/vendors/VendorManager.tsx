import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, Upload, CheckCircle, XCircle, Server, Zap, FileEdit, X, Save } from 'lucide-react';
import type { Vendor } from '@shared/types';
import { CodeEditor } from '@client/components/shared/CodeEditor';

// Simplified YAML generator
const generateYaml = (vendors: Vendor[]): string => {
  let yaml = `# ============================================
# LLM Flux Gateway - Vendor Configuration
# ============================================
# Simplified YAML format for LLM vendors and their models.
# Changes to this file can be synced to the database via the API.
#
# Format:
#   - name: Vendor Display Name
#     baseUrl: https://api.example.com/v1
#     endpoint: /chat/completions  # API endpoint path (default: /chat/completions)
#     iconUrl: /icons/vendor.svg
#     models:
#       - model-id-1
#       - model-id-2
#
# Note: id, displayName, and status are auto-generated

vendors:
`;

  for (const vendor of vendors) {
    yaml += `  - name: ${vendor.displayName || vendor.name}
    baseUrl: ${vendor.baseUrl}
    endpoint: ${vendor.endpoint}
`;
    if (vendor.iconUrl) {
      yaml += `    iconUrl: ${vendor.iconUrl}
`;
    }
    if (vendor.models && vendor.models.length > 0) {
      yaml += `    models:
`;
      for (const model of vendor.models) {
        yaml += `      - ${model.modelId}
`;
      }
    }
    yaml += `\n`;
  }

  return yaml;
};

export const VendorManager: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; deleted: number; models: number } | null>(null as any);
  const [error, setError] = useState<string | null>(null as any);

  // YAML Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [yamlContent, setYamlContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!showEditor) return undefined;

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [showEditor]);

  // Fetch vendors on mount
  const fetchVendors = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vendors');
      const data = await res.json();
      if (data.success) {
        setVendors(data.data!);
      } else {
        setError(data.error || 'Failed to fetch vendors');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  // Load YAML content
  const loadYaml = async () => {
    try {
      const res = await fetch('/api/vendors/yaml');
      const data = await res.json();
      if (data.success) {
        setYamlContent(data.data!.content);
        setShowEditor(true);
      } else {
        setError(data.error || 'Failed to load YAML');
      }
    } catch (err) {
      setError('Failed to load YAML file');
    }
  };

  // Save YAML content
  const saveYaml = async () => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/vendors/yaml', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: yamlContent }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(data.error || 'Failed to save YAML');
      }
    } catch (err) {
      setError('Failed to save YAML file');
    } finally {
      setSaving(false);
    }
  };

  // Sync vendors from YAML
  const syncFromYaml = async () => {
    setSyncing(true);
    setError(null);
    setSyncResult(null);
    try {
      const res = await fetch('/api/vendors/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncResult(data.data!);
        await fetchVendors(); // Refresh vendor list
      } else {
        setError(data.error || 'Failed to sync vendors');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setSyncing(false);
    }
  };

  // Download YAML
  const downloadYaml = () => {
    const yaml = generateYaml(vendors);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vendors.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Vendor Management</h2>
          <p className="text-gray-400 text-sm mt-1">Manage LLM provider configurations and supported models</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchVendors}
            disabled={loading}
            className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#262626] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-[#333]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={downloadYaml}
            className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#262626] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-[#333]"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={loadYaml}
            className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#262626] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-[#333]"
          >
            <FileEdit className="w-4 h-4" />
            Edit YAML
          </button>
          <button
            onClick={syncFromYaml}
            disabled={syncing}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Upload className={`w-4 h-4 ${syncing ? 'animate-bounce' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync from YAML'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {syncResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Sync completed: {syncResult.created} created, {syncResult.updated} updated, {syncResult.models} models
        </div>
      )}

      {/* YAML Editor Modal */}
      {showEditor && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowEditor(false)}
        >
          <div
            className="bg-[#0a0a0a] border border-[#262626] rounded-xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#262626] flex-shrink-0">
              <div className="flex items-center gap-3">
                <FileEdit className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-white font-medium">Edit vendors.yaml</h3>
                  <p className="text-xs text-gray-500">config/vendors.yaml</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="text-emerald-400 text-sm flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    Saved!
                  </span>
                )}
                <button
                  onClick={() => setShowEditor(false)}
                  className="p-2 hover:bg-[#262626] rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Editor */}
            <div className="flex-1 min-h-0">
              <CodeEditor
                value={yamlContent}
                onChange={setYamlContent}
                language="yaml"
                placeholder="# YAML content..."
              />
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-[#262626] flex-shrink-0">
              <div className="text-xs text-gray-500">
                Changes will be saved to <code className="bg-[#1a1a1a] px-1.5 py-0.5 rounded">config/vendors.yaml</code>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEditor(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveYaml}
                  disabled={saving}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-lg">
            <Server className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-medium">About Vendor Configuration</h3>
            <p className="text-gray-400 text-sm mt-1">
              Click <strong>Edit YAML</strong> to edit vendors configuration online with syntax highlighting. Supports YAML, JSON, and JSONL formats.
            </p>
          </div>
        </div>
      </div>

      {/* Vendors List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading vendors...</div>
        </div>
      ) : vendors.length === 0 ? (
        <div className="bg-[#0a0a0a] border border-[#262626] rounded-xl p-12 text-center">
          <Server className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No vendors configured</h3>
          <p className="text-gray-500 text-sm">Sync from YAML to load vendor configurations</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {vendors.map((vendor) => (
            <div key={vendor.id} className="bg-[#0a0a0a] border border-[#262626] rounded-xl overflow-hidden hover:border-[#404040] transition-colors">
              {/* Header */}
              <div className="p-4 flex items-center justify-between border-b border-[#262626] bg-[#111]">
                <div className="flex items-center gap-3">
                  <h3 className="text-white font-medium">{vendor.displayName}</h3>
                  <span className="text-xs text-gray-500 bg-[#1a1a1a] px-2 py-1 rounded">{vendor.id}</span>
                </div>
                <div className="text-xs text-gray-500">{vendor.models?.length || 0} models</div>
              </div>

              {/* Body */}
              <div className="p-4">
                {/* Vendor Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-semibold">Base URL</label>
                    <div className="mt-1 bg-[#1a1a1a] border border-[#333] px-3 py-2 rounded-md">
                      <span className="text-gray-400 font-mono text-sm">{vendor.baseUrl}</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 uppercase font-semibold">Endpoint</label>
                    <div className="mt-1 bg-[#1a1a1a] border border-[#333] px-3 py-2 rounded-md">
                      <span className="text-gray-400 font-mono text-sm">{vendor.endpoint}</span>
                    </div>
                  </div>
                </div>

                {/* Models */}
                <div>
                  <label className="text-xs text-gray-500 uppercase font-semibold">Supported Models</label>
                  {vendor.models && vendor.models.length > 0 ? (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                      {vendor.models.map((model) => (
                        <div key={model.id} className="flex items-center justify-between text-xs bg-[#151515] px-3 py-2 rounded border border-[#262626]">
                          <div className="flex items-center gap-2">
                            <Zap className="w-3 h-3 text-yellow-400" />
                            <span className="text-white font-medium">{model.displayName}</span>
                          </div>
                          <span className="text-gray-500 font-mono">{model.modelId}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-gray-600 text-sm italic">No models configured</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
