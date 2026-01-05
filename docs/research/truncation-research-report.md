# 日志数据截断和折叠问题调研报告

## 执行摘要

经过系统性调研，发现日志数据在**三个环节**存在截断和折叠问题：

1. **协议转换日志文件** - 显示截断（视觉折叠）
2. **数据库存储** - 无截断（完整存储）
3. **前端显示** - UI折叠（可展开）

**核心发现**：所有数据都**完整存储**在数据库中，但**协议转换日志**和**前端UI**存在显示层面的折叠。

---

## 1. 所有截断点清单

### 1.1 协议转换日志服务 (`protocol-transformation-logger.service.ts`)

| 行号 | 方法 | 截断逻辑 | 截断长度 | 影响 | 严重程度 |
|------|------|----------|----------|------|----------|
| **230** | `renderStep2` | `JSON.stringify(v).slice(0, 50)` | 50字符 | overwritten_attributes 显示 | 🟡 低 |
| **356** | `renderStep4` | `v.slice(0, 50)` | 50字符 | HTTP Headers 显示 | 🟡 低 |
| **400** | `renderStreamChunk` | `rawSSE.slice(0, 500)` | 500字符 | Raw SSE 显示 | 🟡 低 |
| **419** | `renderStreamChunk` | `sseToSend.slice(0, 500)` | 500字符 | Sent to Client 显示 | 🟡 低 |
| **520** | `logStreamingComplete` | `stats.responseContent?.slice(0, 30)` | 30字符 | 响应内容预览 | 🟡 低 |
| **604** | `renderNonStreamingResponse` | `responseContent?.slice(0, 20)` | 20字符 | 响应内容预览 | 🟡 低 |
| **722** | `formatTypeValue` | `value.slice(0, 20)` | 20字符 | 类型值显示 | 🟡 低 |
| **739-747** | `printDetailedChanges` | `JSON.stringify().slice(0, 40)` | 40字符 | 变更对比 | 🟡 低 |
| **759-760** | `printDetailedChanges` | `beforeStr.slice(0, 50)` | 50字符 | 变更对比 | 🟡 低 |
| **782** | `formatTypeValue` | `JSON.stringify().slice(0, 45)` | 45字符 | 类型值显示 | 🟡 低 |
| **804** | `renderCompleteJSON` | `line.slice(0, maxWidth - 7)` | 58字符 | **JSON 行截断** | 🔴 **高** |
| **837-849** | `printDetailedChanges` | `JSON.stringify().slice(0, 55)` | 55字符 | 变更对比 | 🟡 低 |

**代码示例（行 804）**：
```typescript
// 处理超长行 - 简单截断处理
result += `│ ${line.slice(0, maxWidth - 7)}... │\n`;
```

### 1.2 请求日志服务 (`request-log.service.ts`)

| 行号 | 方法 | 截断逻辑 | 截断长度 | 影响 | 严重程度 |
|------|------|----------|----------|------|----------|
| **241** | `extractFirstMessage` | `firstMsg.content.slice(0, 200)` | 200字符 | first_message 字段 | 🟢 中 |
| **243** | `extractFirstMessage` | `JSON.stringify().slice(0, 200)` | 200字符 | first_message 字段 | 🟢 中 |

**代码示例（行 241-243）**：
```typescript
private extractFirstMessage(messages: any[]): string {
  if (!messages || messages.length === 0) return '';
  const firstMsg = messages[0];
  if (typeof firstMsg.content === 'string') {
    return firstMsg.content.slice(0, 200); // First 200 chars
  }
  return JSON.stringify(firstMsg.content || '').slice(0, 200);
}
```

### 1.3 上游服务 (`upstream.service.ts`)

| 行号 | 方法 | 截断逻辑 | 截断长度 | 影响 | 严重程度 |
|------|------|----------|----------|------|----------|
| **68-69** | `sanitizeHeaders` | `auth.slice(0, 20) + '...'` | 20字符 | API Key 脱敏 | 🟢 安全 |
| **76-77** | `sanitizeHeaders` | `key.slice(0, 20) + '...'` | 20字符 | API Key 脱敏 | 🟢 安全 |
| **309** | `processStreamLine` | `rawSSE.substring(0, 200)` | 200字符 | **调试日志** | 🟢 调试 |
| **315** | `processStreamLine` | `rawSSE.substring(0, 100)` | 100字符 | **调试日志** | 🟢 调试 |
| **328** | `processStreamLine` | `data.substring(0, 150)` | 150字符 | **调试日志** | 🟢 调试 |

### 1.4 SSE 广播服务 (`sse-broadcaster.service.ts`)

| 行号 | 方法 | 截断逻辑 | 截断长度 | 影响 | 严重程度 |
|------|------|----------|----------|------|----------|
| **43** | `broadcastNewLog` | `message.slice(0, 200)` | 200字符 | **控制台日志预览** | 🟢 调试 |

**重要说明**：这只是控制台预览，实际广播的 `message` 是完整的！

### 1.5 前端日志浏览器 (`LogExplorer.tsx`)

