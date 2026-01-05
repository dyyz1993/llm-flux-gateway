/**
 * 控制台报告器
 *
 * 将测试结果输出到控制台，支持多种格式和详细级别
 */

import type { TestRunResult } from '../core/test-runner.js';
// import type { ScenarioResult } from '../scenarios/base-scenario.js';

/**
 * 报告格式
 */
export enum ReportFormat {
  /** 简洁格式 */
  CONCISE,

  /** 标准格式 */
  STANDARD,

  /** 详细格式 */
  VERBOSE,
}

/**
 * 报告选项
 */
export interface ReportOptions {
  /** 报告格式 */
  format?: ReportFormat;

  /** 是否显示颜色 */
  colors?: boolean;

  /** 是否显示堆栈跟踪 */
  showStack?: boolean;

  /** 是否显示所有块 */
  showAllChunks?: boolean;

  /** 是否显示验证警告 */
  showWarnings?: boolean;
}

export class ConsoleReporter {
  private options: Required<ReportOptions>;

  constructor(options: ReportOptions = {}) {
    this.options = {
      format: options.format ?? ReportFormat.STANDARD,
      colors: options.colors ?? true,
      showStack: options.showStack ?? false,
      showAllChunks: options.showAllChunks ?? false,
      showWarnings: options.showWarnings ?? true,
    };
  }

  /**
   * 报告单个测试结果
   */
  reportResult(result: TestRunResult): void {
    switch (this.options.format) {
      case ReportFormat.CONCISE:
        this.reportConcise(result);
        break;
      case ReportFormat.STANDARD:
        this.reportStandard(result);
        break;
      case ReportFormat.VERBOSE:
        this.reportVerbose(result);
        break;
    }
  }

