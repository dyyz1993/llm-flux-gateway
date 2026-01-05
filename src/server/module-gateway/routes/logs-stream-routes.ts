import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { sseBroadcasterService } from '../services/sse-broadcaster.service';

const router = new Hono();

/**
 * GET /api/logs/stream
 *
 * SSE 实时推送新日志
 */
router.get('/', async (c) => {
  const apiKeyId = c.req.query('apiKeyId');

  return streamSSE(c, async (stream) => {
    console.log('[LogsStream] SSE connection opened', apiKeyId ? `for apiKey: ${apiKeyId}` : '');

    // 不发送连接消息 - 前端通过 onopen 事件检测连接
    // 只发送实际的日志数据

    // 创建一个回调函数，当有新日志时被调用
    const onNewLog = async (logData: string) => {
      try {
        // logData 已经是正确的 SSE 格式 (data: {...}\n\n)
        await stream.write(logData);
        console.log('[LogsStream] Successfully sent log to client');
        return true;
      } catch (error) {
        console.error('[LogsStream] Failed to send log:', error);
        return false;
      }
    };

    // 注册回调到广播服务
    const unregister = sseBroadcasterService.registerCallback(onNewLog);

    console.log('[LogsStream] Registered callback, waiting for logs...');

    // 清理函数：当客户端断开连接时
    stream.onAbort(() => {
      console.log('[LogsStream] Client disconnected, cleaning up...');
      unregister();
    });

    // ✅ 保持连接打开 - 使用永不结束的 Promise
    // streamSSE 需要回调函数保持运行状态，否则会关闭连接
    await new Promise<void>((resolve) => {
      // 当客户端断开时，resolve 这个 Promise
      stream.onAbort(() => {
        resolve();
      });
    });
  });
});

export default router;
