# 协议转换架构重构实施计划

> **目标**: 修复 Internal Format 定义与实现不一致的问题，建立清晰的协议转换架构。

## 问题摘要

**现状**:
- Internal Format 定义使用 `camelCase` (promptTokens)
- Converter 实际输出使用 `snake_case` (prompt_tokens)
- Gateway Controller 需要兼容多种格式，违反抽象层原则

**目标**:
- 所有 Converter 输出统一的 `camelCase` 格式
- Gateway Controller 只处理 Internal Format
- 厂商差异完全隔离在 Transpiler 层

## 1. 改动文件清单

### 1.1 Converter 文件 (P0 - 核心改动)

| 文件 | 改动内容 | 优先级 | 风险 |
|-----|---------|-------|------|
| `anthropic.converter.ts` | 修改 usage 字段输出为 camelCase | P0 | 高 |
| `gemini.converter.ts` | 检查并修改 usage 字段输出 | P0 | 中 |
| `openai.converter.ts` | 检查并确保输出 camelCase | P0 | 低 |
| `glm.converter.ts` | 检查并修改 usage 字段输出 | P0 | 中 |

**具体改动点**:

#### anthropic.converter.ts

**位置**: 第 774-781 行
```typescript
// ❌ 修改前
usage: {
  prompt_tokens: anthropicResp.usage?.input_tokens || 0,
  completion_tokens: anthropicResp.usage?.output_tokens || 0,
  total_tokens: ...,
  cache_read_tokens: ...,
  cache_write_tokens: ...,
}

// ✅ 修改后
usage: {
  promptTokens: anthropicResp.usage?.input_tokens || 0,
  completionTokens: anthropicResp.usage?.output_tokens || 0,
  totalTokens: ...,
  cacheReadTokens: ...,
  cacheWriteTokens: ...,
}
```

**流式响应**: 第 1384-1391 行，同样的改动

#### gemini.converter.ts

需要检查并确保输出 camelCase，特别是：
- `promptToken` → `promptTokens`
- `candidatesToken` → `completionTokens`
- `totalToken` → `totalTokens`

### 1.2 Gateway Controller (P1 - 清理改动)

| 文件 | 改动内容 | 优先级 | 风险 |
|-----|---------|-------|------|
| `gateway-controller.ts` | 移除格式兼容代码，只处理 camelCase | P1 | 中 |

**具体改动点**:

#### 非流式响应 (第 712-720 行)

```typescript
// ❌ 修改前
const usage = (upstreamResponse as any).usage || {};
promptTokens: usage.prompt_tokens || usage.input_tokens || 0,
completionTokens: usage.completion_tokens || usage.output_tokens || 0,

// ✅ 修改后
const usage = internalResponse.usage;  // 从 Transpiler 获取
promptTokens: usage.promptTokens,
completionTokens: usage.completionTokens,
```

#### 流式响应 (第 396-401 行)

```typescript
// ❌ 修改前
promptTokens = chunkData.usage.prompt_tokens || 0;

// ✅ 修改后
promptTokens = chunkData.usage.promptTokens;
```

### 1.3 测试文件 (P2 - 测试更新)

| 测试文件 | 需要修改的断言 | 优先级 |
|---------|--------------|-------|
| `anthropic.converter.test.ts` | `prompt_tokens` → `promptTokens` | P0 |
| `anthropic.streaming.test.ts` | 流式响应字段名 | P0 |
| `gemini.converter.test.ts` | 检查并更新断言 | P0 |
| `gateway-controller.test.ts` | 移除格式兼容测试 | P1 |
| `protocol-transpiler.test.ts` | 验证输出格式 | P1 |

### 1.4 日志服务 (P1 - 辅助改动)

| 文件 | 改动内容 |
|-----|---------|
| `protocol-transformation-logger.service.ts` | 已在前面修复 |

## 2. 单测计划（单测先行）

### 2.1 Phase 1: 现有测试覆盖验证

**目标**: 确保所有改动点都有测试覆盖

```bash
# 运行现有测试
npm test -- --run

# 生成覆盖率报告
npm test -- --coverage
```

**检查清单**:
- [ ] 所有 Converter 都有单元测试
- [ ] 所有字段映射都有测试覆盖
- [ ] 流式和非流式响应都有测试

### 2.2 Phase 2: 新增输出格式验证测试

**文件**: `src/server/module-protocol-transpiler/converters/__tests__/internal-format-validation.test.ts`

**目的**: 验证所有 Converter 输出符合 Internal Format 定义

