#!/usr/bin/env tsx
/**
 * 流式测试工具 CLI
 *
 * 命令行接口，用于运行流式响应测试
 */

import { Logger } from './utils/logger.js';
// import { StreamingTestRunner } from './core/test-runner.js';
// import { StreamParser } from './core/stream-parser.js';
// import { ResponseValidator } from './core/validator.js';
import { ConsoleReporter, ReportFormat } from './reporters/console-reporter.js';
import { CONFIG } from './config.js';

/**
 * CLI 选项
 */
interface CLIOptions {
  /** 场景名称 */
  scenario?: string;

  /** 详细输出 */
  verbose?: boolean;

  /** 报告格式 */
  format?: 'concise' | 'standard' | 'verbose';

  /** 是否保存原始响应 */
  saveRaw?: boolean;

  /** 自定义配置文件 */
  config?: string;

  /** 帮助 */
  help?: boolean;
}

/**
 * 解析命令行参数
 */
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--scenario':
      case '-s':
        options.scenario = args[++i];
        break;

      case '--verbose':
      case '-v':
        options.verbose = true;
        break;

      case '--format':
      case '-f':
        options.format = args[++i] as 'concise' | 'standard' | 'verbose';
        break;

      case '--save-raw':
        options.saveRaw = true;
        break;

      case '--config':
      case '-c':
        options.config = args[++i];
        break;

      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
流式测试工具 - 测试 LLM 网关的流式响应

用法:
  npm run test:streaming -- [options]

选项:
  --scenario, -s <name>   运行指定场景（默认：运行所有场景）
  --verbose, -v           启用详细输出
  --format, -f <format>   报告格式：concise, standard, verbose（默认：standard）
  --save-raw              保存原始响应数据
  --config, -c <path>     自定义配置文件路径
  --help, -h              显示帮助信息

示例:
  # 运行所有测试
  npm run test:streaming

  # 运行特定场景
  npm run test:streaming -- --scenario basic-streaming

  # 详细输出
  npm run test:streaming -- --verbose

  # 使用 verbose 格式
  npm run test:streaming -- --format verbose

环境变量:
  GATEWAY_URL            网关 URL（默认：http://localhost:3000/v1）
  TEST_TIMEOUT           请求超时（毫秒）
  VERBOSE                详细输出模式
  TEST_API_KEY           API 密钥
  TEST_OUTPUT_DIR        测试结果输出目录
  SAVE_RAW_RESPONSES     保存原始响应
  CHUNK_TIMEOUT          块接收超时（毫秒）
  MAX_RETRIES            最大重试次数
  RETRY_DELAY            重试延迟（毫秒）
`);
}

/**
 * 主函数
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // 创建 logger
  const logger = new Logger(args.verbose ?? CONFIG.verbose);

  logger.title('LLM Flux Gateway - Streaming Test Tool');
  logger.log(`Gateway URL: ${CONFIG.baseURL}`);
  logger.log(`Timeout: ${CONFIG.timeout}ms`);
  logger.log(`Verbose: ${args.verbose ?? CONFIG.verbose}`);

  // 动态导入场景
  // 注意：这里需要根据实际场景文件调整
  logger.subsection('Loading Scenarios');

  // TODO: 实现场景加载逻辑
  // const scenarios = await loadScenarios(args.scenario);

  logger.warn('No scenarios implemented yet');
  logger.log('Please create scenario files in scripts/streaming-test/scenarios/');

  // 示例：如何使用测试运行器
  /*
  const parser = new StreamParser({ debug: args.verbose });
  const validator = new ResponseValidator();
  const runner = new StreamingTestRunner(logger, {
    verbose: args.verbose,
    saveRawResponses: args.saveRaw,
    parser,
    validator,
  }, {
    onTestStart: (name) => logger.log(`Starting: ${name}`),
    onTestComplete: (result) => {
      const reporter = new ConsoleReporter({
        format: args.format === 'verbose' ? ReportFormat.VERBOSE :
                args.format === 'concise' ? ReportFormat.CONCISE :
                ReportFormat.STANDARD,
        showWarnings: true,
      });
      reporter.reportResult(result);
    },
    onChunk: (chunk) => {
      if (args.verbose) {
        logger.streamChunk(chunk.index, chunk.type, chunk.content);
      }
    },
  });

  const results = await runner.runScenarios(scenarios);

  // 检查是否所有测试都通过
  const allPassed = results.every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
  */
}

// 运行主函数
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
