# Tool Calls 架构问题分析报告

## 问题描述

用户发现某些日志的 `responseToolCalls` 字段为空，导致前端无法显示工具调用卡片。

## 当前实现（错误）

### Gateway Controller (gateway-controller.ts:705-721)

```typescript
// Extract tool calls from Internal Format
let responseToolCalls = internalResponse?.choices?.[0]?.message?.toolCalls;

// 🔧 FIX: Defensive fallback - extract from originalResponse if internalResponse is missing toolCalls
if ((!responseToolCalls || responseToolCalls.length === 0) && originalResponse && typeof originalResponse === 'object') {
  const originalMessage = (originalResponse as any).choices?.[0]?.message;
  if (originalMessage) {
    const toolCallsData = originalMessage.tool_calls || originalMessage.toolCalls;
    if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
      responseToolCalls = toolCallsData;
      console.log('[Gateway] Extracted tool_calls from originalResponse (fallback):', toolCallsData.length);
    }
  }
}
```

**问题**: 这个修复违反了分层架构原则

## 正确架构

### 分层职责

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Gateway Controller & Business Logic               │
│  ─────────────────────────────────────────────────────────  │
│  职责: 业务逻辑、请求路由、日志记录                           │
│  依赖: 只处理 Internal Format (camelCase)                   │
│  禁止: 直接访问上游 API 的字段名                             │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Internal Format (统一抽象)
                     │
┌────────────────────▼────────────────────────────────────────┐
│  Layer 2: Protocol Transpiler                               │
│  ─────────────────────────────────────────────────────────  │
│  职责: 协议转换、字段归一化、格式规范化                       │
│  输入: 任意厂商格式 (OpenAI/Anthropic/Gemini/GLM)            │
│  输出: Internal Format (camelCase)                          │
│  核心: 所有字段名差异在此层解决                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Vendor Format
                     │
┌────────────────────▼────────────────────────────────────────┐
│  Layer 1: Upstream APIs                                     │
│  OpenAI: snake_case (prompt_tokens, tool_calls)             │
│  Anthropic: snake_case (input_tokens, content array)        │
│  Gemini: camelCase (promptToken, candidatesToken)           │
│  GLM: 混合格式 (tool_calls + finishReason)                  │
└─────────────────────────────────────────────────────────────┘
```

### 各层职责

| 层级 | 模块 | 职责 | 访问权限 |
|------|------|------|----------|
| Layer 1 | Upstream APIs | 厂商原生格式 | - |
| Layer 2 | Protocol Transpiler | 转换为 Internal Format | 可以访问 vendor format |
| Layer 3 | Gateway Controller | 业务逻辑 | **只能访问 Internal Format** |

## 根本原因分析

### 问题 1: GLM 混合格式

GLM API 声称 OpenAI 兼容，但返回混合格式：

```javascript
{
  "choices": [{
    "message": {
      "content": [],  // ← Anthropic 风格的数组
      "tool_calls": [...],  // ← OpenAI 风格的 snake_case
    },
    "finishReason": "tool_calls"  // ← 非标准的 camelCase
  }],
  "usage": {
    "promptTokens": 50,  // ← 非标准的 camelCase
    "completionTokens": 20
  }
}
```

### 问题 2: VendorType 缺少 GLM

`vendor-types.ts` 中没有定义 `'glm'` 类型：

```typescript
export type VendorType = 'openai' | 'openai-responses' | 'anthropic' | 'gemini' | 'custom';
// ❌ 缺少 'glm'
```

### 问题 3: OpenAI Converter 处理 GLM

GLM 请求被标记为 `'openai'` 格式，使用 `OpenAIConverter`：

```typescript
// gateway-controller.ts:597
internalResponseResult = sourceConverter.convertResponseToInternal(upstreamResponse);
// ↑ 使用 OpenAI converter 处理 GLM 响应
```

### 问题 4: normalizeToCamelCase 可能的问题

`normalizeToCamelCase` 函数理论上应该能正确转换所有 snake_case 字段为 camelCase，但可能存在以下问题：

1. **字段已存在 camelCase 版本**：如果原始响应同时包含 `tool_calls` 和 `toolCalls`，可能导致覆盖
2. **嵌套路径处理**：某些深层嵌套的字段可能没有被正确处理
3. **特殊字段跳过**：tool schema 相关字段被跳过规范化

## 正确的修复方案

### 方案 1: 增强 OpenAI Converter（推荐）

在 `OpenAIConverter.convertResponseToInternal()` 中确保 `toolCalls` 始终被提取：

```typescript
// openai.converter.ts:convertResponseToInternal
convertResponseToInternal(response: unknown): TranspileResult<InternalResponse> {
  const startTime = Date.now();

  // 验证...
  const resp = response as Record<string, any>;

  // 标准化字段名
  const normalizedResponse = normalizeToCamelCase(resp, true) as InternalResponse;

  // 🔧 FIX: 确保 toolCalls 字段存在（处理混合格式）
  if (normalizedResponse.choices?.[0]?.message) {
    const message = normalizedResponse.choices[0].message;

    // 如果 toolCalls 不存在，尝试从原始响应提取
    if ((!message.toolCalls || message.toolCalls.length === 0)) {
      const toolCallsData = resp.choices?.[0]?.message?.tool_calls ||
                           resp.choices?.[0]?.message?.toolCalls;

      if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
        message.toolCalls = toolCallsData;
        console.log('[OpenAIConverter] Extracted tool_calls from original response:', toolCallsData.length);
      }
    }
  }

  return success(normalizedResponse, metadata);
}
```

### 方案 2: 创建 GLM Converter

创建专门的 `glm.converter.ts` 来处理 GLM 的混合格式：

```typescript
export class GLMConverter implements FormatConverter {
  readonly vendorType: VendorType = 'glm';

