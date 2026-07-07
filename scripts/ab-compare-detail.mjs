/**
 * A/B 详细对比：上游原始 SSE vs 网关转换后 SSE
 * 用同一份上游数据，过 pi-ai 事件 + 输出适配器
 */

import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { openaiToPiContext } from '../src/server/adapters/input/openai.adapter.ts';
import { createOpenaiSSEConverter } from '../src/server/adapters/output/openai.adapter.ts';

const API_KEY = 'sk-9gnzvY39HD12Xd2oD0UTWln1R2HiIBAPuAvhAnsfgsGAJR1yeaTIMgwBUBrEPhWL';
const BASE_URL = 'https://opencode.ai/zen/go/v1';
const MODEL = 'deepseek-v4-flash';

var requestBody = { model: MODEL, stream: true, max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] };

// 1) 捕获上游原始 SSE
var resp = await fetch(BASE_URL + '/chat/completions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
  body: JSON.stringify(requestBody),
});
var rawSSEText = await resp.text();

// 2) 解析上游 SSE
var upLines = rawSSEText.split('\n').filter(function(l) { return l.startsWith('data: '); });
var upChunks = upLines.map(function(l) { try { return JSON.parse(l.slice(6)); } catch { return null; } }).filter(Boolean);

// ===== pi-ai 风格的事件流 =====
class PiStream {
  constructor() { this.events = []; this.resolvers = []; this.ended = false; }
  push(e) { if (this.resolvers.length > 0) this.resolvers.shift()(e); else this.events.push(e); }
  end() { this.ended = true; for (var r of this.resolvers) r(null); this.resolvers = []; }
  [Symbol.asyncIterator]() {
    var s = this;
    return { next: function() {
      if (s.events.length > 0) return Promise.resolve({ value: s.events.shift(), done: false });
      if (s.ended) return Promise.resolve({ done: true });
      return new Promise(function(r) { s.resolvers.push(function(e) { r(e === null ? { done: true } : { value: e, done: false }); }); });
    }};
  }
}

var output = { role: 'assistant', api: 'openai-completions', provider: 'opencode-go', model: MODEL,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, reasoning: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  stopReason: 'stop', timestamp: Date.now() };

for (var _c of upChunks) {
  if (_c.usage) {
    var u = _c.usage;
    output.usage.input = u.prompt_tokens || 0;
    output.usage.output = u.completion_tokens || 0;
    output.usage.totalTokens = u.total_tokens || 0;
    output.usage.cacheRead = u.prompt_tokens_details?.cached_tokens || u.prompt_cache_hit_tokens || 0;
    output.usage.reasoning = u.completion_tokens_details?.reasoning_tokens || 0;
    if (_c.id) output.responseId = _c.id;
    if (_c.model) output.model = _c.model;
    if (_c.created) output.timestamp = _c.created * 1000;
  }
}

var piStream = new PiStream();
var blocks = [], thinkingBlock = null, textBlock = null;
function ci(b) { return blocks.indexOf(b); }
function etb() {
  if (!thinkingBlock) {
    thinkingBlock = { type: 'thinking', thinking: '' }; blocks.push(thinkingBlock);
    piStream.push({ type: 'thinking_start', contentIndex: ci(thinkingBlock), partial: output });
  } return thinkingBlock;
}
function etxb() {
  if (!textBlock) {
    textBlock = { type: 'text', text: '' }; blocks.push(textBlock);
    piStream.push({ type: 'text_start', contentIndex: ci(textBlock), partial: output });
  } return textBlock;
}

piStream.push({ type: 'start', partial: output });

