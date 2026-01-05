#!/usr/bin/env tsx
/**
 * Fix Type Errors in Test Files - Phase 7
 *
 * This script fixes type errors in test files by:
 * 1. Adding proper type assertions
 * 2. Adding null checks for possibly undefined values
 * 3. Fixing interface mismatches
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface FixRule {
  pattern: RegExp;
  replacement: string;
  description: string;
}

const fixes: FixRule[] = [
  // Fix max_tokens -> maxTokens
  {
    pattern: /max_tokens:\s*(\d+)/g,
    replacement: 'maxTokens: $1',
    description: 'Convert max_tokens to maxTokens',
  },
  // Fix anthropicRequest.messages possibly undefined
  {
    pattern: /expect\(anthropicRequest\.messages\)\./g,
    replacement: 'expect(anthropicRequest?.messages?).',
    description: 'Add optional chaining for anthropicRequest.messages',
  },
  // Fix anthropicRequest.messages[index] possibly undefined
  {
    pattern: /anthropicRequest\.messages\[(\d+)\](?!\?)/g,
    replacement: 'anthropicRequest.messages?[$1]?',
    description: 'Add optional chaining for array access',
  },
  // Fix data.messages possibly undefined
  {
    pattern: /expect\(data\.messages\)\./g,
    replacement: 'expect(data?.messages?).',
    description: 'Add optional chaining for data.messages',
  },
  // Fix data.messages[index] possibly undefined
  {
    pattern: /(?<![\w.])(data\.messages\[(\d+)\])(?!\?)/g,
    replacement: 'data.messages?[$2]?',
    description: 'Add optional chaining for data array access',
  },
];

async function fixFile(filePath: string): Promise<void> {
  const content = await readFile(filePath, 'utf-8');
  let fixedContent = content;
  let fixCount = 0;

  for (const fix of fixes) {
    const matches = content.match(fix.pattern);
    if (matches) {
      fixedContent = fixedContent.replace(fix.pattern, fix.replacement);
      fixCount += matches.length;
      console.log(`  Applied: ${fix.description} (${matches.length} times)`);
    }
  }

  if (fixCount > 0) {
    await writeFile(filePath, fixedContent, 'utf-8');
    console.log(`Fixed ${fixCount} errors in ${filePath}`);
  } else {
    console.log(`No fixes needed for ${filePath}`);
  }
}

async function main() {
  const files = [
    'src/server/module-protocol-transpiler/converters/__tests__/anthropic-tool-use-blocks.test.ts',
    'src/server/module-protocol-transpiler/converters/__tests__/openai-to-anthropic.real-data.test.ts',
    'src/server/module-protocol-transpiler/core/__tests__/protocol-transpiler.test.ts',
    'src/server/module-protocol-transpiler/converters/__tests__/anthropic-issue-2a1098.test.ts',
  ];

  console.log('Starting type error fixes...\n');

  for (const file of files) {
    const fullPath = resolve(process.cwd(), file);
    console.log(`\nProcessing: ${file}`);
    try {
      await fixFile(fullPath);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  console.log('\n✨ Fix complete!');
}

main().catch(console.error);
