# Tool Call Streaming Test Implementation Summary

## Overview

实现了一套完整的工具调用流式测试框架，用于检测和验证 GLM-4 和 OpenAI 在工具调用方面的差异，解决 Playground 中的状态更新问题。

## Files Created

### 1. Core Test Files

**`/scripts/streaming-test/types.ts`**
- 定义测试类型: `ChatMessage`, `ToolDefinition`, `StreamChunk`, `TestScenario`, `TestResult`
- 提供类型安全保障

**`/scripts/streaming-test/scenarios/streaming-tools.scenario.ts`**
- 实现 4 个测试场景
- 提供工具调用验证和分析功能
- 包含工具调用检测和解析逻辑

**`/scripts/streaming-test/run-tools-test.ts`**
- 测试运行器
- 输出详细的测试结果和分析
- 提供关键发现和建议

### 2. Documentation

**`/scripts/streaming-test/README.md`**
- 完整的使用文档
- 前端处理建议和代码示例
- 故障排查指南

### 3. Configuration

**`package.json`** (updated)
- 添加 `test:tools` 脚本

## Test Scenarios

### Scenario 1: Single Tool Call (Calculator)

**Purpose**: 验证单个工具调用的基本功能

**Assertions**:
- `tool_call_exists` - 检查是否有 tool call
- `tool_call_format` - 验证格式 (id, function.name, arguments)
- `finish_reason` - 验证 finish_reason 是 'tool_calls'
- `argument_content` - 验证 arguments 内容正确

### Scenario 2: Tool Call Incremental Detection

**Purpose**: 检测 arguments 的输出模式

**Assertions**:
- `incremental_detection` - 检测是增量还是单次返回
  - Returns pattern: 'single-chunk' | 'incremental' | 'none'
  - 提供详细的 chunks 分析

- `incremental_analysis` - 详细分析增量特征
  - 每个 chunk 的长度和完整性
  - 是否是完整 JSON
  - 提供前端处理建议

**Key Detection**:
```typescript
{
  pattern: 'single-chunk',  // GLM-4 风格
  isIncremental: false,
  argumentChunks: 1,
  recommendation: '前端需要在单个 chunk 中处理完整的 tool call'
}
```

### Scenario 3: Tool Call End Signal

**Purpose**: 验证结束信号的正确性

**Assertions**:
- `correct_finish_reason` - finish_reason 必须是 'tool_calls'
- `has_done_signal` - 检查 [DONE] 信号
- `tool_call_before_finish` - tool call 必须在 finish 之前
- `no_content_after_tool_call` - tool call 后不应有 content

### Scenario 4: Multiple Tool Calls

**Purpose**: 测试多个工具调用

**Assertions**:
- `multiple_tool_calls` - 检测是否有多个 tool call
- `tool_call_separation` - 验证不同 tool call 有独立 ID

## Key Features

### 1. Pattern Detection

自动检测工具调用的输出模式:

```typescript
function validateToolCall(toolCallChunks: ToolCallFormat[]): {
  exists: boolean;
  toolCallChunks: number;
  isIncremental: boolean;
  pattern: 'single-chunk' | 'incremental' | 'none';
  argumentChunks: string[];
  // ...
}
```

### 2. Argument Parsing

处理增量和单次两种模式:

```typescript
function parseArguments(argumentChunks: string[]): any | null {
  if (argumentChunks.length === 1) {
    return JSON.parse(argumentChunks[0]); // GLM-4
  }
  return JSON.parse(argumentChunks.join('')); // OpenAI
}
```

### 3. Detailed Analysis

对每个 chunk 进行详细分析:
- 长度
- 是否是完整 JSON
- 内容预览
- 出现顺序

## Usage

### Run Tests

```bash
npm run test:tools
```

### Expected Output

```
╔════════════════════════════════════════════════════════════════════════════╗
║                    🔧 Tool Call Streaming Tests                           ║
╚════════════════════════════════════════════════════════════════════════════╝

[Scenarios run...]

╔════════════════════════════════════════════════════════════════════════════╗
║                              📊 测试总结                                    ║
╚════════════════════════════════════════════════════════════════════════════╝

总计: 4 个场景
✅ 通过: 4 个
❌ 失败: 0 个

🔍 关键发现:
📌 Tool Call 模式: single-chunk
   - 是否增量输出: 否
   - Arguments chunks: 1
   ⚠️  检测到 GLM-4 风格：一次性返回完整 arguments
   💡 建议：前端需要在单个 chunk 中处理完整的 tool call
```

## Frontend Integration Recommendations

### 1. Detect Pattern

```typescript
const pattern = detectToolCallPattern(chunks);
if (pattern === 'single-chunk') {
  // Handle GLM-4 style
  handleSingleChunkToolCall(chunks);
} else {
  // Handle OpenAI style
  handleIncrementalToolCall(chunks);
}
```

### 2. Accumulate Arguments

```typescript
const argsMap = new Map<string, string>();
for (const chunk of chunks) {
  if (chunk.toolCall?.id && chunk.toolCall.function?.arguments) {
    const current = argsMap.get(chunk.toolCall.id) || '';
    argsMap.set(chunk.toolCall.id, current + chunk.toolCall.function.arguments);
  }
}
```

### 3. Parse When Complete

```typescript
// Check if arguments are complete
const isComplete = chunk.finishReason === 'tool_calls' || chunk.isDone;
if (isComplete) {
  const toolCalls = parseToolCalls(chunks);
  onToolCalls(toolCalls);
}
```

## Benefits

1. **问题诊断**: 快速识别工具调用的输出模式
2. **兼容性**: 同时支持 GLM-4 和 OpenAI 两种模式
3. **详细报告**: 提供完整的测试结果和分析
4. **开发指导**: 给出明确的前端处理建议
5. **回归测试**: 可用于持续集成和版本验证

## Next Steps

1. **运行测试**: 执行 `npm run test:tools` 验证当前实现
2. **修复问题**: 根据测试结果修复 Playground 中的状态更新问题
3. **格式转换**: 更新 `format-converters` 中的工具调用处理逻辑
4. **文档更新**: 记录发现的差异和解决方案

## Related Work

- `/src/server/module-gateway/services/format-converters/` - 格式转换器
- `/docs/API_FORMAT_COMPARISON_SUMMARY.md` - API 格式对比
- `/docs/TOOL_CALL_JSON_ANALYSIS.md` - Tool Call JSON 分析
