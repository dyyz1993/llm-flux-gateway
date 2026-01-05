#!/usr/bin/env node
/**
 * Phase 5B: Fix remaining unused variables
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fixes = [
  // Streaming test
  { file: 'scripts/streaming-test/core/validator.ts', line: 45, name: '__chunks', prefix: true },
  { file: 'scripts/streaming-test/core/validator.ts', line: 46, name: '_fullContent', prefix: false },
  { file: 'scripts/streaming-test/scenarios/streaming-tools.scenario.ts', line: 348, name: 'toolCallChunks', prefix: true },

  // Client components - Dashboard
  { file: 'src/client/components/analytics/Dashboard.tsx', line: 123, name: 'assetStats', prefix: true },

  // Asset Manager
  { file: 'src/client/components/assets/AssetManager.tsx', line: 118, name: 'selected', prefix: true },
  { file: 'src/client/components/assets/AssetManager.tsx', line: 732, name: 'index', prefix: true },

  // Key Manager
  { file: 'src/client/components/keys/KeyManager.tsx', line: 100, name: 'handleRestore', prefix: true },
  { file: 'src/client/components/keys/KeyManager.tsx', line: 125, name: 'getRouteById', prefix: true },

  // Log Explorer
  { file: 'src/client/components/logs/LogExplorer.tsx', line: 577, name: 'TruncatedText', prefix: true },

  // Tests
  { file: 'src/client/components/playground/__tests__/ModelSelector.test.tsx', line: 122, name: 'input', prefix: true },
  { file: 'src/client/components/playground/__tests__/RoutePlayground.format.test.tsx', line: 12, name: 'renderHook', prefix: true },
  { file: 'src/client/components/playground/__tests__/RoutePlayground.format.test.tsx', line: 15, name: 'useChatStore', prefix: true },
  { file: 'src/client/components/playground/__tests__/RoutePlayground.test.tsx', line: 11, name: 'fireEvent', prefix: true },

  // Playground components
  { file: 'src/client/components/playground/ChatInput.tsx', line: 2, name: 'Copy', isImport: true },
  { file: 'src/client/components/playground/RoutePlayground.tsx', line: 2, name: 'ChevronDown', isImport: true },
  { file: 'src/client/components/playground/RoutePlayground.tsx', line: 101, name: 'setEnableTools', prefix: true },
  { file: 'src/client/components/playground/RoutePlayground.tsx', line: 102, name: 'streamingContent', prefix: true },
  { file: 'src/client/components/playground/RoutePlayground.tsx', line: 103, name: 'streamingToolCalls', prefix: true },
  { file: 'src/client/components/playground/RoutePlayground.tsx', line: 114, name: 'cancel', prefix: true },
  { file: 'src/client/components/playground/RoutePlayground.tsx', line: 293, name: 'isFirstRequest', prefix: true },

  { file: 'src/client/components/playground/SystemPromptPanel.tsx', line: 2, name: 'Check', isImport: true },
  { file: 'src/client/components/playground/SystemPromptPanel.tsx', line: 2, name: 'X', isImport: true },
  { file: 'src/client/components/playground/SystemPromptPanel.tsx', line: 76, name: 'preset', prefix: true },
  { file: 'src/client/components/playground/SystemPromptPanel.tsx', line: 99, name: 'selectedPreset', prefix: true },

  { file: 'src/client/components/routes/RouteManager.tsx', line: 5, name: 'ChevronDown', isImport: true },
  { file: 'src/client/components/routes/YamlOverrideEditor.tsx', line: 3, name: 'EditorState', isImport: true },

  { file: 'src/client/components/shared/CodeEditor.tsx', line: 3, name: 'hoverTooltip', prefix: true },
  { file: 'src/client/components/shared/CodeEditor.tsx', line: 45, name: 'minHeight', prefix: true },
  { file: 'src/client/components/shared/CodeEditor.tsx', line: 46, name: 'maxHeight', prefix: true },
  { file: 'src/client/components/shared/CodeEditor.tsx', line: 48, name: 'placeholder', prefix: true },

  { file: 'src/client/components/system/SystemSettings.tsx', line: 2, name: 'Save', isImport: true },
  { file: 'src/client/components/system/SystemSettings.tsx', line: 33, name: 'saving', prefix: true },

  { file: 'src/client/components/ui/WildcardInput.tsx', line: 4, name: 'validateInput', prefix: true },

  { file: 'src/client/components/vendors/VendorManager.tsx', line: 2, name: 'Globe', isImport: true },
  { file: 'src/client/components/vendors/VendorManager.tsx', line: 2, name: 'Eye', isImport: true },

  { file: 'src/client/components/routes/RouteManager.tsx', line: 2, name: 'Asset', isImport: true },
  { file: 'src/client/components/routes/RouteManager.tsx', line: 2, name: 'OverrideRule', isImport: true },

  { file: 'src/client/components/vendors/VendorManager.tsx', line: 3, name: 'VendorModel', isImport: true },

  { file: 'src/client/components/keys/KeyManager.tsx', line: 2, name: 'RouteConfig', isImport: true },

  { file: 'src/client/hooks/__tests__/useAIStream.test.ts', line: 7, name: 'beforeEach', isImport: true },
  { file: 'src/client/hooks/__tests__/useAIStream.test.ts', line: 7, name: 'afterEach', isImport: true },
  { file: 'src/client/hooks/__tests__/useAIStream.test.ts', line: 8, name: 'OpenAI', isImport: true },
];

function applyFix(filePath: string, fix: any): boolean {
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

    if (fix.isImport) {
      // Remove from import statement
      const importRegex = new RegExp(`,\\s*${fix.name}\\b`, 'g');
      const standaloneRegex = new RegExp(`import\\s+${fix.name}\\b`);

      if (importRegex.test(line)) {
        line = line.replace(importRegex, '');
        console.log(`  ✓ Removed from import: ${fix.name}`);
      } else if (standaloneRegex.test(line)) {
        // Check if it's a single import on its own line
        lines.splice(lineIndex, 1);
        console.log(`  ✓ Removed import line: ${fix.name}`);
        writeFileSync(fullPath, lines.join('\n'));
        return true;
      } else {
        // Might be in a multi-line import
        console.log(`  ⚠️  Could not find ${fix.name} in import`);
        return false;
      }
    } else if (fix.prefix) {
      // Add _ prefix or change __ to _
      const newName = fix.name.startsWith('__') ? `_${fix.name.substring(2)}` : `_${fix.name}`;

      // Handle function parameters
      line = line.replace(
        new RegExp(`(\\s)${fix.name}(\\s*[:,])`),
        `$1${newName}$2`
      );

      // Handle variable declarations
      line = line.replace(
        new RegExp(`(const|let|var)\\s+${fix.name}(\\s*=)`),
        `$1 ${newName}$2`
      );

      // Handle destructuring
      line = line.replace(
        new RegExp(`(\\{\\s*)${fix.name}(\\s*})`),
        `$1${newName}$2`
      );

      console.log(`  ✓ Prefixed: ${fix.name} → ${newName}`);
    }

    lines[lineIndex] = line;
    writeFileSync(fullPath, lines.join('\n'));
    return true;
  } catch (error) {
    console.error(`  ✗ Error fixing ${fix.name} in ${filePath}:`, error);
    return false;
  }
}

function main() {
  console.log('🔧 Phase 5B: Fix Remaining Unused Variables\n');
  console.log(`Applying ${fixes.length} fixes...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const fix of fixes) {
    console.log(`Fixing: ${fix.file}:${fix.line} - ${fix.name}`);
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
