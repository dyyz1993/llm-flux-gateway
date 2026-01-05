/**
 * Tool Call Streaming Test Scenarios
 *
 * 测试工具调用在流式响应中的行为，重点验证：
 * 1. Tool call 的输出格式
 * 2. 是否增量输出 arguments
 * 3. 结束信号是否正确
 * 4. 前端 Playground 的兼容性
 */

import type { TestScenario } from '../types';
import type { ChatMessage, ToolDefinition, StreamChunk } from '../types';

// ============================================================================
// Types
// ============================================================================

interface ToolCallValidationResult {
  exists: boolean;
  toolCallChunks: number;
  isIncremental: boolean;
  pattern: 'single-chunk' | 'incremental' | 'none';
  firstOccurrence: number;
  lastOccurrence: number;
  argumentChunks: string[];
  toolCallId?: string;
  functionName?: string;
}

interface ToolCallFormat {
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
  index?: number;
}

// ============================================================================
// Test Tools
// ============================================================================

const CALCULATOR_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'calculator',
    description: '执行数学计算',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: '数学表达式，例如: 123 * 456'
        }
      },
      required: ['expression']
    }
  }
};

const WEATHER_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: '获取指定城市的天气信息',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: '城市名称，例如: Tokyo, Beijing'
        }
      },
      required: ['location']
    }
  }
};

const SEARCH_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'search',
    description: '搜索网络信息',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索查询'
        }
      },
      required: ['query']
    }
  }
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 解析 SSE 流并提取工具调用信息
 */
