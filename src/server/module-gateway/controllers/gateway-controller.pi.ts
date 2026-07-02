/**
 * 新网关控制器（pi-ai 方案）
 *
 * 替换旧 controller 中的协议转换逻辑，使用：
 *   输入适配器 → pi-ai Context → pi-ai 统一调用 → pi-ai 事件 → 输出适配器
 *
 * 保留：路由匹配 (routeMatcherService)、重写 (rewriteService)、日志 (requestLogService)
 * 替换：protocolTranspiler → adapters, upstreamService → pi-ai models
 * 删除：vision-filter, format-inferer, protocol-transpiler
 *
 * 旧控制器: 1005 行
 * 新控制器: ~350 行（-650 行自定义协议转换代码）
 */
import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { randomUUID } from 'node:crypto';

import { routeMatcherService } from '../services/route-matcher.service';
import { rewriteService } from '../services/rewrite.service';
import { requestLogService } from '../services/request-log.service';
import { logRequestTrace } from '../services/upstream.service';

import { getInputAdapter, type SourceFormat } from '../../adapters/input/index';
import { getOutputAdapter, type ResponseFormat } from '../../adapters/output/index';

import { getModelsInstance, registerPiRoute, mapRequestFormatToApi } from '../../pi-providers/index';

const router = new Hono();

// ============================================================
// Unified Request Handler — pi-ai 版本
// ============================================================

