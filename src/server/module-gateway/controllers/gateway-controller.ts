import { Hono } from 'hono';
import { streamText } from 'hono/streaming';
import { routeMatcherService } from '../services/route-matcher.service';
import { rewriteService } from '../services/rewrite.service';
import { upstreamService, logRequestTrace } from '../services/upstream.service';
import { requestLogService } from '../services/request-log.service';
import { protocolTranspiler } from '../../module-protocol-transpiler/protocol-transpiler-singleton';
import { createTransformationLogger } from '../services/protocol-transformation-logger.service';
import type {
  VendorType,
  InternalToolCall,
  InternalMessage,
} from '../../module-protocol-transpiler/interfaces';
import { assertInternalResponse, assertInternalRequest } from '../../module-protocol-transpiler/interfaces/internal-format';
import { randomUUID } from 'node:crypto';

// Route config format type (excludes 'custom')
type RouteConfigFormat = 'openai' | 'openai-responses' | 'anthropic' | 'gemini';

const router = new Hono();

// ============================================
// Unified Request Handler
// ============================================

/**
 * Unified gateway request handler supporting multiple API formats
 */
async function handleGatewayRequest(
  c: any,
  sourceFormat: VendorType
): Promise<Response> {
  const apiKeyId = c.get('apiKeyId');
  // const apiKey = c.get('apiKey');

  // Generate unique request ID for this request
  const requestId = randomUUID();

  // Create protocol transformation logger
  const transformationLogger = await createTransformationLogger(requestId);

  // Parse request body with enhanced error handling
  let body;
  try {
    body = await c.req.json();
  } catch (error: any) {
    // Get raw body for debugging
    const rawBody = await c.req.text();

    console.error('[Gateway] JSON Parse Error:', {
      requestId,
      errorMessage: error.message,
      errorPosition: error.position,
      rawBodyLength: rawBody.length,
      rawBodyPreview: rawBody.slice(0, 500),
      // Show context around error position
      errorContext: error.position
        ? {
            beforeError: rawBody.slice(Math.max(0, error.position - 50), error.position),
            atError: rawBody.slice(error.position, error.position + 10),
            afterError: rawBody.slice(error.position + 10, error.position + 60),
          }
        : null,
    });

    return c.json({
      success: false,
      error: `Invalid JSON in request body at position ${error.position}: ${error.message}`,
      details: {
        position: error.position,
        context: error.position
          ? rawBody.slice(Math.max(0, error.position - 50), error.position + 60)
          : rawBody.slice(0, 200),
      },
    }, 400);
  }

  console.log('[Gateway] Received request in format:', sourceFormat, {
    requestId,
    bodyKeys: Object.keys(body),
    hasModel: !!body.model,
    hasMessages: !!body.messages,
    hasContents: !!body.contents,
  });

  // Step 1: Convert source format to internal (OpenAI) format
  const internalRequestResult = protocolTranspiler.transpile(
    body,
    sourceFormat,
    'openai'  // Internal format is OpenAI
  );

  // Log Step 1: Client format → Internal format
  transformationLogger.logStep1_ClientToInternal(
    sourceFormat,
    body, // input: complete client request
    internalRequestResult.data!, // output: complete internal format
    internalRequestResult.success,
    internalRequestResult.errors || [],
    internalRequestResult.warnings || [],
    internalRequestResult.metadata
  );

  if (!internalRequestResult.success) {
    console.error('[Gateway] Format conversion errors:', internalRequestResult.errors);

    // Log error and complete
    transformationLogger.logError('Step1_ClientToInternal', new Error(internalRequestResult.errors?.[0]?.message || 'Conversion failed'));
    await transformationLogger.complete();

    return c.json({
      success: false,
      error: `Request format conversion failed: ${internalRequestResult.errors?.[0]?.message || 'Unknown error'}`,
    }, 400);
  }

  // Assert InternalRequest type for type safety
  const internalRequest = assertInternalRequest(internalRequestResult.data!);
  const { model, messages, stream = false, ...rest } = internalRequest;

  // Step 2: Match route (with API key isolation if apiKeyId is provided)
  const match = await routeMatcherService.findMatch(model, apiKeyId);

  if (!match) {
    // Log error and complete
    transformationLogger.logError('Step2_RouteMatching', new Error(`No matching route found for model: ${model}`));
    await transformationLogger.complete();

    return c.json({
      success: false,
      error: `No matching route found for model: ${model}`,
    }, 404);
  }

  // Step 3: Apply rewrite rules
  const rewriteResult = rewriteService.applyRules(
    { model, messages, ...rest },
    match.route.overrides
  );

  // Log Step 2: Route matching and rewrite
  transformationLogger.logStep2_RouteAndRewrite(
    match.route.name,
    match.route.id,
    model, // originalModel
    rewriteResult.rewrittenRequest.model, // finalModel
    { model, messages, ...rest }, // beforeRewrite: complete internal format
    rewriteResult.rewrittenRequest, // afterRewrite: complete rewritten request
    rewriteResult.overwrittenAttributes
  );

  console.log('[Gateway] Rewrite result:', {
    originalModel: model,
    finalModel: rewriteResult.rewrittenRequest.model,
    overwrittenAttributes: rewriteResult.overwrittenAttributes,
  });

  // Step 4: Get target format from route config
  const targetFormat = (match.route as any).requestFormat as RouteConfigFormat as VendorType;

  // Step 5: Convert internal format to target format
  const targetRequestResult = protocolTranspiler.transpile(
    rewriteResult.rewrittenRequest,
    'openai',   // Internal format
    targetFormat
  );

  // Log Step 3: Internal format → Target format
  transformationLogger.logStep3_InternalToTarget(
    targetFormat,
    rewriteResult.rewrittenRequest, // input: complete internal format
    targetRequestResult.data!, // output: complete target format
    targetRequestResult.success,
    targetRequestResult.errors || [],
    targetRequestResult.warnings || [],
    targetRequestResult.metadata
  );

  if (!targetRequestResult.success) {
    console.error('[Gateway] Target format conversion errors:', targetRequestResult.errors);

    // Log error and complete
    transformationLogger.logError('Step3_InternalToTarget', new Error(targetRequestResult.errors?.[0]?.message || 'Conversion failed'));
    await transformationLogger.complete();

    return c.json({
      success: false,
      error: `Target format conversion failed: ${targetRequestResult.errors?.[0]?.message || 'Unknown error'}`,
    }, 500);
  }

  const targetRequest = targetRequestResult.data!;

  // Step 6: Build upstream request
  const upstreamRequest = rewriteService.buildUpstreamRequest(
    targetRequest as Record<string, any>,
    match.route
  );

  console.log('[Gateway] Upstream request:', {
    url: upstreamRequest.url,
    targetFormat,
    bodyKeys: Object.keys(upstreamRequest.body),
  });

  // Log upstream request
  transformationLogger.logUpstreamRequest(
    upstreamRequest.url,
    targetFormat,
    {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${match.route.upstreamApiKey?.slice(0, 20)}...`,
      'Body-Preview': JSON.stringify(upstreamRequest.body).slice(0, 200)
    }
  );

  // Step 7: Create log entry
  const logId = await requestLogService.createLog({
    id: requestId, // Use the same requestId as protocol transformation logs
    apiKeyId,
    routeId: match.route.id,
    originalModel: model,
    finalModel: rewriteResult.rewrittenRequest.model,
    messages,
    overwrittenAttributes: rewriteResult.overwrittenAttributes,
    requestTools: rest.tools,
    temperature: rest.temperature,
    baseUrl: upstreamRequest.url,
  });

  const startTime = Date.now();

  try {
    // Step 8: Forward to upstream API
    if (stream) {
      console.log('[Gateway] Starting streaming request...');
      // Streaming response
      return streamText(c, async (stream) => {
        let promptTokens = 0;
        let completionTokens = 0;
        let cachedTokens = 0;
        let chunkCount = 0;
        let receivedChunks = 0;  // Total chunks received from upstream
        let emptyChunks = 0;      // Chunks that were empty/skipped
        let conversionErrors = 0; // Chunks that failed conversion
        let hasError = false;
        let errorMessage = '';
        let timeToFirstByteMs: number | undefined;
        // Store structured content blocks (text, tool_use, thinking, etc.)
        const contentBlocks: InternalMessage['content'][] = [];
        let accumulatedText = ''; // Fallback for simple text content
        const responseParams: Record<string, unknown> = {};
        const accumulatedToolCalls: Map<number, InternalToolCall> = new Map();
        // rawSSEBuffer is no longer needed
        // Debug mode disabled for production
      // const debugMode = process.env.DEBUG === '1'; // Check if debug mode is enabled

        try {
          // Create a separate stream request to capture raw SSE
          // We need to capture raw SSE before it's parsed
          const rawSSEStream = upstreamService.streamRequest({
            url: upstreamRequest.url,
            apiKey: match.route.upstreamApiKey,
            body: upstreamRequest.body,
          });

          // Track raw SSE for each chunk
          let currentRawSSE = '';

          // Process the stream manually to capture both raw SSE and parsed chunks
          for await (const rawSSE of rawSSEStream) {
            receivedChunks++;  // Count all chunks from upstream
            currentRawSSE = rawSSE; // Store current raw SSE

            // Extract data from SSE line
            const dataMatch = rawSSE.match(/^data:\s*(.+)\s*$/);
            if (!dataMatch) {
              console.warn('[Gateway] No data match in SSE line:', rawSSE.substring(0, 100));
              continue;
            }

            const data = (dataMatch[1] || '').trim();

            // Skip [DONE] marker
            if (data === '[DONE]') {
              console.log('[Gateway] Received [DONE] marker');
              continue;
            }

            // Parse using protocol transpiler (target format → OpenAI internal)
            const parseResult = protocolTranspiler.transpileStreamChunk(
              data,
              targetFormat,  // Upstream format
              'openai'       // Convert to OpenAI internal format
            );

            if (!parseResult.success) {
              console.error('[Gateway] Failed to parse chunk:', parseResult.errors);
              conversionErrors++;
              continue;
            }

            const internalChunk = parseResult.data!;

            // Check if chunk is empty
            if (internalChunk.__empty) {
              emptyChunks++;
              continue;
            }

            // Now we have both rawSSE and internalChunk
            if (chunkCount === 0) {
              timeToFirstByteMs = Date.now() - startTime;
            }

            // ⭐ CRITICAL FIX: Convert InternalStreamChunk object back to SSE format for client
            // internalChunk is already an InternalStreamChunk object
            // We need to convert it back to SSE format with proper field naming
            let sseToSend: string;

            if (typeof internalChunk === 'object' && internalChunk !== null) {
              // Use protocolTranspiler.transpileStreamChunk to convert from internal to client format
              // This is the proper public API that handles all format conversions
              const sseResult = protocolTranspiler.transpileStreamChunk(
                internalChunk,
                'openai',      // Internal format (what we have)
                sourceFormat   // Client format (what to send back)
              );

              // ========== CRITICAL: Collect metadata BEFORE empty chunk check ==========
              // This ensures finish_reason, usage, and tool_calls are collected even from "empty" chunks
              // (e.g., message_delta events from Anthropic that contain finish_reason but no content)
              const chunkData = internalChunk;

              // Collect structured content for logging
              // The internal format now supports content blocks (text, tool_use, thinking, etc.)
              if (chunkData.choices?.[0]?.delta?.content) {
                const content = chunkData.choices[0].delta.content;

                // Check if content is a structured block (object with type property)
                if (typeof content === 'object' && content !== null && 'type' in content) {
                  // It's a structured content block (tool_use, thinking, etc.)
                  contentBlocks.push(content);
                } else if (typeof content === 'string') {
                  // It's simple text - accumulate it
                  accumulatedText += content;
                }
              }

              // Collect toolCalls from delta (for logging and tracking)
              // Note: Internal format uses camelCase 'toolCalls', not snake_case 'tool_calls'
              if (chunkData.choices?.[0]?.delta?.toolCalls) {
                const newToolCalls = chunkData.choices[0].delta.toolCalls;
                newToolCalls.forEach((newCall: InternalToolCall, idx: number) => {
                  // InternalToolCall doesn't have index field, use array index
                  const index = idx;
                  const existing = accumulatedToolCalls.get(index);

                  if (!existing) {
                    // Create new entry with index tracking separately
                    accumulatedToolCalls.set(index, newCall);
                  } else if (newCall.function?.arguments) {
                    if (existing.function?.arguments) {
                      existing.function.arguments += newCall.function.arguments;
                    } else {
                      existing.function = newCall.function;
                    }
                  }
                });
              }

              // Extract token usage from Internal Format
              if (chunkData.usage) {
                promptTokens = chunkData.usage.promptTokens || 0;
                completionTokens = chunkData.usage.completionTokens || 0;
                cachedTokens = chunkData.usage.cacheReadTokens ||
                               chunkData.usage.promptTokensDetails?.cachedTokens ||
                               0;
              }

              // Collect response metadata (including finish_reason)
              if (chunkData.choices?.[0]?.finishReason) {
                responseParams.finish_reason = chunkData.choices[0].finishReason;
              }
              if (chunkData.model) responseParams.model = chunkData.model;
              if (chunkData.vendorSpecific?.systemFingerprint) responseParams.system_fingerprint = chunkData.vendorSpecific.systemFingerprint as string;
              if (chunkData.id) responseParams.id = chunkData.id;
              if (chunkData.created) responseParams.created = chunkData.created;

              // Now proceed with SSE sending and empty chunk check
              if (sseResult.success && !sseResult.data?.__empty) {
                // The result should be an SSE-formatted string
                const convertedData = sseResult.data!;
                sseToSend = typeof convertedData === 'string'
                  ? convertedData
                  : `data: ${JSON.stringify(convertedData)}\n\n`;

                // ✅ FIX: Log chunks with actual raw SSE data
                // Log stream chunk with raw SSE
                transformationLogger.logStreamChunk(
                  chunkCount + 1,
                  currentRawSSE || '(no raw SSE captured)',  // Use actual raw SSE
                  internalChunk,
                  sourceFormat,
                  sseToSend
                );

                // Send SSE data to client
                await stream.write(sseToSend);
                chunkCount++;

                // ✅ NEW: Add stream.write() confirmation log
                console.log(`[Gateway] ✅ Successfully wrote ${sseToSend.length} bytes to stream (chunk #${chunkCount})`);
              } else {
                // If conversion failed or returned empty, skip this chunk
                if (!sseResult.success) {
                  console.error('[Gateway] Failed to convert chunk to SSE:', sseResult.errors);
                  conversionErrors++;
                } else {
                  emptyChunks++;
                }
                continue;
              }
            } else {
              console.error('[Gateway] Unexpected internalChunk type:', typeof internalChunk);
              conversionErrors++;
              continue;
            }
          }

          console.log('[Gateway] Streaming completed:', {
            receivedChunks,
            sentChunks: chunkCount,
            emptyChunks,
            conversionErrors,
            promptTokens,
            completionTokens,
            cachedTokens,
            timeToFirstByteMs,
            toolCallsCollected: accumulatedToolCalls.size,
          });

          // Log streaming complete statistics
          transformationLogger.logStreamingComplete({
            chunkCount,
            receivedChunks,
            emptyChunks,
            conversionErrors,
            promptTokens,
            completionTokens,
            cachedTokens,
            timeToFirstByteMs: timeToFirstByteMs || 0,
            totalLatencyMs: Date.now() - startTime,
            toolCallsCollected: accumulatedToolCalls.size,
            // Build response content: use structured blocks if available, otherwise use text
            responseContent: contentBlocks.length > 0
              ? JSON.stringify(contentBlocks)
              : accumulatedText,
            responseParams, // Complete response metadata
            responseToolCalls: Array.from(accumulatedToolCalls.values()) // All tool calls
          });

          // CRITICAL FIX: Send accumulated tool calls to client before [DONE]
          // This is essential for tool calling workflows to work
          if (accumulatedToolCalls.size > 0) {
            console.log('[Gateway] Sending accumulated tool calls:', accumulatedToolCalls.size);

            // Create a final chunk containing all accumulated tool calls (in OpenAI/Internal format)
            const toolCallsChunk = {
              id: responseParams.id || `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: responseParams.created || Math.floor(Date.now() / 1000),
              model: responseParams.model || 'unknown',
              choices: [{
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: Array.from(accumulatedToolCalls.entries()).map(([index, tc]) => ({
                    index: index,
                    id: tc.id,
                    type: tc.type || 'function',
                    function: {
                      name: tc.function?.name,
                      arguments: tc.function?.arguments || '{}',
                    },
                  })),
                },
                finish_reason: responseParams.finish_reason || 'tool_calls',
              }],
            };

            // ⭐ FIX: Convert tool calls chunk to client format before sending
            const toolCallsResult = protocolTranspiler.transpileStreamChunk(
              toolCallsChunk,
              'openai',     // Internal format
              sourceFormat  // Client format
            );

            if (toolCallsResult.success && !toolCallsResult.data?.__empty) {
              const convertedToolCallsChunk = toolCallsResult.data!;
              const sseData = typeof convertedToolCallsChunk === 'string'
                ? convertedToolCallsChunk
                : `data: ${JSON.stringify(convertedToolCallsChunk)}\n\n`;
              await stream.write(sseData);
              console.log('[Gateway] Sent tool calls chunk in', sourceFormat, 'format');
            }
          }

          await stream.write('data: [DONE]\n\n');
        } catch (error: any) {
          hasError = true;
          errorMessage = error.message || 'Upstream request failed';
          console.error('[Gateway] Streaming error:', errorMessage);

          // Log streaming error
          transformationLogger.logError('Streaming', error);

          await stream.write(`data: ${JSON.stringify({
            error: { message: errorMessage, type: 'upstream_error' }
          })}\n\n`);
          await stream.write('data: [DONE]\n\n');
        } finally {
          const latency = Date.now() - startTime;
          const toolCallsArray = accumulatedToolCalls.size > 0 ? Array.from(accumulatedToolCalls.values()) : undefined;

          // 🔧 Auto-infer finish_reason if missing but tool_calls exist (safety net)
          if (!responseParams.finish_reason && toolCallsArray && toolCallsArray.length > 0) {
            responseParams.finish_reason = 'tool_calls';
            console.log('[Gateway] ⚠️ Auto-inferred finish_reason as "tool_calls" from accumulated tool calls');
          }

          await requestLogService.updateLog(logId, {
            statusCode: hasError ? 500 : 200,
            promptTokens,
            completionTokens,
            latencyMs: latency,
            timeToFirstByteMs,
            errorMessage: hasError ? errorMessage : undefined,
            // Store structured content if available, otherwise use text
            responseContent: contentBlocks.length > 0
              ? JSON.stringify(contentBlocks)
              : (accumulatedText || undefined),
            cachedTokens,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            responseParams: Object.keys(responseParams).length > 0 ? responseParams : undefined,
            responseToolCalls: toolCallsArray,
            // Capture original response metadata for streaming
            originalResponse: JSON.stringify({
              streamed: true,
              chunkCount,
              targetFormat,
              // Note: Full streaming response is captured in responseContent
            }),
            originalResponseFormat: targetFormat as RouteConfigFormat,
          });

          // Complete transformation log
          await transformationLogger.complete();
        }
      });
    } else {
      const startTimeRequest = Date.now();

      const upstreamResponse = await upstreamService.request({
        url: upstreamRequest.url,
        apiKey: match.route.upstreamApiKey,
        body: upstreamRequest.body,
      });

      // Capture original response BEFORE conversion
      const originalResponse = upstreamResponse;
      const originalResponseFormat = targetFormat;
      const latency = Date.now() - startTimeRequest;

      // Step 9: Convert upstream response (target format) back to client format

      // Get the source converter to directly extract Internal Format
      // ⭐ FIX: Don't use transpile() because it returns final target format, not Internal Format
      const sourceConverter = (protocolTranspiler as any).converters?.get(targetFormat);
      let internalResponseResult: any;

      if (sourceConverter && typeof sourceConverter.convertResponseToInternal === 'function') {
        // Direct conversion: vendor format → Internal Format (camelCase)
        internalResponseResult = sourceConverter.convertResponseToInternal(upstreamResponse);
      } else {
        // Fallback: try using transpile (will return target format, not ideal)
        internalResponseResult = protocolTranspiler.transpile(
          upstreamResponse,
          targetFormat,
          'openai'
        );
      }

      let finalResponse: any;
      let finalResponseResult: any;

      if (internalResponseResult.success) {
        // Second, convert internal format to client format
        finalResponseResult = protocolTranspiler.transpile(
          internalResponseResult.data!,
          'openai',        // Internal format
          sourceFormat     // Client format
        );

        if (!finalResponseResult.success) {
          console.warn('[Gateway] Response conversion errors:', finalResponseResult.errors);

          // Log response conversion error
          transformationLogger.logError('ResponseConversion', new Error(finalResponseResult.errors?.[0]?.message || 'Conversion failed'));
          await transformationLogger.complete();

          // If conversion failed, use upstream response directly
          return c.json(upstreamResponse);
        }

        finalResponse = finalResponseResult.data!;

        // Log non-streaming response conversion
        transformationLogger.logNonStreamingResponse({
          rawResponse: upstreamResponse,
          targetFormat: targetFormat,
          internalFormat: internalResponseResult.data!,
          sourceFormat: sourceFormat,
          finalResponse: finalResponse,
          latencyMs: latency,
        });
      } else {
        console.warn('[Gateway] Response to internal format conversion errors:', internalResponseResult.errors);

        // If conversion to internal failed, try direct conversion
        finalResponseResult = protocolTranspiler.transpile(
          upstreamResponse,
          targetFormat,   // Upstream format
          sourceFormat    // Client format
        );

        if (!finalResponseResult.success) {
          console.warn('[Gateway] Response conversion errors:', finalResponseResult.errors);

          // Log response conversion error
          transformationLogger.logError('ResponseConversion', new Error(finalResponseResult.errors?.[0]?.message || 'Conversion failed'));
          await transformationLogger.complete();

          // If conversion failed, use upstream response directly
          return c.json(upstreamResponse);
        }

        finalResponse = finalResponseResult.data!;

        // Log non-streaming response conversion (without internal format)
        transformationLogger.logNonStreamingResponse({
          rawResponse: upstreamResponse,
          targetFormat: targetFormat,
          internalFormat: null, // Conversion to internal failed
          sourceFormat: sourceFormat,
          finalResponse: finalResponse,
          latencyMs: latency,
        });
      }

      // Collect response metadata for logging from Internal Format
      const responseParams: Record<string, unknown> = {};
      const internalResponse = internalResponseResult.success
        ? assertInternalResponse(internalResponseResult.data!)
        : undefined;

      if (internalResponse?.choices?.[0]?.finishReason) {
        responseParams.finish_reason = internalResponse.choices[0].finishReason;
      }
      if (internalResponse?.model) responseParams.model = internalResponse.model;
      if (internalResponse?.id) responseParams.id = internalResponse.id;
      if (internalResponse?.created) responseParams.created = internalResponse.created;

      // Extract response content from internal format
      // The internal format supports: content (string | ContentBlock[])
      let responseContent: string | undefined;
      if (internalResponseResult.success && internalResponse) {
        const messageContent = internalResponse?.choices?.[0]?.message?.content;
        if (messageContent !== undefined && messageContent !== null) {
          // If content is an array (structured blocks), stringify it
          // Otherwise use the string directly
          responseContent = Array.isArray(messageContent)
            ? JSON.stringify(messageContent)
            : String(messageContent);
        }
      }

      // Extract tool calls from Internal Format
      // Internal Format uses camelCase: toolCalls (not tool_calls)
      // Note: Protocol Transpiler layer handles all format conversions and fallbacks
      const responseToolCalls = internalResponse?.choices?.[0]?.message?.toolCalls;

      // Extract token usage from Internal Format
      // Internal Format uses camelCase: { promptTokens, completionTokens, totalTokens }
      let promptTokens = 0;
      let completionTokens = 0;
      let cachedTokens = 0;

      if (internalResponse?.usage) {
        // Primary: Use Internal Format (camelCase)
        promptTokens = internalResponse.usage.promptTokens || 0;
        completionTokens = internalResponse.usage.completionTokens || 0;
        cachedTokens = internalResponse.usage.cacheReadTokens ||
                       internalResponse.usage.promptTokensDetails?.cachedTokens ||
                       0;
      } else if (originalResponse && typeof originalResponse === 'object') {
        // Defensive fallback: Extract directly from vendor response
        // This handles edge cases where conversion failed or returned wrong format
        // Supports multiple vendor field naming conventions:
        // - OpenAI API: prompt_tokens, completion_tokens (snake_case)
        // - Anthropic/GLM: input_tokens, output_tokens (snake_case)
        // - Internal Format: promptTokens, completionTokens (camelCase)
        const usage = (originalResponse as any).usage;
        if (usage) {
          promptTokens = usage.prompt_tokens || usage.input_tokens || usage.promptTokens || 0;
          completionTokens = usage.completion_tokens || usage.output_tokens || usage.completionTokens || 0;
          cachedTokens = usage.cache_read_input_tokens || usage.cache_read_tokens || usage.cacheReadTokens || 0;
        }
      }

      // Update log with token usage
      await requestLogService.updateLog(logId, {
        statusCode: 200,
        promptTokens,
        completionTokens,
        cachedTokens,
        latencyMs: latency,
        responseContent: responseContent,
        responseParams: Object.keys(responseParams).length > 0 ? responseParams : undefined,
        responseToolCalls: responseToolCalls,
        // Capture original response
        originalResponse: JSON.stringify(originalResponse),
        originalResponseFormat: originalResponseFormat as RouteConfigFormat,
      });

      // Log complete non-streaming request trace for unit testing
      try {
        await logRequestTrace({
          metadata: {
            requestId,
            timestamp: new Date().toISOString(),
            vendor: targetFormat,
            url: upstreamRequest.url,
            requestType: 'non-streaming',
            latency,
            statusCode: 200,
          },
          request: {
            method: 'POST',
            url: upstreamRequest.url,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${match.route.upstreamApiKey?.slice(0, 20)}...`,
            },
            body: upstreamRequest.body,
          },
          response: {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
            },
            body: upstreamResponse,
          },
        });
      } catch (error) {
        // Don't let logging errors affect the main flow
        console.error('[Gateway] Failed to log non-streaming request trace:', error);
      }

      // Complete transformation log for non-streaming response
      await transformationLogger.complete();

      return c.json(finalResponse);
    }
  } catch (error: any) {
    console.error('[Gateway] Upstream request failed:', {
      message: error.message,
      stack: error.stack,
    });

    // Log error
    transformationLogger.logError('UpstreamRequest', error);
    await transformationLogger.complete();

    const latency = Date.now() - startTime;
    await requestLogService.updateLog(logId, {
      statusCode: 500,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: latency,
      errorMessage: error.message || 'Upstream request failed',
    });

    return c.json({
      success: false,
      error: error.message || 'Upstream request failed',
    }, 500);
  }
}

