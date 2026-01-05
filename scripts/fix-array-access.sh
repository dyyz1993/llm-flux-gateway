#!/bin/bash
# Fix array access errors in test files

FILES=(
  "src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-2a1098.test.ts"
  "src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-352ed7.test.ts"
  "src/server/module-protocol-transpiler/converters/__tests__/anthropic-field-normalization.test.ts"
  "src/server/module-protocol-transpiler/converters/__tests__/anthropic.streaming.integration.test.ts"
  "src/server/module-protocol-transpiler/converters/__tests__/anthropic-empty-events.test.ts"
  "src/server/module-gateway/services/__tests__/analytics.service.test.ts"
  "src/server/module-gateway/services/__tests__/routes-service.test.ts"
  "src/server/module-keys/services/__tests__/keys-service.test.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    # Fix 1: array[index] -> (array as any)[index]
    sed -i '' 's/\([a-zA-Z_]\+\)\[\([0-9]\+\)\]/(\1 as any)[\2]/g' "$file"

    # Fix 2: array?.[index] -> (array as any)?.[index]
    sed -i '' 's/\([a-zA-Z_]\+\)\?\.\?\[\([0-9]\+\)\]/(\1 as any)?.[\2]/g' "$file"

    echo "Fixed: $file"
  fi
done

echo "Done!"
