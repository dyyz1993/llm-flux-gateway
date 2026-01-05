#!/usr/bin/env tsx
/**
 * Test script to verify tool_calls normalization
 */

import { normalizeToCamelCase } from './src/server/module-protocol-transpiler/utils/field-normalizer';

// Test case 1: Standard OpenAI format with tool_calls
const openaiResponseWithToolCalls = {
  id: 'chatcmpl-123',
  object: 'chat.completion',
  created: 1677652288,
  model: 'gpt-3.5-turbo',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'getWeather',
              arguments: '{"city": "上海"}'
            }
          }
        ],
        refusal: null
      },
      finish_reason: 'tool_calls'
    }
  ],
  usage: {
    prompt_tokens: 50,
    completion_tokens: 20,
    total_tokens: 70
  }
};

// Test case 2: GLM format (might have camelCase toolCalls)
const glmResponseWithCamelCase = {
  id: 'chatcmpl-123',
  object: 'chat.completion',
  created: 1677652288,
  model: 'glm-4',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: '',
        toolCalls: [  // GLM might return camelCase
          {
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'getWeather',
              arguments: '{"city": "上海"}'
            }
          }
        ]
      },
      finishReason: 'tool_calls'  // Mix of snake_case
    }
  ],
  usage: {
    promptTokens: 50,
    completionTokens: 20,
    totalTokens: 70
  }
};

console.log('=== Test 1: OpenAI format (snake_case tool_calls) ===');
const normalized1 = normalizeToCamelCase(openaiResponseWithToolCalls, true);
console.log('Has toolCalls:', !!normalized1.choices?.[0]?.message?.toolCalls);
console.log('toolCalls:', JSON.stringify(normalized1.choices?.[0]?.message?.toolCalls, null, 2));
console.log('');

console.log('=== Test 2: GLM format (camelCase toolCalls) ===');
const normalized2 = normalizeToCamelCase(glmResponseWithCamelCase, true);
console.log('Has toolCalls:', !!normalized2.choices?.[0]?.message?.toolCalls);
console.log('toolCalls:', JSON.stringify(normalized2.choices?.[0]?.message?.toolCalls, null, 2));
console.log('');

// Test case 3: Check if normalizeToCamelCase handles mixed format
console.log('=== Test 3: Mixed format (both tool_calls and toolCalls) ===');
const mixedFormat = {
  ...openaiResponseWithToolCalls,
  choices: [{
    ...openaiResponseWithToolCalls.choices[0],
    message: {
      ...openaiResponseWithToolCalls.choices[0].message,
      tool_calls: openaiResponseWithToolCalls.choices[0].message.tool_calls,
      toolCalls: [{  // Both fields present
        id: 'call_extra',
        type: 'function',
        function: {
          name: 'extraFunc',
          arguments: '{}'
        }
      }]
    }
  }]
};
const normalized3 = normalizeToCamelCase(mixedFormat, true);
console.log('Has toolCalls:', !!normalized3.choices?.[0]?.message?.toolCalls);
console.log('toolCalls count:', normalized3.choices?.[0]?.message?.toolCalls?.length);
