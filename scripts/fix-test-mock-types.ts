#!/usr/bin/env tsx
/**
 * Fix test mock data type errors
 *
 * This script fixes type errors in test files by:
 * 1. Adding type assertions to mock data objects
 * 2. Adding non-null assertions for result.data
 * 3. Adding type assertions for array access
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = '/Users/xuyingzhou/Downloads/llm-flux-gateway';

const files = [
  'src/server/module-protocol-transpiler/converters/__tests__/anthropic-tool-use-blocks.test.ts',
  'src/server/module-protocol-transpiler/converters/__tests__/openai-to-anthropic.real-data.test.ts',
];

async function fixFile(filePath: string): Promise<void> {
  const fullPath = join(ROOT, filePath);
  let content = await readFile(fullPath, 'utf-8');
  let modified = false;

  // Fix 1: Add InternalRequest type to mock request objects
  // Pattern: const request = { model: ... messages: ... maxTokens: ... };
  const requestPattern = /const request = \{[\s\S]*?maxTokens: \d+,\s*\};/g;
  content = content.replace(requestPattern, (match) => {
    if (match.includes('InternalRequest') || match.includes(': any')) {
      return match;
    }
    modified = true;
    return match.replace('const request = {', 'const request: InternalRequest = {');
  });

  // Fix 2: Add non-null assertion for result.data when accessing anthropicRequest
  content = content.replace(
    /const anthropicRequest = result\.data;/g,
    () => {
      modified = true;
      return 'const anthropicRequest = result.data!;';
    }
  );

  // Fix 3: Add type assertion for data.messages[1] -> assistantMsg
  content = content.replace(
    /const assistantMsg = data\.messages\[1\];/g,
    () => {
      modified = true;
      return 'const assistantMsg = (data.messages as any)[1];';
    }
  );

  // Fix 4: Add type assertion for data.messages[2] -> thirdMessage
  content = content.replace(
    /const thirdMessage = data\.messages\[2\];/g,
    () => {
      modified = true;
      return 'const thirdMessage = (data.messages as any)[2];';
    }
  );

  // Fix 5: Add type assertion for toolResultMessage
  content = content.replace(
    /const toolResultMessage = data\.messages\[2\];/g,
    () => {
      modified = true;
      return 'const toolResultMessage = (data.messages as any)[2];';
    }
  );

  // Fix 6: Add type assertion for assistantMessage
  content = content.replace(
    /const assistantMessage = data\.messages\[1\];/g,
    () => {
      modified = true;
      return 'const assistantMessage = (data.messages as any)[1];';
    }
  );

  // Fix 7: Add type assertion for anthropicRequest.messages[1]
  content = content.replace(
    /const assistantMsg = anthropicRequest\.messages\[1\];/g,
    () => {
      modified = true;
      return 'const assistantMsg = (anthropicRequest.messages as any)[1];';
    }
  );

  // Fix 8: Add any type to mock input objects
  const inputPattern = /const input = \{[\s\S]*?\}\];\s*\}\]/g;
  content = content.replace(inputPattern, (match) => {
    if (match.includes(': any')) {
      return match;
    }
    modified = true;
    return match.replace('const input = {', 'const input: any = {');
  });

  // Fix 9: Add type assertion for data.tools.find
  content = content.replace(
    /const webSearchTool = data\.tools\.find\(/g,
    () => {
      modified = true;
      return 'const webSearchTool = (data.tools as any[]).find(';
    }
  );

  // Fix 10: Add type assertion for data.tools[0]
  content = content.replace(
    /expect\(data\.tools\[0\]\)/g,
    () => {
      modified = true;
      return 'expect((data.tools as any)[0])';
    }
  );

  // Fix 11: Add type assertion for data.tools
  content = content.replace(
    /expect\(data\.tools\)/g,
    () => {
      modified = true;
      return 'expect(data.tools as any)';
    }
  );

  // Fix 12: Add type assertion for data.tools[0].input_schema
  content = content.replace(
    /expect\(data\.tools\[0\]\)\.toHaveProperty\('input_schema'\)/g,
    () => {
      modified = true;
      return "expect((data.tools as any)[0]).toHaveProperty('input_schema')";
    }
  );

  // Fix 13: Add type assertion for schema access
  content = content.replace(
    /const schema = data\.tools\[0\]\.input_schema;/g,
    () => {
      modified = true;
      return 'const schema = (data.tools as any)[0].input_schema;';
    }
  );

  // Fix 14: Add type assertion for props access
  content = content.replace(
    /const props = data\.tools\[0\]\.input_schema\.properties;/g,
    () => {
      modified = true;
      return 'const props = (data.tools as any)[0].input_schema.properties;';
    }
  );

  // Fix 15: Add type assertion for tools array
  content = content.replace(
    /const tools = data\.tools;/g,
    () => {
      modified = true;
      return 'const tools = data.tools as any[];';
    }
  );

  // Fix 16: Add type assertion for anthropicRequest.messages
  content = content.replace(
    /expect\(anthropicRequest\.messages\)/g,
    () => {
      modified = true;
      return 'expect(anthropicRequest.messages as any)';
    }
  );

  // Fix 17: Add type assertion for anthropicRequest.system
  content = content.replace(
    /expect\(anthropicRequest\.system\)/g,
    () => {
      modified = true;
      return 'expect(anthropicRequest.system as any)';
    }
  );

  // Fix 18: Add type assertion for anthropicRequest.system[0]
  content = content.replace(
    /anthropicRequest\.system\[0\]/g,
    () => {
      modified = true;
      return '(anthropicRequest.system as any)[0]';
    }
  );

  // Fix 19: Add type assertion for anthropicRequest.system[1]
  content = content.replace(
    /anthropicRequest\.system\[1\]/g,
    () => {
      modified = true;
      return '(anthropicRequest.system as any)[1]';
    }
  );

  if (modified) {
    await writeFile(fullPath, content, 'utf-8');
    console.log(`✅ Fixed: ${filePath}`);
  } else {
    console.log(`ℹ️  No changes: ${filePath}`);
  }
}

async function main() {
  console.log('🔧 Fixing test mock data type errors\n');

  for (const file of files) {
    try {
      await fixFile(file);
    } catch (error) {
      console.error(`❌ Error fixing ${file}:`, error);
    }
  }

  console.log('\n✅ Done!\n');
}

main().catch(console.error);