| 行号 | 组件 | 截断逻辑 | 截断长度 | 影响 | 严重程度 |
|------|------|----------|----------|------|----------|
| **128** | `shouldTruncate` | `content.length > maxLength` | 500字符（默认） | 触发折叠逻辑 | 🟢 UI |
| **374-375** | `ExpandableContent` | `maxLength = 500`（默认） | 500字符 | **可展开内容** | 🟢 UI |
| **465, 480, 500, 551, 561** | 各组件 | `maxLength={300/500}` | 300/500字符 | 预览区域 | 🟢 UI |
| **1066** | API Key 显示 | `keyToken.slice(0, 8)` | 8字符 | 安全脱敏 | 🟢 安全 |
| **1250, 1310** | 日志ID显示 | `log.id.slice(-6/-8)` | 6/8字符 | ID预览 | 🟢 UI |

**代码示例（行 128-131）**：
```typescript
function shouldTruncate(content: string, maxLength = 500, maxLines = 10): boolean {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const lines = contentStr.split('\n');
  if (lines.length > maxLines) return true;
  if (contentStr.length > maxLength) return true;
  return false;
}
```

---

## 2. 数据流完整性分析

### 2.1 完整数据流路径

```
上游API响应
    ↓
[完整] 协议转换器处理 (无截断)
    ↓
[完整] 写入协议转换日志文件 (文件完整，但显示截断)
    ↓
[完整] 存储到数据库 (request_logs表，完整存储)
    ↓
[完整] SSE 广播到前端 (message完整，console.log预览截断)
    ↓
[折叠] 前端显示 (ExpandableContent可展开)
```

### 2.2 各环节验证

#### ✅ 协议转换日志文件

**文件大小验证**：
```
37KB  - 1ea9c6a1-fad4e7-1767541595401.log (15 chunks)
88KB  - 9ee73b06-52fdb9-1767541594999.log (15 chunks)
1.7MB - 4376ee6b-fba182-1767541601740.log (51 chunks)
1.6MB - c830cfc8-9ebd35-1767541605676.log
```

**显示截断示例**：
```
║  💾 [LOGS TABLE] Will save:                                      ║
║     - response_content: ""isNewTopic": false,
  "title"..."-6║
```
→ 实际存储的 `response_content` 完整长度为 **38 字符**

#### ✅ 数据库存储

**实际数据验证**：
```sql
-- 最大响应内容
id: 4c9202e5-1aa6-445f-bd4b-26c0a562e7e6
response_content: 344,782 字符 (~336 KB) ✅ 完整存储

-- messages 字段
messages: 402,998 字符 (~393 KB) ✅ 完整存储
```

**数据库Schema**：
```sql
response_content TEXT          -- ✅ 无长度限制
request_params TEXT            -- ✅ 无长度限制
response_params TEXT           -- ✅ 无长度限制
messages TEXT                  -- ✅ 无长度限制
```

SQLite 的 `TEXT` 类型最大支持 **2GB**，远超实际需求。

#### ✅ SSE 广播

**代码验证（sse-broadcaster.service.ts:40）**：
```typescript
const message = `data: ${JSON.stringify(log)}\n\n`;  // ✅ 完整序列化
```

第43行的 `slice(0, 200)` **仅影响 console.log 预览**，不影响实际发送的数据。

#### 🔄 前端显示

**ExpandableContent 组件行为**：
- 默认折叠：前 500 字符或前 10 行
- 点击 "Show more" 展开完整内容
- 数据完整，仅 UI 层面折叠

---

## 3. 具体问题列表

### 3.1 高优先级问题 🔴

#### 问题 1: JSON 行截断导致显示不完整

**位置**：`protocol-transformation-logger.service.ts:804`

**现象**：
```
│   "text": "You are Claude Code, Anthropic's official C... │
```

**原因**：
```typescript
// maxWidth = 65
if (line.length > maxWidth - 4) {
  result += `│ ${line.slice(0, maxWidth - 7)}... │\n`;  // 截断到58字符
}
```

**影响**：
- 用户无法在协议转换日志中看到完整的 JSON 内容
- 特别是长文本内容（如 system message）被截断

**解决方案**：
1. **方案 A**：增加 maxWidth 到 120-150 字符
2. **方案 B**：智能换行，不截断
3. **方案 C**：添加折叠/展开逻辑（类似前端）

---

### 3.2 中优先级问题 🟡

#### 问题 2: SSE chunk 内容截断

**位置**：`protocol-transformation-logger.service.ts:400, 419`

**现象**：
```
│ RAW SSE FROM UPSTREAM
│ data: {"type": "content_block_delta", "index": 0, "delta": {"type": "text...
```

**影响**：
- 每个chunk只显示前500字符
- 无法看到完整的 SSE payload

**解决方案**：
- 增加 limit 到 2000-5000 字符
- 或者添加折叠逻辑

---

#### 问题 3: first_message 字段截断

**位置**：`request-log.service.ts:241-243`

**影响**：
- `first_message` 字段只存储前200字符
- 前端"First Message"列显示不完整

**解决方案**：
- 考虑增加到 500-1000 字符
- 或者改为完整存储（数据库无限制）

---

### 3.3 低优先级问题 🟢

