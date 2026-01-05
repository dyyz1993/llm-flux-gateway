---
paths: server/**/*.ts
---

# Server API Development Rules

## 🏗 Architecture Layers

### 当前状态

项目处于 Mock 优先开发阶段，服务端目前为单文件入口。

### 目标架构

服务端应遵循分层架构：

- **Routes** - 定义端点，应用验证器，委托逻辑给 Services
- **Services** - 实现核心业务逻辑，与 Hono Context 解耦
- **Schemas** - 定义 Zod schemas 用于请求/响应验证
- **Utils** - 共享工具函数

详细 API 规范请参考 `DESIGN_DOC.md`。

## 🛡 Validation & Type Safety

- **Schema 位置**: 模块化设计，各模块的 schemas 定义在对应的 routes 文件中（如 `module-fish/routes/fish-routes.ts`）
- **验证器**: 使用 `@hono/zod-validator` 的 `zValidator` 进行验证
- **类型获取**: 使用 `(c as any).req.valid('json')` 模式获取验证后的数据
- **类型共享**: 前后端共享类型定义在 `src/shared/types.ts`

### 示例

```typescript
// server/module-fish/routes/fish-routes.ts
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// Schema 定义在模块内部
const syncFishSchema = z.object({
  localData: z.object({
    id: z.string(),
    name: z.string().min(1),
    // ...
  }),
});

app.post('/api/fish/sync', zValidator('json', syncFishSchema), async (c) => {
  const data = (c as any).req.valid('json') as z.infer<typeof syncFishSchema>;
  // data 获得完整的类型推断
});
```

## 🔒 Security Requirements

- 所有用户输入必须验证
- 文件操作需要路径验证（防止目录遍历）
- Session 使用 HttpOnly Cookie
- 实施速率限制（如每日点赞限制）
- 权限验证（如资源所有权检查）

## 🚥 Response & Error Handling

### 标准响应格式

```typescript
// 成功
{ success: true, data: any }

// 错误
{ success: false, error: string }
```

### HTTP 状态码

- `200` - 成功
- `400` - 验证失败或业务逻辑错误
- `403` - 权限违规
- `404` - 资源不存在
- `500` - 服务器错误

### 工具函数

工具函数位于 `src/server/shared/utils.ts`：

- `apiResponse<T>(data, success)` - 成功响应
- `apiError(message, code)` - 错误响应
- `getUserIdFromRequest(c)` - 从请求头/cookie 获取用户 ID
- `getOrCreateGuestUser(c)` - 获取或创建访客用户
- `setGuestIdCookie(c, userId)` - 设置访户 ID cookie

### 类型定义

服务端共享类型位于 `src/server/shared/types.ts`：

```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthContext {
  user: {
    id: string;
    name: string;
    // ...
  };
}
```

## 📝 Best Practices

### 命名规范

- 函数：camelCase
- 类/接口/Zod Schema：PascalCase
- 路由：kebab-case

### 导入规范

```typescript
// ✅ 使用路径别名
import { FishEntity } from '@shared/types';
import { AppType } from '@server/index';

// ❌ 避免相对路径
import { FishEntity } from '../../shared/types';
```

### 异步与日志

- 所有 I/O 使用 async/await
- API 调用必须有错误处理
- 服务端操作需要描述性日志

## 🚀 Migration Notes

- 当前使用 Mock 模式 (`USE_MOCK_SERVER = true` in `apiClient.ts`)
- 切换到真实后端时将该标志设为 `false`
- 参考 `DESIGN_DOC.md` 获取完整 API 规范
