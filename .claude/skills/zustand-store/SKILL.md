---
name: zustand-store
description: >
  Extend Zustand store with new state, actions, and selector hooks following minimal re-render patterns.
  Use when: adding app state, creating async actions, or when user mentions "state", "store", "global state", "useAppStore", "actions".
  Generates: state slices, async actions, and selector hooks with TypeScript types.
allowed-tools: [Read, Write, Edit, Grep]
---

# Zustand Store Skill

Extend global state management with Zustand.

## Quick Start

```typescript
// 1. Add to interface in src/client/stores/appStore.ts
interface AppState {
  myNewState: string;
  setMyNewState: (value: string) => void;
}

// 2. Add to initial state
myNewState: '',

// 3. Add implementation
setMyNewState: (value) => set({ myNewState: value }),
```

## Templates

See [templates/](templates/) directory:

| Template                    | Description               |
| --------------------------- | ------------------------- |
| `state-slice.ts.template`   | New state and setter      |
| `async-action.ts.template`  | Async action with loading |
| `form-state.ts.template`    | Form state management     |
| `selector-hook.ts.template` | Selector hook             |

## Component Usage

```typescript
// ✅ Good - Precise selector
const view = useView();

// ✅ Good - Action selector (stable reference)
const createFish = useCreateFish();

// ❌ Bad - Entire state
const state = useAppStore();
```

## Best Practices

1. Use precise selectors - Only subscribe to needed state
2. Create action selectors - Stable function references
3. Destructure multi-values - Use shallow comparison
4. Reset state in tests - Use `setState` in beforeEach

## Additional Resources

- [references/store-structure.md](references/store-structure.md) - Store architecture
- [references/testing-store.md](references/testing-store.md) - Testing patterns
