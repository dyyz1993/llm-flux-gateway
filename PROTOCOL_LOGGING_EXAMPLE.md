# Protocol Transformation Logging - Visual Examples

## Example 1: Successful Conversion with Ignored Fields

### Before (Old Logging)
```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Client Format → Internal Format                          │
├─────────────────────────────────────────────────────────────────┤
│ From: anthropic                                                   │
│ To:   openai (internal)                                          │
│                                                                  │
│ [JSON data omitted]                                              │
│                                                                  │
│ Status: ✓ SUCCESS                                                │
│ Errors: 0                                                        │
└─────────────────────────────────────────────────────────────────┘
```

### After (Enhanced Logging)
```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Client Format → Internal Format                          │
├─────────────────────────────────────────────────────────────────┤
│ From: anthropic                                                   │
│ To:   openai (internal)                                          │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ORIGINAL REQUEST (From Client)                              │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ {                                                            │ │
│ │   "model": "claude-3-opus-20240229",                        │ │
│ │   "max_tokens": 1024,                                       │ │
│ │   "anthropic_version": "2023-06-01",  ← Will be ignored     │ │
│ │   "messages": [...]                                         │ │
│ │ }                                                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ CONVERTED REQUEST (Internal Format)                         │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ {                                                            │ │
│ │   "model": "claude-3-opus-20240229",                        │ │
│ │   "max_tokens": 1024,                                       │
│ │   "messages": [...]                                         │ │
│ │ }                                                            │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ 💾 [LOGS TABLE] Will log:                                       │
│    - model: "claude-3-opus-20240229"                            │
│    - messages: [3 messages]                                      │
│    - tools: [0 tools]                                            │
│    - temperature: N/A                                            │
│    - stream: false                                               │
│                                                                  │
│ Conversion Metadata:                                             │
│   - Fields Converted: 8                                          │
│   - Fields Ignored: 1                                            │
│   - Fields Warned: 0                                             │
│   - Conversion Time: 3ms                                         │
│                                                                  │
│ Ignored Fields:                                                  │
│   - anthropic_version (not supported in OpenAI format)          │
│                                                                  │
│ Transformed Fields:                                              │
│   - messages.0.role (system → user)                             │
│   - messages.0.content (string → array)                         │
│                                                                  │
│ Status: ✓ SUCCESS                                                │
└─────────────────────────────────────────────────────────────────┘
```

**Key Insight:** You can now see that `anthropic_version` was discarded and understand what data was lost.

---

## Example 2: Conversion with Errors

### Before (Old Logging)
```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Client Format → Internal Format                          │
├─────────────────────────────────────────────────────────────────┤
│ From: anthropic                                                   │
│ To:   openai (internal)                                          │
│                                                                  │
│ Status: ✗ FAILED                                                │
│ Errors: 1                                                        │
│  - Invalid role value                                           │
└─────────────────────────────────────────────────────────────────┘
```

### After (Enhanced Logging)
```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Client Format → Internal Format                          │
├─────────────────────────────────────────────────────────────────┤
│ From: anthropic                                                   │
│ To:   openai (internal)                                          │
│                                                                  │
│ [JSON data omitted]                                              │
│                                                                  │
│ Conversion Metadata:                                             │
│   - Fields Converted: 5                                          │
│   - Fields Ignored: 0                                            │
│   - Fields Warned: 0                                             │
│   - Conversion Time: 2ms                                         │
│                                                                  │
│ Errors:                                                          │
│   [INVALID_ENUM_VALUE] messages.0.role: Invalid role "bot".     │
│     Expected one of: system, user, assistant                    │
│                                                                  │
│ Status: ✗ FAILED                                                │
└─────────────────────────────────────────────────────────────────┘
```

**Key Insight:** You now know exactly which field failed and what the valid values are.

---

## Example 3: Conversion with Warnings

### Before (Old Logging)
```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Internal Format → Target Format (Upstream Request)      │
├─────────────────────────────────────────────────────────────────┤
│ From: openai (internal)                                          │
│ To:   gemini                                                      │
│                                                                  │
│ Status: ✓ SUCCESS                                                │
│ Errors: 0                                                        │
└─────────────────────────────────────────────────────────────────┘
```

### After (Enhanced Logging)
```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Internal Format → Target Format (Upstream Request)      │
├─────────────────────────────────────────────────────────────────┤
│ From: openai (internal)                                          │
│ To:   gemini                                                      │
│                                                                  │
│ [JSON data omitted]                                              │
│                                                                  │
│ Conversion Metadata:                                             │
│   - Fields Converted: 12                                         │
│   - Fields Ignored: 2                                            │
│   - Fields Warned: 1                                             │
│   - Conversion Time: 5ms                                         │
│                                                                  │
│ Ignored Fields:                                                  │
│   - temperature (not supported by Gemini)                       │
│   - top_p (not supported by Gemini)                             │
│                                                                  │
│ Transformed Fields:                                              │
│   - tools → tools                                                │
│   - messages → contents                                          │
│   - messages.0.content → contents.0.parts                       │
│   ... and 9 more                                                 │
│                                                                  │
│ Warnings:                                                        │
│   [VALUE_OUT_OF_RANGE] max_tokens: Value 8192 exceeds          │
│     Gemini's maximum of 4096. Truncated to 4096.                │
│                                                                  │
│ Status: ✓ SUCCESS                                                │
└─────────────────────────────────────────────────────────────────┘
```

**Key Insight:** You can see that the conversion succeeded but with warnings about value limits and unsupported features.

---

## Example 4: Multi-Step Conversion with Full Context

