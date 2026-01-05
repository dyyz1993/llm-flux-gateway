# Skill Anti-Patterns (反模式和避免方法)

## Top 10 Anti-Patterns

### 1. Vague Descriptions

**问题**: Description 不具体，无法触发

```yaml
# ❌ Bad
description: Helps with documents
description: Processes data
description: Utility skill

# ✅ Good
description: >
  Extract text and tables from PDF files using pdfplumber.
  Use when: working with PDFs, forms, or .pdf files.
```

**影响**: Claude 无法知道何时使用该 skill

### 2. Missing WHEN in Description

**问题**: Description 只说明功能，没说明何时使用

```yaml
# ❌ Bad - Only WHAT
description: Extracts text from PDF files

# ✅ Good - WHAT + WHEN
description: >
  Extract text from PDF files using pdfplumber.
  Use when: working with PDFs, forms, or .pdf files.
```

**影响**: skill 不会被正确触发

### 3. Over-Explaining Basics

**问题**: 解释 Claude 已经知道的内容

````markdown
# ❌ Bad (150 tokens)

PDF (Portable Document Format) files are a common file format
that contains text, images, and other content. To extract text
from a PDF, you'll need to use a library. There are many libraries
available for PDF processing, but we recommend pdfplumber because
it's easy to use and handles most cases well...

# ✅ Good (20 tokens)

Use pdfplumber for text extraction:

```python
import pdfplumber
with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```
````

````

**影响**: 浪费 tokens，降低效率

### 4. Too Many Options

**问题**: 提供多个选项但无明确默认

```markdown
# ❌ Bad - Confusing
For PDF processing, you can use pypdf, pdfplumber, PyMuPDF,
or pdf2image depending on your needs...

# ✅ Good - Clear default
Use pdfplumber for text extraction (default).
For scanned PDFs requiring OCR, use pdf2image with pytesseract.
````

**影响**: Claude 不知如何选择，浪费时间

### 5. Deep Reference Nesting

**问题**: references 嵌套超过一层

```markdown
# ❌ Bad - Three levels deep

SKILL.md: "See advanced.md"
advanced.md: "See details.md"
details.md: "Here's the actual information"

# ✅ Good - One level deep

SKILL.md:

- Basic usage: [included in SKILL.md]
- Advanced: [references/advanced.md]
- API: [references/api.md]

advanced.md: Contains complete information
```

**影响**: 用户需要多次读取文件才能找到信息

### 6. First/Second Person in Description

**问题**: 使用第一或第二人称

```yaml
# ❌ Bad
description: I can help you process Excel files
description: Use this to analyze spreadsheets

# ✅ Good
description: >
  Analyze Excel spreadsheets and create pivot tables.
  Use when: working with .xlsx files or spreadsheet data.
```

**影响**: Description 格式不规范

### 7. Contradictory Instructions

**问题**: 指令互相矛盾

```markdown
# ❌ Bad

- Always validate the file format
- For quick processing, skip validation and proceed

# ✅ Good

- For production: Always validate file format
- For development: May skip validation with --skip-validation flag
```

**影响**: Claude 不知如何执行

### 8. Mixing Abstraction Levels

**问题**: 在同一层混合业务和技术细节

```markdown
# ❌ Bad

1. Understand the user's intent
2. Set the enabled field to false
3. Evaluate if the request makes sense
4. Return HTTP 403 status code

# ✅ Good - Group by level

## Business Logic

1. Understand user intent
2. Evaluate request validity

## Technical Implementation

1. Set enabled field to false
2. Return HTTP 403
```

**影响**: 逻辑混乱，难以跟随

### 9. Time-Sensitive Statements

**问题**: 包含会过期的信息

```markdown
# ❌ Bad - Will become wrong

If you're doing this before August 2025, use the old API.
After August 2025, use the new API.

# ✅ Good - Timeless

## Current method

Use the v2 API endpoint: `api.example.com/v2`

## Legacy (deprecated)

<details>
<summary>Old v1 API (no longer supported)</summary>
The v1 API used: `api.example.com/v1`
</details>
```

**影响**: skill 快速过时

### 10. Windows-Style Paths

**问题**: 使用反斜杠

```markdown
# ❌ Bad

