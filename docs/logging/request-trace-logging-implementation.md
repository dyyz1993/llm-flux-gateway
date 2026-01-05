# 请求跟踪日志系统实现总结

## 概述

实现了完整的对外请求日志记录系统，记录所有发送给上游 API 的**完整**请求体和响应体，用于后续编写精准的单元测试。

## 实现内容

### 1. 类型定义 (`RequestTraceData`)

在 `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-gateway/services/upstream.service.ts` 中定义了统一的日志数据结构：

```typescript
export interface RequestTraceData {
  metadata: {
    requestId: string;
    timestamp: string;
    vendor: string; // 'anthropic', 'openai', 'gemini', etc.
    url: string;
    requestType: 'streaming' | 'non-streaming';
    latency?: number;
    statusCode?: number;
    streamingStats?: {
      totalSSE: number;
      totalParsed: number;
      totalErrors: number;
      totalSent: number;
      emptyChunks: number;
    };
  };
  request: {
    method: string;
    url: string;
    headers: Record<string, string>; // 敏感信息已隐藏
    body: Record<string, any>; // 完整请求体
  };
  response?: {
    statusCode: number;
    headers: Record<string, string>;
    body: Record<string, any>; // 完整响应体
  };
  error?: {
    message: string;
    stack?: string;
  };
}
```

### 2. 统一日志函数 (`logRequestTrace`)

新增统一的日志记录函数，支持流式和非流式请求：

```typescript
export async function logRequestTrace(data: RequestTraceData): Promise<void>
```

**特性**：
- 统一的日志格式
- 自动创建日志目录 (`logs/request-traces/`)
- 文件命名：`{vendor}-{short-id}-{timestamp}.json`
- 异常处理：日志记录失败不影响主请求流程

### 3. 敏感信息过滤 (`sanitizeHeaders`)

新增敏感信息过滤函数，保护 API Key 等敏感信息：

```typescript
function sanitizeHeaders(headers: Record<string, string>): Record<string, string>
```

**处理规则**：
- `Authorization` 头：截取前 20 个字符 + `...`
- `x-api-key` 头：截取前 20 个字符 + `...`
- 其他头：原样保留

### 4. 非流式请求日志

在 `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-gateway/controllers/gateway-controller.ts` 的非流式分支中：

- 记录请求开始时间 (`startTimeRequest`)
- 计算请求延迟 (`latency`)
- 调用 `logRequestTrace()` 记录完整的请求/响应数据

**示例日志输出**：
```json
{
  "metadata": {
    "requestId": "d66d3258-70d0-4929-a776-08679741fbe4",
    "timestamp": "2026-01-04T15:14:52.090Z",
    "vendor": "anthropic",
    "url": "https://api.anthropic.com/v1/messages",
    "requestType": "non-streaming",
    "latency": 1234,
    "statusCode": 200
  },
  "request": {
    "method": "POST",
    "url": "https://api.anthropic.com/v1/messages",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer sk-ant-api03-..."
    },
    "body": {
      "model": "claude-3-5-sonnet-20241022",
      "max_tokens": 1024,
      "messages": [...]
    }
  },
  "response": {
    "statusCode": 200,
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "id": "msg_123456789",
      "type": "message",
      "role": "assistant",
      "content": [...],
      "model": "claude-3-5-sonnet-20241022",
      "stop_reason": "end_turn",
      "usage": {...}
    }
  }
}
```

### 5. 流式请求日志

在 `parseStreamWith` 方法中：

- 统计流式处理的各个阶段（接收、解析、发送、错误、空块）
- 成功和错误情况都会记录日志
- 保留旧的 `logCompleteSSEStream` 用于向后兼容

**示例日志输出**：
```json
{
  "metadata": {
    "requestId": "0e66697a-2ba9-400b-a31a-b52ec632bbc5",
    "timestamp": "2026-01-04T15:14:52.092Z",
    "vendor": "openai",
    "url": "https://api.openai.com/v1/chat/completions",
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
    "url": "https://api.openai.com/v1/chat/completions",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer sk-proj-..."
    },
    "body": {
      "model": "gpt-4",
      "messages": [...],
      "stream": true
    }
  }
}
```

### 6. 向后兼容

