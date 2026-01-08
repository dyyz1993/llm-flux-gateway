# 样式跳转功能 - 完整实现指南

## 快速开始

### 1. 集成插件到 vite.config.ts

```typescript
import { styleJumpPlugin } from './plugins/vite-plugin-style-jump';

export default defineConfig({
  plugins: [
    react(),
    // 只在开发模式启用
    styleJumpPlugin({
      enabled: process.env.NODE_ENV === 'development',
    }),
  ],
});
```

### 2. 在应用入口初始化

```typescript
// src/client/main.tsx
import { setupStyleJumper } from './style-jumper-runtime';

if (import.meta.env.DEV) {
  setupStyleJumper();
}
```

### 3. 使用

1. 启动开发服务器
2. 按 `Cmd+Shift+J` 开启检查器
3. 点击任何元素查看对应的样式位置

---

## 架构详解

### Map 维护流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. CSS 文件变化                                             │
│     src/App.css                                              │
│     .btn { color: red; }  ← 第 10 行                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Vite Plugin transform hook                              │
│     parse('.btn', 'src/App.css', 10)                        │
│     ↓                                                        │
│     generateId('.btn', 'src/App.css', 10)                   │
│     ↓                                                        │
│     styleId = 'style-a3f8b2c1'  (MD5 hash)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 更新内存映射表                                            │
│     styleMap = {                                            │
│       'style-a3f8b2c1': {                                    │
│         file: 'src/App.css',                                │
│         line: 10,                                           │
│         column: 2,                                          │
│         selector: '.btn'                                    │
│       }                                                     │
│     }                                                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  4. buildEnd - 输出到文件                                    │
│     dist/style-map.json                                     │
└─────────────────────────────────────────────────────────────┘
```

### 注入流程

```
┌─────────────────────────────────────────────────────────────┐
│  源 JSX 代码                                                 │
│  <div className="btn-primary">点击</div>                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  Vite Plugin transform hook                                 │
│     检测 className 属性                                      │
│     ↓                                                        │
│     提取类名 "btn-primary"                                   │
│     ↓                                                        │
│     生成 style-id "style-btn-primary"                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  转换后的代码                                                │
│  <div                                                        │
│    className="btn-primary"                                   │
│    data-style-id="style-btn-primary"  ← 新增属性             │
│  >点击</div>                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Vite 插件 Hook 详解

### transform Hook

```typescript
transform(code, id) {
  // 1. 处理样式文件 - 生成映射
  if (id.endsWith('.css')) {
    parseCSS(code, id);
    return { code, map: null };
  }

  // 2. 处理 JSX 文件 - 注入属性
  if (id.endsWith('.tsx')) {
    const transformed = injectDataStyleId(code);
    return { code: transformed.code, map: null };
  }
}
```

### buildEnd Hook

```typescript
buildEnd() {
  // 输出映射表到文件
  this.emitFile({
    type: 'asset',
    fileName: 'style-map.json',
    source: JSON.stringify(styleMap, null, 2),
  });
}
```

### configureServer Hook

```typescript
configureServer(server) {
  // 提供 API 端点
  server.middlewares.use('/api/style-map', (req, res) => {
    res.end(JSON.stringify(styleMap));
  });
}
```

---

## 运行时工作流程

```
用户按键 Cmd+Shift+J
       │
       ▼
┌────────────────────────┐
│ setupHotkeyListener()  │
│ 监听键盘事件            │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ toggleInspector()      │
│ 切换显示状态            │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ renderBadges()         │
│ 查找 [data-style-id]   │
│ 创建浮动标签            │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ 用户点击标签            │
└──────────┬─────────────┘
           │
           ▼
┌────────────────────────┐
│ jumpToSource(styleId)  │
│ 从 styleMap 查找位置    │
│ ↓                       │
│ 调用 trae:// URI        │
└────────────────────────┘
```

---

## 调试技巧

### 查看映射表

```bash
# 访问 API 端点
curl http://localhost:3000/api/style-map

# 或查看生成的文件
cat dist/style-map.json
```

### 检查注入的属性

```javascript
// 在浏览器控制台
document.querySelectorAll('[data-style-id]')
```

### 查看插件日志

```bash
npm run dev 2>&1 | grep 'style-jump'
```

---

## 扩展功能

### 支持更多编辑器

```typescript
function jumpToEditor(location: StyleLocation, editor: 'trae' | 'vscode' | 'jetbrains') {
  const schemes = {
    trae: `trae://file${location.file}:${location.line}:${location.column}`,
    vscode: `vscode://file${location.file}:${location.line}:${location.column}`,
    jetbrains: `jetbrains://navigate?file=${location.file}&line=${location.line}`,
  };

  window.open(schemes[editor], '_blank');
}
```

### 支持 Tailwind CSS

```typescript
// 解析 Tailwind 类名
function parseTailwindClasses(code: string) {
  const classes = code.match(/className=["']([^"']+)["']/g);
  // 生成映射...
}
```

---

## 性能优化

1. **只在开发模式启用**
   ```typescript
   enabled: process.env.NODE_ENV === 'development'
   ```

2. **缓存映射表**
   ```typescript
   const cache = new Map<string, StyleMap>();
   ```

3. **按需加载运行时**
   ```typescript
   if (import.meta.env.DEV) {
     await import('./style-jumper-runtime');
   }
   ```

---

## 故障排除

### URI scheme 不工作

**问题**: 点击后没有跳转到编辑器

**解决**:
1. 检查编辑器是否安装
2. 尝试复制路径手动跳转
3. 添加后端代理执行 CLI 命令

### 映射表为空

**问题**: style-map.json 没有内容

**解决**:
1. 检查文件路径是否正确
2. 确认 CSS 文件被 Vite 处理
3. 查看插件日志

### data-style-id 未注入

**问题**: 元素上没有 data-style-id 属性

**解决**:
1. 检查 JSX 文件是否被 transform
2. 确认 className 格式正确
3. 查看编译后的代码
