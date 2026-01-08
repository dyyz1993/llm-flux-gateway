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
    console.log('[LogsStream] SSE connection opening...', apiKeyId ? `for apiKey: ${apiKeyId}` : '');

    // 1. 立即设置合适的 Headers，防止代理缓存
    // 注意：Hono streamSSE 已经处理了 content-type: text/event-stream
    // 我们额外设置缓存控制
    c.header('Cache-Control', 'no-cache, no-transform');
    c.header('X-Accel-Buffering', 'no'); // 针对 Nginx

    // 2. 立即发送连接确认
    try {
      await stream.write(': connected\n\n');
      await stream.write('event: connected\ndata: {"status":"ok"}\n\n');
      console.log('[LogsStream] Connection ack sent');
    } catch (e) {
      console.error('[LogsStream] Failed to send initial ack:', e);
      return;
    }

    // 3. 注册回调
    const onNewLog = async (logData: string) => {
      try {
        await stream.write(logData);
        return true;
      } catch (error) {
        return false;
      }
    };

    const unregister = sseBroadcasterService.registerCallback(onNewLog);

    // 4. 优化保持连接的方式
    // 监听断开
    let isAborted = false;
    stream.onAbort(() => {
      isAborted = true;
      console.log('[LogsStream] Client disconnected, cleaning up...');
      unregister();
    });

    // 使用非阻塞循环保持连接，同时定期检查状态
    // 这种方式比 new Promise 更稳健，能及时响应系统中断
    while (!isAborted) {
      await stream.sleep(10000); // 每10秒检查一次状态，心跳由 broadcaster 处理
    }
  });
});

export default router;
