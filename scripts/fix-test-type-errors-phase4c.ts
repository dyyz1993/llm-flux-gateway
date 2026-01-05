#!/usr/bin/env tsx
/**
 * Fix Phase 4C: Test Type Errors
 *
 * This script fixes type errors in test files by:
 * 1. Replacing result.data with expectSuccess(result)
 * 2. Adding optional chaining (?.) for potentially undefined fields
 * 3. Ensuring proper type guards are used
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface FixPattern {
  testFile: string;
  patterns: Array<{
    description: string;
    regex: RegExp;
    replacement: string;
  }>;
}

const fixes: FixPattern[] = [
  {
    testFile: 'src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-2a1098.test.ts',
    patterns: [
      {
        description: 'Use expectSuccess instead of result.data',
        regex: /const anthropicRequest = result\.data;/g,
        replacement: 'const anthropicRequest = expectSuccess(result);',
      },
      {
        description: 'Add optional chaining for system[0]',
        regex: /expect\(anthropicRequest\.system\[0\]\)\.toHaveProperty/g,
        replacement: 'expect(anthropicRequest.system?.[0])?.toHaveProperty',
      },
      {
        description: 'Add optional chaining for system[0].cache_control',
        regex: /expect\(anthropicRequest\.system\[0\]\.cache_control\.type\)\.toBe/g,
        replacement: 'expect(anthropicRequest.system?.[0]?.cache_control?.type).toBe',
      },
      {
        description: 'Add optional chaining for system[1]',
        regex: /expect\(anthropicRequest\.system\[1\]\)\.toHaveProperty/g,
        replacement: 'expect(anthropicRequest.system?.[1])?.toHaveProperty',
      },
      {
        description: 'Add optional chaining for system[1].cache_control',
        regex: /expect\(anthropicRequest\.system\[1\]\.cache_control\.type\)\.toBe/g,
        replacement: 'expect(anthropicRequest.system?.[1]?.cache_control?.type).toBe',
      },
    ],
  },
];

async function applyFixes() {
  let totalFixes = 0;

  for (const fix of fixes) {
    const filePath = join(process.cwd(), fix.testFile);

    try {
      let content = readFileSync(filePath, 'utf-8');
      let fileFixes = 0;

      for (const pattern of fix.patterns) {
        const matches = content.match(pattern.regex);
        if (matches) {
          content = content.replace(pattern.regex, pattern.replacement);
          fileFixes += matches.length;
          console.log(`  ✓ ${pattern.description}: ${matches.length} occurrence(s)`);
        }
      }

      if (fileFixes > 0) {
        writeFileSync(filePath, content, 'utf-8');
        console.log(`✓ Fixed ${fileFixes} issues in ${fix.testFile}`);
        totalFixes += fileFixes;
      }
    } catch (error) {
      console.error(`✗ Error processing ${fix.testFile}:`, error);
    }
  }

  console.log(`\nTotal fixes applied: ${totalFixes}`);
}

applyFixes().catch(console.error);
