#!/usr/bin/env tsx
/**
 * Revert Problematic Fixes
 *
 * Some of the automated fixes introduced syntax errors.
 * This script reverts those specific problematic patterns.
 */

import { readFile, writeFile } from 'node:fs/promises';

const fixes = [
  {
    file: 'src/server/module-gateway/services/__tests__/analytics.service.test.ts',
    patterns: [
      { from: /\.\.\.(\w+)\[(\d+)\] as any\)/g, to: '...$1[$2]' },
      { from: /\.\.\.(\w+)\[(\d+)\]!\[(\d+)\] as any\)/g, to: '...$1[$2][$3]' },
    ]
  },
  {
    file: 'src/server/module-gateway/services/__tests__/route-matcher.service.test.ts',
    patterns: [
      { from: /\.\.\.(\w+)\[(\d+)\] as any\)/g, to: '...$1[$2]' },
      { from: /\.\.\.(\w+)\[(\d+)\]!\[(\d+)\] as any\)/g, to: '...$1[$2][$3]' },
    ]
  },
  {
    file: 'src/server/module-system/services/system-config.service.ts',
    patterns: [
      { from: /= (\w+)\.(\w+)\.(\w+)\!\./g, to: '= $1.$2.$3.' },
      { from: /(\w+)\!\.(\w+)/g, to: '$1.$2' },
    ]
  },
];

async function fixFile(filePath: string, patterns: Array<{ from: RegExp, to: string }>): Promise<void> {
  try {
    let content = await readFile(filePath, 'utf-8');
    let modified = false;

    for (const pattern of patterns) {
      const newContent = content.replace(pattern.from, pattern.to);
      if (newContent !== content) {
        content = newContent;
        modified = true;
      }
    }

    if (modified) {
      await writeFile(filePath, content, 'utf-8');
      console.log(`✅ Fixed: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error);
  }
}

async function main() {
  console.log('🔧 Reverting Problematic Fixes\n');

  for (const fix of fixes) {
    await fixFile(fix.file, fix.patterns);
  }

  console.log('\n✅ Done!');
  console.log('\n💡 Run: npx tsc --noEmit to check remaining errors');
}

main().catch(console.error);
