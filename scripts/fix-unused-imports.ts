#!/usr/bin/env tsx
/**
 * 批量修复未使用的导入
 */

import { readFile, writeFile } from 'node:fs/promises';

interface FixRule {
  file: string;
  unusedImports: string[];
}

const fixes: FixRule[] = [
  {
    file: 'src/client/App.tsx',
    unusedImports: ['React'],
  },
  {
    file: 'src/client/components/analytics/Dashboard.tsx',
    unusedImports: ['getErrorStats', 'Legend', 'AlertCircle'],
  },
  {
    file: 'src/client/components/keys/KeyManager.tsx',
    unusedImports: ['ArrowRightIcon'],
  },
  {
    file: 'src/client/components/layout/Sidebar.tsx',
    unusedImports: ['Activity'],
  },
  {
    file: 'src/client/components/logs/LogExplorer.tsx',
    unusedImports: ['Info'],
  },
];

async function fixFile(filePath: string, unusedImports: string[]): Promise<void> {
  const content = await readFile(filePath, 'utf-8');

  let newContent = content;
  for (const imp of unusedImports) {
    // 移除未使用的导入
    const importRegex = new RegExp(
      `import\\s+\\{[^}]*\\b${imp}\\b[^}]*\\}\\s+from\\s+['"][^'']+['"];?\\s*\\n?`,
      'g'
    );
    newContent = newContent.replace(importRegex, (match) => {
      // 检查是否还有其他导入
      const innerMatch = match.match(/import\s+\{([^}]+)\}/);
      if (innerMatch) {
        const imports = innerMatch[1]
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== imp && s !== `${imp} as ${s.split(' as ')[1]}`);

        if (imports.length > 0) {
          // 保留其他导入
          const fromMatch = match.match(/from\s+['"]([^'"]+)['"]/);
          if (fromMatch) {
            return `import { ${imports.join(', ')} } from '${fromMatch[1]}';\n`;
          }
        }
      }
      // 完全移除导入行
      return '';
    });
  }

  if (newContent !== content) {
    await writeFile(filePath, newContent, 'utf-8');
    console.log(`✓ Fixed: ${filePath}`);
  } else {
    console.log(`- No changes: ${filePath}`);
  }
}

async function main() {
  console.log('=== 批量修复未使用的导入 ===\n');

  for (const fix of fixes) {
    try {
      await fixFile(fix.file, fix.unusedImports);
    } catch (error) {
      console.error(`✗ Error fixing ${fix.file}:`, error);
    }
  }

  console.log('\n修复完成!');
}

main().catch(console.error);
