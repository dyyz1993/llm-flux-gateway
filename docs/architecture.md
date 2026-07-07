# 架构概览

## 请求处理流程

```
Client (格式 A) → 输入适配器 → pi-ai Context → pi-ai Models → pi-ai 事件 → 输出适配器 → 格式 B 回客户端
```

### 组件说明

| 组件 | 位置 | 职责 |
|------|------|------|
| 输入适配器 | `src/server/adapters/input/` | 将 OpenAI/Anthropic/Gemini 请求转为 pi-ai Context |
| pi-ai Models | `@earendil-works/pi-ai` | 统一调用上游、协议转换、认证、流式处理 |
| 输出适配器 | `src/server/adapters/output/` | 将 pi-ai 统一事件转为 OpenAI/Anthropic/Gemini 响应 |
| pi-provider 注册表 | `src/server/pi-providers/` | 路由配置与 pi-ai Provider 的映射 |
| 网关控制器 | `gateway-controller.pi.ts` | 请求编排：输入适配 → 路由 → pi-ai → 输出适配 |
| Config Manager | `src/server/config-manager/` | 配置的增删改查、备份、回滚 |
| Config Assistant | `src/server/module-config-assistant/` | AI 驱动的聊天式配置管理 |

### 数据流

```
客户端请求 → 平台 Key 鉴权 → 路由匹配(model名) → 输入适配器
  → pi-ai Context → pi-ai 调用上游 → pi-ai 统一事件
  → 输出适配器 → 响应回客户端
```

### 适配器验证

输出适配器的结果必须通过官方 SDK 验证：
- OpenAI 输出 → `openai` SDK 解析
- Anthropic 输出 → `@anthropic-ai/sdk` 解析
- Gemini 输出 → `@google/genai` 解析
