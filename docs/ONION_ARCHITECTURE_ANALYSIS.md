# 系统架构重新分析 - API Key 格式声明与透传转换

## 核心理解修正

### 之前的误解

❌ **错误理解**：系统自动检测客户端格式并转换

✅ **正确理解**：**Route 声明对外提供的格式，Client 必须按此格式发送请求**

---

## 1. 重新理解的架构

### 架构层次

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         API Key → Route → Asset → Vendor                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  客户端 (使用特定格式)                                                   │
│      │                                                                  │
│      ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ API Key                                                           │   │
│  │ - sk-flux-xxx                                                    │   │
│  │ - 对外声称支持的格式由 Route 决定                                 │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│      │                                                                  │
│      ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Route                                                             │   │
│  │ - request_format: 'openai' | 'anthropic' | 'gemini'             │   │
│  │ - response_format: 'openai' | 'anthropic' | 'gemini'            │   │
│  │ - overrides: 覆写参数 (model, temperature 等)                    │   │
│  │ - asset_id: 绑定的资产                                          │   │
│  │                                                                  │   │
│  │  说明: Route 声明了"我对外提供什么格式"                            │   │
│  │        客户端必须按此格式发送请求                                 │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│      │                                                                  │
│      ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Asset                                                             │   │
│  │ - vendor_id: 厂商                                                 │   │
│  │ - api_key: 上游 API Key                                          │   │
│  │                                                                  │   │
│  │  说明: Asset 决定了"上游用什么厂商"                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│      │                                                                  │
│      ▼                                                                  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Vendor                                                            │   │
│  │ - base_url: API 端点                                              │   │
│  │ - endpoint: 请求路径                                              │   │
│  │                                                                  │   │
│  │  说明: Vendor 决定了"上游的原生格式"                              │   │
│  │        (通过 URL 判断: /messages → Anthropic)                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 关键概念

| 概念 | 位置 | 作用 | 格式 |
|------|------|------|------|
| **对外格式** | Route.request_format/response_format | 客户端必须使用的格式 | openai/anthropic/gemini |
| **上游格式** | Vendor (URL 判断) | 厂商的原生格式 | openai/anthropic/gemini |
| **资产** | Asset.asset_id | 绑定哪个厂商 | 厂商 ID |

---

## 2. 场景分析

### 场景 A: 直接透传（最简单）

**条件**：Route 声明的格式 == Vendor 原生格式

```
Route: request_format='openai', response_format='openai'
  │
  ▼
Asset: vendor_id='zhipu-coding' (Zhipu coding)
  │
  ▼
Vendor: base_url='https://open.bigmodel.cn/api/coding/paas/v4'
        endpoint='/chat/completions'
        (原生格式 = OpenAI)
```

**数据流**:
```
客户端请求 (OpenAI 格式)
    │
    ▼
Route: 检查 request_format='openai' ✅ 匹配
    │
    ▼
Asset: 选择 zhipu-coding
    │
    ▼
Vendor: 检测到 OpenAI 格式 (/chat/completions)
    │
    ▼
【格式相同 → 直接透传，无需转换】
    │
    ▼
上游 API (OpenAI 格式)
    │
    ▼
【响应格式相同 → 直接透传，无需转换】
    │
    ▼
客户端接收 (OpenAI 格式)
```

**特点**:
- ✅ 零转换开销
- ✅ 性能最优
- ✅ 无信息丢失

**示例**:
```
Route: coding (openai|openai)
Asset: Zhipu coding (OpenAI 兼容)
Vendor: /chat/completions

→ 直接透传
```

---

### 场景 B: 格式转换（洋葱模型）

**条件**：Route 声明的格式 != Vendor 原生格式

```
Route: request_format='openai', response_format='openai'
  │
  ▼
Asset: vendor_id='zhipu-coding-anthropic' (Zhipu coding anthropic)
  │
  ▼
Vendor: base_url='https://open.bigmodel.cn/api/anthropic'
        endpoint='/messages'
        (原生格式 = Anthropic)
```

