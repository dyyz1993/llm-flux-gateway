# Log Analysis Patterns

## Overview

This reference provides practical patterns for analyzing logs to debug issues effectively.

## Structured Logging Format

### Standard Log Entry

```json
{
  "timestamp": "2024-01-15T10:23:45.123Z",
  "level": "INFO",
  "message": "api_request",
  "service": "payment-service",
  "environment": "production",
  "correlationId": "req_abc123-def456",
  "userId": "user_12345",
  "endpoint": "/api/checkout",
  "method": "POST",
  "statusCode": 200,
  "duration": 234,
  "dbQueries": 3,
  "cacheHit": true
}
```

### Log Levels

| Level     | Usage                      | Example                      |
| --------- | -------------------------- | ---------------------------- |
| **ERROR** | Errors requiring attention | Database connection failed   |
| **WARN**  | Warning signs              | High memory usage (85%)      |
| **INFO**  | Normal operations          | User logged in successfully  |
| **DEBUG** | Detailed diagnostics       | Function entered with params |

## Common Analysis Patterns

### Pattern 1: Request Tracing

**Scenario**: User reports "My request failed"

```bash
# Step 1: Find user's requests
grep "user_12345" application.log

# Step 2: Extract correlation ID
grep "user_12345" application.log | grep -o "req_[a-z0-9-]*" | head -1

# Step 3: Trace complete request chain
grep "req_abc123-def456" /var/log/*/app.log
```

**Output**:

```
[gateway] 10:23:45.123 INFO  req_abc123-def456 Request received
[auth]   10:23:45.234 INFO  req_abc123-def456 User authenticated
[payment]10:23:45.345 ERROR req_abc123-def456 Database timeout
[gateway] 10:23:45.456 ERROR req_abc123-def456 Request failed: 504
```

**Analysis**: Payment service database timeout caused failure

### Pattern 2: Error Pattern Analysis

**Scenario**: Spikes in error rate

```bash
# Count errors by type
grep ERROR app.log | awk -F' ' '{print $6}' | sort | uniq -c | sort -rn

# Output:
#   150 Connection timeout
#    45 Null pointer exception
#    12 Division by zero
```

**Time-based analysis**:

```bash
# Errors per hour
grep ERROR app.log | awk '{print substr($2,1,2)}' | sort | uniq -c

# Output:
#   23 09  (9 AM hour)
#   45 10  (10 AM hour)  ← Peak
#   12 11  (11 AM hour)
```

### Pattern 3: Performance Analysis

**Scenario**: API is slow

```bash
# Extract slow requests (> 1 second)
jq 'select(.duration > 1000)' requests.json

# Analyze slow request characteristics
jq 'select(.duration > 1000) | {endpoint: .endpoint, duration: .duration}' \
  requests.json | jq -s 'group_by(.endpoint) | map({endpoint: .[0].endpoint,
  avg_duration: (map(.duration) | add / length), count: length})'

# Output:
# {
#   "endpoint": "/api/orders",
#   "avg_duration": 2345,
#   "count": 150
# }
```

### Pattern 4: Database Query Analysis

```json
{
  "timestamp": "2024-01-15T10:23:45.123Z",
  "level": "INFO",
  "message": "db_query",
  "query": "SELECT * FROM orders WHERE user_id = ?",
  "duration": 4892,
  "rows": 15000,
  "indexUsed": null
}
```

**Analysis**:

- Duration: 4.9 seconds (very slow)
- Rows: 15,000 (too many)
- indexUsed: null (table scan!)

**Conclusion**: Missing index or N+1 query problem

### Pattern 5: Memory Leak Detection

```bash
# Heap snapshot over time
grep "heap_used" app.log | awk '{print $1, $2}' > heap_usage.txt

# Plot or analyze trend
# If heap_used keeps increasing → possible leak
```

**Pattern to look for**:

```
[10:00] heap_used: 256 MB
[10:15] heap_used: 512 MB
[10:30] heap_used: 768 MB
[10:45] heap_used: 1024 MB  ← Never releases!
```

## Log Analysis Commands

### Basic Commands

```bash
# Find all errors in last hour
grep "ERROR" app.log | awk '/10:[0-1][0-9]:/' | tail -100

# Find specific user's activity
grep "user_12345" app.log

# Count requests per endpoint
grep "api_request" app.log | jq -r '.endpoint' | sort | uniq -c

# Find slowest requests
jq -s 'sort_by(.duration) | reverse | .[0:10]' requests.json

# Check for specific exception
grep -A 10 "NullPointerException" app.log
```

### Advanced Commands

```bash
# Correlate errors across services
paste <(grep ERROR app1.log | cut -d' ' -f1,2) \
        <(grep ERROR app2.log | cut -d' ' -f1,2) | \
  awk '{print $1, $4, $2, $5}' | grep -v "N/A"

# Find time patterns in errors
grep ERROR app.log | awk '{print $2}' | cut -d: -f1 | sort | uniq -c

# Extract stack traces from logs
grep -A 20 "Exception" app.log | grep -E "at |Caused by" | head -40

# Compare two time periods
diff <(grep "10:0[0-5]:" app.log | wc) <(grep "10:1[0-5]:" app.log | wc)
```

## Real-World Analysis Examples

### Example 1: Sudden Spike in Errors

**Problem**: Error rate jumped from 0.1% to 12%

**Step 1: Look at error types**

```bash
grep ERROR app.log | tail -1000 | awk '{print $6}' | sort | uniq -c
# Output: 98% "Connection refused", 2% other
```

**Step 2: Correlate with time**

```bash
grep ERROR app.log | head -1
# Output: [2024-01-15 10:23:01] Connection refused

grep ERROR app.log | tail -1
# Output: [2024-01-15 10:25:30] Connection refused
```

