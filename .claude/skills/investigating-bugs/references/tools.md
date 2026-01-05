# Debugging Tools Guide

## Overview

This reference provides tool recommendations for different types of bugs.

## Tool Selection Matrix

| Bug Type            | Primary Tools       | Secondary Tools         | Strategy                  |
| ------------------- | ------------------- | ----------------------- | ------------------------- |
| **Crashes**         | GDB, LLDB           | Core dumps, System taps | Post-mortem analysis      |
| **Performance**     | perf, FlameGraphs   | pprof, Chrome DevTools  | Profile before optimizing |
| **Memory Leaks**    | Valgrind, Heaptrack | Chrome DevTools Memory  | Heap snapshot comparison  |
| **Race Conditions** | ThreadSanitizer     | Helgrind, Race detector | Detect data races         |
| **Network Issues**  | Wireshark, tcpdump  | dig, traceroute, mtr    | Packet capture & analysis |
| **Heisenbugs**      | Enhanced logging    | Statistical testing     | Low-intrusion logging     |

## Crash Analysis

### Core Dump Analysis

```bash
# Generate core dump
ulimit -c unlimited
./myapp
# When it crashes, core dump is created

# Analyze with GDB
gdb ./myapp core

# Common GDB commands
(gdb) bt           # Backtrace - show call stack
(gdb) frame 3      # Switch to frame 3
(gdb) list         # Show source code
(gdb) print var    # Print variable value
(gdb) info locals  # Show all local variables
```

### Stack Trace Analysis

```javascript
// Node.js
Error: Cannot read property 'name' of undefined
    at UserProfile.render (/src/components/UserProfile.tsx:15:11)
    at render (/node_modules/react-dom/cjs/react-dom.development.js:12345:12)
    at ...
```

**What to look for**:

1. **Exact line number**: UserProfile.tsx:15
2. **Function name**: UserProfile.render
3. **Error type**: TypeError (Cannot read property)
4. **Missing property**: 'name' of undefined

## Performance Debugging

### CPU Profiling

```bash
# Linux perf
perf record -F 99 -g -- ./myapp
perf report

# FlameGraph generation
perf script flamegraph

# Output: SVG showing call stack and time
```

### Memory Profiling

```bash
# Valgrind memory check
valgrind --leak-check=full --show-leak-kinds=all ./myapp

# Output:
# ==12345== LEAK SUMMARY:
# ==12345==    definitely lost: 48 bytes in 1 blocks
# ==12345==    indirectly lost: 0 bytes in 0 blocks
```

### Database Query Profiling

```sql
-- PostgreSQL EXPLAIN ANALYZE
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = ?;

-- Output:
-- Seq Scan on orders  (cost=0.00..12345.67 rows=1000 width=456)
--   Filter: (user_id = 'xyz')
-- → Table scan! Should use index
```

## Memory Leak Debugging

### Heap Snapshot Comparison (Chrome)

```
Initial Snapshot: 50 MB
                    ↓ After 10 operations
Final Snapshot:   75 MB

Objects created between snapshots:
- EventListener: 1,234 objects ← Likely leak!
- DOM Node: 567 objects
```

### Node.js Memory Profiling

```bash
# Start Node with profiling
node --inspect --heap-prof ./app.js

# Generate heap snapshot
# In Chrome DevTools: Memory → Take Heap Snapshot

# Analyze with v8-profiler
v8-profiler --no-preview --heap-snapshot-mode=list ./isolate-0x*-heapsnapshot-*.heapsnapshot
```

## Race Condition Debugging

### ThreadSanitizer (C/C++)

```bash
# Compile with ThreadSanitizer
gcc -fsanitize=thread -g ./test.c -o test

# Run test
./test

# Output:
# WARNING: ThreadSanitizer: data race on ...
#   Write at 0x... by thread T1
#   Previous read at 0x... by thread T2
```

### Helgrind (C/C++)

```bash
# Run with Helgrind
valgrind --tool=helgrind ./myapp

# Output:
# ==12345== Thread #2 lock order violated
# ==12345==    at 0x... in function_A
# ==12345==    by 0x... in function_B
```

## Network Debugging

### Packet Capture

```bash
# Capture HTTP traffic
tcpdump -i any -s 0 -w capture.pcap 'port 80 or port 443'

# Analyze with Wireshark
wireshark capture.pcap
```

### DNS Debugging

```bash
# Check DNS resolution
dig example.com

# Trace DNS path
dig +trace example.com

# Check DNS cache
nslookup example.com

# Query specific DNS server
dig @8.8.8.8 example.com
```

### Connectivity Testing

```bash
# Check if host is reachable
ping -c 4 example.com

# Trace network path
traceroute example.com

# Combined ping + traceroute
mtr -r -c 10 example.com
```

