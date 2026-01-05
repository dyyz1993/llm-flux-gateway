#!/bin/bash
# Fix remaining TypeScript errors with common patterns

echo "Fixing remaining TypeScript errors..."

# Fix 1: Add non-null assertion for possibly undefined properties
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/\.metadata\?\.\([a-zA-Z_][a-zA-Z0-9_]*\)\([?.]\)\./.metadata!.\1\2./g'

# Fix 2: Add type assertion for unknown types
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/as unknown/g as any/g'

# Fix 3: Fix array indexing with type assertions
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/\([a-zA-Z_][a-zA-Z0-9_]*\)\.tools\?\.\?\[\([0-9]\+\)\]/(\1.tools as any)?.[\2]/g'

echo "Done!"
