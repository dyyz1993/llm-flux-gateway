#!/usr/bin/env tsx
"use strict";

// scripts/fix-test-mock-types.ts
var import_promises = require("node:fs/promises");
var import_node_path = require("node:path");
var ROOT = "/Users/xuyingzhou/Downloads/llm-flux-gateway";
var files = [
  "src/server/module-protocol-transpiler/converters/__tests__/anthropic-tool-use-blocks.test.ts",
  "src/server/module-protocol-transpiler/converters/__tests__/openai-to-anthropic.real-data.test.ts"
];
async function fixFile(filePath) {
  const fullPath = (0, import_node_path.join)(ROOT, filePath);
  let content = await (0, import_promises.readFile)(fullPath, "utf-8");
  let modified = false;
  const requestPattern = /const request = \{[\s\S]*?maxTokens: \d+,\s*\};/g;
  content = content.replace(requestPattern, (match) => {
    if (match.includes("InternalRequest") || match.includes(": any")) {
      return match;
    }
    modified = true;
    return match.replace("const request = {", "const request: InternalRequest = {");
  });
  content = content.replace(
    /const anthropicRequest = result\.data;/g,
    () => {
      modified = true;
      return "const anthropicRequest = result.data!;";
    }
  );
  content = content.replace(
    /const assistantMsg = data\.messages\[1\];/g,
    () => {
      modified = true;
      return "const assistantMsg = (data.messages as any)[1];";
    }
  );
  content = content.replace(
    /const thirdMessage = data\.messages\[2\];/g,
    () => {
      modified = true;
      return "const thirdMessage = (data.messages as any)[2];";
    }
  );
  content = content.replace(
    /const toolResultMessage = data\.messages\[2\];/g,
    () => {
      modified = true;
      return "const toolResultMessage = (data.messages as any)[2];";
    }
  );
  content = content.replace(
    /const assistantMessage = data\.messages\[1\];/g,
    () => {
      modified = true;
      return "const assistantMessage = (data.messages as any)[1];";
    }
  );
  content = content.replace(
    /const assistantMsg = anthropicRequest\.messages\[1\];/g,
    () => {
      modified = true;
      return "const assistantMsg = (anthropicRequest.messages as any)[1];";
    }
  );
  const inputPattern = /const input = \{[\s\S]*?\}\];\s*\}\]/g;
  content = content.replace(inputPattern, (match) => {
    if (match.includes(": any")) {
      return match;
    }
    modified = true;
    return match.replace("const input = {", "const input: any = {");
  });
  content = content.replace(
    /const webSearchTool = data\.tools\.find\(/g,
    () => {
      modified = true;
      return "const webSearchTool = (data.tools as any[]).find(";
    }
  );
  content = content.replace(
    /expect\(data\.tools\[0\]\)/g,
    () => {
      modified = true;
      return "expect((data.tools as any)[0])";
    }
  );
  content = content.replace(
    /expect\(data\.tools\)/g,
    () => {
      modified = true;
      return "expect(data.tools as any)";
    }
  );
  content = content.replace(
    /expect\(data\.tools\[0\]\)\.toHaveProperty\('input_schema'\)/g,
    () => {
      modified = true;
      return "expect((data.tools as any)[0]).toHaveProperty('input_schema')";
    }
  );
  content = content.replace(
    /const schema = data\.tools\[0\]\.input_schema;/g,
    () => {
      modified = true;
      return "const schema = (data.tools as any)[0].input_schema;";
    }
  );
  content = content.replace(
    /const props = data\.tools\[0\]\.input_schema\.properties;/g,
    () => {
      modified = true;
      return "const props = (data.tools as any)[0].input_schema.properties;";
    }
  );
  content = content.replace(
    /const tools = data\.tools;/g,
    () => {
      modified = true;
      return "const tools = data.tools as any[];";
    }
  );
  content = content.replace(
    /expect\(anthropicRequest\.messages\)/g,
    () => {
      modified = true;
      return "expect(anthropicRequest.messages as any)";
    }
  );
  content = content.replace(
    /expect\(anthropicRequest\.system\)/g,
    () => {
      modified = true;
      return "expect(anthropicRequest.system as any)";
    }
  );
  content = content.replace(
    /anthropicRequest\.system\[0\]/g,
    () => {
      modified = true;
      return "(anthropicRequest.system as any)[0]";
    }
  );
  content = content.replace(
    /anthropicRequest\.system\[1\]/g,
    () => {
      modified = true;
      return "(anthropicRequest.system as any)[1]";
    }
  );
  if (modified) {
    await (0, import_promises.writeFile)(fullPath, content, "utf-8");
    console.log(`\u2705 Fixed: ${filePath}`);
  } else {
    console.log(`\u2139\uFE0F  No changes: ${filePath}`);
  }
}
async function main() {
  console.log("\u{1F527} Fixing test mock data type errors\n");
  for (const file of files) {
    try {
      await fixFile(file);
    } catch (error) {
      console.error(`\u274C Error fixing ${file}:`, error);
    }
  }
  console.log("\n\u2705 Done!\n");
}
main().catch(console.error);
