# 捕获的真实 API 数据

这些文件是用 opencode-go API 从真实模型捕获的请求/响应数据，
用于验证适配器输出格式的准确性。

## 数据来源

- **API**: https://opencode.ai/zen/go/v1 (OpenAI 兼容协议)
- **模型**: mimo-v2.5 (最便宜), deepseek-v4-flash (推理)
- **Key**: 项目中配置

## 文件说明

| 文件 | 协议 | 内容 |
|------|------|------|
| `mimo-v2.5-non-streaming.json` | OpenAI | 非流式文本响应 |
| `mimo-v2.5-streaming.json` | OpenAI | 流式 SSE 响应 (20 chunks) |
| `mimo-v2.5-tool-call.json` | OpenAI | 工具调用响应 |
| `deepseek-v4-flash-non-streaming.json` | OpenAI | 非流式+推理内容 |
| `deepseek-v4-flash-streaming.json` | OpenAI | 流式 SSE 响应 (53 chunks) |
| `deepseek-v4-flash-tool-call.json` | OpenAI | 工具调用响应 |

## 协议差异

所有模型都通过 **OpenAI Chat Completions 协议**访问，但 vendor 特有字段不同：

| 字段 | mimo-v2.5 | deepseek-v4-flash |
|------|-----------|-------------------|
| `cost` | ✅ 有 | ✅ 有 |
| `provider` | ✅ 有 | ❌ |
| `system_fingerprint` | ✅ 有 | ❌ |
| `service_tier` | ✅ 有 | ❌ |
| `reasoning_content` | ❌ (用 `reasoning`) | ✅ (用 `reasoning_content`) |
| `refusal` | ✅ 有 | ❌ |

## 测试覆盖

- ✅ OpenAI 协议：非流式、流式 SSE、工具调用
- ✅ 非标准字段容错：cost、reasoning_content、provider 等
- ✅ 不同厂商的 usage 格式差异
