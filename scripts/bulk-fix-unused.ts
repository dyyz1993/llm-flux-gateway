#!/usr/bin/env tsx
/**
 * 批量修复未使用的变量和导入
 */

import { readFile, writeFile } from 'node:fs/promises';

interface FileFix {
  filePath: string;
  line: number;
  char: number;
  variable: string;
}

async function getAllTS6133Errors(): Promise<FileFix[]> {
  const { execSync } = await import('node:child_process');
  const output = execSync('npx tsc --noEmit 2>&1', { encoding: 'utf-8' });

  const errors: FileFix[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    if (line.includes("error TS6133:")) {
      // Extract file path and line number
      const match = line.match(/^([^(]+)\((\d+),(\d+)\): error TS6133: '([^']+)' is declared but/);
      if (match) {
        errors.push({
          filePath: match[1],
          line: parseInt(match[2]),
          char: parseInt(match[3]),
          variable: match[4],
        });
      }
    }
  }

  return errors;
}

async function fixFile(filePath: string, errors: FileFix[]): Promise<void> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // Group errors by line
  const errorsByLine = new Map<number, FileFix[]>();
  for (const error of errors) {
    if (!errorsByLine.has(error.line)) {
      errorsByLine.set(error.line, []);
    }
    errorsByLine.get(error.line)!.push(error);
  }

  let modified = false;
  const newLines = [...lines];

  // Process each line with errors
  for (const [lineNum, lineErrors] of errorsByLine.entries()) {
    const lineIndex = lineNum - 1;
    const line = lines[lineIndex];

    for (const error of lineErrors) {
      const trimmedLine = line.trim();

      // Case 1: Unused import (e.g., "import { foo, bar } from 'module'")
      if (trimmedLine.startsWith('import {') || trimmedLine.startsWith('import type {')) {
        const importMatch = trimmedLine.match(/import\s+(type\s+)?\{([^}]+)\}\s+from/);
        if (importMatch) {
          const imports = importMatch[2]
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== error.variable && !s.startsWith(`${error.variable} as`));

          if (imports.length === 0) {
            // Remove entire import line
            newLines[lineIndex] = '';
          } else {
            // Update import line
            const typeKeyword = importMatch[1] || '';
            const fromMatch = trimmedLine.match(/from\s+['"][^'"]+['"]/);
            if (fromMatch) {
              newLines[lineIndex] = trimmedLine.replace(
                importMatch[0],
                `import ${typeKeyword}{ ${imports.join(', ')} } from`
              );
            }
          }
          modified = true;
        }
      }
      // Case 2: Unused variable declaration (e.g., "const foo = ...")
      else if (trimmedLine.startsWith('const ') || trimmedLine.startsWith('let ') || trimmedLine.startsWith('var ')) {
        const varMatch = trimmedLine.match(/^(const|let|var)\s+([^=\s]+)\s*=/);
        if (varMatch && varMatch[2] === error.variable) {
          // Comment out the line
          newLines[lineIndex] = `// ${line}`;
          modified = true;
        }
      }
      // Case 3: Variable in destructuring
      else if (trimmedLine.includes('{') && trimmedLine.includes(error.variable)) {
        // Comment out the unused variable in destructuring
        newLines[lineIndex] = line.replace(
          new RegExp(`\\b${error.variable}\\b`, 'g'),
          `/* ${error.variable} */`
        );
        modified = true;
      }
    }
  }

  if (modified) {
    await writeFile(filePath, newLines.join('\n'), 'utf-8');
    console.log(`✓ Fixed: ${filePath} (${errors.length} errors)`);
  } else {
    console.log(`- Skipped: ${filePath} (no automatic fix available)`);
  }
}

async function main() {
  console.log('=== 批量修复未使用的变量 ===\n');

  const errors = await getAllTS6133Errors();
  console.log(`找到 ${errors.length} 个未使用变量错误\n`);

  // Group errors by file
  const errorsByFile = new Map<string, FileFix[]>();
  for (const error of errors) {
    if (!errorsByFile.has(error.filePath)) {
      errorsByFile.set(error.filePath, []);
    }
    errorsByFile.get(error.filePath)!.push(error);
  }

  // Fix each file
  for (const [filePath, fileErrors] of errorsByFile.entries()) {
    try {
      await fixFile(filePath, fileErrors);
    } catch (error) {
      console.error(`✗ Error fixing ${filePath}:`, error);
    }
  }

  console.log('\n修复完成!');
  console.log(`\n提示: 某些复杂情况可能需要手动修复`);
}

main().catch(console.error);
