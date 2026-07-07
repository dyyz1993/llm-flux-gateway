# A/B 对比测试方法论

> 适用于任何协议适配器的格式保真度验证。
> 当你新接一个厂商、修改适配器、或调试格式问题时，用这套方法确保网关输出与上游一致。

---

## 一、核心理念

```
A: 直接调上游（标准答案）
B: 经过网关处理后调上游（待测对象）

对比两个维度：
  入仓（request）：   A 发什么 → B 发什么（上游实际收到的是否一致）
  出仓（response）：  A 返回什么 → B 返回什么（下游收到的响应是否一致）
```

**原则**：
1. A 组永远是最原始的"裸调"——不经过任何中间层，直接调厂商 API
2. B 组是完整的网关链路——输入适配器 → pi-ai 处理 → 输出适配器
3. 入仓 A/B 确保输入侧没有丢失/篡改字段
4. 出仓 A/B 确保输出侧格式与上游完全一致

---

## 二、测试脚本模板

### 2.1 拦截 pi-ai 的实际 HTTP 请求（入仓）

```js
// 在调用 pi-ai 之前 wrap fetch
const originalFetch = globalThis.fetch;
let capturedBody = null;
globalThis.fetch = async function(url, options) {
  if (url.toString().includes('你的上游域名')) {
    capturedBody = JSON.parse(options.body);
  }
  return originalFetch.call(globalThis, url, options);
};

// 跑 B 链路
const { context, options } = openaiToPiContext(rawRequest);
const stream = await models.stream(model, context, { ...options, apiKey });
for await (const event of stream) { /* consume */ }

globalThis.fetch = originalFetch;

// 对比
console.log('A 入仓:', JSON.stringify(rawRequest));
console.log('B 入仓:', JSON.stringify(capturedBody));
diff(rawRequest, capturedBody);
```

### 2.2 基于同一份上游 SSE 对比（出仓）

```
同一份 HTTP response → A 直接解析 SSE → B 过 pi-ai 事件 + 输出适配器 → 逐行对比
```

```js
// 1) 捕获上游原始 SSE
const resp = await fetch(upstreamUrl, { method:'POST', body: JSON.stringify(rawRequest) });
const rawSSE = await resp.text();
const upChunks = rawSSE.split('\n').filter(l => l.startsWith('data: ')).map(JSON.parse);

// 2) 将上游每个 chunk 转成 pi-ai 事件（模拟 pi-ai parser）
const events = [];
for (const chunk of upChunks) {
  const delta = chunk.choices[0].delta;
  if (delta.role === 'assistant')     → { type: 'start' }
  if (delta.reasoning_content)        → { type: 'thinking_delta', delta: ... }
  if (delta.content)                  → { type: 'text_delta', delta: ... }
  if (chunk.usage || finish_reason)   → { type: 'done', ... }
}

// 3) 用输出适配器转换
const converter = createOpenaiSSEConverter();
const gwChunks = [];
for (const event of events) {
  for (const line of converter.eventToSSE(event)) {
    gwChunks.push(JSON.parse(line.slice(6)));
  }
}

// 4) 逐行对比 delta 字段
for (let i = 0; i < Math.min(upChunks.length, gwChunks.length); i++) {
  const a = upChunks[i].choices[0].delta;
  const b = gwChunks[i].choices[0].delta;
  // 对比 keys, content, reasoning_content, tool_calls...
}
```

---

## 三、检查清单

### 入仓检查

| 检查项 | 方法 | 常见问题 |
|--------|------|----------|
| `messages` 是否完整 | 对比 A/B 的 messages 数组 | system 消息被吞、role 被改写、内容被截断 |
| `model` 是否一致 | 对比 model 字段 | 内部 model name 映射错误 |
| `stream` 参数 | 对比 stream 字段 | 非流式请求被转成流式 |
| `max_tokens` / `max_completion_tokens` | 对比 tokens 参数 | compat.maxTokensField 配置错误 |
| `thinking` / `reasoning_effort` | 对比 thinking 相关参数 | pi-ai 内置 bug 导致发 thinking:disabled |
| `tools` / `tool_choice` | 对比 tools 参数 | tool call 格式被改写 |
| `temperature` / `top_p` / `stop` | 对比 sampling 参数 | 参数被抹掉 |
| `stream_options` | B 有而 A 没有 | pi-ai 自动加的，确认上游支持 |

