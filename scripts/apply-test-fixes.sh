#!/bin/bash
# Apply test type fixes to all converter test files

TEST_DIR="src/server/module-protocol-transpiler/converters/__tests__"

# List of test files to fix
TEST_FILES=(
  "$TEST_DIR/anthropic.tool-role.test.ts"
  "$TEST_DIR/anthropic-glm-fields.test.ts"
  "$TEST_DIR/anthropic-issue-2a1098.test.ts"
  "$TEST_DIR/anthropic-issue-352ed7.test.ts"
  "$TEST_DIR/anthropic-text-field-bug.test.ts"
  "$TEST_DIR/anthropic-tool-use-blocks.test.ts"
  "$TEST_DIR/openai.streaming.test.ts"
  "$TEST_DIR/openai-to-anthropic.real-data.test.ts"
  "$TEST_DIR/responses.streaming.test.ts"
)

for file in "${TEST_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "Skipping $file (not found)"
    continue
  fi

  echo "Processing $file..."

  # Create a temporary file
  tmp_file=$(mktemp)

  # Use awk to process the file
  awk '
  BEGIN { in_test = 0; added_expect_success = 0 }

  # Import section - add expectSuccess import if not present
  /import.*from.*vitest/ && !/expectSuccess/ {
    print $0
    getline
    if ($0 !~ /expectSuccess/) {
      print "import { expectSuccess } from '"'"'../../__tests__/test-helpers'"'"';"
    }
  }

  # Start of a test
  /^[[:space:]]*it\(/ || /^[[:space:]]*test\(/ {
    in_test = 1
    added_expect_success = 0
    print $0
    next
  }

  # End of a test
  /^[[:space:]]*\}\);?$/ && in_test {
    in_test = 0
    added_expect_success = 0
    print $0
    next
  }

  # When we see expect(result.success).toBe(true), add expectSuccess line
  /expect\(result\.success\)\.toBe\(true\)/ && in_test && !added_expect_success {
    print $0
    print "      const data = expectSuccess(result);"
    added_expect_success = 1
    next
  }

  # Replace result.data with data if we have expectSuccess
  /result\.data\./ && in_test && added_expect_success {
    gsub(/result\.data\./, "data.")
    print $0
    next
  }

  # Print all other lines
  { print $0 }
  ' "$file" > "$tmp_file"

  # Replace the original file
  mv "$tmp_file" "$file"

  echo "  ✓ Fixed"
done

echo ""
echo "All test files processed!"