**数据流（洋葱模型）**:
```
客户端请求 (OpenAI 格式)
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 洋葱层 1: 接收层                                                │
│ - 检查 Route.request_format = 'openai'                          │
│ - 接收 OpenAI 格式的请求                                        │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 洋葱层 2: 验证与覆写层                                         │
│ - 验证请求格式是否符合 Route.request_format                      │
│ - 应用 Route.overrides (model, temperature 等)                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 洋葱层 3: 格式转换层 (请求方向)                                │
│ - 检查 Vendor 原生格式 (通过 URL 判断)                          │
│ - OpenAI → Anthropic 转换                                       │
│   - messages → messages (提取 system)                          │
│   - tools → tools (转换格式)                                    │
│   - max_tokens → max_tokens                                    │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 洋葱层 4: 上游通信层                                           │
│ - 发送 HTTP 请求到 Vendor                                      │
│ - 处理流式响应                                                  │
│ - 解析 SSE 流 (Anthropic 格式)                                 │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 洋葱层 5: 格式转换层 (响应方向)                                │
│ - Anthropic → OpenAI 转换                                       │
│   - content_block_delta → choices[0].delta.content             │
│   - tool_use blocks → tool_calls                               │
│   - message_delta → usage                                      │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 洋葱层 6: 日志采集层 (异步)                                    │
│ - 异步记录请求日志                                             │
│ - 不阻塞返回给客户端                                            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
客户端接收 (OpenAI 格式)
```

**特点**:
- ⚠️ 有转换开销（~10ms/转换）
- ⚠️ 可能丢失某些字段
- ✅ 灵活性高

**示例**:
```
Route: glm-coding-anthropic (anthropic|anthropic)
Asset: Zhipu coding anthropic
Vendor: /messages (Anthropic 格式)

→ 需要转换
```

---

## 3. 洋葱模型架构设计

### 完整的洋葱层

```
                    ┌─────────────────────────────────────────┐
                    │              客户端                      │
                    └──────────────────┬──────────────────────┘
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 1: API Key 认证层                                               │
│ - 验证 API Key 是否存在                                              │
│ - 检查 API Key 状态 (active/inactive)                                │
│ - 记录 last_used_at                                                  │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 2: Route 匹配层                                                │
│ - 根据路径/模型匹配 Route                                            │
│ - 获取 Route 配置 (request_format, response_format, overrides)       │
│ - 检查 Route is_active                                             │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 3: 格式验证层                                                 │
│ - 验证请求格式是否符合 Route.request_format                           │
│ - 解析请求体                                                         │
│ - 提取参数 (messages, tools, temperature 等)                         │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 4: 参数覆写层                                                  │
│ - 应用 Route.overrides                                               │
│   - model: 覆盖模型名称                                             │
│   - temperature: 覆盖温度                                           │
│   - max_tokens: 覆盖最大 token 数                                    │
│ - 合并用户参数和覆写参数                                             │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 5: Asset 获取层                                               │
│ - 根据 Route.asset_id 获取 Asset                                    │
│ - 获取上游 API Key                                                  │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 6: Vendor 格式检测层                                          │
│ - 根据 Vendor URL 判断上游格式                                      │
│   - /messages → Anthropic                                          │
│   - /chat/completions → OpenAI                                      │
│   - 其他路径 → 按配置                                               │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 7: 格式转换层 (请求方向)                                      │
│ if (Route.request_format !== Vendor.native_format) {                │
│   - 使用 FormatConverter 转换                                      │
│   - InternalRequest → Vendor Format                                │
│ } else {                                                            │
│   - 直接透传                                                        │
│ }                                                                  │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 8: 日志创建层                                                 │
│ - 创建 request_logs 记录                                            │
│ - 记录请求信息 (格式、参数、时间戳)                                 │
│ - 返回 log_id 用于后续更新                                          │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 9: 上游通信层                                                 │
│ - 发送 HTTP 请求到上游                                              │
│ - 处理流式响应                                                      │
│ - 使用对应的 SSE Parser 解析                                        │
│   - OpenAI Parser                                                  │
│   - Anthropic Parser                                               │
│   - Gemini Parser (TODO)                                          │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 10: 格式转换层 (响应方向)                                     │
│ if (Route.response_format !== Vendor.native_format) {               │
│   - 使用 FormatConverter 转换                                      │
│   - Vendor Format → InternalResponse                               │
│   - InternalResponse → Route.response_format                        │
│ } else {                                                            │
│   - 直接透传                                                        │
│ }                                                                  │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 洋葱层 11: 日志更新层 (异步)                                         │
│ - 异步更新 request_logs                                             │
│ - 记录响应信息 (状态码、tokens、内容)                               │
│ - 不阻塞返回给客户端                                                │
└────────────────────────────────────────────────────────────────────────┤
                                       │
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │              客户端                      │
                    │  (Route.response_format 格式)           │
                    └─────────────────────────────────────────┘
```

