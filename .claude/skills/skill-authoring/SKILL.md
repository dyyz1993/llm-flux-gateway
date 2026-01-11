---
name: skill-authoring
description: >
  Create and maintain Claude Code Skills following best practices.
  Use when: Creating new skills, refactoring existing skills, writing skill documentation,
  or when user asks about skill structure, SKILL.md format, or skill organization.
  Supports: Skill design, constraint-based documentation, progressive disclosure patterns.
allowed-tools: [SubTask, Context:fork, Read, Write, Edit, Glob, Grep]
---

# Skill Authoring

## Quick Start

```bash
# Create new skill structure
mkdir -p .claude/skills/your-skill/{references,templates}

# Start with template
cp .claude/skills/skill-authoring/templates/skill-template.md \
   .claude/skills/your-skill/SKILL.md
```

## Skill File Structure (强制)

```
skill-name/
├── SKILL.md              # Required: Core instructions (<500 lines)
├── references/           # Optional: Detailed docs (loaded on-demand)
│   └── topic-name.md
├── scripts/              # Optional: Executable code (run, not loaded)
│   └── script.py
└── templates/            # Optional: Templates (referenced by path)
    └── template.txt
```

**禁止**: README.md, INSTALLATION_GUIDE.md, CHANGELOG.md

## SKILL.md Format (必须)

```yaml
---
name: skill-name # Required: lowercase, hyphens, max 64 chars
description: > # Required: WHAT + WHEN, max 1024 chars
  What this skill does and when to use it.
  Include triggers: file types, task types, keywords.
allowed-tools: [Read, Write] # Optional: Restrict available tools
---
# Skill Title

[Instructions - keep under 500 lines]
```

### Description Field (最关键)

**原则**: Description 是主要触发机制，启动时加载，必须包含 WHAT 和 WHEN

```yaml
# ✅ Good - Specific and actionable
description: >
  Extract text and tables from PDF files using pdfplumber.
  Use when: working with PDFs, forms, document extraction, or .pdf files.

# ❌ Bad - Vague
description: Helps with documents

# ❌ Bad - Missing WHEN
description: Extracts text from PDF files
```

### Description Checklist

- [x] 使用第三人称: "Processes X", not "I can process X"
- [x] 包含 WHAT: 具体功能
- [x] 包含 WHEN: 触发场景（文件类型、任务类型、关键词）
- [x] 具体、明确、可操作

## Core Principles (核心约束)

### 1. 简洁性 (强制)

**原则**: 假设 Claude 已经很聪明，只添加它不知道的上下文

````markdown
# ✅ Good (50 tokens)

Use pdfplumber for text extraction:

```python
import pdfplumber
text = pdfplumber.open("file.pdf").pages[0].extract_text()
```
````

# ❌ Bad (150 tokens)

PDF files are a common format that contains text...
There are many libraries available...
We recommend pdfplumber because...

````

### 2. 渐进式披露 (强制)

**三级加载系统**:

| Level | 何时加载 | 内容限制 |
|-------|---------|---------|
| Metadata (YAML) | 启动时 | ~100 tokens |
| SKILL.md Body | 触发时 | <500 lines, ~5000 tokens |
| references/ | 按需 | 无限制 |

```markdown
# SKILL.md 结构
## Quick Start
[核心命令]

## Basic Usage
[常用模式]

**Advanced**: See [references/advanced.md](references/advanced.md)
**API Reference**: See [references/api.md](references/api.md)
````

### 3. 适当的自由度 (强制)

| 自由度 | 使用场景                 | 实现方式           |
| ------ | ------------------------ | ------------------ |
| **高** | 多种有效方案，依赖上下文 | 文本指令           |
| **中** | 首选模式存在，允许变化   | 伪代码或参数化脚本 |
| **低** | 操作脆弱，一致性关键     | 特定脚本，少参数   |

**类比**: Claude 探索路径

- 窄桥悬崖 → 提供护栏（低自由度）
- 开阔场地 → 给出方向（高自由度）

### 4. 命名规范 (强制)

使用动名词形式 (gerund):

```bash
# ✅ Good
processing-pdfs
analyzing-spreadsheets
managing-databases
writing-documentation

# ⚠️ Acceptable
pdf-processing
spreadsheet-analysis

# ❌ Avoid
helper
utils
tools
anthropic-helper
claude-tools
```

### 5. 内容一致性 (强制)

- **术语统一**: 选择一个术语，全程使用
- **避免时间敏感**: 不用"2025年8月前用旧API"
- **使用正斜杠**: 始终用 `scripts/helper.py`

## Common Anti-Patterns (禁止)

| Anti-Pattern           | Example                             | Fix                                          |
| ---------------------- | ----------------------------------- | -------------------------------------------- |
| **Vague descriptions** | "Helps with documents"              | "Extract text from PDF files"                |
| **Over-explaining**    | "PDF is a common format..."         | "Use pdfplumber"                             |
| **Too many options**   | "Use pypdf or pdfplumber or..."     | "Use pdfplumber (default)"                   |
| **Deep nesting**       | SKILL.md → advanced.md → details.md | One level deep                               |
| **Missing WHEN**       | "Extracts text"                     | "Extracts text. Use when: working with PDFs" |

详见 [references/anti-patterns.md](references/anti-patterns.md)

## Validation Checklist

- [x] YAML frontmatter 有效
- [x] Description 包含 WHAT 和 WHEN
- [x] references/ 链接正确
- [x] SKILL.md < 500 行
- [x] 无额外文档文件 (README, INSTALLATION)
- [x] 命名符合规范 (kebab-case)

## Additional Resources

- [references/best-practices.md](references/best-practices.md) - 详细最佳实践
- [references/patterns.md](references/patterns.md) - 设计模式和示例
- [references/anti-patterns.md](references/anti-patterns.md) - 反模式和避免方法
- [references/workflow.md](references/workflow.md) - 开发工作流程
- [templates/skill-template.md](templates/skill-template.md) - SKILL.md 模板
