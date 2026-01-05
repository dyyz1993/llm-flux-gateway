/**
 * 测试场景基类
 *
 * 所有测试场景的基础接口和通用实现
 */

import type { StreamChunk } from '../core/stream-parser.js';

/**
 * �场景配置
 */
export interface ScenarioConfig {
  /** 提供商 */
  provider: 'openai' | 'anthropic' | 'gemini';

  /** 模型名称 */
  model: string;

  /** 是否启用流式 */
  stream: boolean;

  /** 是否包含工具调用 */
  tools?: boolean;

  /** 最大 Token 数 */
  maxTokens?: number;

  /** 温度 */
  temperature?: number;

  /** 请求超时（毫秒） */
  timeout?: number;

  /** 自定义头 */
  headers?: Record<string, string>;

  /** 自定义端点 */
  endpoint?: string;
}

/**
 * 断言配置
 */
export interface Assertion {
  /** 断言类型 */
  type:
    | 'has-content'
    | 'has-tool-call'
    | 'finish-reason'
    | 'min-chunks'
    | 'max-chunks'
    | 'content-length'
    | 'response-time'
    | 'token-usage';

  /** 期望值 */
  expected: any;

  /** 断言描述 */
  description?: string;
}

/**
 * 测试场景接口
 */
export interface BaseScenario {
  /** 场景名称 */
  name: string;

  /** 场景描述 */
  description: string;

  /** 场景配置 */
  config: ScenarioConfig;

  /** 执行测试 */
  execute: () => Promise<ScenarioResult>;

  /** 验证结果 */
  assertions: Assertion[];
}

/**
 * 测试结果
 */
export interface ScenarioResult {
  /** 场景名称 */
  scenarioName: string;

  /** 是否通过 */
  passed: boolean;

  /** 执行时间（毫秒） */
  duration: number;

  /** 接收到的所有块 */
  chunks: StreamChunk[];

  /** 完整内容 */
  fullContent: string;

  /** 工具调用列表 */
  toolCalls: any[];

  /** 结束原因 */
  finishReason?: string;

  /** Token 使用情况 */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens?: number;
  };

  /** 错误信息 */
  error?: string;

  /** 断言结果 */
  assertionResults: AssertionResult[];

  /** 验证结果 */
  validationErrors: string[];

  /** 验证警告 */
  validationWarnings: string[];
}

/**
 * 断言结果
 */
export interface AssertionResult {
  /** 断言类型 */
  type: string;

  /** 是否通过 */
  passed: boolean;

  /** 期望值 */
  expected: any;

  /** 实际值 */
  actual: any;

  /** 描述 */
  description: string;

  /** 错误信息 */
  error?: string;
}

/**
 * 抽象场景基类
 */
export abstract class AbstractScenario implements BaseScenario {
  abstract name: string;
  abstract description: string;
  abstract config: ScenarioConfig;
  abstract assertions: Assertion[];

  /**
   * 执行测试（由子类实现）
   */
  abstract execute(): Promise<ScenarioResult>;

  /**
   * 构建 API 请求
   */
  protected buildRequest(body: any): RequestInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // 根据提供商设置授权头
    switch (this.config.provider) {
      case 'openai':
        headers['Authorization'] = `Bearer ${process.env.OPENAI_API_KEY || 'test-key'}`;
        break;
      case 'anthropic':
        headers['x-api-key'] = process.env.ANTHROPIC_API_KEY || 'test-key';
        headers['anthropic-version'] = '2023-06-01';
        break;
      case 'gemini':
        // Gemini 使用不同的认证方式
        break;
    }

