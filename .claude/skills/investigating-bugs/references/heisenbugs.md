# Heisenbugs: Intermittent Bug Strategies

## Overview

Heisenbugs are bugs that change behavior when observed. They're notoriously difficult to debug because they disappear when you add logging or attach a debugger.

## Why They Occur

```
Normal execution:    A → B → C → D (bug appears)
With debugger:       A → B → C → D' (bug disappears)
With extra logging:   A → B → C → D'' (bug disappears)
```

**Common causes**:

- **Race conditions**: Timing-dependent
- **Memory corruption**: Overwrites undetected memory
- **Undefined behavior**: Compiler optimizations change behavior
- **Resource exhaustion**: Debugging changes timing

## Diagnostic Strategies

### 1. Low-Intrusion Logging

```python
# ❌ Bad: Heavy logging that changes timing
logger.info(f"Processing item {item.id}")
logger.debug(f"Value: {item.value}")
logger.info(f"Result: {process(item)}")

# ✅ Good: Minimal logging with flags
DEBUG = False

def process(item):
    if DEBUG:
        # Only log if explicitly enabled
        logger.debug(f"Item: {item.id}")
    return complex_calculation(item)

# Enable only when debugging
# DEBUG=1 python app.py
```

### 2. Asynchronous Logging

```javascript
// ❌ Bad: Synchronous logging blocks execution
console.log('Step 1:', data);
processData(data);
console.log('Step 2:', result);

// ✅ Good: Async logging doesn't block
logger.log('Step 1:', data); // Returns immediately
processData(data);
logger.log('Step 2:', result);
```

### 3. Ring Buffer Logging

```c
// Circular buffer for debug info
#define DEBUG_BUFFER_SIZE 1000
static debug_log[DEBUG_BUFFER_SIZE];
static debug_index = 0;

void log_debug(const char* msg) {
    snprintf(debug_log[debug_index], 256, "%s: %s", timestamp(), msg);
    debug_index = (debug_index + 1) % DEBUG_BUFFER_SIZE;
}

// On crash, dump entire buffer
void dump_debug_log() {
    for (int i = 0; i < DEBUG_BUFFER_SIZE; i++) {
        printf("%s\n", debug_log[(debug_index + i) % DEBUG_BUFFER_SIZE]);
    }
}
```

### 4. Statistical Testing

```bash
# Run test many times to catch intermittent bug
for i in {1..1000}; do
    npm test || echo "Failed on iteration $i"
done

# Analyze failure patterns
# If failures at: 7, 14, 21, 28, 35...
# → Pattern: Every 7th iteration
```

## Specific Heisenbug Patterns

### Pattern 1: Race Condition

```javascript
// ❌ Bug appears when logging is off
let sharedState = null;

function processData(data) {
  if (!sharedState) {
    sharedState = initializeState();
  }
  // Race condition between check and use!
  return sharedState.process(data);
}
```

**Fix**:

```javascript
// ✅ Atomic operation
function processData(data) {
  return initializeState().process(data);
}

// Or use proper locking
const mutex = new Mutex();

async function processData(data) {
  return await mutex.runExclusive(() => {
    return sharedState.process(data);
  });
}
```

### Pattern 2: Timing-Dependent Bug

```python
# ❌ Bug appears when running fast
def process_batch(items):
    results = []
    for item in items:
        result = fetch_item_details(item)  # Async but not awaited
        results.append(result)
    return results  # Returns empty list!
```

**Fix**:

```python
# ✅ Properly handle async
async def process_batch(items):
    results = []
    for item in items:
        result = await fetch_item_details(item)
        results.append(result)
    return results
```

### Pattern 3: Memory Corruption

```c
// ❌ Use after free
char* data = malloc(100);
strcpy(data, "hello");
free(data);
printf("%s\n", data);  // Use after free!
```

**Detection**:

```bash
# Use AddressSanitizer
gcc -fsanitize=address -g test.c -o test
./test

# Output:
# ==12345==ERROR: AddressSanitizer: heap-use-after-free
```

## Reproduction Techniques

### Technique 1: Stress Testing

```bash
# Increase load to make bug more frequent
# Normal load: 10 requests/second → bug appears 5% of time
# High load: 100 requests/second → bug appears 50% of time

# Use Apache Bench
ab -n 10000 -c 100 http://localhost:3000/api/endpoint
```

### Technique 2: Environment Variation

```bash
# Bug only appears in production
# Try matching conditions:

# 1. Match data volume
# Production: 1M rows → Test with synthetic data

# 2. Match concurrency
# Production: 50 concurrent users → Load test

# 3. Match timing
# Production: Cache expires at 10am → Test at same time
```

### Technique 3: Deterministic Recording

