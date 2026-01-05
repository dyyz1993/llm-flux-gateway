#!/usr/bin/env tsx
/**
 * Complete test of GLM response conversion flow
 */

import { ProtocolTranspiler } from './src/server/module-protocol-transpiler/core/protocol-transpiler';
import { AnthropicConverter } from './src/server/module-protocol-transpiler/converters/anthropic.converter';
import { OpenAIConverter } from './src/server/module-protocol-transpiler/converters/openai.converter';

// Real GLM response from database
const glmResponse = {
  "id": "msg_20260105124016e4871ba998a04400",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7",
  "content": [
    {
      "type": "text",
      "text": "test content"
    }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 79,
    "output_tokens": 23,
    "cache_read_input_tokens": 269,
    "server_tool_use": {
      "web_search_requests": 0
    },
    "service_tier": "standard"
  }
};

console.log('=== Complete GLM Response Conversion Test ===\n');

// Step 1: Test Anthropic converter directly
console.log('Step 1: Test AnthropicConverter.convertResponseToInternal()');
const anthropicConverter = new AnthropicConverter();
const directResult = anthropicConverter.convertResponseToInternal(glmResponse);

console.log('- Success:', directResult.success);
if (directResult.success) {
  console.log('- promptTokens:', directResult.data!.usage?.promptTokens);
  console.log('- completionTokens:', directResult.data!.usage?.completionTokens);
  console.log('- totalTokens:', directResult.data!.usage?.totalTokens);
  console.log('- cacheReadTokens:', directResult.data!.usage?.cacheReadTokens);
  console.log('✅ Direct converter works\n');
} else {
  console.log('- Errors:', directResult.errors);
  console.log('❌ Direct converter FAILED\n');
  process.exit(1);
}

// Step 2: Test via ProtocolTranspiler (actual flow in gateway-controller.ts)
console.log('Step 2: Test via ProtocolTranspiler.transpile()');
console.log('(This is the actual flow used in gateway-controller.ts line 592-596)');

const transpiler = new ProtocolTranspiler();
transpiler.registerConverter(new OpenAIConverter());
transpiler.registerConverter(new AnthropicConverter());

// This is exactly what gateway-controller.ts does:
// const internalResponseResult = protocolTranspiler.transpile(
//   upstreamResponse,
//   targetFormat,   // Upstream format
//   'openai'        // Internal format
// );

const internalResult = transpiler.transpile(
  glmResponse,
  'anthropic',   // GLM uses Anthropic format
  'openai'       // Internal format (stored as 'openai' in code)
);

console.log('- Success:', internalResult.success);
if (internalResult.success) {
  console.log('- Type of result:', typeof internalResult.data!);
  console.log('- Has usage?', internalResult.data?.usage !== undefined);
  if (internalResult.data?.usage) {
    console.log('- promptTokens:', internalResult.data!.usage.promptTokens);
    console.log('- completionTokens:', internalResult.data!.usage.completionTokens);
    console.log('- totalTokens:', internalResult.data!.usage.totalTokens);
    console.log('- cacheReadTokens:', internalResult.data!.usage.cacheReadTokens);

    // Verify values
    const tokensCorrect =
      internalResult.data!.usage.promptTokens === 79 &&
      internalResult.data!.usage.completionTokens === 23 &&
      internalResult.data!.usage.totalTokens === 102;

    if (tokensCorrect) {
      console.log('\n✅ STANDARD FLOW WORKS PERFECTLY!');
      console.log('✅ internalResponse?.usage?.promptTokens = 79');
      console.log('✅ internalResponse?.usage?.completionTokens = 23');
      console.log('\n❌ MY FALLBACK FIX IS NOT NEEDED!');
      console.log('The real issue must be something else.');
    } else {
      console.log('\n❌ Values are wrong!');
    }
  } else {
    console.log('\n❌ No usage field in internalResponse!');
  }
} else {
  console.log('- Errors:', internalResult.errors);
  console.log('\n❌ TRANSPILER CONVERSION FAILED!');
  console.log('This would cause internalResponse to be undefined');
  console.log('And then my fallback fix would be needed');
}

process.exit(internalResult.success ? 0 : 1);
