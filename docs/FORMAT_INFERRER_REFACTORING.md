# 格式推断重构总结

## 概述

本次重构实现了从 `vendor_templates` 自动推断上游 API 格式，而不是在 `routes` 表中手动配置 `requestFormat` 和 `responseFormat` 字段。

## 设计原则

```
1. 客户端发送什么格式 → 由请求路径决定 (/v1/chat/completions, /v1/messages, etc.)
2. 上游使用什么格式 → 由 vendor_templates 决定
3. 网关自动双向转换
```

## 核心更改

### 1. 新增格式推断工具

**文件**: `/src/server/module-gateway/utils/format-inferer.ts`

```typescript
export function inferFormatFromVendorTemplate(
  vendor: VendorTemplateForInference
): ApiFormat
```

**推断规则**:
- **Anthropic 格式**: `endpoint === '/messages'` 或 `baseUrl` 包含 'anthropic'
- **Gemini 格式**: `endpoint` 包含 'generateContent' 或 `baseUrl` 包含 'generativelanguage'/'googleapis'
- **OpenAI 格式**: 默认，大多数 `/chat/completions` 端点

### 2. 修改的服务文件

#### gateway-controller.ts
- **无需修改**: 自动使用 `route.requestFormat`（现在由 route-matcher 推断）

#### route-matcher.service.ts
- **移除**: 从数据库读取 `request_format` 和 `response_format` 字段
- **新增**: 使用 `inferFormatFromVendorTemplate()` 从 vendor template 推断格式
- **影响**:
  - `findMatch()` 方法
  - `getActiveRoutes()` 方法

#### routes.service.ts
- **移除**: `CreateRouteInput` 和 `UpdateRouteInput` 中的 `requestFormat` 和 `responseFormat` 字段
- **移除**: API 验证 schema 中的相关字段
- **保留**: 数据库中的字段（向后兼容），但在运行时忽略
- **新增**: `mapRowToRoute()` 使用推断的格式

#### routes-routes.ts
- **移除**: `createRouteSchema` 和 `updateRouteSchema` 中的 `requestFormat` 和 `responseFormat` 验证

### 3. 类型定义更新

#### src/shared/types.ts
- **移除**: `RouteConfig` 接口中的 `requestFormat` 和 `responseFormat` 字段

#### src/server/module-gateway/services/routes.service.ts
- **修改**: `Route` 接口，将 `requestFormat` 和 `responseFormat` 改为可选的推断字段

## 测试验证

### 单元测试
- ✅ **format-inferer.test.ts**: 12 个测试全部通过
- ✅ **format-inferer.integration.test.ts**: 9 个真实 vendor 配置测试全部通过
- ✅ **route-matcher.service.api-key-isolation.test.ts**: 11 个测试全部通过

### 测试覆盖的 Vendor
1. OpenAI (https://api.openai.com/v1)
2. Anthropic (https://api.anthropic.com/v1)
3. Gemini (https://generativelanguage.googleapis.com/v1beta)
4. Zhipu AI - OpenAI 兼容
5. Zhipu AI - Anthropic 兼容
6. Azure OpenAI
7. Mistral
8. Perplexity
9. Cohere

## 数据库影响

### 保留字段（向后兼容）
```sql
-- routes 表中的字段保留，但不再使用
request_format TEXT DEFAULT 'openai'
response_format TEXT DEFAULT 'openai'
```

### 查询更改
```sql
-- 之前
SELECT r.request_format, r.response_format FROM routes r ...

-- 之后（不再查询这些字段）
SELECT v.base_url, v.endpoint FROM routes r
INNER JOIN vendor_templates v ON ...
```

## 向后兼容性

- ✅ **数据库 schema**: 保留旧字段，现有数据不受影响
- ✅ **API 接口**: 移除了 `requestFormat` 和 `responseFormat` 的输入参数
- ⚠️ **破坏性变更**: 创建/更新路由时不再接受 `requestFormat` 和 `responseFormat` 参数

## 迁移指南

### 如果现有代码手动设置了格式

**之前**:
```typescript
await routesService.create({
  name: 'My Route',
  assetId: 'asset-123',
  requestFormat: 'anthropic',
  responseFormat: 'anthropic',
});
```

**之后**:
```typescript
// 格式会从 asset 的 vendor_template 自动推断
await routesService.create({
  name: 'My Route',
  assetId: 'asset-123',
});
```

## 未来改进

### 可选的后续步骤

1. **数据库迁移**: 创建迁移脚本删除 `request_format` 和 `response_format` 字段
2. **文档更新**: 更新 API 文档，说明格式自动推断机制
3. **验证增强**: 添加更多 vendor 格式的测试用例

## 示例配置

### vendors.yaml
```yaml
vendors:
  - name: Anthropic
    baseUrl: https://api.anthropic.com/v1
    endpoint: /messages  # 自动推断为 Anthropic 格式
    models:
      - claude-3-5-sonnet-20241022

  - name: OpenAI
    baseUrl: https://api.openai.com/v1
    endpoint: /chat/completions  # 自动推断为 OpenAI 格式
    models:
      - gpt-4o
      - gpt-4o-mini

  - name: Zhipu coding anthropic
    baseUrl: https://open.bigmodel.cn/api/anthropic/v1
    endpoint: /messages  # 自动推断为 Anthropic 格式
    models:
      - glm-4.7
```

## 关键文件清单

### 新增文件
- `/src/server/module-gateway/utils/format-inferer.ts`
- `/src/server/module-gateway/utils/index.ts`
- `/src/server/module-gateway/utils/__tests__/format-inferer.test.ts`
- `/src/server/module-gateway/utils/__tests__/format-inferer.integration.test.ts`

### 修改文件
- `/src/server/module-gateway/controllers/gateway-controller.ts` (无需修改，自动兼容)
- `/src/server/module-gateway/services/route-matcher.service.ts`
- `/src/server/module-gateway/services/routes.service.ts`
- `/src/server/module-gateway/routes/routes-routes.ts`
- `/src/shared/types.ts`

### 测试文件更新
- `/src/server/module-gateway/services/__tests__/routes-service.test.ts`

## 总结

✅ **重构成功**: 上游格式现在从 `vendor_templates` 自动推断
✅ **测试通过**: 所有格式推断测试通过（21/21）
✅ **向后兼容**: 数据库字段保留，现有功能不受影响
✅ **代码简化**: 移除了手动配置格式的复杂性
