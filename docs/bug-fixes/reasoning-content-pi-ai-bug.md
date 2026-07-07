# reasoning_content 丢失排查记录

> **问题**：调 deepseek 系列模型时，流式响应没有 `reasoning_content`，非流式也没有 `reasoning_content` 字段。
> **根因**：pi-ai 的 `thinkingFormat: "deepseek"` 逻辑会在无 `reasoningEffort` 时发 `thinking: {type: "disabled"}`。
> **修复**：见 `src/server/pi-providers/index.ts` 中 `registerPiRoute()` 的 `off: null` 覆盖。

---

## 一、快速排查清单

如果用户反馈"看不到 reasoning"或"模型不思考"，按以下顺序排查：

### Step 1：验证上游是否返回 reasoning_content

直接 curl 上游，看原始 SSE 有没有 `reasoning_content` 字段：

```bash
curl -sS "https://opencode.ai/zen/go/v1/chat/completions" \
  -H "Authorization: Bearer <真实上游Key>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-v4-flash",
    "stream": true,
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "What is 2+2?"}]
  }' | head -5
```

如果上游有 `reasoning_content` → 问题在网关。如果没有 → 问题在上游/Key。

### Step 2：验证 pi-ai 是否发送了 thinking:disabled

在 `node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js` 搜 `"disabled"`。找到这段逻辑：

```js
else if (compat.thinkingFormat === "deepseek" && model.reasoning) {
    if (options?.reasoningEffort) {
        params.thinking = { type: "enabled" };
    }
    else if (model.thinkingLevelMap?.off !== null) {
        params.thinking = { type: "disabled" };  // ← 这条的问题
    }
```

如果用调试工具拦截了请求，看 request body 有没有 `"thinking":{"type":"disabled"}`。

### Step 3：验证 model.thinkingLevelMap 是否有 off 键

```js
const m = builtinModels().getModel('opencode-go', 'deepseek-v4-flash');
console.log(m.thinkingLevelMap?.off); // undefined = 没有 off 键
console.log(m.thinkingLevelMap?.off !== null); // true → 会发 disabled
```

如果 `off` 是 `undefined`（不在 map 里），`undefined !== null` → `true`，触发 bug。

---

## 二、根因分析（完整版）

### 2.1 pi-ai 的 reasoning 控制逻辑

pi-ai 的 `openai-completions.js` 有一个参数构建函数，负责把 `thinkingFormat` + `reasoning` + `reasoningEffort` 转成实际的请求参数。

对于 `thinkingFormat: "deepseek"`，逻辑是：

```
if (reasoningEffort 有值)
  → 发送 thinking: {type: "enabled", ...}
else if (thinkingLevelMap.off !== null)
  → 发送 thinking: {type: "disabled"}
```

也就是说，如果没传 `reasoningEffort`（大部分普通请求），它会检查 `thinkingLevelMap.off`。

### 2.2 thinkingLevelMap 的语义

| `off` 的值 | `off !== null` | pi-ai 行为 | 含义 |
|-----------|:-:|-----------|------|
| `null` | `false` | 不发 thinking:disabled | 这个模型不能关闭 reasoning |
| `"none"` / `"off"` | `true` | 发 thinking:disabled | 可以关闭 reasoning，off 时传这个值 |
| `undefined`（不存在） | `true` | **发 thinking:disabled** | **pi-ai 的 bug** |

### 2.3 内置模型的实际配置

`opencode-go/deepseek-v4-flash` 的内置配置：

```json
{
  "reasoning": true,
  "compat": { "thinkingFormat": "deepseek" },
  "thinkingLevelMap": {
    "minimal": null,
    "low": null,
    "medium": null,
    "high": "high",
    "xhigh": "max"
    // ⚠️ 没有 off 键！
  }
}
```

没有 `off` 键的本意是"这个模型无法关闭 reasoning"（跟 `minimal: null` 语义类似）。但 pi-ai 的检查逻辑把 `undefined` 当成了"可以关"。

### 2.4 修复方案

在 `src/server/pi-providers/index.ts` 的 `registerPiRoute()` 中，clone 内置模型时显式补上 `off: null`：

