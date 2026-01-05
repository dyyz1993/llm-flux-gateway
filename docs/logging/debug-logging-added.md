# 调试日志添加总结

## 目标

在每个转换点添加详细的日志，以便追踪数据在哪里丢失。

## 已完成的修改

### 1. upstream.service.ts - 行 225-231

**位置**: `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-gateway/services/upstream.service.ts`

**添加的日志**:
```typescript
// DEBUG: Log before yielding
console.log('[DEBUG Upstream] Yielding chunk:', {
  isEmpty: !!(result.data as any).__empty,
  hasChoices: !!(result.data as any)?.choices,
  chunkType: (result.data as any)?.object,
  chunkPreview: JSON.stringify(result.data).slice(0, 200)
});
```

**作用**: 在 yield chunk 之前记录数据状态，包括：
- 是否为空对象
- 是否包含 choices 字段
- chunk 类型
- 数据预览（前 200 字符）

---

### 2. gateway-controller.ts - 行 239-245

**位置**: `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-gateway/controllers/gateway-controller.ts`

**添加的日志**:
```typescript
// DEBUG: Log chunk received from upstream
console.log('[DEBUG Gateway] Received chunk from upstream:', {
  chunkIndex: receivedChunks,
  hasData: !!internalChunk,
  isEmptyObject: !!(internalChunk as any)?.__empty,
  preview: JSON.stringify(internalChunk).slice(0, 200)
});
```

**作用**: 在收到从 upstream 返回的 chunk 后记录：
- chunk 序号
- 是否有数据
- 是否为空对象
- 数据预览

---

### 3. gateway-controller.ts - 行 265-271

**位置**: 同上文件

**添加的日志**:
```typescript
// DEBUG: Log after conversion
console.log('[DEBUG Gateway] After transpileStreamChunk:', {
  success: sseResult.success,
  isEmpty: !!(sseResult.data as any)?.__empty,
  dataType: typeof sseResult.data,
  preview: JSON.stringify(sseResult.data).slice(0, 200)
});
```

**作用**: 在协议转换后记录：
- 转换是否成功
- 结果是否为空
- 结果数据类型
- 结果预览

---

### 4. gateway-controller.ts - 行 292-305

**位置**: 同上文件

**添加的日志**:
```typescript
// DEBUG: Check before sending
if (sseToSend && sseToSend.trim().length > 0) {
  console.log('[DEBUG Gateway] Sending to client:', {
    sseLength: sseToSend.length,
    ssePreview: sseToSend.slice(0, 200)
  });

  // Send SSE data to client
  await stream.write(sseToSend);
  chunkCount++;

  console.log('[DEBUG Gateway] Written to stream');
} else {
  console.log('[DEBUG Gateway] Skipped: empty SSE data');
}
```

**作用**: 在发送到客户端前后记录：
- SSE 数据长度
- SSE 数据预览
- 是否成功写入
- 如果跳过则记录原因

---

### 5. gateway-controller.ts - 行 310、313

**位置**: 同上文件

**添加的日志**:
```typescript
if (!sseResult.success) {
  console.error('[Gateway] Failed to convert chunk to SSE:', sseResult.errors);
  console.log('[DEBUG Gateway] Skipped: conversion failed');
  conversionErrors++;
} else {
  console.log('[DEBUG Gateway] Skipped: empty chunk');
  emptyChunks++;
}
```

**作用**: 在跳过 chunk 时记录原因：
- 转换失败
- 空数据

---

### 6. protocol-transpiler.ts - 行 213-219

**位置**: `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-protocol-transpiler/core/protocol-transpiler.ts`

**添加的日志**:
```typescript
// DEBUG: Log entry to transpileStreamChunk
console.log('[DEBUG Transpiler] transpileStreamChunk:', {
  fromFormat: fromVendor,
  toFormat: toVendor,
  inputType: (sourceChunk as any)?.object,
  inputPreview: JSON.stringify(sourceChunk).slice(0, 200)
});
```

