#!/usr/bin/env tsx
/**
 * GLM Tool Calling - 16 组合完整测试
 *
 * 测试矩阵：
 * - 2 个 API Keys (Key A: OpenAI格式, Key B: Anthropic格式)
 * - 2 个选择格式 (OpenAI, Anthropic)
 * - 2 个流式选项 (stream: true, false)
 * - 2 个工具选项 (有工具, 无工具)
 */

import fs from 'node:fs';

interface TestResult {
  testCase: number;
  apiKeyName: string;
  backendFormat: string;
  selectedFormat: string;
  stream: boolean;
  hasTools: boolean;
  toolCallGenerated: boolean;
  finalResponseEmpty: boolean;
  status: 'PASS' | 'FAIL' | 'ERROR';
  error?: string;
  responseTime?: number;
}

const BASE_URL = 'http://localhost:3000';

// API Keys 配置
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

// 测试消息
const MESSAGES = {
  withTools: 'What is the current weather in San Francisco? Use the weather tool.',
  withoutTools: '你好，请介绍一下你自己',
};

// 工具定义
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

// OpenAI 格式请求体
function buildOpenAIRequest(stream: boolean, hasTools: boolean) {
  return {
    model: 'glm-4-air',
    stream,
    messages: [
      {
        role: 'user',
        content: hasTools ? MESSAGES.withTools : MESSAGES.withoutTools,
      },
    ],
    ...(hasTools ? { tools: TOOLS } : {}),
  };
}

// Anthropic 格式请求体
function buildAnthropicRequest(stream: boolean, hasTools: boolean) {
  return {
    model: 'glm-4-air',
    stream,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: hasTools ? MESSAGES.withTools : MESSAGES.withoutTools,
      },
    ],
    ...(hasTools ? { tools: TOOLS } : {}),
  };
}

