# Attribute Overrides Data Flow

## Visual Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLIENT REQUEST                                   │
│  POST /v1/chat/completions                                              │
│  { "model": "gpt-4", "messages": [...] }                                │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GATEWAY CONTROLLER                                    │
│  (gateway-controller.ts)                                                │
│                                                                          │
│  1. Parse request                                                        │
│  2. Convert to internal format                                          │
│  3. Match route (route-matcher.service.ts)                              │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     ROUTE MATCHER SERVICE                               │
│  (route-matcher.service.ts)                                             │
│                                                                          │
│  FOR each route (ordered by priority):                                  │
│    - Parse override rules                                               │
│    - Check if model matches any rule                                    │
│    - If match: return route with overrides                              │
│    - If no match: continue to next route                                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SCENARIO 1: Route WITH Override Rules                            │  │
│  │                                                                  │  │
│  │ Route: "coding"                                                  │  │
│  │ Overrides: [                                                     │  │
│  │   {field: "model", matchValues: ["gpt-4"], rewriteValue: "glm-4.6"}│  │
│  │ ]                                                                │  │
│  │                                                                  │  │
│  │ Requested model: "gpt-4"                                         │  │
│  │ → MATCHES!                                                       │  │
│  │ → Return route with overrides                                    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SCENARIO 2: Route WITHOUT Override Rules                        │  │
│  │                                                                  │  │
│  │ Route: "glm-coding-anthropic"                                    │  │
│  │ Overrides: []  ← EMPTY                                           │  │
│  │                                                                  │  │
│  │ Requested model: "glm-4-air"                                     │  │
│  │ → NO RULES TO MATCH                                              │  │
│  │ → Return route with empty overrides                              │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      REWRITE SERVICE                                     │
│  (rewrite.service.ts)                                                   │
│                                                                          │
│  applyRules(request, overrides)                                         │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SCENARIO 1: Overrides = [{...}]                                  │  │
│  │                                                                  │  │
│  │ FOR each rule:                                                   │  │
│  │   - Check if model matches                                       │  │
│  │   - IF match:                                                    │  │
│  │       overwrittenAttributes.model = {                            │  │
│  │         original: "gpt-4",                                       │  │
│  │         final: "glm-4.6"                                         │  │
│  │       }                                                          │  │
│  │       result.model = "glm-4.6"                                   │  │
│  │                                                                  │  │
│  │ RETURN: {                                                        │  │
│  │   rewrittenRequest: {model: "glm-4.6", ...},                     │  │
│  │   overwrittenAttributes: {model: {...}}  ← POPULATED             │  │
│  │ }                                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SCENARIO 2: Overrides = []                                       │  │
│  │                                                                  │  │
│  │ FOR each rule: (loop doesn't execute - empty array)             │  │
│  │   - No iterations                                                │  │
│  │                                                                  │  │
│  │ RETURN: {                                                        │  │
│  │   rewrittenRequest: {model: "glm-4-air", ...},                   │  │
│  │   overwrittenAttributes: {}  ← EMPTY                             │  │
│  │ }                                                                │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    REQUEST LOG SERVICE                                   │
│  (request-log.service.ts)                                               │
│                                                                          │
│  createLog({                                                             │
│    originalModel: "gpt-4" / "glm-4-air",                                 │
│    finalModel: "glm-4.6" / "glm-4-air",                                  │
│    overwrittenAttributes: {...} / {},  ← FROM REWRITE SERVICE            │
│    ...                                                                   │
│  })                                                                      │
│                                                                          │
│  → Serialize to database:                                               │
│    JSON.stringify(overwrittenAttributes)                                │
│    → "{"model":{...}}" / "{}"                                           │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATABASE                                         │
│  TABLE: request_logs                                                     │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SCENARIO 1: WITH Overrides                                      │  │
│  │                                                                  │  │
│  │ id: xxx                                                          │  │
│  │ original_model: "gpt-4"                                          │  │
│  │ final_model: "glm-4.6"                                           │  │
│  │ overwritten_attributes: "{"model":{"original":"gpt-4",...}}"     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SCENARIO 2: WITHOUT Overrides                                   │  │
│  │                                                                  │  │
│  │ id: xxx                                                          │  │
│  │ original_model: "glm-4-air"                                      │  │
│  │ final_model: "glm-4-air"                                         │  │
│  │ overwritten_attributes: "{}"  ← EMPTY OBJECT                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND (LogExplorer.tsx)                          │
│                                                                          │
│  API: GET /api/logs                                                      │
│  → Returns: RequestLog[]                                                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SCENARIO 1: overwritten_attributes = {model: {...}}             │  │
│  │                                                                  │  │
│  │ Object.keys(selectedLog.overwrittenAttributes).length = 1        │  │
│  │ → 1 > 0 → TRUE                                                   │  │
│  │ → SHOW "Attribute Overrides" section ✅                          │  │
│  │                                                                  │  │
│  │ Display:                                                         │  │
│  │ ┌────────────────────────────────────────┐                      │  │
│  │ │ Attribute Overrides                    │                      │  │
│  │ │ ────────────────────────────────────── │                      │  │
│  │ │ model  gpt-4  →  glm-4.6              │                      │  │
│  │ └────────────────────────────────────────┘                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ SCENARIO 2: overwritten_attributes = {}                         │  │
│  │                                                                  │  │
│  │ Object.keys(selectedLog.overwrittenAttributes).length = 0        │  │
│  │ → 0 > 0 → FALSE                                                  │  │
│  │ → HIDE "Attribute Overrides" section ✅ (CORRECT!)               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Takeaways

### 1. Data Flow is Linear and Predictable

```
Request → Route Match → Rewrite → Log → Database → Frontend
```

Each step passes data to the next, and the logic is consistent throughout.

### 2. Empty Overrides are Correct Behavior

When a route has no override rules:
- ✅ RewriteService returns `{}`
- ✅ Database stores `"{}"`
- ✅ Frontend hides the section (because `Object.keys({}).length === 0`)

### 3. The Feature Works As Designed

**NOT A BUG** - The system correctly:
- Shows overrides when they exist
- Hides overrides when they don't exist
- Preserves all data through the entire pipeline

## Testing Checklist

- [ ] Test with route that HAS override rules (e.g., `coding` route with `gpt-4`)
  - Expected: See "Attribute Overrides" section
  - Verify: `original_model !== final_model`
  - Verify: `overwritten_attributes` has content

- [ ] Test with route that HAS NO override rules (e.g., `glm-coding-anthropic`)
  - Expected: Don't see "Attribute Overrides" section
  - Verify: `original_model === final_model`
  - Verify: `overwritten_attributes` is `{}`

- [ ] Test with wildcard override rules (`matchValues: ["*"]`)
  - Expected: All models show overrides
  - Verify: All requests show "Attribute Overrides" section

## Common Questions

**Q: Why is the section hidden?**
A: Because the route being matched has no override rules configured.

**Q: How do I make it show?**
A: Either:
1. Use a different route that has override rules
2. Add override rules to the current route
3. Adjust route priorities so routes with overrides match first

**Q: Is this a bug?**
A: No. The system is working correctly. Empty overrides = no display.

**Q: How can I verify it's working?**
A: Run the test script: `./scripts/test-attribute-overrides.sh`
