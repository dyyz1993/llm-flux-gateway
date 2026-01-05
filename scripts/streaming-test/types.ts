/**
 * Streaming Test Types
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface StreamChunk {
  index: number;
  content?: string;
  toolCall?: {
    id?: string;
    type?: string;
    function?: {
      name?: string;
      arguments?: string;
    };
    index?: number;
  };
  finishReason?: string;
}

export interface AssertionResult {
  type: string;
  passed: boolean;
  details?: any;
}

export interface TestResult {
  scenarioName: string;
  passed: boolean;
  duration: number;
  assertions: AssertionResult[];
  data?: any;
  error?: string;
}

export interface TestScenario {
  name: string;
  description: string;
  config: {
    provider: string;
    model: string;
    stream: boolean;
    tools: boolean;
  };
  execute: () => Promise<any>;
  assertions: Array<{
    type: string;
    description?: string;
    validator: (result: any) => boolean | { passed: boolean; details?: any };
  }>;
}
