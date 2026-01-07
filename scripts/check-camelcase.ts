#!/usr/bin/env node
/**
 * 递归检查对象中是否还有驼峰字段
 * 用于验证 normalizeToSnakeCase 是否完全生效
 */

interface CamelCaseIssue {
  path: string;
  field: string;
  value: any;
}

function findCamelCaseFields(obj: any, path: string = ''): CamelCaseIssue[] {
  const issues: CamelCaseIssue[] = [];

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

    // 检查是否是驼峰命名（包含大写字母且不是全大写）
    const isCamelCase = /[a-z][A-Z]/.test(key) && !/^[A-Z0-9_]+$/.test(key);

    if (isCamelCase) {
      issues.push({
        path: fullPath,
        field: key,
        value: typeof value === 'object' ? '[Object]' : value,
      });
    }

    // 递归检查嵌套对象
    if (typeof value === 'object' && value !== null) {
      issues.push(...findCamelCaseFields(value, fullPath));
    }
  }

  return issues;
}

// 测试用例
const testCases = [
  {
    name: 'GLM 响应示例',
    data: {
      finishReason: 'stop',
      reasoningContent: '推理内容',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
      },
      choices: [
        {
          message: {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'weather',
                  arguments: '{}',
                },
              },
            ],
          },
          finishReason: 'tool_calls',
        },
      ],
    },
  },
  {
    name: 'normalizeToSnakeCase 后的响应',
    data: {
      finish_reason: 'stop',
      reasoning_content: '推理内容',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
      },
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_123',
                type: 'function',
                function: {
                  name: 'weather',
                  arguments: '{}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    },
  },
];

console.log('=== 检查对象中的驼峰字段 ===\n');

testCases.forEach((testCase) => {
  console.log(`📋 ${testCase.name}`);
  const issues = findCamelCaseFields(testCase.data);

  if (issues.length === 0) {
    console.log('✅ 没有发现驼峰字段\n');
  } else {
    console.log(`❌ 发现 ${issues.length} 个驼峰字段:\n`);
    issues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue.path}`);
      console.log(`     字段名: ${issue.field}`);
      console.log(`     值: ${JSON.stringify(issue.value)}\n`);
    });
  }
});
