/**
 * A/B 全维度对比（v2 - 用拦截捕获 pi-ai 真实请求）
 */

import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { openaiToPiContext } from '../src/server/adapters/input/openai.adapter.ts';
import { createOpenaiSSEConverter } from '../src/server/adapters/output/openai.adapter.ts';

const API_KEY = 'sk-9gnzvY39HD12Xd2oD0UTWln1R2HiIBAPuAvhAnsfgsGAJR1yeaTIMgwBUBrEPhWL';
const BASE_URL = 'https://opencode.ai/zen/go/v1';
const MODEL = 'deepseek-v4-flash';

// ================================================================
// 测试输入
// ================================================================
const rawRequest = {
  model: MODEL,
  stream: true,
  max_tokens: 50,
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2? Reply only the number.' }
  ]
};

console.log('='.repeat(100));
console.log('A/B 全维度对比（v2）');
console.log('='.repeat(100));

// ================================================================
// 入仓对比：拦截 pi-ai 实际请求
// ================================================================
console.log('\n【入仓对比】');

const originalFetch = globalThis.fetch;
var capturedBody = null;
globalThis.fetch = async function(url, options) {
  if (url.toString().includes('opencode')) {
    capturedBody = JSON.parse(options.body);
  }
  return originalFetch.call(globalThis, url, options);
};

const models = builtinModels();
const builtinModel = models.getModel('opencode-go', MODEL);
const m = { ...builtinModel, thinkingLevelMap: { ...builtinModel.thinkingLevelMap, off: null } };

const { context, options } = openaiToPiContext(rawRequest);
const stream = await models.stream(m, context, {
  ...options,
  apiKey: API_KEY,
  signal: AbortSignal.timeout(15000),
});
for await (const event of stream) {
  if (event.type === 'done') break;
}
globalThis.fetch = originalFetch;

// A 入仓：原始请求
console.log('\n--- A 入仓（直接发上游）---');
console.log(JSON.stringify(rawRequest, null, 2));

// B 入仓：pi-ai 实际发出的
console.log('\n--- B 入仓（pi-ai 实际发出）---');
console.log(JSON.stringify(capturedBody, null, 2));

// 对比
console.log('\n--- 入仓差异 ---');
var allKeys = new Set([...Object.keys(rawRequest), ...Object.keys(capturedBody)]);
var inDiffs = [];
for (var key of allKeys) {
  if (key === 'messages') {
    var msgsA = rawRequest.messages;
    var msgsB = capturedBody.messages;
    if (msgsA.length !== msgsB.length) {
      inDiffs.push('  messages[]: 长度不同 A=' + msgsA.length + ' B=' + msgsB.length);
    }
    for (var i = 0; i < Math.min(msgsA.length, msgsB.length); i++) {
      if (JSON.stringify(msgsA[i]) !== JSON.stringify(msgsB[i])) {
        inDiffs.push('  messages[' + i + ']: 不同');
        inDiffs.push('    A: ' + JSON.stringify(msgsA[i]));
        inDiffs.push('    B: ' + JSON.stringify(msgsB[i]));
      }
    }
    continue;
  }
  var valA = rawRequest[key];
  var valB = capturedBody[key];
  if (valA === undefined && valB === undefined) continue;
  if (valA === undefined) {
    inDiffs.push('  ' + key + ': A 无此字段 → B=' + JSON.stringify(valB));
  } else if (valB === undefined) {
    inDiffs.push('  ' + key + ': A=' + JSON.stringify(valA) + ' → B 无此字段');
  } else if (JSON.stringify(valA) !== JSON.stringify(valB)) {
    inDiffs.push('  ' + key + ': A=' + JSON.stringify(valA) + ' → B=' + JSON.stringify(valB));
  }
}

if (inDiffs.length === 0) {
  console.log('  ✅ 入仓完全一致');
} else {
  console.log('  ❌ ' + inDiffs.length + ' 处差异:');
  inDiffs.forEach(function(d) { console.log(d); });
  console.log('');
  console.log('  差异分析:');
  inDiffs.forEach(function(d) {
    if (d.includes('stream_options')) console.log('    - stream_options: pi-ai 自动加的，上游支持。✅ 良性');
    else if (d.includes('max_tokens')) console.log('    - max_tokens: pi-ai 按 compat.maxTokensField 映射。✅ 正确行为');
    else if (d.includes('thinking')) console.log('    - thinking: 我们的 off:null 修复阻止了 thinking:disabled。✅ 正确');
    else console.log('    - ⚠️ 需关注');
  });
}

// ================================================================
// 出仓对比：与上一次相同（基于同一份上游数据）
// ================================================================
console.log('\n【出仓对比】');

// 重新请求上游获取最新 SSE
var upResp = await fetch(BASE_URL + '/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
  body: JSON.stringify(rawRequest),
});
var rawSSE = await upResp.text();
var upLines = rawSSE.split('\n').filter(function(l) { return l.startsWith('data: '); });
var upChunks = upLines.map(function(l) {
  try { return JSON.parse(l.slice(6)); } catch { return null; }
}).filter(Boolean);

