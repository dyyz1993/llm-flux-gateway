# State Management with Zustand

## Overview

This reference describes state management patterns using Zustand store.

## Store Location

```
src/client/stores/appStore.ts
```

## Store Structure

### Basic Store

```typescript
import { create } from 'zustand';
import type { StateCreator } from 'zustand';

interface AppState {
  // State
  view: AppView;
  currentUser: UserProfile | null;

  // Actions
  setView: (view: AppView) => void;
  setCurrentUser: (user: UserProfile | null) => void;
}

const createAppStore: StateCreator<AppState> = (set) => ({
  view: 'home',
  currentUser: null,

  setView: (view) => set({ view }),
  setCurrentUser: (user) => set({ currentUser: user }),
});

export const useAppStore = create<AppState>(createAppStore);
```

## Selector Hooks

### Slice Selectors

```typescript
// Create specific selector hooks for minimal re-renders
export const useView = () => useAppStore((state) => state.view);
export const useCurrentUser = () => useAppStore((state) => state.currentUser);
```

### Action Selectors

```typescript
// Action selectors have stable function references
export const useViewActions = () =>
  useAppStore((state) => ({
    setView: state.setView,
  }));

export const useCreationActions = () =>
  useAppStore((state) => ({
    setPrompt: state.setPrompt,
    setStyle: state.setStyle,
    generateConcept: state.generateConcept,
  }));
```

### Multiple Value Selectors

```typescript
// Shallow comparison for multiple values
export const useCreationState = () =>
  useAppStore((state) => ({
    prompt: state.prompt,
    style: state.style,
    isLoading: state.isLoading,
  }));
```

## Usage Patterns

### ✅ Good: Specific Selectors

```typescript
// Only re-renders when view changes
const view = useView();

// Shallow comparison - only re-renders if prompt or style changes
const { prompt, style } = useCreationState();

// Stable function reference
const { setPrompt } = useCreationActions();
```

### ❌ Bad: Full Store Subscription

```typescript
// Re-renders on ANY state change
const state = useAppStore();
const { view, prompt } = state; // ❌ Don't do this
```

## Async Actions

### Async Action Pattern

```typescript
interface AppState {
  // State
  isLoading: boolean;
  error: string | null;

  // Async Action
  fetchData: (id: string) => Promise<void>;
}

const createAppStore: StateCreator<AppState> = (set, get) => ({
  isLoading: false,
  error: null,

  fetchData: async (id) => {
    set({ isLoading: true, error: null });

    try {
      const data = await api.fetchData(id);
      set({ data, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },
});
```

## Store Slices

### Organizing Large Stores

```typescript
// slices/userSlice.ts
export interface UserSlice {
  currentUser: UserProfile | null;
  setCurrentUser: (user: UserProfile | null) => void;
}

export const createUserSlice: StateCreator<AppState, [], [], UserSlice> = (set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
});

// slices/creationSlice.ts
export interface CreationSlice {
  prompt: string;
  style: FishStyle;
  setPrompt: (prompt: string) => void;
  setStyle: (style: FishStyle) => void;
}

export const createCreationSlice: StateCreator<AppState, [], [], CreationSlice> = (set) => ({
  prompt: '',
  style: 'realistic',

  setPrompt: (prompt) => set({ prompt }),
  setStyle: (style) => set({ style }),
});

// Combine slices
export const useAppStore = create<AppState>()(
  devtools((...args) => ({
    ...createUserSlice(...args),
    ...createCreationSlice(...args),
  }))
);
```

## Testing Patterns

### Mock Store in Tests

```typescript
import { renderHook } from '@testing-library/react';
import { useAppStore } from '@client/stores/appStore';

describe('MyComponent', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.getState().reset();
  });

  it('should update state', () => {
    const { result } = renderHook(() => useAppStore());

    // Act
    act(() => {
      result.current.setView('dashboard');
    });

    // Assert
    expect(result.current.view).toBe('dashboard');
  });
});
```

### Testing with Specific State

```typescript
it('should display user info', () => {
  // Set initial state
  useAppStore.setState({
    currentUser: { id: '1', name: 'Test User' },
  });

  const { result } = renderHook(() => useCurrentUser());

  expect(result.current).toEqual({ id: '1', name: 'Test User' });
});
```

## DevTools Integration

```typescript
import { devtools } from 'zustand/middleware';

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // Store implementation
    }),
    { name: 'AppStore' } // Store name in DevTools
  )
);
```

## Persist Middleware

```typescript
import { persist } from 'zustand/middleware';

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Store implementation
    }),
    {
      name: 'app-storage', // localStorage key
      partialize: (state) => ({
        // Only persist these fields
        userPreferences: state.userPreferences,
      }),
    }
  )
);
```

## Best Practices

1. **Use specific selectors**: Minimize re-renders by selecting only needed state
2. **Create action selectors**: Provide stable function references for callbacks
3. **Shallow comparison**: Use objects for multiple related values
4. **Test store state**: Reset store in beforeEach, use setState for setup
5. **DevTools integration**: Use devtools middleware for debugging
6. **Persist wisely**: Only persist necessary fields

## See Also

- [hooks-patterns.md](hooks-patterns.md) - React hooks patterns
- [../SKILL.md](../SKILL.md) - React component skill
- [../../rules/zustand-rules.md](../../rules/zustand-rules.md) - Zustand rules