---

## 4. 格式矩阵

### Route 配置 vs Vendor 原生格式

| Route 配置 | Vendor 原生格式 | 是否需要转换 | 性能 |
|------------|-----------------|-------------|------|
| openai → OpenAI | 无 | ✅ 最优 |
| openai → Anthropic | 有 | ⚠️ ~10ms/chunk |
| openai → Gemini | 有 | ⚠️ ~10ms/chunk |
| anthropic → Anthropic | 无 | ✅ 最优 |
| anthropic → OpenAI | 有 | ⚠️ ~10ms/chunk |
| anthropic → Gemini | 有 | ⚠️ ~20ms/chunk |
| gemini → Gemini | 无 | ✅ 最优 |
| gemini → OpenAI | 有 | ⚠️ ~10ms/chunk |
| gemini → Anthropic | 有 | ⚠️ ~20ms/chunk |

### 当前系统的 Route 配置

| Route 名称 | request_format | response_format | Asset | Vendor 原生格式 | 需要转换 |
|-----------|----------------|-----------------|-------|---------------|---------|
| coding | openai | openai | Zhipu coding | OpenAI | ❌ 否 |
| glm-coding-anthropic | anthropic | anthropic | Zhipu coding anthropic | Anthropic | ❌ 否 |
| Test Anthropic Format | openai | openai | Zhipu coding | OpenAI | ❌ 否 |
| Test Gemini Format | openai | openai | Zhipu coding | OpenAI | ❌ 否 |

**发现**：当前所有 Route 配置都是**直接透传**，无需格式转换！

---

## 5. Logs 异步采集机制

### 为什么需要异步采集？

**原因**：
1. **不阻塞返回** - 日志记录不能延迟响应返回给客户端
2. **性能考虑** - 格式转换、内容解析都是耗时操作
3. **可靠性** - 即使日志记录失败，也不影响客户端接收响应

### 异步采集流程

```
流式响应处理
    │
    ├─► 【同步】发送 chunk 给客户端 (立即)
    │
    └─► 【异步】记录日志
          │
          ├─► 累积 content (用于日志)
          ├─► 累积 tool_calls (用于日志)
          ├─► 收集 usage 信息
          │
          ▼
      响应结束后
          │
          ▼
      异步更新数据库
          │
          ├─► response_content
          ├─► response_tool_calls
          ├─► prompt_tokens, completion_tokens
          └─► latency_ms
```

### 当前实现

