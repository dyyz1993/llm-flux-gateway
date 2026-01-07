# GLM Token 统计为 0 问题 - 根因分析与修复方案

## 问题现象

用户反馈 GLM 请求的 token 统计显示为 0。

**实测 GLM API 响应**：
```json
{
  "usage": {
    "prompt_tokens": 161,
    "completion_tokens": 61,
    "total_tokens": 222
  }
}
```

**数据库记录**：
```json
{
  "promptTokens": 0,
  "completionTokens": 0,
  "totalTokens": 0
}
```

## 根本原因

### 问题定位

**文件**: `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-gateway/controllers/gateway-controller.ts`

**代码位置**: 第 598-602 行（非流式响应处理）

```typescript
// ⭐ FIX: Use transpile with alias resolution (e.g., 'glm' → 'openai')
// This ensures GLM format is properly handled by OpenAI converter
const internalResponseResult = protocolTranspiler.transpile(
  upstreamResponse,
  targetFormat,    // GLM (will resolve to 'openai' converter)
  'openai'         // Internal format (camelCase)  ← ❌ 错误注释！
);
```

### 问题分析

#### 1. `transpile()` 方法的实际行为

```typescript
transpile(data, 'glm', 'openai')
```

- **输入**: GLM 格式（snake_case）: `{ prompt_tokens, completion_tokens }`
- **输出**: **OpenAI API 格式**（snake_case）: `{ prompt_tokens, completion_tokens }`
- **不是 Internal Format**（camelCase）: `{ promptTokens, completionTokens }`

#### 2. 数据流追踪

```
GLM API 响应（snake_case）
  ↓
transpile(glm → openai)
  ↓
OpenAI API 格式（snake_case）← 仍然是 snake_case！
  ↓
Gateway Controller 尝试访问:
  internalResponse.usage.promptTokens  ← camelCase ❌
  ↓
undefined，fallback 到 0
```

#### 3. 字段名不匹配

**transpile() 返回的数据结构**:
```json
{
  "usage": {
    "prompt_tokens": 161,      // ← snake_case
    "completion_tokens": 61,   // ← snake_case
    "total_tokens": 222        // ← snake_case
  }
}
```

**Gateway Controller 期望的字段名** (第 719 行):
```typescript
promptTokens = internalResponse.usage.promptTokens || 0;        // ← camelCase ❌
completionTokens = internalResponse.usage.completionTokens || 0; // ← camelCase ❌
```

**结果**: 字段名不匹配，导致 token 统计为 0。

### 为什么会混淆？

注释中的误导：
```typescript
const internalResponseResult = protocolTranspiler.transpile(
  upstreamResponse,
  targetFormat,    // GLM (will resolve to 'openai' converter)
  'openai'         // Internal format (camelCase)  ← ❌ 这是错的！
);
```

**`transpile()` 的第二个参数是输出格式，不是"Internal Format"**：
- `transpile(data, 'glm', 'openai')` → 输出 OpenAI API 格式（snake_case）
- `converter.convertResponseToInternal(data)` → 输出 Internal Format（camelCase）

## 影响范围

### 受影响的组件

1. **所有使用 `transpile()` 的非流式响应处理**
2. **GLM 所有模型**（glm-4-flash, glm-4-air, glm-4-plus 等）
3. **任何使用 OpenAI 格式的厂商**（如果使用了错误的转换方法）

### 受影响的数据

- `promptTokens` 存储为 0
- `completionTokens` 存储为 0
- `cachedTokens` 可能也受影响
- 数据库中的 token 统计不准确

### 业务影响

- ❌ Token 使用统计不准确
- ❌ 计费数据错误
- ❌ 分析数据损坏

## 修复方案

### 方案 1: 使用正确的转换方法（推荐）⭐

**修改位置**: `gateway-controller.ts` 第 598-602 行

```typescript
// ❌ 错误：transpile() 返回 OpenAI API 格式，不是 Internal Format
const internalResponseResult = protocolTranspiler.transpile(
  upstreamResponse,
  targetFormat,
  'openai'
);

// ✅ 正确：直接调用 converter 得到 Internal Format
const sourceConverter = (protocolTranspiler as any).converters.get(targetFormat);
const internalResponseResult = sourceConverter.convertResponseToInternal(upstreamResponse);
```

**优点**:
- ✅ 符合架构设计
- ✅ 直接得到 Internal Format
- ✅ 不需要多层转换
- ✅ 代码更清晰

