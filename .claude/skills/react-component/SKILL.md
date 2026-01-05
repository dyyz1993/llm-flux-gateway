---
name: react-component
description: >
  Create React components following project conventions.
  Use when: Creating new UI components or pages.
  Generates: Component with TypeScript, hooks usage, and proper imports.
allowed-tools: [Read, Write, Edit, Glob, Grep]
---

# React Component Skill

Create React components with proper patterns.

## Export Convention

**Always use named exports for components.** This enables:
- Better tree-shaking
- Clearer component names in React DevTools
- Easier refactoring (no default export confusion)
- Consistent auto-import behavior

```typescript
// ✅ Good - Named export
export const MyComponent = () => {
  return <div>...</div>;
};

// ❌ Bad - Default export
export default function MyComponent() {
  return <div>...</div>;
}

// ❌ Bad - Anonymous default export
export default () => {
  return <div>...</div>;
};
```

## Quick Start

```bash
# Component location
mkdir -p src/client/components

# Use path aliases with named imports
import { MyComponent } from '@client/components/MyComponent';
import { useAppStore } from '@client/stores/appStore';
import { PondFish } from '@client/classes/PondFish';
```

## Templates

All templates use **named exports** (not default exports):

| Template | Description | Export Pattern |
|----------|-------------|----------------|
| `functional.tsx.template` | Basic functional component | `export const MyComponent: React.FC<...>` |
| `canvas.tsx.template` | Canvas rendering component | `export const CanvasComponent: React.FC<...>` |
| `form.tsx.template` | Form component with state | `export const FormComponent: React.FC<...>` |

**Import pattern** (consistent across all templates):
```typescript
// ✅ Correct - Named import
import { MyComponent } from '@client/components/MyComponent';
```

See [templates/](templates/) directory for full examples.

## Import Aliases

Always use path aliases:

```typescript
// ✅ Good
import { FishEntity } from '@shared/types';
import { PondFish } from '@client/classes/PondFish';

// ❌ Bad
import { FishEntity } from '../../../shared/types';
```

## Component Structure

All components should follow this pattern:

```typescript
import { useState } from 'react';

/**
 * Component description
 * @param prop - Description of prop
 */
export const ComponentName = ({ prop }: ComponentProps) => {
  // 1. Hooks (useState, useEffect, custom hooks)
  const [state, setState] = useState(initialValue);

  // 2. Derived values
  const derived = computeValue(state);

  // 3. Event handlers
  const handleClick = () => {
    // Handle event
  };

  // 4. Effects (useEffect, useLayoutEffect)
  useEffect(() => {
    // Side effect
  }, [dependencies]);

  // 5. Render
  return (
    <div>
      {/* JSX */}
    </div>
  );
};

// Props interface
interface ComponentProps {
  prop: string;
}
```

## State Management

Use precise selectors to minimize re-renders:

```typescript
// ✅ Good - Only re-renders when view changes
const view = useView();

// ✅ Good - Multiple values
const { prompt, style } = useCreationState();

// ❌ Bad - Subscribes to ALL state
const state = useAppStore((state) => state);
```

## Additional Resources

- [references/hooks-patterns.md](references/hooks-patterns.md) - React hooks patterns
- [references/state-management.md](references/state-management.md) - Zustand integration
