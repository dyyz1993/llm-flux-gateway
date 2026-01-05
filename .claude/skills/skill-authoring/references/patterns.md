# Skill Design Patterns (设计模式)

## 1. Instruction Design Patterns

### Pattern 1: Unique, Verifiable Conditions

确保每个条件独特且语义不同：

```markdown
# ❌ Bad - 重叠条件

- Check if the file exists
- Verify the file is present

# ✅ Good - 独特条件

- Check if the file exists on disk
- Verify the file is not corrupted by checking checksum
```

### Pattern 2: Business Meaning Over Code References

描述做什么，而非技术实现：

```markdown
# ❌ Bad - Code reference

- Set the enabled flag to false
- Return a 404 status code

# ✅ Good - Business meaning

- Disable the user account to prevent access
- Indicate the resource was not found
```

### Pattern 3: Right Tool for the Job

```markdown
# AI Reasoning → 用于解释和判断

## Analyze the report structure

Determine if the report follows standard format or requires custom parsing.

# Actions → 用于确定性逻辑

## Extract data from PDF

Run: `python scripts/extract.py input.pdf`

This uses pdfplumber which handles:

- Text extraction
- Table detection
- Form field parsing
```

### Pattern 4: Affirmative Phrasing

告诉做什么，而非不做什么：

```markdown
# ❌ Bad - Negative phrasing

- Don't use the old API
- Never skip validation
- Do not proceed without backup

# ✅ Good - Affirmative phrasing

- Use the v2 API endpoint
- Always run validation before proceeding
- Create a backup before making changes
```

### Pattern 5: One Thought Per Step

拆分逻辑，避免矛盾：

```markdown
# ❌ Bad - Multiple thoughts, contradictory

- Read the file and if it doesn't exist, create it, but only if it's a config file

# ✅ Good - One thought per step

1. Check if the file exists
2. If file exists:
   - Read the file
3. If file doesn't exist:
   - Verify it's a config file
   - Create default config
```

### Pattern 6: Examples for Complex Instructions

```markdown
## Extract Key Metrics

From the analysis, extract these metrics:

**Example 1 - Revenue Report**:
Input: "Total revenue $2.5M, up 15% from last quarter"
Extracted: { revenue: "$2.5M", growth: "15%" }

**Example 2 - User Metrics**:
Input: "10,000 active users, 2,000 new signups"
Extracted: { active: 10000, new_users: 2000 }
```

### Pattern 7: Language Consistency

全程使用统一术语：

```markdown
# ❌ Bad - Inconsistent terminology

- The API endpoint / URL / route
- The field / column / attribute
- Extract / parse / retrieve data

# ✅ Good - Consistent terminology

- Always "API endpoint"
- Always "field"
- Always "extract"
```

### Pattern 8: Separate Business Rules

确定性规则放入系统，而非指令：

```markdown
# ❌ Bad - Business rules in instructions

- If the amount is greater than $10,000, require approval
- If the user is an admin, skip validation

# ✅ Good - Business rules in system/code

Scripts handle validation rules.
Instructions guide when to use which script.
```

### Pattern 9: Split Complex Tasks

保持每个指令专注简单：

```markdown
# ❌ Bad - Complex single step

1. Read the PDF, extract tables, validate the data, convert to JSON, save to database

# ✅ Good - Split into focused steps

1. Read the PDF file
2. Extract tables from pages
3. Validate extracted data
4. Convert to JSON format
5. Save to database
```

### Pattern 10: Confidence Thresholds

定义继续的信心水平：

```markdown
## Data Validation

After validation:

- **Confidence ≥ 90%**: Proceed automatically
- **Confidence 70-90%**: Flag for review, continue with warning
- **Confidence < 70%**: Stop and request manual review
```

## 2. Organizational Patterns

### Pattern: Domain-Specific Split

用于多域 skill：

```
analytics-skill/
├── SKILL.md
└── references/
    ├── finance.md
    ├── marketing.md
    └── product.md
```

SKILL.md:

```markdown
# Analytics

## Domains

**Finance**: Revenue, ARR → [references/finance.md](references/finance.md)
**Marketing**: Campaigns, attribution → [references/marketing.md](references/marketing.md)
**Product**: Usage, features → [references/product.md](references/product.md)
```

### Pattern: Progressive Complexity

基础 → 进阶 → 参考：

```markdown
# PDF Processing

## Quick Start

[Basic extraction in 3 lines]

## Common Tasks

[5-10 common patterns]

**Advanced**: [references/advanced.md](references/advanced.md)
**API Reference**: [references/api.md](references/api.md)
```

### Pattern: Troubleshooting First

将常见问题前置：

