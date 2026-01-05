import { create } from 'zustand';
import type { Asset } from '@shared/types';
import * as ApiClient from '@client/services/apiClient';

// Re-export types for convenience
export type { Asset, Vendor, VendorModel } from '@shared/types';

// ============================================
// State Interface
// ============================================

interface AssetsState {
  // Data state
  assets: Asset[];
  loading: boolean;
  error: string | null;

  // Sync actions
  setAssets: (assets: Asset[]) => void;
  setError: (error: string | null) => void;
  addAsset: (asset: Asset) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;
  removeAsset: (id: string) => void;

  // Async actions
  fetchAssets: () => Promise<void>;
  createAsset: (data: {
    name: string;
    vendorId: string;
    apiKey: string;
    budget?: number;
    balance?: number;
    validFrom?: Date;
    validUntil?: Date;
    modelIds?: string[];
  }) => Promise<Asset | null>;
  updateAssetData: (id: string, data: {
    name?: string;
    apiKey?: string;
    budget?: number;
    balance?: number;
    status?: 'active' | 'exhausted' | 'suspended';
    validFrom?: Date;
    validUntil?: Date;
    modelIds?: string[];
  }) => Promise<boolean>;
  updateAssetStatus: (id: string, status: 'active' | 'exhausted' | 'suspended') => Promise<boolean>;
  duplicateAsset: (id: string) => Promise<Asset | null>;
  deleteAsset: (id: string) => Promise<boolean>;
}

// ============================================
// Store Creation
// ============================================

export const useAssetsStore = create<AssetsState>((set, _get) => ({
  // Initial state
  assets: [],
  loading: false,
  error: null,

  // Sync actions
  setAssets: (assets) => set({ assets, error: null }),

  setError: (error) => set({ error }),

  addAsset: (asset) => set((state) => ({ assets: [...state.assets, asset] })),

  updateAsset: (id, updates) =>
    set((state) => ({
      assets: state.assets.map((asset) => (asset.id === id ? { ...asset, ...updates } : asset)),
    })),

  removeAsset: (id) =>
    set((state) => ({
      assets: state.assets.filter((asset) => asset.id !== id),
    })),

  // Async actions
  fetchAssets: async () => {
    set({ loading: true, error: null });
    const result = await ApiClient.fetchAssets();
    if (result.success && result.data!) {
      set({ assets: result.data!, loading: false });
    } else {
      set({ error: result.error || 'Failed to fetch assets', loading: false });
    }
  },

  createAsset: async (data) => {
    set({ loading: true, error: null });
    const result = await ApiClient.createAsset(data);
    if (result.success && result.data!) {
      set((state) => ({ assets: [...state.assets, result.data!], loading: false }));
      return result.data!;
    } else {
      set({ error: result.error || 'Failed to create asset', loading: false });
      return null;
    }
  },

  updateAssetData: async (id, data) => {
    set({ loading: true, error: null });
    const { budget, balance, ...cleanData } = data as any;
    const result = await ApiClient.updateAsset(id, cleanData);
    if (result.success && result.data!) {
      set((state) => ({
        assets: state.assets.map((asset) => (asset.id === id ? result.data! : asset)),
        loading: false,
      }));
      return true;
    } else {
      set({ error: result.error || 'Failed to update asset', loading: false });
      return false;
    }
  },

  updateAssetStatus: async (id, status) => {
    set({ loading: true, error: null });
    // Map 'exhausted' to 'suspended' for API compatibility
    const apiStatus = status === 'exhausted' ? 'suspended' : status;
    const result = await ApiClient.updateAssetStatus(id, apiStatus as any);
    if (result.success && result.data!) {
      set((state) => ({
        assets: state.assets.map((asset) => (asset.id === id ? result.data! : asset)),
        loading: false,
      }));
      return true;
    } else {
      set({ error: result.error || 'Failed to update asset status', loading: false });
      return false;
    }
  },

  duplicateAsset: async (id) => {
    set({ loading: true, error: null });
    const result = await ApiClient.duplicateAsset(id);
    if (result.success && result.data!) {
      set((state) => ({ assets: [...state.assets, result.data!], loading: false }));
      return result.data!;
    } else {
      set({ error: result.error || 'Failed to duplicate asset', loading: false });
      return null;
    }
  },

  deleteAsset: async (id) => {
    set({ loading: true, error: null });
    const result = await ApiClient.deleteAsset(id);
    if (result.success) {
      set((state) => ({
        assets: state.assets.filter((asset) => asset.id !== id),
        loading: false,
      }));
      return true;
    } else {
      set({ error: result.error || 'Failed to delete asset', loading: false });
      return false;
    }
  },
}));

// ============================================
// Selector Hooks
// ============================================

// Actions selector - use shallow comparison since actions are stable
export const useAssetsActions = () =>
  useAssetsStore(
    (state) => ({
      fetchAssets: state.fetchAssets,
      createAsset: state.createAsset,
      updateAssetData: state.updateAssetData,
      updateAssetStatus: state.updateAssetStatus,
      duplicateAsset: state.duplicateAsset,
      deleteAsset: state.deleteAsset,
    })
  );

// Individual value selectors
export const useAssets = () => useAssetsStore((state) => state.assets);
export const useAssetsLoading = () => useAssetsStore((state) => state.loading);
export const useAssetsError = () => useAssetsStore((state) => state.error);