```typescript
import { describe, it, expect } from 'vitest';
import { InternalResponse } from '../../interfaces/internal-format';
import { convertResponseToInternal as anthropicToInternal } from '../anthropic.converter';
import { convertResponseToInternal as geminiToInternal } from '../gemini.converter';
import { convertResponseToInternal as openaiToInternal } from '../openai.converter';

describe('Internal Format Validation', () => {
  describe('must output camelCase', () => {
    it('Anthropic converter should output promptTokens not prompt_tokens', () => {
      const result = anthropicToInternal(mockAnthropicResponse);
      expect(result.usage).toHaveProperty('promptTokens');
      expect(result.usage).not.toHaveProperty('prompt_tokens');
    });

    it('Anthropic converter should output completionTokens not completion_tokens', () => {
      const result = anthropicToInternal(mockAnthropicResponse);
      expect(result.usage).toHaveProperty('completionTokens');
      expect(result.usage).not.toHaveProperty('completion_tokens');
    });

    it('Gemini converter should output promptTokens', () => {
      const result = geminiToInternal(mockGeminiResponse);
      expect(result.usage).toHaveProperty('promptTokens');
      expect(result.usage).not.toHaveProperty('promptToken');
    });
  });

  describe('must map common fields correctly', () => {
    it('should map input_tokens → promptTokens', () => {
      const result = anthropicToInternal({
        usage: { input_tokens: 1000 }
      });
      expect(result.usage.promptTokens).toBe(1000);
    });

    it('should map output_tokens → completionTokens', () => {
      const result = anthropicToInternal({
        usage: { output_tokens: 500 }
      });
      expect(result.usage.completionTokens).toBe(500);
    });
  });

  describe('vendor-specific fields', () => {
    it('should preserve cacheReadTokens', () => {
      const result = anthropicToInternal({
        usage: { cache_read_input_tokens: 100 }
      });
      expect(result.usage.cacheReadTokens).toBe(100);
    });

    it('should preserve thinkingTokens', () => {
      const result = anthropicToInternal({
        usage: { thinking_tokens: 50 }
      });
      expect(result.usage.thinkingTokens).toBe(50);
    });
  });
});
```

### 2.3 Phase 3: 字段映射正确性测试

**文件**: `src/server/module-protocol-transpiler/converters/__tests__/field-mapping.test.ts`

**目的**: 验证每个厂商的字段都正确映射

```typescript
describe('Field Mapping Correctness', () => {
  describe('Anthropic', () => {
    const mapping = {
      'input_tokens': 'promptTokens',
      'output_tokens': 'completionTokens',
      'cache_read_input_tokens': 'cacheReadTokens',
      'cache_creation_input_tokens': 'cacheWriteTokens',
      'thinking_tokens': 'thinkingTokens',
    };

    Object.entries(mapping).forEach(([source, target]) => {
      it(`should map ${source} → ${target}`, () => {
        const mockResp = { usage: { [source]: 123 } };
        const result = anthropicToInternal(mockResp);
        expect(result.usage[target]).toBe(123);
      });
    });
  });

  describe('Gemini', () => {
    // 类似测试
  });
});
```

### 2.4 Phase 4: Gateway Controller 隔离测试

**文件**: `src/server/module-gateway/controllers/__tests__/gateway-controller-isolation.test.ts`

**目的**: 确保 Gateway Controller 不依赖上游格式

```typescript
describe('Gateway Controller Isolation', () => {
  it('should only access Internal Format fields', async () => {
    // Mock Internal Format response
    const mockInternalResponse = {
      usage: {
        promptTokens: 1000,
        completionTokens: 500,
      }
    };

    // 验证 Controller 只使用 camelCase 字段
    const result = await handleNonStreamingResponse(mockInternalResponse);

    expect(result.promptTokens).toBe(1000);
    expect(result.completionTokens).toBe(500);
  });

  it('should not access upstream fields directly', () => {
    // 这个测试应该通过代码审查或 linter 规则来实现
    // 禁止 usage.prompt_tokens, usage.input_tokens 等
  });
});
```

### 2.5 Phase 5: 回归测试

**目的**: 确保改动不破坏现有功能

```bash
# 运行所有测试
npm test -- --run

# 运行集成测试
npm run test:integration

# 运行 E2E 测试
npx playwright test
```

## 3. 实施步骤

### Step 1: 准备阶段 ✅

- [x] 编写架构规范文档
- [x] 明确字段处理原则
- [ ] 创建分支 `refactor/protocol-transpiler-camelcase`

### Step 2: 单测先行 (2-3小时)

- [ ] Phase 1: 运行现有测试，建立 baseline
- [ ] Phase 2: 创建输出格式验证测试
- [ ] Phase 3: 创建字段映射测试
- [ ] Phase 4: 创建 Gateway Controller 隔离测试
- [ ] **验证**: 新测试应该失败（因为代码还未修改）

### Step 3: 修改 Converter (1-2小时)

- [ ] 修改 `anthropic.converter.ts` 输出 camelCase
- [ ] 修改 `gemini.converter.ts` 输出 camelCase
- [ ] 修改 `glm.converter.ts` 输出 camelCase
- [ ] 验证 `openai.converter.ts` 已正确
- [ ] **验证**: 新测试通过，旧测试失败（预期）