  convertResponseToInternal(response: unknown): TranspileResult<InternalResponse> {
    // 1. 标准化字段名（处理混合格式）
    const normalized = normalizeToCamelCase(response, true);

    // 2. 确保 toolCalls 存在
    // 3. 确保 usage 字段正确

    return success(normalized, metadata);
  }
}
```

需要在 `vendor-types.ts` 中添加：
```typescript
export type VendorType = 'openai' | 'anthropic' | 'gemini' | 'glm' | 'custom';
```

### 方案 3: 在 Protocol Transpiler 层添加 fallback

在 `protocol-transpiler.ts` 的 `transpile()` 方法中，当转换失败时添加 fallback：

```typescript
// protocol-transpiler.ts:152-176
} else if (isResponse) {
  // Response conversion: source → Internal → target
  const internalResult = sourceConverter.convertResponseToInternal(sourceData);

  if (!internalResult.success) {
    // 🔧 FIX: Try to extract critical fields even if conversion failed
    const partialInternal = this.extractPartialInternalFormat(sourceData);
    return success(partialInternal, internalResult.metadata);
  }

  // ...
}
```

## 建议实施顺序

1. **Phase 1**: 使用方案 1（增强 OpenAI Converter）
   - 最小改动
   - 在 Protocol Transpiler 层处理
   - 不破坏现有架构

2. **Phase 2**: 根据需求决定是否创建 GLM Converter
   - 如果 GLM 特殊字段很多，值得单独处理
   - 如果只是少量字段混合，方案 1 足够

3. **Phase 3**: 移除 Gateway Controller 中的 fallback
   - 在确认 Protocol Transpiler 正确处理后
   - 删除第 705-721 行的代码

## 测试验证

需要测试的场景：

1. **标准 OpenAI 响应** (snake_case)
   ```json
   {"tool_calls": [{"id": "call_123", "type": "function", ...}]}
   ```

2. **GLM 混合格式** (snake_case tool_calls + camelCase finishReason)
   ```json
   {"tool_calls": [...], "finishReason": "tool_calls"}
   ```

3. **已有 camelCase 的响应**
   ```json
   {"toolCalls": [...], "finishReason": "stop"}
   ```

4. **同时包含 snake_case 和 camelCase**
   ```json
   {"tool_calls": [...], "toolCalls": [...]}
   ```

## 相关文件

- `/src/server/module-gateway/controllers/gateway-controller.ts:705-721`
- `/src/server/module-protocol-transpiler/converters/openai.converter.ts:132-171`
- `/src/server/module-protocol-transpiler/utils/field-normalizer.ts:366-408`
- `/src/server/module-protocol-transpiler/interfaces/vendor-types.ts:39`

## 结论

用户的质疑是正确的：**修复应该在 Protocol Transpiler 层，而不是 Gateway Controller 层**。

当前实现的 defensive fallback 确实解决了问题，但违反了架构分层原则。正确的做法是：

1. 在 `OpenAIConverter.convertResponseToInternal()` 中确保 `toolCalls` 始终被正确提取
2. 移除 Gateway Controller 中的 fallback 逻辑
3. 保持架构分层清晰

---

**生成时间**: 2025-01-05
**问题 ID**: Tool Calls Architecture Violation
**状态**: 待修复