**Step 3: Check what changed**

```bash
git log --since="2024-01-15 10:20" --until="2024-01-15 10:25"
# Output: Deployed v2.3.1 at 10:22
```

**Conclusion**: Recent deploy caused connection issues

### Example 2: Intermittent Bug

**Problem**: Bug happens randomly, can't reproduce

**Approach: Statistical logging**

```javascript
// Add low-overhead diagnostic logging
const diagnostics = {
  attempts: 0,
  failures: 0,
  lastFailure: null,
  conditions: {},
};

function riskyOperation(input) {
  const condition = {
    timestamp: Date.now(),
    inputSize: input.length,
    concurrentRequests: global.concurrentCount,
  };

  const success = tryOperation(input);

  diagnostics.attempts++;
  if (!success) {
    diagnostics.failures++;
    diagnostics.lastFailure = condition;
  }

  // Periodically log statistics
  if (diagnostics.attempts % 100 === 0) {
    logger.info({
      message: 'diagnostics',
      attempts: diagnostics.attempts,
      failures: diagnostics.failures,
      failureRate: diagnostics.failures / diagnostics.attempts,
      lastFailure: diagnostics.lastFailure,
    });
  }
}
```

**After 1000 attempts**:

```json
{
  "attempts": 1000,
  "failures": 127,
  "failureRate": 0.127,
  "lastFailure": {
    "timestamp": "2024-01-15 10:30:15",
    "inputSize": 1500000,
    "concurrentRequests": 48
  }
}
```

**Pattern discovered**: Fails when concurrent requests > 45 and input size > 1MB

### Example 3: Memory Leak

**Problem**: Memory usage grows over time

**Step 1: Collect heap samples**

```bash
# Take heap snapshot every 5 minutes
for i in {1..12}; do
  echo "=== Sample $i ===" >> heap_analysis.txt
  grep "heap_used" app.log | tail -1 >> heap_analysis.txt
  sleep 300
done
```

**Step 2: Analyze trend**

```
Sample 1: heap_used: 256 MB
Sample 2: heap_used: 384 MB
Sample 3: heap_used: 512 MB
...
Sample 12: heap_used: 1536 MB  ← Consistent increase!
```

**Step 3: Identify leaked objects**

```bash
# Look for object creation without cleanup
grep "Create object" app.log | wc -l   # 1,234
grep "Destroy object" app.log | wc -l  #   234

# Ratio: 5:1 (should be ~1:1)
```

**Conclusion**: Objects created but not destroyed → memory leak

## Log Visualization

### Timeline View

```
Time     │ Gateway  │  Auth    │  Service  │  DB      │
─────────┼──────────┼──────────┼──────────┼──────────┤
10:23:45 │    ↓     │    ↓     │    ↓     │    ↓     │
10:23:46 │    ✓     │    ✓     │    ↓     │    ↓     │
10:23:47 │          │          │    ↓     │    ✓     │
10:23:48 │          │          │    ✓     │          │
10:23:49 │    ✓     │          │          │          │
10:23:50 │    ✗     │          │          │          │

Legend: ↓ Request entered, ✓ Step complete, ✗ Error
```

### Request Flow Diagram

```
User Request (correlation_id: abc123)
   │
   ├─→ [Gateway] (10:23:45.123) Received
   │   └─→ [Auth] (10:23:45.234) Validated
   │       └─→ [Service A] (10:23:45.345) Processing
   │           └─→ [Database] (10:23:45.456) Query start
   │               └─→ [Database] (10:23:48.789) Query end ⚠️ 3.3s!
   │                   └─→ [Service A] (10:23:48.890) Response
   │                       └─→ [Gateway] (10:23:48.901) Complete (3.8s)
   │                           └─→ User (10:23:48.912) Received
```

## AI-Assisted Log Analysis

### Prompt Template

```markdown
## Log Analysis Request

I have these log patterns:

**Recent errors (last 100)**:
[paste grep ERROR app.log | tail -100]

**Time distribution**:
[paste error count by hour]

**System context**:

- Service: Payment API
- Language: Node.js 20
- Database: MySQL 8.0
- Recent changes: Deployed v2.3.1 30 min ago

**Questions**:

1. What patterns do you see?
2. What are the most likely causes?
3. What additional logs should I check?
```

### AI Response Example

```
Analysis:

**Patterns Identified**:
1. All errors are "Connection refused" to database
2. Started exactly 10:22 UTC (after deploy)
3. No errors before 10:22
4. Affects 100% of database queries

**Most Likely Causes**:
1. Database connection string changed in deploy
2. Database not accessible from new pod location
3. Firewall rule changed

**Next Steps**:
1. Check database connection string in new deploy
2. Test database connectivity from pod
3. Check firewall logs for dropped connections
4. Compare old vs new deploy configuration
```

## Best Practices

### DO ✅

```bash
# Use correlation IDs
grep "req_abc123" /var/log/*/app.log

# Count errors by type
grep ERROR app.log | awk '{print $6}' | sort | uniq -c

# Time-based analysis
grep ERROR app.log | awk '{print $2}' | cut -d: -f1 | sort | uniq -c

# Use structured output
jq '.[] | select(.duration > 1000)' requests.json
```

### DON'T ❌

```bash
# Don't grep everything (too slow)
grep "." app.log | grep ERROR

# Don't analyze without context
grep ERROR app.log  # No time range, no filtering

# Don't ignore timestamps
cat app.log | grep ERROR  # Lose time information
```

## Sources

- [Logging Best Practices](https://betterstack.com/community/guides/logging/logging-best-practices/)
- [Structured Logging](https://www.honeycomb.io/blog/structured-logging-is-joys/)
- [Distributed Tracing](https://opentelemetry.io/docs/concepts/observability-primer/)