  /**
   * 报告多个测试结果
   */
  reportResults(results: TestRunResult[]): void {
    this.printHeader('Test Results');

    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const failed = total - passed;
    const duration = results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n${this.colorize('Total Tests:', 'cyan')} ${total}`);
    console.log(`${this.colorize('Passed:', 'green')} ${passed}`);
    if (failed > 0) {
      console.log(`${this.colorize('Failed:', 'red')} ${failed}`);
    }
    console.log(`${this.colorize('Total Duration:', 'cyan')} ${duration}ms`);
    console.log(`${this.colorize('Average Duration:', 'cyan')} ${Math.round(duration / total)}ms`);

    // 测试列表
    console.log('\n' + this.colorize('Test Results:', 'cyan'));
    results.forEach((result) => {
      const status = result.passed ? this.colorize('✓ PASS', 'green') : this.colorize('✗ FAIL', 'red');
      console.log(`  ${status} ${result.scenarioName} (${result.duration}ms)`);
    });

    // 失败详情
    const failedResults = results.filter((r) => !r.passed);
    if (failedResults.length > 0) {
      console.log('\n' + this.colorize('Failed Tests:', 'red'));
      failedResults.forEach((result) => {
        this.printFailureDetails(result);
      });
    }
  }

  /**
   * 简洁格式
   */
  private reportConcise(result: TestRunResult): void {
    const status = result.passed ? this.colorize('✓', 'green') : this.colorize('✗', 'red');
    const duration = this.colorize(`${result.duration}ms`, 'cyan');
    console.log(`${status} ${result.scenarioName} (${duration})`);
  }

  /**
   * 标准格式
   */
  private reportStandard(result: TestRunResult): void {
    const { scenarioResult } = result;
    const status = result.passed ? this.colorize('PASS', 'green') : this.colorize('FAIL', 'red');

    console.log(`\n${this.colorize('Test:', 'cyan')} ${result.scenarioName}`);
    console.log(`${this.colorize('Status:', 'cyan')} ${status}`);
    console.log(`${this.colorize('Duration:', 'cyan')} ${result.duration}ms`);
    console.log(`${this.colorize('Chunks:', 'cyan')} ${scenarioResult.chunks.length}`);
    console.log(`${this.colorize('Content Length:', 'cyan')} ${scenarioResult.fullContent.length}`);

    if (scenarioResult.toolCalls.length > 0) {
      console.log(`${this.colorize('Tool Calls:', 'cyan')} ${scenarioResult.toolCalls.length}`);
    }

    if (scenarioResult.usage) {
      console.log(
        `${this.colorize('Tokens:', 'cyan')} ${scenarioResult.usage.prompt_tokens} + ${scenarioResult.usage.completion_tokens} = ${scenarioResult.usage.total_tokens || scenarioResult.usage.prompt_tokens + scenarioResult.usage.completion_tokens}`
      );
    }

    if (scenarioResult.validationErrors.length > 0) {
      console.log(`\n${this.colorize('Errors:', 'red')}`);
      scenarioResult.validationErrors.forEach((err) => console.log(`  - ${err}`));
    }

    if (this.options.showWarnings && scenarioResult.validationWarnings.length > 0) {
      console.log(`\n${this.colorize('Warnings:', 'yellow')}`);
      scenarioResult.validationWarnings.forEach((warn) => console.log(`  - ${warn}`));
    }
  }

  /**
   * 详细格式
   */
  private reportVerbose(result: TestRunResult): void {
    this.reportStandard(result);

    const { scenarioResult } = result;

    // 显示断言结果
    if (scenarioResult.assertionResults.length > 0) {
      console.log(`\n${this.colorize('Assertions:', 'cyan')}`);
      scenarioResult.assertionResults.forEach((assertion) => {
        const status = assertion.passed ? this.colorize('✓', 'green') : this.colorize('✗', 'red');
        console.log(`  ${status} ${assertion.description}`);
        console.log(`    Expected: ${JSON.stringify(assertion.expected)}`);
        console.log(`    Actual: ${JSON.stringify(assertion.actual)}`);
        if (assertion.error) {
          console.log(`    Error: ${assertion.error}`);
        }
      });
    }

    // 显示所有块
    if (this.options.showAllChunks && scenarioResult.chunks.length > 0) {
      console.log(`\n${this.colorize('Chunks:', 'cyan')}`);
      scenarioResult.chunks.forEach((chunk) => {
        this.printChunk(chunk);
      });
    }

    // 显示完整内容
    if (scenarioResult.fullContent) {
      console.log(`\n${this.colorize('Full Content:', 'cyan')}`);
      console.log(scenarioResult.fullContent);
    }

    // 显示工具调用
    if (scenarioResult.toolCalls.length > 0) {
      console.log(`\n${this.colorize('Tool Calls:', 'cyan')}`);
      scenarioResult.toolCalls.forEach((toolCall, i) => {
        console.log(`  [${i}] ${toolCall.function?.name || '(unnamed)'}`);
        console.log(`    Arguments: ${toolCall.function?.arguments || '(none)'}`);
      });
    }
  }

  /**
   * 打印失败详情
   */
  private printFailureDetails(result: TestRunResult): void {
    console.log(`\n  ${this.colorize(result.scenarioName, 'red')}`);

    const { scenarioResult } = result;

    if (scenarioResult.validationErrors.length > 0) {
      console.log('  Validation Errors:');
      scenarioResult.validationErrors.forEach((err) => console.log(`    - ${err}`));
    }

    const failedAssertions = scenarioResult.assertionResults.filter((a) => !a.passed);
    if (failedAssertions.length > 0) {
      console.log('  Failed Assertions:');
      failedAssertions.forEach((assertion) => {
        console.log(`    - ${assertion.description}`);
        console.log(`      Expected: ${JSON.stringify(assertion.expected)}`);
        console.log(`      Actual: ${JSON.stringify(assertion.actual)}`);
      });
    }

    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
  }

  /**
   * 打印单个块
   */
  private printChunk(chunk: any): void {
    const typeColor = this.getTypeColor(chunk.type);
    console.log(`  [${chunk.index}] ${this.colorize(chunk.type, typeColor)}`);

    if (chunk.content) {
      const preview = chunk.content.length > 50 ? `${chunk.content.substring(0, 50)}...` : chunk.content;
      console.log(`    Content: ${preview}`);
    }

    if (chunk.toolCall) {
      console.log(`    Tool: ${chunk.toolCall.function?.name || '(unnamed)'}`);
    }

    if (chunk.finishReason) {
      console.log(`    Finish Reason: ${chunk.finishReason}`);
    }

    if (chunk.timestamp) {
      const date = new Date(chunk.timestamp);
      console.log(`    Time: ${date.toISOString()}`);
    }
  }

  /**
   * 打印标题
   */
  private printHeader(title: string): void {
    console.log('\n' + this.colorize('='.repeat(60), 'cyan'));
    console.log(this.colorize(`  ${title}`, 'cyan'));
    console.log(this.colorize('='.repeat(60), 'cyan'));
  }

  /**
   * 获取类型对应的颜色
   */
  private getTypeColor(type: string): string {
    const colors: Record<string, string> = {
      content: 'green',
      tool_call: 'yellow',
      metadata: 'blue',
      error: 'red',
      end: 'cyan',
    };
    return colors[type] || 'white';
  }

  /**
   * 终端颜色化
   */
  private colorize(text: string, color: string): string {
    if (!this.options.colors) {
      return text;
    }

    const colors: Record<string, string> = {
      reset: '\x1b[0m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
    };

    return `${colors[color] || ''}${text}${colors.reset}`;
  }
}
