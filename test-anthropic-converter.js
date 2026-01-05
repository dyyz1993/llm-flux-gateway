#!/usr/bin/env node

// Real Anthropic format GLM response from database
const anthropicGLMResponse = {
  "id": "msg_20260105204330b81f1493b709428f",
  "type": "message",
  "role": "assistant",
  "model": "glm-4-air",
  "content": [
    {
      "type": "tool_use",
      "id": "call_20260105204330b81f1493b709428f_0",
      "name": "get_weather",
      "input": {"city": "San Francisco", "unit": "celsius"}
    }
  ],
  "stop_reason": "tool_use",
  "usage": {
    "input_tokens": 1044,
    "output_tokens": 18
  }
};

// Simulate AnthropicConverter.convertResponseToInternal logic
console.log('=== Original Anthropic GLM Response ===');
console.log('content[0].type:', anthropicGLMResponse.content[0].type);
console.log('stop_reason:', anthropicGLMResponse.stop_reason);

// Extract tool_use blocks and convert to tool_calls
const tool_calls = [];
const contentBlocks = [];

for (const block of anthropicGLMResponse.content) {
  if (block.type === 'tool_use') {
    // Add to content array
    contentBlocks.push({
      type: 'tool_use',
      id: block.id,
      name: block.name,
      input: block.input,
    });

    // Also add to tool_calls for OpenAI compatibility
    tool_calls.push({
      id: block.id,
      type: 'function',
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input),
      },
    });
  }
}

// Map Anthropic stop_reason to OpenAI finish_reason
const stopReasonMap = {
  'tool_use': 'tool_calls',
  'max_tokens': 'length',
  'stop_sequence': 'stop',
  'end_turn': 'stop',
};

const internalResponse = {
  id: anthropicGLMResponse.id,
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content: contentBlocks.length > 0 ? contentBlocks : null,
      toolCalls: tool_calls.length > 0 ? tool_calls : undefined,
    },
    finishReason: stopReasonMap[anthropicGLMResponse.stop_reason] || anthropicGLMResponse.stop_reason || 'stop',
  }],
  usage: {
    promptTokens: anthropicGLMResponse.usage.input_tokens,
    completionTokens: anthropicGLMResponse.usage.output_tokens,
    totalTokens: anthropicGLMResponse.usage.input_tokens + anthropicGLMResponse.usage.output_tokens,
  },
};

console.log('\n=== Converted to Internal Format ===');
console.log('choices[0].message.toolCalls exists:', !!internalResponse.choices[0].message.toolCalls);
console.log('toolCalls count:', internalResponse.choices[0].message.toolCalls?.length);
console.log('toolCalls:', JSON.stringify(internalResponse.choices[0].message.toolCalls, null, 2));
console.log('finishReason:', internalResponse.choices[0].finishReason);

console.log('\n=== What Gateway Controller would extract ===');
console.log('internalResponse?.choices?.[0]?.message?.toolCalls:', internalResponse.choices[0].message.toolCalls ? 'EXISTS ✅' : 'MISSING ❌');
