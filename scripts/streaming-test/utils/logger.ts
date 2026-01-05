/**
 * 日志工具
 *
 * 提供统一的日志输出接口，支持不同级别的日志和颜色高亮
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SUCCESS = 4,
}

export class Logger {
  private level: LogLevel;
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
    this.level = verbose ? LogLevel.DEBUG : LogLevel.INFO;
  }

  /**
   * 输出调试信息（仅在 verbose 模式下）
   */
  debug(message: string, data?: unknown): void {
    if (this.verbose && this.level <= LogLevel.DEBUG) {
      const timestamp = new Date().toISOString();
      const prefix = this.colorize('[DEBUG]', 'gray');
      console.debug(`${prefix} ${timestamp} ${message}`);
      if (data) {
        console.debug(this.colorize(JSON.stringify(data, null, 2), 'gray'));
      }
    }
  }

  /**
   * 输出普通信息
   */
  log(message: string): void {
    const timestamp = new Date().toISOString();
    const prefix = this.colorize('[INFO]', 'blue');
    console.log(`${prefix} ${timestamp} ${message}`);
  }

  /**
   * 输出错误信息
   */
  error(message: string, error?: unknown): void {
    const timestamp = new Date().toISOString();
    const prefix = this.colorize('[ERROR]', 'red');
    console.error(`${prefix} ${timestamp} ${message}`);

    if (error) {
      if (error instanceof Error) {
        console.error(this.colorize(`  Error: ${error.message}`, 'red'));
        if (this.verbose && error.stack) {
          console.error(this.colorize(`  Stack: ${error.stack}`, 'red'));
        }
      } else {
        console.error(this.colorize(`  ${JSON.stringify(error, null, 2)}`, 'red'));
      }
    }
  }

  /**
   * 输出警告信息
   */
  warn(message: string): void {
    const timestamp = new Date().toISOString();
    const prefix = this.colorize('[WARN]', 'yellow');
    console.warn(`${prefix} ${timestamp} ${message}`);
  }

  /**
   * 输出成功信息
   */
  success(message: string): void {
    const timestamp = new Date().toISOString();
    const prefix = this.colorize('[SUCCESS]', 'green');
    console.log(`${prefix} ${timestamp} ${message}`);
  }

  /**
   * 输出分隔线
   */
  separator(char: string = '=', length: number = 60): void {
    console.log(char.repeat(length));
  }

  /**
   * 输出标题
   */
  title(title: string): void {
    this.separator('=');
    console.log(this.colorize(`  ${title}`, 'cyan'));
    this.separator('=');
  }

  /**
   * 输出子标题
   */
  subsection(title: string): void {
    console.log(this.colorize(`\n▶ ${title}`, 'cyan'));
  }

  /**
   * 输出测试步骤
   */
  step(step: number, total: number, description: string): void {
    const prefix = this.colorize(`[${step}/${total}]`, 'magenta');
    console.log(`\n${prefix} ${description}`);
  }

  /**
   * 输出断言结果
   */
  assertion(passed: boolean, description: string): void {
    const icon = passed ? '✓' : '✗';
    const color = passed ? 'green' : 'red';
    const prefix = this.colorize(icon, color);
    console.log(`  ${prefix} ${description}`);
  }

  /**
   * 输出流式块信息
   */
  streamChunk(index: number, type: string, content?: string): void {
    if (this.verbose) {
      const prefix = this.colorize(`[Chunk #${index}]`, 'cyan');
      console.log(`${prefix} Type: ${type}`);
      if (content) {
        const preview = content.length > 100 ? `${content.substring(0, 100)}...` : content;
        console.log(`  Content: ${this.colorize(preview, 'gray')}`);
      }
    }
  }

  /**
   * 输出表格
   */
  table(headers: string[], rows: string[][]): void {
    const columnWidths = headers.map((header, i) => {
      const maxRowWidth = Math.max(...rows.map((row) => row[i]?.length || 0));
      return Math.max(header.length, maxRowWidth);
    });

    // 输出表头
    const headerRow = headers
      .map((header, i) => header.padEnd(columnWidths[i]))
      .join(' | ');
    console.log(this.colorize(headerRow, 'cyan'));

    // 输出分隔线
    const separator = columnWidths.map((width) => '-'.repeat(width)).join('-+-');
    console.log(this.colorize(separator, 'cyan'));

    // 输出数据行
    rows.forEach((row) => {
      const dataRow = row
        .map((cell, i) => (cell || '').padEnd(columnWidths[i]))
        .join(' | ');
      console.log(dataRow);
    });
  }

  /**
   * 终端颜色化
   */
  private colorize(text: string, color: string): string {
    const colors: Record<string, string> = {
      reset: '\x1b[0m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
    };

    return `${colors[color] || ''}${text}${colors.reset}`;
  }
}
