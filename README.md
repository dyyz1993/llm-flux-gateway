# LLM Flux Gateway

企业级多协议 LLM API 网关，通过统一的 Internal Format 抽象层，支持多种 LLM 厂商 API（OpenAI、Anthropic、Gemini、GLM 等）。

## 特性

- **协议无关性**: 统一的 API 格式，自动在不同厂商间转换
- **多厂商支持**: OpenAI、Anthropic、Gemini、GLM、DeepSeek 等
- **类型安全**: 完整的 TypeScript 类型系统
- **统一管理**: Web UI 管理界面，支持路由配置、密钥管理、日志查询
- **实时监控**: Token 使用统计、成本分析、请求日志

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

### 3. 访问管理界面

打开浏览器访问 http://localhost:3000

**默认登录凭据**:
- 用户名: `admin`
- 密码: `changeme`

## 使用指南

详细的使用说明和截图文档请查看: [docs/screenshots/README.md](./docs/screenshots/README.md)

### 首次配置流程（约 2 分钟）

1. **同步厂商** - Vendors 页面 → "Sync from YAML"
2. **创建资产** - Assets 页面 → "Add Asset" → 输入 API Key
3. **创建路由** - Routes 页面 → 输入名称 → 选择资产
4. **生成密钥** - Keys 页面 → 输入名称 → 关联路由
5. **测试验证** - Playground 页面 → 发送消息测试

## API 调用示例

```bash
curl https://your-gateway.com/v1/chat/completions \
  -H "Authorization: Bearer sk-flux-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## 文档

- [快速开始指南](./docs/guides/quick-start.md)
- [使用场景说明](./docs/guides/usage-scenarios.md)
- [截图文档](./docs/screenshots/README.md)
- [项目需求文档](./docs/development/project-requirements.md)
- [协议转换架构](./docs/protocol/protocol-transformation-architecture.md)

## 开发

```bash
# 开发模式
npm run dev

# 类型检查
npm run typecheck

# 测试
npm test

# 截图更新
npm run screenshot
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite + Zustand |
| 后端 | Hono + TypeScript + Node.js |
| 数据库 | SQLite + Drizzle ORM |
| 测试 | Vitest + Testing Library |

## License

MIT
