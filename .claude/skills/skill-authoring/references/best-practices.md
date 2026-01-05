# Skill Authoring Best Practices (详细)

## 1. Description Field 深度解析

### 为什么 Description 最关键

- **启动时加载**: Description 在 YAML frontmatter 中，每次会话开始时加载
- **主要触发机制**: Claude 通过 Description 判断何时使用该 skill
- **Body 按需加载**: SKILL.md 主体内容只在触发后才加载

### Effective Description 示例

```yaml
# PDF Processing - 良好示例
description: >
  Extract text and tables from PDF files using pdfplumber.
  Use when: working with PDF files, forms, document extraction,
  or when user mentions .pdf files, PDF parsing, or form filling.

# Excel Analysis - 良好示例
description: >
  Analyze Excel spreadsheets, create pivot tables, generate charts.
  Use when: analyzing .xlsx files, spreadsheet data, tabular analysis,
  or when user requests pivot tables, data visualization, or Excel reporting.

# Git Commit Helper - 良好示例
description: >
  Generate descriptive commit messages by analyzing git diffs.
  Use when: user asks for help writing commit messages, reviewing staged changes,
  or when git operations involve commit message generation.
```

### Description 编写模式

#### 模式 1: 功能 + 触发场景

```yaml
description: >
  [Core functionality in one sentence].
  Use when: [file types], [task types], [keywords], [specific scenarios].
```

#### 模式 2: 多场景触发

```yaml
description: >
  Generate and maintain API documentation from code.
  Use when: documenting REST APIs, generating OpenAPI specs,
  creating SDK documentation, maintaining API reference guides,
  or when requests involve API docs, endpoint documentation, or Swagger/OpenAPI.
```

### 第三人称 vs 第一人称

```yaml
# ✅ Good - 第三人称
description: Processes Excel files and generates reports

# ❌ Bad - 第一人称
description: I can help you process Excel files

# ❌ Bad - 第二人称
description: You can use this to process Excel files
```

## 2. Progressive Disclosure 实践

### Level 1: Metadata (启动时)

```yaml
---
name: pdf-processing
description: >
  Extract text and tables from PDF files.
  Use when: working with PDFs, forms, or .pdf files.
---
```

**Token 成本**: ~100 tokens per skill

### Level 2: SKILL.md Body (触发时)

````markdown
# PDF Processing

## Quick Start

Extract text:

```python
import pdfplumber
text = pdfplumber.open("file.pdf").pages[0].extract_text()
```
````

## Common Tasks

**Text extraction**: See instructions above
**Table extraction**: See [references/table-extraction.md](references/table-extraction.md)
**Form filling**: See [references/forms.md](references/forms.md)
**API reference**: See [references/api.md](references/api.md)

```

**Token 成本**: ~500-5000 tokens

### Level 3: Bundled Resources (按需)

**scripts/**: 执行而不加载到上下文
**references/**: 通过 Read 工具按需加载
**templates/**: 仅引用路径

### 域特定组织 (Domain-Specific Organization)

对于多域 skill，按域组织内容：

```

bigquery-skill/
├── SKILL.md
└── references/
├── finance.md # Revenue, ARR, billing
├── sales.md # Opportunities, pipeline
├── product.md # API usage, features
└── marketing.md # Campaigns, attribution

````

SKILL.md:
```markdown
# BigQuery Data Analysis

## Available Datasets

**Finance**: Revenue, ARR, billing → [references/finance.md](references/finance.md)
**Sales**: Opportunities, pipeline → [references/sales.md](references/sales.md)
**Product**: API usage, features → [references/product.md](references/product.md)
**Marketing**: Campaigns, attribution → [references/marketing.md](references/marketing.md)
````

## 3. Appropriate Degrees of Freedom

### 决策树

```
任务需要 → 操作脆弱？
    ↓
  是 → 提供特定脚本（低自由度）
  否 → 依赖上下文？
       ↓
     是 → 文本指令（高自由度）
     否 → 伪代码或参数化（中自由度）
```

### 示例对比

#### 低自由度（脆弱操作）

```markdown
## Database Migration

⚠️ **Critical operation** - Follow exactly:

1. Backup database: `python scripts/backup.py`
2. Run migration: `python scripts/migrate.py --verify --backup`
3. Verify: `python scripts/verify.py`

Do not modify these commands.
```

#### 高自由度（创意任务）

```markdown
## Report Generation

Create a clear, actionable report that:

- Summarizes key findings in an executive summary
- Presents detailed analysis with supporting data
- Provides specific recommendations

Adjust structure based on the analysis type and audience.
```

#### 中自由度（有首选模式）

````markdown
## Data Visualization

Use matplotlib with these parameters:

```python
plt.figure(figsize=(12, 6))
plt.style.use('seaborn-v0_8-darkgrid')
```
````

Adapt the plot type based on your data distribution.

````

## 4. Workflow Patterns

### Sequential Workflows with Checklists

```markdown
## PDF Form Filling