```javascript
// Record execution trace
const recorder = new EventRecorder();

function testFunction() {
  recorder.start();
  // ... test code ...
  recorder.stop();
}

// Replay with different tools
// Check: What order did operations happen?
```

## Specialized Tools

### ThreadSanitizer (Race Conditions)

```bash
# Compile with TSan
clang -fsanitize=thread -g test.c

# Output detects race conditions
# ==12345==WARNING: ThreadSanitizer: data race
#    Write at 0x... by thread T1
#    Previous read at 0x... by thread T2
```

### AddressSanitizer (Memory Corruption)

```bash
# Compile with ASan
clang -fsanitize=address -g test.c

# Detects:
# - Use after free
# - Buffer overflows
# - Memory leaks
# - Stack use-after-return
```

### UndefinedBehaviorSanitizer

```bash
# Detects undefined behavior
clang -fsanitize=undefined -g test.c

# Detects:
# - Misaligned pointers
# - Null pointer dereference
# - Signed integer overflow
```

## Documentation Template

### Heisenbug Investigation Log

```markdown
# Heisenbug Investigation: [Title]

## Bug Description

- **Symptom**: [what happens]
- **Frequency**: [how often it appears]
- **Impact**: [severity]

## Environment

- **OS**: [version]
- **Runtime**: [version]
- **Compiler**: [version, flags]

## Reproduction Attempts

### Attempt 1: Normal Execution

- **Steps**: [reproduction steps]
- **Result**: ❌ Bug did not appear
- **Notes**: [observations]

### Attempt 2: With Debugging

- **Steps**: Same + added logging
- **Result**: ❌ Bug did not appear
- **Notes**: Logging changed timing

### Attempt 3: Stress Testing

- **Steps**: 1000 iterations
- **Result**: ✅ Bug appeared in 127 iterations (12.7%)
- **Notes**: Pattern identified

## Hypothesis

The bug appears when [condition] and [condition].

## Root Cause

[Detailed explanation]

## Fix

[Code changes]
```

## Case Study: Database Connection Timeout

````markdown
# Heisenbug: Intermittent DB Timeout

## Bug Description

- **Symptom**: Database timeout after 30 seconds
- **Frequency**: ~5% of checkout attempts
- **Impact**: Failed transactions

## Investigation

### Attempt 1: Add Logging

```python
# Added logging to database call
logger.info(f"Query: {query}")
result = db.execute(query)  # ← Bug disappeared!
logger.info(f"Result: {result}")
```
````

**Result**: Bug disappeared - logging added delay

### Attempt 2: Remove Logging, Add Timing

```python
start = time.time()
result = db.execute(query)
duration = time.time() - start
if duration > 5:
    logger.warning(f"Slow query: {duration}s")
```

**Result**: Bug still appeared but couldn't correlate with specific queries

### Attempt 3: Check Connection Pool

```bash
# Monitor connection pool
# Found: Pool reaches 100/100 when bug occurs

# Hypothesis: Connection exhaustion
```

### Attempt 4: Statistical Analysis

```python
# Log connection count without adding delay
connection_counts = []
connection_counts.append(get_active_connections())

# After 1000 requests:
# Mean: 85 connections
# Max: 100 connections ← At 100% pool capacity
# Bug appeared when count == 100
```

## Root Cause

Connection pool exhaustion causes timeouts. When pool is full:

- New requests wait for connection
- After 30s wait, request times out
- Original request completes and returns connection to pool
- But waiting request has already failed

## Fix

```python
# Increase pool size: 100 → 150
# Add connection timeout to prevent queue buildup
# Add monitoring to alert when pool > 80% full
```

```

## Best Practices for Heisenbugs

### DO ✅

1. **Use non-invasive diagnostics**: Ring buffers, counters
2. **Statistical reproduction**: Run tests thousands of times
3. **Match production environment**: Data volume, load, timing
4. **Document negative results**: What didn't work
5. **Use sanitizers**: ThreadSanitizer, AddressSanitizer
6. **Technical journal**: Record every attempt and result

### DON'T ❌

1. **Add heavy logging**: Changes timing, hides bug
2. **Attach debugger immediately**: Changes execution flow
3. **Make assumptions**: "It's probably a race condition"
4. **Give up after few attempts**: Heisenbugs take patience
5. **Change multiple things**: Can't identify what fixed it

## Sources

- [Debugging Heisenbugs](https://dev.to/glsolaria/debugging-heisenbugs-3mpc)
- [ThreadSanitizer Overview](https://github.com/google/sanitizers/wiki/ThreadSanitizerCppManual)
- [AddressSanitizer Overview](https://github.com/google/sanitizers/wiki/AddressSanitizer)
```
