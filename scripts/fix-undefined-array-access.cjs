#!/usr/bin/env node
/**
 * Fix TS2532: Object is possibly 'undefined' errors
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
  content = content.replace(
    /result\.errors!\[0\]/g,
    () => {
      modified = true;
      return 'result.errors![0]!';
    }
  );

  // Fix 2: result.errors[0] -> result.errors![0]!
  content = content.replace(
    /result\.errors\[[0-9]+\]/g,
    (match) => {
      if (match.includes('!')) return match;
      modified = true;
      return match.replace('errors[', 'errors![');
    }
  );

  // Fix 3: errors[0] when errors is an array parameter
  content = content.replace(
    /errors\[0\]\.code/g,
    () => {
      modified = true;
      return 'errors[0]!.code';
    }
  );

  content = content.replace(
    /errors\[0\]\.message/g,
    () => {
      modified = true;
      return 'errors[0]!.message';
    }
  );

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
    return 1;
  } else {
    console.log(`ℹ️  No changes: ${filePath}`);
    return 0;
  }
}

console.log('🔧 Fixing TS2532 errors\n');

let fixedCount = 0;
for (const file of filesToFix) {
  try {
    fixedCount += fixFile(file);
  } catch (error) {
    console.error(`❌ Error fixing ${file}:`, error.message);
  }
}

console.log(`\n✅ Done! Fixed ${fixedCount} files\n`);
