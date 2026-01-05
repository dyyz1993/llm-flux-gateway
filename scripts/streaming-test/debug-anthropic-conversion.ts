#!/usr/bin/env tsx
/**
 * Debug Anthropic conversion - See what request is being sent to GLM
 */

import { protocolTranspiler } from '../../src/server/module-protocol-transpiler/index';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
        },
        required: ['location'],
      },
    },
  },
];

// OpenAI format request
const openAIRequest = {
  model: 'glm-4-air',
  stream: true,
  messages: [
    {
      role: 'user',
      content: 'What is the current weather in San Francisco? Use the weather tool.',
    },
  ],
  tools: TOOLS,
};

console.log('='.repeat(100));
console.log('OPENAI FORMAT REQUEST');
console.log('='.repeat(100));
console.log(JSON.stringify(openAIRequest, null, 2));

// Convert to internal format
const toInternalResult = protocolTranspiler.transpile(openAIRequest, 'openai', 'openai');
console.log('\n' + '='.repeat(100));
console.log('CONVERT TO INTERNAL FORMAT');
console.log('='.repeat(100));
console.log('Success:', toInternalResult.success);
if (toInternalResult.success) {
  console.log(JSON.stringify(toInternalResult.data, null, 2));
} else {
  console.log('Errors:', toInternalResult.errors);
}

// Convert from internal to Anthropic format
const fromInternalResult = protocolTranspiler.transpile(
  toInternalResult.data as any,
  'openai',
  'anthropic'
);
console.log('\n' + '='.repeat(100));
console.log('CONVERT FROM INTERNAL TO ANTHROPIC FORMAT');
console.log('='.repeat(100));
console.log('Success:', fromInternalResult.success);
if (fromInternalResult.success) {
  console.log(JSON.stringify(fromInternalResult.data, null, 2));
} else {
  console.log('Errors:', fromInternalResult.errors);
}
