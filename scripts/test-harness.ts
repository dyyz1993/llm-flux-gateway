/**
 * pi-ai 网关测试 Harness
 *
 * 快速测试新网关控制器的请求处理流程，不需要真实 API key。
 * 使用 pi-ai 的 Faux Provider 模拟上游响应。
 *
 * 用法:
 *   npx tsx scripts/test-harness.ts                          # 交互式菜单
 *   npx tsx scripts/test-harness.ts --scenario simple-text    # 直接跑某个场景
 *   npx tsx scripts/test-harness.ts --all                     # 批量跑所有测试夹具
 *   npx tsx scripts/test-harness.ts --validate                # 批量跑并验证输出格式
 *   npx tsx scripts/test-harness.ts --list                    # 列出所有场景
 */
import { createModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import type { AssistantMessageEvent, AssistantMessage, Context } from '@earendil-works/pi-ai';

// ============================================================
// 适配器导入
// ============================================================

async function loadAdapters() {
  const inputOpenAI = (await import('../src/server/adapters/input/openai.adapter')).openaiToPiContext;
  const inputAnthropic = (await import('../src/server/adapters/input/anthropic.adapter')).anthropicToPiContext;
  const inputGemini = (await import('../src/server/adapters/input/gemini.adapter')).geminiToPiContext;
  const outputOpenAI = await import('../src/server/adapters/output/openai.adapter');
  const outputAnthropic = await import('../src/server/adapters/output/anthropic.adapter');
  const outputGemini = await import('../src/server/adapters/output/gemini.adapter');
  return { inputOpenAI, inputAnthropic, inputGemini, outputOpenAI, outputAnthropic, outputGemini };
}

// ============================================================
// 场景定义
// ============================================================

interface Scenario {
  id: string;
  name: string;
  description: string;
  run: () => Promise<void>;
}

function makeScenarios(adapters: Awaited<ReturnType<typeof loadAdapters>>): Scenario[] {
  const { inputOpenAI, inputAnthropic, outputOpenAI, outputAnthropic, outputGemini } = adapters;

  // ========================================
  // 场景 1: 简单文本
  // ========================================
  const simpleText: Scenario = {
    id: 'simple-text',
    name: '简单文本对话',
    description: 'OpenAI 格式请求 → pi-ai → OpenAI 格式响应',
    run: async () => {
      const { context, options } = inputOpenAI({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the capital of France?' },
        ],
        temperature: 0.7,
      });

      const faux = fauxProvider({ api: 'openai-completions', provider: 'harness' });
      faux.setResponses([fauxAssistantMessage([fauxText('The capital of France is Paris.')])]);
      const models = createModels();
      models.setProvider(faux.provider);
      const response = await models.complete(faux.getModel()!, context, options);

      const output = outputOpenAI.piResponseToOpenaiJson(response);
      printResult('OpenAI Output', output);
    },
  };

  // ========================================
  // 场景 2: 跨格式 (OpenAI → Anthropic)
  // ========================================
  const crossFormat: Scenario = {
    id: 'cross-format',
    name: '跨格式输出（OpenAI 输入 → Anthropic 输出）',
    description: '验证输入格式和输出格式可以不同',
    run: async () => {
      const { context } = inputOpenAI({
        messages: [{ role: 'user', content: 'Tell me a joke.' }],
      });

      const faux = fauxProvider({ api: 'openai-completions', provider: 'harness' });
      faux.setResponses([fauxAssistantMessage([fauxText('Why did the chicken cross the road?')])]);
      const models = createModels();
      models.setProvider(faux.provider);
      const response = await models.complete(faux.getModel()!, context);

      const output = outputAnthropic.piResponseToAnthropicJson(response);
      printResult('Anthropic Output', output);
    },
  };

  // ========================================
  // 场景 3: 工具调用
  // ========================================
  const toolCall: Scenario = {
    id: 'tool-call',
    name: '工具调用',
    description: 'OpenAI 请求含 tools → pi-ai 返回工具调用 → OpenAI 响应',
    run: async () => {
      const { context } = inputOpenAI({
        messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather for a city',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string', description: 'City name' } },
              required: ['city'],
            },
          },
        }],
      });

      const faux = fauxProvider({ api: 'openai-completions', provider: 'harness' });
      faux.setResponses([fauxAssistantMessage([
        fauxToolCall('get_weather', { city: 'Tokyo' }),
      ], { stopReason: 'toolUse' })]);
      const models = createModels();
      models.setProvider(faux.provider);
      const response = await models.complete(faux.getModel()!, context);

      const output = outputOpenAI.piResponseToOpenaiJson(response);
      printResult('OpenAI Output (Tool Call)', output);
    },
  };

  // ========================================
  // 场景 4: 混合内容（文本 + 工具调用）
  // ========================================
  const mixedContent: Scenario = {
    id: 'mixed-content',
    name: '混合内容（文本 + 工具调用）',
    run: async () => {
      const { context } = inputOpenAI({
        messages: [{ role: 'user', content: 'Check weather in Tokyo and London' }],
        tools: [{
          type: 'function',
          function: { name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } },
        }],
      });

      const faux = fauxProvider({ api: 'openai-completions', provider: 'harness' });
      faux.setResponses([fauxAssistantMessage([
        fauxText("I'll check both cities."),
        fauxToolCall('get_weather', { city: 'Tokyo' }),
        fauxToolCall('get_weather', { city: 'London' }),
      ], { stopReason: 'toolUse' })]);
      const models = createModels();
      models.setProvider(faux.provider);
      const response = await models.complete(faux.getModel()!, context);

      printResult('OpenAI Output (Mixed)', outputOpenAI.piResponseToOpenaiJson(response));
      printResult('Anthropic Output (Cross-format)', outputAnthropic.piResponseToAnthropicJson(response));
      printResult('Gemini Output (Cross-format)', outputGemini.piResponseToGeminiJson(response));
    },
  };

  // ========================================
  // 场景 5: 流式输出
  // ========================================
  const streaming: Scenario = {
    id: 'streaming',
    name: '流式输出',
    description: '验证流式事件 → OpenAI SSE 格式',
    run: async () => {
      const { context } = inputOpenAI({
        messages: [{ role: 'user', content: 'Count from 1 to 3.' }],
      });

      const faux = fauxProvider({ api: 'openai-completions', provider: 'harness' });
      faux.setResponses([fauxAssistantMessage([fauxText('One, two, three.')])]);
      const models = createModels();
      models.setProvider(faux.provider);
      const stream = models.stream(faux.getModel()!, context);

      console.log('\n🔵 SSE Output:');
      for await (const event of stream) {
        const sseLines = [...outputOpenAI.piEventToOpenaiSSE(event)];
        for (const line of sseLines) {
          process.stdout.write(line);
        }
      }
      console.log('\n');
    },
  };

  // ========================================
  // 场景 6: Anthropic 输入
  // ========================================
  const anthropicInput: Scenario = {
    id: 'anthropic-input',
    name: 'Anthropic 格式输入 → OpenAI 输出',
    run: async () => {
      const { context } = inputAnthropic({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: 'You are Claude.',
        messages: [{ role: 'user', content: 'What is the meaning of life?' }],
      });

      const faux = fauxProvider({ api: 'openai-completions', provider: 'harness' });
      faux.setResponses([fauxAssistantMessage([fauxText('42')])]);
      const models = createModels();
      models.setProvider(faux.provider);
      const response = await models.complete(faux.getModel()!, context);

      const output = outputOpenAI.piResponseToOpenaiJson(response);
      printResult('OpenAI Output (from Anthropic input)', output);
    },
  };

  // ========================================
  // 场景 7: 错误处理
  // ========================================
  const errorCase: Scenario = {
    id: 'error',
    name: '错误处理',
    run: async () => {
      const { context } = inputOpenAI({
        messages: [{ role: 'user', content: 'Trigger error' }],
      });

      const faux = fauxProvider({ api: 'openai-completions', provider: 'harness' });
      faux.setResponses([fauxAssistantMessage([fauxText('')], { stopReason: 'error', errorMessage: 'Simulated upstream error' })]);
      const models = createModels();
      models.setProvider(faux.provider);

      try {
        const response = await models.complete(faux.getModel()!, context);
        printResult('Error Response', { stopReason: response.stopReason, errorMessage: response.errorMessage });
      } catch (e: any) {
        console.log('❌ Caught error:', e.message);
      }
    },
  };

  return [simpleText, crossFormat, toolCall, mixedContent, streaming, anthropicInput, errorCase];
}

