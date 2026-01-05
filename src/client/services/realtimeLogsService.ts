/**
 * Real-time Logs Service
 *
 * 使用 SSE 接收实时日志推送
 */

import { RequestLog } from '@shared/types';

// 事件监听器类型
type LogEventListener = (log: RequestLog) => void;

class RealtimeLogsService {
  private eventSource: EventSource | null = null;
  private listeners: Set<LogEventListener> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000; // 2秒

  /**
   * 启动实时日志流
   */
  connect(apiKeyId?: string) {
    // 如果已经连接，先断开
    this.disconnect();

    // 构建 URL
    const url = new URL('/api/logs/stream', window.location.origin);
    if (apiKeyId) {
      url.searchParams.set('apiKeyId', apiKeyId);
    }

    console.log('[RealtimeLogs] Connecting to:', url.toString());

    // 创建 EventSource 连接
    this.eventSource = new EventSource(url.toString());

    // 监听连接打开
    this.eventSource.onopen = () => {
      console.log('[RealtimeLogs] Connected');
      this.reconnectAttempts = 0;
    };

    // 监听新日志消息
    this.eventSource.onmessage = (event) => {
      try {
        const log: RequestLog = JSON.parse(event.data!);
        console.log('[RealtimeLogs] New log received:', log.id);

        // 通知所有监听器
        this.listeners.forEach(listener => listener(log));
      } catch (error) {
        console.error('[RealtimeLogs] Failed to parse log:', error);
      }
    };

    // 监听错误
    this.eventSource.onerror = (error) => {
      console.error('[RealtimeLogs] Connection error:', error);

      // 尝试重连
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`[RealtimeLogs] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        setTimeout(() => {
          this.connect(apiKeyId);
        }, this.reconnectDelay * this.reconnectAttempts);
      } else {
        console.error('[RealtimeLogs] Max reconnect attempts reached');
        this.disconnect();
      }
    };
  }

  /**
   * 断开连接
   */
  disconnect() {
    if (this.eventSource) {
      console.log('[RealtimeLogs] Disconnecting');
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * 添加日志监听器
   */
  subscribe(listener: LogEventListener) {
    this.listeners.add(listener);

    // 返回取消订阅函数
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}

// 导出单例
export const realtimeLogsService = new RealtimeLogsService();
