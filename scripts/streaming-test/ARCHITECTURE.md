# 流式测试工具架构文档

## 概述

流式测试工具是一个用于测试 LLM Flux Gateway 流式响应功能的完整框架。它提供了模块化的架构，支持多种提供商格式、实时验证、灵活断言和详细报告。

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                           │
│  (cli.ts - 命令行接口、参数解析、场景加载)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Test Runner Layer                       │
│  (test-runner.ts - 测试协调、进度监控、结果收集)              │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌──────────────────┐ ┌────────────────┐ ┌──────────────────┐
│  Stream Parser   │ │   Validator    │ │   Reporter       │
│  (解析 SSE 流)   │ │  (验证响应)    │ │  (生成报告)      │
└──────────────────┘ └────────────────┘ └──────────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              ▼
                    ┌──────────────────┐
                    │  Test Scenarios  │
                    │  (测试场景实现)  │
                    └──────────────────┘
```

## 核心模块

### 1. StreamParser (core/stream-parser.ts)

**职责**: 解析 SSE (Server-Sent Events) 格式的流式响应

**核心方法**:
- `parseSSELine(line: string)`: 解析单个 SSE 行
- `parseStream(response: Response)`: 解析完整流式响应
- `parseDataObject(data: any)`: 解析数据对象（支持多格式）

**支持的格式**:
- OpenAI: `{ choices: [{ delta: { content } }] }`
- Anthropic: `{ type: 'content_block_delta', delta: { text } }`
- Gemini: `{ candidates: [{ content: { parts: [{ text }] }] } }`

**输出**: `StreamChunk` 对象流

### 2. ResponseValidator (core/validator.ts)

**职责**: 验证流式响应的正确性和完整性

**核心方法**:
- `validateChunk(chunk: StreamChunk)`: 验证单个块
- `validateToolCallFormat(chunk: StreamChunk)`: 验证工具调用格式
- `validateEndSignal(chunk: StreamChunk)`: 验证结束信号
- `validateStream(chunks: StreamChunk[])`: 验证完整流

**验证项**:
- 类型完整性（content 必须是字符串）
- 格式正确性（JSON 解析）
- 大小限制（防止过大的块）
- 时序性（时间戳单调递增）
- 连续性（块索引连续）

### 3. StreamingTestRunner (core/test-runner.ts)

**职责**: 协调测试执行、监控进度和收集结果

**核心方法**:
- `runScenario(scenario: BaseScenario)`: 运行单个场景
- `runScenarios(scenarios: BaseScenario[])`: 运行多个场景
- `monitorStream(response: Response, onChunk)`: 监控流式响应

**进度回调**:
- `onTestStart`: 测试开始
- `onTestComplete`: 测试完成
- `onChunk`: 接收到块
- `onError`: 发生错误

### 4. BaseScenario (scenarios/base-scenario.ts)

**职责**: 定义测试场景的抽象基类

**核心接口**:
```typescript
interface BaseScenario {
  name: string;              // 场景名称
  description: string;       // 场景描述
  config: ScenarioConfig;    // 配置
  assertions: Assertion[];   // 断言列表
  execute(): Promise<ScenarioResult>;  // 执行测试
}
```

**内置断言类型**:
- `has-content`: 检查是否有内容
- `has-tool-call`: 检查是否有工具调用
- `finish-reason`: 检查结束原因
- `min-chunks`/`max-chunks`: 块数量验证
- `content-length`: 内容长度验证
- `response-time`: 响应时间验证
- `token-usage`: Token 使用量验证

### 5. Logger (utils/logger.ts)

**职责**: 提供统一的日志输出接口

**日志级别**:
- `DEBUG`: 调试信息（仅 verbose 模式）
- `INFO`: 普通信息
- `WARN`: 警告信息
- `ERROR`: 错误信息
- `SUCCESS`: 成功信息

**特色功能**:
- 彩色输出（支持终端颜色）
- 表格输出
- 进度显示
- 时间戳记录

### 6. ConsoleReporter (reporters/console-reporter.ts)

**职责**: 生成控制台测试报告

**报告格式**:
- `CONCISE`: 简洁格式（一行一测试）
- `STANDARD`: 标准格式（详细信息）
- `VERBOSE`: 详细格式（包含所有块）

**输出内容**:
- 测试状态（通过/失败）
- 执行时间
- 块统计
- 验证错误和警告
- 断言结果
- Token 使用情况

## 数据流

```
用户请求 → Scenario → Request → Gateway → Response
                                          │
                                          ▼
                                   StreamParser
                                          │
                                          ▼
                                   StreamChunk[]
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                    Validator       onChunk 回调      累积内容
                          │               │               │
                          └───────────────┼───────────────┘
                                          ▼
                                   ScenarioResult
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                    Assertions     Validation      Reporter
                          │               │               │
                          └───────────────┼───────────────┘
                                          ▼
                                   TestRunResult
```

## 扩展指南

### 添加新的测试场景

1. 创建场景类，继承 `AbstractScenario`
2. 实现 `name`, `description`, `config`, `assertions`
3. 实现 `execute()` 方法
4. 在 `cli.ts` 中注册场景

### 添加新的验证规则

1. 继承 `ResponseValidator`
2. 重写验证方法
3. 添加自定义验证逻辑

### 添加新的报告格式

1. 继承 `ConsoleReporter`
2. 实现 `reportResult()` 方法
3. 自定义输出格式

## 最佳实践

1. **场景独立性**: 每个场景应该独立运行，不依赖其他场景
2. **断言明确**: 每个断言应该有清晰的描述
3. **错误处理**: 在 `execute()` 中妥善处理错误
4. **资源清理**: 使用 `try-finally` 确保资源释放
5. **日志记录**: 使用 Logger 而不是 console.log

## 性能考虑

1. **流式处理**: 边接收边处理，不等待完整响应
2. **内存管理**: 大响应应该分块处理，避免累积过多数据
3. **并发测试**: 多个场景可以并发执行（需要确保隔离）
4. **超时控制**: 使用 AbortController 控制请求超时

## 测试覆盖

建议的测试覆盖：

- [ ] StreamParser 单元测试
- [ ] ResponseValidator 单元测试
- [ ] 每个场景的集成测试
- [ ] 错误处理测试
- [ ] 边界条件测试
- [ ] 性能测试

## 配置管理

所有配置通过环境变量管理：

```bash
GATEWAY_URL          # 网关地址
TEST_TIMEOUT         # 超时时间
VERBOSE              # 详细输出
TEST_API_KEY         # API 密钥
SAVE_RAW_RESPONSES   # 保存原始响应
```

## 常见问题

**Q: 如何调试解析问题？**
A: 启用 verbose 模式和 parser 的 debug 选项

**Q: 如何测试工具调用？**
A: 参考示例场景 `ToolCallStreamingScenario`

**Q: 如何添加自定义断言？**
A: 在场景类中重写 `validateAssertions()` 方法

**Q: 如何处理流式错误？**
A: 检查 `StreamChunk` 的 `type === 'error'`

## 未来改进

- [ ] 添加 HTML 报告生成器
- [ ] 支持并发场景执行
- [ ] 添加性能基准测试
- [ ] 支持更多的提供商格式
- [ ] 添加交互式调试模式
- [ ] 集成到 CI/CD 流程
