# 请求跟踪日志快速参考

## 日志文件位置

```
logs/request-traces/
├── {vendor}-{short-id}-{timestamp}.json
└── ...
```

示例文件名：
- `anthropic-41fbe4-2026-01-04T15-14-52-091Z.json`
- `openai-32bbc5-2026-01-04T15-14-52-092Z.json`
- `gemini-5dc901-2026-01-04T15-14-52-093Z.json`

## 日志格式结构

### 非流式请求 (non-streaming)

```json
{
  "metadata": {
    "requestId": "...",
    "timestamp": "...",
    "vendor": "anthropic|openai|gemini",
    "url": "...",
    "requestType": "non-streaming",
    "latency": 1234,
    "statusCode": 200
  },
  "request": {
    "method": "POST",
    "url": "...",
    "headers": { "Authorization": "Bearer ...", ... },
    "body": { ... }
  },
  "response": {
    "statusCode": 200,
    "headers": { ... },
    "body": { ... }
  }
}
```

### 流式请求 (streaming)

```json
{
  "metadata": {
    "requestId": "...",
    "timestamp": "...",
    "vendor": "openai",
    "url": "...",
    "requestType": "streaming",
    "latency": 5678,
    "statusCode": 200,
    "streamingStats": {
      "totalSSE": 15,
      "totalParsed": 12,
      "totalErrors": 0,
      "totalSent": 12,
      "emptyChunks": 3
    }
  },
  "request": {
    "method": "POST",
    "url": "...",
    "headers": { ... },
    "body": { ... }
  }
  // 注意：流式请求没有完整的 response.body，因为响应是分块发送的
}
```

### 错误请求

```json
{
  "metadata": { ... },
  "request": { ... },
  "error": {
    "message": "错误信息",
    "stack": "堆栈跟踪"
  }
}
```

## 常用命令

### 查看日志

```bash
# 列出所有日志
ls -la logs/request-traces/

# 查看最新的日志
cat logs/request-traces/*.json | jq -s '.[-1]'

# 查看最新的 5 个日志
ls -t logs/request-traces/*.json | head -5 | xargs cat | jq -s '.[]'

# 查找特定 vendor 的日志
ls logs/request-traces/anthropic-*.json

# 查找特定时间范围的日志
ls logs/request-traces/*2026-01-04*.json
```

### 分析日志

```bash
# 统计各 vendor 的请求数
ls logs/request-traces/*.json | xargs -n1 basename | cut -d'-' -f1 | sort | uniq -c

# 查找失败的请求（有 error 字段）
grep -l '"error"' logs/request-traces/*.json

# 查找流式请求
grep -l '"requestType": "streaming"' logs/request-traces/*.json

# 查找延迟超过 1 秒的请求
for f in logs/request-traces/*.json; do
  latency=$(jq '.metadata.latency // 0' "$f")
  if [ "$latency" -gt 1000 ]; then
    echo "$f: ${latency}ms"
  fi
done
```

## 在单元测试中使用

### 读取日志数据

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestTraceData } from '../src/server/module-gateway/services/upstream.service';

// 读取特定的日志文件
const logPath = join(process.cwd(), 'logs', 'request-traces', 'anthropic-xxx.json');
const logContent = readFileSync(logPath, 'utf-8');
const traceData: RequestTraceData = JSON.parse(logContent);
```

### 编写测试用例

```typescript
test('should convert anthropic request to internal format', () => {
  const result = protocolTranspiler.transpile(
    traceData.request.body,
    'anthropic',
    'openai'
  );

  expect(result.success).toBe(true);
  expect(result.data).toHaveProperty('model');
  expect(result.data).toHaveProperty('messages');
});

test('should handle anthropic response correctly', () => {
  if (traceData.response?.body) {
    const result = protocolTranspiler.transpile(
      traceData.response.body,
      'anthropic',
      'openai'
    );

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('choices');
  }
});
```

### 使用真实数据进行回归测试

```typescript
test('regression: anthropic-to-openai conversion should match', async () => {
  // 读取日志文件
  const traceData = readTraceLog('anthropic-41fbe4-2026-01-04T15-14-52-091Z.json');

  // 执行转换
  const result = await protocolTranspiler.transpile(
    traceData.request.body,
    'anthropic',
    'openai'
  );

  // 验证结果
  expect(result.success).toBe(true);
  expect(result.errors).toEqual([]);
  expect(result.data).toMatchSnapshot();
});
```

## 敏感信息处理

日志中的敏感信息会自动隐藏：

- **Authorization** 头：`Bearer sk-ant-api03-...` (只显示前 20 个字符)
- **x-api-key** 头：`sk-ant-api03-...` (只显示前 20 个字符)

**注意**：请求和响应体中可能仍包含敏感信息，请谨慎使用和分享日志文件。

## 故障排查

### 日志文件未生成

1. 检查目录权限：`ls -la logs/`
2. 检查日志配置：确保 `logRequestTrace` 被正确调用
3. 查看控制台错误：检查是否有 `[Upstream] Failed to write request trace` 错误

### 日志格式不正确

1. 检查 `RequestTraceData` 类型定义
2. 使用 `jq` 验证 JSON 格式：`cat logs/request-traces/*.json | jq '.'`

### 性能问题

如果日志记录影响性能：

1. 检查磁盘 I/O
2. 考虑实施日志采样
3. 将日志写入到更快的存储介质

## 相关文件

- 实现：`src/server/module-gateway/services/upstream.service.ts`
- 控制器：`src/server/module-gateway/controllers/gateway-controller.ts`
- 类型定义：`src/server/module-gateway/services/upstream.service.ts` (RequestTraceData)
- 验证脚本：`scripts/verify-request-trace-logging.ts`
- 实现文档：`docs/REQUEST_TRACE_LOGGING_IMPLEMENTATION.md`
