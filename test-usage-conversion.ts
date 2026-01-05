#!/usr/bin/env tsx
/**
 * Test script to verify usage conversion from GLM response
 */

const originalResponse = {
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

console.log('Original Response Usage:', {
  input_tokens: originalResponse.usage?.input_tokens,
  output_tokens: originalResponse.usage?.output_tokens,
  cache_read_input_tokens: originalResponse.usage?.cache_read_input_tokens,
});

// Test what the converter should produce
const expectedUsage = {
  promptTokens: originalResponse.usage?.input_tokens || 0,
  completionTokens: originalResponse.usage?.output_tokens || 0,
  totalTokens: (originalResponse.usage?.input_tokens || 0) + (originalResponse.usage?.output_tokens || 0),
  cacheReadTokens: originalResponse.usage?.cache_read_input_tokens,
};

console.log('Expected Internal Usage:', expectedUsage);

// Check if internalResponse would have usage data
console.log('\n=== Expected Database Values ===');
console.log('promptTokens:', expectedUsage.promptTokens || 0);
console.log('completionTokens:', expectedUsage.completionTokens || 0);
console.log('totalTokens:', expectedUsage.totalTokens || 0);
console.log('cachedTokens:', expectedUsage.cacheReadTokens || 0);
