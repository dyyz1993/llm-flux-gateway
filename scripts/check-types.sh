#!/usr/bin/env bash
echo "🔍 Checking TypeScript types..."

# Run type check and save output
npx tsc --noEmit 2>&1 | tee scripts/type-errors.log

# Count errors
ERROR_COUNT=$(grep "error TS" scripts/type-errors.log | wc -l | tr -d ' ')

echo ""
echo "Found $ERROR_COUNT type errors"

# Count by file
echo ""
echo "Errors by file:"
echo "================"
grep "error TS" scripts/type-errors.log | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -20

echo ""
echo "Top 10 files with most errors:"
grep "error TS" scripts/type-errors.log | cut -d'(' -f1 | sort | uniq -c | sort -rn | head -10

echo ""
echo "Full report saved to: scripts/type-errors.log"
