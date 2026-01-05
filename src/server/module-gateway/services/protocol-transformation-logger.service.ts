import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * 协议转换跟踪日志服务
 *
 * 为每个请求创建独立的日志文件，记录完整的协议转换过程
 * 包括完整的 JSON 数据和数据库消费标记
 */
export class ProtocolTransformationLogger {
  private readonly logDir: string;
  private requestId: string;
  private uuidSuffix: string; // Extract last 6 chars of UUID for searchability
  private timestamp: string;
  private logEntries: string[] = [];
  private startTime: number;

  // Store complete data for database consumption tracking (reserved for future use)
  // @ts-expect-error - Reserved for future use
  private _clientRequestData: any = null;
  // @ts-expect-error - Reserved for future use
  private _internalRequestData: any = null;
  // @ts-expect-error - Reserved for future use
  private _beforeRewriteData: any = null;
  // @ts-expect-error - Reserved for future use
  private _afterRewriteData: any = null;
  // @ts-expect-error - Reserved for future use
  private _targetRequestData: any = null;
  // @ts-expect-error - Reserved for future use
  private _routeInfo: any = null;

  constructor(requestId: string) {
    this.requestId = requestId;
    this.uuidSuffix = requestId.slice(-6); // Extract last 6 chars for easy searching
    this.timestamp = new Date().toISOString();
    this.startTime = Date.now();
    this.logDir = join(process.cwd(), 'logs', 'protocol-transformation');
  }

  /**
   * 初始化日志文件
   */
  async initialize(): Promise<void> {
    // 确保日志目录存在
    if (!existsSync(this.logDir)) {
      await mkdir(this.logDir, { recursive: true });
    }

    // 写入日志头
    this.appendHeader();
  }

  /**
   * 写入日志头
   */
  private appendHeader(): void {
    const header = this.renderHeader();
    this.logEntries.push(header);
  }

  /**
   * 渲染日志头
   */
  private renderHeader(): string {
    return `
╔══════════════════════════════════════════════════════════════════╗
║           PROTOCOL TRANSFORMATION TRACE LOG                      ║
╠══════════════════════════════════════════════════════════════════╣
║  Request ID: ${this.requestId.padEnd(40)} (${this.uuidSuffix})      ║
║  Timestamp: ${this.timestamp.padEnd(52)}║
╚══════════════════════════════════════════════════════════════════╝
`;
  }

  /**
   * 记录步骤 1: 客户端格式 → 内部格式
   */
  logStep1_ClientToInternal(
    sourceFormat: string,
    input: any,
    output: any,
    success: boolean,
    errors: any[],
    warnings: any[] = [],
    metadata?: {
      fieldsConverted?: number;
      fieldsIgnored?: number;
      fieldsWarned?: number;
      ignoredFields?: string[];
      transformedFields?: string[];
      conversionTimeMs?: number;
    }
  ): void {
    // Store data for database consumption tracking
    this._clientRequestData = input;
    this._internalRequestData = output;

    const step = this.renderStep1(sourceFormat, input, output, success, errors, warnings, metadata);
    this.logEntries.push(step);
  }