## Heisenbug Debugging

### Enhanced Logging Strategy

```python
# Low-overhead logging for intermittent bugs
import time
from contextlib import contextmanager

DEBUG = False

@contextmanager
def debug_log():
    if DEBUG:
        start = time.time()
        yield
        elapsed = time.time() - start
        print(f"[DEBUG] Operation took {elapsed:.3f}s")
    else:
        yield

# Usage
with debug_log():
    risky_operation()  # Only logs if DEBUG=True
```

### Statistical Reproduction

```bash
# Run test many times to catch intermittent bug
for i in {1..1000}; do
  npm test || echo "Failed on iteration $i"
done

# Look for patterns
# If failures occur at iterations 7, 14, 21, 28...
# → Pattern: Every 7th iteration fails
```

## Production Debugging Tools

### Application Performance Monitoring (APM)

| Tool          | Use Case                  | Key Features                        |
| ------------- | ------------------------- | ----------------------------------- |
| **New Relic** | Full-stack monitoring     | Error tracking, distributed tracing |
| **Datadog**   | Infrastructure + APM      | Metrics, logs, traces in one        |
| **Dynatrace** | Automatic instrumentation | PurePaths, AI root cause            |
| **Sentry**    | Error tracking            | Stack traces, breadcrumbs           |

### Log Aggregation

| Tool           | Use Case                   | Key Features                         |
| -------------- | -------------------------- | ------------------------------------ |
| **ELK Stack**  | Open-source log management | Elasticsearch, Kibana visualizations |
| **Splunk**     | Enterprise log analysis    | Powerful query language              |
| **Loki**       | Cloud-native logging       | Grafana integration                  |
| **CloudWatch** | AWS-native monitoring      | Metrics, logs, alarms                |

## Tool Quick Reference

### GDB Quick Commands

```bash
gdb ./program core
(gdb) run              # Start program
(gdb) bt               # Backtrace (stack trace)
(gdb) frame 3          # Go to frame 3
(gdb) list             # Show source
(gdb) print x          # Print variable x
(gdb) info locals      # Show local variables
(gdb) info args       # Show function arguments
(gdb) next             # Next line (step over)
(gdb) step             # Next line (step into)
(gdb) continue         # Continue execution
(gdb) quit             # Exit GDB
```

### Chrome DevTools

```
┌─────────────────────────────────────────────────────────────┐
│  Elements  Console  Sources  Network ─── Performance ──     │
│                                                             │
│  Performance Tab:                                             │
│  ├── Profiles: Capture CPU/memory usage                    │
│  ├── Memory: Heap snapshots, allocation sampling             │
│  ├── Network: Slow requests, large payloads                 │
│  └── Lighthouse: Page performance scores                    │
│                                                             │
│  Memory Panel:                                                │
│  ├── Heap Snapshot: Capture object graph                     │
│  ├── Allocation Sampling: What's allocating                 │
│  ├── Allocation Timeline: When memory allocated              │
│  └── Comparison: Compare two snapshots                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Integrated Debugging Environments

### VS Code Debugging

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Program",
      "program": "${workspaceFolder}/app.js",
      "console": "integratedTerminal"
    },
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}"
    }
  ]
}
```

### Browser DevTools Shortcuts

| Shortcut       | Action                 |
| -------------- | ---------------------- |
| `F12`          | Open DevTools          |
| `Ctrl+Shift+C` | Inspect element        |
| `Ctrl+Shift+J` | Console                |
| `Ctrl+Shift+I` | Elements               |
| `Ctrl+Shift+P` | Command menu           |
| `Ctrl+L`       | Console: Clear console |
| `Ctrl+Shift+E` | Network tab            |

## Tool Selection Decision Tree

```
         Bug Type?
              │
    ┌─────────┴─────────┐
    │                   │
  Crash              Performance
    │                   │
    ▼                   ▼
Core Dump?          Slow Request?
    │                   │
    ▼                   ▼
  GDB/LLDB          Browser DevTools
    │                   │
    │                   └─► API? ──► Database?
    │                             │         │
    │                             ▼         ▼
    │                         Profiler   EXPLAIN
    │                             │
    └─────► Memory Leak?     ──► Valgrind
          │
          ▼
     Heap Snapshot
```

## Sources

- [GDB Documentation](https://www.gnu.org/software/gdb/documentation/)
- [Chrome DevTools](https://developer.chrome.com/docs/devtools/)
- [Valgrind Manual](https://valgrind.org/docs/manual/)
- [ThreadSanitizer](https://github.com/google/sanitizers/wiki/ThreadSanitizerCppManual)
- [Top 12 Debugging Tools](https://saucelabs.com/resources/blog/best-debugging-tools)
