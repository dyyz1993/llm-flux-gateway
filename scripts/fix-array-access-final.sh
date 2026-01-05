#!/bin/bash
# Fix array access errors by adding non-null assertions

echo "Fixing array access errors..."

# Fix result[0].property -> result[0]!.property
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/result\[\([0-9]\+\)\]\./result[\1]!./g'

# Fix array[index].property patterns
find src -name "*.test.ts" -o -name "*.test.tsx" | xargs sed -i '' 's/\([a-zA-Z_][a-zA-Z0-9_]*\)\[\([0-9]\+\)\]\./\1[\2]!./g'

echo "Done!"