    return {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };
  }

  /**
   * 构建 API 请求体
   */
  protected buildRequestBody(messages: any[], tools?: any[]): any {
    const base: any = {
      model: this.config.model,
      stream: this.config.stream,
      messages,
    };

    // 可选参数
    if (this.config.maxTokens !== undefined) {
      base.max_tokens = this.config.maxTokens;
    }

    if (this.config.temperature !== undefined) {
      base.temperature = this.config.temperature;
    }

    // 工具调用
    if (this.config.tools && tools) {
      base.tools = tools;
    }

    return base;
  }

  /**
   * 发送请求并解析流式响应
   */
  protected async sendRequest(endpoint: string, requestInit: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 30000);

    try {
      const response = await fetch(endpoint, {
        ...requestInit,
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 验证断言
   */
  protected validateAssertions(result: ScenarioResult): AssertionResult[] {
    return this.assertions.map((assertion) => {
      switch (assertion.type) {
        case 'has-content':
          return this.assertHasContent(result, assertion);

        case 'has-tool-call':
          return this.assertHasToolCall(result, assertion);

        case 'finish-reason':
          return this.assertFinishReason(result, assertion);

        case 'min-chunks':
          return this.assertMinChunks(result, assertion);

        case 'max-chunks':
          return this.assertMaxChunks(result, assertion);

        case 'content-length':
          return this.assertContentLength(result, assertion);

        case 'response-time':
          return this.assertResponseTime(result, assertion);

        case 'token-usage':
          return this.assertTokenUsage(result, assertion);

        default:
          return {
            type: assertion.type,
            passed: false,
            expected: assertion.expected,
            actual: undefined,
            description: assertion.description || `Unknown assertion type: ${assertion.type}`,
            error: 'Unknown assertion type',
          };
      }
    });
  }

  private assertHasContent(result: ScenarioResult, assertion: Assertion): AssertionResult {
    const passed = result.fullContent.length > 0;
    return {
      type: assertion.type,
      passed,
      expected: assertion.expected,
      actual: result.fullContent.length,
      description: assertion.description || 'Response should have content',
    };
  }

  private assertHasToolCall(result: ScenarioResult, assertion: Assertion): AssertionResult {
    const passed = result.toolCalls.length > 0;
    return {
      type: assertion.type,
      passed,
      expected: assertion.expected,
      actual: result.toolCalls.length,
      description: assertion.description || 'Response should have tool calls',
    };
  }

  private assertFinishReason(result: ScenarioResult, assertion: Assertion): AssertionResult {
    const passed = result.finishReason === assertion.expected;
    return {
      type: assertion.type,
      passed,
      expected: assertion.expected,
      actual: result.finishReason,
      description: assertion.description || `Finish reason should be ${assertion.expected}`,
    };
  }

  private assertMinChunks(result: ScenarioResult, assertion: Assertion): AssertionResult {
    const passed = result.chunks.length >= assertion.expected;
    return {
      type: assertion.type,
      passed,
      expected: `>= ${assertion.expected}`,
      actual: result.chunks.length,
      description: assertion.description || `Should have at least ${assertion.expected} chunks`,
    };
  }

  private assertMaxChunks(result: ScenarioResult, assertion: Assertion): AssertionResult {
    const passed = result.chunks.length <= assertion.expected;
    return {
      type: assertion.type,
      passed,
      expected: `<= ${assertion.expected}`,
      actual: result.chunks.length,
      description: assertion.description || `Should have at most ${assertion.expected} chunks`,
    };
  }

  private assertContentLength(result: ScenarioResult, assertion: Assertion): AssertionResult {
    const passed = result.fullContent.length >= assertion.expected;
    return {
      type: assertion.type,
      passed,
      expected: `>= ${assertion.expected}`,
      actual: result.fullContent.length,
      description: assertion.description || `Content length should be at least ${assertion.expected}`,
    };
  }

  private assertResponseTime(result: ScenarioResult, assertion: Assertion): AssertionResult {
    const passed = result.duration <= assertion.expected;
    return {
      type: assertion.type,
      passed,
      expected: `<= ${assertion.expected}ms`,
      actual: `${result.duration}ms`,
      description: assertion.description || `Response time should be <= ${assertion.expected}ms`,
    };
  }

  private assertTokenUsage(result: ScenarioResult, assertion: Assertion): AssertionResult {
    const totalTokens = result.usage?.total_tokens || 0;
    const passed = totalTokens <= assertion.expected;
    return {
      type: assertion.type,
      passed,
      expected: `<= ${assertion.expected}`,
      actual: totalTokens,
      description: assertion.description || `Total tokens should be <= ${assertion.expected}`,
    };
  }
}
