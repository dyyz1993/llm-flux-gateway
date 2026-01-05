/**
 * 流式测试工具配置
 *
 * 集中管理测试框架的配置参数
 */

export const CONFIG = {
  /** 网关基础 URL */
  baseURL: process.env.GATEWAY_URL || 'http://localhost:3000/v1',

  /** 请求超时时间（毫秒） */
  timeout: parseInt(process.env.TEST_TIMEOUT || '30000', 10),

  /** 详细输出模式 */
  verbose: process.env.VERBOSE === 'true',

  /** API 密钥（从环境变量读取） */
  apiKey: process.env.TEST_API_KEY || 'test-key',

  /** 默认测试模型 */
  defaultModels: {
    openai: 'gpt-4',
    anthropic: 'claude-3-5-sonnet-20241022',
    gemini: 'gemini-1.5-pro',
  },

  /** 测试结果输出目录 */
  outputDir: process.env.TEST_OUTPUT_DIR || './test-results',

  /** 是否保存原始响应 */
  saveRawResponses: process.env.SAVE_RAW_RESPONSES === 'true',

  /** 流式块接收超时（毫秒） */
  chunkTimeout: parseInt(process.env.CHUNK_TIMEOUT || '5000', 10),

  /** 最大重试次数 */
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),

  /** 重试延迟（毫秒） */
  retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10),
} as const;

export type Config = typeof CONFIG;