**缺点**:
- ⚠️ 需要访问 transpiler 内部的 converters Map（轻微违反封装）

### 方案 2: 在 Gateway Controller 添加 defensive fallback

**修改位置**: `gateway-controller.ts` 第 717-737 行

```typescript
if (internalResponse?.usage) {
  // Primary: Use Internal Format (camelCase)
  promptTokens = internalResponse.usage.promptTokens || 0;
  completionTokens = internalResponse.usage.completionTokens || 0;
  cachedTokens = internalResponse.usage.cacheReadTokens ||
                 internalResponse.usage.promptTokensDetails?.cachedTokens ||
                 0;

  // 🔧 DEFENSIVE FALLBACK: Handle snake_case (for compatibility)
  if (promptTokens === 0) {
    promptTokens = (internalResponse.usage as any).prompt_tokens || 0;
  }
  if (completionTokens === 0) {
    completionTokens = (internalResponse.usage as any).completion_tokens || 0;
  }
  if (cachedTokens === 0) {
    cachedTokens = (internalResponse.usage as any).cache_read_tokens ||
                   (internalResponse.usage as any).cache_read_input_tokens || 0;
  }
}
```

**优点**:
- ✅ 向后兼容
- ✅ 处理多种格式
- ✅ 防御性编程

**缺点**:
- ❌ Hack，违反架构原则
- ❌ Gateway Controller 不应该处理厂商差异
- ❌ 掩盖了真正的问题

### 方案 3: 修复 ProtocolTranspiler 提供 getInternalFormat() 方法

**新增方法**: `protocol-transpiler.ts`

```typescript
/**
 * Convert vendor response to Internal Format
 * This is the preferred method for gateway to get Internal Format
 */
convertResponseToInternal(
  response: unknown,
  sourceFormat: string
): TranspileResult<InternalResponse> {
  const converter = this.converters.get(sourceFormat);
  if (!converter) {
    return failure([createError('', `No converter found for format: ${sourceFormat}`, 'CONVERTER_NOT_FOUND' as const)]);
  }
  return converter.convertResponseToInternal(response);
}
```

**使用方式**:
```typescript
// ✅ 推荐：使用公开的 API
const internalResponseResult = protocolTranspiler.convertResponseToInternal(
  upstreamResponse,
  targetFormat
);
```

**优点**:
- ✅ 最佳实践
- ✅ 不违反封装
- ✅ API 清晰
- ✅ 符合架构设计

**缺点**:
- ⚠️ 需要修改 ProtocolTranspiler 接口

## 推荐实施计划

### 阶段 1: 立即修复（方案 3）⭐

1. 在 `ProtocolTranspiler` 中添加 `convertResponseToInternal()` 公开方法
2. 修改 `gateway-controller.ts` 使用新方法
3. 添加单元测试验证修复

### 阶段 2: 清理技术债

1. 审查所有使用 `transpile()` 的地方
2. 确保使用正确的转换方法
3. 更新文档和注释

### 阶段 3: 数据修复（可选）

1. 识别受影响的数据库记录
2. 从 `originalResponse` 字段重新提取 token
3. 更新数据库记录

## 测试验证

已创建测试文件：`src/server/module-gateway/controllers/__tests__/glm-token-zero-bug.test.ts`

**测试结果**:
```
✅ transpile() 返回 OpenAI API 格式（snake_case）
✅ Gateway Controller 访问 camelCase 字段失败
✅ 直接调用 converter.convertResponseToInternal() 返回 Internal Format
✅ Token 提取成功
```

## 相关文件

- **问题代码**: `/src/server/module-gateway/controllers/gateway-controller.ts` (第 598-602 行)
- **测试文件**: `/src/server/module-gateway/controllers/__tests__/glm-token-zero-bug.test.ts`
- **Converter**: `/src/server/module-protocol-transpiler/converters/openai.converter.ts`
- **Transpiler**: `/src/server/module-protocol-transpiler/core/protocol-transpiler.ts`

## 总结

**根因**: 使用了 `transpile()` 方法，它返回的是 OpenAI API 格式（snake_case），而不是 Internal Format（camelCase）。

**修复**: 应该使用 `converter.convertResponseToInternal()` 或 ProtocolTranspiler 提供的公开 API 来获取 Internal Format。

**影响**: 所有 GLM 请求的 token 统计为 0，影响计费和分析。

**优先级**: 🔴 高 - 应立即修复。
