# LLM Flux Gateway - 端到端截图文档计划

## 概述

本文档描述了 LLM Flux Gateway 项目的端到端截图任务，包括截图场景、存储位置、文档结构以及执行步骤。

---

## 一、截图存储目录结构

```
docs/
└── screenshots/
    ├── README.md                    # 截图文档索引
    ├── 01-login/                    # 登录场景
    │   ├── 01-login-page.png        # 登录页面
    │   └── 02-login-error.png       # 登录错误状态
    ├── 02-dashboard/                # 仪表盘场景
    │   ├── 01-overview.png          # 概览卡片
    │   ├── 02-token-usage.png       # Token 使用趋势
    │   ├── 03-model-distribution.png # 模型分布
    │   └── 04-recent-requests.png   # 最近请求
    ├── 03-vendors/                  # 厂商管理场景
    │   ├── 01-vendor-list.png       # 厂商列表
    │   ├── 02-sync-yaml.png         # 同步 YAML
    │   └── 03-edit-yaml.png         # 编辑 YAML
    ├── 04-assets/                   # 资产管理场景
    │   ├── 01-asset-list.png        # 资产列表
    │   ├── 02-create-asset-step1.png # 创建资产步骤1
    │   ├── 03-create-asset-step2.png # 创建资产步骤2
    │   ├── 04-create-asset-step3.png # 创建资产步骤3
    │   ├── 05-quick-test.png        # 快速测试
    │   └── 06-validation-result.png # 验证结果
    ├── 05-routes/                   # 路由管理场景
    │   ├── 01-route-list.png        # 路由列表
    │   ├── 02-create-route.png      # 创建路由
    │   ├── 03-edit-route.png        # 编辑路由
    │   └── 04-route-success.png     # 创建成功
    ├── 06-keys/                     # 密钥管理场景
    │   ├── 01-key-list.png          # 密钥列表
    │   ├── 02-generate-key.png      # 生成密钥
    │   ├── 03-key-success.png       # 生成成功
    │   ├── 04-copy-key.png          # 复制密钥
    │   └── 05-edit-routes.png       # 编辑关联路由
    ├── 07-playground/               # Playground 场景
    │   ├── 01-chat-interface.png    # 聊天界面
    │   ├── 02-model-selector.png    # 模型选择器
    │   ├── 03-streaming-response.png # 流式响应
    │   ├── 04-tool-calls.png        # 工具调用
    │   ├── 05-debug-panel.png       # 调试面板
    │   └── 06-multi-turn.png        # 多轮对话
    ├── 08-logs/                     # 日志查询场景
    │   ├── 01-log-list.png          # 日志列表
    │   ├── 02-log-detail.png        # 日志详情
    │   ├── 03-filter-logs.png       # 过滤日志
    │   ├── 04-realtime-logs.png     # 实时日志
    │   └── 05-retry-request.png     # 重试请求
    ├── 09-system/                   # 系统设置场景
    │   └── 01-system-settings.png   # 系统设置页面
    └── 10-workflows/                # 完整工作流场景
        ├── 01-first-time-setup/     # 首次配置流程
        │   ├── step1-sync-vendors.png
        │   ├── step2-create-asset.png
        │   ├── step3-create-route.png
        │   ├── step4-generate-key.png
        │   └── step5-test.png
        └── 02-daily-usage/          # 日常使用流程
            ├── view-analytics.png
            └── test-model.png
```

---

## 二、截图场景详细说明

### 场景 1: 登录页面 (Login)

| 截图文件 | 页面路由 | 操作说明 | 截图内容 |
|---------|---------|---------|---------|
| `01-login-page.png` | `#/login` | 打开登录页面 | 完整登录表单，包含 Logo、用户名、密码输入框、记住我选项、登录按钮 |
| `02-login-error.png` | `#/login` | 输入错误凭据后提交 | 显示错误提示的登录页面 |