  /**
   * 渲染步骤 1
   */
  private renderStep1(
    sourceFormat: string,
    input: any,
    output: any,
    success: boolean,
    errors: any[],
    warnings: any[],
    metadata?: {
      fieldsConverted?: number;
      fieldsIgnored?: number;
      fieldsWarned?: number;
      ignoredFields?: string[];
      transformedFields?: string[];
      conversionTimeMs?: number;
    }
  ): string {
    return `
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Client Format → Internal Format                          │
├─────────────────────────────────────────────────────────────────┤
│ From: ${sourceFormat.padEnd(60)}│
│ To:   openai (internal)${' '.repeat(49)}│
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ORIGINAL REQUEST (From Client)                              │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ ${this.renderCompleteJSON(input)}
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ CONVERTED REQUEST (Internal Format)                         │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ ${this.renderCompleteJSON(output)}
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ 💾 [LOGS TABLE] Will log:                                       │
│    - model: "${output?.model || 'N/A'}"                          │
│    - messages: [${output?.messages?.length || 0} messages]       │
│    - tools: [${output?.tools?.length || 0} tools]                │
│    - temperature: ${output?.temperature ?? 'N/A'}                │
│    - stream: ${output?.stream ?? false}                          │
│                                                                  │
│ Conversion Metadata:                                             │
│   - Fields Converted: ${metadata?.fieldsConverted ?? 'N/A'}                              │
│   - Fields Ignored: ${metadata?.fieldsIgnored ?? 0}                               │
│   - Fields Warned: ${metadata?.fieldsWarned ?? 0}                                │
│   - Conversion Time: ${metadata?.conversionTimeMs ?? 'N/A'}ms                           │
${metadata?.ignoredFields && metadata.ignoredFields.length > 0 ? `│                                                                  │
│ Ignored Fields:                                                  │
${metadata.ignoredFields.map(f => `│   - ${f}`).join('\n')}│
` : ''}${metadata?.transformedFields && metadata.transformedFields.length > 0 ? `│                                                                  │
│ Transformed Fields:                                              │
${metadata.transformedFields.slice(0, 5).map(f => `│   - ${f}`).join('\n')}│
${metadata.transformedFields.length > 5 ? `│   ... and ${metadata.transformedFields.length - 5} more                                    │
` : ''}` : ''}${errors.length > 0 ? `│                                                                  │
│ Errors:                                                           │
${errors.map(e => `│   [${e.code}] ${e.path}: ${e.message}`).join('\n')}│
` : ''}${warnings.length > 0 ? `│                                                                  │
│ Warnings:                                                        │
${warnings.map(w => `│   [${w.code}] ${w.path}: ${w.message}`).join('\n')}│
` : ''}│                                                                  │
│ Status: ${success ? '✓ SUCCESS' : '✗ FAILED'}${' '.repeat(49)}│
└─────────────────────────────────────────────────────────────────┘

                            ↓
`;
  }

  /**
   * 记录步骤 2: 路由匹配和重写
   */
  logStep2_RouteAndRewrite(
    routeName: string,
    routeId: string,
    originalModel: string,
    finalModel: string,
    beforeRewrite: any,
    afterRewrite: any,
    overwrittenAttributes: Record<string, any>
  ): void {
    // Store data for database consumption tracking
    this._routeInfo = { name: routeName, id: routeId };
    this._beforeRewriteData = beforeRewrite;
    this._afterRewriteData = afterRewrite;

    const step = this.renderStep2(routeName, routeId, originalModel, finalModel, beforeRewrite, afterRewrite, overwrittenAttributes);
    this.logEntries.push(step);
  }

  /**
   * 渲染步骤 2
   */
  private renderStep2(
    routeName: string,
    routeId: string,
    originalModel: string,
    finalModel: string,
    beforeRewrite: any,
    afterRewrite: any,
    overwrittenAttributes: Record<string, any>
  ): string {
    return `
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Route Matching & Rewrite                                │
├─────────────────────────────────────────────────────────────────┤
│ Matched Route: ${routeName.padEnd(56)}│
│ Route ID: ${routeId.padEnd(60)}│
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ BEFORE REWRITE                                               │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ ${this.renderCompleteJSON(beforeRewrite)}
│ └─────────────────────────────────────────────────────────────┘ │
│                            ↓                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ AFTER REWRITE                                                │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ ${this.renderCompleteJSON(afterRewrite)}
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ DETAILED CHANGES:                                                │
${this.printDetailedChanges(beforeRewrite, afterRewrite)}
│                                                                  │
│ 💾 [LOGS TABLE] Will log:                                       │
│    - route_id: "${routeId}"                                      │
│    - original_model: "${originalModel}"                          │
│    - final_model: "${finalModel}"                                │
│    - overwritten_model: "${originalModel !== finalModel ? finalModel : 'N/A'}"│
│    - overwritten_attributes: {                                   │
│        ${Object.entries(overwrittenAttributes).map(([k, v]) =>
          `\n│          "${k}": ${JSON.stringify(v).slice(0, 50)}${JSON.stringify(v).length > 50 ? '...' : ''}`
        ).join(',\n') || '│          (none)'}                                             │
│      }                                                            │
└─────────────────────────────────────────────────────────────────┘

                            ↓
`;
  }

