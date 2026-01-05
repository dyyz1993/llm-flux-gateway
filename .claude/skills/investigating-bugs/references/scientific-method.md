# Scientific Method for Debugging

## Overview

Debugging is fundamentally a scientific process. This reference applies the hypothetico-deductive method to software troubleshooting.

## The Scientific Debugging Loop

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│   观察 → 假设 → 实验 → 分析 → 迭代                            │
│    ↓      ↓      ↓      ↓      ↓                             │
│  收集   形成   设计   得出   修正                             │
│  数据   理论   测试   结论   理论                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Observation (数据收集)

### What to Observe

**System Metrics**:

```bash
# CPU usage
top -p $(pgrep node)

# Memory usage
free -h

# Disk I/O
iostat -x 1

# Network connections
netstat -an | grep ESTABLISHED
```

**Application Logs**:

```bash
# Recent errors
tail -100 /var/log/app.log | grep ERROR

# Error distribution
grep ERROR app.log | awk '{print $5}' | sort | uniq -c | sort -rn

# Correlated errors
grep -A 5 -B 5 "NullPointerException" app.log
```

**User Reports**:

- Expected vs. actual behavior
- Steps to reproduce
- Error messages/screenshots
- Frequency and consistency

### Documentation Template

```markdown
## Observation Log

**Time**: 2024-01-15 10:23:45 UTC
**Observer**: [Your name]
**System**: Production API server

### What Happened

- User report: "Checkout fails with 500 error"
- Affected users: ~25% of checkout attempts
- Started: ~10:20 UTC
- Pattern: Intermittent, not 100% reproducible

### System State

- CPU: 45% (normal)
- Memory: 6.2/16 GB (normal)
- Database: Connections at 80/100 (elevated)
- Recent deploy: v2.3.1 (30 min ago)

### Initial Data

- Error rate: 12% (normally 0.1%)
- Latency: P95 2.3s (normally 200ms)
- Stack trace: Database timeout in payment service
```

## Phase 2: Hypothesis Formation (假设形成)

### Hypothesis Criteria

Good hypotheses are:

- **Testable**: Can be proven or disproven
- **Specific**: Predict specific outcomes
- **Falsifiable**: Clear pass/fail criteria
- **Based on evidence**: Not wild guesses

### Hypothesis Examples

❌ **Bad Hypothesis**:

```
"Something is wrong with the database"
```

✅ **Good Hypothesis**:

```
"The database connection pool is exhausted (80/100 connections),
causing new checkout requests to timeout after 30 seconds."
```

### Hypothesis Prioritization

Rank by:

1. **Likelihood**: How well does it fit the evidence?
2. **Test cost**: How risky is the test?
3. **Information gain**: What will we learn?

```markdown
## Hypothesis List

### H1: Database Connection Pool Exhaustion (High Priority)

- **Evidence**: 80/100 connections, timeout errors
- **Test cost**: Low (check connection pool metrics)
- **Predicted outcome**: If true, increasing pool size should help

### H2: Recent Deploy Introduced Bug (Medium Priority)

- **Evidence**: Started 30 min after v2.3.1 deploy
- **Test cost**: Medium (rollback deploy)
- **Predicted outcome**: If true, rollback should fix issue

### H3: External Payment Gateway Down (Low Priority)

- **Evidence**: No reports from other customers
- **Test cost**: High (contact support)
- **Predicted outcome**: If true, all payment methods would fail
```

## Phase 3: Experiment Design (实验设计)

### Mutual Exclusivity

Tests must have clear yes/no outcomes:

```python
# Bad: Ambiguous test
if hypothesis == "database is slow":
    query_database()  # What does "slow" mean?

# Good: Clear threshold
if query_duration > 5000:  # 5 seconds
    print("Hypothesis confirmed")
else:
    print("Hypothesis rejected")
```

### Controlled Variables

```markdown
## Test Design for H1: Connection Pool Exhaustion

**Variables**:

- Independent: Connection pool size (current: 100)
- Dependent: Request timeout rate
- Controlled: Request rate, query complexity, time of day

**Test Procedure**:

1. Monitor current connection pool usage
2. Increase pool size to 150
3. Measure timeout rate over 10 minutes
4. Restore pool size to 100
5. Measure timeout rate over 10 minutes

**Predicted Outcomes**:

- If H1 true: Timeout rate drops with larger pool
- If H1 false: No change in timeout rate
```

### Confounding Factors

Be aware of variables that can mislead:

