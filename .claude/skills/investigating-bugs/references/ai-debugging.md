# AI-Assisted Debugging

## Overview

This reference covers how to effectively use AI (like Claude) for debugging, including prompt patterns, workflows, and best practices.

## Three Golden Rules

1. **Context Over Volume** - Three well-structured lines > 500 lines of logs
2. **Ask for Reasons** - "Why might this happen?" not "Fix this"
3. **Iterate Rapidly** - Test suggestions and report back

## Effective Prompt Framework

### The Perfect Debugging Prompt

````markdown
## Bug Report

**Context**:

- Language: [version]
- Framework: [version]
- Environment: [dev/staging/prod]

**Error**:
[paste complete error message]

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What's happening instead]

**Code**:

```language
[paste minimal reproducible snippet]
```
````

**What I've Tried**:

1. [attempt 1 - result]
2. [attempt 2 - result]

**Request**:
Analyze root cause and explain why this happens.
Don't just provide the fix - help me understand.

````

## Prompt Templates by Bug Type

### Template 1: Crash/Error

```markdown
Fix this error in [language]:

**Error**:
````

[paste complete stack trace]

````

**Code**:
```language
[paste relevant code with line numbers]
````

**Context**:

- This happens when [condition]
- It started after [recent change]
- Works for [some inputs] but fails for [others]

**Expected**: [what should happen]
**Actual**: [what happens instead]

Provide:

1. Root cause analysis
2. Step-by-step explanation
3. Specific fix
4. Why this fix works

````

### Template 2: Performance Issue

```markdown
Analyze this performance problem:

**Symptoms**:
- Function slow: [duration]
- Should be: [expected duration]
- Input size: [data]

**Code**:
```language
[paste function]
````

**Profiling Data**:

```
Hotspots:
- Line 15: 45% of time
- Line 23: 30% of time
- Line 30: 15% of time
```

**Context**:

- Data size: [N records]
- Environment: [browser/node/production]

Analyze bottleneck and suggest optimizations.

````

### Template 3: Race Condition

```markdown
Debug this concurrency issue:

**Problem**:
[describe intermittent behavior]

**Code**:
```language
[paste async/multi-threaded code]
````

**Observed Pattern**:

- Works: [percentage]% of time
- Fails: [percentage]% of time
- When it fails: [what happens]

**Logging**:

```
[paste log output showing timing]
```

Explain the race condition and how to fix it properly.

````

### Template 4: Memory Leak

```markdown
Investigate this memory leak:

**Symptoms**:
- Memory grows over time
- After [N] operations: [memory usage]
- GC doesn't reclaim memory

**Code**:
```language
[paste code creating objects]
````

**Heap Snapshot**:

```
Objects not collected:
- SomeClass: 1,234 instances
- OtherClass: 567 instances
```

Identify the leak and explain how to fix it.

```

## AI Debugging Workflow

```

┌─────────────────────────────────────────────────────────────┐
│ AI Debugging Cycle │
├─────────────────────────────────────────────────────────────┤
│ │
│ 1. Local Investigation │
│ ┌─────────────────────┐ │
│ │ Reproduce bug │ │
│ │ Get minimal snippet │ │
│ │ Understand failure │ │
│ └─────────────────────┘ │
│ │ │
│ ▼ │
│ 2. Initial AI Prompt │
│ ┌─────────────────────┐ │
│ │ Provide context │ │
│ │ Ask: "Why might │ │
│ │ this happen?" │ │
│ └─────────────────────┘ │
│ │ │
│ ▼ │
│ 3. Review AI Analysis │
│ ┌─────────────────────┐ │
│ │ Understand reasoning │ │
│ │ Check assumptions │ │
│ │ Verify suggestions │ │
│ └─────────────────────┘ │
│ │ │
│ ▼ │
│ 4. Test One Suggestion │
│ ┌─────────────────────┐ │
│ │ Apply ONE change │ │
│ │ Run test │ │
│ │ Document result │ │
│ └─────────────────────┘ │
│ │ │
│ ▼ │
│ 5. Feed Back to AI │
│ ┌─────────────────────┐ │
│ │ "I tried X, result │ │
│ │ was Y" │ │
│ │ Ask next question │ │
│ └─────────────────────┘ │
│ │ │
│ └──────► Repeat until fixed ─────►┐ │
│ │ │
│ ▼ ▼
│ ┌─────────────────────┐
│ │ Bug Fixed! 🎉 │
│ └─────────────────────┘
│ │
└─────────────────────────────────────────────────────────────┘