  /**
   * 记录步骤 3: 内部格式 → 目标格式
   */
  logStep3_InternalToTarget(
    targetFormat: string,
    input: any,
    output: any,
    success: boolean,
    errors: any[],
    warnings: any[] = [],
    metadata?: {
      fieldsConverted?: number;
      fieldsIgnored?: number;
      fieldsWarned?: number;
      ignoredFields?: string[];
      transformedFields?: string[];
      conversionTimeMs?: number;
    }
  ): void {
    // Store data for database consumption tracking
    this._targetRequestData = output;

    const step = this.renderStep3(targetFormat, input, output, success, errors, warnings, metadata);
    this.logEntries.push(step);
  }

  /**
   * 渲染步骤 3
   */
  private renderStep3(
    targetFormat: string,
    input: any,
    output: any,
    success: boolean,
    errors: any[],
    warnings: any[],
    metadata?: {
      fieldsConverted?: number;
      fieldsIgnored?: number;
      fieldsWarned?: number;
      ignoredFields?: string[];
      transformedFields?: string[];
      conversionTimeMs?: number;
    }
  ): string {
    return `
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Internal Format → Target Format (Upstream Request)      │
├─────────────────────────────────────────────────────────────────┤
│ From: openai (internal)${' '.repeat(49)}│
│ To:   ${targetFormat.padEnd(60)}│
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ INTERNAL FORMAT (Input)                                     │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ ${this.renderCompleteJSON(input)}
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ REQUEST SENT TO UPSTREAM (${targetFormat.toUpperCase()})     │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ ${this.renderCompleteJSON(output)}
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ 💾 [LOGS TABLE] Will log:                                       │
│    - base_url: (from route configuration)                       │
│    - request_params: {                                          │
│        model: "${output?.model || output?.contents?.[0]?.parts?.[0]?.functionCall?.name || 'N/A'}",│
│        ...                                                       │
│      }                                                            │
│                                                                  │
│ Conversion Metadata:                                             │
│   - Fields Converted: ${metadata?.fieldsConverted ?? 'N/A'}                              │
│   - Fields Ignored: ${metadata?.fieldsIgnored ?? 0}                               │
│   - Fields Warned: ${metadata?.fieldsWarned ?? 0}                                │
│   - Conversion Time: ${metadata?.conversionTimeMs ?? 'N/A'}ms                           │
${metadata?.ignoredFields && metadata.ignoredFields.length > 0 ? `│                                                                  │
│ Ignored Fields:                                                  │
${metadata.ignoredFields.map(f => `│   - ${f}`).join('\n')}│
` : ''}${metadata?.transformedFields && metadata.transformedFields.length > 0 ? `│                                                                  │
│ Transformed Fields:                                              │
${metadata.transformedFields.slice(0, 5).map(f => `│   - ${f}`).join('\n')}│
${metadata.transformedFields.length > 5 ? `│   ... and ${metadata.transformedFields.length - 5} more                                    │
` : ''}` : ''}${errors.length > 0 ? `│                                                                  │
│ Errors:                                                           │
${errors.map(e => `│   [${e.code}] ${e.path}: ${e.message}`).join('\n')}│
` : ''}${warnings.length > 0 ? `│                                                                  │
│ Warnings:                                                        │
${warnings.map(w => `│   [${w.code}] ${w.path}: ${w.message}`).join('\n')}│
` : ''}│                                                                  │
│ Status: ${success ? '✓ SUCCESS' : '✗ FAILED'}${' '.repeat(49)}│
└─────────────────────────────────────────────────────────────────┘

                            ↓
`;
  }

  /**
   * 记录上游请求
   */
  logUpstreamRequest(url: string, format: string, headers: Record<string, string>): void {
    const step = this.renderUpstreamRequest(url, format, headers);
    this.logEntries.push(step);
  }