function parseToolCallFromLine(line: string): ToolCallFormat | null {
  try {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data === '[DONE]') {
        return null;
      }

      const parsed = JSON.parse(data);
      if (parsed.choices && parsed.choices[0]?.delta?.tool_calls) {
        const toolCalls = parsed.choices[0].delta.tool_calls;
        // 返回第一个 tool call
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          return toolCalls[0];
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 从 SSE 响应中提取所有工具调用 chunks
 */
function extractToolCallChunks(rawChunks: string[]): ToolCallFormat[] {
  const toolCallChunks: ToolCallFormat[] = [];

  for (const chunk of rawChunks) {
    const lines = chunk.split('\n');
    for (const line of lines) {
      const toolCall = parseToolCallFromLine(line);
      if (toolCall) {
        toolCallChunks.push(toolCall);
      }
    }
  }

  return toolCallChunks;
}

/**
 * 验证工具调用的完整性和格式
 */
function validateToolCall(toolCallChunks: ToolCallFormat[]): ToolCallValidationResult {
  if (toolCallChunks.length === 0) {
    return {
      exists: false,
      toolCallChunks: 0,
      isIncremental: false,
      pattern: 'none',
      firstOccurrence: -1,
      lastOccurrence: -1,
      argumentChunks: []
    };
  }

  // 收集所有 arguments chunks
  const argumentChunks: string[] = [];
  let toolCallId: string | undefined;
  let functionName: string | undefined;

  for (const tc of toolCallChunks) {
    if (tc.id) toolCallId = tc.id;
    if (tc.function?.name) functionName = tc.function.name;
    if (tc.function?.arguments) {
      argumentChunks.push(tc.function.arguments);
    }
  }

  // 分析输出模式
  const isIncremental = argumentChunks.length > 1;
  const pattern = argumentChunks.length === 0 ? 'none' :
                  argumentChunks.length === 1 ? 'single-chunk' : 'incremental';

  return {
    exists: true,
    toolCallChunks: toolCallChunks.length,
    isIncremental,
    pattern,
    firstOccurrence: 0,
    lastOccurrence: toolCallChunks.length - 1,
    argumentChunks,
    toolCallId,
    functionName
  } as ToolCallValidationResult;
}

/**
 * 尝试解析 arguments（处理增量情况）
 */
function parseArguments(argumentChunks: string[]): any | null {
  if (argumentChunks.length === 0) return null;

  // 如果只有一个 chunk，直接解析
  if (argumentChunks.length === 1) {
    try {
      return JSON.parse(argumentChunks[0]);
    } catch {
      return null;
    }
  }

  // 如果有多个 chunks，拼接后解析
  try {
    const fullArgs = argumentChunks.join('');
    return JSON.parse(fullArgs);
  } catch {
    return null;
  }
}

/**
 * 发送流式请求并收集响应
 */
async function sendStreamingRequest(
  messages: ChatMessage[],
  tools: ToolDefinition[],
  baseUrl: string = 'http://localhost:3000'
): Promise<{
  rawChunks: string[];
  toolCallChunks: ToolCallFormat[];
  finishReason: string | null;
  validation: ToolCallValidationResult;
}> {
  const rawChunks: string[] = [];
  let finishReason: string | null = null;

  // Get API key from environment
  const apiKey = process.env.TEST_API_KEY || process.env.OPENAI_API_KEY || 'test-key';

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages,
      tools,
      stream: true,
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        rawChunks.push(line);

        if (data === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }

  const toolCallChunks = extractToolCallChunks(rawChunks);
  const validation = validateToolCall(toolCallChunks);

  return {
    rawChunks,
    toolCallChunks,
    finishReason,
    validation
  };
}

// ============================================================================
// Scenario 1: Single Tool Call
// ============================================================================

export const singleToolCallScenario: TestScenario = {
  name: 'Single Tool Call (Calculator)',
  description: '测试单个工具调用的流式响应，验证基本功能',

  config: {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    stream: true,
    tools: true,
  },

  execute: async () => {
    const messages: ChatMessage[] = [{
      role: 'user',
      content: 'What is 123 * 456? Use the calculator tool.'
    }];

    const tools = [CALCULATOR_TOOL];

    return await sendStreamingRequest(messages, tools);
  },

  assertions: [
    {
      type: 'tool_call_exists',
      description: '验证至少有一个 chunk 包含 tool_calls',
      validator: (result) => {
        const { validation } = result as any;
        return {
          passed: validation.exists,
          details: {
            toolCallChunks: validation.toolCallChunks,
            exists: validation.exists
          }
        };
      }
    },
    {
      type: 'tool_call_format',
      description: '验证 tool call 的完整格式',
      validator: (result) => {
        const { _toolCallChunks, validation } = result as any;
        // const firstToolCall = toolCallChunks[0];

        const checks = {
          hasId: !!validation.toolCallId,
          hasFunctionName: validation.functionName === 'calculator',
          hasArguments: validation.argumentChunks.length > 0,
          validArguments: false
        };

        // 验证 arguments 是否是有效的 JSON
        const parsedArgs = parseArguments(validation.argumentChunks);
        checks.validArguments = !!parsedArgs && typeof parsedArgs === 'object';

        return {
          passed: checks.hasId && checks.hasFunctionName && checks.hasArguments && checks.validArguments,
          details: {
            ...checks,
            toolCallId: validation.toolCallId,
            functionName: validation.functionName,
            argumentChunks: validation.argumentChunks.length,
            parsedArguments: parsedArgs
          }
        };
      }
    },
    {
      type: 'finish_reason',
      description: '验证 finish_reason 是否为 tool_calls',
      validator: (result) => {
        const { finishReason } = result as any;
        return {
          passed: finishReason === 'tool_calls',
          details: {
            finishReason,
            expected: 'tool_calls'
          }
        };
      }
    },
    {
      type: 'argument_content',
      description: '验证 arguments 包含正确的参数',
      validator: (result) => {
        const { validation } = result as any;
        const parsedArgs = parseArguments(validation.argumentChunks);

        const hasExpression = !!parsedArgs?.expression;
        const expressionContainsNumbers = hasExpression &&
          (parsedArgs.expression.includes('123') || parsedArgs.expression.includes('456'));

        return {
          passed: hasExpression && expressionContainsNumbers,
          details: {
            hasExpression,
            expressionContainsNumbers,
            arguments: parsedArgs
          }
        };
      }
    }
  ]
};

// ============================================================================
// Scenario 2: Tool Call Incremental Detection
// ============================================================================

export const toolCallIncrementalScenario: TestScenario = {
  name: 'Tool Call Incremental Streaming',
  description: '检测 tool call arguments 是否增量流式输出（GLM-4 可能一次性返回）',

  config: {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    stream: true,
    tools: true,
  },

  execute: async () => {
    const messages: ChatMessage[] = [{
      role: 'user',
      content: 'Search for "weather in Tokyo" using the search tool'
    }];

    const tools = [SEARCH_TOOL];

    return await sendStreamingRequest(messages, tools);
  },

  assertions: [
    {
      type: 'incremental_detection',
      description: '检测 arguments 是否增量输出',
      validator: (result) => {
        const { validation, toolCallChunks } = result as any;

        // 统计包含 arguments 的 chunks
        const chunksWithArgs = toolCallChunks.filter((tc: ToolCallFormat) =>
          tc.function?.arguments && tc.function.arguments.length > 0
        );

        // 分析增量模式
        const isIncremental = chunksWithArgs.length > 1;
        const pattern = chunksWithArgs.length === 0 ? 'none' :
                       chunksWithArgs.length === 1 ? 'single-chunk' : 'incremental';

        // 如果是增量，检查 arguments 是否逐步累积
        let cumulativeBehavior = 'unknown';
        if (pattern === 'incremental') {
          cumulativeBehavior = 'progressive';
          // OpenAI 标准应该是逐步累积
        } else if (pattern === 'single-chunk') {
          cumulativeBehavior = 'complete';
          // GLM-4 可能一次性返回完整 arguments
        }

        return {
          passed: true, // 这个测试总是通过，主要是收集信息
          details: {
            isIncremental,
            pattern,
            cumulativeBehavior,
            chunksWithArguments: chunksWithArgs.length,
            totalToolCallChunks: toolCallChunks.length,
            argumentChunks: validation.argumentChunks.map((arg: string, i: number) => ({
              index: i,
              length: arg.length,
              preview: arg.substring(0, 50)
            }))
          }
        };
      }
    },
    {
      type: 'incremental_analysis',
      description: '详细分析增量输出的特征',
      validator: (result) => {
        const { validation } = result as any;

        // 分析每个 argument chunk 的特征
        const chunkAnalysis = validation.argumentChunks.map((arg: string, i: number) => {
          // 检查是否是完整的 JSON
          let isCompleteJson = false;
          try {
            JSON.parse(arg);
            isCompleteJson = true;
          } catch {}

          // 检查是否看起来像 JSON 片段
          const looksLikeJsonFragment = arg.startsWith('{') || arg.includes(':');

          return {
            index: i,
            length: arg.length,
            isCompleteJson,
            looksLikeJsonFragment,
            preview: arg.substring(0, 100)
          };
        });

        // 判断整体模式
        let overallPattern = 'unknown';
        if (validation.argumentChunks.length === 0) {
          overallPattern = 'no-arguments';
        } else if (validation.argumentChunks.length === 1) {
          const firstChunk = chunkAnalysis[0];
          if (firstChunk.isCompleteJson) {
            overallPattern = 'single-complete-json'; // GLM-4 可能这样
          } else {
            overallPattern = 'single-incomplete';
          }
        } else {
          overallPattern = 'multiple-chunks'; // OpenAI 标准
        }

        return {
          passed: true,
          details: {
            overallPattern,
            chunkAnalysis,
            recommendation: getPatternRecommendation(overallPattern)
          }
        };
      }
    }
  ]
};

// ============================================================================
// Scenario 3: Tool Call End Signal
// ============================================================================

export const toolCallEndSignalScenario: TestScenario = {
  name: 'Tool Call End Signal',
  description: '验证工具调用后的结束信号格式，确保前端能正确处理',

  config: {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    stream: true,
    tools: true,
  },

  execute: async () => {
    const messages: ChatMessage[] = [{
      role: 'user',
      content: 'What is the weather in Beijing? Use the weather tool.'
    }];

    const tools = [WEATHER_TOOL];

    return await sendStreamingRequest(messages, tools);
  },

  assertions: [
    {
      type: 'correct_finish_reason',
      description: '验证 finish_reason 为 tool_calls',
      validator: (result) => {
        const { finishReason } = result as any;

        return {
          passed: finishReason === 'tool_calls',
          details: {
            finishReason,
            expected: 'tool_calls',
            actual: finishReason,
            isCorrect: finishReason === 'tool_calls'
          }
        };
      }
    },
    {
      type: 'has_done_signal',
      description: '验证流结束时是否有 [DONE] 信号',
      validator: (result) => {
        const { rawChunks } = result as any;
        const lastChunk = rawChunks[rawChunks.length - 1];
        const hasDoneSignal = lastChunk?.includes('[DONE]');

        return {
          passed: hasDoneSignal,
          details: {
            hasDoneSignal,
            lastChunk: lastChunk || 'no chunks'
          }
        };
      }
    },
    {
      type: 'tool_call_before_finish',
      description: '验证 tool call 在 finish_reason 之前出现',
      validator: (result) => {
        const { rawChunks, validation } = result as any;

        // 找到 tool call 首次出现的位置
        let firstToolCallIndex = -1;
        let finishReasonIndex = -1;

        for (let i = 0; i < rawChunks.length; i++) {
          const toolCall = parseToolCallFromLine(rawChunks[i]);
          if (toolCall && firstToolCallIndex === -1) {
            firstToolCallIndex = i;
          }

          if (rawChunks[i].includes('finish_reason')) {
            finishReasonIndex = i;
            break;
          }
        }

        const correctOrder = firstToolCallIndex >= 0 &&
                           finishReasonIndex >= 0 &&
                           firstToolCallIndex < finishReasonIndex;

        return {
          passed: correctOrder,
          details: {
            firstToolCallIndex,
            finishReasonIndex,
            correctOrder,
            toolCallExists: validation.exists
          }
        };
      }
    },
    {
      type: 'no_content_after_tool_call',
      description: '验证 tool call 后没有多余的 content 内容',
      validator: (result) => {
        const { rawChunks } = result as any;

        let hasContentAfterToolCall = false;
        let toolCallFound = false;

        for (const chunk of rawChunks) {
          try {
            if (chunk.startsWith('data: ')) {
              const data = chunk.slice(6).trim();
              if (data === '[DONE]') continue;

              const parsed = JSON.parse(data);
              const hasToolCall = !!parsed.choices?.[0]?.delta?.tool_calls;
              const hasContent = !!parsed.choices?.[0]?.delta?.content;

              if (hasToolCall) {
                toolCallFound = true;
              }
              if (toolCallFound && hasContent) {
                hasContentAfterToolCall = true;
                break;
              }
            }
          } catch {}
        }

        return {
          passed: !hasContentAfterToolCall,
          details: {
            hasContentAfterToolCall,
            toolCallFound
          }
        };
      }
    }
  ]
};

// ============================================================================
// Scenario 4: GLM-4 Single Chunk Detection (Playground Compatibility)
// ============================================================================

export const glmSingleChunkScenario: TestScenario = {
  name: 'GLM-4 Single Chunk Detection',
  description: '专门检测 GLM-4 在单个 chunk 中返回完整 tool call 的问题，验证 Playground 兼容性',

  config: {
    provider: 'openai',
    model: 'glm-4',
    stream: true,
    tools: true,
  },

  execute: async () => {
    const messages: ChatMessage[] = [{
      role: 'user',
      content: 'Calculate 100 + 200 using the calculator tool'
    }];

    const tools = [CALCULATOR_TOOL];

    return await sendStreamingRequest(messages, tools);
  },

  assertions: [
    {
      type: 'playground_compatibility_check',
      description: '检查 Playground 兼容性问题',
      validator: (result) => {
        const { validation } = result as any;

        // 检测关键问题
        const issues: string[] = [];
        const warnings: string[] = [];

        // 问题 1: 单个 chunk 返回完整 tool call
        if (validation.pattern === 'single-chunk') {
          issues.push('GLM-4 在单个 chunk 中返回完整的 tool call');
          issues.push('这可能导致前端 Playground 状态更新不正确');
          issues.push('前端可能无法检测到 tool call 的开始和结束');
        }

        // 问题 2: 缺少增量输出
        if (!validation.isIncremental) {
          warnings.push('非增量输出模式，不支持流式 arguments');
        }

        // 问题 3: 检查 tool call ID 是否存在
        if (!validation.toolCallId) {
          issues.push('缺少 tool call ID，这会导致前端无法跟踪工具调用');
        }

        // 问题 4: 检查是否有 finish_reason
        const { finishReason } = result as any;
        if (finishReason !== 'tool_calls') {
          issues.push(`finish_reason 不正确: ${finishReason} (期望: tool_calls)`);
          issues.push('这会导致前端 Playground 的 loading 状态无法结束');
        }

        return {
          passed: issues.length === 0,
          details: {
            compatibility: {
              isCompatible: issues.length === 0,
              issues,
              warnings,
              severity: issues.length > 0 ? 'critical' : warnings.length > 0 ? 'warning' : 'ok'
            },
            pattern: validation.pattern,
            isIncremental: validation.isIncremental,
            toolCallId: validation.toolCallId,
            finishReason,
            recommendation: getCompatibilityRecommendation(issues, warnings)
          }
        };
      }
    },
    {
      type: 'tool_call_timing_analysis',
      description: '分析 tool call 的时序特征',
      validator: (result) => {
        const { toolCallChunks, rawChunks } = result as any;

        // 找到 tool call 的第一个和最后一个 chunk
        let firstToolCallIndex = -1;
        let lastToolCallIndex = -1;
        let finishReasonIndex = -1;

        for (let i = 0; i < rawChunks.length; i++) {
          const toolCall = parseToolCallFromLine(rawChunks[i]);
          if (toolCall) {
            if (firstToolCallIndex === -1) {
              firstToolCallIndex = i;
            }
            lastToolCallIndex = i;
          }

          if (rawChunks[i].includes('finish_reason')) {
            finishReasonIndex = i;
            break;
          }
        }

        // 分析时序
        const timingAnalysis = {
          firstToolCallIndex,
          lastToolCallIndex,
          finishReasonIndex,
          toolCallSpan: lastToolCallIndex - firstToolCallIndex,
          totalChunks: rawChunks.length,
          toolCallChunkCount: toolCallChunks.length
        };

        // 判断是否是 "瞬间完成" 的 tool call
        const isInstantToolCall = timingAnalysis.toolCallSpan === 0;

        return {
          passed: true, // 这个测试只是收集信息
          details: {
            ...timingAnalysis,
            isInstantToolCall,
            interpretation: isInstantToolCall ?
              'Tool call 瞬间完成（单个 chunk），这是 GLM-4 的特征' :
              'Tool call 跨多个 chunks，这是 OpenAI 标准行为',
            frontendImpact: isInstantToolCall ?
              '⚠️  前端需要在单个事件中处理完整的 tool call' :
              '✅ 前端可以逐步累积 tool call 数据'
          }
        };
      }
    },
    {
      type: 'arguments_accumulation_test',
      description: '测试 arguments 累积逻辑',
      validator: (result) => {
        const { validation } = result as any;
        const { argumentChunks } = validation;

        // 尝试多种累积策略
        const strategies = {
          singleChunk: {
            description: '单个 chunk 直接解析',
            success: false,
            result: null
          },
          accumulateAll: {
            description: '累积所有 chunks',
            success: false,
            result: null
          },
          progressiveAccumulate: {
            description: '逐步累积并验证',
            success: false,
            result: null
          }
        };

        // 策略 1: 单个 chunk 直接解析
        if (argumentChunks.length === 1) {
          try {
            strategies.singleChunk.result = JSON.parse(argumentChunks[0]);
            strategies.singleChunk.success = true;
          } catch (e) {
            strategies.singleChunk.result = `解析失败: ${e}`;
          }
        }

        // 策略 2: 累积所有 chunks
        try {
          const accumulated = argumentChunks.join('');
          strategies.accumulateAll.result = JSON.parse(accumulated);
          strategies.accumulateAll.success = true;
        } catch (e) {
          strategies.accumulateAll.result = `解析失败: ${e}`;
        }

        // 策略 3: 逐步累积
        let progressive = '';
        let progressiveSuccess = true;
        for (const chunk of argumentChunks) {
          progressive += chunk;
          try {
            JSON.parse(progressive);
          } catch (e) {
            progressiveSuccess = false;
          }
        }
        strategies.progressiveAccumulate.success = progressiveSuccess;

        // 推荐策略
        let recommendedStrategy = 'unknown';
        if (strategies.singleChunk.success) {
          recommendedStrategy = 'single-chunk';
        } else if (strategies.accumulateAll.success) {
          recommendedStrategy = 'accumulate-all';
        }

        return {
          passed: strategies.singleChunk.success || strategies.accumulateAll.success,
          details: {
            argumentChunks: argumentChunks.length,
            strategies,
            recommendedStrategy,
            frontendGuidance: getStrategyGuidance(recommendedStrategy)
          }
        };
      }
    }
  ]
};

// ============================================================================
// Scenario 5: Multiple Tool Calls
// ============================================================================

export const multipleToolCallsScenario: TestScenario = {
  name: 'Multiple Tool Calls',
  description: '测试多个工具调用的情况',

  config: {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    stream: true,
    tools: true,
  },

  execute: async () => {
    const messages: ChatMessage[] = [{
      role: 'user',
      content: 'Calculate 123 + 456 and then search for weather in Tokyo'
    }];

    const tools = [CALCULATOR_TOOL, WEATHER_TOOL];

    return await sendStreamingRequest(messages, tools);
  },

  assertions: [
    {
      type: 'multiple_tool_calls',
      description: '验证是否返回多个工具调用',
      validator: (result) => {
        const { toolCallChunks } = result as any;

        // 检查是否有不同的 tool call ID
        const toolCallIds = new Set();
        for (const tc of toolCallChunks) {
          if (tc.id) {
            toolCallIds.add(tc.id);
          }
        }

        const hasMultiple = toolCallIds.size >= 2;

        return {
          passed: true, // 只是记录，不作为失败条件
          details: {
            hasMultiple,
            toolCallCount: toolCallIds.size,
            toolCallIds: Array.from(toolCallIds)
          }
        };
      }
    },
    {
      type: 'tool_call_separation',
      description: '验证不同的 tool call 有独立的 ID',
      validator: (result) => {
        const { toolCallChunks } = result as any;

        const toolCallGroups = new Map<string, ToolCallFormat[]>();
        for (const tc of toolCallChunks) {
          if (tc.id) {
            if (!toolCallGroups.has(tc.id)) {
              toolCallGroups.set(tc.id, []);
            }
            toolCallGroups.get(tc.id)!.push(tc);
          }
        }

        const separations = Array.from(toolCallGroups.entries()).map(([id, chunks]) => ({
          id,
          chunkCount: chunks.length,
          functionName: chunks.find(c => c.function?.name)?.function?.name
        }));

        return {
          passed: toolCallGroups.size > 0,
          details: {
            groupCount: toolCallGroups.size,
            separations
          }
        };
      }
    }
  ]
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 根据检测到的模式给出建议
 */
function getPatternRecommendation(pattern: string): string {
  switch (pattern) {
    case 'single-complete-json':
      return 'GLM-4 风格：一次性返回完整的 arguments。前端需要在单个 chunk 中处理完整的 tool call。';
    case 'multiple-chunks':
      return 'OpenAI 标准：增量返回 arguments。前端需要累积拼接所有 chunks 的 arguments。';
    case 'single-incomplete':
      return '异常情况：单个 chunk 但不是完整 JSON。可能需要特殊处理。';
    case 'no-arguments':
      return '未找到 arguments，可能模型未正确调用工具。';
    default:
      return '未知模式，需要进一步分析。';
  }
}

/**
 * 根据兼容性问题给出建议
 */
function getCompatibilityRecommendation(issues: string[], warnings: string[]): string {
  if (issues.length === 0 && warnings.length === 0) {
    return '✅ 完全兼容 OpenAI 标准，前端可以正常处理。';
  }

  let recommendation = '';

  if (issues.some(i => i.includes('single-chunk'))) {
    recommendation += '\n🔧 关键修复：\n';
    recommendation += '   1. 前端需要在单个 chunk 中检测完整的 tool call\n';
    recommendation += '   2. 不要依赖增量式的 arguments 流\n';
    recommendation += '   3. 在收到 tool call 时立即更新状态\n';
  }

  if (issues.some(i => i.includes('finish_reason'))) {
    recommendation += '\n🔧 状态修复：\n';
    recommendation += '   1. 检查并确保 finish_reason 为 "tool_calls"\n';
    recommendation += '   2. 在 tool call 后立即结束 loading 状态\n';
    recommendation += '   3. 不要等待额外的 content\n';
  }

  if (issues.some(i => i.includes('tool call ID'))) {
    recommendation += '\n🔧 ID 修复：\n';
    recommendation += '   1. 确保 tool call ID 存在\n';
    recommendation += '   2. 使用 ID 跟踪工具调用状态\n';
  }

  return recommendation || '⚠️  检测到兼容性问题，需要进一步调查。';
}

/**
 * 根据推荐的策略给出前端实现指导
 */
function getStrategyGuidance(strategy: string): string {
  switch (strategy) {
    case 'single-chunk':
      return '前端实现：在单个 SSE 事件中处理完整的 tool call，直接解析 arguments';
    case 'accumulate-all':
      return '前端实现：累积所有 arguments chunks，在流结束时拼接并解析';
    case 'unknown':
      return '前端实现：需要同时支持单 chunk 和多 chunk 两种模式';
    default:
      return '前端实现：根据实际输出模式调整';
  }
}

// ============================================================================
// Exports
// ============================================================================

export const scenarios = [
  singleToolCallScenario,
  toolCallIncrementalScenario,
  toolCallEndSignalScenario,
  glmSingleChunkScenario,
  multipleToolCallsScenario,
];

export default scenarios;
