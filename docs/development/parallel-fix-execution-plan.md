# 并行修复执行计划

**创建时间**: 2025-01-05
**目标**: 修复剩余 814 个 TypeScript 错误
**策略**: 7 个并行子任务同时执行

---

## 核心原则 (所有子任务必须遵守)

### 1. Internal Format 核心设计

**Internal Format 是项目的唯一真相源**：

- **字段命名**: 全部使用 `camelCase` (maxTokens, finishReason, toolCalls)
- **数据流向**: Vendor Format (snake_case) → Internal Format (camelCase) → Vendor Format (snake_case)
- **字段归一化**: 必须使用 `field-normalizer.ts` 工具进行转换
- **禁止**: 在 Internal Format 中混用 snake_case
- **禁止**: 在 Converter 之外做格式兼容

### 2. Field Normalizer 规则

```typescript
// ✅ 正确: 使用 Field Normalizer
import { normalizeToCamelCase, normalizeToSnakeCase } from '../utils/field-normalizer';

// Vendor → Internal (snake_case → camelCase)
const normalizedRequest = normalizeToCamelCase(vendorRequest, true) as InternalRequest;

// Internal → Vendor (camelCase → snake_case)
const apiFormatRequest = normalizeToSnakeCase(internalRequest, true);

// ❌ 错误: 手动映射字段
const result = {
  max_tokens: request.maxTokens,  // 不要这样做!
  tool_calls: request.toolCalls,  // 使用 field normalizer!
};
```

**Field Normalizer 保护机制**:
- `input_schema` (Anthropic 工具定义) 不会被转换
- 嵌套对象会被递归处理
- 数组元素会被逐个处理

### 3. TranspileMetadata 必需字段

**每个转换结果必须包含完整的 metadata**:

```typescript
const metadata: TranspileMetadata = {
  fromVendor: 'openai',        // ✅ 必需
  toVendor: 'anthropic',       // ✅ 必需
  convertedAt: Date.now(),     // ✅ 必需
  conversionTimeMs: Date.now() - startTime,  // ✅ 必需
  fieldsConverted: 1,          // ✅ 必需
  fieldsIgnored: 0,            // ✅ 必需
  fieldsWarned: warnings.length,  // ✅ 必需 (即使为 0)
};
```

### 4. Warnings 类型声明

```typescript
// ❌ 错误
const warnings: typeof createWarning[] = [];

// ✅ 正确
const warnings: ReturnType<typeof createWarning>[] = [];
```

### 5. Interface 必需属性

**InternalFormat 接口不能随意添加属性**，必须先检查:
1. 该属性是否真的是 vendor-agnostic
2. 如果是 vendor-specific，应该放到 `vendorSpecificFields`
3. 添加前必须在 `interfaces/internal-format.ts` 中定义

**缺失属性修复原则**:
- `InternalToolCall.index` → 添加到接口定义
- `InternalStreamChunk.systemFingerprint` → 添加到接口定义
- Vendor-specific 字段 → 使用 `vendorSpecificFields` 或 `Record<string, unknown>`

### 6. 测试编写规则

```typescript
// ✅ 正确的测试模式
import { expectSuccess } from '../__tests__/test-helpers';

it('should convert request', () => {
  const result = protocolTranspiler.transpile(request, 'openai', 'anthropic');

  expect(result.success).toBe(true);
  const data = expectSuccess(result);  // ✅ 类型安全的断言
  expect(data.model).toBe('gpt-4');
  expect(data.maxTokens).toBe(100);  // ✅ 使用 camelCase
});

// ❌ 错误的测试模式
it('should convert request', () => {
  const result = protocolTranspiler.transpile(request, 'openai', 'anthropic');

  expect(result.success).toBe(true);
  const data = result.data as any;  // ❌ 不要用 as any
  expect(data.max_tokens).toBe(100);  // ❌ 不要用 snake_case
});
```

### 7. Vendor 属性命名

```typescript
// ❌ 错误
export class OpenAIConverter implements FormatConverter {
  readonly vendor = 'openai';  // 旧的属性名
}

// ✅ 正确
export class OpenAIConverter implements FormatConverter {
  readonly vendorType = 'openai';  // 新的属性名
}
```

### 8. 未使用变量处理

```typescript
// ✅ 使用 _ 前缀标记未使用的参数
convertRequestToInternal(
  request: unknown,
  _options?: ConversionOptions  // ✅ 前缀 _ 表示有意未使用
): TranspileResult<InternalRequest> {
  // ...
}

// ❌ 不要删除可能需要的参数
convertRequestToInternal(
  request: unknown  // ❌ 不要删除 _options
): TranspileResult<InternalRequest> {
  // ...
}
```

### 9. Converter 结构规范

每个 Converter 必须实现:

```typescript
export class MyConverter implements FormatConverter {
  readonly vendorType: VendorType = 'myvendor';

  // 请求转换
  convertRequestToInternal(request: unknown): TranspileResult<InternalRequest> { }
  convertRequestFromInternal(internal: InternalRequest): TranspileResult<Record<string, unknown>> { }

  // 响应转换
  convertResponseToInternal(response: unknown): TranspileResult<InternalResponse> { }
  convertResponseFromInternal(internal: InternalResponse): TranspileResult<Record<string, unknown>> { }

  // 流式转换
  convertStreamChunkToInternal(chunk: string): TranspileResult<InternalStreamChunk> { }
  convertStreamChunkFromInternal(chunk: InternalStreamChunk): TranspileResult<string> { }

  // 验证方法
  isValidRequest(data: unknown): ValidationResult { }
  isValidResponse(data: unknown): ValidationResult { }
  isValidStreamChunk(data: unknown): ValidationResult { }
}
```