  /**
   * 渲染上游请求
   */
  private renderUpstreamRequest(url: string, format: string, headers: Record<string, string>): string {
    return `
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Upstream Request Details                                 │
├─────────────────────────────────────────────────────────────────┤
│ URL: ${url.padEnd(62)}│
│ Format: ${format.padEnd(60)}│
│                                                                  │
│ Request Headers:                                                 │
${Object.entries(headers).map(([k, v]) => `│   ${k}: ${v.slice(0, 50)}${v.length > 50 ? '...' : ''}`).join('\n') || '│   (none)'}
│                                                                  │
│ 💾 [LOGS TABLE] Will log:                                       │
│    - base_url: "${url}"                                          │
└─────────────────────────────────────────────────────────────────┘

                            ↓

╔══════════════════════════════════════════════════════════════════╗
║                    STREAMING RESPONSE                            ║
╚══════════════════════════════════════════════════════════════════╝
`;
  }

  /**
   * 记录流式响应块
   */
  logStreamChunk(
    chunkNumber: number,
    rawSSE: string,
    internalChunk: any,
    clientFormat: string,
    sseToSend: string
  ): void {
    const step = this.renderStreamChunk(chunkNumber, rawSSE, internalChunk, clientFormat, sseToSend);
    this.logEntries.push(step);
  }

  /**
   * 渲染流式响应块
   */
  private renderStreamChunk(
    chunkNumber: number,
    rawSSE: string,
    internalChunk: any,
    clientFormat: string,
    sseToSend: string
  ): string {
    const timestamp = new Date().toISOString().split('T')[1]!.slice(0, 12);

    // Handle missing raw SSE data
    const rawSSEDisplay = rawSSE === '(no raw SSE captured)'
      ? `│ ⚠️  Raw SSE capture not enabled                              │
│    Set DEBUG=1 environment variable to see raw SSE data          │`
      : `│ ${rawSSE.slice(0, 500)}${rawSSE.length > 500 ? '...' : ''}`;

    return `
[Chunk #${chunkNumber.toString().padStart(3, '0')}] ${timestamp}
┌─────────────────────────────────────────────────────────────────┐
│ RAW SSE FROM UPSTREAM                                           │
├─────────────────────────────────────────────────────────────────┤
${rawSSEDisplay}
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ INTERNAL FORMAT (OpenAI)                                        │
├─────────────────────────────────────────────────────────────────┤
│ ${this.renderCompleteJSON(internalChunk)}
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ SENT TO CLIENT (${clientFormat.toUpperCase()})                  │
├─────────────────────────────────────────────────────────────────┤
│ ${sseToSend.slice(0, 500)}${sseToSend.length > 500 ? '...' : ''}
└─────────────────────────────────────────────────────────────────┘
                            ↓
✅ Successfully written ${sseToSend.length} bytes to stream

│ 💾 [LOGS TABLE] Will accumulate:                                │
│    - content: (if text delta)                                   │
│    - tokens: (if usage info)                                    │
│    - tool_calls: (if tool_call delta)                           │
`;
  }

  /**
   * 记录流式完成统计
   */
  logStreamingComplete(stats: {
    chunkCount: number;
    receivedChunks?: number;
    emptyChunks?: number;
    conversionErrors?: number;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    timeToFirstByteMs: number;
    totalLatencyMs: number;
    toolCallsCollected: number;
    responseContent?: string;
    responseParams?: any;
    responseToolCalls?: any[];
  }): void {
    const step = this.renderStreamingComplete(stats);
    this.logEntries.push(step);
  }

  /**
   * 记录非流式响应转换
   */
  logNonStreamingResponse(params: {
    rawResponse: any;              // 原始响应（上游格式）
    targetFormat: string;          // 上游格式 (anthropic, openai, etc.)
    internalFormat: any;           // 转换到内部格式
    sourceFormat: string;          // 客户端格式
    finalResponse: any;            // 转换回客户端格式
    latencyMs: number;
  }): void {
    const step = this.renderNonStreamingResponse(params);
    this.logEntries.push(step);
  }