**作用**: 在转换方法入口记录：
- 源格式
- 目标格式
- 输入类型
- 输入预览

---

### 7. protocol-transpiler.ts - 行 466-471、476-478

**位置**: 同上文件

**添加的日志**:
```typescript
// DEBUG: Log result before returning
console.log('[DEBUG Transpiler] transpileStreamChunk result:', {
  resultSuccess: finalResult.success,
  resultIsEmpty: !!(finalResult.data as any)?.__empty,
  resultType: typeof finalResult.data
});

// 错误情况
console.log('[DEBUG Transpiler] transpileStreamChunk error:', {
  error: error instanceof Error ? error.message : 'Unknown error'
});
```

**作用**: 在返回结果前记录：
- 结果是否成功
- 结果是否为空
- 结果类型
- 错误信息（如果有）

---

## 验证清单

✅ **upstream.service.ts** - yield 之前
✅ **gateway-controller.ts** - 收到 chunk 后
✅ **gateway-controller.ts** - 转换后
✅ **gateway-controller.ts** - 发送到客户端前/后
✅ **protocol-transpiler** - 转换时（入口和出口）

---

## 数据流追踪

现在的日志可以追踪完整的数据流：

1. **Upstream Service** → `parseStreamWith()` 解析 SSE → `yield` chunk
   - 日志: `[DEBUG Upstream] Yielding chunk`

2. **Gateway Controller** → 从 upstream 接收 chunk
   - 日志: `[DEBUG Gateway] Received chunk from upstream`

3. **Gateway Controller** → 调用 `protocolTranspiler.transpileStreamChunk()`
   - 日志: `[DEBUG Transpiler] transpileStreamChunk`

4. **Protocol Transpiler** → 执行转换
   - 日志: `[DEBUG Transpiler] transpileStreamChunk result`

5. **Gateway Controller** → 收到转换结果
   - 日志: `[DEBUG Gateway] After transpileStreamChunk`

6. **Gateway Controller** → 发送到客户端
   - 日志: `[DEBUG Gateway] Sending to client`
   - 日志: `[DEBUG Gateway] Written to stream`

---

## 测试步骤

添加日志后，按以下步骤测试：

1. 运行服务器
   ```bash
   npm run dev
   ```

2. 发起一个测试请求（使用 playground 或 curl）

3. 查看控制台输出，应该看到以下日志序列：
   ```
   [Upstream] parseStreamWith starting: ...
   [Upstream] Raw SSE #1: ...
   [Upstream] Extracted data #1: ...
   [Upstream] ✓ Parsed chunk #1: ...
   [DEBUG Upstream] Yielding chunk: ...
   [DEBUG Gateway] Received chunk from upstream: ...
   [DEBUG Transpiler] transpileStreamChunk: ...
   [DEBUG Transpiler] transpileStreamChunk result: ...
   [DEBUG Gateway] After transpileStreamChunk: ...
   [DEBUG Gateway] Sending to client: ...
   [DEBUG Gateway] Written to stream
   ```

4. 如果某个步骤没有日志输出，说明数据在该步骤丢失

---

## 修改的文件列表

1. `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-gateway/services/upstream.service.ts`
2. `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-gateway/controllers/gateway-controller.ts`
3. `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-protocol-transpiler/core/protocol-transpiler.ts`

---

## 日志前缀说明

- `[DEBUG Upstream]` - 上游服务日志
- `[DEBUG Gateway]` - 网关控制器日志
- `[DEBUG Transpiler]` - 协议转换器日志

所有日志都以 `[DEBUG` 开头，便于过滤和搜索。

---

## 预期结果

通过这些日志，可以：

1. 确认每个转换点都正常工作
2. 快速定位数据丢失的位置
3. 验证转换的正确性（通过预览数据）
4. 统计实际发送到客户端的 chunk 数量

---

## 后续步骤

如果发现数据在某个环节丢失：

1. 检查该环节的日志输出
2. 查看是否有错误信息
3. 分析数据预览，确认数据结构是否正确
4. 根据日志中的提示进行修复