- 保留 `logNonStreamingRequest` 函数（标记为 `@deprecated`）
- 保留 `logCompleteSSEStream` 函数（标记为 `@deprecated`）
- 这两个函数内部调用新的 `logRequestTrace`，确保现有代码不受影响

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-gateway/services/upstream.service.ts` | - 新增 `RequestTraceData` 类型定义<br>- 新增 `logRequestTrace` 函数<br>- 新增 `sanitizeHeaders` 函数<br>- 重构 `logNonStreamingRequest` 使用新函数<br>- 在 `parseStreamWith` 中添加 trace 日志 |
| `/Users/xuyingzhou/Downloads/llm-flux-gateway/src/server/module-gateway/controllers/gateway-controller.ts` | - 导入 `logRequestTrace` 和 `RequestTraceData`<br>- 在非流式请求分支中调用 `logRequestTrace`<br>- 添加请求延迟计算 |
| `/Users/xuyingzhou/Downloads/llm-flux-gateway/scripts/verify-request-trace-logging.ts` | - 新增验证脚本，测试日志功能 |

## 验证结果

### 编译验证
```bash
npm run build
# ✓ 编译通过
```

### 功能验证
```bash
npx tsx scripts/verify-request-trace-logging.ts
# ✓ 所有测试通过
```

生成的日志文件：
```
logs/request-traces/
├── anthropic-41fbe4-2026-01-04T15-14-52-091Z.json  (非流式请求)
├── openai-32bbc5-2026-01-04T15-14-52-092Z.json     (流式请求)
└── gemini-5dc901-2026-01-04T15-14-52-093Z.json     (错误请求)
```

## 完整性检查清单

- ✅ **请求完整性**
  - ✅ 完整的 HTTP method (POST)
  - ✅ 完整的 URL
  - ✅ 完整的 headers（隐藏敏感信息）
  - ✅ 完整的 body（所有字段，无截断）

- ✅ **响应完整性**
  - ✅ HTTP status code
  - ✅ 完整的 response headers
  - ✅ 完整的 body（所有字段，无截断）
  - ✅ 响应时间（latency）

- ✅ **统一性**
  - ✅ 流式和非流式请求使用统一的日志格式
  - ✅ 统一的 `RequestTraceData` 类型
  - ✅ 统一的 `logRequestTrace` 函数

- ✅ **安全性**
  - ✅ API Key 等敏感信息被隐藏
  - ✅ 日志记录失败不影响主请求流程

- ✅ **向后兼容**
  - ✅ 保留旧的日志函数
  - ✅ 旧代码无需修改即可继续工作

## 使用示例

### 查看日志文件
```bash
# 列出所有日志文件
ls -la logs/request-traces/

# 查看最新的日志
cat logs/request-traces/*.json | jq -s '.[-1]'

# 查找特定 vendor 的日志
ls logs/request-traces/anthropic-*.json
```

### 在单元测试中使用
```typescript
import { RequestTraceData } from '../src/server/module-gateway/services/upstream.service';
import { readFileSync } from 'node:fs';

// 读取日志文件
const logContent = readFileSync('logs/request-traces/anthropic-xxx.json', 'utf-8');
const traceData: RequestTraceData = JSON.parse(logContent);

// 使用日志数据编写测试
test('should handle anthropic response correctly', () => {
  const result = protocolTranspiler.transpile(
    traceData.request.body,
    'anthropic',
    'openai'
  );

  expect(result.success).toBe(true);
  expect(result.data).toEqual(traceData.response.body);
});
```

## 后续优化建议

1. **日志轮转**：添加日志文件大小限制和自动清理机制
2. **日志压缩**：对旧日志进行压缩以节省空间
3. **日志索引**：创建索引文件便于快速查找特定请求
4. **日志分析工具**：开发可视化工具分析日志数据
5. **采样机制**：在高负载时支持采样记录，避免日志过多

## 总结

成功实现了完整的请求跟踪日志系统，满足了所有需求：

1. ✅ **完整性**：记录所有请求/响应字段，无截断
2. ✅ **统一性**：流式和非流式使用统一格式
3. ✅ **安全性**：隐藏 API Key 等敏感信息
4. ✅ **可靠性**：日志失败不影响主流程
5. ✅ **兼容性**：保留旧函数，向后兼容

该日志系统为后续编写精准的单元测试提供了完整的数据基础。
