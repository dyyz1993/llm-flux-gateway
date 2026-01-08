import { queryAll, queryFirst, queryRun } from '@server/shared/database';
import { randomUUID } from 'node:crypto';
import type { RequestLog } from '@shared/types';
import { sseBroadcasterService } from './sse-broadcaster.service';

// Maximum number of logs to keep (favorited logs are exempt)
const MAX_LOGS_COUNT = parseInt(process.env.MAX_LOGS_COUNT || '5000');

export interface CreateLogParams {
  id?: string; // Allow external ID to be passed for consistency
  apiKeyId: string;
  routeId: string | null;
  originalModel: string;
  finalModel: string;
  messages: any[];
  overwrittenAttributes: Record<string, { original: any; final: any }>;
  requestTools?: any[];
  temperature?: number;
  baseUrl?: string;
  // New fields
  messageCount?: number;
  firstMessage?: string;
  hasTools?: boolean;
  toolCount?: number;
  requestParams?: any;
  overwrittenModel?: string;
  overwrittenFields?: any;
}

export interface UpdateLogParams {
  statusCode: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  timeToFirstByteMs?: number;
  errorMessage?: string;
  responseContent?: string;
  // New fields
  cachedTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  responseParams?: any;
  responseToolCalls?: any[];
  // Original Response (NEW)
  originalResponse?: string;
  originalResponseFormat?: 'openai' | 'openai-responses' | 'anthropic' | 'gemini';
}

/**
 * Request Log Service
 *
 * Records all proxy requests and responses
 */
