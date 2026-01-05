# Model Selector Behavior - 所有场景说明

## 场景定义

### 输入数据
- **资产模型列表**: 资产提供的可用模型（如 `["glm-4-air", "glm-4-flash", ...]`）
- **Override 规则**: 路由配置的模型重写规则

---

## 场景 1: 无 Override 规则（默认）

**配置**:
```yaml
overrides: []  # 或者没有 model 字段的 override
```

**行为**:
- **模式**: 精确匹配 (Exact Mode)
- **可否自定义输入**: ❌ 否
- **下拉选项**: 资产的所有可用模型（如 `glm-4-air`, `glm-4-flash`, `glm-4-plus`, ...）
- **输入验证**: 只能从下拉选项中选择
- **示例**:
  ```
  下拉选项: [glm-4-air, glm-4-flash, glm-4-plus, glm-4.6, glm-4.7]
  可以输入: ❌ 只能选择
  ```

---

## 场景 2: 精确匹配模式

**配置**:
```yaml
overrides:
  - field: model
    matchValues:
      - gpt-3.5-turbo
      - gpt-4
    rewriteValue: glm-4-flash
```

**行为**:
- **模式**: 精确匹配 (Exact Mode)
- **可否自定义输入**: ❌ 否
- **下拉选项**: `matchValues` 中的值 (`gpt-3.5-turbo`, `gpt-4`)
- **输入验证**: 只能从下拉选项中选择
- **示例**:
  ```
  下拉选项: [gpt-3.5-turbo, gpt-4]
  可以输入: ❌ 只能选择
  输入其他: 红色提示 "只能选择: gpt-3.5-turbo 或 gpt-4"
  ```

---

## 场景 3: 前缀通配符模式

**配置**:
```yaml
overrides:
  - field: model
    matchValues:
      - gpt-*
    rewriteValue: glm-4-flash
```

**行为**:
- **模式**: 前缀匹配 (Prefix Mode)
- **可否自定义输入**: ✅ 是，但必须以 `gpt-` 开头
- **下拉选项**: 资产中以 `gpt-` 开头的模型
- **输入验证**: 必须以 `gpt-` 开头
- **提示**: "Must start with: gpt-*"
- **示例**:
  ```
  下拉选项: [gpt-3.5-turbo, gpt-4, gpt-4-turbo] (如果有这些模型)
  可以输入: ✅ gpt-3.5-turbo, gpt-4, gpt-5 (假设存在)
  不可输入: ❌ claude-3-opus (不以 gpt- 开头)
  输入错误: 红色提示 "Must start with: gpt-*"
  ```

---

## 场景 4: 全通配符模式

**配置**:
```yaml
overrides:
  - field: model
    matchValues:
      - "*"
    rewriteValue: gpt-4
```

**行为**:
- **模式**: 自由输入 (Free Mode)
- **可否自定义输入**: ✅ 是，任意模型名称
- **下拉选项**: 无下拉框（纯文本输入）
- **输入验证**: 无限制
- **提示**: 示例模型名称
- **示例**:
  ```
  下拉选项: 无（纯文本输入框）
  可以输入: ✅ 任意内容 (gpt-4, claude-3-opus, gemini-pro, ...)
  输入错误: 无验证
  ```

---

## 场景 5: 混合模式（精确匹配 + 通配符）⭐ 重点

**配置**:
```yaml
overrides:
  - field: model
    matchValues:
      - gpt-3.5-turbo
      - gpt-4
    rewriteValue: glm-4-flash

  - field: model
    matchValues:
      - "*"
    rewriteValue: gpt-4
```

**行为**:
- **模式**: 混合模式 (Mixed Mode) - 通配符优先
- **可否自定义输入**: ✅ 是（因为有 `*`）
- **下拉选项**: 精确匹配的值 (`gpt-3.5-turbo`, `gpt-4`)
- **输入验证**: 无限制（因为有 `*`）
- **提示**: 无特殊提示（允许任意输入）
- **示例**:
  ```
  下拉选项: [gpt-3.5-turbo, gpt-4]
  可以输入: ✅ 任意内容
  - 选择下拉: gpt-3.5-turbo 或 gpt-4
  - 自定义输入: claude-3-opus, gemini-pro, anything
  输入错误: 无验证（有 * 所以允许任意输入）
  ```

**设计理由**:
- 用户可以从常用选项中快速选择
- 也可以输入任意其他模型名称
- 提供便利性和灵活性

---

## 场景 6: 多个前缀通配符

**配置**:
```yaml
overrides:
  - field: model
    matchValues:
      - gpt-*
      - claude-*
    rewriteValue: glm-4-flash
```

**行为**:
- **模式**: 前缀匹配 (Prefix Mode) - 使用第一个前缀
- **可否自定义输入**: ✅ 是，但必须以 `gpt-` 开头（使用第一个）
- **下拉选项**: 资产中以 `gpt-` 或 `claude-` 开头的模型
- **输入验证**: 必须以 `gpt-` 开头
- **提示**: "Must start with: gpt-*"
- **未来改进**: 可以支持多个前缀，显示 "Must start with one of: gpt-*, claude-*"

---

## 实现优先级

1. **检查 `*` (wildcard-all)** → Free Mode（任意输入）
2. **检查 `xxx-*` (wildcard-prefix)** → Prefix Mode（前缀限制）
3. **否则** → Exact Mode（精确匹配）

---

## 错误提示

| 场景 | 输入错误时 |
|------|-----------|
| Exact Mode | 红色提示 "只能选择: [选项列表]" |
| Prefix Mode | 红色提示 "必须以 xxx- 开头" |
| Free/Mixed Mode | 无验证（允许任意输入） |

---

## UI 行为总结

| 模式 | 下拉框 | 可输入 | 验证规则 |
|------|--------|--------|----------|
| Free (*) | ❌ 无 | ✅ 任意 | 无 |
| Prefix (gpt-*) | ✅ 有 | ✅ 有前缀 | 前缀验证 |
| Mixed (exact + *) | ✅ 有 | ✅ 任意 | 无 |
| Exact | ✅ 有 | ❌ 否 | 精确匹配 |
