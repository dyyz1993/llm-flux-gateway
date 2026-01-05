# 协议转换架构规范

> **核心原则**: 网关应该是协议无关的，尽量提供统一的抽象层。

## 1. 架构分层

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

### 2.1 通用字段（优先级最高）

**定义**: 所有主流 LLM API 都支持的字段。

| 通用概念 | Internal Format | 说明 |
|---------|----------------|------|
| 输入 tokens | `promptTokens` | 所有厂商都有 |
| 输出 tokens | `completionTokens` | 所有厂商都有 |
| 总 tokens | `totalTokens` | 所有厂商都有 |
| 内容 | `content` | 统一使用 |
| 角色 | `role` | 统一使用 |
| 停止原因 | `finishReason` | 统一使用 camelCase |

**处理原则**:
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
| `cacheReadTokens` | Anthropic | 缓存读取token计费 | ✅ 计费必需 |
| `cacheWriteTokens` | Anthropic | 缓存创建token计费 | ✅ 计费必需 |
| `thinkingTokens` | Anthropic | 推理模式token | ⚠️ 可选 |
| `groundingTokens` | Gemini | 引用来源token | ⚠️ 可选 |
| `reasoningTokens` | OpenAI | 推理token | ⚠️ 可选 |

**命名规范**:
- 使用 camelCase
- 描述性命名（不要加厂商前缀）
- 示例: `cacheReadTokens` 而非 `anthropicCacheReadTokens`

**理由**:
- 如果多个厂商实现类似功能，应该用同一个字段名
- 厂商前缀会增加耦合度
- 通过 Converter 注释说明来源即可

### 2.3 废弃字段（禁止使用）

**定义**: 已被替代或不再推荐使用的字段。

| 字段 | 状态 | 替代方案 |
|-----|------|---------|
| `prompt_tokens` | ❌ 废弃 | 使用 `promptTokens` |
| `completion_tokens` | ❌ 废弃 | 使用 `completionTokens` |
| `input_tokens` | ❌ 废弃 | 映射到 `promptTokens` |
| `output_tokens` | ❌ 废弃 | 映射到 `completionTokens` |

## 3. Internal Format 规范

### 3.1 TypeScript 接口定义

```typescript
/**
 * Internal Format - 统一的内部协议格式
 *
 * 设计原则:
 * 1. 基于 OpenAI API 格式，但使用 camelCase
 * 2. 优先使用通用字段，厂商特有字段尽量少用
 * 3. 所有 Converter 必须输出此格式
 */
export interface InternalResponse {
  // === 通用字段（必须实现） ===
  choices: InternalChoice[];
  usage: InternalUsage;

  // === 厂商特有字段（谨慎使用） ===
  // 只在业务确实需要时添加
  vendorSpecific?: Record<string, unknown>;
}

export interface InternalUsage {
  // 通用字段
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;

  // 厂商特有字段
  cacheReadTokens?: number;      // Anthropic/Gemini 缓存
  cacheWriteTokens?: number;     // Anthropic 缓存写入
  thinkingTokens?: number;       // Anthropic 推理模式
  reasoningTokens?: number;      // OpenAI 推理

  // 嵌套详情（OpenAI 风格）
  promptTokensDetails?: {
    cachedTokens?: number;
  };
  completionTokensDetails?: {
    reasoningTokens?: number;
    acceptedPredictionTokens?: number;
    rejectedPredictionTokens?: number;
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
    choices: [...],
    usage: {
      // 通用字段：映射到统一命名
      promptTokens: anthropicResp.usage?.input_tokens || 0,
      completionTokens: anthropicResp.usage?.output_tokens || 0,
      totalTokens: (anthropicResp.usage?.input_tokens || 0) +
                   (anthropicResp.usage?.output_tokens || 0),

      // 厂商特有字段：只在需要时保留
      cacheReadTokens: anthropicResp.usage?.cache_read_input_tokens,
      cacheWriteTokens: anthropicResp.usage?.cache_creation_input_tokens,
      thinkingTokens: anthropicResp.usage?.thinking_tokens,
    }
  };
}
```

**❌ 错误示例**:

```typescript
// ❌ 错误：输出 snake_case
usage: {
  prompt_tokens: anthropicResp.usage?.input_tokens || 0,
  completion_tokens: anthropicResp.usage?.output_tokens || 0,
}

// ❌ 错误：使用厂商前缀
anthropic_cache_read_tokens: ...,
gemini_grounding_tokens: ...,

// ❌ 错误：保留原始字段名
input_tokens: anthropicResp.usage?.input_tokens || 0,
output_tokens: anthropicResp.usage?.output_tokens || 0,
```