// ============================================
// Route Definitions
// ============================================

/**
 * POST /v1/chat/completions
 *
 * OpenAI-compatible chat completions endpoint
 */
router.post('/v1/chat/completions', async (c) => {
  return handleGatewayRequest(c, 'openai');
});

/**
 * POST /v1/messages
 *
 * Anthropic-compatible messages endpoint
 */
router.post('/v1/messages', async (c) => {
  return handleGatewayRequest(c, 'anthropic');
});

/**
 * POST /v1/models/:model:generateContent
 *
 * Gemini-compatible generateContent endpoint
 * Uses wildcard to match any model name ending with :generateContent
 */
router.post('/v1/models/*', async (c) => {
  const path = c.req.path;
  // Verify this is a generateContent request
  if (!path.endsWith(':generateContent')) {
    return c.json({
      success: false,
      error: 'Invalid Gemini endpoint. Expected path ending with :generateContent',
    }, 404);
  }
  return handleGatewayRequest(c, 'gemini');
});

/**
 * GET /v1/models
 *
 * List available models based on active routes
 */
router.get('/v1/models', async (c) => {
  const routes = await routeMatcherService.getActiveRoutes();

  // Extract unique models from routes
  const models = routes.map((route) => ({
    id: route.upstreamModel,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: route.name,
  }));

  return c.json({
    object: 'list',
    data: models,
  });
});

export default router;