````

## Good vs Bad Prompts

### ❌ Bad Prompts

```markdown
Fix my code
````

```markdown
It doesn't work
```

```markdown
Here's my entire codebase (5000 lines)
```

```markdown
I get an error
[no error message, no code, no context]
```

### ✅ Good Prompts

````markdown
In TypeScript, this React component throws:
"Cannot read property 'user' of undefined"
at UserProfile.tsx:15.

Code:

```typescript
const UserProfile = ({ userId }) => {
  const user = users[userId];  // Error happens here
  return <div>{user.name}</div>;
};
```
````

Expected: Display user name
Actual: Crashes with undefined error
Context: This happens when userId doesn't exist in users object

What's the root cause and how should I handle this?

````

```markdown
This SQL query is slow (4.5 seconds):

```sql
SELECT * FROM orders
WHERE user_id = ?
  AND created_at > ?
ORDER BY created_at DESC;
````

Table: orders (1.2M rows)
Indexes: PRIMARY KEY (id), INDEX (user_id)

Explain output:

```
id  select_type  table        type  possible_keys  key      rows  Extra
1   SIMPLE       orders       ref   user_id        user_id  45K  Using where; Using filesort
```

Why is it slow and how can I optimize it?

````

## Iterative Debugging Example

### Round 1: Initial Prompt

```markdown
My React component crashes when props.user is null.

Error: "Cannot read property 'name' of undefined"
Code: <div>{props.user.name}</div>
````

**AI Response**:

```
The issue is that props.user can be null.
Add a check: {props.user && <div>{props.user.name}</div>}
```

### Round 2: Follow-up

```markdown
I tried that, but now I get:
Type Error: Object is possibly 'null'

How do I fix this properly in TypeScript?
```

**AI Response**:

```
Use optional chaining or provide a fallback:
<div>{props.user?.name ?? 'Loading...'}</div>

Or better, use a loading state:
{!props.user ? <Loading /> : <div>{props.user.name}</div>}
```

### Round 3: Verification

```markdown
That works! But why did TypeScript complain when JS didn't?
```

**AI Response**:

```
TypeScript's strict null checking catches bugs that JS would miss at runtime.
Your original code would crash if props.user was null - TypeScript prevented this.
The ?? operator provides a safe fallback while maintaining type safety.
```

## Common AI Debugging Pitfalls

### Pitfall 1: Vague Context

❌ **Problem**:

```
"Fix my authentication"
```

✅ **Fix**:

```
"Fix JWT authentication in Express.js.
Error: 'invalid token' on POST /login
Started after updating to passport@0.7"
```

### Pitfall 2: Too Much Code

❌ **Problem**:

```
[Paste entire 500-line file]
```

✅ **Fix**:

```
[Paste only the relevant 20 lines around the error]
Mention: "Full file at src/auth/login.ts if needed"
```

### Pitfall 3: Not Sharing Results

❌ **Problem**:

```
[After AI suggestion]
[Doesn't work, asks new question without feedback]
```

✅ **Fix**:

```
"I tried your suggestion to use optional chaining,
but now I get 'Type X is not assignable to type Y'.
Here's the new error: [...]"
```

### Pitfall 4: Asking "Just Fix It"

❌ **Problem**:

