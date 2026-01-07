import { describe, it, expect } from 'vitest';
import { normalizeToSnakeCase } from '../field-normalizer';

describe('CamelCase 检查器 - 验证 normalizeToSnakeCase', () => {
  it('应该完全转换所有驼峰字段为 snake_case', () => {
    // 模拟 GLM 混合格式响应（包含驼峰字段）
    const glmMixedResponse = {
      id: 'msg_123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'glm-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '1 + 1 = 2',
            toolCalls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"city": "Beijing"}',
                },
              },
            ],
          },
          finishReason: 'tool_calls',
        },
      ],
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        // GLM 特有字段
        reasoningTokens: 5,
        cachedTokens: 2,
      },
    };

    // 转换为 snake_case
    const normalized = normalizeToSnakeCase(glmMixedResponse, true);

    // 递归检查是否还有驼峰字段
    const camelCaseFields = findCamelCaseFields(normalized);

    // 打印结果
    console.log('📋 转换后的响应:');
    console.log(JSON.stringify(normalized, null, 2));

    console.log('\n🔍 发现的驼峰字段:');
    if (camelCaseFields.length === 0) {
      console.log('✅ 没有发现驼峰字段！');
    } else {
      console.log(`❌ 发现 ${camelCaseFields.length} 个驼峰字段:`);
      camelCaseFields.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue.path} = ${issue.field}`);
      });
    }

    // 断言：不应该有任何驼峰字段
    expect(camelCaseFields).toHaveLength(0);
  });

  it('应该检查特定字段是否被正确转换', () => {
    const data = {
      finishReason: 'stop',
      reasoningContent: '推理内容',
      toolCalls: [{ id: '123' }],
      usage: {
        promptTokens: 10,
        completionTokens: 20,
      },
    };

    const normalized = normalizeToSnakeCase(data, true);

    // 检查具体字段
    expect(normalized.finish_reason).toBe('stop');
    expect(normalized.reasoning_content).toBe('推理内容');
    expect(normalized.tool_calls).toBeDefined();
    expect(normalized.usage.prompt_tokens).toBe(10);
    expect(normalized.usage.completion_tokens).toBe(20);

    // 确保原始驼峰字段不存在
    expect(normalized.finishReason).toBeUndefined();
    expect(normalized.reasoningContent).toBeUndefined();
    expect(normalized.toolCalls).toBeUndefined();
    expect(normalized.usage.promptTokens).toBeUndefined();
    expect(normalized.usage.completionTokens).toBeUndefined();
  });
});

/**
 * 递归查找对象中的所有驼峰字段
 */
function findCamelCaseFields(obj: any, path: string = ''): Array<{ path: string; field: string }> {
  const issues: Array<{ path: string; field: string }> = [];

  if (obj === null || obj === undefined) {
    return issues;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      issues.push(...findCamelCaseFields(item, `${path}[${index}]`));
    });
    return issues;
  }

  if (typeof obj !== 'object') {
    return issues;
  }

  for (const [key, value] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${key}` : key;

    // 检查是否是驼峰命名（包含小写+大写的组合）
    const isCamelCase = /[a-z][A-Z]/.test(key);

    if (isCamelCase) {
      issues.push({
        path: fullPath,
        field: key,
      });
    }

    // 递归检查嵌套对象
    if (typeof value === 'object' && value !== null) {
      issues.push(...findCamelCaseFields(value, fullPath));
    }
  }

  return issues;
}
