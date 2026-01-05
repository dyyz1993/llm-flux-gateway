import { ToolDefinition } from '@shared/types';

export const TOOL_TEMPLATES: Record<string, ToolDefinition> = {
  web_search: {
    type: 'function',
    function: {
      name: 'web_search',
      description: '搜索互联网获取实时信息',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索查询关键词'
          },
          num_results: {
            type: 'number',
            description: '返回结果数量',
            default: 5
          }
        },
        required: ['query']
      }
    }
  },

  calculator: {
    type: 'function',
    function: {
      name: 'calculator',
      description: '执行数学计算',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: '数学表达式，如 "2 + 2" 或 "10 * 5"'
          }
        },
        required: ['expression']
      }
    }
  },

  get_weather: {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取指定城市的天气信息',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称'
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: '温度单位'
          }
        },
        required: ['city']
      }
    }
  },

  code_interpreter: {
    type: 'function',
    function: {
      name: 'code_interpreter',
      description: '执行Python代码并返回结果',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: '要执行的Python代码'
          }
        },
        required: ['code']
      }
    }
  },

  get_current_time: {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前时间和日期',
      parameters: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: '时区，例如 Asia/Shanghai',
            default: 'UTC'
          }
        },
        required: []
      }
    }
  },

  database_query: {
    type: 'function',
    function: {
      name: 'database_query',
      description: '执行数据库查询（SQL）',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'SQL查询语句'
          }
        },
        required: ['query']
      }
    }
  },

  send_email: {
    type: 'function',
    function: {
      name: 'send_email',
      description: '发送电子邮件',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: '收件人邮箱地址'
          },
          subject: {
            type: 'string',
            description: '邮件主题'
          },
          body: {
            type: 'string',
            description: '邮件正文'
          }
        },
        required: ['to', 'subject', 'body']
      }
    }
  },

  file_operations: {
    type: 'function',
    function: {
      name: 'file_operations',
      description: '执行文件系统操作（读取、写入、删除文件）',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['read', 'write', 'delete', 'list'],
            description: '操作类型'
          },
          path: {
            type: 'string',
            description: '文件路径'
          },
          content: {
            type: 'string',
            description: '要写入的内容（仅用于write操作）'
          }
        },
        required: ['operation', 'path']
      }
    }
  }
};