### Step 4: 更新测试断言 (1小时)

- [ ] 更新 `anthropic.converter.test.ts` 断言
- [ ] 更新 `anthropic.streaming.test.ts` 断言
- [ ] 更新 `gemini.converter.test.ts` 断言
- [ ] 更新其他相关测试
- [ ] **验证**: 所有测试通过

### Step 5: 修改 Gateway Controller (1小时)

- [ ] 移除非流式响应的格式兼容代码
- [ ] 移除流式响应的格式兼容代码
- [ ] 移除 `as any` 类型断言
- [ ] **验证**: 所有测试通过

### Step 6: 集成验证 (1小时)

- [ ] 运行完整测试套件
- [ ] 运行集成测试
- [ ] 手动测试真实 API 请求
- [ ] 验证日志记录正确
- [ ] **验证**: 所有功能正常

### Step 7: Code Review & 文档 (1小时)

- [ ] 提交 Pull Request
- [ ] 更新 CHANGELOG.md
- [ ] 更新字段映射表
- [ ] 同步到团队成员
- [ ] **验证**: Review 通过

### Step 8: 合并与部署 (30分钟)

- [ ] 合并到 main 分支
- [ ] 部署到测试环境
- [ ] 监控错误日志
- [ ] 部署到生产环境
- [ ] **验证**: 生产环境正常

## 4. 风险评估

| 风险 | 等级 | 缓解措施 |
|-----|------|---------|
| 破坏现有功能 | 🔴 高 | 1. 单测先行<br>2. 分阶段实施<br>3. 充分测试 |
| 测试覆盖不足 | 🟡 中 | 1. 先补充测试<br>2. 生成覆盖率报告 |
| 数据迁移问题 | 🟡 中 | 1. 不涉及数据库 schema 变更<br>2. 原始数据保留在 original_response |
| 回滚困难 | 🟢 低 | 1. Git 分支管理<br>2. 快速回滚机制 |

### 回滚方案

**方案 A: 代码回滚**
```bash
git revert <commit-hash>
git push
```

**方案 B: 特性开关**（可选）
```typescript
const USE_LEGACY_FIELDS = process.env.LEGACY_FIELDS === 'true';
```

**方案 C: 兼容代码保留**（临时）
```typescript
// 保留兼容逻辑 1-2 周，确认稳定后移除
promptTokens: usage.promptTokens || usage.prompt_tokens || 0,
```

## 5. 验收标准

### 5.1 功能验收

- [ ] 所有 API 请求正常响应
- [ ] Token 统计正确记录
- [ ] 日志格式统一为 camelCase
- [ ] 所有测试通过（100%）

### 5.2 性能验收

- [ ] 响应时间无明显增加 (< 5%)
- [ ] 内存使用无明显增加
- [ ] CPU 使用无明显增加

### 5.3 代码质量验收

- [ ] 无 ESLint 警告
- [ ] 无 TypeScript 类型错误
- [ ] 测试覆盖率 ≥ 80%
- [ ] 无 `console.log` 调试代码

## 6. 时间估算

| 阶段 | 预估时间 | 负责人 |
|-----|---------|-------|
| 准备阶段 | 30min | - |
| 单测先行 | 2-3h | - |
| 修改 Converter | 1-2h | - |
| 更新测试断言 | 1h | - |
| 修改 Gateway Controller | 1h | - |
| 集成验证 | 1h | - |
| Code Review & 文档 | 1h | - |
| 合并与部署 | 30min | - |
| **总计** | **7-10h** | - |

## 7. 相关文档

- [协议转换架构规范](./PROTOCOL_TRANSFORMATION_ARCHITECTURE.md)
- [Internal Format 定义](../src/server/module-protocol-transpiler/interfaces/internal-format.ts)
- [字段映射表](../src/server/module-protocol-transpiler/docs/VENDOR_FIELD_MAPPINGS.md) (待创建)

## 8. 附录

### A. 字段映射速查表

| 厂商 | 原始字段 | Internal Format |
|-----|---------|-----------------|
| OpenAI | `prompt_tokens` | `promptTokens` |
| Anthropic | `input_tokens` | `promptTokens` |
| Gemini | `promptToken` | `promptTokens` |
| GLM | `prompt_tokens` | `promptTokens` |

### B. 检查命令

```bash
# 检查是否有遗留的 snake_case
grep -r "prompt_tokens\|completion_tokens" src/server/module-protocol-transpiler/converters/

# 检查是否有 as any
grep -r "as any" src/server/module-gateway/controllers/

# 运行类型检查
npx tsc --noEmit

# 运行测试
npm test -- --run
```

---

**创建日期**: 2025-01-05
**最后更新**: 2025-01-05
**状态**: 🟡 待执行
**负责人**: 架构组
