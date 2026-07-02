/**
 * 运行格式校验 — 用独立的格式校验器验证所有输出格式
 *
 * 用法: npx tsx scripts/run-format-validation.ts
 */
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';

import { openaiToPiContext } from '../src/server/adapters/input/openai.adapter';
import { anthropicToPiContext } from '../src/server/adapters/input/anthropic.adapter';
import { geminiToPiContext } from '../src/server/adapters/input/gemini.adapter';
import { piResponseToOpenaiJson, piEventToOpenaiSSE } from '../src/server/adapters/output/openai.adapter';
import { piResponseToAnthropicJson, piEventToAnthropicSSE } from '../src/server/adapters/output/anthropic.adapter';
import { piResponseToGeminiJson } from '../src/server/adapters/output/gemini.adapter';

import {
  validateOpenaiChatFormat,
  validateOpenaiSSEFormat,
  validateAnthropicFormat,
  validateAnthropicSSEFormat,
  validateGeminiFormat,
} from './format-validator';

// ============================================================
// 测试场景
// ============================================================

interface TestCase {
  name: string;
  run: () => Promise<{ results: { format: string; valid: boolean; errors: string[] }[] }>;
}

const testCases: TestCase[] = [];

// 1. OpenAI 输入 → OpenAI/Anthropic/Gemini 输出（纯文本）
testCases.push({
  name: 'OpenAI 文本输入 → 三种格式',
  run: async () => {
    const faux = fauxProvider({ api: 'openai-completions', provider: 't1' });
    faux.setResponses([fauxAssistantMessage([fauxText('Paris is the capital of France.')])]);
    const models = createModels(); models.setProvider(faux.provider);
    const { context } = openaiToPiContext({ messages: [{ role: 'user', content: 'Capital of France?' }] });
    const response = await models.complete(faux.getModel()!, context);

    return {
      results: [
        { format: 'OpenAI JSON', ...validateOpenaiChatFormat(piResponseToOpenaiJson(response)) },
        { format: 'Anthropic', ...validateAnthropicFormat(piResponseToAnthropicJson(response)) },
        { format: 'Gemini', ...validateGeminiFormat(piResponseToGeminiJson(response)) },
      ],
    };
  },
});

// 2. OpenAI 输入 → 三种格式（工具调用）
testCases.push({
  name: 'OpenAI 工具调用 → 三种格式',
  run: async () => {
    const faux = fauxProvider({ api: 'openai-completions', provider: 't2' });
    faux.setResponses([fauxAssistantMessage([fauxToolCall('get_weather', { city: 'Tokyo' })], { stopReason: 'toolUse' })]);
    const models = createModels(); models.setProvider(faux.provider);
    const { context } = openaiToPiContext({
      messages: [{ role: 'user', content: 'Weather in Tokyo?' }],
      tools: [{ type: 'function', function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } } }],
    });
    const response = await models.complete(faux.getModel()!, context);

    return {
      results: [
        { format: 'OpenAI JSON', ...validateOpenaiChatFormat(piResponseToOpenaiJson(response)) },
        { format: 'Anthropic', ...validateAnthropicFormat(piResponseToAnthropicJson(response)) },
        { format: 'Gemini', ...validateGeminiFormat(piResponseToGeminiJson(response)) },
      ],
    };
  },
});

// 3. SSE 流式输出
testCases.push({
  name: 'OpenAI SSE 流式输出',
  run: async () => {
    const faux = fauxProvider({ api: 'openai-completions', provider: 't3' });
    faux.setResponses([fauxAssistantMessage([fauxText('Hello world')])]);
    const models = createModels(); models.setProvider(faux.provider);
    const { context } = openaiToPiContext({ messages: [{ role: 'user', content: 'Hi' }] });
    const stream = models.stream(faux.getModel()!, context);

    const allLines: string[] = [];
    for await (const event of stream) {
      allLines.push(...piEventToOpenaiSSE(event));
    }

    return { results: [{ format: 'OpenAI SSE', ...validateOpenaiSSEFormat(allLines) }] };
  },
});