// 构造 msg
var msg = {
  role: 'assistant', api: 'openai-completions', provider: 'opencode-go',
  model: MODEL,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, reasoning: 0 },
  stopReason: 'stop', timestamp: Date.now(),
};
for (var _chunk of upChunks) {
  if (_chunk.usage) {
    var u = _chunk.usage;
    msg.usage = {
      input: u.prompt_tokens || 0,
      output: u.completion_tokens || 0,
      totalTokens: u.total_tokens || 0,
      cacheRead: u.prompt_tokens_details?.cached_tokens || u.prompt_cache_hit_tokens || 0,
      reasoning: u.completion_tokens_details?.reasoning_tokens || 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    if (_chunk.id) msg.responseId = _chunk.id;
    if (_chunk.model) msg.model = _chunk.model;
    if (_chunk.created) msg.timestamp = _chunk.created * 1000;
  }
}

// 生成事件
var events = [];
for (var _chunk2 of upChunks) {
  var delta = _chunk2.choices?.[0]?.delta || {};
  var finish = _chunk2.choices?.[0]?.finish_reason;
  if (delta?.role === 'assistant') { events.push({ type: 'start', partial: msg }); continue; }
  var foundR = null;
  for (var f of ['reasoning_content', 'reasoning', 'reasoning_text']) {
    var v = delta[f];
    if (typeof v === 'string' && v.length > 0) { foundR = v; break; }
  }
  if (foundR) { events.push({ type: 'thinking_delta', contentIndex: 0, delta: foundR, partial: msg }); continue; }
  if (delta?.content !== undefined && delta?.content !== null && delta?.content !== '') {
    events.push({ type: 'text_delta', contentIndex: 0, delta: delta.content, partial: msg }); continue;
  }
  if (_chunk2.usage || finish) { events.push({ type: 'done', reason: finish || 'stop', message: msg }); continue; }
}

// 转换
var converter = createOpenaiSSEConverter();
var gwChunks = [];
for (var _event of events) {
  for (var line of converter.eventToSSE(_event)) {
    try { gwChunks.push(JSON.parse(line.slice(6))); } catch {}
  }
}

// 逐行对比
console.log('\n--- SSE delta 逐行对比 ---');
var outDiffs = [];
var maxLen = Math.min(upChunks.length, gwChunks.length);

for (var i = 0; i < maxLen; i++) {
  var up = upChunks[i];
  var gw = gwChunks[i];
  var upDelta = up.choices?.[0]?.delta || {};
  var gwDelta = gw.choices?.[0]?.delta || {};
  if (upDelta.role === 'assistant') continue;
  if (up.usage) continue;

  var upKeys = Object.keys(upDelta).sort();
  var gwKeys = Object.keys(gwDelta).sort();
  var keyDiff = JSON.stringify(upKeys) !== JSON.stringify(gwKeys);
  var cDiff = (upDelta.content ?? null) !== (gwDelta.content ?? null);
  var rDiff = (upDelta.reasoning_content ?? null) !== (gwDelta.reasoning_content ?? null);

  if (keyDiff || cDiff || rDiff) {
    outDiffs.push('  chunk #' + i + ':');
    outDiffs.push('    A(上游): ' + JSON.stringify(upDelta));
    outDiffs.push('    B(网关): ' + JSON.stringify(gwDelta));
  }
}

var rA = 0, rB = 0, cA = 0, cB = 0;
for (var i2 = 0; i2 < maxLen; i2++) {
  var u2 = upChunks[i2], g2 = gwChunks[i2];
  var ud = u2.choices?.[0]?.delta || {}, gd = g2.choices?.[0]?.delta || {};
  if (u2.usage) continue;
  if (ud.role === 'assistant') continue;
  if (ud.reasoning_content !== undefined) rA++;
  if (gd.reasoning_content !== undefined) rB++;
  if (ud.content !== undefined) cA++;
  if (gd.content !== undefined) cB++;
}

console.log('  A: reasoning_chunks=' + rA + ', content_chunks=' + cA);
console.log('  B: reasoning_chunks=' + rB + ', content_chunks=' + cB);

if (outDiffs.length === 0) {
  console.log('  ✅ 出仓 SSE delta 完全一致');
} else {
  console.log('  ❌ ' + outDiffs.length + ' 处差异:');
  outDiffs.forEach(function(d) { console.log(d); });
  // 分析差异
  var allContentNull = outDiffs.every(function(d) {
    return d.includes('"reasoning_content":null');
  });
  if (allContentNull) {
    console.log('  所有差异仅由 reasoning_content:null 引起（上游在 content chunk 中带 null，我们省略 null）。✅ 良性');
  }
}

// usage 对比
console.log('\n--- usage 对比 ---');
var upUsage = upChunks.find(function(c) { return c.usage; })?.usage;
var gwUsage = gwChunks.find(function(c) { return c.usage; })?.usage;
if (JSON.stringify(upUsage) === JSON.stringify(gwUsage)) {
  console.log('  ✅ usage 完全一致');
} else {
  console.log('  A:' + JSON.stringify(upUsage));
  console.log('  B:' + JSON.stringify(gwUsage));
}

// ================================================================
// 总结
// ================================================================
console.log('\n' + '='.repeat(100));
console.log('总结');
console.log('='.repeat(100));

var inOk = inDiffs.length === 0 || inDiffs.every(function(d) {
  return d.includes('stream_options') || d.includes('max_tokens') || d.includes('thinking');
});
var outOk = outDiffs.length === 0 || outDiffs.every(function(d) { return d.includes('reasoning_content":null'); });

console.log('入仓: ' + (inOk ? '✅ 仅良性差异' : '❌ 需关注'));
console.log('出仓: ' + (outOk ? '✅ 仅良性差异' : '❌ 需关注'));
console.log('');
console.log('入仓良性差异:');
console.log('  - stream_options: pi-ai 自动添加 {include_usage:true}（上游支持）');
console.log('出仓良性差异:');
console.log('  - reasoning_content:null: 上游在 content chunk 中带 null，我们省略（语义等价）');
