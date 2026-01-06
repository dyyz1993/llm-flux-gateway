# 协议转译器优化报告

## 执行摘要

本报告详细记录了对 LLM Flux Gateway 协议转译器的深入分析和优化尝试。目标是将工具调用的成功率从基准水平提升到 87.5% (14/16)。

**关键发现**:
- 当前基准成功率: **37.5%** (6/16) - 远低于预期的 75%
- 主要问题: **流式响应为空**、**跨格式工具转换失败**、**GLM API 兼容性问题**
- 根本原因: GLM 的流式 API 不完全兼容 OpenAI 标准，且存在多个提供商特定的格式差异

---

## 1. 测试矩阵概览

### 1.1 测试配置

| 变量 | 选项 | 说明 |
|------|------|------|
| API Keys | 2 个 | `codding` (OpenAI 格式), `glm-coding-anthropic` (Anthropic 格式) |
| 选择格式 | 2 种 | OpenAI (`/v1/chat/completions`), Anthropic (`/v1/messages`) |
| 流式选项 | 2 种 | `stream: true`, `stream: false` |
| 工具选项 | 2 种 | 有工具 (`get_weather`), 无工具 |
| **总组合数** | **16** | 2 × 2 × 2 × 2 |

### 1.2 当前测试结果

```
总测试数: 16
✅ 通过: 6 (37.5%)
❌ 失败: 8 (50%)
⚠️  错误: 2 (12.5%)
```

### 1.3 成功案例 (6/16)

| # | API Key | 格式 | 流式 | 工具 | 状态 |
|---|---------|------|------|------|------|
| 3 | codding | OpenAI | 否 | 是 | ✅ PASS |
| 4 | codding | OpenAI | 否 | 否 | ✅ PASS |
| 8 | codding | Anthropic | 否 | 否 | ✅ PASS |
| 11 | glm-coding-anthropic | OpenAI | 否 | 是 | ✅ PASS |
| 12 | glm-coding-anthropic | OpenAI | 否 | 否 | ✅ PASS |
| 16 | glm-coding-anthropic | Anthropic | 否 | 否 | ✅ PASS |

**模式识别**:
- ✅ 所有 **非流式**测试都能成功
- ✅ 所有 **无工具**的非流式测试都能成功
- ❌ 所有 **流式**测试都失败
- ❌ 所有 **有工具 + 跨格式**测试都失败

---

## 2. 问题分类与根因分析

### 2.1 问题 #1: 流式响应为空 (影响 8 个案例)

**症状**:
- 案例 #1, #2: `codding` + OpenAI + stream=true
- 案例 #5, #6: `codding` + Anthropic + stream=true
- 案例 #9, #10: `glm-coding-anthropic` + OpenAI + stream=true
- 案例 #13, #14: `glm-coding-anthropic` + Anthropic + stream=true

**根因**:
1. **SSE 格式转换问题**: `convertStreamChunkFromInternal` 可能返回空字符串
2. **过滤逻辑过于严格**: `isChunkMeaningful` 可能过滤掉了有意义的 chunk
3. **协议转译器状态问题**: 流式转换可能丢失状态

**证据**:
```typescript
// OpenAI converter (openai.converter.ts:264)
if (!this.isChunkMeaningful(chunk)) {
  console.log('[OpenAIConverter] Empty chunk detected, returning empty string');
  return success('', metadata);  // ⚠️ 返回空字符串
}
```

**建议修复**:
1. 添加更详细的日志来追踪 chunk 转换过程
2. 检查 `isChunkMeaningful` 的判断逻辑
3. 确保至少返回 role chunk 和 finish_reason chunk

---

### 2.2 问题 #2: GLM 流式工具调用不完整 (影响案例 #1)

**症状**:
- GLM API 在流式模式下发送 `finish_reason:"tool_calls"`
- 但不发送实际的 `tool_calls` 数组在 delta 中

**调试输出**:
```json
{
  "choices": [{
    "finish_reason": "tool_calls",
    "delta": {
      "role": "assistant",
      "content": ""  // ⚠️ 没有 tool_calls
    }
  }]
}
```

**根因**:
- GLM 的流式 API 不完全兼容 OpenAI 标准
- GLM 可能在流中省略了 `tool_calls` delta，期望客户端从 `finish_reason` 推断

**建议修复**:
1. 检测 `finish_reason:"tool_calls"` 但没有 `tool_calls` 的情况
2. 回退到非流式模式，或
3. 在最后发送一个包含完整 tool_calls 的合成 chunk

---

### 2.3 问题 #3: GLM Anthropic 端点不支持工具 (影响案例 #7, #15)

**症状**:
```
HTTP 400: "API 调用参数有误，请检查文档"
```

**根因**:
- GLM 的 `/messages` 端点 (Anthropic 兼容) 不支持工具调用
- 或工具格式与 Anthropic 标准不同

