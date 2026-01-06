import { create } from 'zustand';
import type { RouteConfig } from '@shared/types';
import * as ApiClient from '@client/services/apiClient';

// Re-export types for convenience
export type { RouteConfig, Asset } from '@shared/types';

// ============================================
// State Interface
// ============================================

interface RoutesState {
  // Data state
  routes: RouteConfig[];
  loading: boolean;
  error: string | null;

  // Sync actions
  setRoutes: (routes: RouteConfig[]) => void;
  setError: (error: string | null) => void;
  addRoute: (route: RouteConfig) => void;
  updateRoute: (id: string, updates: Partial<RouteConfig>) => void;
  removeRoute: (id: string) => void;

  // Async actions
  fetchRoutes: () => Promise<void>;
  createRoute: (data: {
    name: string;
    assetId: string;
    overrides?: any[];
    configType?: 'yaml' | 'json';
    priority?: number;
  }) => Promise<RouteConfig | null>;
  updateRouteData: (id: string, data: {
    name?: string;
    assetId?: string;
    isActive?: boolean;
    overrides?: any[];
    configType?: 'yaml' | 'json';
    priority?: number;
  }) => Promise<boolean>;
  toggleRouteActive: (id: string) => Promise<boolean>;
  deleteRoute: (id: string) => Promise<boolean>;
}

// ============================================
// Store Creation
// ============================================

export const useRoutesStore = create<RoutesState>((set, get) => ({
  // Initial state
  routes: [],
  loading: false,
  error: null,

  // Sync actions
  setRoutes: (routes) => set({ routes, error: null }),

  setError: (error) => set({ error }),

  addRoute: (route) => set((state) => ({ routes: [...state.routes, route] })),

  updateRoute: (id, updates) =>
    set((state) => ({
      routes: state.routes.map((route) => (route.id === id ? { ...route, ...updates } : route)),
    })),

  removeRoute: (id) =>
    set((state) => ({
      routes: state.routes.filter((route) => route.id !== id),
    })),

  // Async actions
  fetchRoutes: async () => {
    set({ loading: true, error: null });
    const result = await ApiClient.fetchRoutes();
    if (result.success && result.data!) {
      set({ routes: result.data!, loading: false });
    } else {
      set({ error: result.error || 'Failed to fetch routes', loading: false });
    }
  },

  createRoute: async (data) => {
    set({ loading: true, error: null });
    const result = await ApiClient.createRoute(data);
    if (result.success && result.data!) {
      set((state) => ({ routes: [...state.routes, result.data!], loading: false }));
      return result.data!;
    } else {
      set({ error: result.error || 'Failed to create route', loading: false });
      return null;
    }
  },

  updateRouteData: async (id, data) => {
    set({ loading: true, error: null });
    const result = await ApiClient.updateRoute(id, data);
    if (result.success && result.data!) {
      set((state) => ({
        routes: state.routes.map((route) => (route.id === id ? result.data! : route)),
        loading: false,
      }));
      return true;
    } else {
      set({ error: result.error || 'Failed to update route', loading: false });
      return false;
    }
  },

  toggleRouteActive: async (id) => {
    const route = get().routes.find((r) => r.id === id);
    if (!route) return false;

    const result = await ApiClient.updateRoute(id, { isActive: !route.isActive });
    if (result.success && result.data!) {
      set((state) => ({
        routes: state.routes.map((r) => (r.id === id ? result.data! : r)),
      }));
      return true;
    } else {
      set({ error: result.error || 'Failed to toggle route' });
      return false;
    }
  },

  deleteRoute: async (id) => {
    set({ loading: true, error: null });
    const result = await ApiClient.deleteRoute(id);
    if (result.success) {
      set((state) => ({
        routes: state.routes.filter((route) => route.id !== id),
        loading: false,
      }));
      return true;
    } else {
      set({ error: result.error || 'Failed to delete route', loading: false });
      return false;
    }
  },
}));

// ============================================
// Selector Hooks
// ============================================

// Actions selector - use shallow comparison since actions are stable
export const useRoutesActions = () =>
  useRoutesStore(
    (state) => ({
      fetchRoutes: state.fetchRoutes,
      createRoute: state.createRoute,
      updateRouteData: state.updateRouteData,
      toggleRouteActive: state.toggleRouteActive,
      deleteRoute: state.deleteRoute,
    })
  );

// Individual value selectors
export const useRoutes = () => useRoutesStore((state) => state.routes);
export const useRoutesLoading = () => useRoutesStore((state) => state.loading);
export const useRoutesError = () => useRoutesStore((state) => state.error);
