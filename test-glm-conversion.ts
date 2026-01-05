#!/usr/bin/env tsx
/**
 * Test if GLM response can be converted to Internal Format
 */

import { AnthropicConverter } from './src/server/module-protocol-transpiler/converters/anthropic.converter';

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

console.log('=== Testing GLM Response Conversion ===\n');
console.log('Input (GLM format):');
console.log('- Model:', glmResponse.model);
console.log('- Usage:', glmResponse.usage);

const converter = new AnthropicConverter();
const result = converter.convertResponseToInternal(glmResponse);

console.log('\n=== Conversion Result ===');
console.log('Success:', result.success);

if (result.success) {
  const internalResponse = result.data!;
  console.log('\n✅ Conversion SUCCESSFUL');
  console.log('Internal Format usage:', {
    promptTokens: internalResponse.usage?.promptTokens,
    completionTokens: internalResponse.usage?.completionTokens,
    totalTokens: internalResponse.usage?.totalTokens,
    cacheReadTokens: internalResponse.usage?.cacheReadTokens,
  });

  // Verify expected values
  console.log('\n=== Verification ===');
  console.log('promptTokens should be 79:', internalResponse.usage?.promptTokens === 79 ? '✅' : '❌');
  console.log('completionTokens should be 23:', internalResponse.usage?.completionTokens === 23 ? '✅' : '❌');
  console.log('totalTokens should be 102:', internalResponse.usage?.totalTokens === 102 ? '✅' : '❌');
  console.log('cacheReadTokens should be 269:', internalResponse.usage?.cacheReadTokens === 269 ? '✅' : '❌');

  if (internalResponse.usage?.promptTokens === 79 &&
      internalResponse.usage?.completionTokens === 23) {
    console.log('\n✅ ALL TESTS PASSED - Standard conversion works correctly!');
    console.log('❌ My fallback fix is NOT needed - this should work via standard flow');
  } else {
    console.log('\n❌ Conversion succeeded but values are wrong');
  }
} else {
  console.log('\n❌ Conversion FAILED');
  console.log('Errors:', result.errors);
  console.log('\n❌ This explains why my fallback fix was needed!');
  console.log('But this is a HACK - the real issue is that conversion is failing.');
}

process.exit(result.success ? 0 : 1);
