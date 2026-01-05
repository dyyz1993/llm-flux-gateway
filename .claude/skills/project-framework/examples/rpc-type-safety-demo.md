# Hono RPC 类型安全演示

## 核心优势

**端到端类型安全** - 从服务端路由到客户端调用，全程自动类型推导，零手动类型声明。

---

## 一、服务端定义路由

```typescript
// src/server/module-fish/routes/fish-routes.ts
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// 定义请求验证 Schema
const syncFishSchema = z.object({
  fishId: z.string(),
  skeleton: z.object({
    standard: z.array(z.object({ x: z.number(), y: z.number() })),
  }),
});

// 路由定义
const fishRoutes = new Hono()
  .post('/sync', zValidator('json', syncFishSchema), async (c) => {
    // ✅ c.req.valid('json') 自动推导类型
    const data = c.req.valid('json');
    //    ^? { fishId: string; skeleton: { standard: Array<{x: number, y: number}> } }

    const fish = await service.syncFish(data);
    return c.json(apiResponse(fish), 200);  // ← 明确状态码，客户端可推导响应类型
  });
```

---

## 二、客户端自动获得类型

```typescript
// src/client/services/rpcClient.ts
import { hc } from 'hono/client';
import type { AppType } from '@server/index';

// 创建类型安全客户端
export const client = hc<AppType>('/');

// 客户端方法 - 无需手动声明类型！
class FishApiService {
  async syncFish(params: {
    fishId: string;
    skeleton: { standard: Array<{ x: number; y: number }> };
  }) {
    const res = await client.fish.sync.$post({
      json: params,  // ← 参数类型与服务端 Schema 一致
    });

    if (!res.ok) throw new Error('Failed to sync fish');

    // ✅ 响应类型自动从 c.json(apiResponse(fish), 200) 推导
    return await res.json();
    //    ^? { success: true; data: FishEntity | null }
  }
}
```

---

## 三、使用体验对比

### ❌ 传统 REST API (无类型安全)

```typescript
// 需要手动定义类型（重复劳动）
interface SyncFishRequest {
  fishId: string;
  skeleton: any;  // 类型可能不匹配
}

interface SyncFishResponse {
  success: boolean;
  data?: FishEntity;
}

async function syncFish(req: SyncFishRequest): Promise<SyncFishResponse> {
  const res = await fetch('/fish/sync', {
    method: 'POST',
    body: JSON.stringify(req),  // ← 可能发送错误数据
  });

  // 需要手动类型断言
  return (await res.json()) as SyncFishResponse;
  //                         ^^^^^^^^^^^^^^^^^^^ 危险的断言
}
```

### ✅ Hono RPC (自动类型推导)

```typescript
// 无需手动定义类型 - 全程自动推导！
async function syncFish() {
  const res = await client.fish.sync.$post({
    json: {
      fishId: 'abc-123',
      skeleton: {
        standard: [{ x: 10, y: 20 }],
      },
      // ✅ TypeScript 会检查参数与服务端 Schema 是否一致
    },
  });

  if (!res.ok) throw new Error();

  // ✅ 响应类型自动推导
  const data = await res.json();
  //    ^? { success: true; data: FishEntity | null }
}
```

---

## 四、类型推导链路示意

```
┌──────────────────────────────────────────────────────────────┐
│ 服务端定义                                                     │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  syncFishSchema (Zod)                                         │
│       ↓                                                       │
│  zValidator('json', syncFishSchema)                          │
│       ↓                                                       │
│  c.req.valid('json') → 推导请求参数类型                        │
│       ↓                                                       │
│  c.json(apiResponse(fish), 200) → 推导响应类型                │
│                                                               │
└──────────────────────────────────────────────────────────────┘
                            ↓
                      AppType 类型导出
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ 客户端导入                                                     │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  hc<AppType>('/')                                             │
│       ↓                                                       │
│  client.fish.sync.$post({ json: ... })                       │
│       ↓                                                       │
│  json 参数类型 ↔ 服务端 syncFishSchema                        │
│  响应类型 ↔ 服务端 apiResponse(fish)                         │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 五、实际项目示例

### 客户端 API 服务 (`src/client/services/apiClient.ts`)

```typescript
export class ApiClientService {
  private rpc = new RpcClientService();

  // ✅ 无需定义 FishEntity[] 类型 - 自动推导
  async getMyFish() {
    const res = await client.fish.my.$get();
    if (!res.ok) throw new Error('Failed to fetch fish');
    return await res.json();
    //    ^? { success: true; data: FishEntity[] }
  }

  // ✅ 参数类型自动检查
  async syncFish(fishId: string, skeleton: DualSkeletonResult) {
    const res = await client.fish.sync.$post({
      json: { fishId, skeleton },  // ← 类型必须匹配服务端 Schema
    });
    if (!res.ok) throw new Error('Failed to sync fish');
    return await res.json();
    //    ^? { success: true; data: FishEntity }
  }
}
```

---

## 六、类型安全的好处

### 1. 编译时错误检测

```typescript
// ❌ TypeScript 编译错误 - 参数类型不匹配
await client.fish.sync.$post({
  json: {
    fishId: 123,  // Error: Type 'number' is not assignable to type 'string'
    skeleton: 'invalid',  // Error: Type 'string' is not assignable...
  },
});

// ❌ TypeScript 编译错误 - 响应数据访问错误
const res = await client.fish.my.$get();
const data = await res.json();
console.log(data.foo);  // Error: Property 'foo' does not exist
```

### 2. IDE 自动补全

```typescript
// ✅ 输入 client.fish. 后，IDE 自动列出可用端点
client.fish.my
client.fish.sync
client.fish[':id']

// ✅ 输入 json: { 后，IDE 自动补全所需字段
await client.fish.sync.$post({
  json: {
    fishId: '',
    skeleton: {
      standard: [{ x: 0, y: 0 }],  // ← 自动提示 x, y
    },
  },
});
```

### 3. 重构安全

```typescript
// 服务端修改 Schema
const syncFishSchema = z.object({
  fishId: z.string(),
  newField: z.string(),  // ← 新增必填字段
});

// ✅ 客户端立即报错 - 提醒补充 newField
await client.fish.sync.$post({
  json: {
    fishId: 'abc',
    // Error: Property 'newField' is missing
  },
});
```

---

## 七、关键实现点

### 服务端

1. **使用 zValidator** 定义请求 Schema
2. **直接调用 c.json()**，不在 Controller 中封装
3. **明确状态码** (200, 404, 等)，便于类型推导
4. **错误处理移到中间件**，避免 try-catch 打断类型流

### 客户端

1. **使用 hc<AppType>** 创建类型安全客户端
2. **检查 res.ok** 处理网络错误
3. **移除 as 类型断言**，让类型自动推导
4. **使用响应数据时，TypeScript 自动提供类型提示**

---

## 八、总结

| 特性              | 传统 REST API        | Hono RPC            |
| ----------------- | -------------------- | ------------------- |
| 请求类型定义      | 手动编写接口         | 自动从 Zod 推导     |
| 响应类型定义      | 手动编写接口         | 自动从 c.json 推导  |
| 类型安全          | 需要手动 as 断言     | 编译时自动检查      |
| IDE 补全          | 需要额外配置         | 开箱即用            |
| 重构安全          | 容易遗漏更新         | 即时报错            |
| 代码重复          | 前后端类型重复定义   | 单一数据源          |

**结论**: Hono RPC 通过类型推导实现了真正的"端到端类型安全"，消除了手动类型维护的负担。
