# 测试数据快速参考

## 📦 已创建的测试数据

### Request 4af0d2 - 成功转换案例

**文件**: `src/server/module-protocol-transpiler/converters/__tests__/test-data/openai-to-anthropic-4af0d2.json`

**特点**:
- 简单的用户查询请求
- 1 条消息 (user)
- 8 个工具定义
- 包含字段规范化: `num_results` → `numResults`
- 转换成功，上游返回 200

**来源日志**: `/logs/protocol-transformation/2c02d7eb-6ffa-450e-b325-fa59e54af0d2-4af0d2-1767499036696.log`

---

### Request 8defcc - 包含 tool 角色消息

**文件**: `src/server/module-protocol-transpiler/converters/__tests__/test-data/openai-to-anthropic-8defcc.json`

**特点**:
- 多轮对话场景
- 3 条消息 (user → assistant → tool)
- 8 个工具定义
- 验证 tool 角色消息的处理
- 转换成功（虽然上游返回 422，但转换逻辑正确）

**来源日志**: `/logs/protocol-transformation/050bb9c1-10d9-4244-9f4b-2ff45d8defcc-8defcc-1767499037023.log`

---

## 🛠️ 包含的 8 个工具

1. **web_search** - 搜索互联网 (包含 default 值)
2. **calculator** - 数学计算
3. **get_weather** - 天气查询 (包含 enum 字段)
4. **code_interpreter** - Python 代码执行
5. **get_current_time** - 获取时间 (包含 default 值，空 required)
6. **database_query** - 数据库查询
7. **send_email** - 发送邮件 (多 required 字段)
8. **file_operations** - 文件操作 (包含 enum)

---

## 🔄 转换验证点

### OpenAI → Anthropic

✓ **工具结构转换**
- `type: "function"` + `function` → `name` + `input_schema`
- `parameters` → `input_schema`

✓ **字段规范化**
- `num_results` → `numResults`
- snake_case → camelCase

✓ **消息处理**
- 保留所有消息角色
- 保持消息内容不变

✓ **添加字段**
- 自动添加 `max_tokens: 4096`

---

## 📝 使用示例

```typescript
import testData_4af0d2 from './test-data/openai-to-anthropic-4af0d2.json';
import { OpenAIToAnthropicConverter } from '../openai-to-anthropic.converter';

const converter = new OpenAIToAnthropicConverter();
const input = testData_4af0d2.input.data;
const result = converter.convertRequest(input, 'anthropic');

// 验证结果
expect(result.data).toEqual(testData_4af0d2.expected.data);
```

---

## 🧪 运行测试

```bash
# 运行所有真实数据测试
npm test -- openai-to-anthropic.real-data

# 运行特定测试用例
npm test -- -t "Request 4af0d2"
npm test -- -t "Request 8defcc"
npm test -- -t "Field Normalization"
```

---

## 📚 相关文件

- 测试用例: `src/server/module-protocol-transpiler/converters/__tests__/openai-to-anthropic.real-data.test.ts`
- 测试数据: `src/server/module-protocol-transpiler/converters/__tests__/test-data/`
- 转换器: `src/server/module-protocol-transpiler/converters/openai-to-anthropic.converter.ts`
- 日志目录: `/logs/protocol-transformation/`
