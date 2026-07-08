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
import { sseBroadcasterService } from '../services/sse-broadcaster.service';

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

  // 3. 路由匹配（取所有匹配的路由，用于 failover）
  const matches = await routeMatcherService.findAllMatches(body.model, apiKeyId);
  if (!matches || matches.length === 0) {
    return c.json({
      success: false,
      error: `No matching route for model: ${body.model}`,
    }, 404);
  }

  // 取第一个匹配作为主路由
  const match = matches[0];
  const fallbackMatch = matches.length > 1 ? matches[1] : null;

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
        const streamConverter = outputAdapter.createStreamConverter();
        // 设置响应 model 为客户端请求的模型名（如 flash-v2），不是上游模型名
        streamConverter.reset(undefined, body.model);
        let promptTokens = 0;
        let completionTokens = 0;
        let cachedRead = 0;
        let cachedWrite = 0;
        let reasoningTokens = 0;
        let inputCost = 0;
        let outputCost = 0;
        let cacheReadCost = 0;
        let cacheWriteCost = 0;
        let totalCost = 0;
        let chunkCount = 0;
        let errorMsg: string | undefined;
        let accumulatedText = '';
        let accumulatedToolCalls: any[] = [];

        const streamOpts = {
          ...options,
          apiKey: match.route.upstreamApiKey,
          signal: c.req.raw?.signal,
          maxRetries: 0,
        };

        try {
          const piStream = models.stream(piModel!, context, streamOpts);

          for await (const event of piStream) {
            if (event.type === 'done') {
              const u = event.message.usage;
              promptTokens = u.input;
              completionTokens = u.output;
              cachedRead = u.cacheRead;
              cachedWrite = u.cacheWrite;
              reasoningTokens = u.reasoning ?? 0;
              inputCost = u.cost.input;
              outputCost = u.cost.output;
              cacheReadCost = u.cost.cacheRead;
              cacheWriteCost = u.cost.cacheWrite;
              totalCost = u.cost.total;
            }

            // 汇总流式文本内容 & 广播 delta 到日志控制台
            if (event.type === 'text_delta') {
              accumulatedText += event.delta;
              sseBroadcasterService.broadcastLogDelta(logId, event.delta, 'text').catch(() => {});
            }

            // 广播 reasoning delta
            if (event.type === 'thinking_delta') {
              sseBroadcasterService.broadcastLogDelta(logId, event.delta, 'reasoning').catch(() => {});
            }

            // 捕获 tool calls 用于日志记录
            if (event.type === 'toolcall_end' && event.toolCall) {
              accumulatedToolCalls.push({
                id: event.toolCall.id,
                type: 'function',
                function: {
                  name: event.toolCall.name,
                  arguments: JSON.stringify(event.toolCall.arguments || {}),
                },
              });
            }

            // pi-ai 发出 error 事件（非 throw，是 event stream 的一部分）
            if (event.type === 'error') {
              errorMsg = event.error.errorMessage || 'Upstream stream error';
            }

            const sseLines = [...streamConverter.eventToSSE(event)];
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
            for (const line of [...streamConverter.eventToSSE(errorEvent)]) {
              await ss.write(line);
            }
          } catch { /* 忽略 SSE 写入错误 */ }
        } finally {
          const latency = Date.now() - startTime;
          await requestLogService.updateLog(logId, {
            statusCode: errorMsg ? 502 : (promptTokens ? 200 : 500),
            promptTokens, completionTokens,
            cacheReadTokens: cachedRead, cacheWriteTokens: cachedWrite,
            reasoningTokens,
            inputCost, outputCost,
            cacheReadCost, cacheWriteCost, totalCost,
            latencyMs: latency,
            errorMessage: errorMsg || (promptTokens ? undefined : 'No response data received'),
            responseContent: accumulatedText || undefined,
            responseToolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
          });

          // 流式请求出错时追加一条错误 trace
          if (errorMsg) {
            logRequestTrace({
              metadata: { requestId, timestamp: new Date().toISOString(), vendor: sourceFormat, url: `${match.route.baseUrl}${match.route.endpoint}`, requestType: 'streaming', latency, statusCode: 502 },
              request: { method: 'POST', url: `${match.route.baseUrl}${match.route.endpoint}`, headers: {}, body },
              error: { message: errorMsg },
            }).catch(() => {});
          }
        }
      });
    } else {
      // ========================================
      // 非流式处理
      // ========================================
      try {
        const completeOpts = { ...options, apiKey: match.route.upstreamApiKey, maxRetries: 0 };
        const result = await models.complete(piModel!, context, completeOpts);

        // 处理上游返回的错误（如 Key 无效、限流等）
        if (result.stopReason === 'error' || result.stopReason === 'aborted') {
          const errMsg = result.errorMessage || 'Upstream request failed';
          const latency = Date.now() - startTime;
          console.error(`[Gateway] ⚠️ Upstream error: ${errMsg}`);
          console.error(`[Gateway]    request: ${JSON.stringify({ model: body.model, messages: body.messages?.length + ' msgs', tools: body.tools?.length || 0, max_tokens: body.max_tokens })}`);
          console.error(`[Gateway]    route: ${match.route.id} → ${upstreamModel} (${latency}ms)`);
          await requestLogService.updateLog(logId, {
            statusCode: 502, promptTokens: 0, completionTokens: 0, latencyMs: latency,
            errorMessage: errMsg,
          });
          // 也写一份 request trace 文件
          logRequestTrace({
            metadata: { requestId, timestamp: new Date().toISOString(), vendor: match.route.requestFormat, url: `${match.route.baseUrl}${match.route.endpoint}`, requestType: 'non-streaming', latency, statusCode: 502 },
            request: { method: 'POST', url: `${match.route.baseUrl}${match.route.endpoint}`, headers: {}, body },
            error: { message: errMsg },
          }).catch(() => {});
          return c.json({
            error: { message: errMsg, type: 'upstream_error', code: 502 },
          }, 502);
        }

        const outputAdapter = getOutputAdapter(responseFormat);
        const output = outputAdapter.responseToJson(result);
        // 把模型名设回客户端请求的名字，避免 AI 工具检测到"模型循环"
        output.model = body.model;

        const latency = Date.now() - startTime;
        await requestLogService.updateLog(logId, {
          statusCode: 200,
          promptTokens: result.usage.input,
          completionTokens: result.usage.output,
          cacheReadTokens: result.usage.cacheRead,
          cacheWriteTokens: result.usage.cacheWrite,
          reasoningTokens: result.usage.reasoning ?? 0,
          inputCost: result.usage.cost.input,
          outputCost: result.usage.cost.output,
          cacheReadCost: result.usage.cost.cacheRead,
          cacheWriteCost: result.usage.cost.cacheWrite,
          totalCost: result.usage.cost.total,
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