**用户操作步骤**:
1. 访问 `http://localhost:3000/#/login`
2. 等待页面加载完成
3. 截取完整登录表单
4. 输入错误的用户名/密码，点击登录
5. 截取显示错误状态的页面

---

### 场景 2: 数据分析仪表盘 (Analytics Dashboard)

| 截图文件 | 页面路由 | 操作说明 | 截图内容 |
|---------|---------|---------|---------|
| `01-overview.png` | `#/dashboard` | 登录后默认页面 | 概览卡片：Total Requests, Total Tokens, Avg Latency, Avg TTFB |
| `02-token-usage.png` | `#/dashboard` | 向下滚动 | Token 使用趋势图（7天）、Prompt/Completion Token 分布 |
| `03-model-distribution.png` | `#/dashboard` | 继续滚动 | 模型分布饼图、TTFB 分布柱状图 |
| `04-recent-requests.png` | `#/dashboard` | 继续滚动 | 最近请求表格、API Key 统计表 |

**用户操作步骤**:
1. 登录成功后自动跳转到 Dashboard
2. 截取顶部概览卡片区域
3. 向下滚动，截取 Token 使用趋势图
4. 继续滚动，截取模型分布和 TTFB 分布
5. 继续滚动，截取最近请求表格

---

### 场景 3: 厂商管理 (Vendors)

| 截图文件 | 页面路由 | 操作说明 | 截图内容 |
|---------|---------|---------|---------|
| `01-vendor-list.png` | `#/vendors` | 点击侧边栏 Vendors | 厂商列表，显示各厂商的 Base URL、Endpoint、支持模型 |
| `02-sync-yaml.png` | `#/vendors` | 点击 "Sync from YAML" | 同步成功提示，显示 created/updated/models 数量 |
| `03-edit-yaml.png` | `#/vendors` | 点击 "Edit YAML" | YAML 编辑器弹窗，带语法高亮 |

**用户操作步骤**:
1. 点击侧边栏 "Vendors"
2. 截取厂商列表页面
3. 点击 "Sync from YAML" 按钮
4. 截取同步成功提示
5. 点击 "Edit YAML" 按钮
6. 截取 YAML 编辑器弹窗

---

### 场景 4: 资产管理 (Assets)

| 截图文件 | 页面路由 | 操作说明 | 截图内容 |
|---------|---------|---------|---------|
| `01-asset-list.png` | `#/assets` | 点击侧边栏 Assets | 资产列表，显示各资产的 API Key（脱敏）、可用模型、状态 |
| `02-create-asset-step1.png` | `#/assets` | 点击 "Add Asset" | 创建向导步骤1：选择厂商 |
| `03-create-asset-step2.png` | `#/assets` | 选择厂商后点击 Next | 创建向导步骤2：输入资产名称和 API Key |
| `04-create-asset-step3.png` | `#/assets` | 填写信息后点击 Next | 创建向导步骤3：选择可用模型 |
| `05-quick-test.png` | `#/assets` | 点击资产的 "Quick Test" | 快速测试按钮和加载状态 |
| `06-validation-result.png` | `#/assets` | 测试完成后 | 模型验证结果弹窗，显示成功/失败状态 |

**用户操作步骤**:
1. 点击侧边栏 "Assets"
2. 截取资产列表页面
3. 点击 "Add Asset" 按钮
4. 截取步骤1厂商选择界面
5. 选择一个厂商，点击 Next
6. 截取步骤2配置界面
7. 填写名称和 API Key，点击 Next
8. 截取步骤3模型选择界面
9. 返回资产列表，点击某个资产的 "Quick Test"
10. 截取验证结果弹窗

---

### 场景 5: 路由管理 (Routes)

