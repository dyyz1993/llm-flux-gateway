import { create } from 'zustand';
import { ApiKey } from '@shared/types';
import * as ApiClient from '@client/services/apiClient';

// ============================================
// State Interface
// ============================================

interface KeysState {
  // Data state
  keys: ApiKey[];
  loading: boolean;
  error: string | null;

  // Sync actions
  setKeys: (keys: ApiKey[]) => void;
  setError: (error: string | null) => void;
  addKey: (key: ApiKey) => void;
  updateKey: (id: string, updates: Partial<ApiKey>) => void;
  removeKey: (id: string) => void;

  // Async actions
  fetchKeys: () => Promise<void>;
  createKey: (name: string, routeIds?: string[]) => Promise<ApiKey | null>;
  updateKeyStatus: (id: string, status: 'active' | 'revoked') => Promise<boolean>;
  updateKeyRoutes: (id: string, routeIds: string[]) => Promise<boolean>;
  deleteKey: (id: string) => Promise<boolean>;
}

// ============================================
// Store Creation
// ============================================

export const useKeysStore = create<KeysState>((set, _get) => ({
  // Initial state
  keys: [],
  loading: false,
  error: null,

  // Sync actions
  setKeys: (keys) => set({ keys, error: null }),

  setError: (error) => set({ error }),

  addKey: (key) => set((state) => ({ keys: [...state.keys, key] })),

  updateKey: (id, updates) =>
    set((state) => ({
      keys: state.keys.map((key) => (key.id === id ? { ...key, ...updates } : key)),
    })),

  removeKey: (id) =>
    set((state) => ({
      keys: state.keys.filter((key) => key.id !== id),
    })),

  // Async actions
  fetchKeys: async () => {
    set({ loading: true, error: null });
    const result = await ApiClient.fetchKeys();
    if (result.success && result.data!) {
      set({ keys: result.data!, loading: false });
    } else {
      set({ error: result.error || 'Failed to fetch keys', loading: false });
    }
  },

  createKey: async (name, routeIds) => {
    set({ loading: true, error: null });
    const result = await ApiClient.createKey(name, routeIds);
    if (result.success && result.data!) {
      set((state) => ({ keys: [...state.keys, result.data!], loading: false }));
      return result.data!;
    } else {
      set({ error: result.error || 'Failed to create key', loading: false });
      return null;
    }
  },

  updateKeyStatus: async (id, status) => {
    set({ loading: true, error: null });
    const result = await ApiClient.updateKey(id, { status });
    if (result.success && result.data!) {
      set((state) => ({
        keys: state.keys.map((key) => (key.id === id ? result.data! : key)),
        loading: false,
      }));
      return true;
    } else {
      set({ error: result.error || 'Failed to update key', loading: false });
      return false;
    }
  },

  updateKeyRoutes: async (id, routeIds) => {
    set({ loading: true, error: null });
    const result = await ApiClient.updateKey(id, { routeIds });
    if (result.success && result.data!) {
      set((state) => ({
        keys: state.keys.map((key) => (key.id === id ? result.data! : key)),
        loading: false,
      }));
      return true;
    } else {
      set({ error: result.error || 'Failed to update key routes', loading: false });
      return false;
    }
  },

  deleteKey: async (id) => {
    set({ loading: true, error: null });
    const result = await ApiClient.deleteKey(id);
    if (result.success) {
      set((state) => ({
        keys: state.keys.filter((key) => key.id !== id),
        loading: false,
      }));
      return true;
    } else {
      set({ error: result.error || 'Failed to delete key', loading: false });
      return false;
    }
  },
}));

// ============================================
// Selector Hooks
// ============================================

// Actions selector - use shallow comparison since actions are stable
export const useKeysActions = () =>
  useKeysStore(
    (state) => ({
      fetchKeys: state.fetchKeys,
      createKey: state.createKey,
      updateKeyStatus: state.updateKeyStatus,
      updateKeyRoutes: state.updateKeyRoutes,
      deleteKey: state.deleteKey,
    })
  );

// Individual value selectors
export const useKeys = () => useKeysStore((state) => state.keys);
export const useKeysLoading = () => useKeysStore((state) => state.loading);
export const useKeysError = () => useKeysStore((state) => state.error);
