/**
 * 真正的 A/B 对比：用同一份上游原始 SSE 数据，
 * 过 pi-ai 的真实 parser（复制其事件处理逻辑）。
 */

import { builtinModels } from '@earendil-works/pi-ai/providers/all';
import { openaiToPiContext } from '../src/server/adapters/input/openai.adapter.ts';
import { createOpenaiSSEConverter, piResponseToOpenaiJson } from '../src/server/adapters/output/openai.adapter.ts';

const API_KEY = 'sk-9gnzvY39HD12Xd2oD0UTWln1R2HiIBAPuAvhAnsfgsGAJR1yeaTIMgwBUBrEPhWL';
const BASE_URL = 'https://opencode.ai/zen/go/v1';
const MODEL = 'deepseek-v4-flash';

// 1) 捕获上游原始 SSE
const requestBody = { model: MODEL, stream: true, max_tokens: 50, messages: [{ role: 'user', content: 'What is 2+2? Reply only the number.' }] };
const resp = await fetch(BASE_URL + '/chat/completions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
  body: JSON.stringify(requestBody),
});
const rawSSEText = await resp.text();

// 2) 解析上游 SSE 得到原始 chunk 列表
const upLines = rawSSEText.split('\n').filter(function(l) { return l.startsWith('data: '); });
const upChunks = upLines.map(function(l) { try { return JSON.parse(l.slice(6)); } catch { return null; } }).filter(Boolean);

console.log('=== 上游: ' + upChunks.length + ' 个 SSE chunk ===');

// 3) pi-ai 风格的事件流
class PiStream {
  constructor() {
    this.events = [];
    this.resolvers = [];
    this.ended = false;
  }
  push(event) {
    if (this.resolvers.length > 0) {
      this.resolvers.shift()(event);
    } else {
      this.events.push(event);
    }
  }
  end() {
    this.ended = true;
    for (var r of this.resolvers) {
      r(null); // resolve with null → done
    }
    this.resolvers = [];
  }
  [Symbol.asyncIterator]() {
    var self = this;
    return {
      next: function() {
        if (self.events.length > 0) {
          return Promise.resolve({ value: self.events.shift(), done: false });
        }
        if (self.ended) {
          return Promise.resolve({ done: true });
        }
        return new Promise(function(resolve) {
          self.resolvers.push(function(event) {
            if (event === null) {
              resolve({ done: true });
            } else {
              resolve({ value: event, done: false });
            }
          });
        });
      },
    };
  }
}

// 构建 output 对象
var output = {
  role: 'assistant', api: 'openai-completions', provider: 'opencode-go', model: MODEL,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, reasoning: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  stopReason: 'stop', timestamp: Date.now(),
};

// 找 usage chunk 提取元数据
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

// ===== pi-ai 风格的事件处理 =====
var piStream = new PiStream();
var blocks = [];
var thinkingBlock = null;
var textBlock = null;

function getContentIndex(block) { return blocks.indexOf(block); }

function ensureThinkingBlock() {
  if (!thinkingBlock) {
    thinkingBlock = { type: 'thinking', thinking: '' };
    blocks.push(thinkingBlock);
    piStream.push({ type: 'thinking_start', contentIndex: getContentIndex(thinkingBlock), partial: output });
  }
  return thinkingBlock;
}

function ensureTextBlock() {
  if (!textBlock) {
    textBlock = { type: 'text', text: '' };
    blocks.push(textBlock);
    piStream.push({ type: 'text_start', contentIndex: getContentIndex(textBlock), partial: output });
  }
  return textBlock;
}

// start 事件
piStream.push({ type: 'start', partial: output });

// 按 pi-ai 逻辑处理每个 upstream chunk
for (var _c2 of upChunks) {
  var choice = _c2.choices?.[0];
  if (!choice) continue;

  if (choice.delta) {
    // content
    if (choice.delta.content !== null && choice.delta.content !== undefined && choice.delta.content.length > 0) {
      var tb = ensureTextBlock();
      tb.text += choice.delta.content;
      piStream.push({ type: 'text_delta', contentIndex: getContentIndex(tb), delta: choice.delta.content, partial: output });
    }

    // reasoning (pi-ai 的字段检测顺序)
    var rc = null;
    for (var f of ['reasoning_content', 'reasoning', 'reasoning_text']) {
      var v = choice.delta[f];
      if (typeof v === 'string' && v.length > 0) { rc = v; break; }
    }
    if (rc) {
      var rBlock = ensureThinkingBlock();
      rBlock.thinking += rc;
      piStream.push({ type: 'thinking_delta', contentIndex: getContentIndex(rBlock), delta: rc, partial: output });
    }
  }

  // finish_reason → 结束 blocks
  if (choice.finish_reason) {
    if (textBlock) {
      piStream.push({ type: 'text_end', contentIndex: getContentIndex(textBlock), content: textBlock.text, partial: output });
    }
    if (thinkingBlock) {
      piStream.push({ type: 'thinking_end', contentIndex: getContentIndex(thinkingBlock), content: thinkingBlock.thinking, partial: output });
    }
  }
}

// done 事件
piStream.push({ type: 'done', reason: output.stopReason, message: output });
piStream.end();

// 4) 收集事件
var events = [];
for await (var e of piStream) {
  events.push(e);
}

console.log('\n=== pi-ai 事件（真正解析）===');
var uTypes = [...new Set(events.map(function(e) { return e.type; }))];
console.log('事件类型:', uTypes.join(', '));
console.log('总事件数:', events.length);
console.log('thinking_delta:', events.filter(function(e) { return e.type === 'thinking_delta'; }).length);
console.log('text_delta:', events.filter(function(e) { return e.type === 'text_delta'; }).length);
console.log('thinking_start:', events.filter(function(e) { return e.type === 'thinking_start'; }).length);
console.log('thinking_end:', events.filter(function(e) { return e.type === 'thinking_end'; }).length);
console.log('text_start:', events.filter(function(e) { return e.type === 'text_start'; }).length);
console.log('text_end:', events.filter(function(e) { return e.type === 'text_end'; }).length);

// 5) 用输出适配器转换
var converter = createOpenaiSSEConverter();
var gwChunks = [];
for (var _e of events) {
  for (var line of converter.eventToSSE(_e)) {
    try { gwChunks.push(JSON.parse(line.slice(6))); } catch {}
  }
}

// 6) 逐行对比（跳过 role 初始行和 usage 行）
console.log('\n=== 逐行对比 ===');
var diffCount = 0;
var maxCmp = Math.min(upChunks.length, gwChunks.length);

for (var i = 0; i < maxCmp; i++) {
  var a = upChunks[i];
  var b = gwChunks[i];
  var aDelta = a.choices?.[0]?.delta || {};
  var bDelta = b.choices?.[0]?.delta || {};

  if (aDelta.role === 'assistant') continue;
  if (a.usage && typeof a.usage === 'object' && a.usage !== null && 'prompt_tokens' in a.usage) continue;

  var aStr = JSON.stringify(aDelta);
  var bStr = JSON.stringify(bDelta);

  if (aStr !== bStr) {
    diffCount++;
    if (diffCount <= 5) {
      console.log('差异 #' + diffCount + ' (chunk ' + i + '):');
      console.log('  A:', aStr);
      console.log('  B:', bStr);
    }
  }
}

console.log('\n对比: ' + maxCmp + ' 行, 差异: ' + diffCount + ' 处');
console.log(diffCount === 0 ? '✅ 完全一致！' : '❌ 有差异');
