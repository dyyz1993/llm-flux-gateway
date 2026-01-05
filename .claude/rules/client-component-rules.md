---
paths: src/client/components/**/*.tsx
---

# Client Component Development Rules

## 📁 File Structure

组件文件应按以下顺序组织：

```typescript
// 1. Imports (React first, then types, then dependencies)
import React, { useRef, useEffect } from 'react';
import { FishEntity, DualSkeletonResult } from '@shared/types';
import { useAppStore } from '@client/stores/appStore';

// 2. Props interface definition
interface ComponentNameProps {
  imageUrl: string;
  onHover?: (isHovering: boolean) => void;
}

// 3. Local type definitions
type AnimMode = 'rest' | 'drift' | 'cruise';

// 4. Component declaration
const ComponentName: React.FC<ComponentNameProps> = ({ imageUrl }) => {
  // Implementation
};

// 5. Default export
export default ComponentName;
```

## 📦 Import Rules

```typescript
// ✅ 共享类型 - 始终使用 @shared 别名
import { FishEntity, UserProfile, DualSkeletonResult } from '@shared/types';

// ✅ 同目录组件 - 使用相对导入
import FishAnimator from './FishAnimator';

// ✅ 跨目录导入 - 使用 @client 别名
import { PondFish } from '@client/classes/PondFish';
import { useAppStore } from '@client/stores/appStore';

// ❌ 禁止向上多级相对路径
import { Something } from '../../../services/...';
```

## 🏪 State Management with Zustand

### 核心原则

- **全局状态使用 Zustand Store** - 不使用 useState 管理共享状态
- **最小化重渲染** - 使用选择器精确订阅需要的状态
- **本地 UI 状态使用 useState** - 组件内部的临时状态

### Store 选择器模式

```typescript
// ✅ 精确选择 - 只订阅需要的字段，避免不必要的重渲染
const view = useAppStore((state) => state.view);
const setView = useAppStore((state) => state.setView);

// ✅ 浅比较选择器 - 选择对象时使用 shallow
const { currentUser, myFish } = useAppStore(
  (state) => ({ currentUser: state.currentUser, myFish: state.myFish }),
  shallow
);

// ✅ 单个选择器 - 用于单个值
const fishList = useAppStore((state) => state.myFish);

// ❌ 避免 - 订阅整个 state（任何变化都会重渲染）
const state = useAppStore((state) => state);
```

### Action 模式

```typescript
// ✅ 使用 store 中的 actions
const setView = useAppStore((state) => state.setView);
const refreshCollection = useAppStore((state) => state.refreshCollection);

const handleClick = () => {
  setView('PREVIEW');
  refreshCollection();
};
```

### 组件内本地状态

```typescript
// 仅用于组件内部的临时 UI 状态
const [isHovering, setIsHovering] = useState(false);
const [localValue, setLocalValue] = useState('');

// ✅ useRef 用于不触发渲染的值
const canvasRef = useRef<HTMLCanvasElement>(null);
const requestRef = useRef<number>(0);
```

## 🎨 Props Interface 约定

```typescript
interface ComponentNameProps {
  // 必填属性在前
  imageUrl: string;
  fishId: string;

  // 可选属性
  mode?: 'preview' | 'pond';

  // 回调函数放在最后
  onHover?: (isHovering: boolean) => void;
  onClick?: () => void;
}
```

## ⚡ Effect 组织

```typescript
// 1. 初始化
useEffect(() => {
  useAppStore.getState().initSession();
}, []);

// 2. 数据同步 (依赖 store 中的状态)
const view = useAppStore((state) => state.view);
useEffect(() => {
  if (view === 'POND') {
    useAppStore.getState().refreshPond();
  }
}, [view]);

// 3. 动画循环 (注意清理)
useEffect(() => {
  let rafId: number;
  const animate = () => {
    // ...
    rafId = requestAnimationFrame(animate);
  };
  animate();
  return () => cancelAnimationFrame(rafId);
}, []);
```

## 🎯 事件处理

```typescript
// 事件处理器使用 handle 前缀
const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
  // ...
};

const handleSave = async () => {
  await useAppStore.getState().saveToCollection(/* ... */);
};

// 类型安全
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => { ... };
```

## 📝 命名规范

| 类型       | 约定               | 示例                          |
| ---------- | ------------------ | ----------------------------- |
| 组件       | PascalCase         | `FishAnimator`, `CanvasPond`  |
| 文件名     | PascalCase.tsx     | `FishAnimator.tsx`            |
| Props 接口 | ComponentNameProps | `FishAnimatorProps`           |
| 事件处理   | handle + CamelCase | `handleClick`, `handleSubmit` |

## 🚫 Anti-Patterns

```typescript
// ❌ 不要用 useState 管理应该共享的状态
const [myFish, setMyFish] = useState<FishEntity[]>([]);

// ✅ 使用 Zustand store
const myFish = useAppStore(state => state.myFish);

// ❌ 不要订阅整个 state
const state = useAppStore(state => state);

// ❌ 不要在 props 中内联复杂类型
const Component = ({ data }: { data: { x: number }[] }) => ...
```

## 🎨 Canvas 组件特殊约定

```typescript
const canvasRef = useRef<HTMLCanvasElement>(null);

useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  // ...
}, []);

useEffect(() => {
  let rafId: number;
  const animate = () => {
    // ...
    rafId = requestAnimationFrame(animate);
  };
  animate();
  return () => cancelAnimationFrame(rafId);
}, [dependencies]);
```
