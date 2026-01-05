# 测试计划：修复日志 60ab6ba6 结构化内容展示

## 修复内容

### 1. 添加了 `isStructuredContent` 辅助函数（LogExplorer.tsx 492-502行）

```typescript
const isStructuredContent = (content: string | undefined): boolean => {
  if (!content) return false;
  const trimmed = content.trim();
  if (!trimmed.startsWith('[')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed);
  } catch {
    return false;
  }
};
```

**功能**：检测 content 是否是 JSON 数组（Anthropic 结构化格式）

### 2. 修改了响应内容展示逻辑（LogExplorer.tsx 1852-1883行）

**修改前**：
```typescript
{selectedLog.responseContent ? (
    // 所有 responseContent 都用 formatContent 格式化为纯文本
    <ExpandableContent content={formatContent(selectedLog.responseContent)} />
) : selectedLog.responseParams?.finish_reason === 'tool_calls' ? (
    // 只有 finish_reason = 'tool_calls' 时才用 StructuredContentViewer
    ...
)}
```

**修改后**：
```typescript
{isStructuredContent(selectedLog.responseContent) ? (
    // 结构化内容使用 StructuredContentViewer（带折叠面板、分类展示）
    <StructuredContentViewer content={selectedLog.responseContent!} />
) : selectedLog.responseContent ? (
    // 普通文本内容使用 formatContent
    <ExpandableContent content={formatContent(selectedLog.responseContent)} />
) : selectedLog.responseParams?.finish_reason === 'tool_calls' ? (
    // finish_reason = 'tool_calls' 但没有 responseContent 的旧逻辑
    ...
)}
```

## 测试用例

### 测试用例 1：日志 60ab6ba6（结构化内容）

**数据**：
```json
{
  "response_content": "[{\"type\":\"thinking\",\"thinking\":\"用户想让我删除任务列表并继续工作。让我清空任务列表。\"},{\"type\":\"text\",\"text\":\"好的，任务列表已清空。\"},{\"type\":\"tool_use\",\"id\":\"call_356adb751d7c4d7babfda937\",\"name\":\"TodoWrite\",\"input\":{\"todos\":[]}}]",
  "response_params": "{\"model\":\"glm-4.7\",\"id\":\"msg_20260105003316288630949e1e48cd\"}",
  "response_tool_calls": ""
}
```

**预期结果**：
- ✅ 显示 "Structured Content" 标签（紫色）
- ✅ 使用 StructuredContentViewer 组件
- ✅ 显示三个折叠面板：
  - Thinking Process（紫色）- 显示思考内容
  - Tool Calls（靛蓝色）- 显示 TodoWrite 工具调用
  - Text Content（蓝色）- 显示 "好的，任务列表已清空。"

**验证步骤**：
1. 打开 LogExplorer 页面
2. 搜索日志 ID: `60ab6ba6`
3. 点击查看详情
4. 检查 "Final Output" 部分
5. 确认有 "Structured Content" 标签
6. 确认有三个可折叠的面板

### 测试用例 2：普通文本响应

**数据**：
```json
{
  "response_content": "这是一段普通的文本回复，不是 JSON 数组。",
  "response_params": "{\"finish_reason\":\"stop\"}"
}
```

**预期结果**：
- ✅ 不显示 "Structured Content" 标签
- ✅ 使用 ExpandableContent 组件
- ✅ 显示纯文本内容

### 测试用例 3：tool_calls 响应（旧逻辑兼容）

**数据**：
```json
{
  "response_content": "",
  "response_params": "{\"finish_reason\":\"tool_calls\"}",
  "response_tool_calls": "[{\"function\":{\"name\":\"search\",\"arguments\":\"{}\"}}]"
}
```

**预期结果**：
- ✅ 使用 tool_calls 逻辑（显示 "Tool Calls" 标签）
- ✅ 不影响原有功能

### 测试用例 4：空 responseContent

**数据**：
```json
{
  "response_content": "",
  "response_params": "{\"finish_reason\":\"stop\"}"
}
```

**预期结果**：
- ✅ 显示 "No response content generated (Stream or Error)"

## 预期效果对比

### 修复前（日志 60ab6ba6）

```
Model Output

[Thinking]
用户想让我删除任务列表并继续工作。让我清空任务列表。
[/Thinking]
好的，任务列表已清空。
[Tool Use: TodoWrite
 ID: call_356adb751d7c4d7babfda937
 Input: {"todos":[]}
]
```

**问题**：
- 所有内容混在一起
- 没有折叠面板
- 没有颜色区分
- 工具调用参数难以阅读

### 修复后（日志 60ab6ba6）

```
Model Output [Structured Content]

🧠 Thinking Process (1)          [可折叠]
   └─ "用户想让我删除任务列表并继续工作。让我清空任务列表。"

⚙️ Tool Calls (1)                [可折叠]
   └─ TodoWrite
      └─ input: {"todos":[]}

💬 Text Content (1 blocks)       [可折叠]
   └─ "好的，任务列表已清空。"
```

**改进**：
- ✅ 内容分类清晰
- ✅ 可折叠/展开
- ✅ 颜色区分（紫色、靛蓝色、蓝色）
- ✅ 工具调用参数格式化显示

## 回归测试清单

- [ ] 普通文本响应正常显示
- [ ] JSON 对象响应（非数组）正常显示
- [ ] tool_calls 响应正常显示
- [ ] 空 responseContent 正常处理
- [ ] 结构化内容正常显示（本次修复的目标）
- [ ] 复制按钮正常工作
- [ ] 折叠面板正常工作

## 手动测试命令

```bash
# 1. 启动开发服务器
npm run dev

# 2. 打开浏览器
open http://localhost:5173

# 3. 导航到日志页面
# 点击左侧菜单 "Logs"

# 4. 搜索日志 60ab6ba6
# 在搜索框输入: 60ab6ba6

# 5. 验证显示效果
# 检查是否有 "Structured Content" 标签
# 检查是否有三个折叠面板
```

## 自动化测试（可选）

可以添加 Vitest 测试：

```typescript
import { describe, it, expect } from 'vitest';
import { isStructuredContent } from './LogExplorer';

describe('isStructuredContent', () => {
  it('should return true for JSON array', () => {
    const content = '[{"type":"text","text":"hello"}]';
    expect(isStructuredContent(content)).toBe(true);
  });

  it('should return false for plain text', () => {
    const content = 'hello world';
    expect(isStructuredContent(content)).toBe(false);
  });

  it('should return false for JSON object', () => {
    const content = '{"text":"hello"}';
    expect(isStructuredContent(content)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isStructuredContent('')).toBe(false);
  });

  it('should return false for invalid JSON', () => {
    const content = '[invalid json';
    expect(isStructuredContent(content)).toBe(false);
  });
});
```