Copy this checklist:

````

Task Progress:

- [ ] Step 1: Analyze form (run analyze_form.py)
- [ ] Step 2: Create field mapping (edit fields.json)
- [ ] Step 3: Validate mapping (run validate_fields.py)
- [ ] Step 4: Fill form (run fill_form.py)
- [ ] Step 5: Verify output (run verify_output.py)

```

### Step 1: Analyze the form

Run: `python scripts/analyze_form.py input.pdf`

This extracts form fields to `fields.json`.
```

### Conditional Workflows

```markdown
## Document Modification Workflow

1. **Determine type**:

   Creating new content? → "Creation workflow"
   Editing existing? → "Editing workflow"

2. **Creation workflow**:
   - Use docx-js library
   - Build from scratch
   - Export to .docx

3. **Editing workflow**:
   - Unpack document
   - Modify XML directly
   - Validate after each change
   - Repack when complete
```

### Feedback Loops

```markdown
## Document Editing Process

1. Edit `word/document.xml`
2. **Validate**: `python scripts/validate.py unpacked_dir/`
3. If validation fails:
   - Review error message
   - Fix XML issues
   - Run validation again
4. **Only proceed when validation passes**
5. Rebuild: `python scripts/pack.py unpacked_dir/ output.docx`
```

## 5. Testing and Iteration

### Evaluation-Driven Development

1. **识别差距**: 不用 skill 运行任务，记录失败
2. **创建评估**: 构建 3 个测试场景
3. **建立基线**: 测量无 skill 时的性能
4. **编写最小指令**: 只写足够通过评估的内容
5. **迭代**: 运行评估，对比基线，优化

### Evaluation Structure

```json
{
  "skills": ["pdf-processing"],
  "query": "Extract all text from this PDF and save to output.txt",
  "files": ["test-files/document.pdf"],
  "expected_behavior": [
    "Successfully reads PDF using appropriate library",
    "Extracts text from all pages without missing any",
    "Saves extracted text to output.txt"
  ]
}
```

### 跨模型测试

- **Claude Haiku**: skill 提供足够指导吗？
- **Claude Sonnet**: skill 清晰高效吗？
- **Claude Opus**: skill 避免过度解释吗？

### Hierarchical Development

1. **Claude A** (专家): 帮助优化 skill
2. **Claude B** (使用者): 使用 skill 执行实际工作
3. **观察 B 的行为**: 带回洞察给 A
4. **迭代改进**

## 6. Output Patterns

### Template Pattern

#### Strict Template (严格要求)

````markdown
## Report Structure

ALWAYS use this exact structure:

```markdown
# [Title]

## Executive Summary

[One-paragraph overview]

## Key Findings

- Finding 1 with data
- Finding 2 with data

## Recommendations

1. Actionable recommendation
```
````

````

#### Flexible Template (灵活指导)

```markdown
## Report Structure

Default format, use judgment:

```markdown
# [Title]

## Executive Summary
[Overview]

## Key Findings
[Adapt based on discoveries]

## Recommendations
[Tailor to context]
````

Adjust as needed.

````

### Examples Pattern

```markdown
## Commit Message Format

Follow these examples:

**Example 1**:
Input: Added JWT authentication
Output:
````

feat(auth): implement JWT-based authentication

Add login endpoint and token validation

```

**Example 2**:
Input: Fixed date formatting bug
Output:
```

fix(reports): correct date formatting in timezone conversion

Use UTC timestamps consistently

```

Style: type(scope): brief description, then details.
```

## 7. Security Considerations

### Environment Variables

```yaml
# ✅ Good - 引用环境变量
description: >
  Process files using $API_KEY for authentication.
  Requires: API_KEY environment variable.

# ❌ Bad - 硬编码
Never hardcode credentials in SKILL.md
```

### Tool Restrictions

```yaml
---
allowed-tools: [Read, Glob, Grep]
---
```

限制为只读工具用于敏感操作。

### Audit Checklist

- [ ] 无硬编码凭据
- [ ] 环境变量已文档化
- [ ] 敏感操作有限制
- [ ] scripts 有适当验证
- [ ] 来源可信（外部 skill）

## 8. Performance Optimization

### Token Efficiency

- 最小化 SKILL.md 大小
- 使用 references 存放详细内容
- 提供示例而非解释

### Loading Optimization

- 按域组织 references
- 大文件包含目录
- 清晰命名便于发现

### Script vs Reference

| 方式             | Token 成本 | 使用场景                 |
| ---------------- | ---------- | ------------------------ |
| scripts/ 执行    | 仅输出     | 复杂逻辑、可重用、确定性 |
| references/ 读取 | 完整内容   | 文档、示例、说明         |

## Sources

- [Anthropic Official - Skill Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Anthropic Engineering Blog](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Inside Claude Code Skills](https://mikhail.io/2025/10/claude-code-skills/)
