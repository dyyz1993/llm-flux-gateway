#!/bin/bash
# Fix common TypeScript errors in test files

echo "Fixing common TypeScript errors..."

# Fix 1: result.metadata is possibly undefined -> result.metadata!
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/result\.metadata\([?.]\)/result.metadata!\1/g'

# Fix 2: Add "as any" to object literals in convertToInternal calls
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/convertToInternal(\([{}]/convertToInternal(\1 as any/g'

# Fix 3: Fix array access errors with specific patterns
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/anthropicRequest\.system\?\.\?\[\([0-9]\+\)\]/(anthropicRequest.system as any)?.[\1]/g'
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/anthropicRequest\.messages\?\.\?\[\([0-9]\+\)\]/(anthropicRequest.messages as any)?.[\1]/g'
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/anthropicRequest\.tools\?\.\?\[\([0-9]\+\)\]/(anthropicRequest.tools as any)?.[\1]/g'

echo "Done!"
