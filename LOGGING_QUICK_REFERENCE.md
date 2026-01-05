# Quick Reference: UUID Suffix Search

## The Problem

Old log files were named like:
```
bcbc44dd-8dc6-4349-b3de-67c3ffffa826-1767495771287.log
```

Searching with suffix `fa826` didn't work! ❌

## The Solution

New log files include the suffix separately:
```
a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-a6a3b6-1767496729144.log
                                  ^^^^^^
                                  Suffix!
```

Now you can search with suffix `a6a3b6`! ✅

## Quick Commands

### Search in filenames
```bash
# Protocol transformation logs
ls logs/protocol-transformation/ | grep a6a3b6

# SSE trace logs
ls logs/sse-traces/ | grep a6a3b6

# All logs
find logs/ -name "*a6a3b6*" -type f
```

### Search in content
```bash
# Protocol transformation logs
grep -r "a6a3b6" logs/protocol-transformation/

# SSE trace logs
grep -r "a6a3b6" logs/sse-traces/

# Show matching filenames only
grep -l "a6a3b6" logs/protocol-transformation/*.log
```

## Log Format

### Protocol Transformation Logs

**Filename**: `{UUID}-{suffix}-{timestamp}.log`
```
a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-a6a3b6-1767496729144.log
```

**Content Header**:
```
╔══════════════════════════════════════════════════════════════════╗
║  Request ID: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6     (a6a3b6)      ║
║  Timestamp: 2026-01-04T03:18:49.143Z                            ║
╚══════════════════════════════════════════════════════════════════╝
```

### SSE Trace Logs

**Filename**: `{vendor}-{suffix}-{timestamp}.log`
```
openai-a6a3b6-2026-01-04T03-18-49-143Z.log
```

**Content**:
```
=== SSE Stream Log ===
Timestamp: 2026-01-04T03:18:49.143Z
Request ID: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6 (a6a3b6)
Vendor: openai
URL: https://api.openai.com/v1/chat/completions
...
```

## Testing

Test the implementation:
```bash
npx tsx scripts/test-logging-improvements.ts
```

## Example Workflow

```bash
# 1. Make an API request (get UUID from response or logs)
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{"model": "gpt-4", "messages": [{"role": "user", "content": "Hi"}]}'

# 2. Check logs directory for new files
ls -lt logs/protocol-transformation/ | head -5

# 3. Extract UUID suffix (last 6 chars)
# From: a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6
# To:   a6a3b6

# 4. Search by suffix
ls logs/protocol-transformation/ | grep a6a3b6
grep -r "a6a3b6" logs/

# 5. View the log file
less logs/protocol-transformation/a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6-a6a3b6-*.log
```

## Suffix Extraction

```bash
# From full UUID, extract last 6 characters
UUID="a4f8a777-1e45-4cf6-bd31-4e8685a6a3b6"
SUFFIX=${UUID: -6}  # Bash
echo $SUFFIX  # Output: a6a3b6

# Or using cut
echo $UUID | cut -c31-36  # Output: a6a3b6
```

## Pro Tips

1. **Use suffix for quick searches**: Only need 6 chars instead of full UUID
2. **Search both filename and content**: Use `find` and `grep` together
3. **Combine with other filters**: `find logs/ -name "*a6a3b6*" -mtime -1` (last 24 hours)
4. **View recent logs first**: `ls -lt logs/protocol-transformation/ | head -10`

## Troubleshooting

**Q: Can't find logs with suffix?**
A: Make sure you're searching for the LAST 6 characters of the UUID

**Q: Old logs don't have suffix?**
A: Old logs remain unchanged. Only NEW logs will have suffix in filename.

**Q: Suffix search doesn't work in old logs?**
A: Old logs don't have suffix in content. You can still search by full UUID.

## Summary

| What | Before | After |
|------|--------|-------|
| Filename | `{UUID}-{timestamp}.log` | `{UUID}-{suffix}-{timestamp}.log` |
| Content | `Request ID: {UUID}` | `Request ID: {UUID} ({suffix})` |
| Search | Must use full UUID | Can use 6-char suffix |

**Suffix = Last 6 characters of UUID**

That's it! Happy searching! 🎉