| Confounding Factor     | Effect                          | Mitigation                 |
| ---------------------- | ------------------------------- | -------------------------- |
| **Verbose logging**    | Slows execution, changes timing | Use async logging          |
| **Debugging overhead** | Alters thread timing            | Minimal instrumentation    |
| **Time-of-day**        | Load varies                     | Compare same time window   |
| **Cache state**        | First run vs subsequent         | Clear caches between tests |

## Phase 4: Analysis and Iteration (分析与迭代)

### Recording Results

```markdown
## Experiment Log

### Test 1: Connection Pool Size

- **Time**: 10:30 - 10:40 UTC
- **Change**: Increased pool from 100 → 150
- **Result**: Timeout rate dropped from 12% → 2%
- **Conclusion**: H1 PARTIALLY confirmed

### Test 2: Restore Pool Size

- **Time**: 10:40 - 10:50 UTC
- **Change**: Decreased pool from 150 → 100
- **Result**: Timeout rate increased from 2% → 11%
- **Conclusion**: H1 STRONGLY confirmed
```

### Iterating Hypotheses

If initial hypothesis is wrong:

```
H1 rejected → H2 (next likely) → Test → H2 rejected → H3 → ...
                                                              ↓
                                                     Root cause found
```

### Negative Results (重要的!)

**Always document what didn't work**:

```markdown
## Ruled Out Hypotheses

### X: DNS Resolution Issues (REJECTED)

- **Test**: nslookup payment-gateway.com
- **Result**: DNS resolves correctly in 3ms
- **Conclusion**: DNS is not the issue

### Y: Network Latency (REJECTED)

- **Test**: traceroute to payment gateway
- **Result**: Consistent 15ms latency (normal)
- **Conclusion**: Network is not the issue
```

## Root Cause Analysis (根因分析)

### Five Whys Technique

```markdown
## Problem: Checkout Timeout

### Why 1: Why is checkout timing out?

→ Database query is taking > 30 seconds

### Why 2: Why is database query slow?

→ Query is doing full table scan on orders table

### Why 3: Why is it doing full table scan?

→ No index on user_id column

### Why 4: Why is there no index?

→ Index was dropped during recent schema migration

### Why 5: Why was index dropped?

→ Migration script had bug that dropped index without recreating

**Root Cause**: Migration script bug dropped required index
**Fix**: Recreate index and fix migration script
```

### Fishbone Diagram (Ishikawa)

```
                 Checkout Timeout
                        │
        ┌───────────────┼───────────────┐
        │               │               │
    Database        Network       Application
        │               │               │
  ┌─────┴─────┐   ┌───┴───┐   ┌─────┴─────┐
  │           │   │       │   │           │
No Index   Slow   DNS    High   Unoptimal
Connection   Pool   Fail   Load   Query
```

## Prevention (防止复发)

### Postmortem Template

````markdown
# Incident Postmortem: Checkout Timeout

## Summary

- **Impact**: 25% of checkouts failed for 30 minutes
- **Duration**: 10:20 - 10:50 UTC (30 minutes)
- **Root Cause**: Database migration script dropped required index

## Timeline

- 10:00: Deployed v2.3.1
- 10:20: Errors began (database timeouts)
- 10:35: Investigated logs, identified issue
- 10:45: Recreated index, errors stopped
- 10:50: Verified fix

## Root Cause

Migration script had bug:

```sql
-- Wrong: Dropped index without recreating
DROP INDEX IF EXISTS idx_user_id;

-- Should have been:
DROP INDEX IF EXISTS idx_user_id;
CREATE INDEX idx_user_id ON orders(user_id);
```
````

## What Went Well

- Quick identification via log analysis
- Effective hypothesis testing
- Fast resolution once root cause found

## What Could Be Improved

- Migration script not tested in staging
- No database performance monitoring
- Index should have been recreated before dropping

## Action Items

- [ ] Add migration script testing to CI/CD
- [ ] Set up database performance monitoring
- [ ] Review all migration scripts for similar issues
- [ ] Add pre-deploy checklist: verify indexes exist

```

## Sources

- [Google SRE Book - Effective Troubleshooting](https://sre.google/sre-book/effective-troubleshooting/)
- [Debugging with Root Cause Analysis](https://medium.com/@carlosalmonte04/debugging-with-root-cause-analysis-rca-bacd2d145a68)
- [The Scientific Method in Software Debugging](https://blog.jessitron.com/the-scientific-method-in-software-debugging)
```
