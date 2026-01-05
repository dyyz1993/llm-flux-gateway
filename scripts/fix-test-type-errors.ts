#!/usr/bin/env tsx
/**
 * Fix Test Type Errors
 *
 * This script automatically fixes TypeScript errors in test files by:
 * 1. Adding the expectSuccess import
 * 2. Adding type narrowing after result.success checks
 * 3. Replacing result.data with data variable
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { glob } from 'glob';

interface FixResult {
  file: string;
  modified: boolean;
  errors: string[];
}

const results: FixResult[] = [];

function fixTestFile(filePath: string): FixResult {
  const result: FixResult = {
    file: filePath,
    modified: false,
    errors: [],
  };

  try {
    let content = readFileSync(filePath, 'utf-8');
    const originalContent = content;

    // Check if file already has expectSuccess import
    if (!content.includes("from '../../__tests__/test-helpers'") &&
        !content.includes('from "../../__tests__/test-helpers"')) {

      // Add the import after the vitest import
      content = content.replace(
        /(import \{[^}]*\} from ['"]vitest['"];)/,
        `$1\nimport { expectSuccess } from '../../__tests__/test-helpers';`
      );
    }

    // Find all test blocks and fix them
    // Pattern: find "expect(result.success).toBe(true)" followed by references to result.data
    const lines = content.split('\n');
    const fixedLines: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if this is a success check line
      if (line.includes('expect(result.success).toBe(true)')) {
        fixedLines.push(line);

        // Check if the next lines reference result.data
        // Look ahead to see if we need to add the expectSuccess line
        let j = i + 1;
        let hasDataReferences = false;
        let alreadyHasDataVariable = false;

        while (j < lines.length && j < i + 10) {
          const nextLine = lines[j];
          if (nextLine.includes('it(') || nextLine.includes('describe(') || nextLine.includes('  })')) {
            break; // End of current test block
          }
          if (nextLine.includes('result.data.')) {
            hasDataReferences = true;
          }
          if (nextLine.includes('const data =') || nextLine.includes('let data =')) {
            alreadyHasDataVariable = true;
          }
          j++;
        }

        if (hasDataReferences && !alreadyHasDataVariable) {
          // Add the expectSuccess line after the expect statement
          fixedLines.push('      const data = expectSuccess(result);');
        }

        i++;
      } else {
        // Replace result.data with data if we're in a context where data is defined
        // Check if there's a "const data = expectSuccess" earlier in this test
        const testStart = findTestStart(lines, i);
        let hasDataVariable = false;

        for (let k = testStart; k < i; k++) {
          if (lines[k].includes('const data = expectSuccess')) {
            hasDataVariable = true;
            break;
          }
        }

        if (line.includes('result.data.') && hasDataVariable) {
          fixedLines.push(line.replace(/result\.data\./g, 'data.'));
        } else {
          fixedLines.push(line);
        }
        i++;
      }
    }

    content = fixedLines.join('\n');

    if (content !== originalContent) {
      writeFileSync(filePath, content, 'utf-8');
      result.modified = true;
    }

  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

function findTestStart(lines: string[], currentIndex: number): number {
  for (let i = currentIndex; i >= 0; i--) {
    if (lines[i].includes('it(') || lines[i].includes('test(')) {
      return i;
    }
  }
  return 0;
}

async function main() {
  // Find all test files in the protocol-transpiler module
  const testFiles = await glob(
    'src/server/module-protocol-transpiler/converters/__tests__/**/*.test.ts',
    { cwd: process.cwd() }
  );

  console.log(`Found ${testFiles.length} test files to process...\n`);

  for (const file of testFiles) {
    const result = fixTestFile(file);
    results.push(result);

    if (result.modified) {
      console.log(`✓ Fixed: ${file}`);
    }
    if (result.errors.length > 0) {
      console.log(`✗ Errors in ${file}:`, result.errors);
    }
  }

  const modifiedCount = results.filter(r => r.modified).length;
  const errorCount = results.filter(r => r.errors.length > 0).length;

  console.log(`\nSummary:`);
  console.log(`  Total files: ${results.length}`);
  console.log(`  Modified: ${modifiedCount}`);
  console.log(`  Errors: ${errorCount}`);
}

main().catch(console.error);