export async function handleGatewayRequestPi(
  c: any,
  sourceFormat: SourceFormat,
  manualBody?: any,
  manualApiKeyId?: string
): Promise<Response> {
  const apiKeyId = manualApiKeyId || c.get('apiKeyId');
  const requestId = randomUUID();
  const startTime = Date.now();

  // 1. 解析请求体
  let body = manualBody;
  if (!body) {
    try {
      body = await c.req.json();
    } catch (error: any) {
      return c.json({
        success: false,
        error: `Invalid JSON: ${error.message}`,
      }, 400);
    }
  }

  const isStream = body.stream === true;

  // 2. 输入适配器: 客户端格式 → pi-ai Context
  const inputAdapter = getInputAdapter(sourceFormat);
  let piContext: ReturnType<typeof inputAdapter.toPiContext>;
  try {
    piContext = inputAdapter.toPiContext(body);
  } catch (error: any) {
    return c.json({
      success: false,
      error: `Input conversion failed: ${error.message}`,
    }, 400);
  }

  const { context, options } = piContext;

  // 3. 路由匹配
  const match = await routeMatcherService.findMatch(body.model, apiKeyId);
  if (!match) {
    return c.json({
      success: false,
      error: `No matching route for model: ${body.model}`,
    }, 404);
  }

  // 4. 重写规则
  const rewriteResult = rewriteService.applyRules(
    { model: body.model, messages: context.messages, ...options },
    match.route.overrides
  );
  const upstreamModel = rewriteResult.rewrittenRequest.model;

  // 5. 确定输出格式
  const responseFormat: ResponseFormat = (match.route as any)?.responseFormat ?? (sourceFormat as ResponseFormat);

  // 6. 确保 pi-ai Provider 已注册
  const apiType = mapRequestFormatToApi(match.route.requestFormat);
  const models = getModelsInstance();
  let piModel = models.getModel(match.route.id, upstreamModel);
  if (!piModel) {
    piModel = await registerPiRoute({
      id: match.route.id,
      name: match.route.name,
      baseUrl: match.route.baseUrl,
      apiType: apiType as any,
      upstreamModel,
      apiKey: match.route.upstreamApiKey,
      responseFormat,
    });
  }

  // 7. 创建日志
  const logId = await requestLogService.createLog({
    id: requestId,
    apiKeyId,
    routeId: match.route.id,
    originalModel: body.model,
    finalModel: upstreamModel,
    method: c.req.method,
    path: c.req.path,
    messages: context.messages,
    overwrittenAttributes: rewriteResult.overwrittenAttributes,
    baseUrl: `${match.route.baseUrl}${match.route.endpoint}`,
    originalRequestFormat: sourceFormat,
    originalRequestRaw: JSON.stringify(body),
    stream: isStream,
    requestParams: { ...options },
  });

  // 写请求 Trace 日志（调试用）
  logRequestTrace({
    metadata: { requestId, timestamp: new Date().toISOString(), vendor: sourceFormat, url: `${match.route.baseUrl}${match.route.endpoint}`, requestType: isStream ? 'streaming' : 'non-streaming' },
    request: { method: 'POST', url: `${match.route.baseUrl}${match.route.endpoint}`, headers: {}, body: body },
  }).catch(() => {});

  try {
    if (isStream) {
      // ========================================
      // 流式处理
      // ========================================
      c.header('Content-Type', 'text/event-stream');
      c.header('Cache-Control', 'no-cache');
      c.header('Connection', 'keep-alive');
      c.header('X-Accel-Buffering', 'no');

      return streamText(c, async (ss) => {
        const outputAdapter = getOutputAdapter(responseFormat);
        let promptTokens = 0;
        let completionTokens = 0;
        let cachedTokens = 0;
        let chunkCount = 0;
        let errorMsg: string | undefined;

        const streamOpts = {
          ...options,
          apiKey: match.route.upstreamApiKey,
          signal: c.req.raw?.signal,
          maxRetries: 0, // 由网关自己的负载均衡控制重试
        };

        try {
          const piStream = models.stream(piModel!, context, streamOpts);

          for await (const event of piStream) {
            if (event.type === 'done') {
              const u = event.message.usage;
              promptTokens = u.input;
              completionTokens = u.output;
              cachedTokens = u.cacheRead;
            }

            const sseLines = [...outputAdapter.eventToSSE(event)];
            for (const line of sseLines) {
              await ss.write(line);
              chunkCount++;
            }
          }
        } catch (error: any) {
          errorMsg = error.message;
          // 尝试发送错误 SSE
          try {
            const errorEvent = {
              type: 'error' as const,
              reason: 'error' as const,
              error: {
                role: 'assistant' as const,
                content: [],
                api: '',
                provider: match.route.id,
                model: upstreamModel,
                usage: {
                  input: 0, output: 0, totalTokens: 0,
                  cacheRead: 0, cacheWrite: 0,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
                stopReason: 'error' as const,
                errorMessage: error.message,
                timestamp: Date.now(),
              },
            };
            for (const line of [...(outputAdapter.eventToSSE as any)(errorEvent)]) {
              await ss.write(line);
            }
          } catch { /* 忽略 SSE 写入错误 */ }
        } finally {
          const latency = Date.now() - startTime;
          await requestLogService.updateLog(logId, {
            statusCode: errorMsg ? 500 : 200,
            promptTokens, completionTokens, cachedTokens,
            latencyMs: latency,
            errorMessage: errorMsg,
          });
        }
      });
    } else {
      // ========================================
      // 非流式处理
      // ========================================
      try {
        const completeOpts = { ...options, apiKey: match.route.upstreamApiKey, maxRetries: 0 };
        const result = await models.complete(piModel!, context, completeOpts);
        const outputAdapter = getOutputAdapter(responseFormat);
        const output = outputAdapter.responseToJson(result);

        const latency = Date.now() - startTime;
        await requestLogService.updateLog(logId, {
          statusCode: 200,
          promptTokens: result.usage.input,
          completionTokens: result.usage.output,
          cachedTokens: result.usage.cacheRead,
          latencyMs: latency,
          responseContent: JSON.stringify(result.content),
        });

        return c.json(output);
      } catch (error: any) {
        const latency = Date.now() - startTime;
        await requestLogService.updateLog(logId, {
          statusCode: 500, promptTokens: 0, completionTokens: 0, latencyMs: latency,
          errorMessage: error.message,
        });
        return c.json({ success: false, error: error.message }, 500);
      }
    }
  } catch (error: any) {
    const latency = Date.now() - startTime;
    await requestLogService.updateLog(logId, {
      statusCode: 500, promptTokens: 0, completionTokens: 0, latencyMs: latency,
      errorMessage: error.message,
    });
    return c.json({ success: false, error: error.message }, 500);
  }
}

// ============================================================
// Route Definitions
// ============================================================

router.post('/v1/chat/completions', async (c) => {
  return handleGatewayRequestPi(c, 'openai');
});

router.post('/v1/messages', async (c) => {
  return handleGatewayRequestPi(c, 'anthropic');
});

router.post('/v1/models/*', async (c) => {
  const path = c.req.path;
  if (!path.endsWith(':generateContent')) {
    return c.json({ success: false, error: 'Invalid Gemini endpoint' }, 404);
  }
  return handleGatewayRequestPi(c, 'gemini');
});

router.get('/v1/models', async (c) => {
  const routes = await routeMatcherService.getActiveRoutes();
  const modelSet = new Set<string>();

  // 从路由配置中提取可用模型名
  for (const r of routes) {
    const overrides = (r as any).overrides ?? [];
    let hasModelRule = false;
    for (const o of overrides) {
      if (o.field === 'model' && Array.isArray(o.matchValues)) {
        for (const v of o.matchValues) {
          if (v !== '*') modelSet.add(v);
        }
        hasModelRule = true;
      }
    }
    if (!hasModelRule) {
      modelSet.add((r as any).name);
    }
  }

  // 加上 pi-ai 内置的 1029 个模型
  try {
    const { builtinModels } = await import('@earendil-works/pi-ai/providers/all');
    const catalog = builtinModels();
    for (const m of catalog.getModels()) {
      modelSet.add(m.id);
    }
  } catch { /* pi-ai 内置目录不可用时不影响 */ }

  const models = Array.from(modelSet).sort().map((id) => ({
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'gateway',
  }));

  return c.json({ object: 'list', data: models });
});

export default router;
