#!/usr/bin/env node
/**
 * Phase 5: Final Cleanup - Remove unused variables and imports
 *
 * This script fixes:
 * 1. Unused variables (add _ prefix or remove)
 * 2. Unused imports
 * 3. Remaining type errors
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Fix {
  file: string;
  line: number;
  type: 'variable' | 'import' | 'parameter';
  name: string;
  action: 'prefix' | 'remove' | 'void';
}

const fixes: Fix[] = [
  // Scripts
  {
    file: 'scripts/fix-test-type-errors-phase4c.ts',
    line: 13,
    type: 'import',
    name: 'glob',
    action: 'remove',
  },
  {
    file: 'scripts/fix-test-type-errors.ts',
    line: 12,
    type: 'import',
    name: 'join',
    action: 'remove',
  },
  {
    file: 'scripts/fix-unused-imports.ts',
    line: 7,
    type: 'import',
    name: 'glob',
    action: 'remove',
  },

  // Streaming test
  {
    file: 'scripts/streaming-test/core/validator.ts',
    line: 45,
    type: 'parameter',
    name: '_chunks',
    action: 'prefix',
  },
  {
    file: 'scripts/streaming-test/core/validator.ts',
    line: 46,
    type: 'parameter',
    name: '_fullContent',
    action: 'prefix',
  },
  {
    file: 'scripts/streaming-test/scenarios/streaming-tools.scenario.ts',
    line: 348,
    type: 'variable',
    name: '_toolCallChunks',
    action: 'prefix',
  },

  // Client components
  {
    file: 'src/client/components/analytics/Dashboard.tsx',
    line: 123,
    type: 'variable',
    name: '_assetStats',
    action: 'prefix',
  },
  {
    file: 'src/client/components/analytics/Dashboard.tsx',
    line: 389,
    type: 'parameter',
    name: '_entry',
    action: 'prefix',
  },
  {
    file: 'src/client/components/assets/AssetManager.tsx',
    line: 118,
    type: 'parameter',
    name: '_selected',
    action: 'prefix',
  },
  {
    file: 'src/client/components/assets/AssetManager.tsx',
    line: 732,
    type: 'parameter',
    name: '_index',
    action: 'prefix',
  },
  {
    file: 'src/client/components/keys/KeyManager.tsx',
    line: 6,
    type: 'import',
    name: 'ArrowRightIcon',
    action: 'remove',
  },
  {
    file: 'src/client/components/keys/KeyManager.tsx',
    line: 101,
    type: 'variable',
    name: '_handleRestore',
    action: 'prefix',
  },
  {
    file: 'src/client/components/keys/KeyManager.tsx',
    line: 126,
    type: 'variable',
    name: '_getRouteById',
    action: 'prefix',
  },
  {
    file: 'src/client/components/layout/Sidebar.tsx',
    line: 2,
    type: 'import',
    name: 'Activity',
    action: 'remove',
  },
  {
    file: 'src/client/components/logs/LogExplorer.tsx',
    line: 11,
    type: 'import',
    name: 'Info',
    action: 'remove',
  },
  {
    file: 'src/client/components/logs/LogExplorer.tsx',
    line: 113,
    type: 'parameter',
    name: '_idx',
    action: 'prefix',
  },
  {
    file: 'src/client/components/logs/LogExplorer.tsx',
    line: 577,
    type: 'import',
    name: 'TruncatedText',
    action: 'remove',
  },
  {
    file: 'src/client/components/logs/LogExplorer.tsx',
    line: 779,
    type: 'variable',
    name: '_isAssistant',
    action: 'prefix',
  },
];

function applyFix(filePath: string, fix: Fix): boolean {
  try {
    const fullPath = join(process.cwd(), filePath);
    const content = readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');

    if (fix.line > lines.length) {
      console.error(`  ⚠️  Line ${fix.line} out of range in ${filePath}`);
      return false;
    }

    const lineIndex = fix.line - 1;
    let line = lines[lineIndex];

    switch (fix.action) {
      case 'prefix':
        // Add _ prefix to variable/parameter name
        if (fix.type === 'parameter') {
          // Handle function parameters
          line = line.replace(
            new RegExp(`(\\s)${fix.name}(\\s*[:,])`),
            `$1_${fix.name}$2`
          );
        } else {
          // Handle variable declarations
          line = line.replace(
            new RegExp(`(const|let|var)\\s+${fix.name}(\\s*=)`),
            `$1 _${fix.name}$2`
          );
        }
        break;

      case 'remove':
        if (fix.type === 'import') {
          // Remove entire import line (but check for multi-line imports)
          if (line.trim().startsWith('import')) {
            // Check if import is on single line
            if (!line.includes('{\n')) {
              // Single line import - remove it
              lines.splice(lineIndex, 1);
              console.log(`  ✓ Removed import: ${fix.name}`);
              writeFileSync(fullPath, lines.join('\n'));
              return true;
            }
          } else {
            // Part of multi-line import or destructuring
            // Remove the specific import
            const before = line.substring(0, line.indexOf(fix.name));
            const after = line.substring(line.indexOf(fix.name) + fix.name.length);

            // Check if there's a comma before or after
            const hasCommaBefore = before.trim().endsWith(',');
            const hasCommaAfter = after.trim().startsWith(',');

            if (hasCommaBefore && hasCommaAfter) {
              // Both sides have commas, keep one
              line = before.replace(/,\s*$/, '') + after.replace(/^\s*,/, '');
            } else if (hasCommaBefore) {
              line = before.replace(/,\s*$/, '') + after;
            } else if (hasCommaAfter) {
              line = before + after.replace(/^\s*,/, '');
            } else {
              // No commas, might be last or only item
              line = before + after;
            }
          }
        }
        break;

      case 'void':
        // Use void expression
        line = line.replace(
          new RegExp(`(const\\s+)${fix.name}(\\s*=\\s*)(.+)`),
          `void ($3); // ${fix.name} marked as unused`
        );
        break;
    }

    lines[lineIndex] = line;
    writeFileSync(fullPath, lines.join('\n'));
    console.log(`  ✓ Fixed ${fix.type}: ${fix.name}`);
    return true;
  } catch (error) {
    console.error(`  ✗ Error fixing ${fix.name} in ${filePath}:`, error);
    return false;
  }
}

function main() {
  console.log('🔧 Phase 5: Final Cleanup\n');
  console.log(`Applying ${fixes.length} fixes...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const fix of fixes) {
    console.log(`Fixing: ${fix.file}:${fix.line} - ${fix.type} '${fix.name}'`);
    if (applyFix(fix.file, fix)) {
      successCount++;
    } else {
      failCount++;
    }
    console.log();
  }

  console.log(`\n✓ Success: ${successCount}`);
  console.log(`✗ Failed: ${failCount}`);
}

main();
