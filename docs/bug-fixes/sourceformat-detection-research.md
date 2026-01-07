# sourceFormat 判断逻辑完整调研

## 核心发现

**sourceFormat 不是通过请求体内容推断，而是通过 URL 端点硬编码指定。**

---

## 📍 判断逻辑

### 代码位置

`gateway-controller.ts:[845-874]`

### 端点映射表

| 请求端点 | sourceFormat | 说明 |
|---------|--------------|------|
| `POST /v1/chat/completions` | `'openai'` | OpenAI 兼容格式 |
| `POST /v1/messages` | `'anthropic'` | Anthropic 兼容格式 |
| `POST /v1/models/*:generateContent` | `'gemini'` | Gemini 兼容格式 |

### 代码实现

```typescript
// OpenAI 端点
router.post('/v1/chat/completions', async (c) => {
  return handleGatewayRequest(c, 'openai');  // ← 硬编码
});

// Anthropic 端点
router.post('/v1/messages', async (c) => {
  return handleGatewayRequest(c, 'anthropic');  // ← 硬编码
});

// Gemini 端点
router.post('/v1/models/*', async (c) => {
  return handleGatewayRequest(c, 'gemini');  // ← 硬编码
});
```

---

## 🔄 完整数据流

```
用户请求 → URL 端点
   ↓
/v1/messages        → sourceFormat = 'anthropic'
/v1/chat/completions → sourceFormat = 'openai'
/v1/models/...      → sourceFormat = 'gemini'
   ↓
handleGatewayRequest(c, sourceFormat)
   ↓
转换流程:
  1. sourceFormat → Internal Format
  2. Internal Format → targetFormat (上游)
  3. 上游响应 → Internal Format
  4. Internal Format → sourceFormat (客户端)  ← ⭐ 修复点
   ↓
返回与请求格式一致的响应
```

---

## ⚠️ 当前限制

### 1. 没有内容推断

当前系统**不检查请求体内容**来判断格式，仅依赖 URL 端点。

**潜在问题**:
- 用户发送到 `/v1/chat/completions` 的请求使用 Anthropic 格式的请求体
- 系统会当作 OpenAI 格式处理
- 可能导致转换错误

### 2. GLM 特殊处理

GLM 使用别名映射:

```typescript
// gateway-controller.ts:[91]
const sourceConverter = converters.get(sourceFormat === 'glm' ? 'openai' : sourceFormat);
```

GLM → OpenAI converter，但 GLM 实际上支持两种格式：
- OpenAI 兼容格式
- Anthropic 兼容格式

---

## ✅ 如何验证

### 方法 1: 查看日志输出

在最新的代码中，我添加了日志：

```typescript
console.log('[Gateway] Response format selection:', {
  sourceFormat,
  requestId,
  targetFormat,
  'Selected converter': sourceFormat === 'glm' ? 'openai' : sourceFormat,
});
```

**查看方式**:

```bash
# 查看最新的格式选择日志
tail -f logs/*.log | grep "Response format selection"

# 或者查看协议转换日志
cat logs/protocol-transformation/*.log | grep "sourceFormat\|targetFormat"
```

### 方法 2: 使用 curl 测试

**测试 Anthropic 端点**:

```bash
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "glm-4-air",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }' | jq '.type, .role, .content'
```

**期望结果**: 应该返回 `type: "message"`, `role: "assistant"`, `content: [...]`

**测试 OpenAI 端点**:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "glm-4-air",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }' | jq '.object, .choices[0].message'
```

**期望结果**: 应该返回 `object: "chat.completion"`, `choices[0].message`

### 方法 3: 查看协议转换日志

```bash
# 查找最近的日志
ls -lt logs/protocol-transformation/*.log | head -5

# 查看完整转换流程
cat logs/protocol-transformation/03b00a12-bfdf-4c94-a15e-2491768c3613-8c3613-1767764095945.log | grep -A 10 "STEP 1\|STEP 4"
```

---

## 📊 格式对应关系表

### 请求格式

| 用户使用 | 端点 | sourceFormat | 请求体格式 |
|---------|------|--------------|-----------|
| OpenAI SDK | `/v1/chat/completions` | `'openai'` | `messages`, `tools` |
| Anthropic SDK | `/v1/messages` | `'anthropic'` | `messages`, `tools` |
| Gemini SDK | `/v1/models/*:generateContent` | `'gemini'` | `contents`, `tools` |

### 响应格式（修复后）

| 用户使用 | sourceFormat | 响应体格式 |
|---------|--------------|-----------|
| OpenAI SDK | `'openai'` | `choices`, `tool_calls`, `finish_reason` |
| Anthropic SDK | `'anthropic'` | `content[]`, `tool_use`, `stop_reason` |
| Gemini SDK | `'gemini'` | `contents`, `function_calls`, `stopReason` |

---

## 🧪 测试验证清单

- [ ] 发送到 `/v1/messages` 的请求返回 `type: "message"`
- [ ] 发送到 `/v1/chat/completions` 的请求返回 `object: "chat.completion"`
- [ ] 日志显示正确的 `sourceFormat`
- [ ] 日志显示正确的 `Selected converter`
- [ ] 响应格式与请求格式一致

---

## 📝 总结

1. **判断方式**: URL 端点硬编码，不检查请求体内容
2. **支持格式**: 主要 2 种 - OpenAI 和 Anthropic（Gemini 是第 3 种）
3. **验证方法**:
   - 查看日志中的 `Response format selection`
   - 使用 curl 测试不同端点
   - 检查响应格式是否与请求格式一致

4. **最新修复**: 响应转换现在使用 `sourceFormat` 选择 converter，确保格式一致性
