#!/usr/bin/env tsx
/**
 * Debug GLM direct API call - Test what format GLM accepts
 */

const GLM_API_KEY = 'your_api_key_here'; // This is the codding API key
const GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

const TOOLS_ANTHROPIC = [
  {
    name: 'get_weather',
    description: 'Get the current weather for a location',
    input_schema: {
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
];

async function testGLMAnthropicFormat() {
  console.log('Testing GLM with Anthropic format...');

  const response = await fetch(`${GLM_BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'glm-4-air',
      stream: false,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: 'What is the current weather in San Francisco? Use the weather tool.',
        },
      ],
      tools: TOOLS_ANTHROPIC,
    }),
  });

  console.log('Status:', response.status);
  const text = await response.text();
  console.log('Response:', text);
}

testGLMAnthropicFormat().catch(console.error);
