---
paths: src/shared/**/*.ts
---

# Shared Types Development Rules

## 🎯 Core Principle

`src/shared/` 目录中的类型必须**完全独立**，不依赖任何其他模块。这些类型在前后端之间共享。

## 📁 File Structure

```typescript
// ==========================================
// SHARED DOMAIN TYPES (Frontend + Backend)
// Copy this section to your Node.js backend
// ==========================================

// 1. Basic geometry types
export interface Point { x: number; y: number; r?: number; }

// 2. Type aliases for string literals
export type FishStyle = 'scientific' | 'cartoon' | 'mecha' | 'voxel' | 'ink';

// 3. Core data structures
export interface FishSkeleton { ... }
export interface FishEntity { ... }

// ==========================================
// FRONTEND SPECIFIC TYPES
// ==========================================

// 4. UI state types
export type AppMode = 'POND' | 'CREATE' | 'PROFILE';

// 5. Helper types
export interface RiggingVariant { ... }
```

## 🚫 Strict Constraints

```typescript
// ❌ 禁止任何导入
import { Something } from '../client/...';
import React from 'react';
import { z } from 'zod';

// ✅ shared/ 必须是依赖自由的
// 所有类型必须是纯 TypeScript 类型
```

## 📦 Type Organization

### 按域分类

```typescript
// ==========================================
// SHARED DOMAIN TYPES (Frontend + Backend)
// ==========================================

// 几何与基础类型
export interface Point { ... }
export type FacingDirection = 'left' | 'right';
export type FishStyle = 'scientific' | 'cartoon' | 'mecha' | 'voxel' | 'ink';

// 鱼类数据结构
export interface FishSkeleton { ... }
export interface DualSkeletonResult { ... }
export interface FishEntity { ... }

// 用户数据结构
export interface UserProfile { ... }
export interface LeaderboardEntry { ... }

// ==========================================
// FRONTEND SPECIFIC TYPES
// ==========================================

// UI 状态
export enum AppMode { ... }
export interface ProcessingState { ... }
export interface GenerationResult { ... }

// 编辑器类型
export type SkeletonKey = keyof FishSkeleton;
export interface RiggingVariant { ... }
```

## 📝 命名规范

| 类型     | 约定       | 示例                                      |
| -------- | ---------- | ----------------------------------------- |
| 接口     | PascalCase | `FishEntity`, `UserProfile`, `Point`      |
| 类型别名 | PascalCase | `FishStyle`, `FacingDirection`, `AppMode` |
| 枚举     | PascalCase | `AppMode` (如果使用 enum)                 |
| 可选属性 | `?` 后缀   | `r?: number`, `eye?: Point`               |
| 数组属性 | 复数形式   | `likes`, `dailyLikes`                     |

## 🔤 String Literal Types

```typescript
// ✅ 使用类型别名定义字符串字面量
export type FishStyle = 'scientific' | 'cartoon' | 'mecha' | 'voxel' | 'ink';
export type FacingDirection = 'left' | 'right';
export type AppMode = 'POND' | 'CREATE' | 'PROFILE';

// ❌ 避免使用 enum (除非确实需要)
enum FishStyle {
  SCIENTIFIC = 'scientific',
  CARTOON = 'cartoon',
  // ...
}
```

## 🏗️ Interface Pattern

```typescript
// ✅ 接口定义顺序
export interface FishEntity {
  // 1. 必填标识符
  id: string;
  ownerId: string;

  // 2. 必填数据
  name: string;
  imageUrl: string;
  skeleton: DualSkeletonResult;

  // 3. 可选数据
  description?: string;
  stats?: { speed: number; agility: number };

  // 4. 服务器控制字段
  likes: number;
  inPond: boolean;
  isApproved: boolean;
}
```

## 📂 文件组织

当前项目只有一个 `types.ts` 文件。未来如果类型增多，可以按域拆分：

```
src/shared/
├── types.ts           # 主类型文件（当前所有类型）
├── fish.types.ts      # 鱼相关类型
├── user.types.ts      # 用户相关类型
└── ui.types.ts        # UI 状态类型（仅前端）
```

## 🔄 同步规则

- **修改共享类型时**：必须同步更新后端的类型定义
- **添加新类型时**：在文件顶部注释中标明是 SHARED 还是 FRONTEND SPECIFIC
- **删除类型时**：确认前后端都不再使用

## 🚫 Anti-Patterns

```typescript
// ❌ 不要导入任何东西
import { external } from 'external-package';

// ❌ 不要使用默认导出
export default interface Fish { ... }

// ✅ 使用命名导出
export interface Fish { ... }

// ❌ 不要在类型中使用具体实现
export interface BadExample {
  render: () => JSX.Element;  // 包含 React 类型
}
```