```markdown
# Database Migration

## Common Issues

**Issue**: Migration fails with permission error
**Fix**: Run `GRANT` commands in [references/permissions.md](references/permissions.md)

**Issue**: Timeout on large tables
**Fix**: Use batch mode, see [references/batch.md](references/batch.md)

## Migration Process

[Normal workflow]
```

## 3. Reference Organization Patterns

### Pattern: One-Level Deep

避免深层嵌套：

```markdown
# ❌ Bad - Three levels deep

SKILL.md → See advanced.md → See details.md → Here's info

# ✅ Good - One level deep

SKILL.md → See advanced.md (complete info)
```

### Pattern: Mutually Exclusive References

不常使用或互斥的功能分开放置：

```markdown
# PDF Processing

## Text Extraction

[Basic extraction in SKILL.md]

## Specialized Tasks

- **OCR**: See [references/ocr.md](references/ocr.md) (rare, separate)
- **Forms**: See [references/forms.md](references/forms.md) (separate workflow)
- **Merging**: See [references/merging.md](references/merging.md) (separate workflow)
```

### Pattern: Descriptive Naming

使用描述性文件名：

```bash
# ✅ Good - Descriptive
references/form-validation-rules.md
references/finance-schema.md
references/oauth-handling.md

# ❌ Bad - Generic
references/doc2.md
references/reference.md
references/extra.md
```

## 4. Code Organization Patterns

### Pattern: Plan-Validate-Execute

用于复杂任务：

```markdown
## Database Migration

1. **Plan**: Create migration plan
   Run: `python scripts/plan.py > plan.json`

2. **Validate**: Review and validate plan
   Run: `python scripts/validate.py plan.json`

3. **Execute**: Apply migration only after validation
   Run: `python scripts/execute.py plan.json`
```

### Pattern: Solve, Don't Punt

处理错误而非失败：

```python
# ✅ Good - Handle error
def process_file(path):
    try:
        with open(path) as f:
            return f.read()
    except FileNotFoundError:
        print(f"File {path} not found, creating default")
        with open(path, 'w') as f:
            f.write('')
        return ''

# ❌ Bad - Just fail
def process_file(path):
    return open(path).read()
```

### Pattern: Document Constants

避免魔法数字：

```python
# ✅ Good - Documented constants
# HTTP timeout: 30s accounts for slow connections
REQUEST_TIMEOUT = 30

# 3 retries balance reliability vs speed
MAX_RETRIES = 3

# ❌ Bad - Magic numbers
TIMEOUT = 47  # Why 47?
RETRIES = 5
```

## 5. Workflow Patterns

### Pattern: Sequential Checklist

```markdown
## Form Filling

Copy and track progress:
```

- [ ] Analyze form
- [ ] Create mapping
- [ ] Validate mapping
- [ ] Fill form
- [ ] Verify output

```

### Each step clearly defined with verification
```

### Pattern: Conditional Routing

```markdown
## Document Processing

1. **Determine document type**:

   PDF? → PDF workflow
   DOCX? → DOCX workflow
   Image? → OCR workflow

2. **PDF workflow**:
   - Extract with pdfplumber
   - Process tables
   - Validate output

3. **DOCX workflow**:
   - Parse XML structure
   - Extract styles
   - Reconstruct content
```

### Pattern: Feedback Loop

```markdown
## Validation Loop

1. Make change
2. **Validate immediately**
3. If validation fails:
   - Review error
   - Fix issue
   - Return to step 2
4. **Only proceed when validation passes**
```

## 6. Anti-Pattern Solutions

### Anti-Pattern: Vague Descriptions

**Problem**: "Helps with documents"

**Solution**: Be specific

```yaml
description: >
  Extract text and tables from PDF files.
  Use when: working with PDFs, forms, or .pdf files.
```

### Anti-Pattern: Over-Explaining

**Problem**: "PDF is a common file format..."

**Solution**: Assume intelligence

```markdown
Use pdfplumber for text extraction.
```

### Anti-Pattern: Option Overload

**Problem**: "Use pypdf or pdfplumber or PyMuPDF..."

**Solution**: Default with escape hatch

```markdown
Use pdfplumber (default).
For OCR: Use pdf2image with pytesseract.
```

### Anti-Pattern: Deep Nesting

**Problem**: SKILL.md → advanced.md → details.md

**Solution**: One level deep

```markdown
SKILL.md (basics) → advanced.md (complete info)
```

## Sources

- [Agent Instruction Patterns - Elements.cloud](https://elements.cloud/blog/agent-instruction-patterns-and-antipatterns-how-to-build-smarter-agents/)
- [Anthropic Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
