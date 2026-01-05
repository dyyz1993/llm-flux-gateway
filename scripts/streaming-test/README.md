# 流式测试工具

用于测试 LLM Flux Gateway 的流式响应功能。

## 功能特性

- **多格式支持**: 支持 OpenAI、Anthropic、Gemini 的流式格式
- **实时验证**: 边接收边验证流式数据
- **灵活断言**: 内置多种断言类型，支持自定义
- **详细报告**: 支持多种报告格式（简洁、标准、详细）
- **进度监控**: 实时监控测试进度和流式块
- **可扩展**: 易于添加新的测试场景

## 目录结构

```
scripts/streaming-test/
├── core/                    # 核心模块
│   ├── stream-parser.ts    # SSE 流式解析器
│   ├── validator.ts        # 响应验证器
│   └── test-runner.ts      # 测试运行器
├── scenarios/              # 测试场景
│   └── base-scenario.ts    # 场景基类
├── utils/                  # 工具模块
│   └── logger.ts           # 日志工具
├── reporters/              # 报告器
│   └── console-reporter.ts # 控制台报告器
├── cli.ts                  # 命令行接口
├── config.ts               # 配置管理
└── index.ts                # 模块导出
```

## 快速开始

### 命令行使用

```bash
# 运行所有测试
npm run test:streaming

# 运行特定场景
npm run test:streaming -- --scenario basic-streaming

# 详细输出
npm run test:streaming -- --verbose

# 使用 verbose 格式
npm run test:streaming -- --format verbose

# 查看帮助
npm run test:streaming -- --help
```

### 编程式使用

```typescript
import { StreamingTestRunner, Logger } from './scripts/streaming-test';
import { MyScenario } from './scripts/streaming-test/scenarios/my-scenario';

// 创建 logger 和 runner
const logger = new Logger(true); // verbose mode
const runner = new StreamingTestRunner(logger, {
  verbose: true,
  saveRawResponses: true,
});

// 运行测试
const result = await runner.runScenario(new MyScenario());

// 检查结果
if (result.passed) {
  logger.success('Test passed!');
} else {
  logger.error('Test failed!');
}
```

## 核心概念

### StreamChunk (流式数据块)

流式响应被解析为一系列 `StreamChunk` 对象：

```typescript
interface StreamChunk {
  index: number;
  type: 'content' | 'tool_call' | 'metadata' | 'error' | 'end';
  content?: string;
  toolCall?: { ... };
  finishReason?: string;
  usage?: { ... };
  timestamp: number;
  raw: string;
}
```

## 配置

通过环境变量配置：

```bash
# 网关配置
GATEWAY_URL=http://localhost:3000/v1

# 超时配置
TEST_TIMEOUT=30000
CHUNK_TIMEOUT=5000

# 重试配置
MAX_RETRIES=3
RETRY_DELAY=1000

# 输出配置
VERBOSE=true
SAVE_RAW_RESPONSES=true
TEST_OUTPUT_DIR=./test-results

# API 配置
TEST_API_KEY=your-api-key
```

## 工具调用测试场景 (Tool Call Test Scenarios)

### 概述

专门用于测试工具调用（Tool Calls）在流式响应中的行为，重点检测和解决 GLM-4 模型的特殊行为。

### 问题背景

GLM-4 与 OpenAI 标准在工具调用返回方式上存在差异：

| 特征 | OpenAI 标准 | GLM-4 行为 |
|------|-------------|-----------|
| Arguments 输出 | 增量流式（多个 chunks） | 单次完整返回（单个 chunk） |
| 前端影响 | 需要累积拼接 | 需要立即处理 |
| 状态更新 | 分步更新 | 一次性更新 |

### 测试场景

#### 1. Single Tool Call (Calculator)
测试基本工具调用功能，验证格式正确性。

**验证点**：
- Tool call 存在性
- 格式完整性（ID、函数名、参数）
- Arguments 有效性
- Finish reason 正确性

#### 2. Tool Call Incremental Streaming
检测 tool call arguments 的输出模式。

**验证点**：
- Arguments chunks 数量
- 是否增量输出
- 模式识别（single-chunk vs incremental）

**关键发现**：
- `single-chunk`: GLM-4 风格 - 一次性返回完整 arguments
- `incremental`: OpenAI 风格 - 分多个 chunks 返回

#### 3. Tool Call End Signal
验证工具调用后的结束信号。

**验证点**：
- Finish reason 为 `tool_calls`
- `[DONE]` 信号存在
- 时序正确性

#### 4. GLM-4 Single Chunk Detection ⭐
专门检测 GLM-4 兼容性问题。

**验证点**：
- **Playground 兼容性**: 检测会破坏前端的问题
- **时序分析**: 判断是否为"瞬间"完成
- **Arguments 累积**: 测试不同解析策略

**提供的建议**：
- 如何处理单 chunk tool call
- 前端实现指导
- 具体修复方案

#### 5. Multiple Tool Calls
测试多个工具调用的处理。

**验证点**：
- 多个 tool call ID
- ID 的独立性
- 正确分离

### 运行测试

```bash
# 语法检查（无需服务器）
npm run test:tools:check

# 完整测试（需要运行中的网关）
npm run test:tools
```

### 前端实现指南

#### 通用解决方案（同时支持两种模式）

```typescript
let toolCallBuffer = '';
let toolCallDetected = false;

for await (const chunk of stream) {
  if (chunk.tool_call?.function?.arguments) {
    toolCallDetected = true;
    toolCallBuffer += chunk.tool_call.function.arguments;

    // 尝试解析 - 成功则说明完整（GLM-4 风格）
    try {
      const args = JSON.parse(toolCallBuffer);
      // 收到完整的 tool call
      handleToolCall(args);
      toolCallBuffer = '';
    } catch {
      // 仍在累积中（OpenAI 风格）
    }
  }
}

// 处理最后的 chunk（如果需要）
if (toolCallBuffer) {
  const args = JSON.parse(toolCallBuffer);
  handleToolCall(args);
}
```

### 故障排除

1. **测试无法连接**
   - 确保网关正在运行：`npm run dev`
   - 检查 `config.ts` 中的网关 URL
   - 验证环境变量中的 API keys

2. **未检测到 Tool Calls**
   - 检查模型是否支持工具调用
   - 验证工具定义是否正确
   - 审查 prompt 以确保工具使用

3. **检测到兼容性问题**
   - 查看测试输出的具体问题
   - 检查"关键发现"部分
   - 按照提供的建议修复

## 贡献

欢迎提交 Issue 和 Pull Request！
