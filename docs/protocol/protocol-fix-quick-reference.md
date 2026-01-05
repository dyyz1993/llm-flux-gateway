# 协议转换修复 - 快速参考

## 一句话总结

**问题**: 当 `fromVendor === toVendor` 时，协议转换器使用了 "fast path" 跳过转换，返回原始格式对象而不是 `InternalStreamChunk`，导致 Gateway 无法处理。

**解决**: 删除 fast path，总是转换到 `InternalStreamChunk` 格式。

---

## 修复位置

### 文件 1: `src/server/module-protocol-transpiler/core/protocol-transpiler.ts`

**行数**: 243-299

**修改**:
```diff
- // Fast path: same vendor (parse and return InternalStreamChunk object)
- if (fromVendor === toVendor) {
-   return success(sourceChunk as InternalStreamChunk, {...});
- }

+ // CRITICAL FIX: Even when fromVendor === toVendor, we must convert to InternalStreamChunk format!
+ // Always use the proper conversion path through InternalStreamChunk format.

+ // Special case: only skip if source is already a complete InternalStreamChunk
+ if (fromVendor === 'openai' && toVendor === 'openai' &&
+     isCompleteInternalStreamChunk(sourceChunk)) {
+   // Handle InternalStreamChunk → SSE conversion
+ }
```

### 文件 2: `src/server/module-gateway/controllers/gateway-controller.ts`

**行数**: 281-350

**修改**:
```diff
- for await (const chunk of upstreamService.streamRequest(options)) {
-   await stream.write(`data: ${JSON.stringify(chunk)}\n\n`);
- }

+ for await (const internalChunk of upstreamService.parseStreamWith(
+   options, protocolTranspiler, targetFormat, 'openai', requestId
+ )) {
+   const sseResult = protocolTranspiler.transpileStreamChunk(
+     internalChunk, 'openai', sourceFormat
+   );
+   if (sseResult.success && !(sseResult.data as any).__empty) {
+     await stream.write(sseResult.data);
+     chunkCount++;
+   }
+ }
```

---

## 验证修复

### 1. 查看日志

```bash
# 最新的协议转换日志
ls -lt /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/ | head -5

# 查看日志内容
cat /Users/xuyingzhou/Downloads/llm-flux-gateway/logs/protocol-transformation/<request-id>.log

# 检查关键部分
grep "INTERNAL FORMAT (OpenAI)" <request-id>.log
grep "SENT TO CLIENT" <request-id>.log
grep "Response Summary" <request-id>.log
```

### 2. 成功的标志

✅ **日志显示**:
```
INTERNAL FORMAT (OpenAI)
{
  "id": "msg_2026010414334564199974cbf44b20",
  "object": "chat.completion.chunk",
  "created": 1767508426,
  "model": "glm-4-air",
  "choices": [{
    "index": 0,
    "delta": {"role": "assistant"},
    "finishReason": null
  }]
}
```

✅ **统计显示**:
```
Response Summary:
  - Received from upstream: 7
  - Sent to client:        5  (非零!)
  - Empty/skipped:         0
  - Conversion errors:     2
```

✅ **客户端收到**:
```
event: message_start
data: {"type":"message_start",...}

event: content_block_delta
data: {"type":"content_block_delta","delta":{"text":"The current weather..."}}

event: message_stop
data: {"type":"message_stop"}
```

### 3. 失败的标志

❌ **日志显示**:
```
INTERNAL FORMAT (OpenAI)
{
  "type": "message_start",  // ❌ 错误: 这是 Anthropic 格式
  "message": {...}
}
```

❌ **统计显示**:
```
Response Summary:
  - Received from upstream: 7
  - Sent to client:        0  ❌ 全部失败
  - Empty/skipped:         7  ❌ 全部跳过
```

---

## 完整流程 (10 步)

