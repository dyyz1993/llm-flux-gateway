---
paths: src/client/stores/**/*.ts
---

# Zustand State Management Rules

## 🏪 Store Structure

```typescript
// src/client/stores/appStore.ts
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { FishEntity, UserProfile, ViewState } from '@shared/types';
import * as ApiClient from '@client/services/apiClient';

// 1. State interface
interface AppState {
  // View state
  view: ViewState;
  creationMethod: 'DRAW' | 'AI';

  // Data state
  currentUser: UserProfile | null;
  myFish: FishEntity[];
  pondFish: FishEntity[];

  // Creation state
  prompt: string;
  style: FishStyle;
  processState: ProcessingState;

  // Actions
  setView: (view: ViewState) => void;
  setPrompt: (prompt: string) => void;
  refreshCollection: () => Promise<void>;
  refreshPond: () => Promise<void>;
  saveToCollection: (...) => Promise<FishEntity | null>;
}

// 2. Store creation
export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  view: 'HOME',
  creationMethod: 'AI',
  currentUser: null,
  myFish: [],
  pondFish: [],
  prompt: '',
  style: 'scientific',
  processState: { status: 'idle', message: '' },

  // Actions
  setView: (view) => set({ view }),

  setPrompt: (prompt) => set({ prompt }),

  refreshCollection: async () => {
    const res = await ApiClient.fetchMyFish();
    if (res.success && res.data) {
      set({ myFish: res.data });
    }
  },

  refreshPond: async () => {
    const res = await ApiClient.fetchPondFish();
    if (res.success && res.data) {
      set({ pondFish: res.data });
    }
  },

  saveToCollection: async (...) => {
    // ...
  },
}));
```

## 📦 Import Rules

```typescript
// ✅ 正确的导入
import { create } from 'zustand';
import { shallow } from 'zustand/shallow';
import { FishEntity, UserProfile } from '@shared/types';
import * as ApiClient from '@client/services/apiClient';

// ❌ 禁止在 store 中导入 React
import { useState } from 'react';
```

## 🎯 Selector Patterns (最小化重渲染)

### 单个值选择器

```typescript
// ✅ 只订阅一个值 - 只有这个值变化时才重渲染
const view = useAppStore((state) => state.view);
const currentUser = useAppStore((state) => state.currentUser);
```

### 多个值选择器 - 使用 shallow

```typescript
// ✅ 订阅多个值 - 使用 shallow 进行浅比较
import { shallow } from 'zustand/shallow';

const { view, setView, currentUser } = useAppStore(
  (state) => ({ view: state.view, setView: state.setView, currentUser: state.currentUser }),
  shallow
);

// ❌ 避免 - 直接选择对象会订阅整个对象
const { view, currentUser } = useAppStore((state) => state);
```

### 选择器函数

```typescript
// ✅ 使用选择器函数进行派生计算
const filteredFish = useAppStore((state) => state.myFish.filter((fish) => fish.inPond));

// ✅ 使用 useStore hook 自定义选择器
const fishById = useAppStore(
  (state) => state.myFish.find((f) => f.id === fishId),
  (a, b) => a?.id === b?.id // 自定义比较函数
);
```

### Actions 选择器

```typescript
// ✅ Actions 是稳定的引用，可以直接选择
const setView = useAppStore((state) => state.setView);
const refreshCollection = useAppStore((state) => state.refreshCollection);

// 使用
const handleClick = () => {
  setView('PREVIEW');
  refreshCollection();
};
```

## ⚡ Performance Best Practices

### 避免不必要的订阅

```typescript
// ❌ 避免 - 订阅整个 state
const state = useAppStore((state) => state);
// 任何 state 变化都会导致重渲染

// ✅ 正确 - 只订阅需要的字段
const view = useAppStore((state) => state.view);
const myFish = useAppStore((state) => state.myFish);
```

### 使用 shallow 比较多对象

```typescript
import { shallow } from 'zustand/shallow';

// ✅ shallow 比较对象引用
const { currentUser, myFish } = useAppStore(
  (state) => ({ currentUser: state.currentUser, myFish: state.myFish }),
  shallow
);
```

### Actions 是稳定的

```typescript
// ✅ Actions 函数引用是稳定的，不需要 useCallback
const setView = useAppStore((state) => state.setView);
const refreshCollection = useAppStore((state) => state.refreshCollection);

useEffect(() => {
  refreshCollection();
}, [refreshCollection]); // 依赖是稳定的
```

## 🏗️ Store Organization

### 单 Store vs 多 Store

```typescript
// ✅ 推荐 - 单个主 store
export const useAppStore = create<AppState>((set, get) => ({
  // 所有应用状态
}));

// 如果状态确实很大，可以按域拆分
// src/client/stores/index.ts
export { useAppStore } from './appStore';
export { usePondStore } from './pondStore';
export { useUIStore } from './uiStore';
```

### 异步 Actions

```typescript
// ✅ 异步 action 在 store 中定义
saveToCollection: async (imageUrl, analysis, sourceType) => {
  const res = await ApiClient.createFish(name, style, imageUrl, analysis, sourceType);
  if (res.success && res.data) {
    set({ editingFishId: res.data.id });
    await get().refreshCollection();
    return res.data;
  }
  return null;
},
```

## 🔄 State Updates

### 直接更新

```typescript
// ✅ 简单更新
setView: (view) => set({ view }),
setPrompt: (prompt) => set({ prompt }),

// ✅ 更新多个字段
setState: (view, prompt) => set({ view, prompt }),
```

### 派生状态更新

```typescript
// ✅ 使用 get() 访问当前 state
incrementLike: (fishId: string) => {
  const fish = get().myFish.find(f => f.id === fishId);
  if (fish) {
    set({
      myFish: get().myFish.map(f =>
        f.id === fishId ? { ...f, likes: f.likes + 1 } : f
      )
    });
  }
},
```

### 数组更新

```typescript
// ✅ 添加到数组
addFish: (fish: FishEntity) => set(state => ({
  myFish: [...state.myFish, fish]
})),

// ✅ 更新数组项
updateFish: (id: string, updates: Partial<FishEntity>) => set(state => ({
  myFish: state.myFish.map(f =>
    f.id === id ? { ...f, ...updates } : f
  )
})),

// ✅ 删除数组项
removeFish: (id: string) => set(state => ({
  myFish: state.myFish.filter(f => f.id !== id)
})),
```

## 📝 命名规范

| 类型          | 约定               | 示例                                    |
| ------------- | ------------------ | --------------------------------------- |
| Store Hook    | use + Name + Store | `useAppStore`, `usePondStore`           |
| State 属性    | camelCase          | `view`, `currentUser`, `myFish`         |
| Actions       | set + 属性名       | `setView`, `setPrompt`                  |
| Async Actions | verb + Noun        | `refreshCollection`, `saveToCollection` |

## 🚫 Anti-Patterns

```typescript
// ❌ 不要在组件中订阅整个 state
const state = useAppStore(state => state);

// ❌ 不要在 store 中使用 React hooks
export const useAppStore = create((set, get) => {
  const [local, setLocal] = useState();  // ❌
  return { ... };
});

// ❌ 不要在组件中创建选择器数组（每次渲染都是新数组）
const [view, setView] = useAppStore(state => [state.view, state.setView]);

// ✅ 使用对象解构 + shallow
const { view, setView } = useAppStore(
  state => ({ view: state.view, setView: state.setView }),
  shallow
);
```

## 📂 File Structure

```
src/client/stores/
├── appStore.ts       # 主应用状态
├── pondStore.ts      # 池塘相关状态（如果需要拆分）
└── index.ts          # 统一导出
```
