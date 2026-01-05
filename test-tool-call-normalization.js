#!/usr/bin/env node

// Simplified test of the normalizeToCamelCase function

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function isSnakeCase(str) {
  return /_/.test(str) && !/[A-Z]/.test(str);
}

function normalizeToCamelCase(obj, deep = true, path = []) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    if (!deep) return obj;
    return obj.map((item, index) => normalizeToCamelCase(item, deep, [...path, `[${index}]`]));
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  const normalized = {};

  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = isSnakeCase(key) ? snakeToCamel(key) : key;

    if (deep && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      normalized[normalizedKey] = normalizeToCamelCase(value, deep, [...path, normalizedKey]);
    } else if (deep && Array.isArray(value)) {
      normalized[normalizedKey] = value.map((item, index) =>
        typeof item === 'object' && item !== null
          ? normalizeToCamelCase(item, deep, [...path, normalizedKey, `[${index}]`])
          : item
      );
    } else {
      normalized[normalizedKey] = value;
    }
  }

  return normalized;
}

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

console.log('=== Test: OpenAI format (snake_case tool_calls) ===');
const normalized1 = normalizeToCamelCase(openaiResponseWithToolCalls, true);
console.log('Has toolCalls:', !!normalized1.choices?.[0]?.message?.toolCalls);
console.log('Original field name tool_calls exists:', !!(openaiResponseWithToolCalls.choices[0].message.tool_calls));
console.log('Normalized field name toolCalls exists:', !!(normalized1.choices?.[0]?.message?.toolCalls));
console.log('toolCalls:', JSON.stringify(normalized1.choices?.[0]?.message?.toolCalls, null, 2));