```
╔══════════════════════════════════════════════════════════════════╗
║           PROTOCOL TRANSFORMATION TRACE LOG                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Request ID: 550e8400-e29b-41d4-a716-446655440000              ║
║  Timestamp: 2025-01-04T10:30:45.123Z                           ║
╚══════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Client Format → Internal Format                          │
├─────────────────────────────────────────────────────────────────┤
│ From: anthropic                                                   │
│ To:   openai (internal)                                          │
│                                                                  │
│ Conversion Metadata:                                             │
│   - Fields Converted: 10                                         │
│   - Fields Ignored: 1                                            │
│   - Fields Warned: 0                                             │
│   - Conversion Time: 2ms                                         │
│                                                                  │
│ Ignored Fields:                                                  │
│   - anthropic_version                                            │
│                                                                  │
│ Status: ✓ SUCCESS                                                │
└─────────────────────────────────────────────────────────────────┘

                            ↓

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Route Matching & Rewrite                                │
├─────────────────────────────────────────────────────────────────┤
│ Matched Route: Claude Opus → GPT-4 Turbo                        │
│ Route ID: route-claude-to-gpt4                                  │
│                                                                  │
│ DETAILED CHANGES:                                                │
│   [+ADD] model: "gpt-4-turbo-preview"                           │
│   [-DEL] model: was "claude-3-opus-20240229"                    │
│   [~MOD] max_tokens:                                             │
│         - 4096                                                   │
│         + 4096                                                   │
│   [UNCHANGED]                                                   │
└─────────────────────────────────────────────────────────────────┘

                            ↓

┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Internal Format → Target Format (Upstream Request)      │
├─────────────────────────────────────────────────────────────────┤
│ From: openai (internal)                                          │
│ To:   openai                                                      │
│                                                                  │
│ Conversion Metadata:                                             │
│   - Fields Converted: 10                                         │
│   - Fields Ignored: 0                                            │
│   - Fields Warned: 0                                             │
│   - Conversion Time: 1ms                                         │
│                                                                  │
│ Status: ✓ SUCCESS                                                │
└─────────────────────────────────────────────────────────────────┘

                            ↓

╔══════════════════════════════════════════════════════════════════╗
║                    RESPONSE SUMMARY                              ║
╠══════════════════════════════════════════════════════════════════╣
║  Total Chunks: 15                                               ║
║  Prompt Tokens: 45                                               ║
║  Completion Tokens: 128                                         ║
║  Total Tokens: 173                                              ║
║  Cached Tokens: 0                                               ║
║  Time to First Byte: 234ms                                      ║
║  Total Latency: 1245ms                                          ║
╚══════════════════════════════════════════════════════════════════╝
```

**Key Insight:** Full trace of the entire request lifecycle with metadata at each step.

---

## Comparison Summary

| Aspect                    | Before                              | After                                    |
|--------------------------|-------------------------------------|------------------------------------------|
| **Field Visibility**     | None                                | Complete list of converted/ignored fields |
| **Error Details**        | Simple message                      | Error code, path, and message            |
| **Warning Tracking**     | Not logged                          | Full warnings with codes                 |
| **Performance Metrics**  | None                                | Conversion time per step                 |
| **Debugging Value**      | Low - vague errors                  | High - precise error locations           |
| **Data Loss Detection**  | Impossible                           | Easy - see ignored fields                |
| **Root Cause Analysis**  | Difficult                           | Straightforward                          |

---

## Use Cases

### 1. Debugging Failed Conversions
```
❌ Before:
"Request format conversion failed"

✅ After:
"[INVALID_ENUM_VALUE] messages.0.role: Invalid role 'bot'.
 Expected one of: system, user, assistant"
```

### 2. Detecting Data Loss
```
❌ Before:
Conversion succeeded, but you don't know what was lost

✅ After:
Ignored Fields:
  - anthropic_version
  - top_k
  - stop_sequences
```

### 3. Performance Optimization
```
❌ Before:
No timing information

✅ After:
Step 1: 2ms
Step 3: 5ms
Total conversion: 7ms
```

### 4. Vendor Compatibility Analysis
```
✅ After:
You can now track:
- Which fields are commonly ignored for Anthropic → OpenAI
- Which fields trigger warnings for OpenAI → Gemini
- Conversion times by vendor pair
```

---

## How to Use the Enhanced Logs

### 1. Locate the Log File
```bash
# List recent logs
ls -lt logs/protocol-transformation/ | head -20

# Find logs for a specific request ID
grep -r "550e8400-e29b-41d4-a716-446655440000" logs/protocol-transformation/
```

### 2. Check for Errors
```bash
# Find all conversion errors
grep -A5 "Errors:" logs/protocol-transformation/*.log

# Count errors by type
grep -o "\[.*\]" logs/protocol-transformation/*.log | sort | uniq -c
```

### 3. Analyze Ignored Fields
```bash
# Find all ignored fields
grep -A10 "Ignored Fields:" logs/protocol-transformation/*.log

# Most commonly ignored fields
grep "Ignored Fields:" logs/protocol-transformation/*.log | \
  sed 's/.*- //' | sort | uniq -c | sort -rn
```

### 4. Performance Analysis
```bash
# Find slow conversions
grep "Conversion Time:" logs/protocol-transformation/*.log | \
  awk '{print $3, $4}' | sort -t: -k2 -rn | head -20
```

---

## Conclusion

The enhanced logging transforms protocol transformation from a black box into a transparent, debuggable process. Every field, error, warning, and performance metric is now visible, making it easy to:

- Debug conversion failures
- Understand data loss
- Optimize performance
- Analyze vendor compatibility
- Improve conversion quality

This is especially valuable when working with multiple AI vendors (OpenAI, Anthropic, Gemini) each with their own unique API formats and capabilities.
