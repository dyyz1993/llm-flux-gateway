import { describe, it, expect } from 'vitest';
import { AnthropicConverter } from '../../../module-protocol-transpiler/converters/anthropic.converter';
import { OpenAIConverter } from '../../../module-protocol-transpiler/converters/openai.converter';
import { ProtocolTranspiler } from '../../../module-protocol-transpiler/core/protocol-transpiler';

describe('GLM Token Extraction - Complete Flow', () => {
  // Real GLM response from database
  const glmResponse = {
    "id": "msg_20260105124016e4871ba998a04400",
    "type": "message",
    "role": "assistant",
    "model": "glm-4.7",
    "content": [
      {
        "type": "text",
        "text": "test content"
      }
    ],
    "stop_reason": "end_turn",
    "stop_sequence": null,
    "usage": {
      "input_tokens": 79,
      "output_tokens": 23,
      "cache_read_input_tokens": 269,
      "server_tool_use": {
        "web_search_requests": 0
      },
      "service_tier": "standard"
    }
  };

  it('Step 1: AnthropicConverter should convert GLM response to Internal Format', () => {
    const converter = new AnthropicConverter();
    const result = converter.convertResponseToInternal(glmResponse);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data!.usage?.promptTokens).toBe(79);
      expect(result.data!.usage?.completionTokens).toBe(23);
      expect(result.data!.usage?.totalTokens).toBe(102);
      expect(result.data!.usage?.cacheReadTokens).toBe(269);
    }
  });

  it('Step 2: Direct converter call should return Internal Format', () => {
    const transpiler = new ProtocolTranspiler();
    transpiler.registerConverter(new OpenAIConverter());
    transpiler.registerConverter(new AnthropicConverter());

    // NEW: Direct converter call (gateway-controller.ts line 595-597 after fix)
    const sourceConverter = (transpiler as any).converters.get('anthropic');
    const internalResult = sourceConverter.convertResponseToInternal(glmResponse);

    expect(internalResult.success).toBe(true);

    if (internalResult.success) {
      const internalResponse = internalResult.data!;
      expect(internalResponse.usage).toBeDefined();
      expect(internalResponse.usage.promptTokens).toBe(79);
      expect(internalResponse.usage.completionTokens).toBe(23);
      expect(internalResponse.usage.totalTokens).toBe(102);
      expect(internalResponse.usage.cacheReadTokens).toBe(269);

      console.log('✅ Direct converter call works!');
      console.log('✅ Internal Format (camelCase):');
      console.log('  - promptTokens:', internalResponse.usage.promptTokens);
      console.log('  - completionTokens:', internalResponse.usage.completionTokens);
      console.log('  - totalTokens:', internalResponse.usage.totalTokens);
    }
  });

  it('Step 3: Document why transpile() returns wrong format', () => {
    const transpiler = new ProtocolTranspiler();
    transpiler.registerConverter(new OpenAIConverter());
    transpiler.registerConverter(new AnthropicConverter());

    const result = transpiler.transpile(glmResponse, 'anthropic', 'openai');

    expect(result.success).toBe(true);

    const returnedData = result.data! as any;

    console.log('\n=== Why transpile() is wrong for getting Internal Format ===');
    console.log('transpile(anthropic → openai) returns:');

    if (returnedData?.usage) {
      console.log('  Field names:', Object.keys(returnedData.usage).join(', '));
      console.log('  - prompt_tokens:', returnedData.usage.prompt_tokens);
      console.log('  - completion_tokens:', returnedData.usage.completion_tokens);

      console.log('\n❌ This is OpenAI API format (snake_case), not Internal Format!');
      console.log('❌ That\'s why we use direct converter call instead');
    }
  });

  it('Step 4: Verify gateway-controller extraction works', () => {
    const transpiler = new ProtocolTranspiler();
    transpiler.registerConverter(new OpenAIConverter());
    transpiler.registerConverter(new AnthropicConverter());

    // Simulate gateway-controller flow (after fix)
    const sourceConverter = (transpiler as any).converters.get('anthropic');
    const internalResponseResult = sourceConverter.convertResponseToInternal(glmResponse);

    expect(internalResponseResult.success).toBe(true);

    const internalResponse = internalResponseResult.success
      ? internalResponseResult.data!
      : undefined;

    // Simulate gateway-controller extraction (line 707-713 after fix)
    let promptTokens = 0;
    let completionTokens = 0;

    if (internalResponse?.usage) {
      promptTokens = internalResponse.usage.promptTokens || 0;
      completionTokens = internalResponse.usage.completionTokens || 0;
    }

    console.log('\n=== Gateway Extraction Test (After Fix) ===');
    console.log('internalResponse exists:', internalResponse !== undefined);
    console.log('internalResponse.usage exists:', internalResponse?.usage !== undefined);
    console.log('promptTokens:', promptTokens);
    console.log('completionTokens:', completionTokens);

    expect(promptTokens).toBe(79);
    expect(completionTokens).toBe(23);

    console.log('\n✅ FIX VERIFIED!');
    console.log('✅ Direct converter call returns Internal Format (camelCase)');
    console.log('✅ Token extraction works correctly');
  });
});