export class RequestLogService {
  /**
   * Create a new request log entry
   */
  async createLog(params: CreateLogParams): Promise<string> {
    // Auto cleanup old logs before creating new one
    await this.cleanupOldLogs();

    const id = params.id || randomUUID();
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    // Calculate message statistics
    const messageCount = params.messageCount ?? params.messages.length;
    const firstMessage = params.firstMessage ?? this.extractFirstMessage(params.messages);
    const hasTools = params.hasTools ?? Boolean(params.requestTools && params.requestTools.length > 0);
    const toolCount = params.toolCount ?? (params.requestTools?.length ?? 0);

    // Extract overwritten model if model was changed
    const overwrittenModel = params.overwrittenModel ?? (
      params.originalModel !== params.finalModel ? params.originalModel : null
    );

    // Merge model override into overwrittenAttributes for unified display
    const allOverwrittenAttributes = { ...params.overwrittenAttributes };
    if (overwrittenModel) {
      allOverwrittenAttributes['model'] = {
        original: overwrittenModel,
        final: params.finalModel,
      };
    }

    queryRun(
      `
      INSERT INTO request_logs (
        id, api_key_id, route_id, original_model, final_model,
        method, path, messages, overwritten_attributes,
        request_tools, temperature, base_url,
        prompt_tokens, completion_tokens, total_tokens,
        latency_ms, status_code, timestamp,
        message_count, first_message, has_tools, tool_count,
        request_params, overwritten_model, overwritten_fields
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        params.apiKeyId,
        params.routeId,
        params.originalModel,
        params.finalModel,
        'POST',
        '/v1/chat/completions',
        JSON.stringify(params.messages),
        JSON.stringify(allOverwrittenAttributes),
        params.requestTools ? JSON.stringify(params.requestTools) : null,
        params.temperature?.toString() || null,
        params.baseUrl || null,
        0, // prompt_tokens - updated later
        0, // completion_tokens - updated later
        0, // total_tokens - updated later
        0, // latency_ms - updated later
        0, // status_code - updated later
        now,
        messageCount,
        firstMessage,
        hasTools ? 1 : 0,
        toolCount,
        params.requestParams ? JSON.stringify(params.requestParams) : null,
        overwrittenModel || null,
        params.overwrittenFields ? JSON.stringify(params.overwrittenFields) : null,
      ]
    );

    return id;
  }

  /**
   * Update log entry with response data
   */
  async updateLog(id: string, params: UpdateLogParams): Promise<void> {
    const totalTokens = params.promptTokens + params.completionTokens;

    queryRun(
      `
      UPDATE request_logs
      SET status_code = ?,
          prompt_tokens = ?,
          completion_tokens = ?,
          total_tokens = ?,
          cached_tokens = COALESCE(?, cached_tokens),
          cache_read_tokens = COALESCE(?, cache_read_tokens),
          cache_write_tokens = COALESCE(?, cache_write_tokens),
          latency_ms = ?,
          time_to_first_byte_ms = ?,
          error_message = ?,
          response_content = ?,
          response_params = ?,
          response_tool_calls = ?,
          original_response = ?,
          original_response_format = ?
      WHERE id = ?
      `,
      [
        params.statusCode,
        params.promptTokens,
        params.completionTokens,
        totalTokens,
        params.cachedTokens ?? null,
        params.cacheReadTokens ?? null,
        params.cacheWriteTokens ?? null,
        params.latencyMs,
        params.timeToFirstByteMs || null,
        params.errorMessage || null,
        params.responseContent || null,
        params.responseParams ? JSON.stringify(params.responseParams) : null,
        params.responseToolCalls ? JSON.stringify(params.responseToolCalls) : null,
        params.originalResponse || null,
        params.originalResponseFormat || null,
        id
      ]
    );

    // 📢 Broadcast the updated log to all SSE clients (using summary view to save bandwidth)
    const logFromDb = queryFirst<any>(`SELECT * FROM request_logs WHERE id = ?`, [id]);
    if (logFromDb) {
      const summaryLog = this.mapDbLogToSummaryRequestLog(logFromDb);
      sseBroadcasterService.broadcastNewLog(summaryLog).catch((error) => {
        console.error('[RequestLogService] Failed to broadcast log:', error);
      });
    }
  }

  /**
   * Get logs by API key
   */
  async getLogsByApiKey(apiKeyId: string, limit = 50) {
    const logs = queryAll<any>(
      `
      SELECT 
        id, api_key_id, route_id, original_model, final_model,
        method, path, status_code, timestamp, latency_ms,
        prompt_tokens, completion_tokens, total_tokens,
        message_count, first_message, has_tools, tool_count,
        is_favorited, original_response_format
      FROM request_logs
      WHERE api_key_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
      `,
      [apiKeyId, limit]
    );

    return logs.map((log: any) => this.mapDbLogToSummaryRequestLog(log));
  }

  /**
   * Get all logs with pagination
   */
  async getAllLogs(limit = 1000, offset = 0) {
    const logs = queryAll<any>(
      `
      SELECT 
        id, api_key_id, route_id, original_model, final_model,
        method, path, status_code, timestamp, latency_ms,
        prompt_tokens, completion_tokens, total_tokens,
        message_count, first_message, has_tools, tool_count,
        is_favorited, original_response_format
      FROM request_logs
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
      `,
      [limit, offset]
    );

    return logs.map((log: any) => this.mapDbLogToSummaryRequestLog(log));
  }

  /**
   * Get log by ID
   */
  async getLogById(id: string) {
    const log = queryFirst<any>(
      `
      SELECT * FROM request_logs
      WHERE id = ?
      `,
      [id]
    );

    if (!log) return null;

    return this.mapDbLogToRequestLog(log);
  }

  /**
   * Helper to extract first message content
   */
  private extractFirstMessage(messages: any[]): string {
    if (!messages || messages.length === 0) return '';
    const firstMsg = messages[0];
    if (typeof firstMsg.content === 'string') {
      return firstMsg.content.slice(0, 200); // First 200 chars
    }
    return JSON.stringify(firstMsg.content || '').slice(0, 200);
  }

  /**
   * Map database row to RequestLog interface (Summary version)
   * This excludes large fields like messages, responseContent, etc.
   */
  private mapDbLogToSummaryRequestLog(log: any): RequestLog {
    return {
      id: log.id,
      apiKeyId: log.api_key_id,
      routeId: log.route_id,
      originalModel: log.original_model,
      finalModel: log.final_model,
      method: log.method,
      path: log.path,
      statusCode: log.status_code,
      timestamp: log.timestamp,
      latencyMs: log.latency_ms,
      promptTokens: log.prompt_tokens,
      completionTokens: log.completion_tokens,
      totalTokens: log.total_tokens,
      messageCount: log.message_count || 0,
      firstMessage: log.first_message || '',
      hasTools: Boolean(log.has_tools),
      toolCount: log.tool_count || 0,
      isFavorited: Boolean(log.is_favorited),
      originalResponseFormat: log.original_response_format,
      // Provide empty placeholders for required fields to avoid client crashes
      messages: [],
      responseContent: '',
      overwrittenAttributes: {},
    };
  }

  /**
   * Map database row to RequestLog interface
   */
  private mapDbLogToRequestLog(log: any) {
    return {
      id: log.id,
      apiKeyId: log.api_key_id,
      routeId: log.route_id,
      originalModel: log.original_model,
      finalModel: log.final_model,
      overwrittenModel: log.overwritten_model || undefined,
      overwrittenFields: log.overwritten_fields ? JSON.parse(log.overwritten_fields) : undefined,
      method: log.method,
      path: log.path,
      requestTools: log.request_tools ? JSON.parse(log.request_tools) : undefined,
      temperature: log.temperature ? parseFloat(log.temperature) : undefined,
      baseUrl: log.base_url,
      promptTokens: log.prompt_tokens,
      completionTokens: log.completion_tokens,
      totalTokens: log.total_tokens,
      cachedTokens: log.cached_tokens || undefined,
      cacheReadTokens: log.cache_read_tokens || undefined,
      cacheWriteTokens: log.cache_write_tokens || undefined,
      latencyMs: log.latency_ms,
      timeToFirstByteMs: log.time_to_first_byte_ms,
      statusCode: log.status_code,
      errorMessage: log.error_message,
      responseParams: log.response_params ? JSON.parse(log.response_params) : undefined,
      messages: JSON.parse(log.messages || '[]'),
      responseContent: log.response_content,
      responseToolCalls: log.response_tool_calls ? JSON.parse(log.response_tool_calls) : undefined,
      overwrittenAttributes: JSON.parse(log.overwritten_attributes || '{}'),
      timestamp: log.timestamp,
      // New fields
      messageCount: log.message_count || 0,
      firstMessage: log.first_message || '',
      hasTools: Boolean(log.has_tools),
      toolCount: log.tool_count || 0,
      requestParams: log.request_params ? JSON.parse(log.request_params) : undefined,
      // Original Response (NEW)
      originalResponse: log.original_response,
      originalResponseFormat: log.original_response_format,
      // Favorite
      isFavorited: Boolean(log.is_favorited),
    };
  }

  /**
   * Clean up old logs to maintain MAX_LOGS_COUNT limit
   * Only removes non-favorited logs
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      // Get current count of non-favorited logs
      const countResult = queryFirst<{ count: number }>(
        `SELECT COUNT(*) as count FROM request_logs WHERE is_favorited = 0`
      );

      const currentCount = countResult?.count || 0;

      if (currentCount <= MAX_LOGS_COUNT) {
        return; // Under limit, no cleanup needed
      }

      const logsToDelete = currentCount - MAX_LOGS_COUNT;

      // Delete oldest non-favorited logs
      queryRun(
        `DELETE FROM request_logs
         WHERE id IN (
           SELECT id FROM request_logs
           WHERE is_favorited = 0
           ORDER BY timestamp ASC
           LIMIT ?
         )`,
        [logsToDelete]
      );

      console.log(`[RequestLogService] Cleaned up ${logsToDelete} old logs`);
    } catch (error) {
      console.error('[RequestLogService] Failed to cleanup old logs:', error);
    }
  }

  /**
   * Toggle favorite status of a log
   */
  async toggleFavorite(logId: string): Promise<{ isFavorited: boolean }> {
    // Get current status
    const log = queryFirst<any>(
      `SELECT is_favorited FROM request_logs WHERE id = ?`,
      [logId]
    );

    if (!log) {
      throw new Error('Log not found');
    }

    const newStatus = log.is_favorited === 0 ? 1 : 0;

    queryRun(
      `UPDATE request_logs SET is_favorited = ? WHERE id = ?`,
      [newStatus, logId]
    );

    return { isFavorited: newStatus === 1 };
  }

  /**
   * Get all favorited logs
   */
  async getFavoriteLogs(limit = 100): Promise<RequestLog[]> {
    const logs = queryAll<any>(
      `SELECT 
        id, api_key_id, route_id, original_model, final_model,
        method, path, status_code, timestamp, latency_ms,
        prompt_tokens, completion_tokens, total_tokens,
        message_count, first_message, has_tools, tool_count,
        is_favorited, original_response_format
       FROM request_logs
       WHERE is_favorited = 1
       ORDER BY timestamp DESC
       LIMIT ?`,
      [limit]
    );

    return logs.map((log: any) => this.mapDbLogToSummaryRequestLog(log));
  }

  /**
   * Get logs statistics
   */
  async getStats(): Promise<{ totalCount: number; favoritedCount: number; regularCount: number }> {
    const totalResult = queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM request_logs`
    );
    const favoritedResult = queryFirst<{ count: number }>(
      `SELECT COUNT(*) as count FROM request_logs WHERE is_favorited = 1`
    );

    const totalCount = totalResult?.count || 0;
    const favoritedCount = favoritedResult?.count || 0;

    return {
      totalCount,
      favoritedCount,
      regularCount: totalCount - favoritedCount,
    };
  }

  /**
   * Clear all non-favorited logs
   * Returns the number of logs deleted
   */
  async clearAllNonFavorited(): Promise<{ deletedCount: number }> {
    try {
      // Get count before deletion
      const countResult = queryFirst<{ count: number }>(
        `SELECT COUNT(*) as count FROM request_logs WHERE is_favorited = 0`
      );

      const countToDelete = countResult?.count || 0;

      if (countToDelete === 0) {
        return { deletedCount: 0 };
      }

      // Delete all non-favorited logs
      queryRun(
        `DELETE FROM request_logs WHERE is_favorited = 0`
      );

      console.log(`[RequestLogService] Cleared ${countToDelete} non-favorited logs`);

      return { deletedCount: countToDelete };
    } catch (error) {
      console.error('[RequestLogService] Failed to clear logs:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const requestLogService = new RequestLogService();
