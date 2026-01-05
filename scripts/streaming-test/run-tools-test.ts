/**
 * Tool Call Streaming Test Runner
 *
 * 运行工具调用流式测试场景，输出详细的测试结果
 */

import { scenarios } from './scenarios/streaming-tools.scenario';
import type { TestResult, AssertionResult } from './types';

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}

/**
 * 运行单个场景
 */
async function runScenario(scenario: any): Promise<TestResult> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 场景: ${scenario.name}`);
  console.log(`📝 ${scenario.description}`);
  console.log(`${'='.repeat(80)}`);

  const startTime = Date.now();

  try {
    // 执行场景
    console.log('⏳ 执行场景...');
    const result = await scenario.execute();

    // 运行断言
    console.log('🔍 验证断言...');
    const assertionResults: AssertionResult[] = [];

    for (const assertion of scenario.assertions) {
      console.log(`\n   检查: ${assertion.description || assertion.type}`);

      const validationResult = assertion.validator(result);
      const passed = typeof validationResult === 'boolean' ?
        validationResult :
        validationResult.passed;

      const assertionResult: AssertionResult = {
        type: assertion.type,
        passed,
        details: typeof validationResult === 'boolean' ?
          undefined :
          validationResult.details
      };

      assertionResults.push(assertionResult);

      // 输出结果
      if (passed) {
        console.log(`   ✅ PASSED`);
      } else {
        console.log(`   ❌ FAILED`);
      }

      // 输出详细信息
      if (assertionResult.details) {
        console.log('   📊 详情:');
        console.log(`      ${JSON.stringify(assertionResult.details, null, 2).split('\n').join('\n      ')}`);
      }
    }

    const duration = Date.now() - startTime;
    const allPassed = assertionResults.every(a => a.passed);

    console.log(`\n⏱️  耗时: ${duration}ms`);

    return {
      scenarioName: scenario.name,
      passed: allPassed,
      duration,
      assertions: assertionResults,
      data: result
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`\n❌ 场景执行失败: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(`   Stack: ${error.stack.split('\n').slice(1, 5).join('\n')}`);
    }

    return {
      scenarioName: scenario.name,
      passed: false,
      duration,
      assertions: [],
      error: errorMessage
    };
  }
}

/**
 * 运行所有场景
 */
async function runAllScenarios(): Promise<TestSummary> {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    🔧 Tool Call Streaming Tests                           ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    results.push(result);

    if (result.passed) {
      passed++;
      console.log(`\n✅ 场景通过: ${scenario.name}`);
    } else {
      failed++;
      console.log(`\n❌ 场景失败: ${scenario.name}`);
    }
  }

  // 输出总结
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              📊 测试总结                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log(`\n总计: ${results.length} 个场景`);
  console.log(`✅ 通过: ${passed} 个`);
  console.log(`❌ 失败: ${failed} 个`);

  // 输出失败的场景详情
  if (failed > 0) {
    console.log('\n❌ 失败的场景:');
    for (const result of results) {
      if (!result.passed) {
        console.log(`\n   ${result.scenarioName}`);
        if (result.error) {
          console.log(`   错误: ${result.error}`);
        } else {
          const failedAssertions = result.assertions?.filter(a => !a.passed) || [];
          for (const assertion of failedAssertions) {
            console.log(`   - ${assertion.type}: FAILED`);
            if (assertion.details) {
              console.log(`     ${JSON.stringify(assertion.details, null, 2).split('\n').join('\n     ')}`);
            }
          }
        }
      }
    }
  }

  // 输出关键发现
  console.log('\n🔍 关键发现:');
  printKeyFindings(results);

  return {
    total: results.length,
    passed,
    failed,
    results
  };
}

/**
 * 从测试结果中提取并打印关键发现
 */
