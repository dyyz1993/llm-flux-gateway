# 协议转换架构规则

> **核心原则**: 网关应该是协议无关的，尽量提供统一的抽象层。厂商特有字段尽量少用。

## 1. 架构分层（强制）

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
│  ─────────────────────────────────────────────────────────  │
│  OpenAI: snake_case (prompt_tokens)                         │
│  Anthropic: snake_case (input_tokens)                       │
│  Gemini: camelCase (promptToken)                            │
│  GLM: snake_case (prompt_tokens)                            │
└─────────────────────────────────────────────────────────────┘
```

## 2. 字段分类与处理原则

### 2.1 通用字段（必须实现）

**定义**: 所有主流 LLM API 都支持的字段。

| Internal Format | OpenAI | Anthropic | Gemini | GLM |
|----------------|--------|-----------|--------|-----|
| `promptTokens` | `prompt_tokens` | `input_tokens` | `promptToken` | `prompt_tokens` |
| `completionTokens` | `completion_tokens` | `output_tokens` | `candidatesToken` | `completion_tokens` |
| `totalTokens` | `total_tokens` | 计算 | `totalToken` | `total_tokens` |

**规则**:
- ✅ **必须**: 所有 Converter 必须映射到这些字段
- ✅ **必须**: 使用 camelCase 命名
- ❌ **禁止**: 在 Gateway Controller 中处理厂商差异

### 2.2 厂商特有字段（尽量少用）

**定义**: 只有特定厂商提供的功能。

**使用原则**:
- ⚠️ **谨慎**: 只有业务确实需要时才保留
- ⚠️ **谨慎**: 优先考虑是否可以映射到通用字段
- ⚠️ **谨慎**: 文档化为什么需要这个字段

**现有厂商特有字段**:

| 字段 | 厂商 | 用途 | 是否必须 |
|-----|------|------|---------|
| `cacheReadTokens` | Anthropic/Gemini | 缓存读取token计费 | ✅ 计费必需 |
| `cacheWriteTokens` | Anthropic | 缓存创建token计费 | ✅ 计费必需 |
| `thinkingTokens` | Anthropic | 推理模式token | ⚠️ 可选 |

**命名规范**:
- ✅ 使用 camelCase
- ✅ 描述性命名
- ❌ **禁止使用厂商前缀**

```typescript
// ✅ 正确
cacheReadTokens: number;
thinkingTokens: number;

// ❌ 错误：厂商前缀
anthropic_cache_read_tokens: number;
anthropicThinkingTokens: number;
```

**理由**: 如果多个厂商实现类似功能，应该用同一个字段名，避免字段爆炸。

### 2.3 废弃字段（禁止使用）

| 废弃字段 | 替代方案 |
|---------|---------|
| `prompt_tokens` | `promptTokens` |
| `completion_tokens` | `completionTokens` |
| `input_tokens` | 映射到 `promptTokens` |
| `output_tokens` | 映射到 `completionTokens` |

## 3. Internal Format 规范

### 3.1 TypeScript 接口定义

```typescript
// src/server/module-protocol-transpiler/interfaces/internal-format.ts

export interface InternalUsage {
  // === 通用字段（必须实现） ===
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;

  // === 厂商特有字段（谨慎使用） ===
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  thinkingTokens?: number;

  // === 嵌套详情 ===
  promptTokensDetails?: {
    cachedTokens?: number;
  };
  completionTokensDetails?: {
    reasoningTokens?: number;
  };
}
```

### 3.2 Converter 实现规范

**✅ 正确示例**:

```typescript
// anthropic.converter.ts
export function convertResponseToInternal(
  anthropicResp: AnthropicResponse
): InternalResponse {
  return {
    usage: {
      // 通用字段：映射到统一命名
      promptTokens: anthropicResp.usage?.input_tokens || 0,
      completionTokens: anthropicResp.usage?.output_tokens || 0,
      totalTokens: (anthropicResp.usage?.input_tokens || 0) +
                   (anthropicResp.usage?.output_tokens || 0),

      // 厂商特有字段：只在需要时保留
      cacheReadTokens: anthropicResp.usage?.cache_read_input_tokens,
      cacheWriteTokens: anthropicResp.usage?.cache_creation_input_tokens,
    }
  };
}
```

**❌ 禁止的写法**:

```typescript
// ❌ 错误：输出 snake_case
usage: {
  prompt_tokens: ...,
  completion_tokens: ...,
}

// ❌ 错误：使用厂商前缀
anthropic_cache_read_tokens: ...,

// ❌ 错误：保留原始字段名
input_tokens: ...,
output_tokens: ...,
```

### 3.3 Gateway Controller 使用规范

**✅ 正确**:

```typescript
// gateway-controller.ts
// ✅ 只访问 Internal Format 的 camelCase 字段
const usage = internalResponse.usage;
await requestLogService.updateLog(logId, {
  promptTokens: usage.promptTokens,
  completionTokens: usage.completionTokens,
  cachedTokens: usage.cacheReadTokens || 0,
});
```

**❌ 错误**:

```typescript
// ❌ 错误：直接访问上游响应
const usage = (upstreamResponse as any).usage;
promptTokens: usage.prompt_tokens || usage.input_tokens || 0,

// ❌ 错误：绕过 Transpiler
// 直接从原始响应提取数据
```

## 4. Code Review 检查清单

在审查 Converter 或 Gateway Controller 代码时，必须检查：

### 4.1 Converter 检查点

- [ ] 输出格式是否使用 camelCase？
- [ ] 是否映射了所有通用字段？
- [ ] 厂商特有字段是否真的必要？
- [ ] 是否使用了废弃的字段名（snake_case）？
- [ ] 是否有单元测试验证输出格式？

### 4.2 Gateway Controller 检查点

- [ ] 是否只访问 Internal Format？
- [ ] 是否使用了 `as any` 绕过类型检查？
- [ ] 是否有处理厂商差异的代码（`||` 多个字段名）？
- [ ] 是否直接访问 `upstreamResponse` 的字段？

## 5. 违反规范的后果

| 违规行为 | 后果 | 严重程度 |
|---------|------|---------|
| Gateway Controller 直接访问上游字段 | 架构混乱、难以维护 | 🔴 高 |
| Converter 输出 snake_case | 类型不安全、容易出错 | 🔴 高 |
| 过度使用厂商特有字段 | 丧失协议无关性 | 🟡 中 |
| 缺少单测覆盖 | 回归风险 | 🟡 中 |

## 6. 相关文档

- [详细架构规范](../../docs/PROTOCOL_TRANSFORMATION_ARCHITECTURE.md)
- [重构实施计划](../../docs/PROTOCOL_REFACTORING_PLAN.md)
- [Internal Format 定义](../../src/server/module-protocol-transpiler/interfaces/internal-format.ts)
- [字段规范化工具](../../src/server/module-protocol-transpiler/utils/field-normalizer.ts)

---

**维护者**: 架构组
**最后更新**: 2025-01-05
**版本**: 1.0