```ts
if (piModel && piModel.reasoning && piModel.compat?.thinkingFormat === 'deepseek') {
    const tlm = piModel.thinkingLevelMap as any;
    if (!tlm || !('off' in tlm)) {
        piModel.thinkingLevelMap = { ...(tlm || {}), off: null };
    }
}
```

这样 `thinkingLevelMap.off !== null` → `null !== null` → `false` → pi-ai 不发 `thinking:disabled`。

---

## 三、输出适配器相关改动

### 3.1 流式：thinking_delta 加 content:null

上游（opencode.ai）每个 reasoning chunk 都带 `content: null`：

```json
{"delta": {"content": null, "reasoning_content": "Thinking"}}
```

输出适配器的 `thinking_delta` 事件处理要加上 `content: null`：

```ts
case 'thinking_delta': {
    yield sse({
        choices: [{ index: 0, delta: { content: null, reasoning_content: event.delta }, finish_reason: null }],
    });
    break;
}
```

### 3.2 流式：增量输出，不缓存合并

旧版本把 `thinking_delta` 全部缓存到 `pendingReasoning`，等 `text_delta` 才合并输出。这导致：
- 客户端在 thinking 阶段看不到任何输出
- 最终爆发式输出大量 reasoning + text

新版本每个 `thinking_delta` 立即输出一个 SSE chunk，匹配上游实时行为。

### 3.3 非流式：提取 reasoning_content

pi-ai 的 `complete()` 把 thinking 放在 `content` blocks 的 `thinking` 类型中：

```
content: [
  {type: "thinking", thinking: "..."},
  {type: "text", text: "Bonjour"}
]
```

`piResponseToOpenaiJson()` 需要提取 `thinking` blocks 作为 `reasoning_content`：

```ts
function extractReasoningContent(content): string | null {
    const blocks = content.filter(b => b.type === 'thinking');
    return blocks.map(t => t.thinking).join('');
}
```

然后写入 `response.choices[0].message.reasoning_content`。

---

## 四、验证方法

### 4.1 Before/After 对比

```bash
npx tsx scripts/test-reasoning-before-after.ts
```

预期输出：

```
BEFORE: thinking_delta=0, reasoning_tokens=0
AFTER:  thinking_delta=22, reasoning_tokens=22
```

### 4.2 A/B 格式对比

用同一份上游 SSE 数据，过输出适配器，逐行对比：

```bash
npx tsx scripts/test-format-fidelity.ts
```

预期输出：`✅ 完全一致（0 处差异）`

### 4.3 真实网关验证

```bash
curl -sN "http://localhost:3000/v1/chat/completions" \
  -H "Authorization: Bearer sk-flux-xxx" \
  -d '{"model":"deepseek-v4-flash","stream":true,"messages":[{"role":"user","content":"hi"}]}'
```

预期：看到 `reasoning_content` 逐字输出，最终 chunk 有 `reasoning_tokens`。

---

## 五、相关文件

| 文件 | 作用 |
|------|------|
| `src/server/pi-providers/index.ts` | `registerPiRoute()` 中 `off: null` 修复 |
| `src/server/adapters/output/openai.adapter.ts` | 输出适配器（流式 + 非流式） |
| `src/server/adapters/__tests__/fv/format-fidelity.test.ts` | A/B 格式保真度测试 |
| `src/server/adapters/__tests__/fv/full-verification.test.ts` | 全链路验证 |

---

## 六、同类问题排查思路

如果其他模型也没有 reasoning_content：

1. **确认模型有 `reasoning: true`**：在 `builtinModels()` 中查看
2. **确认 `compat.thinkingFormat`**：deepseek 系列是 `"deepseek"`，其他模型可能是 `"zai"` / `"chat-template"` 等
3. **看对应 thinkingFormat 的代码逻辑**：在 `openai-completions.js` 搜 `thinkingFormat === "xxx"`
4. **检查是不是也触发了 `thinking:disabled`**：拦截请求 body 看是否有 `thinking: {type: "disabled"}`
5. **如果 pi-ai 的规则不对，用同样方式覆盖配置**：在 `registerPiRoute()` 中 clone 后改对应字段