function printKeyFindings(results: TestResult[]): void {
  const findings: string[] = [];

  // 分析场景 2 的增量输出检测结果
  const incrementalResult = results.find(r => r.scenarioName === 'Tool Call Incremental Streaming');
  if (incrementalResult?.data?.validation) {
    const validation = incrementalResult.data.validation;
    findings.push(`📌 Tool Call 模式: ${validation.pattern}`);
    findings.push(`   - 是否增量输出: ${validation.isIncremental ? '是' : '否'}`);
    findings.push(`   - Arguments chunks: ${validation.argumentChunks.length}`);

    if (validation.pattern === 'single-chunk') {
      findings.push(`   ⚠️  检测到 GLM-4 风格：一次性返回完整 arguments`);
      findings.push(`   💡 建议：前端需要在单个 chunk 中处理完整的 tool call`);
    } else if (validation.pattern === 'incremental') {
      findings.push(`   ✅ 检测到 OpenAI 标准风格：增量输出 arguments`);
      findings.push(`   💡 建议：前端需要累积拼接所有 arguments chunks`);
    }
  }

  // 分析场景 4 的 GLM-4 兼容性检测结果
  const glmCompatibilityResult = results.find(r => r.scenarioName === 'GLM-4 Single Chunk Detection');
  if (glmCompatibilityResult?.assertions) {
    const compatibilityAssertion = glmCompatibilityResult.assertions.find(a => a.type === 'playground_compatibility_check');
    if (compatibilityAssertion?.details) {
      const { compatibility, pattern, isIncremental, toolCallId, finishReason } = compatibilityAssertion.details;
      findings.push(`\n📌 GLM-4 Playground 兼容性分析:`);
      findings.push(`   - 兼容状态: ${compatibility.isCompatible ? '✅ 完全兼容' : '❌ 存在问题'}`);
      findings.push(`   - 严重程度: ${compatibility.severity}`);
      findings.push(`   - 输出模式: ${pattern}`);
      findings.push(`   - 增量输出: ${isIncremental ? '是' : '否'}`);
      findings.push(`   - Tool Call ID: ${toolCallId ? '✅' : '❌ 缺失'}`);
      findings.push(`   - Finish Reason: ${finishReason || '未检测到'}`);

      if (compatibility.issues && compatibility.issues.length > 0) {
        findings.push(`\n   ⚠️  检测到的问题:`);
        for (const issue of compatibility.issues) {
          findings.push(`      - ${issue}`);
        }
      }

      if (compatibilityAssertion.details.recommendation) {
        findings.push(`\n   💡 修复建议:\n${compatibilityAssertion.details.recommendation}`);
      }
    }
  }

  // 分析场景 4 的时序分析
  if (glmCompatibilityResult?.assertions) {
    const timingAssertion = glmCompatibilityResult.assertions.find(a => a.type === 'tool_call_timing_analysis');
    if (timingAssertion?.details) {
      const { isInstantToolCall, toolCallSpan, interpretation, frontendImpact } = timingAssertion.details;
      findings.push(`\n📌 Tool Call 时序分析:`);
      findings.push(`   - 是否瞬间完成: ${isInstantToolCall ? '是 ⚠️' : '否 ✅'}`);
      findings.push(`   - Tool Call 跨度: ${toolCallSpan} chunks`);
      findings.push(`   - 解读: ${interpretation}`);
      findings.push(`   - 前端影响: ${frontendImpact}`);
    }
  }

  // 分析场景 3 的结束信号检测结果
  const endSignalResult = results.find(r => r.scenarioName === 'Tool Call End Signal');
  if (endSignalResult?.assertions) {
    const finishReasonAssertion = endSignalResult.assertions.find(a => a.type === 'correct_finish_reason');
    if (finishReasonAssertion?.details) {
      const { finishReason, isCorrect } = finishReasonAssertion.details;
      findings.push(`\n📌 Finish Reason: ${finishReason}`);
      findings.push(`   - 是否正确: ${isCorrect ? '✅' : '❌'}`);
      if (!isCorrect) {
        findings.push(`   ⚠️  实际值: ${finishReason}, 期望: tool_calls`);
      }
    }
  }

  // 分析场景 1 的工具调用格式
  const singleToolResult = results.find(r => r.scenarioName === 'Single Tool Call (Calculator)');
  if (singleToolResult?.assertions) {
    const formatAssertion = singleToolResult.assertions.find(a => a.type === 'tool_call_format');
    if (formatAssertion?.details) {
      findings.push(`\n📌 Tool Call 格式验证:`);
      findings.push(`   - Tool Call ID: ${formatAssertion.details.hasId ? '✅' : '❌'}`);
      findings.push(`   - Function Name: ${formatAssertion.details.hasFunctionName ? '✅' : '❌'}`);
      findings.push(`   - Arguments: ${formatAssertion.details.hasArguments ? '✅' : '❌'}`);
      findings.push(`   - Valid JSON: ${formatAssertion.details.validArguments ? '✅' : '❌'}`);

      if (formatAssertion.details.parsedArguments) {
        findings.push(`   - Parsed Arguments: ${JSON.stringify(formatAssertion.details.parsedArguments)}`);
      }
    }
  }

  // 输出所有发现
  if (findings.length === 0) {
    findings.push('⚠️  未检测到足够的测试数据，请确保服务器正在运行');
  }

  for (const finding of findings) {
    console.log(finding);
  }
}

/**
 * 主函数
 */
async function main() {
  try {
    const summary = await runAllScenarios();

    // 根据测试结果设置退出码
    const exitCode = summary.failed > 0 ? 1 : 0;
    process.exit(exitCode);

  } catch (error) {
    console.error('\n❌ 测试运行失败:', error);
    process.exit(1);
  }
}

// 运行测试
main();

export { runAllScenarios, runScenario };
