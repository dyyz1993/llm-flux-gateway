const { ProtocolTranspiler } = require('./dist/server/module-protocol-transpiler/core/protocol-transpiler.js');

const transpiler = new ProtocolTranspiler();

const sseChunk = `event: message_start
data: {"type":"message_start","message":{"id":"msg-123","type":"message","role":"assistant","content":[],"model":"claude-3-opus","stop_reason":null}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

`;

const lines = sseChunk.trim().split('\n\n');
const results = lines.map(line =>
  transpiler.transpileStreamChunk(line, 'anthropic', 'openai')
);

console.log('Result 0:', JSON.stringify(results[0], null, 2));
console.log('Result 0.data:', JSON.stringify(results[0].data, null, 2));
console.log('Result 0.data?.choices?.[0]?.delta?.role:', results[0].data?.choices?.[0]?.delta?.role);