  /**
   * 渲染流式完成统计
   */
  private renderStreamingComplete(stats: {
    chunkCount: number;
    receivedChunks?: number;
    emptyChunks?: number;
    conversionErrors?: number;
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    timeToFirstByteMs: number;
    totalLatencyMs: number;
    toolCallsCollected: number;
    responseContent?: string;
    responseParams?: any;
    responseToolCalls?: any[];
  }): string {
    const received = stats.receivedChunks ?? stats.chunkCount;
    const empty = stats.emptyChunks ?? 0;
    const errors = stats.conversionErrors ?? 0;

    return `
╔══════════════════════════════════════════════════════════════════╗
║                    RESPONSE SUMMARY                              ║
╠══════════════════════════════════════════════════════════════════╣
║  Chunk Statistics:                                               ║
║    - Received from upstream: ${received.toString().padEnd(35)}║
║    - Sent to client:        ${stats.chunkCount.toString().padEnd(35)}║
║    - Empty/skipped:         ${empty.toString().padEnd(35)}║
║    - Conversion errors:     ${errors.toString().padEnd(35)}║
╠══════════════════════════════════════════════════════════════════╣
║  Token Statistics:                                               ║
║    - Prompt Tokens:  ${stats.promptTokens.toString().padEnd(45)}║
║    - Completion Tokens: ${stats.completionTokens.toString().padEnd(41)}║
║    - Total Tokens: ${(stats.promptTokens + stats.completionTokens).toString().padEnd(45)}║
║    - Cached Tokens: ${stats.cachedTokens.toString().padEnd(44)}║
╠══════════════════════════════════════════════════════════════════╣
║  Timing Statistics:                                              ║
║    - Time to First Byte: ${stats.timeToFirstByteMs.toString() + 'ms'.padEnd(36)}║
║    - Total Latency: ${stats.totalLatencyMs.toString() + 'ms'.padEnd(41)}║
╠══════════════════════════════════════════════════════════════════╣
║  Tool Calls Collected: ${stats.toolCallsCollected.toString().padEnd(43)}║
╠══════════════════════════════════════════════════════════════════╣
║  💾 [LOGS TABLE] Will save:                                      ║
║     - prompt_tokens: ${stats.promptTokens.toString().padEnd(46)}║
║     - completion_tokens: ${stats.completionTokens.toString().padEnd(42)}║
║     - total_tokens: ${(stats.promptTokens + stats.completionTokens).toString().padEnd(45)}║
║     - cached_tokens: ${stats.cachedTokens.toString().padEnd(46)}║
║     - latency_ms: ${stats.totalLatencyMs.toString().padEnd(49)}║
║     - time_to_first_byte_ms: ${stats.timeToFirstByteMs.toString().padEnd(41)}║
║     - status_code: 200${' '.repeat(43)}║
║     - response_content: "${stats.responseContent?.slice(0, 30) || ''}..."${stats.responseContent?.length ? 24 - stats.responseContent.slice(0, 30).length : 0}║
║     - response_params: ${Object.keys(stats.responseParams || {}).length > 0 ? '{...}' : 'N/A'}${Object.keys(stats.responseParams || {}).length > 0 ? 40 - '{...}'.length : 46}║
║     - response_tool_calls: [${stats.toolCallsCollected} calls]${' '.repeat(31)}║
╚══════════════════════════════════════════════════════════════════╝
`;
  }