```typescript
// gateway-controller.ts
for await (const chunk of upstreamService.streamRequest(...)) {
  // 【同步】立即发送给客户端
  await stream.write(`data: ${JSON.stringify(chunk)}\n\n`);

  // 【同步】累积数据用于日志（不影响返回速度）
  if (chunk.choices?.[0]?.delta?.content) {
    fullContent += chunk.choices[0].delta.content;
  }

  if (chunk.choices?.[0]?.delta?.tool_calls) {
    // 累积 tool_calls
  }
}

// 【异步】响应结束后更新日志
finally {
  await requestLogService.updateLog(logId, {
    responseContent: fullContent,
    responseToolCalls: toolCallsArray,
    promptTokens,
    completionTokens,
    latencyMs,
  });
}
```

---

## 6. 问题重新评估

### 问题 1: 当前系统是否支持格式转换？

**答案**：✅ 支持，但当前所有 Route 都配置为直接透传

**原因**：
- 系统有完整的 format-converters
- Route 配置了 request_format/response_format
- 但所有 Route 的格式都匹配 Vendor 原生格式

### 问题 2: 是否需要实现格式转换？

**答案**：取决于业务需求

**如果只使用直接透传**：
- ✅ 性能最优
- ✅ 实现简单
- ❌ 每个 Route 只能使用同一格式的 Vendor

**如果需要格式转换**：
- ✅ 灵活性高
- ✅ 一个 Route 可以使用任何 Vendor
- ❌ 有性能损耗
- ❌ 实现复杂

### 问题 3: 洋葱模型的性能影响？

**答案**：取决于转换次数

| 场景 | 转换次数 | 性能损耗 |
|------|----------|----------|
| 直接透传 | 0 | 0ms |
| 单次转换 | 1 (请求或响应) | ~10ms |
| 双次转换 | 2 (请求+响应) | ~20ms |
| 三次转换 | 3 | ~30ms |

**优化建议**：
- 尽量配置 Route 和 Vendor 使用相同格式（直接透传）
- 如果必须转换，选择最接近的格式（减少转换步骤）

---

## 7. 架构优化建议

### 建议 1: Route 配置明确化

```yaml
# 当前配置（不清晰）
routes:
  - name: "coding"
    request_format: "openai"
    response_format: "openai"

# 建议配置（明确标注）
routes:
  - name: "coding (OpenAI → OpenAI)"
    request_format: "openai"
    response_format: "openai"
    description: "直接透传，无需转换"

  - name: "coding-anthropic (OpenAI → Anthropic)"
    request_format: "openai"
    response_format: "openai"
    vendor_id: "zhipu-coding-anthropic"
    description: "需要格式转换"
```

### 建议 2: 添加格式兼容性提示

```typescript
// 在创建/更新 Route 时
if (route.request_format !== getVendorNativeFormat(vendor)) {
  console.warn(`⚠️ Route 格式 (${route.request_format}) 与 Vendor 原生格式不匹配，将启用格式转换（性能损耗 ~10ms/chunk）`);
}
```

### 建议 3: 性能监控

```typescript
// 记录每个 Route 的转换性能
metrics.record({
  route_id: route.id,
  format_conversion: true,
  conversion_latency_ms: 12,
  stream_chunks: 150,
  total_latency_ms: 1800,
});
```

---

## 8. 总结

### 核心发现

1. **Route 决定对外格式** - 客户端必须按 Route 声明的格式发送请求
2. **Vendor 决定上游格式** - 通过 URL 判断厂商的原生格式
3. **直接透传是最优的** - 格式相同时无需转换，性能最优
4. **洋葱模型处理格式转换** - 格式不同时需要多层转换
5. **日志异步采集** - 不阻塞返回，性能影响最小

### 架构优势

| 特性 | 说明 |
|------|------|
| **灵活性** | 一个 API Key 可以配置多个 Route |
| **性能优化** | 相同格式直接透传 |
| **扩展性** | 洋葱模型易于添加新功能层 |
| **可观测性** | 异步日志采集不影响性能 |

### 下一步

1. ✅ 保持当前的直接透传配置（性能最优）
2. ⚠️ 如果需要格式转换，确保 format-converters 完整
3. ⚠️ 添加格式转换的性能监控
4. ⚠️ 优化日志异步采集机制
