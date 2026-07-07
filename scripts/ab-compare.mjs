/**
 * A/B 全维度对比脚本
 *
 * 入仓（request body）对比：
 *   A: 原始 OpenAI 请求（直接发上游）
 *   B: 经过输入适配器 + pi-ai buildParams 后发上游的实际请求
 *
 * 出仓（response）对比：
 *   A: 上游原始 SSE 响应
 *   B: pi-ai 事件 → 输出适配器 → SSE
 */

import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { openaiToPiContext } from '../src/server/adapters/input/openai.adapter.ts';
import { createOpenaiSSEConverter } from '../src/server/adapters/output/openai.adapter.ts';

const API_KEY = 'sk-9gnzvY39HD12Xd2oD0UTWln1R2HiIBAPuAvhAnsfgsGAJR1yeaTIMgwBUBrEPhWL';
const BASE_URL = 'https://opencode.ai/zen/go/v1';
const MODEL = 'deepseek-v4-flash';

// ================================================================
//  测试输入：标准的 OpenAI 流式请求
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
console.log('A/B 全维度对比');
console.log('='.repeat(100));
console.log('');
console.log('原始请求 body:');
console.log(JSON.stringify(rawRequest, null, 2));

// ================================================================
//  入仓对比：上游实际收到的请求 body
// ================================================================
console.log('');
console.log('='.repeat(100));
console.log('【入仓对比】上游实际收到的请求体');
console.log('='.repeat(100));

// --- A 入仓：直接发上游的原始请求 ---
console.log('\n--- A 入仓（原始请求）---');
console.log(JSON.stringify(rawRequest, null, 2));

// --- B 入仓：经过 pi-ai 处理后的请求 ---
const models = builtinModels();
const builtinModel = models.getModel('opencode-go', MODEL);

// 用修复后的模型（off:null）
const m = { ...builtinModel, thinkingLevelMap: { ...builtinModel.thinkingLevelMap, off: null } };

const { context } = openaiToPiContext(rawRequest);

// 获取 pi-ai 内部消息
const compat = builtinModel.compat || {};

// 构造 pi-ai 会发送的上游请求
const bMessages = context.messages.map(function(msg) {
  var result = { role: msg.role, content: undefined };
  if (typeof msg.content === 'string') {
    result.content = msg.content;
  } else if (Array.isArray(msg.content)) {
    result.content = msg.content.map(function(b) {
      var obj = { type: b.type };
      if (b.type === 'text' && b.text) obj.text = b.text;
      if (b.type === 'image_url' && b.image_url) obj.image_url = b.image_url;
      return obj;
    });
  }
  return result;
});

var bRequest = {
  model: MODEL,
  messages: bMessages,
  stream: true,
  stream_options: { include_usage: true },
  max_tokens: 50,
};

// thinking 参数（deepseek thinkingFormat）
// 因为加了 off:null，thinkingLevelMap.off !== null → false → 不会发 thinking:disabled
// 但也没传 reasoningEffort，所以不会发 thinking:enabled
// 所以这里 thinking 不会被设置！
console.log('\n--- B 入仓（经 pi-ai 处理后）---');
console.log(JSON.stringify(bRequest, null, 2));

// 对比入仓差异
console.log('\n--- 入仓差异 ---');
function deepDiff(objA, objB, path) {
  if (!path) path = '';
  var diffs = [];
  var allKeys = new Set([].concat(
    Object.keys(objA || {}),
    Object.keys(objB || {})
  ));
  for (var key of allKeys) {
    var fullPath = path ? path + '.' + key : key;
    if (key === 'messages') {
      var msgsA = objA.messages || [];
      var msgsB = objB.messages || [];
      if (msgsA.length !== msgsB.length) {
        diffs.push('  ' + fullPath + ': 长度不同 A=' + msgsA.length + ' B=' + msgsB.length);
      }
      for (var i = 0; i < Math.min(msgsA.length, msgsB.length); i++) {
        if (JSON.stringify(msgsA[i]) !== JSON.stringify(msgsB[i])) {
          diffs.push('  ' + fullPath + '[' + i + ']: 不同');
          diffs.push('    A: ' + JSON.stringify(msgsA[i]));
          diffs.push('    B: ' + JSON.stringify(msgsB[i]));
        }
      }
      continue;
    }
    var valA = objA ? objA[key] : undefined;
    var valB = objB ? objB[key] : undefined;
    if (valA === undefined && valB === undefined) continue;
    if (valA === undefined) {
      diffs.push('  ' + fullPath + ': A 无此字段, B=' + JSON.stringify(valB));
    } else if (valB === undefined) {
      diffs.push('  ' + fullPath + ': A=' + JSON.stringify(valA) + ', B 无此字段');
    } else if (JSON.stringify(valA) !== JSON.stringify(valB)) {
      diffs.push('  ' + fullPath + ': A=' + JSON.stringify(valA) + ', B=' + JSON.stringify(valB));
    }
  }
  return diffs;
}

var inDiffs = deepDiff(rawRequest, bRequest);
if (inDiffs.length === 0) {
  console.log('  ✅ 入仓完全一致');
} else {
  console.log('  ❌ 发现以下差异:');
  inDiffs.forEach(function(d) { console.log(d); });
}

// ================================================================
//  出仓对比：下游收到的 SSE 响应
// ================================================================
console.log('');
console.log('='.repeat(100));
console.log('【出仓对比】下游收到的 SSE 响应');
console.log('='.repeat(100));

// 1) 捕获上游原始 SSE
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

// 2) 构造 pi-ai AssistantMessage（从 usage chunk 提取元数据）
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