| 截图文件 | 页面路由 | 操作说明 | 截图内容 |
|---------|---------|---------|---------|
| `01-route-list.png` | `#/routes` | 点击侧边栏 Route Flux | 路由列表，显示各路由的资产、状态、Override 规则 |
| `02-create-route.png` | `#/routes` | 填写创建表单 | 创建路由表单：名称输入、资产选择下拉框 |
| `03-edit-route.png` | `#/routes` | 点击路由的编辑按钮 | 编辑模式：可修改名称、资产、Override 规则 |
| `04-route-success.png` | `#/routes` | 创建路由成功 | 成功提示卡片，带 "Generate API Key" 按钮 |

**用户操作步骤**:
1. 点击侧边栏 "Route Flux"
2. 截取路由列表页面
3. 在创建表单中输入名称、选择资产
4. 截取创建表单
5. 点击 "Add Route" 创建
6. 截取成功提示卡片
7. 点击某个路由的编辑按钮
8. 截取编辑模式界面

---

### 场景 6: 密钥管理 (Keys)

| 截图文件 | 页面路由 | 操作说明 | 截图内容 |
|---------|---------|---------|---------|
| `01-key-list.png` | `#/keys` | 点击侧边栏 Access Keys | 密钥列表表格：Client Name, Key Token, Routes, Created, Status |
| `02-generate-key.png` | `#/keys` | 填写生成表单 | 生成密钥表单：名称输入、路由多选 |
| `03-key-success.png` | `#/keys` | 生成密钥成功 | 成功提示卡片，显示完整密钥和 curl 示例 |
| `04-copy-key.png` | `#/keys` | 点击复制按钮 | 复制成功状态（Copied! 提示） |
| `05-edit-routes.png` | `#/keys` | 点击编辑路由按钮 | 编辑路由弹窗，可修改关联的路由 |

**用户操作步骤**:
1. 点击侧边栏 "Access Keys"
2. 截取密钥列表页面
3. 在生成表单中输入名称、选择路由
4. 截取生成表单
5. 点击 "Generate API Key"
6. 截取成功提示卡片（包含 curl 示例）
7. 点击复制按钮
8. 截取复制成功状态
9. 点击某个密钥的编辑按钮
10. 截取编辑路由弹窗

---

### 场景 7: Playground 聊天测试

| 截图文件 | 页面路由 | 操作说明 | 截图内容 |
|---------|---------|---------|---------|
| `01-chat-interface.png` | `#/playground` | 点击侧边栏 Playground | 完整聊天界面：侧边栏会话列表、主聊天区域、输入框 |
| `02-model-selector.png` | `#/playground` | 点击配置展开 | 配置面板：Format 选择、API Key 选择、Model 选择 |
| `03-streaming-response.png` | `#/playground` | 发送消息后 | 流式响应过程，消息逐字显示 |
| `04-tool-calls.png` | `#/playground` | 启用工具调用后发送 | 工具调用显示：工具名称、参数、执行结果 |
| `05-debug-panel.png` | `#/playground` | 点击 Debug 按钮 | 调试面板：显示请求/响应的原始数据 |
| `06-multi-turn.png` | `#/playground` | 多轮对话后 | 多轮对话历史，包含用户和助手消息 |

**用户操作步骤**:
1. 点击侧边栏 "Playground"
2. 截取完整聊天界面
3. 点击配置展开按钮（Settings 图标）
4. 截取配置面板
5. 选择 API Key 和 Model，发送消息
6. 截取流式响应过程
7. 启用 "工具调用" 选项，发送需要工具的消息
8. 截取工具调用显示
9. 点击 Debug 按钮
10. 截取调试面板
11. 进行多轮对话
12. 截取多轮对话历史

---

### 场景 8: 日志查询 (Logs)