// ============================================================
// 打印结果
// ============================================================

function printResult(title: string, data: any) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 ${title}`);
  console.log(`${'='.repeat(60)}`);
  console.log(JSON.stringify(data, null, 2));
}

// ============================================================
// CLI 入口
// ============================================================

async function main() {
  const adapters = await loadAdapters();
  const scenarios = makeScenarios(adapters);

  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    console.log('\n📋 可用场景:\n');
    for (const s of scenarios) {
      console.log(`  ${s.id.padEnd(20)} ${s.name}`);
      if (s.description) console.log(`  ${' '.repeat(20)} ${s.description}`);
      console.log();
    }
    return;
  }

  if (args.includes('--all') || args.includes('--validate')) {
    const { generateFixtures } = await import('./test-fixtures');
    const { inputOpenAI, inputAnthropic, inputGemini, outputOpenAI, outputAnthropic, outputGemini } = adapters;
    const fixtures = generateFixtures();
    const validate = args.includes('--validate');

    let pass = 0;
    let fail = 0;

    console.log(`\n🧪 运行 ${fixtures.length} 个测试夹具...\n`);

    for (const fx of fixtures) {
      process.stdout.write(`  ${fx.id.padEnd(35)} `);

      try {
        // 1. 输入适配
        const adapter = fx.input.format === 'openai' ? inputOpenAI : fx.input.format === 'anthropic' ? inputAnthropic : inputGemini;
        const { context } = adapter(fx.input.body);

        // 2. pi-ai 调用
        const faux = fauxProvider({ api: 'openai-completions', provider: fx.id });
        faux.setResponses([fx.fauxResponse]);
        const models = createModels();
        models.setProvider(faux.provider);
        const response = await models.complete(faux.getModel()!, context);

        // 3. 输出适配 + 验证
        for (const fmt of fx.outputFormats) {
          let output: any;
          switch (fmt) {
            case 'openai':
              output = outputOpenAI.piResponseToOpenaiJson(response);
              if (output.object !== 'chat.completion') throw new Error('Missing object');
              if (!output.choices?.[0]) throw new Error('Missing choices');
              break;
            case 'anthropic':
              output = outputAnthropic.piResponseToAnthropicJson(response);
              if (output.type !== 'message') throw new Error('Missing type');
              if (!output.content) throw new Error('Missing content');
              break;
            case 'gemini':
              output = outputGemini.piResponseToGeminiJson(response);
              if (!output.candidates?.[0]) throw new Error('Missing candidates');
              break;
          }
        }

        process.stdout.write(`✅  (${fx.outputFormats.join(', ')})\n`);
        pass++;
      } catch (e: any) {
        process.stdout.write(`❌  ${e.message}\n`);
        fail++;
      }
    }

    console.log(`\n📊 结果: ${pass} 通过, ${fail} 失败, ${fixtures.length} 总计\n`);
    if (fail > 0) process.exit(1);
    return;
  }

  const scenarioFlag = args.find(a => a.startsWith('--scenario='));
  if (scenarioFlag) {
    const id = scenarioFlag.split('=')[1];
    const scenario = scenarios.find(s => s.id === id);
    if (!scenario) {
      console.error(`❌ 未找到场景: ${id}`);
      console.log('可用场景:', scenarios.map(s => s.id).join(', '));
      process.exit(1);
    }
    console.log(`\n🧪 运行场景: ${scenario.name}`);
    await scenario.run();
    return;
  }

  // 交互模式
  console.log('\n🧪 pi-ai 网关测试 Harness\n');
  console.log('选择要运行的场景:\n');
  for (let i = 0; i < scenarios.length; i++) {
    console.log(`  [${i + 1}] ${scenarios[i]!.name}`);
  }
  console.log(`  [a] 全部运行`);
  console.log(`  [q] 退出\n`);

  // 如果没有 TTY 则全部运行
  if (!process.stdin.isTTY) {
    console.log('非交互模式，运行所有场景...\n');
    for (const s of scenarios) {
      console.log(`\n▶️  ${s.name}`);
      await s.run();
    }
    return;
  }

  // 简单的 TTY 输入处理
  process.stdout.write('选择: ');
  for await (const line of console) {
    const choice = line.trim().toLowerCase();
    if (choice === 'q') break;
    if (choice === 'a') {
      for (const s of scenarios) {
        console.log(`\n▶️  ${s.name}`);
        await s.run();
      }
    } else {
      const idx = parseInt(choice) - 1;
      const scenario = scenarios[idx];
      if (scenario) {
        await scenario.run();
      } else {
        console.log('无效选择');
      }
    }
    process.stdout.write('\n选择: ');
  }
}

main().catch(console.error);
