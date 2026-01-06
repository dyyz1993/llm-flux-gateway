#!/usr/bin/env tsx
/**
 * Debug Tool Calls - Capture detailed SSE logs for failed cases
 */

interface DebugResult {
  testCase: number;
  description: string;
  success: boolean;
  rawSSE?: string[];
  error?: string;
}

const BASE_URL = 'http://localhost:3000';

const API_KEYS = {
  KEY_A: {
    name: 'codding',
    key: 'sk-flux-your-key-here',
    backendFormat: 'OpenAI',
  },
  KEY_B: {
    name: 'glm-coding-anthropic',
    key: 'sk-flux-your-key-here',
    backendFormat: 'Anthropic',
  },
};

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

async function debugTest(
  testCase: number,
  apiKey: string,
  format: 'openai' | 'anthropic',
  stream: boolean
): Promise<DebugResult> {
  const endpoint = format === 'openai' ? '/v1/chat/completions' : '/v1/messages';
  const body = format === 'openai' ? {
    model: 'glm-4-air',
    stream,
    messages: [
      {
        role: 'user',
        content: 'What is the current weather in San Francisco? Use the weather tool.',
      },
    ],
    tools: TOOLS,
  } : {
    model: 'glm-4-air',
    stream,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: 'What is the current weather in San Francisco? Use the weather tool.',
      },
    ],
    tools: TOOLS,
  };

  console.log(`\n${'='.repeat(100)}`);
  console.log(`DEBUG TEST #${testCase}: ${format.toUpperCase()} | stream=${stream}`);
  console.log(`${'='.repeat(100)}`);
  console.log('Request Body:', JSON.stringify(body, null, 2));

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        testCase,
        description: `${format.toUpperCase()} | stream=${stream}`,
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    if (stream) {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const rawSSE: string[] = [];
      let chunkIndex = 0;

      console.log('\n--- SSE STREAM START ---');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            rawSSE.push(line);
            console.log(`[${chunkIndex++}] ${line}`);
          }
        }
      }

      console.log('--- SSE STREAM END ---\n');

      // Analyze the SSE data
      console.log('Analysis:');
      const hasToolCalls = rawSSE.some(line => {
        if (format === 'openai') {
          return line.includes('tool_calls');
        } else {
          return line.includes('tool_use');
        }
      });
      console.log(`  - Has tool calls: ${hasToolCalls}`);

      const hasContent = rawSSE.some(line => {
        if (format === 'openai') {
          return line.includes('"content"');
        } else {
          return line.includes('"text"');
        }
      });
      console.log(`  - Has content: ${hasContent}`);

      const hasFinishReason = rawSSE.some(line =>
        line.includes('finish_reason') || line.includes('stop_reason')
      );
      console.log(`  - Has finish reason: ${hasFinishReason}`);

      return {
        testCase,
        description: `${format.toUpperCase()} | stream=${stream}`,
        success: hasToolCalls,
        rawSSE,
      };
    } else {
      const data = await response.json();
      console.log('Response Body:', JSON.stringify(data, null, 2));

      const hasToolCalls = format === 'openai'
        ? !!data.choices?.[0]?.message?.tool_calls
        : data.content?.some((c: any) => c.type === 'tool_use');

      console.log('\nAnalysis:');
      console.log(`  - Has tool calls: ${hasToolCalls}`);

      return {
        testCase,
        description: `${format.toUpperCase()} | stream=${stream}`,
        success: hasToolCalls,
      };
    }
  } catch (error) {
    return {
      testCase,
      description: `${format.toUpperCase()} | stream=${stream}`,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const results: DebugResult[] = [];

  // Test Case #1: codding + OpenAI + stream=true
  results.push(await debugTest(1, API_KEYS.KEY_A.key, 'openai', true));

  // Test Case #5: codding + Anthropic + stream=true
  results.push(await debugTest(5, API_KEYS.KEY_A.key, 'anthropic', true));

  // Test Case #7: codding + Anthropic + stream=false
  results.push(await debugTest(7, API_KEYS.KEY_A.key, 'anthropic', false));

  // Test Case #13: glm-coding-anthropic + Anthropic + stream=true
  results.push(await debugTest(13, API_KEYS.KEY_B.key, 'anthropic', true));

  // Test Case #15: glm-coding-anthropic + Anthropic + stream=false
  results.push(await debugTest(15, API_KEYS.KEY_B.key, 'anthropic', false));

  console.log('\n' + '='.repeat(100));
  console.log('DEBUG SUMMARY');
  console.log('='.repeat(100));

  for (const result of results) {
    console.log(`\nTest #${result.resultCase}: ${result.description}`);
    console.log(`  Success: ${result.success ? '✅' : '❌'}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  // Save raw SSE data
  const fs = await import('node:fs');
  fs.writeFileSync('/tmp/debug-tool-calls.json', JSON.stringify(results, null, 2));
  console.log('\n📁 Detailed debug data saved to: /tmp/debug-tool-calls.json');
}

main().catch(console.error);
