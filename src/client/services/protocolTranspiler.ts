/**
 * Client-side Protocol Transpiler Service
 *
 * Provides format conversion capabilities for the playground.
 * This is a lightweight wrapper around the server-side ProtocolTranspiler.
 */

import type { Message } from '@shared/types';
import { Role } from '@shared/types';

export type ApiFormat = 'openai' | 'anthropic' | 'gemini';

/**
 * Debug info for request transformation
 */
export interface TranspileDebugInfo {
  originalFormat: ApiFormat;
  targetFormat: ApiFormat;
  originalRequest: any;
  transformedRequest: any;
  transformationErrors?: string[];
  transformationTime: number;
}

/**
 * Client-side request builder for different API formats
 */
export class ProtocolTranspilerService {
  /**
   * Build a request in the specified format
   *
   * @param model - Model name
   * @param messages - Message history
   * @param format - Target API format
   * @param tools - Optional tool definitions
   * @param systemPrompt - Optional system prompt
   * @returns Request object in the target format
   */
  buildRequest(
    model: string,
    messages: Message[],
    format: ApiFormat,
    tools?: any[],
    systemPrompt?: string
  ): TranspileDebugInfo {
    const startTime = performance.now();

    // Build OpenAI format (internal format)
    const openaiRequest = this.buildOpenAIRequest(model, messages, tools, systemPrompt);

    let transformedRequest: any;
    const errors: string[] = [];

    try {
      switch (format) {
        case 'openai':
          transformedRequest = openaiRequest;
          break;

        case 'anthropic':
          transformedRequest = this.convertToAnthropic(openaiRequest);
          break;

        case 'gemini':
          transformedRequest = this.convertToGemini(openaiRequest);
          break;

        default:
          errors.push(`Unsupported format: ${format}`);
          transformedRequest = openaiRequest;
      }
    } catch (e: any) {
      errors.push(e?.message || 'Unknown conversion error');
      transformedRequest = openaiRequest;
    }

    return {
      originalFormat: 'openai',
      targetFormat: format,
      originalRequest: openaiRequest,
      transformedRequest,
      transformationErrors: errors.length > 0 ? errors : undefined,
      transformationTime: performance.now() - startTime,
    };
  }

  /**
   * Build OpenAI format request
   */
  private buildOpenAIRequest(
    model: string,
    messages: Message[],
    tools?: any[],
    systemPrompt?: string
  ): any {
    const requestMessages = [...messages];

    // Add system prompt at the beginning if provided
    if (systemPrompt) {
      requestMessages.unshift({
        role: Role.SYSTEM,
        content: systemPrompt,
      });
    }

    return {
      model,
      messages: requestMessages,
      stream: true,
      ...(tools && tools.length > 0 && { tools }),
    };
  }

  /**
   * Convert OpenAI request to Anthropic format
   */
  private convertToAnthropic(openaiRequest: any): any {
    const messages: any[] = [];
    let systemPrompt: string | undefined;

    for (const msg of openaiRequest.messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    const anthropicRequest: any = {
      model: openaiRequest.model,
      messages,
      max_tokens: openaiRequest.max_tokens || 4096,
      stream: true,
    };

    if (systemPrompt) {
      anthropicRequest.system = systemPrompt;
    }

    // Convert tools
    if (openaiRequest.tools) {
      anthropicRequest.tools = openaiRequest.tools.map((tool: any) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));
    }

    return anthropicRequest;
  }

  /**
   * Convert OpenAI request to Gemini format
   */
  private convertToGemini(openaiRequest: any): any {
    const contents: any[] = [];

    for (const msg of openaiRequest.messages) {
      if (msg.role === 'system') {
        // Gemini doesn't have system messages, skip or add as first user message
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : msg.role;
      contents.push({
        role,
        parts: [{ text: msg.content }],
      });
    }

    const geminiRequest: any = {
      contents,
      generationConfig: {
        temperature: openaiRequest.temperature ?? 0.7,
        maxOutputTokens: openaiRequest.max_tokens || 4096,
      },
    };

    // Convert tools
    if (openaiRequest.tools) {
      geminiRequest.tools = openaiRequest.tools.map((tool: any) => ({
        functionDeclarations: [
          {
            name: tool.function.name,
            description: tool.function.description,
            parameters: tool.function.parameters,
          },
        ],
      }));
    }

    return geminiRequest;
  }

  /**
   * Convert tools to OpenAI format (for display)
   */
  formatToolsForDisplay(tools: any[]): string {
    return JSON.stringify(tools, null, 2);
  }
}

/**
 * Singleton instance
 */
export const protocolTranspilerService = new ProtocolTranspilerService();
