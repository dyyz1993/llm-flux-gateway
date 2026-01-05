# Protocol Converter Test Data

这个目录包含了从真实请求日志中提取的测试数据，用于验证协议转换器的正确性。

## 文件说明

### openai-to-anthropic-4af0d2.json
**来源**: Request ID `4af0d2` (成功案例)  
**日志路径**: `/logs/protocol-transformation/2c02d7eb-6ffa-450e-b325-fa59e54af0d2-4af0d2-1767499036696.log`  
**特点**:
- 简单的用户查询请求
- 包含 8 个工具定义
- 成功完成 OpenAI → Anthropic 格式转换
- 包含字段规范化示例 (`num_results` → `numResults`)

### openai-to-anthropic-8defcc.json
**来源**: Request ID `8defcc` (包含 tool 角色消息)  
**日志路径**: `/logs/protocol-transformation/050bb9c1-10d9-4244-9f4b-2ff45d8defcc-8defcc-1767499037023.log`  
**特点**:
- 包含 tool 角色消息（工具调用返回）
- 包含 8 个工具定义
- 验证多轮对话场景下的转换
- 消息数组包含: user → assistant → tool

## 数据格式

所有测试数据文件遵循统一格式:

```json
{
  "description": "测试场景描述",
  "input": {
    "format": "源格式 (openai/anthropic/gemini)",
    "data": { /* 完整的请求数据 */ }
  },
  "expected": {
    "format": "目标格式",
    "data": { /* 转换后的预期数据 */ }
  }
}
```

## 包含的工具定义

这两个测试用例都包含以下 8 个工具:

1. **web_search** - 搜索互联网 (包含 default 值)
2. **calculator** - 数学计算
3. **get_weather** - 天气查询 (包含 enum 字段)
4. **code_interpreter** - Python 代码执行
5. **get_current_time** - 获取时间 (包含 default 值，空 required)
6. **database_query** - 数据库查询
7. **send_email** - 发送邮件 (多 required 字段)
8. **file_operations** - 文件操作 (包含 enum)

## 转换验证点

### OpenAI → Anthropic 转换

✓ **工具结构转换**
- `type: "function"` + `function` → 直接的 `name` + `input_schema`
- `parameters` → `input_schema`

✓ **字段规范化**
- `num_results` → `numResults`
- snake_case → camelCase

✓ **消息处理**
- 保留所有消息角色 (user, assistant, tool)
- 保持消息内容不变

✓ **添加字段**
- 自动添加 `max_tokens: 4096`

## 使用方法

```typescript
import testData_4af0d2 from './test-data/openai-to-anthropic-4af0d2.json';
import { OpenAIToAnthropicConverter } from '../openai-to-anthropic.converter';

const converter = new OpenAIToAnthropicConverter();
const input = testData_4af0d2.input.data;
const result = converter.convertRequest(input, 'anthropic');

// 验证结果
expect(result.data).toEqual(testData_4af0d2.expected.data);
```

## 添加新的测试数据

1. 从日志文件中提取请求数据
2. 清理并格式化为 JSON
3. 按照统一格式组织数据
4. 添加描述信息
5. 运行验证脚本确保 JSON 格式正确

```bash
# 验证 JSON 格式
python3 -m json.tool your-test-data.json
```

## 相关文件

- 测试用例: `../openai-to-anthropic.real-data.test.ts`
- 转换器: `../openai-to-anthropic.converter.ts`
- 日志目录: `/logs/protocol-transformation/`

## GLM 特有字段测试

### glm-6761d6.json (sanitized/glm-specific/)
**来源**: Request ID `6761d6` (GLM API)
**日志路径**: `/logs/request-traces/anthropic-6761d6-2026-01-04T15-17-19-679Z.json`
**特点**:
- GLM (BigModel) API 特有字段
- `usage.cache_read_input_tokens` - 缓存读取令牌数
- `usage.server_tool_use.web_search_requests` - 服务器工具使用（网络搜索请求）
- `usage.service_tier` - 服务层级别
- `stop_sequence` - 停止序列（可为 null）
- `temperature: 1` - 温度参数
- 系统 prompt 为数组格式

**GLM 特有字段说明**:
```json
{
  "usage": {
    "input_tokens": 112,
    "output_tokens": 17,
    "cache_read_input_tokens": 0,        // GLM 特有
    "server_tool_use": {                  // GLM 特有
      "web_search_requests": 0
    },
    "service_tier": "standard"            // GLM 特有
  },
  "stop_sequence": null                   // 可选字段
}
```

## 目录结构

```
test-data/
├── README.md                           # 本文件
├── *.json                              # 旧格式测试数据
└── sanitized/                          # 新格式：按场景分类
    ├── anthropic/
    │   ├── minimal/                    # 最小化测试
    │   ├── real-world/                 # 真实场景
    │   └── glm-specific/               # GLM 特有字段
    │       └── glm-6761d6.json
    ├── openai/
    └── gemini/
```

## 更新日志

- 2026-01-04: 添加 GLM 特有字段测试数据 (glm-6761d6.json)
- 2026-01-04: 初始创建，包含 4af0d2 和 8defcc 两个测试用例
