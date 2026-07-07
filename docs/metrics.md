# 指标采集说明

所有指标从 `pi-ai.usage` 获取，不解析厂商原始数据。

## 指标清单

| 指标 | pi-ai 字段 | 数据库字段 | 说明 |
|------|-----------|-----------|------|
| 输入 tokens | `usage.input` | `prompt_tokens` | 请求消耗的 token 数 |
| 输出 tokens | `usage.output` | `completion_tokens` | 响应生成的 token 数 |
| 推理 tokens | `usage.reasoning` | `reasoning_tokens` | 思考/推理 token 数 |
| 缓存读取 | `usage.cacheRead` | `cache_read_tokens` | 命中缓存的 token 数 |
| 缓存写入 | `usage.cacheWrite` | `cache_write_tokens` | 写入缓存的 token 数 |
| 输入费用 | `usage.cost.input` | `input_cost` | 输入费用 |
| 输出费用 | `usage.cost.output` | `output_cost` | 输出费用 |
| 缓存读费用 | `usage.cost.cacheRead` | `cache_read_cost` | 缓存命中节省的费用 |
| 缓存写费用 | `usage.cost.cacheWrite` | `cache_write_cost` | 缓存写入费用 |
| 总费用 | `usage.cost.total` | `total_cost` | 总费用（pi-ai 计算） |
| 缓存命中率 | SQL 计算 | `cache_hit_rate` | `cacheRead / (input + cacheRead) × 100` |

## 采集时机

### 流式请求
```typescript
if (event.type === 'done') {
  const u = event.message.usage;
  promptTokens = u.input;
  completionTokens = u.output;
  cacheRead = u.cacheRead;
  cacheWrite = u.cacheWrite;
  reasoningTokens = u.reasoning ?? 0;
  // cost 从 u.cost 获取
}
```

### 非流式请求
```typescript
const result = await models.complete(model, context);
const u = result.usage;
// u.input, u.output, u.cacheRead, u.cacheWrite, u.reasoning, u.cost
```

## 缓存命中率

```
cache_hit_rate = cacheRead / (input + cacheRead) * 100
```

- 0% = 完全没有命中缓存
- 100% = 所有输入都来自缓存
- 高缓存命中率 = 低成本
