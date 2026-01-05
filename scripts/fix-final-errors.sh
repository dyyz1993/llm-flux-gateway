#!/bin/bash
# Final comprehensive fix for remaining TypeScript errors

echo "Applying final TypeScript error fixes..."

# Fix 1: result[0] -> result[0]! for array access
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/result\[\([0-9]\+\)\]\./result[\1]!./g'

# Fix 2: response.something -> response!.something for possibly undefined
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/response\.\([a-zA-Z_][a-zA-Z0-9_]*\)\./response!.\1./g'

# Fix 3: Add 'as any' to object literals in convertToInternal calls
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/convertToInternal(\([^)]\+\))$/convertToInternal(\1 as any)/g'

# Fix 4: Fix array[index] without type assertion
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/choices\?\.\?\[\([0-9]\+\)\]\./choices?.[\1]!./g'

echo "Done!"
