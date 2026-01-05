/**
 * 测试运行器
 *
 * 协调测试场景的执行、监控和结果收集
 */

import type { StreamChunk } from './stream-parser.js';
import { StreamParser } from './stream-parser.js';
import { ResponseValidator } from './validator.js';
import type { BaseScenario, ScenarioResult, AssertionResult } from '../scenarios/base-scenario.js';
import type { Logger } from '../utils/logger.js';

/**
 * 测试运行选项
 */
export interface TestRunnerOptions {
  /** 是否保存原始响应 */
  saveRawResponses?: boolean;

  /** 是否启用详细日志 */
  verbose?: boolean;

  /** 自定义验证器 */
  validator?: ResponseValidator;

  /** 自定义解析器 */
  parser?: StreamParser;
}

/**
 * 测试运行结果
 */
export interface TestRunResult {
  /** 场景名称 */
  scenarioName: string;

  /** 是否通过 */
  passed: boolean;

  /** 执行时间（毫秒） */
  duration: number;

  /** 场景结果 */
  scenarioResult: ScenarioResult;

  /** 错误信息 */
  error?: string;
}

/**
 * 进度回调
 */
export interface ProgressCallbacks {
  /** 测试开始时调用 */
  onTestStart?: (scenarioName: string) => void;

  /** 测试结束时调用 */
  onTestComplete?: (result: TestRunResult) => void;

  /** 接收到块时调用 */
  onChunk?: (chunk: StreamChunk) => void;

  /** 发生错误时调用 */
  onError?: (error: Error) => void;
}

export class StreamingTestRunner {
  private options: Required<TestRunnerOptions>;
  private logger: Logger;
  private progressCallbacks: ProgressCallbacks;

  constructor(logger: Logger, options: TestRunnerOptions = {}, callbacks: ProgressCallbacks = {}) {
    this.logger = logger;
    this.progressCallbacks = callbacks;
    this.options = {
      saveRawResponses: options.saveRawResponses ?? false,
      verbose: options.verbose ?? false,
      validator: options.validator ?? new ResponseValidator(),
      parser: options.parser ?? new StreamParser(),
    };
  }

  /**
   * 运行单个测试场景
   */
  async runScenario(scenario: BaseScenario): Promise<TestRunResult> {
    const startTime = Date.now();
    let scenarioResult: ScenarioResult;
    let error: string | undefined;

    this.logger.title(`Running: ${scenario.name}`);
    this.logger.log(`Description: ${scenario.description}`);
    this.logger.log(`Provider: ${scenario.config.provider}`);
    this.logger.log(`Model: ${scenario.config.model}`);
    this.logger.log(`Stream: ${scenario.config.stream}`);

    this.progressCallbacks.onTestStart?.(scenario.name);

    try {
      // 执行场景
      scenarioResult = await scenario.execute();

      // 验证结果
      const validation = this.options.validator.validateStream(scenarioResult.chunks);
      scenarioResult.validationErrors = validation.errors;
      scenarioResult.validationWarnings = validation.warnings;

      // 检查是否通过
      const passed =
        validation.errors.length === 0 &&
        scenarioResult.assertionResults.every((a) => a.passed);

      scenarioResult.passed = passed;
      scenarioResult.duration = Date.now() - startTime;

      this.logger.success(`Test completed in ${scenarioResult.duration}ms`);

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.logger.error('Test failed', err);

      scenarioResult = {
        scenarioName: scenario.name,
        passed: false,
        duration: Date.now() - startTime,
        chunks: [],
        fullContent: '',
        toolCalls: [],
        assertionResults: [],
        validationErrors: [error],
        validationWarnings: [],
        error,
      };
    }

    const result: TestRunResult = {
      scenarioName: scenario.name,
      passed: scenarioResult.passed,
      duration: scenarioResult.duration,
      scenarioResult,
      error,
    };

    this.progressCallbacks.onTestComplete?.(result);

    return result;
  }