### 10. 关键禁止项

**严格禁止**:
1. ❌ 在 Converter 中混用 camelCase 和 snake_case
2. ❌ 使用 `as any` 绕过类型检查 (除非有明确注释)
3. ❌ 在 Gateway Controller 中做 vendor-specific 兼容
4. ❌ 修改 Internal Format 接口而不更新所有 Converter
5. ❌ 手动映射字段而不使用 field-normalizer
6. ❌ 遗漏 `fieldsWarned` 在 metadata 中
7. ❌ 使用 `vendor` 属性名 (应该用 `vendorType`)
8. ❌ 在测试中硬编码 snake_case 字段名

---

## 子任务分工

### Phase 0: 清理与准备 (Subtask 0)
**目标**: -20 errors
**时间**: 30 分钟

**任务**:
1. 清理 tsconfig.json 中的 debug 配置
2. 移除 console.log 调试语句
3. 移除注释掉的代码
4. 检查并修复明显的类型错误

**验证**:
```bash
npx tsc --noEmit | grep "TS" | wc -l  # 应该减少 ~20 个错误
```

### Phase 1: 修复测试文件 (Subtask 1)
**目标**: 修复 36 个测试，恢复 710/710 通过
**时间**: 2-3 小时

**任务**:
1. 修复 `conversion-integration.test.ts` (47 errors)
2. 修复 `protocol-transpiler.test.ts` (40 errors)
3. 修复 `internal-format.test.ts` (73 errors)
4. 添加缺失的 `beforeEach` 导入
5. 修复 mock 对象使用 `vendorType`

**验证**:
```bash
npm test -- --run
# 应该看到 710/710 tests passed
```

### Phase 2A: 修复 InternalFormat 接口 (Subtask 2A)
**目标**: -100 errors (修复类型定义)
**时间**: 2-3 小时

**任务**:
1. 添加 `InternalToolCall.index` 属性
2. 添加 `InternalStreamChunk.systemFingerprint` 属性
3. 检查所有缺失的必需属性
4. 更新所有使用这些属性的代码

**验证**:
```bash
npx tsc --noEmit | grep "Property.*does not exist" | wc -l  # 应该减少
```

### Phase 2B: 统一 Field Normalization (Subtask 2B)
**目标**: -165 errors (protocol transpiler)
**时间**: 4-6 小时

**任务**:
1. **Anthropic Converter**: 改用 field-normalizer 替代手动映射
2. **Gemini Converter**: 改用 field-normalizer 替代手动映射
3. **GLM Converter**: 检查并修复 field normalization
4. **Responses Converter**: 检查并修复 field normalization
5. 验证所有 Converter 输出 camelCase Internal Format

**验证**:
```bash
npm test -- --run src/server/module-protocol-transpiler/converters
# 所有转换器测试应该通过
```

### Phase 3: 客户端组件修复 (Subtask 3)
**目标**: -200 errors
**时间**: 3-4 小时

**任务**:
1. 修复 client hooks 类型错误
2. 修复 client services 类型错误
3. 修复 React 组件类型错误
4. 确保 API 调用使用正确的类型

**验证**:
```bash
npx tsc --noEmit | grep "src/client" | wc -l  # 应该显著减少
```

### Phase 4: 服务器服务修复 (Subtask 4)
**目标**: -110 errors
**时间**: 2-3 小时

**任务**:
1. 修复 gateway controller 类型错误
2. 修复 upstream service 类型错误
3. 修复 request-log service 类型错误
4. 确保 Gateway Controller 只处理 Internal Format

**验证**:
```bash
npx tsc --noEmit | grep "src/server/module-gateway" | wc -l  # 应该显著减少
```

### Phase 5: 最终清理 (Subtask 5)
**目标**: -100 errors (unused variables + 其他)
**时间**: 1-2 小时

**任务**:
1. 移除未使用的变量 (添加 `_` 前缀或删除)
2. 修复未使用的导入
3. 修复剩余的类型错误
4. 确保所有测试通过

**验证**:
```bash
npx tsc --noEmit  # 应该接近 0 个错误
npm test -- --run  # 所有测试通过
```

---

## 执行顺序

1. **并行启动** Phase 0-5 (所有子任务同时开始)
2. **持续验证** 每个子任务完成后运行测试
3. **冲突解决** 如有修改冲突，优先保留:
   - Internal Format 接口定义
   - Field Normalizer 使用
   - 类型安全的实现

---

## 成功标准

- ✅ TypeScript 错误从 814 降至 < 50
- ✅ 所有测试通过 (710/710)
- ✅ 所有 Converter 使用 field-normalizer
- ✅ Internal Format 纯 camelCase
- ✅ Gateway Controller 无 vendor-specific 代码
- ✅ 无 `as any` (除必要场景)

---

## 紧急联系

如遇到问题，参考:
- `/docs/PROTOCOL_TRANSPILER_CORE_DESIGN.md` - 核心设计
- `/docs/TEST_TYPE_SAFETY_QUICK_REFERENCE.md` - 测试指南
- `/docs/TYPE_ERROR_FIX_PROGRESS.md` - 进度追踪