for (var _c2 of upChunks) {
  var choice = _c2.choices?.[0];
  if (!choice || !choice.delta) continue;
  if (choice.delta.content !== null && choice.delta.content !== undefined && choice.delta.content.length > 0) {
    var tb = etxb(); tb.text += choice.delta.content;
    piStream.push({ type: 'text_delta', contentIndex: ci(tb), delta: choice.delta.content, partial: output });
  }
  var rc = null;
  for (var f of ['reasoning_content', 'reasoning', 'reasoning_text']) {
    var v = choice.delta[f];
    if (typeof v === 'string' && v.length > 0) { rc = v; break; }
  }
  if (rc) {
    var rb = etb(); rb.thinking += rc;
    piStream.push({ type: 'thinking_delta', contentIndex: ci(rb), delta: rc, partial: output });
  }
  if (choice.finish_reason) {
    if (textBlock) piStream.push({ type: 'text_end', contentIndex: ci(textBlock), content: textBlock.text, partial: output });
    if (thinkingBlock) piStream.push({ type: 'thinking_end', contentIndex: ci(thinkingBlock), content: thinkingBlock.thinking, partial: output });
  }
}
piStream.push({ type: 'done', reason: output.stopReason, message: output });
piStream.end();

var events = [];
for await (var e of piStream) events.push(e);

// 通过输出适配器
var converter = createOpenaiSSEConverter();
var gwChunks = [];
for (var _e of events) {
  for (var line of converter.eventToSSE(_e)) {
    try { gwChunks.push(JSON.parse(line.slice(6))); } catch {}
  }
}

// ===== 输出详细对比 =====
console.log('');
console.log('========================================');
console.log('  上游 SSE vs 网关 SSE 逐行对比');
console.log('========================================');
console.log('');

var maxCmp = Math.min(upChunks.length, gwChunks.length);
var lineNum = 0;

for (var i = 0; i < maxCmp; i++) {
  var a = upChunks[i];
  var b = gwChunks[i];
  var aDelta = a.choices?.[0]?.delta || {};
  var bDelta = b.choices?.[0]?.delta || {};

  // 跳过 role 初始化行
  if (aDelta.role === 'assistant' && Object.keys(aDelta).length <= 3) {
    continue;
  }
  // 跳过 usage 行
  if (a.usage && typeof a.usage === 'object' && a.usage !== null && 'prompt_tokens' in a.usage) {
    continue;
  }

  lineNum++;
  var match = JSON.stringify(aDelta) === JSON.stringify(bDelta);
  var icon = match ? '✅' : '❌';
  console.log(icon + ' 行#' + lineNum + ' (chunk#' + i + '):');
  console.log('    A(上游): ' + JSON.stringify(aDelta));
  console.log('    B(网关): ' + JSON.stringify(bDelta));
  if (!match) {
    var aKeys = Object.keys(aDelta).sort().join(',');
    var bKeys = Object.keys(bDelta).sort().join(',');
    if (aKeys !== bKeys) console.log('    → 字段不同 A=[' + aKeys + '] B=[' + bKeys + ']');
    if (aDelta.content !== bDelta.content) console.log('    → content: A=' + JSON.stringify(aDelta.content) + ' B=' + JSON.stringify(bDelta.content));
    if ((aDelta.reasoning_content || null) !== (bDelta.reasoning_content || null)) console.log('    → reasoning_content: A=' + JSON.stringify(aDelta.reasoning_content) + ' B=' + JSON.stringify(bDelta.reasoning_content));
  }
}

console.log('');
console.log('========================================');
console.log('对比结果: ' + lineNum + ' 行');
// 统计有多少不匹配
var diffCount = 0;
for (var i2 = 0; i2 < maxCmp; i2++) {
  var a2 = upChunks[i2], b2 = gwChunks[i2];
  var ad = a2.choices?.[0]?.delta || {}, bd = b2.choices?.[0]?.delta || {};
  if (ad.role === 'assistant') continue;
  if (a2.usage && typeof a2.usage === 'object' && a2.usage !== null && 'prompt_tokens' in a2.usage) continue;
  if (JSON.stringify(ad) !== JSON.stringify(bd)) diffCount++;
}
console.log('差异: ' + diffCount + ' 处');
console.log(diffCount === 0 ? '✅ 完全一致！' : '❌ 有差异');