  /**
   * 渲染非流式响应转换
   */
  private renderNonStreamingResponse(params: {
    rawResponse: any;
    targetFormat: string;
    internalFormat: any;
    sourceFormat: string;
    finalResponse: any;
    latencyMs: number;
  }): string {
    // Extract token usage from response (support both OpenAI and Anthropic formats)
    const usage = params.rawResponse?.usage || {};
    const promptTokens = usage.prompt_tokens ||
                        usage.input_tokens ||
                        usage.promptTokens ||
                        0;
    const completionTokens = usage.completion_tokens ||
                            usage.output_tokens ||
                            usage.completionTokens ||
                            0;
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ||
                       usage.cache_read_input_tokens ||
                       usage.cachedTokens ||
                       0;
    const totalTokens = promptTokens + completionTokens;

    // Extract response content for display
    const responseContent = params.rawResponse?.choices?.[0]?.message?.content ||
                           params.rawResponse?.content?.[0]?.text ||
                           params.finalResponse?.choices?.[0]?.message?.content ||
                           params.finalResponse?.content?.[0]?.text ||
                           '';

    // Extract response params
    const responseParams: any = {};
    if (params.rawResponse?.model) responseParams.model = params.rawResponse.model;
    if (params.rawResponse?.id) responseParams.id = params.rawResponse.id;
    if (params.rawResponse?.choices?.[0]?.finish_reason) {
      responseParams.finish_reason = params.rawResponse.choices[0].finish_reason;
    }

    // Render internal format section (or skip if null)
    const internalFormatSection = params.internalFormat === null
      ? `║  ⚠️  Internal format conversion failed, using direct conversion        ║
║                              ↓                                  ║`
      : `║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │ INTERNAL FORMAT (OpenAI)                                   │ ║
║  ├─────────────────────────────────────────────────────────────┤ ║
║  ${this.renderCompleteJSON(params.internalFormat)}
║  └─────────────────────────────────────────────────────────────┘ ║
║                              ↓                                  ║`;

    return `
╔══════════════════════════════════════════════════════════════════╗
║                    RESPONSE CONVERSION                          ║
╠══════════════════════════════════════════════════════════════════╣
║  Latency: ${params.latencyMs.toString() + 'ms'.padEnd(54)}║
╠══════════════════════════════════════════════════════════════════╣
║                                                                 ║
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │ RAW RESPONSE FROM UPSTREAM (${params.targetFormat.toUpperCase()})${' '.repeat(Math.max(0, 20 - params.targetFormat.length))}│ ║
║  ├─────────────────────────────────────────────────────────────┤ ║
║  ${this.renderCompleteJSON(params.rawResponse)}
║  └─────────────────────────────────────────────────────────────┘ ║
║                              ↓                                  ║
${internalFormatSection}
║  ┌─────────────────────────────────────────────────────────────┐ ║
║  │ FINAL RESPONSE (${params.sourceFormat.toUpperCase()})${' '.repeat(Math.max(0, 30 - params.sourceFormat.length))}│ ║
║  ├─────────────────────────────────────────────────────────────┤ ║
║  ${this.renderCompleteJSON(params.finalResponse)}
║  └─────────────────────────────────────────────────────────────┘ ║
║                                                                 ║
╠══════════════════════════════════════════════════════════════════╣
║  💾 [LOGS TABLE] Will save:                                      ║
║     - prompt_tokens: ${promptTokens.toString().padEnd(46)}║
║     - completion_tokens: ${completionTokens.toString().padEnd(42)}║
║     - total_tokens: ${totalTokens.toString().padEnd(45)}║
║     - cached_tokens: ${cachedTokens.toString().padEnd(46)}║
║     - latency_ms: ${params.latencyMs.toString().padEnd(49)}║
║     - status_code: 200${' '.repeat(43)}║
║     - response_content: "${responseContent?.slice(0, 20) || ''}..."${responseContent?.length ? 24 - responseContent.slice(0, 20).length : 4}║
║     - response_params: ${Object.keys(responseParams).length > 0 ? '{...}' : 'N/A'}${Object.keys(responseParams).length > 0 ? 40 - '{...}'.length : 46}║
╚══════════════════════════════════════════════════════════════════╝
`;
  }

  /**
   * 记录错误
   */
  logError(stage: string, error: Error): void {
    const step = this.renderError(stage, error);
    this.logEntries.push(step);
  }

  /**
   * 渲染错误
   */
  private renderError(stage: string, error: Error): string {
    const errorMessage = error.message || '(no message)';
    const truncatedMessage = errorMessage.slice(0, 55);
    const hasMore = errorMessage.length > 55;

    return `
╔══════════════════════════════════════════════════════════════════╗
║  ✗ ERROR AT ${stage.padEnd(48)}║
╠══════════════════════════════════════════════════════════════════╣
║  Message: ${truncatedMessage.padEnd(55)}║
║  ${(hasMore ? '...' : '').padEnd(63)}║
╚══════════════════════════════════════════════════════════════════╝
`;
  }

