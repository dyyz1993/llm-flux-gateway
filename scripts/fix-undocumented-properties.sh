#!/bin/bash
# Fix undocumented property access errors

echo "Fixing undocumented property access errors..."

# Fix anthropicRequest.tools[index] -> (anthropicRequest.tools as any)[index]
find src -name "*.test.ts" | xargs sed -i '' 's/anthropicRequest\.tools\?\.\?\[\([0-9]\+\)\]/(anthropicRequest.tools as any)?.[\1]/g'

# Fix anthropicRequest.messages[index] -> (anthropicRequest.messages as any)[index]
find src -name "*.test.ts" | xargs sed -i '' 's/anthropicRequest\.messages\?\.\?\[\([0-9]\+\)\]/(anthropicRequest.messages as any)?.[\1]/g'

# Fix anthropicRequest.system[index] -> (anthropicRequest.system as any)[index]
find src -name "*.test.ts" | xargs sed -i '' 's/anthropicRequest\.system\?\.\?\[\([0-9]\+\)\]/(anthropicRequest.system as any)?.[\1]/g'

echo "Done!"
