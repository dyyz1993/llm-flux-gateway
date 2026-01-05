# 协议转换日志格式问题分析报告

## 分析日期
2026-01-04

## 分析的日志文件

### 1. 日志后缀: 352ed7
- 文件: `289da827-4746-45ef-8411-93130b352ed7-352ed7-1767524358642.log`
- 状态: ✅ **发现问题**

### 2. 日志后缀: 97e0bd
- 文件: **不存在** (未找到此日志文件)

### 3. 日志后缀: 54c1cb
- 文件: `0452fced-9d15-4bbd-8f23-2d63cc54c1cb-54c1cb-1767523255530.log`
- 状态: ✅ **正常** (此请求未使用工具，无法验证工具定义问题)

---

## 详细问题分析

### 日志 352ed7 发现的问题

与日志 2a1098 完全相同的字段命名不一致问题。

#### 问题 1: 工具定义字段名从 snake_case 转换为 camelCase

**位置**: STEP 3 (Internal Format → Target Format)

**INTERNAL FORMAT (正确)**:
```json
{
  "properties": {
    "subagent_type": {
      "type": "string",
      "description": "The type of specialized agent ..."
    },
    "run_in_background": {
      "type": "boolean",
      "description": "Set to true to run this agent ..."
    },
    "task_id": {
      "type": "string",
      "description": "The task ID to get output from"
    }
  },
  "required": [
    "description",
    "prompt",
    "subagent_type"  // ← snake_case
  ]
}
```

**REQUEST SENT TO UPSTREAM (错误)**:
```json
{
  "properties": {
    "subagentType": {  // ← 转换为 camelCase
      "type": "string",
      "description": "The type of specialized agent ..."
    },
    "runInBackground": {  // ← 转换为 camelCase
      "type": "boolean",
      "description": "Set to true to run this agent ..."
    },
    "taskId": {  // ← 转换为 camelCase
      "type": "string",
      "description": "The task ID to get output from"
    }
  },
  "required": [
    "description",
    "prompt",
    "subagentType"  // ← 也转换为 camelCase
  ]
}
```

#### 问题 2: Grep 工具的参数名被转换

**INTERNAL FORMAT (正确)**:
```json
{
  "properties": {
    "-B": { "type": "number", "description": "Number of lines to show before..." },
    "-A": { "type": "number", "description": "Number of lines to show after..." },
    "-C": { "type": "number", "description": "Number of lines to show before..." }
  }
}
```

**REQUEST SENT TO UPSTREAM (错误)**:
```json
{
  "properties": {
    "-_b": { "type": "number", "description": "Number of lines to show before..." },
    "-_a": { "type": "number", "description": "Number of lines to show after..." },
    "-_c": { "type": "number", "description": "Number of lines to show before..." }
  }
}
```

#### 问题 3: additionalProperties 被转换

**INTERNAL FORMAT (正确)**:
```json
{
  "additionalProperties": false,
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

**REQUEST SENT TO UPSTREAM (错误)**:
```json
{
  "additional_properties": false,  // ← 转换为 snake_case (但这应该是 camelCase)
  "$schema": "http://json-schema.org/draft-07/schema#"
}
```

**注意**: 这是一个反向转换错误。JSON Schema 标准使用 `additionalProperties` (camelCase)，但被转换成了 `additional_properties` (snake_case)。

---

### 日志 54c1cb 分析

此日志文件显示的是一个简单的请求（只有 "hi" 消息），没有使用任何工具。因此无法验证工具定义的字段命名问题。

**观察到的转换**:
- 系统消息正确地从 `system` 数组转换为 OpenAI 格式的 system 消息
- 消息结构保持一致
- 没有工具定义需要验证

---

## 根本原因分析

这些问题都指向同一个根本原因：

**协议转换器在从内部格式 (OpenAI) 转换到目标格式 (Anthropic) 时，错误地将工具定义 (input_schema) 中的字段名从 snake_case 转换为 camelCase。**

### 正确的行为应该是：

1. **工具定义的 input_schema 应该保持原样**
   - `input_schema.properties` 中的字段名应该保持客户端原始格式
   - `input_schema.required` 数组中的字段名应该与 properties 一致

2. **不应该转换的字段**:
   - JSON Schema 标准字段: `type`, `properties`, `required`, `additionalProperties`, `$schema`
   - 工具参数名: 应该由客户端决定，不应该被转换器修改

3. **应该转换的字段**:
   - 顶层请求字段: `max_tokens` ↔ `maxTokens`
   - 消息内容: 不同协议的消息格式
   - 但**不包括工具定义内部的结构**

---

## 影响范围

这些问题影响所有使用工具的请求，特别是：

1. **Task 工具**: `subagent_type` → `subagentType`, `run_in_background` → `runInBackground`
2. **TaskOutput 工具**: `task_id` → `taskId`
3. **Bash 工具**: `run_in_background` → `runInBackground`, `dangerouslyDisableSandbox` → `dangerouslyDisableSandbox`
4. **Grep 工具**: `-B`, `-A`, `-C` → `-_b`, `-_a`, `-_c`
5. **所有其他工具**: 类似的字段名转换问题

---

## 建议的修复方案

### 1. 立即修复：保护 input_schema 不被转换

在协议转换器中，确保 `tools` 数组中的 `input_schema` 对象不被字段名转换逻辑影响。

```typescript
// 伪代码示例
function convertToTargetFormat(internalRequest, targetFormat) {
  const converted = deepConvert(internalRequest);

  // 保护工具定义不被转换
  if (converted.tools) {
    converted.tools = converted.tools.map(tool => ({
      ...tool,
      input_schema: internalRequest.tools
        .find(t => t.name === tool.name)
        .input_schema  // 保持原始 input_schema
    }));
  }

  return converted;
}
```

### 2. 添加验证测试

创建测试用例验证：
- 工具定义的 input_schema 在转换过程中保持不变
- `properties` 和 `required` 中的字段名保持一致
- JSON Schema 标准字段名不被转换

### 3. 日志增强

在转换日志中明确记录：
- 哪些字段被转换了
- 哪些字段被保护不被转换
- 工具定义的转换前后对比

---

## 总结

1. **日志 352ed7**: 发现与 2a1098 相同的字段命名不一致问题
2. **日志 97e0bd**: 文件不存在，无法分析
3. **日志 54c1cb**: 请求未使用工具，无法验证工具定义问题

**核心问题**: 协议转换器在转换工具定义时，错误地将 `input_schema` 内部的字段名进行了 camelCase/snake_case 转换，导致 `properties` 和 `required` 不一致，破坏了工具定义的完整性。

**建议**: 修复协议转换器，确保工具定义的 `input_schema` 在转换过程中保持原样，不被字段名转换逻辑影响。
