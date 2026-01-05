#!/usr/bin/env tsx
/**
 * Fix TypeScript errors - Phase 6: TS2532 and TS18048 errors
 *
 * Strategy:
 * 1. Add non-null assertions (!) after length checks
 * 2. Add optional chaining (?) for potentially undefined values
 * 3. Add proper type guards
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/xuyingzhou/Downloads/llm-flux-gateway';

interface FileFix {
  file: string;
  fixes: Array<{
    search: RegExp;
    replace: string;
    description: string;
  }>;
}

const fixes: FileFix[] = [
  {
    file: 'src/server/module-gateway/controllers/__tests__/gateway-tool-calls-fallback.test.ts',
    fixes: [
      {
        search: /(expect\(responseToolCalls\)\.toBeDefined\(\);\s+expect\(responseToolCalls\)\.toHaveLength\(\d+\);\s+expect\(responseToolCalls)\[0\]/g,
        replace: '$1![0]',
        description: 'Add non-null assertion after length check'
      },
      {
        search: /(expect\(responseToolCalls\)\.toBeDefined\(\);\s+expect\(responseToolCalls\)\.toHaveLength\(\d+\);\s+expect\(responseToolCalls)\[1\]/g,
        replace: '$1![1]',
        description: 'Add non-null assertion for second element'
      },
      {
        search: /(expect\(responseToolCalls\)\.toHaveLength\(\d+\);\s+)(expect\(responseToolCalls)\[0\]/g,
        replace: '$1$2![0]',
        description: 'Add non-null assertion after standalone length check'
      },
      {
        search: /(expect\(responseToolCalls\)\.toHaveLength\(\d+\);\s+)(expect\(responseToolCalls)\[1\]/g,
        replace: '$1$2![1]',
        description: 'Add non-null assertion for second element (standalone check)'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/__tests__/openai.streaming.test.ts',
    fixes: [
      {
        search: /(expect\(chunks\)\.toBeDefined\();\s+expect\(chunks\.length\)\.toBeGreaterThanOrEqual\(\d+\);\s+const firstChunk = )chunks\[0\]/g,
        replace: '$1chunks![0]',
        description: 'Add non-null assertion after array length check'
      },
      {
        search: /(const firstChunk = chunks\[0\];\s+expect\(firstChunk)\.type/g,
        replace: 'const firstChunk = chunks![0];\n        expect(firstChunk!',
        description: 'Add non-null assertion for firstChunk usage'
      },
      {
        search: /(expect\(chunks\.length\)\.toBeGreaterThanOrEqual\(\d+\);\s+)(const firstChunk = chunks\[0\];)/g,
        replace: '$1const firstChunk = chunks![0];',
        description: 'Add non-null assertion on chunk assignment'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/core/__tests__/protocol-transpiler.test.ts',
    fixes: [
      {
        search: /(expect\(result\.chunks\)\.toBeDefined\();\s+expect\(result\.chunks\.length\)\.toBeGreaterThan\(0\);\s+const firstChunk = )result\.chunks\[0\]/g,
        replace: '$1result.chunks![0]',
        description: 'Add non-null assertion for result.chunks[0]'
      },
      {
        search: /(expect\(response\.content\)\.toBeDefined\();\s+expect\(response\.content\.length\)\.toBeGreaterThan\(0\);\s+const firstContent = )response\.content\[0\]/g,
        replace: '$1response.content![0]',
        description: 'Add non-null assertion for response.content[0]'
      }
    ]
  },
  {
    file: 'src/server/module-gateway/services/__tests__/route-matcher.service.api-key-isolation.test.ts',
    fixes: [
      {
        search: /(expect\(result\)\.toBeDefined\();\s+expect\(result\.matchedRoute\)\.toBeDefined\();\s+expect\(result\.matchedRoute)\.apiKeyId/g,
        replace: '$1!.apiKeyId',
        description: 'Add non-null assertion after defined check'
      },
      {
        search: /(expect\(route\)\.toBeDefined\();\s+expect\(route)\.apiKeyId/g,
        replace: '$1!.apiKeyId',
        description: 'Add non-null assertion for route property'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/gemini.converter.ts',
    fixes: [
      {
        search: /if \(([^ ]+)\.parts && ([^ ]+)\.parts\.length > 0\) \{/g,
        replace: 'if ($1.parts && $1.parts.length > 0) { const parts = $1.parts;',
        description: 'Extract parts to const for type narrowing'
      },
      {
        search: /const content = ([^ ]+)\.parts\.find\(([^)]+)\);/g,
        replace: 'const content = $1.parts?.find($2);',
        description: 'Add optional chaining to find result'
      },
      {
        search: /if \(([^ ]+)\.candidates && ([^ ]+)\.candidates\.length > 0\) \{/g,
        replace: 'if ($1.candidates && $1.candidates.length > 0) { const candidates = $1.candidates;',
        description: 'Extract candidates to const for type narrowing'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/__tests__/internal-format-validation.test.ts',
    fixes: [
      {
        search: /(expect\(response\.content\)\.toBeDefined\();\s+expect\(response\.content\.length\)\.toBeGreaterThan\(0\);\s+const firstContent = )response\.content\[0\]/g,
        replace: '$1response.content![0]',
        description: 'Add non-null assertion for content array access'
      },
      {
        search: /(expect\(message\.toolCalls\)\.toBeDefined\();\s+expect\(message\.toolCalls\.length\)\.toBeGreaterThan\(0\);\s+const firstTool = )message\.toolCalls\[0\]/g,
        replace: '$1message.toolCalls![0]',
        description: 'Add non-null assertion for toolCalls array access'
      }
    ]
  },
  {
    file: 'src/client/hooks/__tests__/useAIStream.test.ts',
    fixes: [
      {
        search: /(expect\(result\.messages\)\.toBeDefined\();\s+expect\(result\.messages\.length\)\.toBe\(2\);\s+expect\(result\.messages)\[0\]/g,
        replace: '$1![0]',
        description: 'Add non-null assertion for messages[0]'
      },
      {
        search: /(expect\(result\.messages\)\.toBeDefined\();\s+expect\(result\.messages\.length\)\.toBe\(2\);\s+expect\(result\.messages)\[1\]/g,
        replace: '$1![1]',
        description: 'Add non-null assertion for messages[1]'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/utils/__tests__/format-detector.test.ts',
    fixes: [
      {
        search: /(expect\(result\.format\)\.toBeDefined\();\s+expect\(result)\.vendor/g,
        replace: '$1!.vendor',
        description: 'Add non-null assertion for result.vendor'
      },
      {
        search: /(expect\(detection\.confidence\)\.toBeGreaterThan\(0\.5\);\s+expect\(detection)\.format/g,
        replace: '$1!.format',
        description: 'Add non-null assertion for detection.format'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/core/__tests__/conversion-integration.test.ts',
    fixes: [
      {
        search: /(expect\(result\.chunks\)\.toBeDefined\();\s+expect\(result\.chunks\.length\)\.toBeGreaterThan\(0\);\s+const firstChunk = )result\.chunks\[0\]/g,
        replace: '$1result.chunks![0]',
        description: 'Add non-null assertion for chunks array'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/interfaces/__tests__/internal-format.test.ts',
    fixes: [
      {
        search: /(expect\(message\.content\)\.toBeDefined\();\s+expect\(message\.content\.length\)\.toBeGreaterThan\(0\);\s+const firstContent = )message\.content\[0\]/g,
        replace: '$1message.content![0]',
        description: 'Add non-null assertion for content array'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/__tests__/anthropic-tool-use-blocks.test.ts',
    fixes: [
      {
        search: /(expect\(response\.content\)\.toBeDefined\();\s+expect\(response\.content\.length\)\.toBe\(2\);\s+const toolUse = )response\.content\.find\(([^)]+)\) as any;/g,
        replace: '$1response.content!.find($2) as any;',
        description: 'Add non-null assertion for content.find'
      }
    ]
  },
  {
    file: 'src/server/module-gateway/services/__tests__/analytics.service.test.ts',
    fixes: [
      {
        search: /(expect\(result\)\.toBeDefined\();\s+expect\(result)\.totalTokens/g,
        replace: '$1!.totalTokens',
        description: 'Add non-null assertion for result properties'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/__tests__/anthropic.streaming.integration.test.ts',
    fixes: [
      {
        search: /(expect\(chunks\.length\)\.toBeGreaterThan\(0\);\s+const firstChunk = )chunks\[0\]/g,
        replace: '$1chunks![0]',
        description: 'Add non-null assertion for chunks[0]'
      }
    ]
  },
  {
    file: 'src/client/components/playground/ChatMessageItem.tsx',
    fixes: [
      {
        search: /const nextMessage = messages\[index \+ 1\];/g,
        replace: 'const nextMessage = messages[index + 1];',
        description: 'Keep nextMessage as potentially undefined'
      },
      {
        search: /if \(nextMessage\) \{\s+if \(\2nextMessage\.role === 'user'\)/g,
        replace: 'if (nextMessage?.role === \'user\') {',
        description: 'Use optional chaining for nextMessage checks'
      },
      {
        search: /className=\{[^}]*nextMessage[^}]*\}/g,
        replace: (match) => match.replace(/nextMessage\./g, 'nextMessage?.'),
        description: 'Add optional chaining to nextMessage in className'
      }
    ]
  },
  {
    file: 'src/client/components/playground/RoutePlayground.tsx',
    fixes: [
      {
        search: /const routes = key\.routes \|\| \[\];/g,
        replace: 'const routes = key.routes ?? [];',
        description: 'Use nullish coalescing for routes'
      },
      {
        search: /\{selectedKey\.routes\?\.map/g,
        replace: '{selectedKey?.routes?.map',
        description: 'Add optional chaining for selectedKey'
      }
    ]
  },
  {
    file: 'src/client/components/logs/LogExplorer.tsx',
    fixes: [
      {
        search: /const info = detailedInfo\.get\(logId\);/g,
        replace: 'const info = detailedInfo.get(logId);',
        description: 'Keep info as potentially undefined'
      },
      {
        search: /info\.model,/g,
        replace: 'info?.model,',
        description: 'Add optional chaining for info.model'
      },
      {
        search: /info\.vendor,/g,
        replace: 'info?.vendor,',
        description: 'Add optional chaining for info.vendor'
      },
      {
        search: /info\.latency/g,
        replace: 'info?.latency',
        description: 'Add optional chaining for info.latency'
      }
    ]
  },
  {
    file: 'src/client/components/analytics/Dashboard.tsx',
    fixes: [
      {
        search: /const percent = \(asset\.\w+ \/ total\* 100\);/g,
        replace: (match) => match.replace(/const percent = /, 'const percent = '),
        description: 'Keep percent calculation but add check'
      },
      {
        search: /(\(asset\.\w+ \/ total\) \* 100)/g,
        replace: '($1 ?? 0)',
        description: 'Add nullish coalescing to percent calculation'
      }
    ]
  },
  {
    file: 'src/client/hooks/useAIStream.ts',
    fixes: [
      {
        search: /if \(anthropicTools\) \{\s+return /g,
        replace: 'if (anthropicTools) {\n        return ',
        description: 'Keep anthropicTools check as is'
      },
      {
        search: /anthropicTools\.map/g,
        replace: 'anthropicTools?.map',
        description: 'Add optional chaining for anthropicTools'
      }
    ]
  },
  {
    file: 'src/client/services/chatStorage.ts',
    fixes: [
      {
        search: /const lastMessage = messages\[messages\.length - 1\];/g,
        replace: 'const lastMessage = messages[messages.length - 1];',
        description: 'Keep lastMessage as potentially undefined'
      },
      {
        search: /if \(lastMessage\) \{\s+lastMessage\./g,
        replace: 'if (lastMessage) {\n        lastMessage?.',
        description: 'Add optional chaining for lastMessage properties'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/core/protocol-transpiler.ts',
    fixes: [
      {
        search: /if \(!convertedChunks\) \{\s+throw new Error/g,
        replace: 'if (!convertedChunks) {\n        throw new Error',
        description: 'Keep convertedChunks null check'
      },
      {
        search: /return \{[\s\S]*?chunks: convertedChunks,/g,
        replace: (match) => match.replace(/chunks: convertedChunks,/, 'chunks: convertedChunks!,'),
        description: 'Add non-null assertion after null check'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/responses.converter.ts',
    fixes: [
      {
        search: /if \(textDelta\) \{\s+result\.content\.push\(/g,
        replace: 'if (textDelta) {\n        result.content!.push(',
        description: 'Add non-null assertion for content push'
      }
    ]
  }
];

function applyFixes(filePath: string, fileFixes: FileFix): boolean {
  const fullPath = join(ROOT, filePath);
  let content = readFileSync(fullPath, 'utf-8');
  let modified = false;

  for (const fix of fileFixes.fixes) {
    const newContent = content.replace(fix.search, fix.replace);
    if (newContent !== content) {
      console.log(`  ✓ Applied: ${fix.description}`);
      modified = true;
      content = newContent;
    }
  }

  if (modified) {
    writeFileSync(fullPath, content, 'utf-8');
    console.log(`✓ Fixed ${filePath}`);
  }

  return modified;
}

function main() {
  console.log('🔧 Applying TypeScript fixes - Phase 6\n');

  let fixedCount = 0;

  for (const fileFix of fixes) {
    try {
      if (applyFixes(fileFix.file, fileFix)) {
        fixedCount++;
      }
    } catch (error) {
      console.error(`✗ Error fixing ${fileFix.file}:`, error);
    }
  }

  console.log(`\n✓ Fixed ${fixedCount} files`);
  console.log('\n📝 Next steps:');
  console.log('  1. Run: npx tsc --noEmit');
  console.log('  2. Review remaining errors');
  console.log('  3. Create Phase 7 fixes if needed');
}

main();