#### 问题 4: 其他预览截断

**位置**：
- Headers 显示（50字符）
- 变更对比（40-55字符）
- 响应内容预览（20-30字符）

**影响**：
- 仅影响视觉预览
- 实际数据完整

**建议**：
- 这些是预览性质，保持现状即可

---

## 4. 数据完整性总结

| 数据环节 | 完整性 | 截断原因 | 严重程度 |
|---------|-------|---------|---------|
| 协议转换日志（文件） | ✅ 文件完整<br>❌ 显示截断 | 视觉折叠 | 🟡 中 |
| 数据库存储 | ✅ 完全完整 | 无 | ✅ 无 |
| SSE 广播 | ✅ 完全完整 | 无 | ✅ 无 |
| 前端显示 | ✅ 数据完整<br>🔄 UI折叠 | UX设计 | 🟢 低 |

---

## 5. 修复建议

### 5.1 优先级排序

1. **P0 - 立即修复**：JSON 行截断（804行）
   - 影响：用户体验
   - 复杂度：低
   - 方案：智能换行 + 折叠

2. **P1 - 近期修复**：SSE chunk 显示（400, 419行）
   - 影响：调试体验
   - 复杂度：低
   - 方案：增加到 2000-5000 字符

3. **P2 - 考虑修复**：first_message 截断（241行）
   - 影响：前端显示
   - 复杂度：低
   - 方案：增加到 500-1000 字符

### 5.2 具体修改方案

#### 方案 A：智能换行（推荐）

```typescript
// renderCompleteJSON - 替换行804
private renderCompleteJSON(obj: any): string {
  try {
    const jsonStr = JSON.stringify(obj, null, 2);
    const lines = jsonStr.split('\n');
    const maxWidth = 120; // 从65增加到120

    let result = '';
    for (const line of lines) {
      // 智能换行而不是截断
      if (line.length <= maxWidth - 4) {
        result += `│ ${line.padEnd(maxWidth - 2)} │\n`;
      } else {
        // 分割长行
        const words = line.split(' ');
        let currentLine = '│ ';
        for (const word of words) {
          if ((currentLine.length + word.length) > maxWidth - 3) {
            result += `${currentLine.padEnd(maxWidth - 2)} │\n`;
            currentLine = `│   ${word} `;
          } else {
            currentLine += word + ' ';
          }
        }
        result += `${currentLine.padEnd(maxWidth - 2)} │\n`;
      }
    }
    return result;
  } catch (error) {
    return `│ [Error rendering JSON: ${error}] │\n`;
  }
}
```

#### 方案 B：折叠标记（简单）

```typescript
// 在文件末尾添加折叠标记
if (line.length > maxWidth - 7) {
  result += `│ ${line.slice(0, maxWidth - 7)}... │ [CONTINUED]\n`;
  // 记录被截断的行号，后续可以添加"展开"功能
}
```

### 5.3 验证方法

1. **单元测试**：
   ```typescript
   describe('renderCompleteJSON', () => {
     it('should handle long lines without truncation', () => {
       const longObj = { text: 'a'.repeat(200) };
       const result = renderCompleteJSON(longObj);
       expect(result).toContain('a'.repeat(200)); // 完整内容
       expect(result).not.toContain('...');       // 无截断标记
     });
   });
   ```

2. **集成测试**：
   - 发送包含长文本的请求
   - 检查协议转换日志文件
   - 验证长行完整显示

3. **手动验证**：
   - 查看 `/logs/protocol-transformation/` 下的日志文件
   - 搜索长内容（如 system message）
   - 确认完整显示

---

## 6. 相关代码位置速查

### 关键文件

| 文件 | 行号 | 功能 |
|------|------|------|
| `protocol-transformation-logger.service.ts` | 793-814 | `renderCompleteJSON()` - JSON渲染 |
| `protocol-transformation-logger.service.ts` | 389-429 | `renderStreamChunk()` - SSE chunk渲染 |
| `request-log.service.ts` | 235-244 | `extractFirstMessage()` - 首消息提取 |
| `sse-broadcaster.service.ts` | 34-85 | `broadcastNewLog()` - SSE广播 |
| `LogExplorer.tsx` | 128-131 | `shouldTruncate()` - 折叠判断 |
| `LogExplorer.tsx` | 369-428 | `ExpandableContent` - 可展开组件 |

### 数据库表

```sql
-- 验证完整性
SELECT
  id,
  length(messages) as messages_len,
  length(response_content) as content_len,
  length(request_params) as req_params_len,
  length(response_params) as resp_params_len
FROM request_logs
ORDER BY length(response_content) DESC
LIMIT 10;
```

---

## 7. 结论

**核心发现**：
1. ✅ **所有数据完整存储**在数据库中
2. ❌ **协议转换日志**存在显示截断（JSON行、SSE chunk）
3. 🔄 **前端UI**使用折叠设计（可展开）

**推荐行动**：
1. 修复 `renderCompleteJSON()` 的行截断问题（P0）
2. 增加 SSE chunk 显示长度（P1）
3. 评估 `first_message` 字段长度（P2）

**无数据丢失风险**，仅显示层面的用户体验问题。
