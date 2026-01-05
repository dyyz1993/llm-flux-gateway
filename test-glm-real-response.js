#!/usr/bin/env node

// Real GLM response from database
const glmResponse = {
  "choices": [{
    "finish_reason": "tool_calls",
    "index": 0,
    "message": {
      "content": "我来帮您查询北京天气并计算 25 * 16。",
      "reasoning_content": "用户要求我做两件事：",
      "role": "assistant",
      "tool_calls": [
        {
          "function": {
            "arguments": "{}",
            "name": "getWeather"
          },
          "id": "call_-8003939800346669830",
          "index": 0,
          "type": "function"
        },
        {
          "function": {
            "arguments": "{}",
            "name": "calculate"
          },
          "id": "call_-8003939800346669829",
          "index": 1,
          "type": "function"
        }
      ]
    }
  }],
  "created": 1767617569,
  "id": "2026010520524565c8f77f3c03489e",
  "model": "glm-4.5",
  "object": "chat.completion",
  "usage": {
    "completion_tokens": 145,
    "prompt_tokens": 306,
    "total_tokens": 451
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
    return obj.map((item) => normalizeToCamelCase(item, deep));
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

console.log('=== Original GLM Response ===');
console.log('choices[0].finish_reason:', glmResponse.choices[0].finish_reason);
console.log('choices[0].message.tool_calls exists:', !!glmResponse.choices[0].message.tool_calls);
console.log('tool_calls count:', glmResponse.choices[0].message.tool_calls?.length);

console.log('\n=== After normalizeToCamelCase ===');
const normalized = normalizeToCamelCase(glmResponse, true);
console.log('choices[0].finishReason:', normalized.choices[0].finishReason);
console.log('choices[0].message.toolCalls exists:', !!normalized.choices[0].message.toolCalls);
console.log('toolCalls count:', normalized.choices[0].message.toolCalls?.length);
console.log('toolCalls:', JSON.stringify(normalized.choices[0].message.toolCalls, null, 2));

console.log('\n=== What Gateway Controller would extract ===');
console.log('internalResponse?.choices?.[0]?.message?.toolCalls:', normalized.choices[0].message.toolCalls ? 'EXISTS ✅' : 'MISSING ❌');
console.log('Array length:', normalized.choices[0].message.toolCalls?.length);