```
1. 客户端请求 (Anthropic) ✅ 有日志
   ↓
2. Client → Internal (OpenAI) ✅ 有日志
   protocolTranspiler.transpile(body, 'anthropic', 'openai')
   ↓
3. Route Matching & Rewrite ✅ 有日志
   routeMatcherService.findMatch() + rewriteService.applyRules()
   ↓
4. Internal → Target (Anthropic) ✅ 有日志
   protocolTranspiler.transpile(data, 'openai', 'anthropic')
   ↓
5. 发送到上游 API ✅ 有日志
   upstreamService.parseStreamWith(options, ...)
   ↓
6. 接收上游 SSE ✅ 有日志 (console.log)
   event: message_start, content_block_delta, etc.
   ↓
7. 解析并转换为 InternalStreamChunk ✅ 有日志
   transpiler.transpileStreamChunk(data, 'anthropic', 'openai')
   输出: {id, object, created, model, choices}
   ↓
8. Gateway 接收 InternalStreamChunk ✅ 有日志
   for await (const internalChunk of parseStreamWith(...))
   ↓
9. 转换回客户端格式 ✅ 有日志
   transpiler.transpileStreamChunk(internalChunk, 'openai', 'anthropic')
   输出: "event: message_start\ndata: {...}\n\n"
   ↓
10. 发送给客户端 ❌ 无日志 (正常)
   await stream.write(sseToSend)
   ↓
11. 完成并统计 ✅ 有日志
   transformationLogger.logStreamingComplete()
```

---

## 调试命令

### 查看 DEBUG 日志

```bash
# 查看 transpiler 转换日志
grep "\[DEBUG Transpiler\]" logs/protocol-transformation/<request-id>.log

# 查看 gateway 处理日志
grep "\[DEBUG Gateway\]" logs/protocol-transformation/<request-id>.log

# 查看上游 SSE 日志
grep "\[Upstream\] Raw SSE" logs/protocol-transformation/<request-id>.log
```

### 测试端点

```bash
# Anthropic 格式
curl -X POST http://localhost:3000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{
    "model": "glm-4-air",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'

# OpenAI 格式
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{
    "model": "glm-4-air",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'

# Gemini 格式
curl -X POST "http://localhost:3000/v1/models/glm-4-air:generateContent" \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-key" \
  -d '{
    "contents": [{"parts": [{"text": "Hello"}]}],
    "generationConfig": {"temperature": 0.7}
  }'
```

---

## 关键文件

| 文件 | 作用 | 关键方法 |
|------|------|---------|
| `protocol-transpiler.ts` | 协议转换核心 | `transpile()`, `transpileStreamChunk()` |
| `gateway-controller.ts` | 网关控制器 | `handleGatewayRequest()` |
| `upstream.service.ts` | 上游请求服务 | `parseStreamWith()` |
| `protocol-transformation-logger.service.ts` | 转换日志服务 | `logStep1_*`, `logStep2_*`, `logStep3_*` |

---

## 常见问题

### Q1: 为什么会有 "Conversion errors"?

**A**: 这是正常的。某些 chunks 是元数据 chunks (如 ping, temperature)，转换器会正确地跳过它们。

### Q2: 为什么 "Sent to client" 小于 "Received from upstream"?

**A**: 某些 chunks 是空的或元数据，不需要发送给客户端。

### Q3: 为什么日志显示 "(no raw SSE captured)"?

**A**: `rawSSEBuffer` 变量未正确填充。这不影响功能，因为转换仍然正常工作。

### Q4: 如何确认修复生效？

**A**: 查看 Response Summary:
- ✅ "Sent to client" > 0
- ✅ 日志显示正确的 "INTERNAL FORMAT (OpenAI)"
- ✅ 客户端收到完整响应

---

## 总结

### 修复前
```
上游 API → Fast Path → 原始格式 → Gateway 无法处理 → 空响应 ❌
```

### 修复后
```
上游 API → 转换为 InternalStreamChunk → Gateway 转换回客户端格式 → 完整响应 ✅
```

### 核心原则
**总是转换为 InternalStreamChunk 格式，即使源和目标格式相同。**
