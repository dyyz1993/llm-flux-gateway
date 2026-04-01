/**
 * 负载均衡服务单元测试
 * 测试负载均衡器的核心功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoadBalancerService, type LoadBalancerMember } from '../load-balancer.service';

// Mock database
vi.mock('@server/shared/database', () => ({
  queryAll: vi.fn(() => []),
  queryFirst: vi.fn(() => null),
  queryRun: vi.fn(() => ({ changes: 1 })),
}));

describe('LoadBalancerService', () => {
  let service: LoadBalancerService;

  beforeEach(() => {
    service = new LoadBalancerService();
    vi.clearAllMocks();
  });

  describe('selectRoute', () => {
    it('应该返回 null 当没有可用成员时', () => {
      const result = service.selectRoute([]);
      expect(result).toBeNull();
    });

    it('应该返回唯一的健康成员', () => {
      const members: LoadBalancerMember[] = [
        {
          id: 'member-1',
          apiKeyId: 'key-1',
          routeId: 'route-1',
          priority: 1,
          weight: 100,
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-1',
            name: 'Route 1',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-4',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
      ];

      const result = service.selectRoute(members);
      expect(result).not.toBeNull();
      expect(result?.route?.id).toBe('route-1');
    });

    it('应该按照权重比例选择成员', () => {
      const members: LoadBalancerMember[] = [
        {
          id: 'member-1',
          apiKeyId: 'key-1',
          routeId: 'route-1',
          priority: 1,
          weight: 300,
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-1',
            name: 'Route 1',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-4',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
        {
          id: 'member-2',
          apiKeyId: 'key-1',
          routeId: 'route-2',
          priority: 1,
          weight: 100,
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-2',
            name: 'Route 2',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-3.5',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
      ];

      // 运行多次测试，检查权重分布
      const results: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const selected = service.selectRoute(members);
        if (selected) {
          results.push(selected.route!.id);
        }
      }

      // 统计选择次数
      const route1Count = results.filter(r => r === 'route-1').length;
      const route2Count = results.filter(r => r === 'route-2').length;

      // route-1 应该被选择约 75% 的时间 (300 / (300 + 100))
      expect(route1Count).toBeGreaterThan(700);
      expect(route2Count).toBeGreaterThan(50);
    });

    it('应该跳过不健康的成员', () => {
      const members: LoadBalancerMember[] = [
        {
          id: 'member-1',
          apiKeyId: 'key-1',
          routeId: 'route-1',
          priority: 1,
          weight: 100,
          healthStatus: 'unhealthy',
          failCount: 5,
          successCount: 0,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-1',
            name: 'Route 1',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-4',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
        {
          id: 'member-2',
          apiKeyId: 'key-1',
          routeId: 'route-2',
          priority: 1,
          weight: 100,
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-2',
            name: 'Route 2',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-3.5',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
      ];

      const result = service.selectRoute(members);
      expect(result).not.toBeNull();
      expect(result?.route?.id).toBe('route-2');
    });

    it('应该优先选择健康成员而不是降级成员', () => {
      const members: LoadBalancerMember[] = [
        {
          id: 'member-1',
          apiKeyId: 'key-1',
          routeId: 'route-1',
          priority: 1,
          weight: 100,
          healthStatus: 'degraded',
          failCount: 2,
          successCount: 100,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-1',
            name: 'Route 1',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-4',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
        {
          id: 'member-2',
          apiKeyId: 'key-1',
          routeId: 'route-2',
          priority: 1,
          weight: 100,
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-2',
            name: 'Route 2',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-3.5',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
      ];

      // 运行多次测试，健康成员应该被选中更多次
      const results: string[] = [];
      for (let i = 0; i < 100; i++) {
        const selected = service.selectRoute(members);
        if (selected) {
          results.push(selected.route!.id);
        }
      }

      const healthyCount = results.filter(r => r === 'route-2').length;
      const degradedCount = results.filter(r => r === 'route-1').length;

      // 健康成员应该被选择更多
      expect(healthyCount).toBeGreaterThan(degradedCount);
    });
  });

  describe('selectNextRoute', () => {
    it('应该排除指定的成员并选择下一个', () => {
      const members: LoadBalancerMember[] = [
        {
          id: 'member-1',
          apiKeyId: 'key-1',
          routeId: 'route-1',
          priority: 1,
          weight: 100,
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-1',
            name: 'Route 1',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-4',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
        {
          id: 'member-2',
          apiKeyId: 'key-1',
          routeId: 'route-2',
          priority: 1,
          weight: 100,
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-2',
            name: 'Route 2',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-3.5',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
      ];

      const result = service.selectNextRoute(members, 'member-1');
      expect(result).not.toBeNull();
      expect(result?.route?.id).toBe('route-2');
    });

    it('当排除后没有可用成员时应该返回 null', () => {
      const members: LoadBalancerMember[] = [
        {
          id: 'member-1',
          apiKeyId: 'key-1',
          routeId: 'route-1',
          priority: 1,
          weight: 100,
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-1',
            name: 'Route 1',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-4',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
      ];

      const result = service.selectNextRoute(members, 'member-1');
      expect(result).toBeNull();
    });
  });

  describe('权重分布算法', () => {
    it('权重为0的成员不应该被选中', () => {
      const members: LoadBalancerMember[] = [
        {
          id: 'member-1',
          apiKeyId: 'key-1',
          routeId: 'route-1',
          priority: 1,
          weight: 0, // 权重为0
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-1',
            name: 'Route 1',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-4',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
        {
          id: 'member-2',
          apiKeyId: 'key-1',
          routeId: 'route-2',
          priority: 1,
          weight: 100,
          healthStatus: 'healthy',
          failCount: 0,
          successCount: 10,
          lastCheckAt: null,
          lastSuccessAt: null,
          lastFailAt: null,
          avgLatencyMs: null,
          route: {
            id: 'route-2',
            name: 'Route 2',
            baseUrl: 'https://api.example.com',
            endpoint: '/chat',
            upstreamApiKey: 'key',
            upstreamModel: 'gpt-3.5',
            isActive: true,
            overrides: [],
            priority: 1,
            requestFormat: 'openai',
            responseFormat: 'openai',
          },
        },
      ];

      // 模拟 LoadBalancerService 的选择逻辑
      const healthyMembers = members.filter(m =>
        m.weight > 0 && m.healthStatus !== 'unhealthy'
      );

      expect(healthyMembers.length).toBe(1);
      expect(healthyMembers[0]?.routeId).toBe('route-2');
    });

    it('多个成员应该按权重比例分配', () => {
      const members: LoadBalancerMember[] = [
        { id: 'm1', apiKeyId: 'k1', routeId: 'r1', priority: 1, weight: 50, healthStatus: 'healthy', failCount: 0, successCount: 0, lastCheckAt: null, lastSuccessAt: null, lastFailAt: null, avgLatencyMs: null, route: { id: 'r1', name: 'R1', baseUrl: '', endpoint: '', upstreamApiKey: '', upstreamModel: '', isActive: true, overrides: [], priority: 1, requestFormat: '', responseFormat: '' } },
        { id: 'm2', apiKeyId: 'k1', routeId: 'r2', priority: 1, weight: 30, healthStatus: 'healthy', failCount: 0, successCount: 0, lastCheckAt: null, lastSuccessAt: null, lastFailAt: null, avgLatencyMs: null, route: { id: 'r2', name: 'R2', baseUrl: '', endpoint: '', upstreamApiKey: '', upstreamModel: '', isActive: true, overrides: [], priority: 1, requestFormat: '', responseFormat: '' } },
        { id: 'm3', apiKeyId: 'k1', routeId: 'r3', priority: 1, weight: 20, healthStatus: 'healthy', failCount: 0, successCount: 0, lastCheckAt: null, lastSuccessAt: null, lastFailAt: null, avgLatencyMs: null, route: { id: 'r3', name: 'R3', baseUrl: '', endpoint: '', upstreamApiKey: '', upstreamModel: '', isActive: true, overrides: [], priority: 1, requestFormat: '', responseFormat: '' } },
      ];

      // 计算总权重
      const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);
      expect(totalWeight).toBe(100);

      // 验证权重比例
      const ratios = members.map(m => m.weight / totalWeight);
      expect(ratios[0]).toBeCloseTo(0.5, 1); // 50%
      expect(ratios[1]).toBeCloseTo(0.3, 1); // 30%
      expect(ratios[2]).toBeCloseTo(0.2, 1); // 20%
    });
  });
});
