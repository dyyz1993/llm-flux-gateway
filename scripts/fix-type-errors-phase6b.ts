#!/usr/bin/env tsx
/**
 * Fix TypeScript errors - Phase 6b: Batch fix for common patterns
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = '/Users/xuyingzhou/Downloads/llm-flux-gateway';

interface FileFix {
  file: string;
  replacements: Array<{
    search: string | RegExp;
    replace: string;
    description: string;
  }>;
}

const fixes: FileFix[] = [
  {
    file: 'src/server/module-protocol-transpiler/core/__tests__/protocol-transpiler.test.ts',
    replacements: [
      {
        search: /const firstChunk = result\.chunks\[0\];/g,
        replace: 'const firstChunk = result.chunks![0];',
        description: 'Add non-null assertion for result.chunks[0]'
      },
      {
        search: /const firstContent = response\.content\[0\];/g,
        replace: 'const firstContent = response.content![0];',
        description: 'Add non-null assertion for response.content[0]'
      }
    ]
  },
  {
    file: 'src/server/module-gateway/services/__tests__/route-matcher.service.api-key-isolation.test.ts',
    replacements: [
      {
        search: /expect\(result\.matchedRoute\)\.apiKeyId/g,
        replace: 'expect(result.matchedRoute)!.apiKeyId',
        description: 'Add non-null assertion for matchedRoute'
      },
      {
        search: /expect\(route\)\.apiKeyId/g,
        replace: 'expect(route)!.apiKeyId',
        description: 'Add non-null assertion for route'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/gemini.converter.ts',
    replacements: [
      {
        search: /if \(([^ ]+)\.parts && ([^ ]+)\.parts\.length > 0\) \{/g,
        replace: 'if ($1.parts && $1.parts.length > 0) { const parts = $1.parts;',
        description: 'Extract parts to const'
      },
      {
        search: /const content = ([^ ]+)\.parts\.find\(([^)]+)\);/g,
        replace: 'const content = $1.parts?.find($2);',
        description: 'Add optional chaining to find'
      },
      {
        search: /if \(([^ ]+)\.candidates && ([^ ]+)\.candidates\.length > 0\) \{/g,
        replace: 'if ($1.candidates && $1.candidates.length > 0) { const candidates = $1.candidates;',
        description: 'Extract candidates to const'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/__tests__/internal-format-validation.test.ts',
    replacements: [
      {
        search: /const firstContent = response\.content\[0\];/g,
        replace: 'const firstContent = response.content![0];',
        description: 'Add non-null assertion for content[0]'
      },
      {
        search: /const firstTool = message\.toolCalls\[0\];/g,
        replace: 'const firstTool = message.toolCalls![0];',
        description: 'Add non-null assertion for toolCalls[0]'
      }
    ]
  },
  {
    file: 'src/client/hooks/__tests__/useAIStream.test.ts',
    replacements: [
      {
        search: /expect\(result\.messages\[0\]\)/g,
        replace: 'expect(result.messages![0])',
        description: 'Add non-null assertion for messages[0]'
      },
      {
        search: /expect\(result\.messages\[1\]\)/g,
        replace: 'expect(result.messages![1])',
        description: 'Add non-null assertion for messages[1]'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/utils/__tests__/format-detector.test.ts',
    replacements: [
      {
        search: /expect\(result\)\.vendor/g,
        replace: 'expect(result)!.vendor',
        description: 'Add non-null assertion for result'
      },
      {
        search: /expect\(detection\)\.format/g,
        replace: 'expect(detection)!.format',
        description: 'Add non-null assertion for detection'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/core/__tests__/conversion-integration.test.ts',
    replacements: [
      {
        search: /const firstChunk = result\.chunks\[0\];/g,
        replace: 'const firstChunk = result.chunks![0];',
        description: 'Add non-null assertion for chunks[0]'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/interfaces/__tests__/internal-format.test.ts',
    replacements: [
      {
        search: /const firstContent = message\.content\[0\];/g,
        replace: 'const firstContent = message.content![0];',
        description: 'Add non-null assertion for content[0]'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/__tests__/anthropic-tool-use-blocks.test.ts',
    replacements: [
      {
        search: /const toolUse = response\.content\.find\(([^)]+)\) as any;/g,
        replace: 'const toolUse = response.content!.find($1) as any;',
        description: 'Add non-null assertion for content.find'
      }
    ]
  },
  {
    file: 'src/server/module-gateway/services/__tests__/analytics.service.test.ts',
    replacements: [
      {
        search: /expect\(result\)\.totalTokens/g,
        replace: 'expect(result)!.totalTokens',
        description: 'Add non-null assertion for result'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/__tests__/anthropic.streaming.integration.test.ts',
    replacements: [
      {
        search: /const firstChunk = chunks\[0\];/g,
        replace: 'const firstChunk = chunks![0];',
        description: 'Add non-null assertion for chunks[0]'
      }
    ]
  },
  {
    file: 'src/client/components/playground/ChatMessageItem.tsx',
    replacements: [
      {
        search: /if \(nextMessage\) \{\s+if \(nextMessage\.role === 'user'\)/g,
        replace: 'if (nextMessage?.role === \'user\') {',
        description: 'Use optional chaining for nextMessage'
      },
      {
        search: /nextMessage\.role/g,
        replace: 'nextMessage?.role',
        description: 'Add optional chaining for nextMessage.role'
      }
    ]
  },
  {
    file: 'src/client/components/playground/RoutePlayground.tsx',
    replacements: [
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
    replacements: [
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
    replacements: [
      {
        search: /const percent = \(([^)]+)\);/g,
        replace: 'const percent = ($1) ?? 0;',
        description: 'Add nullish coalescing for percent'
      }
    ]
  },
  {
    file: 'src/client/hooks/useAIStream.ts',
    replacements: [
      {
        search: /return anthropicTools\.map/g,
        replace: 'return anthropicTools?.map',
        description: 'Add optional chaining for anthropicTools'
      }
    ]
  },
  {
    file: 'src/client/services/chatStorage.ts',
    replacements: [
      {
        search: /if \(lastMessage\) \{\s+lastMessage\./g,
        replace: 'if (lastMessage) {\n        lastMessage?.',
        description: 'Add optional chaining for lastMessage'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/core/protocol-transpiler.ts',
    replacements: [
      {
        search: /chunks: convertedChunks,/g,
        replace: 'chunks: convertedChunks!,',
        description: 'Add non-null assertion for convertedChunks'
      }
    ]
  },
  {
    file: 'src/server/module-protocol-transpiler/converters/responses.converter.ts',
    replacements: [
      {
        search: /result\.content\.push\(/g,
        replace: 'result.content!.push(',
        description: 'Add non-null assertion for content push'
      }
    ]
  }
];

function applyFixes(filePath: string, fileFix: FileFix): boolean {
  const fullPath = join(ROOT, filePath);
  let content = readFileSync(fullPath, 'utf-8');
  let modified = false;

  for (const fix of fileFix.replacements) {
    const _searchStr = typeof fix.search === 'string' ? fix.search : fix.search.source;
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
  console.log('🔧 Applying TypeScript fixes - Phase 6b\n');

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
}

main();