  /**
   * 运行多个测试场景
   */
  async runScenarios(scenarios: BaseScenario[]): Promise<TestRunResult[]> {
    this.logger.title(`Running ${scenarios.length} scenarios`);

    const results: TestRunResult[] = [];

    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario);
      results.push(result);

      // 添加分隔线
      this.logger.separator();
    }

    // 输出总结
    this.printSummary(results);

    return results;
  }

  /**
   * 监控流式响应
   */
  async monitorStream(
    response: Response,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<{ chunks: StreamChunk[]; fullContent: string; toolCalls: any[] }> {
    const chunks: StreamChunk[] = [];
    const toolCallsMap = new Map<number, any>();
    let fullContent = '';

    const parser = this.options.parser;

    try {
      for await (const chunk of parser.parseStream(response)) {
        chunks.push(chunk);

        // 累积内容
        if (chunk.type === 'content' && chunk.content) {
          fullContent += chunk.content;

          if (this.options.verbose) {
            this.logger.streamChunk(chunk.index, chunk.type, chunk.content);
          }
        }

        // 处理工具调用
        if (chunk.type === 'tool_call' && chunk.toolCall) {
          const index = chunk.toolCall.index ?? 0;
          if (!toolCallsMap.has(index)) {
            toolCallsMap.set(index, {
              id: chunk.toolCall.id,
              type: chunk.toolCall.type,
              function: {
                name: chunk.toolCall.function?.name || '',
                arguments: '',
              },
            });
          }

          const toolCall = toolCallsMap.get(index)!;

          if (chunk.toolCall.function?.name) {
            toolCall.function.name = chunk.toolCall.function.name;
          }

          if (chunk.toolCall.function?.arguments) {
            toolCall.function.arguments += chunk.toolCall.function.arguments;
          }

          if (this.options.verbose) {
            this.logger.streamChunk(chunk.index, chunk.type, JSON.stringify(chunk.toolCall));
          }
        }

        // 验证块
        const validation = this.options.validator.validateChunk(chunk);
        if (!validation.isValid) {
          this.logger.warn(`Chunk #${chunk.index} validation failed:`);
          validation.errors.forEach((err) => this.logger.warn(`  - ${err}`));
        }

        if (validation.warnings.length > 0 && this.options.verbose) {
          validation.warnings.forEach((warn) => this.logger.warn(`  - ${warn}`));
        }

        // 回调
        onChunk(chunk);
        this.progressCallbacks.onChunk?.(chunk);
      }

      return {
        chunks,
        fullContent,
        toolCalls: Array.from(toolCallsMap.values()),
      };
    } catch (err) {
      this.logger.error('Stream monitoring failed', err);
      throw err;
    }
  }

  /**
   * 输出测试总结
   */
  private printSummary(results: TestRunResult[]): void {
    this.logger.title('Test Summary');

    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = total - passed;

    this.logger.log(`Total: ${total}`);
    this.logger.success(`Passed: ${passed}`);
    if (failed > 0) {
      this.logger.error(`Failed: ${failed}`);
    }

    // 详细结果
    this.logger.subsection('Detailed Results');
    const headers = ['Scenario', 'Status', 'Duration', 'Chunks', 'Errors'];
    const rows = results.map((r) => [
      r.scenarioName,
      r.passed ? '✓ PASS' : '✗ FAIL',
      `${r.duration}ms`,
      String(r.scenarioResult.chunks.length),
      String(r.scenarioResult.validationErrors.length),
    ]);

    this.logger.table(headers, rows);

    // 失败的测试
    const failedTests = results.filter((r) => !r.passed);
    if (failedTests.length > 0) {
      this.logger.subsection('Failed Tests');
      failedTests.forEach((r) => {
        this.logger.log(`\n${r.scenarioName}:`);
        r.scenarioResult.validationErrors.forEach((err) => this.logger.log(`  - ${err}`));

        r.scenarioResult.assertionResults
          .filter((a) => !a.passed)
          .forEach((a) => {
            this.logger.log(`  - Assertion failed: ${a.description}`);
            this.logger.log(`    Expected: ${a.expected}`);
            this.logger.log(`    Actual: ${a.actual}`);
          });
      });
    }
  }
}
