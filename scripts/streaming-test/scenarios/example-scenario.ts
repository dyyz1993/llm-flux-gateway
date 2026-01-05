/**
 * 示例测试场景
 *
 * 演示如何创建自定义测试场景
 */

import { AbstractScenario, type ScenarioResult } from './base-scenario.js';
import { StreamParser } from '../core/stream-parser.js';
import { CONFIG } from '../config.js';

/**
 * 基础流式测试场景
 * 测试简单的文本生成
 */
export class BasicStreamingScenario extends AbstractScenario {
  name = 'basic-streaming';
  description = 'Test basic streaming text generation';
  config = {
    provider: 'openai' as const,
    model: CONFIG.defaultModels.openai,
    stream: true,
    maxTokens: 100,
    temperature: 0.7,
  };

  assertions = [
    { type: 'has-content', expected: true, description: 'Should generate content' },
    { type: 'min-chunks', expected: 1, description: 'Should receive at least 1 chunk' },
    { type: 'finish-reason', expected: 'stop', description: 'Should end normally' },
  ];

  async execute(): Promise<ScenarioResult> {
    const startTime = Date.now();
    const endpoint = `${CONFIG.baseURL}/chat/completions`;

    // 构建请求
    const request = this.buildRequest(
      this.buildRequestBody([
        {
          role: 'user',
          content: 'Say "Hello, World!" in a creative way.',
        },
      ])
    );

    // 发送请求
    const response = await this.sendRequest(endpoint, request);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 监控流式响应
    const parser = new StreamParser({ debug: CONFIG.verbose });
    const chunks: any[] = [];
    let fullContent = '';
    const toolCalls: any[] = [];

    for await (const chunk of parser.parseStream(response)) {
      chunks.push(chunk);

      if (chunk.type === 'content' && chunk.content) {
        fullContent += chunk.content;
      }
    }

    const duration = Date.now() - startTime;

    // 验证断言
    const assertionResults = this.validateAssertions({
      scenarioName: this.name,
      passed: true,
      duration,
      chunks,
      fullContent,
      toolCalls,
      assertionResults: [],
      validationErrors: [],
      validationWarnings: [],
    });

    return {
      scenarioName: this.name,
      passed: assertionResults.every((a) => a.passed),
      duration,
      chunks,
      fullContent,
      toolCalls,
      finishReason: chunks[chunks.length - 1]?.finishReason,
      assertionResults,
      validationErrors: [],
      validationWarnings: [],
    };
  }
}

/**
 * 工具调用流式测试场景
 * 测试流式工具调用功能
 */
export class ToolCallStreamingScenario extends AbstractScenario {
  name = 'tool-call-streaming';
  description = 'Test streaming with tool calls';
  config = {
    provider: 'anthropic' as const,
    model: CONFIG.defaultModels.anthropic,
    stream: true,
    tools: true,
    maxTokens: 100,
  };

  assertions = [
    { type: 'has-tool-call', expected: true, description: 'Should make a tool call' },
    { type: 'min-chunks', expected: 1, description: 'Should receive at least 1 chunk' },
  ];

  async execute(): Promise<ScenarioResult> {
    const startTime = Date.now();
    const endpoint = `${CONFIG.baseURL}/messages`;

    // 定义工具
    const tools = [
      {
        name: 'get_weather',
        description: 'Get the current weather in a location',
        input_schema: {
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
    ];

    // 构建请求
    const request = this.buildRequest(
      this.buildRequestBody(
        [
          {
            role: 'user',
            content: 'What is the weather in San Francisco?',
          },
        ],
        tools
      )
    );

    // 发送请求
    const response = await this.sendRequest(endpoint, request);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // 监控流式响应
    const parser = new StreamParser({ debug: CONFIG.verbose });
    const chunks: any[] = [];
    let fullContent = '';
    const toolCallsMap = new Map<number, any>();

    for await (const chunk of parser.parseStream(response)) {
      chunks.push(chunk);

      if (chunk.type === 'content' && chunk.content) {
        fullContent += chunk.content;
      }

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
      }
    }

    const duration = Date.now() - startTime;
    const toolCalls = Array.from(toolCallsMap.values());

    // 验证断言
    const assertionResults = this.validateAssertions({
      scenarioName: this.name,
      passed: true,
      duration,
      chunks,
      fullContent,
      toolCalls,
      assertionResults: [],
      validationErrors: [],
      validationWarnings: [],
    });

    return {
      scenarioName: this.name,
      passed: assertionResults.every((a) => a.passed),
      duration,
      chunks,
      fullContent,
      toolCalls,
      finishReason: chunks[chunks.length - 1]?.finishReason,
      assertionResults,
      validationErrors: [],
      validationWarnings: [],
    };
  }
}
