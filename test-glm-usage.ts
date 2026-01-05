#!/usr/bin/env tsx
/**
 * Test GLM response usage conversion
 */

import { AnthropicConverter } from './src/server/module-protocol-transpiler/converters/anthropic.converter';

// Real GLM response from the database
const glmResponse = {
  "id": "msg_20260105124016e4871ba998a04400",
  "type": "message",
  "role": "assistant",
  "model": "glm-4.7",
  "content": [
    {
      "type": "text",
      "text": "<is_displaying_contents>\nfalse\n</is_displaying_contents>\n\n<filepaths>\n</filepaths>\n"
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

console.log('=== Original GLM Response ===');
console.log('Model:', glmResponse.model);
console.log('Usage:', {
  input_tokens: glmResponse.usage?.input_tokens,
  output_tokens: glmResponse.usage?.output_tokens,
  cache_read_input_tokens: glmResponse.usage?.cache_read_input_tokens,
});

// Test conversion
const converter = new AnthropicConverter();
const result = converter.convertResponseToInternal(glmResponse);

console.log('\n=== Conversion Result ===');
console.log('Success:', result.success);

if (result.success) {
  const internalResponse = result.data!;
  console.log('Usage from Internal Format:', {
    promptTokens: internalResponse.usage?.promptTokens,
    completionTokens: internalResponse.usage?.completionTokens,
    totalTokens: internalResponse.usage?.totalTokens,
    cacheReadTokens: internalResponse.usage?.cacheReadTokens,
  });

  console.log('\n=== Expected Values ===');
  console.log('promptTokens should be: 79');
  console.log('completionTokens should be: 23');
  console.log('totalTokens should be: 102');
  console.log('cacheReadTokens should be: 269');

  console.log('\n=== Test Result ===');
  const promptTokensMatch = internalResponse.usage?.promptTokens === 79;
  const completionTokensMatch = internalResponse.usage?.completionTokens === 23;
  const totalTokensMatch = internalResponse.usage?.totalTokens === 102;

  console.log('promptTokens match:', promptTokensMatch ? '✅' : '❌');
  console.log('completionTokens match:', completionTokensMatch ? '✅' : '❌');
  console.log('totalTokens match:', totalTokensMatch ? '✅' : '❌');

  if (!promptTokensMatch || !completionTokensMatch || !totalTokensMatch) {
    console.log('\n❌ TEST FAILED - Token values do not match expected');
    process.exit(1);
  } else {
    console.log('\n✅ TEST PASSED');
    process.exit(0);
  }
} else {
  console.log('Errors:', result.errors);
  console.log('\n❌ TEST FAILED - Conversion failed');
  process.exit(1);
}