scripts\helper.py
references\guide.md

# ✅ Good

scripts/helper.py
references/guide.md
```

**影响**: 跨平台兼容性问题

## File Organization Anti-Patterns

### Extra Documentation Files

**问题**: 包含 README, INSTALLATION 等

```
# ❌ Bad
skill-name/
├── SKILL.md
├── README.md              ← Don't include
├── INSTALLATION_GUIDE.md  ← Don't include
└── CHANGELOG.md          ← Don't include

# ✅ Good
skill-name/
├── SKILL.md
├── references/
└── scripts/
```

**理由**: Skill 应只包含 AI agent 需要的内容

### Generic File Names

**问题**: 文件名不描述内容

```
# ❌ Bad
references/doc1.md
references/info.md
references/details.md

# ✅ Good
references/form-validation.md
references/api-endpoints.md
references/error-handling.md
```

### Numbered Files

**问题**: 用数字编号而非语义命名

```
# ❌ Bad
references/file1.md
references/file2.md
references/file3.md

# ✅ Good
references/finance.md
references/sales.md
references/product.md
```

## Content Anti-Patterns

### Explaining the Obvious

**问题**: 解释通用概念

```markdown
# ❌ Bad

Git is a version control system that tracks changes...
A database is a collection of related data...

# ✅ Good

Use Git for version control.
Use MySQL for data persistence.
```

### Redundant Information

**问题**: SKILL.md 和 references/ 重复

```markdown
# ❌ Bad - Same content in both

SKILL.md: Full extraction guide
references/extraction.md: Same full guide

# ✅ Good

SKILL.md: Quick start + link to details
references/extraction.md: Complete guide
```

### Unclear Call-to-Action

**问题**: 不清楚该做什么

```markdown
# ❌ Bad

## PDF Processing

PDFs are useful for many things...
You might want to extract data...
Libraries are available...

# ✅ Good

## Extract Text from PDF

Run: `python scripts/extract.py input.pdf`

This saves output to `output.txt`.
```

## Structure Anti-Patterns

### Missing Frontmatter

**问题**: 没有 YAML frontmatter

```markdown
# ❌ Bad - No frontmatter

# PDF Processing

Instructions here...

# ✅ Good - With frontmatter

---

name: pdf-processing
description: Extract text from PDF files

---

# PDF Processing

Instructions here...
```

### Invalid YAML

**问题**: YAML 格式错误

```yaml
# ❌ Bad
name: pdf processing  # Space in name
description: 'Unclosed string
allowed-tools: [Read  # Missing bracket

# ✅ Good
name: pdf-processing
description: 'Properly quoted string'
allowed-tools: [Read, Write]
```

### Overlong SKILL.md

**问题**: SKILL.md 超过 500 行

```
# ❌ Bad
SKILL.md: 800 lines

# ✅ Good
SKILL.md: 150 lines
references/: Contains detailed content
```

## Anti-Pattern Detection Checklist

部署前检查：

- [ ] Description 包含 WHAT 和 WHEN
- [ ] Description 使用第三人称
- [ ] 无过度解释基础概念
- [ ] 明确默认选项
- [ ] References 只有一层深度
- [ ] 无重复内容
- [ ] 无时间敏感信息
- [ ] 使用正斜杠路径
- [ ] 文件名描述性强
- [ ] SKILL.md < 500 行
- [ ] YAML frontmatter 有效
- [ ] 无额外文档文件

## Refactoring Anti-Patterns

### From Vague to Specific

```yaml
# Before
description: Helps with files

# After
description: >
  Extract text and tables from PDF files.
  Use when: working with PDFs or .pdf files.
```

### From Nested to Flat

```
# Before
SKILL.md → advanced.md → details.md → info.md

# After
SKILL.md → advanced.md (complete)
```

### From Confusing to Clear

```markdown
# Before

Use any of these libraries: pypdf, pdfplumber, PyMuPDF...

# After

Use pdfplumber (default).
For OCR: pdf2image with pytesseract.
```

## Sources

- [Anthropic Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Elements.cloud - Anti-Patterns](https://elements.cloud/blog/agent-instruction-patterns-and-antipatterns-how-to-build-smarter-agents/)
