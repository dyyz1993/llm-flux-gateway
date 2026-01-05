---
paths: src/client/services/**/*.ts
---

# Client Service Development Rules

## 📁 File Structure

```typescript
// 1. Imports
import { FishEntity, UserProfile } from '@shared/types';

// 2. Configuration constants
const USE_MOCK_SERVER = true;
const API_BASE_URL = "https://api.biomimic.com/v1";

// 3. Type definitions
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// 4. Helper functions
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// 5. Named exports
export const functionOne = async () => { ... };
export const functionTwo = async () => { ... };
```

## 📦 Import Rules

```typescript
// ✅ 共享类型 - 始终使用 @shared 别名
import { FishEntity, UserProfile } from '@shared/types';

// ✅ 同目录服务 - 使用相对导入
import { MockStore } from './mockStore';

// ✅ 其他目录 - 使用 @client 别名
import { PondFish } from '@client/classes/PondFish';

// ❌ 禁止向上多级相对路径
import { Something } from '../../classes/...';
```

## 🔌 API Client Patterns

### 统一响应格式

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### 函数模板

```typescript
export const fetchMyFish = async (): Promise<ApiResponse<FishEntity[]>> => {
  try {
    if (USE_MOCK_SERVER) {
      await delay(200); // 模拟网络延迟
      const user = MockStore.getUser();
      const mine = MockStore.getAllFish().filter((f) => f.ownerId === user.id);
      return { success: true, data: mine };
    }
    // 真实 API 调用
    const res = await rpc.my_fish.$get();
    return { success: true, data: res };
  } catch (e) {
    return handleError(e);
  }
};
```

### 错误处理

```typescript
// ✅ 集中错误处理
const handleError = (error: any): ApiResponse<any> => {
  console.error('[API Error]:', error);
  return { success: false, error: error.message || 'Unknown Network Error' };
};

// ✅ Try-catch with logging
try {
  const result = await someOperation();
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error);
  return handleError(error);
}
```

## 🎨 导出规范

```typescript
// ✅ 函数使用命名导出
export const fetchCurrentUser = async () => { ... };
export const fetchMyFish = async () => { ... };
export const createFish = async () => { ... };

// ✅ 类使用默认导出
export class AudioService {
  // ...
}
export default AudioService;

// ✅ 常量使用命名导出
export const API_CONFIG = { /* ... */ };
```

## ⚡ 异步模式

```typescript
// ✅ 始终使用 async/await (不使用 Promise 链)
export const createFish = async (): Promise<ApiResponse<FishEntity>> => {
  try {
    await delay(600);
    const result = MockStore.createFish(...);
    if ('error' in result) return { success: false, error: result.error };
    return { success: true, data: result };
  } catch (e) {
    return handleError(e);
  }
};

// ❌ 避免 Promise 链
export const badExample = (): Promise<any> => {
  return delay(600).then(() => {
    return MockStore.createFish(...);
  }).then(result => {
    // ...
  });
};
```

## 🔐 Singleton 模式

```typescript
// ✅ 静态类用于无状态服务
export class AudioService {
  private static ctx: AudioContext | null = null;

  private static ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx;
  }

  public static playCast() {
    /* ... */
  }
  public static playReel() {
    /* ... */
  }
}
```

## 📝 命名规范

| 类型   | 约定             | 示例                                       |
| ------ | ---------------- | ------------------------------------------ |
| 文件名 | camelCase.ts     | `apiClient.ts`, `geminiService.ts`         |
| 函数   | camelCase        | `fetchMyFish`, `createFish`, `refreshPond` |
| 类     | PascalCase       | `AudioService`, `GeminiService`            |
| 常量   | UPPER_SNAKE_CASE | `USE_MOCK_SERVER`, `API_BASE_URL`          |
| 接口   | PascalCase       | `ApiResponse`, `FishConfig`                |

## 🚫 Anti-Patterns

```typescript
// ❌ 不要混合命名导出和默认导出
class Service { ... }
export default Service;
export const helper = ...;

// ✅ 使用一致的导出风格
export class Service { ... }
export const helper = ...;

// ❌ 不要在服务中直接使用 useState
const [data, setData] = useState();
// 服务应该是纯函数，不应该有 React 依赖
```