// 4. Anthropic SSE 流式输出
testCases.push({
  name: 'Anthropic SSE 流式输出',
  run: async () => {
    const faux = fauxProvider({ api: 'openai-completions', provider: 't4' });
    faux.setResponses([fauxAssistantMessage([fauxText('Hello from Claude')])]);
    const models = createModels(); models.setProvider(faux.provider);
    const { context } = openaiToPiContext({ messages: [{ role: 'user', content: 'Hi Claude' }] });
    const stream = models.stream(faux.getModel()!, context);

    const allLines: string[] = [];
    for await (const event of stream) {
      allLines.push(...piEventToAnthropicSSE(event));
    }

    return { results: [{ format: 'Anthropic SSE', ...validateAnthropicSSEFormat(allLines) }] };
  },
});

// 5. Anthropic 输入 → 三种格式
testCases.push({
  name: 'Anthropic 文本输入 → 三种格式',
  run: async () => {
    const faux = fauxProvider({ api: 'openai-completions', provider: 't5' });
    faux.setResponses([fauxAssistantMessage([fauxText('2 + 2 = 4')])]);
    const models = createModels(); models.setProvider(faux.provider);
    const { context } = anthropicToPiContext({ messages: [{ role: 'user', content: 'What is 2+2?' }] });
    const response = await models.complete(faux.getModel()!, context);

    return {
      results: [
        { format: 'OpenAI JSON', ...validateOpenaiChatFormat(piResponseToOpenaiJson(response)) },
        { format: 'Anthropic', ...validateAnthropicFormat(piResponseToAnthropicJson(response)) },
        { format: 'Gemini', ...validateGeminiFormat(piResponseToGeminiJson(response)) },
      ],
    };
  },
});

// 6. Gemini 输入 → 三种格式
testCases.push({
  name: 'Gemini 文本输入 → 三种格式',
  run: async () => {
    const faux = fauxProvider({ api: 'openai-completions', provider: 't6' });
    faux.setResponses([fauxAssistantMessage([fauxText('Light speed is 299,792,458 m/s')])]);
    const models = createModels(); models.setProvider(faux.provider);
    const { context } = geminiToPiContext({ contents: [{ role: 'user', parts: [{ text: 'Speed of light?' }] }] });
    const response = await models.complete(faux.getModel()!, context);

    return {
      results: [
        { format: 'OpenAI JSON', ...validateOpenaiChatFormat(piResponseToOpenaiJson(response)) },
        { format: 'Anthropic', ...validateAnthropicFormat(piResponseToAnthropicJson(response)) },
        { format: 'Gemini', ...validateGeminiFormat(piResponseToGeminiJson(response)) },
      ],
    };
  },
});

// ============================================================
// 主程序
// ============================================================

interface ScenarioResult {
  name: string;
  results: { format: string; valid: boolean; errors: string[] }[];
}

async function main() {
  console.log('\n🔍 格式校验报告');
  console.log('   校验器: 基于官方 API 规范的字段级校验\n');

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  const failures: string[] = [];

  for (const tc of testCases) {
    process.stdout.write(`  ${tc.name.padEnd(40)} `);
    const { results } = await tc.run();
    const allValid = results.every(r => r.valid);
    totalTests += results.length;

    if (allValid) {
      totalPassed += results.length;
      process.stdout.write(`✅ (${results.map(r => r.format).join(', ')})\n`);
    } else {
      for (const r of results) {
        if (r.valid) {
          totalPassed++;
        } else {
          totalFailed++;
          failures.push(`  ${tc.name} > ${r.format}: ${r.errors.join('; ')}`);
        }
      }
      process.stdout.write(`❌\n`);
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 校验统计`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  总校验项: ${totalTests}`);
  console.log(`  通过:      ${totalPassed}`);
  console.log(`  失败:      ${totalFailed}`);
  console.log(`  通过率:    ${(totalPassed / totalTests * 100).toFixed(1)}%`);

  if (failures.length > 0) {
    console.log(`\n❌ 失败详情:`);
    failures.forEach(f => console.log(f));
    process.exit(1);
  } else {
    console.log(`\n✅ 所有格式校验通过！`);
  }
}

main().catch(console.error);