```
"Fix this code"
[Gets working code but doesn't learn anything]
```

✅ **Fix**:

```
"Explain why this error occurs and how to fix it.
I want to understand the root cause."
```

## Specialized Debugging Prompts

### For Memory Leaks

````markdown
Investigate this memory leak in React:

**Symptoms**:

- Memory grows from 50MB → 200MB over 10 minutes
- Happens when navigating between pages

**Code**:

```typescript
useEffect(() => {
  const handler = () => processData();
  window.addEventListener('resize', handler);

  // Missing cleanup function!
}, []);
```
````

**Heap Snapshot**:

- Detached DOM nodes: 1,234
- Event listeners: 567 (should be 0)

Explain the leak and show proper cleanup.

````

### For Race Conditions

```markdown
Debug this race condition:

**Problem**:
Data sometimes loads, sometimes doesn't.
Works: ~70% of the time

**Code**:
```typescript
const [data, setData] = useState(null);

useEffect(() => {
  setLoading(true);
  fetchData(userId).then(result => {
    setData(result);      // ← Potential race
    setLoading(false);
  });
}, [userId]);
````

**Console**:
"Warning: Can't perform a React state update on an unmounted component"

Explain the race condition and the proper fix.

````

### For Performance Issues

```markdown
Optimize this slow function:

**Current**: Takes 4.5 seconds for 10,000 items

**Code**:
```javascript
function processData(items) {
  const results = [];
  for (const item of items) {
    const detail = fetchDetail(item.id);  // ← Synchronous!
    const processed = transform(item, detail);
    results.push(processed);
  }
  return results;
}
````

**Questions**:

1. Why is it slow?
2. What's the bottleneck?
3. How can I make it 10x faster?

Show me the optimized code with explanations.

````

## AI Tool Integration

### AI + Git Commands

```markdown
Search git history for when this bug was introduced:

File: src/payment/process.ts
Error: "TypeError: Cannot read property 'amount' of undefined"
Line: 45

Use git bisect or git log to find the problematic commit.
````

### AI + Log Analysis

```markdown
Analyze these log patterns:

**Recent errors**:
```

[10:23:45] ERROR Database timeout
[10:24:12] ERROR Database timeout
[10:24:45] ERROR Database timeout
[10:25:01] ERROR Connection refused
[10:25:15] ERROR Connection refused

```

**Database logs**:
```

Connections: 95/100
Query time: P95 8.5s, P99 23s

```

What do these patterns indicate?
What should I investigate next?
```

### AI + Testing

````markdown
I have a failing test:

```typescript
test('should calculate discount', () => {
  const result = calculateDiscount(order);
  expect(result.discount).toBe(0.15);
});
```
````

**Error**:

```
Expected: 0.15
Received: undefined
```

**Implementation**:

```typescript
function calculateDiscount(order) {
  if (order.total > 100) {
    return { discount: 0.15 };
  }
  // Missing return value!
}
```

Help me understand why the test fails and how to fix both the code and test.

```

## Best Practices

### DO ✅

1. **Provide minimal reproducible examples**
2. **Include exact error messages**
3. **Specify language/framework versions**
4. **Describe expected vs actual behavior**
5. **Share what you've tried**
6. **Ask for explanations, not just fixes**
7. **Test AI suggestions before accepting**
8. **Iterate and provide feedback**

### DON'T ❌

1. **Say "fix my code" with no details**
2. **Paste entire codebase**
3. **Omit error messages**
4. **Forget to mention recent changes**
5. **Accept AI suggestions blindly**
6. **Skip testing and verification**
7. **Move to next topic without closure**

## Sources

- [Top Debugging Prompts That Work](https://medium.com/@prompt.pantry/top-debugging-prompts-that-actually-work-with-ai-877ee99611ab)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [AI Models Still Struggle to Debug Software](https://www.reddit.com/r/artificial/comments/1jwk8d2/)
```
