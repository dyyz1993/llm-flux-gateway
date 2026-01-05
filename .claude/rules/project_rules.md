# 环境与常量管理规范

## 1. 环境变量 (.env)

### 三位一体原则

所有环境变量必须同时定义在：

1. `.env.example` - 模板文件（提交到 Git）
2. `env.d.ts` - TypeScript 类型定义
3. 实际使用的 `.env` 或 `.env.*` 文件（不提交到 Git）

### 必需的环境变量

```bash
# Google Gemini API Keys
API_KEY=your_gemini_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### 本地校验

- 本地 `.env` 或 `.env.*` 中的变量必须同步到 `.env.example`
- 禁止在代码中直接硬编码 API Key、端口等敏感信息

### 当前实现

- 开发环境变量在 `vite.config.ts` 中通过 `define` 注入（仅用于开发）
- 生产环境应使用真实的 `.env` 文件

## 2. 常量管理

### 业务常量位置

- **动画常量**: `src/client/classes/PondFishConstants.ts`
  - 动画预设 (MOTION_SPEEDS, ANIM_STYLES)
  - 物理参数 (BAKE_FRAME_COUNT, BAKE_PADDING)
  - 网格配置 (默认 24x16 顶点)

- **API 常量**: `src/client/services/apiClient.ts`
  - `USE_MOCK_SERVER` - Mock 模式开关
  - `API_BASE_URL` - 生产环境 API 地址

### 类型定义

- **核心接口与枚举**: `src/shared/types.ts`
  - FishEntity, FishSkeleton, UserProfile
  - FacingDirection, FishStyle, AppMode
  - 所有前端和后端共享的类型

## 3. 核心原则

### 先定义后使用

- 新增环境变量须先在 `.env.example` 中定义
- 新增共享类型须在 `src/shared/types.ts` 中定义
- 新增动画常量须在 `PondFishConstants.ts` 中定义

### 保持同步

- 确保本地配置、模板文件与 TS 定义始终一致
- 修改类型后需同步更新所有引用处

### 禁止硬编码

- API Keys 必须从环境变量读取
- 端口号、URL 等配置应集中管理
- 魔法数字应定义为命名常量
