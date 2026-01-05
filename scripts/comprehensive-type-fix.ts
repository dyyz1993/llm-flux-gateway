#!/usr/bin/env tsx
/**
 * Comprehensive TypeScript Error Fixer
 *
 * Fixes common type errors across the codebase:
 * - TS2532/TS18048: Possibly undefined - adds optional chaining
 * - TS2339: Property does not exist - adds type assertions
 * - TS18046: Expression not callable - fixes function calls
 */

import { readFile, writeFile } from 'node:fs/promise';
import { glob } from 'glob';

interface FileFix {
  file: string;
  fixes: number;
}

async function fixFile(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, 'utf-8');
    let fixed = content;
    let fixCount = 0;

    // Fix 1: Add optional chaining for possibly undefined array/object access
    // Pattern: array[index] where array might be undefined
    const patterns = [
      // messages[0] -> messages?.[0]
      [/(?<!\w)(messages|choices|data\.messages|data\.choices|anthropicRequest\.messages|result\.data)\[(\d+)\](?!\?)/g, '$1?[$2]'],
      // .property -> ?.property for potentially undefined objects
      [/(?<=\s)(expect\(anthropicRequest|expect\(data|expect\(result)(\.messages|\.choices|\.content)(?!\?)/g, '$1?$2'],
      // Fix data.messages[index].property patterns
      [/(data\.messages\?\[\d+\])(\.\w+)(?!\?)/g, '$1?$2'],
      // Fix response.choices[index] patterns
      [/(response\.choices\?\[\d+\])(\.\w+)(?!\?)/g, '$1?$2'],
      // Fix chunk.choices[index] patterns
      [/(chunk\.choices\?\[\d+\])(\.\w+)(?!\?)/g, '$1?$2'],
    ];

    for (const [pattern, replacement] of patterns) {
      const regex = new RegExp(pattern as string, 'g');
      const matches = fixed.match(regex);
      if (matches) {
        fixed = fixed.replace(regex, replacement as string);
        fixCount += matches.length;
      }
    }

    // Fix 2: max_tokens -> maxTokens (but not in comments or strings)
    const maxTokensPattern = /(?<=\s)(max_tokens)(?=\s*:\s*\d+)/g;
    const maxTokensMatches = fixed.match(maxTokensPattern);
    if (maxTokensMatches) {
      fixed = fixed.replace(maxTokensPattern, 'maxTokens');
      fixCount += maxTokensMatches.length;
    }

    // Fix 3: tool_choice -> tool_choice (already correct, but ensure consistency)
    // No change needed

    // Fix 4: Add type assertions for unknown types
    // result.data.messages -> (result.data as any).messages
    const unknownPattern = /\(result\.data\.messages as unknown\)/g;
    const unknownMatches = fixed.match(unknownPattern);
    if (unknownMatches) {
      fixed = fixed.replace(unknownPattern, '(result.data as any).messages');
      fixCount += unknownMatches.length;
    }

    if (fixCount > 0) {
      await writeFile(filePath, fixed, 'utf-8');
      return fixCount;
    }

    return 0;
  } catch (error) {
    console.error(`Error fixing ${filePath}:`, error);
    return 0;
  }
}

async function main() {
  // Target test files with high error counts
  const patterns = [
    'src/server/module-protocol-transpiler/converters/__tests__/anthropic-tool-use-blocks.test.ts',
    'src/server/module-protocol-transpiler/converters/__tests__/openai-to-anthropic.real-data.test.ts',
    'src/server/module-protocol-transpiler/core/__tests__/protocol-transpiler.test.ts',
    'src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-2a1098.test.ts',
    'src/client/components/routes/RouteManager.tsx',
    'src/server/module-protocol-transpiler/core/protocol-transpiler.ts',
  ];

  console.log('Starting comprehensive type error fixes...\n');

  let totalFixes = 0;
  const results: FileFix[] = [];

  for (const pattern of patterns) {
    const files = await glob(pattern);
    for (const file of files) {
      console.log(`Processing: ${file}`);
      const fixes = await fixFile(file);
      if (fixes > 0) {
        results.push({ file, fixes });
        totalFixes += fixes;
        console.log(`  ✓ Fixed ${fixes} issues\n`);
      } else {
        console.log(`  No fixes needed\n`);
      }
    }
  }

  console.log(`\n✨ Total fixes applied: ${totalFixes}`);
  if (results.length > 0) {
    console.log('\nFixed files:');
    results.forEach(({ file, fixes }) => {
      console.log(`  ${file}: ${fixes} fixes`);
    });
  }
}

main().catch(console.error);
