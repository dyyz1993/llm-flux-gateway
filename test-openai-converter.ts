#!/usr/bin/env node

/**
 * Test OpenAI Converter to see if it properly converts tool_calls
 */

// Mock data
const standardOpenAIResponse = {
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
        ]
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

// Simulate normalizeToCamelCase
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function isSnakeCase(str) {
  return /_/.test(str) && !/[A-Z]/.test(str);
}

function normalizeToCamelCase(obj, deep = true) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    if (!deep) return obj;
    return obj.map((item, index) => normalizeToCamelCase(item, deep));
  }
  if (typeof obj !== 'object') return obj;

  const normalized = {};
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = isSnakeCase(key) ? snakeToCamel(key) : key;
    if (deep && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      normalized[normalizedKey] = normalizeToCamelCase(value, deep);
    } else if (deep && Array.isArray(value)) {
      normalized[normalizedKey] = value.map(item =>
        typeof item === 'object' && item !== null
          ? normalizeToCamelCase(item, deep)
          : item
      );
    } else {
      normalized[normalizedKey] = value;
    }
  }
  return normalized;
}

console.log('=== Standard OpenAI Response ===');
console.log('Original tool_calls:', standardOpenAIResponse.choices[0].message.tool_calls);
console.log('Original finish_reason:', standardOpenAIResponse.choices[0].finish_reason);

const normalized = normalizeToCamelCase(standardOpenAIResponse, true);
console.log('\n=== After normalizeToCamelCase ===');
console.log('Normalized toolCalls:', normalized.choices[0].message.toolCalls);
console.log('Normalized finishReason:', normalized.choices[0].finishReason);

// Check what the Gateway Controller would see
console.log('\n=== What Gateway Controller sees ===');
console.log('internalResponse?.choices?.[0]?.message?.toolCalls exists:', !!normalized.choices?.[0]?.message?.toolCalls);
console.log('toolCalls is array:', Array.isArray(normalized.choices?.[0]?.message?.toolCalls));
console.log('toolCalls length:', normalized.choices?.[0]?.message?.toolCalls?.length);