  /**
   * 完成（写入文件）
   */
  async complete(): Promise<string> {
    const endTime = Date.now();
    const duration = endTime - this.startTime;

    // 添加日志尾
    this.logEntries.push(this.renderFooter(duration));

    // 写入文件 - include UUID suffix in filename for searchability
    const filename = `${this.requestId}-${this.uuidSuffix}-${Date.now()}.log`;
    const filepath = join(this.logDir, filename);

    await writeFile(filepath, this.logEntries.join('\n'), 'utf-8');

    console.log(`[ProtocolTransformationLogger] Log written to: ${filepath}`);

    return filepath;
  }

  /**
   * 渲染日志尾
   */
  private renderFooter(duration: number): string {
    const endTime = new Date().toISOString();
    return `
╔══════════════════════════════════════════════════════════════════╗
║                    END OF TRACE LOG                              ║
╠══════════════════════════════════════════════════════════════════╣
║  End Time: ${endTime.padEnd(53)}║
║  Duration: ${duration.toString() + 'ms'.padEnd(52)}║
╚══════════════════════════════════════════════════════════════════╝
`;
  }

  // Reserved helper methods for future enhancement
  // private _renderJSONStructure(obj: any, indent = 0): string { ... }
  // private _printFieldChanges(before: any, after: any): string { ... }
  // private _printRewriteRules(attributes: Record<string, any>): string { ... }
  // private renderJSONValue(value: any): string { ... }

  /**
   * 渲染完整的 JSON 数据
   * 格式化输出完整的 JSON，带缩进，在方框内显示
   */
  private renderCompleteJSON(obj: any): string {
    try {
      const jsonStr = JSON.stringify(obj, null, 2);
      const lines = jsonStr.split('\n');
      const maxWidth = 65; // 方框宽度

      let result = '';
      for (const line of lines) {
        // 处理超长行
        if (line.length > maxWidth - 4) {
          // 简单截断处理
          result += `│ ${line.slice(0, maxWidth - 7)}... │\n`;
        } else {
          result += `│ ${line.padEnd(maxWidth - 2)} │\n`;
        }
      }

      return result;
    } catch (error) {
      return `│ [Error rendering JSON: ${error}] │\n`;
    }
  }

  /**
   * 打印详细的字段变化对比
   * 逐字段对比，显示 before → after
   */
  private printDetailedChanges(before: any, after: any): string {
    const changes: string[] = [];
    const allKeys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];

    if (allKeys.length === 0) {
      return '│   [NO DATA]                                                      │\n';
    }

    for (const key of allKeys) {
      const beforeVal = before?.[key];
      const afterVal = after?.[key];
      const beforeExists = key in (before || {});
      const afterExists = key in (after || {});

      if (!beforeExists && afterExists) {
        // 新增字段
        changes.push(`│   [+ADD] ${key}:`);
        changes.push(`│         + ${JSON.stringify(afterVal).slice(0, 55)}${JSON.stringify(afterVal).length > 55 ? '...' : ''}`);
      } else if (beforeExists && !afterExists) {
        // 删除字段
        changes.push(`│   [-DEL] ${key}:`);
        changes.push(`│         - ${JSON.stringify(beforeVal).slice(0, 55)}${JSON.stringify(beforeVal).length > 55 ? '...' : ''}`);
      } else if (beforeExists && afterExists) {
        // 对比字段
        const beforeStr = JSON.stringify(beforeVal);
        const afterStr = JSON.stringify(afterVal);
        if (beforeStr !== afterStr) {
          changes.push(`│   [~MOD] ${key}:`);
          changes.push(`│         - ${beforeStr.slice(0, 55)}${beforeStr.length > 55 ? '...' : ''}`);
          changes.push(`│         + ${afterStr.slice(0, 55)}${afterStr.length > 55 ? '...' : ''}`);
        }
      }
    }

    if (changes.length === 0) {
      return '│   [UNCHANGED]                                                    │\n';
    }

    return changes.map(c => c.padEnd(65)).join('\n') + '\n';
  }
}

/**
 * 创建协议转换日志记录器
 */
export async function createTransformationLogger(requestId: string): Promise<ProtocolTransformationLogger> {
  const logger = new ProtocolTransformationLogger(requestId);
  await logger.initialize();
  return logger;
}