### 出仓检查

| 检查项 | 方法 | 常见问题 |
|--------|------|----------|
| SSE delta 字段 | 逐行对比 keys | 字段缺失（如 content:null）、多余字段 |
| SSE delta 内容 | 逐行对比 value | 内容被改写、拼接错误 |
| 行数 | 对比 reasoning/content chunk 数量 | pi-ai 合并了 thinking_delta |
| chunk 顺序 | 按序对比 | reasoning → content 顺序颠倒 |
| finish_reason | 对比最后一个 chunk | stop / length / tool_calls 映射错误 |
| usage 字段 | 对比 usage 对象 | reasoning_tokens 缺失、字段名不匹配 |
| reasoning_content 过渡标记 | 第一个 content chunk | 上游带 reasoning_content:null，网关也要带 |
| [DONE] 标记 | 最后一行 | 缺失或格式错误 |
| 非流式响应字段 | 对比 JSON message | reasoning_content 缺失、content 为 null 时格式 |

---

## 四、输出适配器 A/B 测试（适配器级别的独立验证）

如果只是想验证输出适配器本身（不依赖 pi-ai 事件格式），可以直接构造 mock 事件：

```js
const msg = makeMsg('hello');
const events = [
  { type: 'start', partial: msg },
  { type: 'thinking_delta', delta: 'Thinking step...', ... },
  { type: 'text_delta', delta: 'Answer', ... },
  { type: 'done', reason: 'stop', message: msg },
];

const converter = createOpenaiSSEConverter();
const output = [];
for (const event of events) {
  output.push(...converter.eventToSSE(event));
}
// 验证 output 的格式是否正确
```

---

## 五、常见适配器差异处理决策

| 差异类型 | 示例 | 处理方式 |
|----------|------|----------|
| **pi-ai 自动添加的字段** | `stream_options: {include_usage: true}` | 确认上游支持，记录为"良性差异" |
| **null vs 缺省** | `reasoning_content: null` vs 不传 | 必须匹配上游行为，显式补上 null |
| **空 reasoning_content** | `reasoning_content: ""` vs 不传 | 上游发空字符串的初始化行，逐行对比时跳过 |
| **字段顺序** | keys 顺序不同 | JSON 中无关紧要，可忽略 |
| **chunk 合并** | pi-ai 将多个 thinking_delta 合并 | 需确认 pi-ai parser 的行为，记录差异 |
| **额外字段** | upstream 有 `logprobs: null` 而网关没有 | 如果上游一定发，需要补上 |
| **usage 格式不同** | `prompt_cache_hit_tokens` vs `prompt_tokens_details.cached_tokens` | 需要做字段映射 |

---

## 六、现有 A/B 脚本参考

- `scripts/ab-compare-v2.mjs` — OpenAI 格式的完整 A/B 对比（拦截入仓 + SSE 逐行出仓对比）
- 对于 Anthropic 格式：用 Anthropic SDK 解析上游响应，对比事件序列
- 对于 Gemini 格式：对比 Gemini SDK 的响应结构

每次新接入一个协议格式时，参考此方法论创建对应的 A/B 测试脚本，并加入 CI。

---

## 七、快速启动

```bash
# 1. 确认要测试的模型和上游地址
export MODEL="deepseek-v4-flash"
export API_KEY="sk-xxx"
export BASE_URL="https://opencode.ai/zen/go/v1"

# 2. 写测试输入
cat > request.json << 'EOF'
{
  "model": "$MODEL",
  "stream": true,
  "max_tokens": 50,
  "messages": [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "What is 2+2?"}
  ]
}
EOF

# 3. 跑 A/B 对比脚本
node scripts/ab-compare-v2.mjs

# 4. 查看差异
# 入仓差异 → 确认 pi-ai 参数构建是否正确
# 出仓差异 → 确认输出适配器格式是否正确
```

---

## 八、与 AGENTS.md 的关联

AGENTS.md 中"常见问题排查"章节包含了 reasoning_content 丢失的快速排查步骤，
以及"适配器验证流程"章节描述了用官方 SDK 验证输出格式的方法。
本文档与此互补，提供了具体的 A/B 对比实现方法论。
