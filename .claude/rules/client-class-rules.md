---
paths: src/client/classes/**/*.ts
---

# Client Class Development Rules

## 📁 File Structure

```typescript
// 1. Imports
import { FishEntity, Point, FishSkeleton } from '@shared/types';
import { BAKE_FRAME_COUNT, ANIM_STYLES } from './PondFishConstants';

// 2. Re-exports (for convenience)
export { ANIM_STYLES, MOTION_SPEEDS };
export type { Vertex, FoodItem };

// 3. Interface definitions
export interface FishConfig { ... }

// 4. Class declaration
export class PondFish {
  // Static members
  // Public properties
  // Private properties
  // Constructor
  // Public methods
  // Private methods
}
```

## 📦 Import Rules

```typescript
// ✅ 共享类型 - 始终使用 @shared 别名
import { FishEntity, FishSkeleton, Point } from '@shared/types';

// ✅ 同目录类 - 使用相对导入
import { PondFishConstants } from './PondFishConstants';

// ❌ 禁止导入 React 相关代码
import { useState } from 'react';
```

## 👁 Visibility Modifiers

```typescript
export class PondFish {
  // ✅ Public - 对外 API
  public id: string;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;

  // ✅ Private - 内部实现
  private textureW: number = 0;
  private textureH: number = 0;
  private bakeComplete: boolean = false;

  // ❌ 不使用 protected (项目没有继承)
  // protected method() { ... }
}
```

## 🏗️ Method Organization

```typescript
export class PondFish {
  // 1. Static cache/state
  private static ANIM_CACHE = new Map<string, CachedAnimation>();

  // 2. Constructor
  constructor(config: FishConfig, screenW: number, screenH: number) {
    // 初始化
  }

  // 3. Public API - Getters
  public getTraits(): FishTraits {
    /* ... */
  }

  // 4. Public API - Setters
  public setRig(newSkeleton: FishSkeleton) {
    /* ... */
  }
  public setHook(hooked: boolean) {
    /* ... */
  }

  // 5. Public API - Actions
  public triggerBlink() {
    /* ... */
  }
  public triggerCapture(x: number, y: number) {
    /* ... */
  }

  // 6. Public API - Update/Draw
  public update(screenW: number, screenH: number): string | null {
    /* ... */
  }
  public draw(ctx: CanvasRenderingContext2D): void {
    /* ... */
  }

  // 7. Private - Initialization
  private loadImage() {
    /* ... */
  }
  private generateRig() {
    /* ... */
  }

  // 8. Private - Helpers
  private calculateMouthWorldPos(): { x: number; y: number } {
    /* ... */
  }
}
```

## 🔧 Static Classes (无状态工具类)

```typescript
// ✅ 静态类用于纯函数工具
export class FishMeshGenerator {
  public static generate(
    skeleton: FishSkeleton,
    aspectRatio: number
  ): {
    vertices: Vertex[];
    indices: number[];
  } {
    // 纯函数 - 无实例状态
    const vertices = [];
    const indices = [];
    // ...
    return { vertices, indices };
  }

  private static helperFunction() {
    // 私有辅助方法
  }
}

export class FishRenderer {
  public static drawDeformed(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    vertices: Vertex[]
  ) {
    // 渲染逻辑
  }

  private static drawTexturedTriangle(/* ... */) {
    // 辅助方法
  }
}
```

## 📦 Constants File

```typescript
// ✅ 所有常量使用命名导出
export const BAKE_FRAME_COUNT = 24;
export const GRID_COLS = 24;
export const GRID_ROWS = 16;

// ✅ Record 类型用于键值映射
export const MOTION_SPEEDS: Record<string, number> = {
  rest: 0,
  drift: 0.5,
  cruise: 1.5,
  fast: 2.5,
  dash: 4.0,
  panic: 6.0,
  tired: 0.3,
  feed: 0.8,
};

export const ANIM_STYLES: Record<
  string,
  {
    speed: number;
    amplitude: number;
    frequency: number;
  }
> = {
  rest: { speed: 0, amplitude: 0.05, frequency: 2 },
  cruise: { speed: 1.5, amplitude: 0.15, frequency: 3 },
  // ...
};

// ✅ 类型导出
export interface Vertex {
  basePos: Point;
  currentPos: Point;
  spineT: number;
  // ...
}

export interface FoodItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
```

## 📝 命名规范

| 类型     | 约定             | 示例                                |
| -------- | ---------------- | ----------------------------------- |
| 文件名   | PascalCase.ts    | `PondFish.ts`, `PondFishMesh.ts`    |
| 类       | PascalCase       | `PondFish`, `FishMeshGenerator`     |
| 公共属性 | camelCase        | `x`, `y`, `velocity`                |
| 私有属性 | camelCase        | `textureW`, `bakeComplete`          |
| 公共方法 | camelCase        | `update()`, `draw()`, `getTraits()` |
| 私有方法 | camelCase        | `loadImage()`, `generateRig()`      |
| 静态属性 | UPPER_SNAKE_CASE | `ANIM_CACHE`, `DEFAULT_CONFIG`      |

## 🚫 Anti-Patterns

```typescript
// ❌ 不要使用 protected
protected method() { ... }

// ❌ 不要有不必要的公共属性
public data: any;

// ✅ 使用 private 封装实现细节
private cache = new Map();

// ❌ 不要在类中混用命名导出和默认导出
export class MyClass { }
export default MyClass;

// ✅ 使用命名导出
export class MyClass { }
```