**验证**:
```bash
# 测试 GLM /messages 端点
curl https://open.bigmodel.cn/api/paas/v4/messages \
  -d '{"tools": [...], ...}'  # ❌ 400 错误
```

**建议修复**:
1. 当检测到 GLM 提供商 + 工具 + Anthropic 格式时
2. 强制使用 OpenAI 格式端点 (`/chat/completions`)
3. 在响应时转换回 Anthropic 格式

---

### 2.4 问题 #4: glm-coding-anthropic 非标准工具格式 (影响案例 #9, #11, #13, #15)

**症状**:
```
HTTP 422: "Field required", "loc": ["body", "tools", 0, "name"]
```

**根因**:
- `zhipu-coding-anthropic` 供应商使用非标准工具格式
- 期望 `tools[0].name` 而不是 `tools[0].function.name`

**标准 OpenAI 格式**:
```json
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",  // ✅ 标准
      "parameters": {...}
    }
  }]
}
```

**GLM 非标准格式**:
```json
{
  "tools": [{
    "type": "function",
    "name": "get_weather",  // ⚠️ 非标准 - name 在外层
    "function": {...}
  }]
}
```

**建议修复**:
1. 为 `zhipu-coding-anthropic` 创建专用转换器
2. 或在 `AnthropicConverter` 中检测此供应商并应用特殊转换

---

## 3. 已实施的优化尝试

### 3.1 GLM 特殊处理逻辑 (已回退)

```typescript
// 尝试的修复 (gateway-controller.ts)
const isGLMProvider = match.route.upstreamModel?.startsWith('glm-') ||
                      rewriteResult.rewrittenRequest.model?.startsWith('glm-');

// Workaround 1: 强制使用 OpenAI 格式
if (hasTools && isGLMProvider && targetFormat === ApiFormat.ANTHROPIC) {
  targetFormat = ApiFormat.OPENAI;
  targetVendor = 'openai';
}

// Workaround 2: 禁用流式
if (hasTools && isGLMProvider && stream) {
  effectiveStream = false;
}
```

**结果**:
- ❌ 检测逻辑过于宽泛，影响了不该影响的提供商
- ❌ 导致测试成功率从 37.5% 降至 0%
- ✅ 但概念正确 - 需要更精确的检测

---

## 4. 推荐的优化方案

### 4.1 短期方案 (快速提升成功率)

**方案 A: 禁用 GLM 的流式工具调用**

```typescript
// 检测特定的 GLM 端点
const isZhipuCoding = request.url.includes('open.bigmodel.cn/api/coding');
const isZhipuAnthropic = request.url.includes('open.bigmodel.cn/api/anthropic');

// 如果是 GLM + 工具 + 流式，禁用流式
if ((isZhipuCoding || isZhipuAnthropic) && hasTools && stream) {
  console.log('[Gateway] GLM workaround: Disabling streaming for tool calls');
  stream = false;
}
```

**预期效果**:
- 修复案例 #1, #9, #11 (流式工具调用)
- 成功率提升至 ~56% (9/16)

---

**方案 B: 为 GLM Anthropic 强制使用 OpenAI 格式**

```typescript
// 如果是 zhipu-coding-anthropic + 工具，使用 OpenAI 端点
if (isZhipuAnthropic && hasTools) {
  targetFormat = ApiFormat.OPENAI;
  targetVendor = 'openai';
  // 修改 upstream URL
  upstreamRequest.url = upstreamRequest.url.replace('/messages', '/chat/completions');
}
```

**预期效果**:
- 修复案例 #7, #15 (GLM Anthropic 工具调用)
- 成功率提升至 ~62% (10/16)

---

### 4.2 中期方案 (架构优化)

**方案 C: 增强的协议转译器**

1. **添加供应商能力检测**
```typescript
interface VendorCapabilities {
  supportsStreamingTools: boolean;
  supportsAnthropicFormatTools: boolean;
  toolFormat: 'standard' | 'glm-variant';
}
```

2. **智能格式选择**
```typescript
function getOptimalFormat(
  vendor: string,
  hasTools: boolean,
  stream: boolean
): ApiFormat {
  const caps = getVendorCapabilities(vendor);

  if (hasTools && stream && !caps.supportsStreamingTools) {
    return ApiFormat.OPENAI;  // 回退到最兼容的格式
  }

  // ...
}
```

---

**方案 D: 供应商专用转换器**

```typescript
class GLMAnthropicConverter extends AnthropicConverter {
  convertTools(tools: InternalTool[]): GLMToolFormat {
    // GLM 特殊格式: tools[0].name 而不是 tools[0].function.name
    return tools.map(tool => ({
      type: 'function',
      name: tool.function.name,  // ⚠️ name 在外层
      function: {
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }
}
```

---

### 4.3 长期方案 (根本解决)

**方案 E: 统一内部格式与自适应转换**

