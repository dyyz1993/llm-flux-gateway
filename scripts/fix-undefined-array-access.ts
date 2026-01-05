#!/usr/bin/env node
/**
 * Fix TS2532: Object is possibly 'undefined' errors
 *
 * This script fixes common patterns that cause "Object is possibly 'undefined'" errors:
 * 1. result.errors![0] -> result.errors![0]!
 * 2. data.field -> data.field!
 * 3. array[i].property -> array[i]!.property
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/Users/xuyingzhou/Downloads/llm-flux-gateway';

const filesToFix = [
  'src/server/module-protocol-transpiler/core/__tests__/protocol-transpiler.test.ts',
  'src/server/module-gateway/services/__tests__/route-matcher.service.api-key-isolation.test.ts',
  'src/server/module-gateway/controllers/__tests__/gateway-tool-calls-fallback.test.ts',
];

function fixFile(filePath) {
  const fullPath = path.join(ROOT, filePath);
  let content = fs.readFileSync(fullPath, 'utf-8');
  let modified = false;

  // Fix 1: result.errors![0] -> result.errors![0]!
  // The array access [0] can return undefined even if errors! is asserted
  content = content.replace(
    /result\.errors!\[0\]/g,
    () => {
      modified = true;
      return 'result.errors![0]!';
    }
  );

  // Fix 2: data.messages[0] -> data.messages![0] when data is already asserted
  content = content.replace(
    /(\w+)\.messages\[(\d+)\]/g,
    (match, varName, index) => {
      // Check if the variable was already asserted with 'as any' or '!'
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`const ${varName} =`) && lines[i].includes('as any')) {
          return match; // Already has type assertion
        }
      }
      // Otherwise add non-null assertion
      modified = true;
      return `${varName}.messages![${index}]`;
    }
  );

  // Fix 3: array[0].property when array might be empty
  content = content.replace(
    /(\w+)\[(\d+)\]\.(\w+)/g,
    (match, arrayName, index, prop) => {
      // Skip if already has non-null assertion
      if (match.includes('!')) return match;
      // Skip if array is result.data (already handled)
      if (arrayName === 'result.data') return match;
      // Add non-null assertion to array access
      modified = true;
      return `${arrayName}[${index}]!.${prop}`;
    }
  );

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
  } else {
    console.log(`ℹ️  No changes: ${filePath}`);
  }
}

console.log('🔧 Fixing TS2532 errors\n');

for (const file of filesToFix) {
  try {
    fixFile(file);
  } catch (error: unknown) {
    console.error(`❌ Error fixing ${file}:`, error.message);
  }
}

console.log('\n✅ Done!\n');