| 截图文件 | 页面路由 | 操作说明 | 截图内容 |
|---------|---------|---------|---------|
| `01-log-list.png` | `#/logs` | 点击侧边栏 Logs | 日志列表：时间、模型、状态、Token 数、延迟 |
| `02-log-detail.png` | `#/logs` | 点击某条日志 | 日志详情面板：请求/响应内容、工具调用 |
| `03-filter-logs.png` | `#/logs` | 展开高级过滤 | 过滤面板：状态码、模型、时间范围、是否有工具 |
| `04-realtime-logs.png` | `#/logs` | 发送新请求后 | 新日志实时出现，带 "New" 标识 |
| `05-retry-request.png` | `#/logs` | 点击重试按钮 | 重试确认和执行过程 |

**用户操作步骤**:
1. 点击侧边栏 "Logs"
2. 截取日志列表页面
3. 点击某条日志
4. 截取日志详情面板
5. 点击高级过滤按钮
6. 截取过滤面板
7. 在 Playground 发送一个新请求
8. 返回 Logs 页面，截取实时更新的新日志
9. 点击某条日志的重试按钮
10. 截取重试过程

---

### 场景 9: 系统设置 (System)

| 截图文件 | 页面路由 | 操作说明 | 截图内容 |
|---------|---------|---------|---------|
| `01-system-settings.png` | `#/system` | 点击侧边栏 System | 系统设置页面内容 |

**用户操作步骤**:
1. 点击侧边栏 "System"
2. 截取系统设置页面

---

### 场景 10: 完整工作流

#### 10.1 首次配置流程

| 截图文件 | 操作说明 | 截图内容 |
|---------|---------|---------|
| `step1-sync-vendors.png` | Vendors 页面点击 Sync | 同步厂商配置 |
| `step2-create-asset.png` | Assets 页面创建资产 | 创建 API Key 资产 |
| `step3-create-route.png` | Routes 页面创建路由 | 创建路由关联资产 |
| `step4-generate-key.png` | Keys 页面生成密钥 | 生成访问密钥 |
| `step5-test.png` | Playground 测试 | 使用密钥测试请求 |

**用户操作步骤**:
1. 进入 Vendors 页面，点击 "Sync from YAML"
2. 截取同步成功状态
3. 进入 Assets 页面，点击 "Add Asset"
4. 完成创建向导，截取成功状态
5. 点击 "Create Route" 进入 Routes 页面
6. 创建路由，截取成功状态
7. 点击 "Generate API Key" 进入 Keys 页面
8. 生成密钥，截取成功状态和 curl 示例
9. 复制密钥，进入 Playground 测试
10. 截取测试成功响应

#### 10.2 日常使用流程

| 截图文件 | 操作说明 | 截图内容 |
|---------|---------|---------|
| `view-analytics.png` | Dashboard 查看统计 | 查看使用量和成本 |
| `test-model.png` | Playground 测试新模型 | 测试不同模型效果 |

---

## 三、截图工具和技术方案

### 方案 A: 使用 Playwright 自动化截图

```typescript
// scripts/screenshot.ts
import { chromium, Page, Browser } from 'playwright';
import path from 'path';
import fs from 'fs';

const SCREENSHOT_DIR = path.join(__dirname, '../docs/screenshots');

async function takeScreenshot(page: Page, category: string, filename: string) {
  const dir = path.join(SCREENSHOT_DIR, category);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await page.screenshot({
    path: path.join(dir, filename),
    fullPage: false,
  });
  console.log(`Screenshot saved: ${category}/${filename}`);
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  // 登录
  await page.goto('http://localhost:3000/#/login');
  await page.waitForSelector('input[type="text"]');
  await takeScreenshot(page, '01-login', '01-login-page.png');

  // 输入凭据登录
  await page.fill('input[type="text']", 'admin');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForURL(/#\/dashboard/);

  // Dashboard 截图
  await takeScreenshot(page, '02-dashboard', '01-overview.png');

  // ... 更多截图

  await browser.close();
}

main();
```

### 方案 B: 手动截图 + 脚本整理

1. 使用浏览器开发者工具截图功能
2. 使用 macOS 截图快捷键 `Cmd + Shift + 4`
3. 使用脚本自动整理到对应目录

---

## 四、文档输出格式