### 3.3 Gateway Controller 使用规范

**✅ 正确示例**:

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

**❌ 错误示例**:

```typescript
// ❌ 错误：直接访问上游响应
const usage = (upstreamResponse as any).usage;
promptTokens: usage.prompt_tokens || usage.input_tokens || 0,

// ❌ 错误：绕过 Transpiler
// 直接从原始响应提取数据
```

## 4. 字段映射表

### 4.1 Usage 字段映射

| Internal Format | OpenAI | Anthropic | Gemini | GLM |
|----------------|--------|-----------|--------|-----|
| `promptTokens` | `prompt_tokens` | `input_tokens` | `promptToken` | `prompt_tokens` |
| `completionTokens` | `completion_tokens` | `output_tokens` | `candidatesToken` | `completion_tokens` |
| `totalTokens` | `total_tokens` | 计算 | `totalToken` | `total_tokens` |
| `cacheReadTokens` | `prompt_tokens_details.cached_tokens` | `cache_read_input_tokens` | `cachedContentToken` | - |
| `cacheWriteTokens` | - | `cache_creation_input_tokens` | - | - |

### 4.2 其他字段映射

详见 `/src/server/module-protocol-transpiler/utils/field-normalizer.ts`

## 5. 实施检查清单

### 5.1 新增 Converter 时

- [ ] 实现 `convertResponseToInternal()` 输出 camelCase
- [ ] 实现 `convertRequestFromInternal()` 处理 camelCase
- [ ] 映射所有通用字段
- [ ] 只保留必要的厂商特有字段
- [ ] 添加单元测试验证输出格式
- [ ] 在字段映射表中添加记录

### 5.2 修改 Internal Format 时

- [ ] 更新 TypeScript 接口定义
- [ ] 更新所有 Converter 实现
- [ ] 更新所有测试断言
- [ ] 更新字段映射表
- [ ] 更新本规范文档

### 5.3 Code Review 检查点

- [ ] 是否使用了 `as any` 绕过类型检查？
- [ ] 是否在 Gateway Controller 中处理厂商差异？
- [ ] 是否有废弃的字段名（snake_case）？
- [ ] 厂商特有字段是否真的必要？
- [ ] 测试是否覆盖了所有字段映射？

## 6. 常见问题

### Q1: 为什么不使用厂商前缀？

**A**: 厂商前缀会增加耦合度，而且如果多个厂商实现类似功能，会导致字段爆炸。

```typescript
// ❌ 不推荐: 厂商前缀
anthropic_cache_read_tokens: number;
gemini_cached_content_tokens: number;
openai_cached_tokens: number;

// ✅ 推荐: 统一命名
cacheReadTokens: number;  // Converter 负责映射
```

### Q2: 如何处理只有某个厂商有的字段？

**A**: 先评估是否真的需要：
1. **不需要**: 不在 Internal Format 中保留，通过 `originalResponse` 访问
2. **需要**: 使用描述性命名（不加厂商前缀），在 Converter 中注释说明来源

### Q3: Gateway Controller 需要知道上游厂商吗？

**A**: **不应该**。Gateway Controller 应该只处理 Internal Format，所有厂商差异在 Transpiler 层解决。

### Q4: 如何保证 Converter 输出格式正确？

**A**:
1. 单元测试: 验证输出符合 Internal Format 接口
2. TypeScript: 严格类型检查，避免使用 `as any`
3. 集成测试: 端到端验证字段映射正确性

## 7. 违反规范的后果

| 违规行为 | 后果 | 严重程度 |
|---------|------|---------|
| Gateway Controller 直接访问上游字段 | 架构混乱、难以维护 | 🔴 高 |
| Converter 输出 snake_case | 类型不安全、容易出错 | 🔴 高 |
| 过度使用厂商特有字段 | 丧失协议无关性 | 🟡 中 |
| 缺少单测覆盖 | 回归风险 | 🟡 中 |

## 8. 相关文档

- [Internal Format 定义](../src/server/module-protocol-transpiler/interfaces/internal-format.ts)
- [字段规范化工具](../src/server/module-protocol-transpiler/utils/field-normalizer.ts)
- [现有架构问题研究](./INTERNAL_FORMAT_CAMELCASE_RESEARCH.md)
- [字段映射表](../src/server/module-protocol-transpiler/docs/VENDOR_FIELD_MAPPINGS.md) (待创建)

## 9. 版本历史

| 版本 | 日期 | 变更内容 |
|-----|------|---------|
| 1.0 | 2025-01-05 | 初始版本，明确架构分层和字段处理原则 |

---

**维护者**: 架构组
**最后更新**: 2025-01-05
**状态**: 🟢 有效