// 发送请求并收集响应
async function sendRequest(
  apiKey: string,
  format: 'openai' | 'anthropic',
  stream: boolean,
  hasTools: boolean
): Promise<{ toolCallGenerated: boolean; finalResponseEmpty: boolean; error?: string; rawResponse?: any }> {
  const endpoint = format === 'openai' ? '/v1/chat/completions' : '/v1/messages';
  const body = format === 'openai' ? buildOpenAIRequest(stream, hasTools) : buildAnthropicRequest(stream, hasTools);

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
        toolCallGenerated: false,
        finalResponseEmpty: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    if (stream) {
      // 处理流式响应
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let toolCallGenerated = false;
      let hasFinalContent = false;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);

              // 检查 OpenAI 格式的 tool call
              if (format === 'openai') {
                if (parsed.choices?.[0]?.delta?.tool_calls) {
                  toolCallGenerated = true;
                }
                if (parsed.choices?.[0]?.delta?.content) {
                  hasFinalContent = true;
                }
              }
              // 检查 Anthropic 格式的 tool call
              else {
                if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
                  toolCallGenerated = true;
                }
                if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                  hasFinalContent = true;
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      return {
        toolCallGenerated,
        finalResponseEmpty: !hasFinalContent,
      };
    } else {
      // 处理非流式响应
      const data = await response.json();

      let toolCallGenerated = false;
      let hasContent = false;

      if (format === 'openai') {
        // OpenAI 格式
        if (data.choices?.[0]?.message?.tool_calls) {
          toolCallGenerated = true;
        }
        if (data.choices?.[0]?.message?.content) {
          hasContent = true;
        }
      } else {
        // Anthropic 格式
        if (data.content?.some((c: any) => c.type === 'tool_use')) {
          toolCallGenerated = true;
        }
        if (data.content?.some((c: any) => c.type === 'text' && c.text)) {
          hasContent = true;
        }
      }

      return {
        toolCallGenerated,
        finalResponseEmpty: !hasContent,
        rawResponse: data,
      };
    }
  } catch (error) {
    return {
      toolCallGenerated: false,
      finalResponseEmpty: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// 运行单个测试
async function runTest(testCase: number, config: {
  apiKey: typeof API_KEYS.KEY_A | typeof API_KEYS.KEY_B;
  selectedFormat: 'openai' | 'anthropic';
  stream: boolean;
  hasTools: boolean;
}): Promise<TestResult> {
  const startTime = Date.now();
  console.log(`\n[测试 ${testCase}] ${config.apiKey.name} | ${config.selectedFormat.toUpperCase()} | stream=${config.stream} | tools=${config.hasTools}`);

  const result = await sendRequest(
    config.apiKey.key,
    config.selectedFormat,
    config.stream,
    config.hasTools
  );

  const responseTime = Date.now() - startTime;

  // 判断测试结果
  let status: TestResult['status'] = 'PASS';

  if (result.error) {
    status = 'ERROR';
  } else if (config.hasTools) {
    // 有工具的测试：需要生成 tool call
    status = result.toolCallGenerated ? 'PASS' : 'FAIL';
  } else {
    // 无工具的测试：不应该有 tool call，但应该有正常响应
    status = !result.toolCallGenerated && !result.finalResponseEmpty ? 'PASS' : 'FAIL';
  }

  console.log(`  → ${status} (${responseTime}ms)`);
  if (result.error) console.log(`  错误: ${result.error}`);
  if (config.hasTools) console.log(`  Tool Call 生成: ${result.toolCallGenerated}`);
  console.log(`  最终响应为空: ${result.finalResponseEmpty}`);

  return {
    testCase,
    apiKeyName: config.apiKey.name,
    backendFormat: config.apiKey.backendFormat,
    selectedFormat: config.selectedFormat.toUpperCase(),
    stream: config.stream,
    hasTools: config.hasTools,
    toolCallGenerated: result.toolCallGenerated,
    finalResponseEmpty: result.finalResponseEmpty,
    status,
    error: result.error,
    responseTime,
  };
}

// 生成测试报告
function generateReport(results: TestResult[]) {
  console.log('\n' + '='.repeat(120));
  console.log('GLM TOOL CALLING - 16 组合完整测试报告');
  console.log('='.repeat(120));

  // 统计
  const stats = {
    total: results.length,
    pass: results.filter(r => r.status === 'PASS').length,
    fail: results.filter(r => r.status === 'FAIL').length,
    error: results.filter(r => r.status === 'ERROR').length,
  };

  console.log(`\n📊 统计总结:`);
  console.log(`   总测试数: ${stats.total}`);
  console.log(`   ✅ 通过: ${stats.pass}`);
  console.log(`   ❌ 失败: ${stats.fail}`);
  console.log(`   ⚠️  错误: ${stats.error}`);
  console.log(`   通过率: ${((stats.pass / stats.total) * 100).toFixed(1)}%`);

  // 测试矩阵表
  console.log('\n' + '-'.repeat(120));
  console.log('测试矩阵结果:');
  console.log('-'.repeat(120));
  console.log(
    '| #  | API Key              | 背后格式   | 选择格式    | 流式  | 工具  | Tool Call | 最终响应  | 状态   | 耗时    |'
  );
  console.log(
    '|---|----------------------|------------|-------------|-------|-------|-----------|-----------|--------|---------|'
  );

  for (const result of results) {
    const apiKey = result.apiKeyName.padEnd(20);
    const backend = result.backendFormat.padEnd(10);
    const selected = result.selectedFormat.padEnd(11);
    const stream = result.stream ? '是' : '否';
    const tools = result.hasTools ? '是' : '否';
    const toolCall = result.hasTools ? (result.toolCallGenerated ? '✅' : '❌') : '-';
    const finalResp = result.hasTools ? '-' : (result.finalResponseEmpty ? '❌' : '✅');
    const status = result.status === 'PASS' ? '✅ PASS' : result.status === 'FAIL' ? '❌ FAIL' : '⚠️  ERROR';
    const time = result.responseTime ? `${result.responseTime}ms` : 'N/A';

    console.log(
      `| ${String(result.testCase).padStart(2)} | ${apiKey} | ${backend} | ${selected} | ${stream}     | ${tools}     | ${toolCall}         | ${finalResp}         | ${status} | ${String(time).padStart(7)} |`
    );
  }

  // 失败案例详情
  const failedResults = results.filter(r => r.status !== 'PASS');
  if (failedResults.length > 0) {
    console.log('\n' + '-'.repeat(120));
    console.log('失败案例详情:');
    console.log('-'.repeat(120));

    for (const result of failedResults) {
      console.log(`\n❌ 案例 #${result.testCase}:`);
      console.log(`   组合: ${result.apiKeyName} (${result.backendFormat}) + ${result.selectedFormat} + stream=${result.stream} + tools=${result.hasTools}`);
      console.log(`   状态: ${result.status}`);

      if (result.error) {
        console.log(`   错误: ${result.error}`);
      } else if (result.hasTools && !result.toolCallGenerated) {
        console.log(`   问题: 期望生成 tool call，但实际未生成`);
      } else if (!result.hasTools && result.toolCallGenerated) {
        console.log(`   问题: 不应该生成 tool call，但实际生成了`);
      } else if (!result.hasTools && result.finalResponseEmpty) {
        console.log(`   问题: 期望有正常文本响应，但响应为空`);
      }
    }
  }

  console.log('\n' + '='.repeat(120));
}

// 主函数
async function main() {
  console.log('🚀 开始 GLM Tool Calling 16 组合测试...\n');

  const results: TestResult[] = [];
  let testCase = 1;

  // Key A (OpenAI) + OpenAI 格式
  for (const stream of [true, false]) {
    for (const hasTools of [true, false]) {
      const result = await runTest(testCase++, {
        apiKey: API_KEYS.KEY_A,
        selectedFormat: 'openai',
        stream,
        hasTools,
      });
      results.push(result);
    }
  }

  // Key A (OpenAI) + Anthropic 格式
  for (const stream of [true, false]) {
    for (const hasTools of [true, false]) {
      const result = await runTest(testCase++, {
        apiKey: API_KEYS.KEY_A,
        selectedFormat: 'anthropic',
        stream,
        hasTools,
      });
      results.push(result);
    }
  }

  // Key B (Anthropic) + OpenAI 格式
  for (const stream of [true, false]) {
    for (const hasTools of [true, false]) {
      const result = await runTest(testCase++, {
        apiKey: API_KEYS.KEY_B,
        selectedFormat: 'openai',
        stream,
        hasTools,
      });
      results.push(result);
    }
  }

  // Key B (Anthropic) + Anthropic 格式
  for (const stream of [true, false]) {
    for (const hasTools of [true, false]) {
      const result = await runTest(testCase++, {
        apiKey: API_KEYS.KEY_B,
        selectedFormat: 'anthropic',
        stream,
        hasTools,
      });
      results.push(result);
    }
  }

  // 生成报告
  generateReport(results);

  // 保存结果到文件
  const reportPath = '/tmp/glm-16-combinations-results.json';
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📁 详细结果已保存到: ${reportPath}`);
}

main().catch(console.error);
