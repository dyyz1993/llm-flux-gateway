import type { ToolCall, Message } from '@shared/types';
import { Role } from '@shared/types';

/**
 * Mock tool execution service for playground
 * In production, these would call real APIs
 */
export class ToolExecutionService {
  /**
   * Execute a tool call and return the result
   */
  static async executeTool(toolCall: ToolCall): Promise<string> {
    const { function: func } = toolCall;
    const funcName = func.name;
    let funcArgs: any;

    try {
      funcArgs = JSON.parse(func.arguments);
    } catch {
      return 'Error: Invalid JSON arguments';
    }

    console.log('[ToolExecution] Executing:', funcName, 'with args:', funcArgs);

    switch (funcName) {
      case 'calculator':
        return this.executeCalculator(funcArgs);

      case 'get_weather':
        return this.executeGetWeather(funcArgs);

      case 'web_search':
        return this.executeWebSearch(funcArgs);

      case 'get_current_time':
        return this.executeGetCurrentTime();

      case 'get_user_location':
        return this.executeGetUserLocation();

      case 'create_calendar_event':
        return this.executeCreateCalendarEvent(funcArgs);

      case 'send_email':
        return this.executeSendEmail(funcArgs);

      case 'code_interpreter':
        return this.executeCodeInterpreter(funcArgs);

      default:
        return `Error: Unknown tool '${funcName}'`;
    }
  }

  private static executeCalculator(args: { expression: string }): string {
    try {
      // Safe evaluation of mathematical expressions
      const sanitized = args.expression.replace(/[^0-9+\-*/().\s]/g, '');
      const result = Function(`"use strict"; return (${sanitized})`)();
      return JSON.stringify({ result, expression: args.expression });
    } catch (e) {
      return JSON.stringify({ error: 'Invalid expression', details: String(e) });
    }
  }

  private static executeGetWeather(args: { location?: string; city?: string }): string {
    const location = args.location || args.city || 'Unknown';
    // Mock weather data
    const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'];
    const temp = Math.floor(Math.random() * 30) + 10; // 10-40°C

    return JSON.stringify({
      location,
      temperature: temp,
      condition: conditions[Math.floor(Math.random() * conditions.length)],
      humidity: Math.floor(Math.random() * 50) + 30,
      unit: 'celsius',
    });
  }

  private static executeWebSearch(args: { query: string }): string {
    return JSON.stringify({
      query: args.query,
      results: [
        {
          title: `Search result for "${args.query}"`,
          url: `https://example.com/search?q=${encodeURIComponent(args.query)}`,
          snippet: `This is a mock search result for the query "${args.query}". In production, this would return real search results from a search API.`,
        },
      ],
    });
  }

  private static executeGetCurrentTime(): string {
    const now = new Date();
    return JSON.stringify({
      iso: now.toISOString(),
      unix: Math.floor(now.getTime() / 1000),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }

  private static executeGetUserLocation(): string {
    return JSON.stringify({
      city: 'San Francisco',
      country: 'USA',
      latitude: 37.7749,
      longitude: -122.4194,
      timezone: 'America/Los_Angeles',
      note: 'This is mock location data',
    });
  }

  private static executeCreateCalendarEvent(args: { title: string; date?: string; startTime?: string }): string {
    return JSON.stringify({
      success: true,
      event: {
        id: `evt_${Date.now()}`,
        title: args.title,
        date: args.date || new Date().toISOString().split('T')[0],
        startTime: args.startTime || '09:00',
        duration: 60,
        status: 'confirmed',
      },
      message: `Calendar event "${args.title}" created successfully (mock)`,
    });
  }

  private static executeSendEmail(args: { to: string; subject: string; body?: string }): string {
    return JSON.stringify({
      success: true,
      messageId: `msg_${Date.now()}`,
      to: args.to,
      subject: args.subject,
      preview: `Email sent to ${args.to} with subject "${args.subject}" (mock)`,
    });
  }

  private static executeCodeInterpreter(args: { code: string }): string {
    try {
      // Very basic code execution - DO NOT use in production!
      const result = eval(args.code);
      return JSON.stringify({
        success: true,
        result: String(result),
        type: typeof result,
      });
    } catch (e) {
      return JSON.stringify({
        success: false,
        error: String(e),
      });
    }
  }

  /**
   * Execute multiple tool calls and return tool response messages
   */
  static async executeToolCalls(toolCalls: ToolCall[]): Promise<Message[]> {
    const toolMessages: Message[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeTool(toolCall);

      toolMessages.push({
        role: Role.TOOL,
        tool_call_id: toolCall.id,
        content: result,
      });
    }

    return toolMessages;
  }
}