1. **扩展 InternalFormat**:
```typescript
interface InternalRequest {
  // ... 现有字段

  // 新增: 供应商提示
  vendorHints?: {
    preferredFormat?: ApiFormat;
    toolFormat?: 'openai' | 'anthropic' | 'glm-custom';
    streamingBehavior?: 'standard' | 'no-tools-in-stream';
  };
}
```

2. **智能转换管道**:
```typescript
function convertWithHints(
  request: InternalRequest,
  targetVendor: string
): TranspileResult {
  const hints = request.vendorHints;
  const converter = getConverter(targetVendor, hints);

  return converter.convert(request);
}
```

---

## 5. 实施优先级建议

### 阶段 1: 快速修复 (1-2 小时)

1. ✅ **实施方案 A** - 禁用 GLM 流式工具调用
   - 修改: `gateway-controller.ts`
   - 预期: +2 个成功案例 (56% → 62%)

2. ✅ **实施方案 B** - GLM Anthropic 使用 OpenAI 端点
   - 修改: `gateway-controller.ts`, `rewrite.service.ts`
   - 预期: +1 个成功案例 (62% → 68%)

### 阶段 2: 中期优化 (3-5 小时)

3. ✅ **实施方案 D** - GLM 专用转换器
   - 新增: `glm-custom.converter.ts`
   - 预期: +2 个成功案例 (68% → 75%)

4. ✅ **修复流式响应问题**
   - 调查: `isChunkMeaningful` 逻辑
   - 添加: 详细日志
   - 预期: +4 个成功案例 (75% → 87.5%)

### 阶段 3: 长期重构 (1-2 周)

5. ✅ **实施方案 E** - 统一内部格式
6. ✅ **添加供应商能力检测**
7. ✅ **实现自适应转换**

---

## 6. 测试验证计划

### 6.1 回归测试

每次修改后运行:
```bash
npx tsx scripts/streaming-test/glm-16-combinations-test.ts
```

**通过标准**:
- 原本成功的 6 个案例仍然成功 ✅
- 至少修复 2 个失败案例
- 不引入新的失败

### 6.2 压力测试

```bash
# 并发测试
for i in {1..10}; do
  npx tsx scripts/streaming-test/glm-16-combinations-test.ts
done
```

### 6.3 边界测试

- ✅ 空工具列表
- ✅ 大量工具 (>10 个)
- ✅ 复杂工具参数 (嵌套对象)
- ✅ 流式中断和恢复

---

## 7. 风险评估

### 7.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| GLM API 变更 | 高 | 版本检测 + 降级策略 |
| 性能下降 | 中 | 缓存转换结果 |
| 兼容性破坏 | 高 | 全面的回归测试 |

### 7.2 业务风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 用户体验下降 | 高 | 渐进式推出 + 监控 |
| 成本增加 | 低 | 优化 API 调用 |

---

## 8. 结论

### 8.1 当前状态

- **基准成功率**: 37.5% (6/16)
- **主要瓶颈**: 流式响应、GLM 兼容性
- **最快修复**: 1-2 小时内可提升至 62%

### 8.2 建议

1. **立即行动**: 实施方案 A 和 B (快速修复)
2. **短期规划**: 实施方案 D (GLM 专用转换器)
3. **长期战略**: 方案 E (统一内部格式)

### 8.3 预期成果

完成所有阶段后:
- ✅ 成功率: **87.5%+** (14/16)
- ✅ 支持所有主流 LLM 提供商
- ✅ 完整的工具调用支持
- ✅ 流式和非流式模式

---

## 附录 A: 供应商配置详情

### A.1 codding (zhipu-coding)

```
ID: zhipu-coding
Base URL: https://open.bigmodel.cn/api/coding/paas/v4
Endpoint: /chat/completions
Format: OpenAI
支持: ✅ 非流式工具调用
     ❌ 流式工具调用
     ❌ Anthropic 格式
```

### A.2 glm-coding-anthropic (zhipu-coding-anthropic)

```
ID: zhipu-coding-anthropic
Base URL: https://open.bigmodel.cn/api/anthropic/v1
Endpoint: /messages
Format: Anthropic (非标准)
支持: ✅ 非流式工具调用 (OpenAI 格式)
     ❌ 流式工具调用
     ❌ Anthropic 格式工具
     ⚠️  自定义工具格式 (tools[0].name)
```

---

## 附录 B: 调试命令

### B.1 单案例测试

```bash
# 测试案例 #1 (OpenAI + stream + tools)
npx tsx scripts/streaming-test/debug-tool-calls.ts

# 测试案例 #7 (Anthropic + 非流式 + tools)
curl -X POST http://localhost:3000/v1/messages \
  -H "Authorization: Bearer sk-flux-your-key-here" \
  -d @test-case-7.json
```

### B.2 服务器日志

```bash
# 实时日志
tail -f /tmp/server.log | grep '\[Gateway\]'

# SSE 流日志
tail -f logs/sse-traces/*.log
```

---

**报告生成时间**: 2026-01-04
**协议版本**: v1.0.0
**测试环境**: Node.js v25.2.0, TypeScript 5.x
