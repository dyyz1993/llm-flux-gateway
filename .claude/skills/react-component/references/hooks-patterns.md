# React Hooks Patterns

## Overview

This reference describes hooks usage patterns in React components, following project conventions.

## Core Hooks

### useState

```typescript
const [count, setCount] = useState(0);
const [user, setUser] = useState<User | null>(null);
```

### useEffect

```typescript
useEffect(() => {
  // Side effect
  fetchData();

  // Cleanup
  return () => {
    cleanup();
  };
}, [dependency]);
```

### useCallback

```typescript
const handleClick = useCallback(() => {
  doSomething(dependency);
}, [dependency]);
```

### useMemo

```typescript
const expensiveValue = useMemo(() => {
  return computeExpensiveValue(a, b);
}, [a, b]);
```

### useRef

```typescript
const canvasRef = useRef<HTMLCanvasElement>(null);
const intervalRef = useRef<number | null>(null);
```

## Custom Hooks

### useAppStore Selectors

```typescript
// ✅ Good - Use specific selector hooks
const view = useView();
const { prompt, style } = useCreationState();

// ❌ Bad - Subscribes to entire state
const state = useAppStore((state) => state);
```

### usePondEnvironment

```typescript
import { usePondEnvironment } from '@client/hooks/usePondEnvironment';

const canvasRef = usePondEnvironment('pond-canvas', {
  onFishClick: (fish) => console.log(fish),
});
```

## Patterns

### Effect with Dependencies

```typescript
useEffect(() => {
  if (!userId) return;

  const fetchUser = async () => {
    const user = await api.getUser(userId);
    setUser(user);
  };

  fetchUser();
}, [userId]); // Clear dependency
```

### Event Handler with useCallback

```typescript
const handleSave = useCallback(() => {
  onSave(data);
}, [onSave, data]);
```

### Cleanup Effect

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    tick();
  }, 1000);

  return () => clearInterval(interval);
}, []);
```

## Anti-Patterns

### ❌ Don't use useEffect for derived state

```typescript
// Bad
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// Good - Compute directly
const fullName = `${firstName} ${lastName}`;
```

### ❌ Don't omit dependencies

```typescript
// Bad - Missing dependency
useEffect(() => {
  fetchData(userId);
}, []); // Should include userId

// Good
useEffect(() => {
  fetchData(userId);
}, [userId]);
```

### ❌ Don't use Redux-style dispatch

```typescript
// Bad - Unnecessary dispatcher
const dispatch = useAppStore((state) => state.dispatch);

// Good - Direct action selector
const { setPrompt } = useCreationActions();
```

## State Management with Zustand

### Selector Pattern

```typescript
// Specific selector - Only re-renders when view changes
const view = useAppStore((state) => state.view);

// Multiple selectors - Shallow comparison
const { prompt, style } = useCreationState();

// Action selector - Stable reference
const { setPrompt } = useCreationActions();
```

### Async Actions

```typescript
const { generateConcept } = useCreationActions();

const handleGenerate = async () => {
  setIsLoading(true);
  try {
    await generateConcept(prompt);
  } finally {
    setIsLoading(false);
  }
};
```

## Canvas Rendering Hooks

### useCanvasRenderer

```typescript
import { useCanvasRenderer } from '@client/hooks/useCanvasRenderer';

const { renderer, start, stop } = useCanvasRenderer({
  fps: 60,
  onRender: (ctx) => {
    // Custom rendering logic
  },
});
```

### useAnimationFrame

```typescript
import { useAnimationFrame } from '@client/hooks/useAnimationFrame';

useAnimationFrame((deltaTime) => {
  // Update animation
  updatePhysics(deltaTime);
});
```

## See Also

- [state-management.md](state-management.md) - Zustand store patterns
- [../SKILL.md](../SKILL.md) - React component skill