// 3) 模拟 pi-ai 事件（与 pi-ai parser 完全一致的逻辑）
var events = [];
for (var _chunk2 of upChunks) {
  var delta = _chunk2.choices?.[0]?.delta || {};
  var finish = _chunk2.choices?.[0]?.finish_reason;

  if (delta?.role === 'assistant') {
    events.push({ type: 'start', partial: msg });
    continue;
  }

  // pi-ai 的 reasoning 字段检测顺序：reasoning_content → reasoning → reasoning_text
  var foundReasoning = null;
  for (var field of ['reasoning_content', 'reasoning', 'reasoning_text']) {
    var val = delta[field];
    if (typeof val === 'string' && val.length > 0) {
      foundReasoning = val;
      break;
    }
  }
  if (foundReasoning) {
    events.push({ type: 'thinking_delta', contentIndex: 0, delta: foundReasoning, partial: msg });
    continue;
  }

  if (delta?.content !== undefined && delta?.content !== null && delta?.content !== '') {
    events.push({ type: 'text_delta', contentIndex: 0, delta: delta.content, partial: msg });
    continue;
  }

  if (_chunk2.usage || finish) {
    events.push({ type: 'done', reason: finish || 'stop', message: msg });
    continue;
  }
}

// 4) 输出适配器转换
var converter = createOpenaiSSEConverter();
var gwChunks = [];
for (var _event of events) {
  for (var line of converter.eventToSSE(_event)) {
    try { gwChunks.push(JSON.parse(line.slice(6))); } catch {}
  }
}

// 5) 逐行对比 delta 字段（跳过 role 初始化和 usage 行）
console.log('\n--- SSE delta 逐行对比 ---');

var outDiffs = [];
var maxLen = Math.min(upChunks.length, gwChunks.length);
var totalUp = 0, totalGw = 0;

for (var i = 0; i < maxLen; i++) {
  var up = upChunks[i];
  var gw = gwChunks[i];
  var upDelta = up.choices?.[0]?.delta || {};
  var gwDelta = gw.choices?.[0]?.delta || {};
  
  if (upDelta.role === 'assistant') continue;
  if (up.usage) continue;
  
  totalUp++;
  totalGw++;
  
  var upKeys = Object.keys(upDelta).sort();
  var gwKeys = Object.keys(gwDelta).sort();
  
  var keyDiff = JSON.stringify(upKeys) !== JSON.stringify(gwKeys);
  var contentDiff = (upDelta.content ?? null) !== (gwDelta.content ?? null);
  var reasoningDiff = (upDelta.reasoning_content ?? null) !== (gwDelta.reasoning_content ?? null);
  
  if (keyDiff || contentDiff || reasoningDiff) {
    outDiffs.push('  chunk #' + i + ':');
    outDiffs.push('    A(上游): ' + JSON.stringify(upDelta));
    outDiffs.push('    B(网关): ' + JSON.stringify(gwDelta));
    if (keyDiff) outDiffs.push('    → 字段差异: A keys=' + JSON.stringify(upKeys) + ', B keys=' + JSON.stringify(gwKeys));
    if (contentDiff) outDiffs.push('    → content 差异: A=' + JSON.stringify(upDelta.content) + ', B=' + JSON.stringify(gwDelta.content));
    if (reasoningDiff) outDiffs.push('    → reasoning_content 差异: A=' + JSON.stringify(upDelta.reasoning_content) + ', B=' + JSON.stringify(gwDelta.reasoning_content));
  }
}

// 统计
var reasoningA = 0, reasoningB = 0, contentA = 0, contentB = 0;
for (var i2 = 0; i2 < maxLen; i2++) {
  var up2 = upChunks[i2];
  var gw2 = gwChunks[i2];
  var upD2 = up2.choices?.[0]?.delta || {};
  var gwD2 = gw2.choices?.[0]?.delta || {};
  if (up2.usage) continue;
  if (upD2.role === 'assistant') continue;
  if (upD2.reasoning_content !== undefined) reasoningA++;
  if (gwD2.reasoning_content !== undefined) reasoningB++;
  if (upD2.content !== undefined) contentA++;
  if (gwD2.content !== undefined) contentB++;
}

console.log('  统计:');
console.log('    A reasoning_chunks=' + reasoningA + ', content_chunks=' + contentA);
console.log('    B reasoning_chunks=' + reasoningB + ', content_chunks=' + contentB);

if (outDiffs.length === 0) {
  console.log('  ✅ 出仓 SSE delta 完全一致（0 处差异）');
} else {
  console.log('  ❌ 发现 ' + outDiffs.length + ' 处差异:');
  outDiffs.forEach(function(d) { console.log(d); });
}

// 6) 最终 chunk（usage）对比
console.log('\n--- 最终 usage chunk 对比 ---');
var upUsage = upChunks.find(function(c) { return c.usage; })?.usage;
var gwUsage = gwChunks.find(function(c) { return c.usage; })?.usage;
console.log('  A(上游) usage:');
  console.log(JSON.stringify(upUsage, null, 4));
console.log('  B(网关) usage:');
  console.log(JSON.stringify(gwUsage, null, 4));

// ================================================================
//  总结
// ================================================================
console.log('');
console.log('='.repeat(100));
console.log('总结');
console.log('='.repeat(100));
console.log('入仓差异: ' + (inDiffs.length === 0 ? '✅ 一致' : '❌ ' + inDiffs.length + ' 处差异'));
console.log('出仓差异: ' + (outDiffs.length === 0 ? '✅ 一致' : '❌ ' + outDiffs.length + ' 处差异'));
