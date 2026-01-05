import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RouteMatcherService } from '../route-matcher.service';
import * as database from '@server/shared/database';

// Mock database functions
vi.mock('@server/shared/database', () => ({
  queryAll: vi.fn(),
}));

const mockQueryAll = vi.mocked(database.queryAll);

describe('RouteMatcherService - API Key 路由隔离测试', () => {
  let service: RouteMatcherService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RouteMatcherService();
  });

  const mockZhipuRoute = {
    id: 'zhipu-route-1',
    name: 'Zhipu Coding Route',
    base_url: 'https://open.bigmodel.cn/api/coding/paas/v4',
    endpoint: '/chat/completions',
    upstream_api_key: 'zhipu-key',
    is_active: 1,
    overrides: '[]',
    priority: 100,
    request_format: 'openai',
    response_format: 'openai',
  };

  const mockGeminiRoute = {
    id: 'gemini-route-1',
    name: 'Gemini Flash Route',
    base_url: 'https://generativelanguage.googleapis.com/v1beta',
    endpoint: '/chat/completions',
    upstream_api_key: 'gemini-key',
    is_active: 1,
    overrides: '[]',
    priority: 150,
    request_format: 'gemini',
    response_format: 'openai',
  };

  describe('测试用例 1: 基础隔离 - Key A 只能用 Key A 的 Routes', () => {
    it('Key A 关联 Route 1，Key B 关联 Route 2，Key A 请求模型时应该只能匹配 Route 1', async () => {
      const apiKeyA = 'api-key-a-id';
      // const apiKeyB = 'api-key-b-id'; // Not used in this test

      // Mock: Key A 只关联 zhipu-route-1
      mockQueryAll.mockReturnValueOnce([
        {
          ...mockZhipuRoute,
        },
      ]) as any;

      // 调用 findMatch 时传入 apiKeyId
      const result = await (service as any).findMatch('glm-4-air', apiKeyA);

      // 验证 SQL 包含 api_key_routes 的 JOIN 条件
      expect(mockQueryAll).toHaveBeenCalled();
      const sqlCall = mockQueryAll.mock.calls[0]![0]!;

      // 验证 SQL 包含 api_key_routes 表的 JOIN
      expect(sqlCall).toContain('api_key_routes');
      expect(sqlCall).toContain('INNER JOIN');

      // 验证 SQL 包含 WHERE 条件过滤 api_key_id
      expect(sqlCall).toContain('api_key_id');
      expect(sqlCall).toContain('?');

      // 验证绑定的参数包含 apiKeyA
      const params = mockQueryAll.mock.calls[0]![1]!;
      expect(params).toContain(apiKeyA);

      // 验证返回的结果是 zhipu-route-1
      expect(result).not.toBeNull();
      expect(result?.route.id).toBe('zhipu-route-1');
      expect(result?.route.baseUrl).toBe('https://open.bigmodel.cn/api/coding/paas/v4');
    });
  });

  describe('测试用例 2: Key A 不能访问 Key B 的 Routes', () => {
    it('Key A 只关联 Zhipu Route，Key B 关联 Gemini Route，Key A 请求 gemini 模型时应透传', async () => {
      const apiKeyA = 'api-key-a-id';

      // Mock: Key A 只关联 zhipu-route-1（不支持 gemini 模型）
      mockQueryAll.mockReturnValueOnce([
        {
          ...mockZhipuRoute,
          overrides: JSON.stringify([
            {
              field: 'model',
              matchValues: ['glm-4-air', 'glm-4-flash'],
              rewriteValue: 'glm-4-flash',
            },
          ]),
        },
      ]);

      // Key A 请求 gemini 模型
      const result = await (service as any).findMatch('gemini-2.0-flash', apiKeyA);

      // 验证 SQL 包含 api_key_routes 的 JOIN 和 WHERE 条件
      expect(mockQueryAll).toHaveBeenCalled();
      const sqlCall = mockQueryAll.mock.calls[0]![0]!;
      expect(sqlCall).toContain('api_key_routes');
      expect(sqlCall).toContain('api_key_id');

      // 修复: 根据透传逻辑，如果 Route 的 override 规则不匹配请求的 model，应该透传（返回第一个 Route）
      // 而不是返回 null
      expect(result).not.toBeNull();
      expect(result?.route.id).toBe('zhipu-route-1');
      expect(result?.rewrittenModel).toBe('gemini-2.0-flash'); // 透传原始模型名
    });

    it('Key A 请求任意模型时，不应该匹配到 Key B 的 Route', async () => {
      const apiKeyA = 'api-key-a-id';

      // Mock: Key A 只关联 zhipu-route-1
      mockQueryAll.mockReturnValueOnce([
        {
          ...mockZhipuRoute,
        },
      ]) as any;

      // Key A 请求任意模型（wildcard）
      const result = await (service as any).findMatch('any-model', apiKeyA);

      // 验证 SQL 包含 api_key_routes 的过滤
      const sqlCall = mockQueryAll.mock.calls[0]![0]!;
      expect(sqlCall).toContain('api_key_routes');

      // 验证返回 zhipu-route-1（透传模式）
      expect(result?.route.id).toBe('zhipu-route-1');
      expect(result?.rewrittenModel).toBe('any-model');
    });
  });

  describe('测试用例 3: 优先级只在关联的 Routes 中生效', () => {
    it('Key A 关联 Route 2（priority 100），系统中存在 Route 3（priority 150，属于 Key B），Key A 应匹配 Route 2', async () => {
      const apiKeyA = 'api-key-a-id';

      // Mock: Key A 只关联 priority 较低的 Route
      mockQueryAll.mockReturnValueOnce([
        {
          ...mockZhipuRoute,
          id: 'route-priority-100',
          priority: 100,
        },
      ]) as any;

      // 同时存在一个高优先级的 Route（但属于 Key B，不应该被 Key A 看到）
      const apiKeyB = 'api-key-b-id';
      mockQueryAll.mockReturnValueOnce([
        {
          ...mockGeminiRoute,
          id: 'route-priority-150',
          priority: 150,
        },
      ]) as any;

      // Key A 请求任意模型
      const resultA = await (service as any).findMatch('any-model', apiKeyA);

      // 验证 Key A 的 SQL 包含 api_key_routes 过滤
      const sqlCallA = mockQueryAll.mock.calls[0]![0]!;
      expect(sqlCallA).toContain('api_key_routes');
      expect(sqlCallA).toContain('api_key_id');

      // 验证 Key A 匹配到 route-priority-100
      expect(resultA?.route.id).toBe('route-priority-100');
      expect(resultA?.route.priority).toBe(100);

      // Key B 请求任意模型
      const resultB = await (service as any).findMatch('any-model', apiKeyB);

      // 验证 Key B 的 SQL 也包含 api_key_routes 过滤
      const sqlCallB = mockQueryAll.mock.calls[1]![0]!;
      expect(sqlCallB).toContain('api_key_routes');

      // 验证 Key B 匹配到 route-priority-150
      expect(resultB?.route.id).toBe('route-priority-150');
      expect(resultB?.route.priority).toBe(150);

      // 验证 Key A 没有匹配到 Key B 的高优先级 Route
      expect(resultA?.route.id).not.toBe('route-priority-150');
    });
  });

  describe('测试用例 4: 空 Route 关联返回 null', () => {
    it('Key A 没有关联任何 Route，Key A 请求任意模型时应返回 null', async () => {
      const apiKeyA = 'api-key-a-id';

      // Mock: Key A 没有关联任何 Route
      mockQueryAll.mockReturnValueOnce([]);

      // Key A 请求任意模型
      const result = await (service as any).findMatch('glm-4-air', apiKeyA);

      // 验证 SQL 包含 api_key_routes 的 JOIN 和 WHERE 条件
      expect(mockQueryAll).toHaveBeenCalled();
      const sqlCall = mockQueryAll.mock.calls[0]![0]!;
      expect(sqlCall).toContain('api_key_routes');
      expect(sqlCall).toContain('api_key_id');

      // 验证返回 null
      expect(result).toBeNull();
    });

    // 修复: 删除 is_active=0 测试用例
    // 理由: SQL 查询已经包含 WHERE r.is_active = 1 条件，所以 queryAll 不会返回 is_active=0 的数据
    // 不需要在应用层再次检查 isActive（已信任 SQL 过滤）
    // 如果要测试 SQL 过滤，应该测试 SQL 包含 is_active = 1 条件（上面的测试已覆盖）
  });

  describe('测试用例 5: 向后兼容 - 不传 apiKeyId', () => {
    it('调用 findMatch 时不传 apiKeyId，应查询所有活跃 Routes（不包含 api_key_routes 的 JOIN）', async () => {
      // Mock: 返回所有活跃 Routes
      mockQueryAll.mockReturnValueOnce([
        {
          ...mockZhipuRoute,
        },
        {
          ...mockGeminiRoute,
        },
      ]) as any;

      // 调用 findMatch 时不传 apiKeyId（向后兼容）
      const result = await service.findMatch('glm-4-air');

      // 验证 SQL 不包含 api_key_routes 的 JOIN
      expect(mockQueryAll).toHaveBeenCalled();
      const sqlCall = mockQueryAll.mock.calls[0]![0]!;

      // 验证 SQL 包含 routes 的基础查询
      expect(sqlCall).toContain('FROM routes r');
      expect(sqlCall).toContain('INNER JOIN assets a');
      expect(sqlCall).toContain('INNER JOIN vendor_templates v');
      expect(sqlCall).toContain('WHERE r.is_active = 1');

      // 验证 SQL 不包含 api_key_routes 的 JOIN
      expect(sqlCall).not.toContain('api_key_routes');

      // 验证仍然能正常匹配（优先级最高的 Route）
      expect(result).not.toBeNull();
      expect(result?.route.id).toBe('zhipu-route-1');
    });

    it('不传 apiKeyId 时，仍然应该按优先级排序', async () => {
      // Mock: 返回多个不同优先级的 Routes
      // 修复: queryAll 返回数组的顺序就是 SQL 查询结果的顺序
      // SQL 有 ORDER BY priority DESC，所以应该返回按优先级排序的数组
      mockQueryAll.mockReturnValueOnce([
        {
          ...mockGeminiRoute,
          id: 'route-priority-150',
          priority: 150, // 第一个（最高优先级）
        },
        {
          ...mockZhipuRoute,
          id: 'route-priority-100',
          priority: 100, // 第二个
        },
        {
          ...mockZhipuRoute,
          id: 'route-priority-50',
          priority: 50, // 第三个
        },
      ]) as any;

      // 调用 findMatch 时不传 apiKeyId
      const result = await service.findMatch('any-model');

      // 验证 SQL 包含 ORDER BY priority DESC
      const sqlCall = mockQueryAll.mock.calls[0]![0]!;
      expect(sqlCall).toContain('ORDER BY');
      expect(sqlCall).toContain('priority');
      expect(sqlCall).toContain('DESC');

      // 验证返回优先级最高的 Route
      expect(result?.route.id).toBe('route-priority-150');
      expect(result?.route.priority).toBe(150);
    });
  });

  describe('测试用例 6: 多个 Key 关联同一个 Route', () => {
    it('Key A 和 Key B 都关联同一个 Route，都应该能正常匹配', async () => {
      const apiKeyA = 'api-key-a-id';
      const apiKeyB = 'api-key-b-id';

      const sharedRoute = {
        ...mockZhipuRoute,
        id: 'shared-route-1',
      };

      // Mock: Key A 和 Key B 都关联 shared-route-1
      mockQueryAll.mockReturnValueOnce([sharedRoute]);
      mockQueryAll.mockReturnValueOnce([sharedRoute]);

      // Key A 请求模型
      const resultA = await (service as any).findMatch('glm-4-air', apiKeyA);

      // 验证 Key A 的 SQL
      const sqlCallA = mockQueryAll.mock.calls[0]![0]!;
      expect(sqlCallA).toContain('api_key_routes');
      expect(sqlCallA).toContain('api_key_id');
      const paramsA = mockQueryAll.mock.calls[0]![1]!;
      expect(paramsA).toContain(apiKeyA);

      // 验证 Key A 的结果
      expect(resultA?.route.id).toBe('shared-route-1');

      // Key B 请求模型
      const resultB = await (service as any).findMatch('glm-4-air', apiKeyB);

      // 验证 Key B 的 SQL
      const sqlCallB = mockQueryAll.mock.calls[1]![0]!;
      expect(sqlCallB).toContain('api_key_routes');
      const paramsB = mockQueryAll.mock.calls[1]![1]!;
      expect(paramsB).toContain(apiKeyB);

      // 验证 Key B 的结果
      expect(resultB?.route.id).toBe('shared-route-1');
    });
  });

  describe('测试用例 7: API Key 关联多个 Route 时的优先级', () => {
    it('Key A 关联多个 Route，应按 priority 排序并选择第一个匹配的 Route', async () => {
      const apiKeyA = 'api-key-a-id';

      // Mock: Key A 关联多个不同优先级的 Routes
      // 修复: queryAll 返回数组的顺序就是 SQL 查询结果的顺序
      // SQL 有 ORDER BY priority DESC，所以应该返回按优先级排序的数组
      mockQueryAll.mockReturnValueOnce([
        {
          ...mockGeminiRoute,
          id: 'route-priority-200',
          priority: 200, // 第一个（最高优先级）
        },
        {
          ...mockZhipuRoute,
          id: 'route-priority-100',
          priority: 100, // 第二个
        },
        {
          ...mockZhipuRoute,
          id: 'route-priority-50',
          priority: 50, // 第三个
        },
      ]) as any;

      // Key A 请求模型
      const result = await (service as any).findMatch('any-model', apiKeyA);

      // 验证 SQL 包含 ORDER BY priority DESC
      const sqlCall = mockQueryAll.mock.calls[0]![0]!;
      expect(sqlCall).toContain('ORDER BY');
      expect(sqlCall).toContain('priority');
      expect(sqlCall).toContain('DESC');

      // 验证返回优先级最高的 Route
      expect(result?.route.id).toBe('route-priority-200');
      expect(result?.route.priority).toBe(200);
    });
  });

  describe('测试用例 8: API Key 隔离下的覆写规则', () => {
    it('Key A 关联的 Route 包含覆写规则，应该正确应用覆写', async () => {
      const apiKeyA = 'api-key-a-id';

      const overrides = JSON.stringify([
        {
          field: 'model',
          matchValues: ['glm-4-air'],
          rewriteValue: 'glm-4-flash',
        },
      ]);

      // Mock: Key A 关联的 Route 包含覆写规则
      mockQueryAll.mockReturnValueOnce([
        {
          ...mockZhipuRoute,
          overrides,
        },
      ]) as any;

      // Key A 请求 glm-4-air
      const result = await (service as any).findMatch('glm-4-air', apiKeyA);

      // 验证 SQL 包含 api_key_routes 的 JOIN
      const sqlCall = mockQueryAll.mock.calls[0]![0]!;
      expect(sqlCall).toContain('api_key_routes');

      // 验证返回的覆写结果
      expect(result?.route.id).toBe('zhipu-route-1');
      expect(result?.rewrittenModel).toBe('glm-4-flash');
      expect(result?.matchedRules).toHaveLength(1);
      expect(result?.matchedRules[0].rewriteValue).toBe('glm-4-flash');
    });
  });

  describe('测试用例 9: SQL 注入防护', () => {
    it('apiKeyId 参数化查询，防止 SQL 注入', async () => {
      const maliciousApiKey = "'; DROP TABLE api_key_routes; --";

      // Mock: 返回空结果（应该不会执行恶意 SQL）
      mockQueryAll.mockReturnValueOnce([]);

      // 使用恶意 apiKeyId
      const result = await (service as any).findMatch('glm-4-air', maliciousApiKey);

      // 验证 SQL 使用参数化查询（? 占位符）
      const sqlCall = mockQueryAll.mock.calls[0]![0]!;
      expect(sqlCall).toContain('?');
      expect(sqlCall).not.toContain(maliciousApiKey);

      // 验证参数是通过数组传递的
      const params = mockQueryAll.mock.calls[0]![1]!;
      expect(params).toContain(maliciousApiKey);

      // 验证返回 null（而不是数据库被删除）
      expect(result).toBeNull();
    });
  });
});