### README.md 模板

```markdown
# LLM Flux Gateway - 使用指南截图文档

## 快速导航

| 场景 | 说明 | 截图数量 |
|------|------|---------|
| [登录](./01-login/) | 用户认证入口 | 2 |
| [仪表盘](./02-dashboard/) | 数据分析概览 | 4 |
| [厂商管理](./03-vendors/) | LLM 供应商配置 | 3 |
| [资产管理](./04-assets/) | API Key 资产管理 | 6 |
| [路由管理](./05-routes/) | 请求路由配置 | 4 |
| [密钥管理](./06-keys/) | 访问密钥生成 | 5 |
| [Playground](./07-playground/) | 聊天测试界面 | 6 |
| [日志查询](./08-logs/) | 请求日志查看 | 5 |
| [系统设置](./09-system/) | 系统配置 | 1 |
| [完整工作流](./10-workflows/) | 端到端流程 | 7 |

## 首次使用指南

### 步骤 1: 同步厂商配置
![同步厂商](./10-workflows/01-first-time-setup/step1-sync-vendors.png)

进入 Vendors 页面，点击 "Sync from YAML" 按钮...

### 步骤 2: 创建资产
![创建资产](./10-workflows/01-first-time-setup/step2-create-asset.png)

进入 Assets 页面，点击 "Add Asset" 按钮...

### 步骤 3: 创建路由
![创建路由](./10-workflows/01-first-time-setup/step3-create-route.png)

...

### 步骤 4: 生成密钥
![生成密钥](./10-workflows/01-first-time-setup/step4-generate-key.png)

...

### 步骤 5: 测试验证
![测试验证](./10-workflows/01-first-time-setup/step5-test.png)

...
```

---

## 五、视频录制计划（可选）

如果需要录制演示视频，建议录制以下内容：

| 视频名称 | 时长 | 内容 |
|---------|------|------|
| `quick-start.mp4` | 2-3 分钟 | 首次配置完整流程 |
| `daily-usage.mp4` | 1-2 分钟 | 日常使用场景 |
| `playground-demo.mp4` | 2-3 分钟 | Playground 功能演示 |
| `tool-calling-demo.mp4` | 1-2 分钟 | 工具调用功能演示 |

**录制工具建议**:
- macOS: QuickTime Player 或 Kap
- Windows: OBS Studio
- 跨平台: Loom

---

## 六、执行步骤

### 准备工作

1. 确保开发服务器运行在 `http://localhost:3000`
2. 准备测试数据：
   - 至少一个厂商配置
   - 至少一个资产（API Key）
   - 至少一个路由
   - 至少一个访问密钥
   - 一些请求日志数据

### 执行顺序

1. **创建目录结构**
   ```bash
   mkdir -p docs/screenshots/{01-login,02-dashboard,03-vendors,04-assets,05-routes,06-keys,07-playground,08-logs,09-system,10-workflows/{01-first-time-setup,02-daily-usage}}
   ```

2. **按场景顺序截图**
   - 从登录开始
   - 按用户使用流程顺序进行

3. **整理和命名**
   - 确保文件名符合规范
   - 检查截图质量

4. **编写文档**
   - 创建 README.md
   - 添加截图说明

---

## 七、注意事项

1. **截图尺寸**: 统一使用 1920x1080 分辨率
2. **敏感信息**: 确保 API Key 等敏感信息已脱敏
3. **一致性**: 保持相同的 UI 主题和状态
4. **完整性**: 确保截图包含完整的操作上下文
5. **文件格式**: 统一使用 PNG 格式
6. **文件大小**: 单张截图不超过 500KB，必要时压缩

---

## 八、验收标准

- [ ] 所有 43 张截图已生成
- [ ] 截图清晰、完整
- [ ] 文件命名符合规范
- [ ] README.md 文档完整
- [ ] 敏感信息已脱敏
- [ ] 截图按场景分类存储
