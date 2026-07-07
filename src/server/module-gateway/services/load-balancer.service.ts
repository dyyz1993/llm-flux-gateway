import { queryAll, queryFirst, queryRun } from '@server/shared/database';

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';

export interface LoadBalancerMember {
  id: string;
  apiKeyId: string;
  routeId: string;
  priority: number;
  weight: number;
  healthStatus: HealthStatus;
  failCount: number;
  successCount: number;
  lastCheckAt: number | null;
  lastSuccessAt: number | null;
  lastFailAt: number | null;
  avgLatencyMs: number | null;
  route?: {
    id: string;
    name: string;
    baseUrl: string;
    endpoint: string;
    upstreamApiKey: string;
    upstreamModel: string;
    isActive: boolean;
    overrides: any[];
    priority: number;
    requestFormat: string;
    responseFormat: string;
  };
}

export interface RouteMatchWithLB {
  route: LoadBalancerMember['route'];
  memberId: string;
  weight: number;
  healthStatus: HealthStatus;
}

const MAX_FAIL_COUNT = 3;
const HEALTH_RECOVERY_THRESHOLD = 0.8;

export class LoadBalancerService {
  private healthyOnly: boolean = true;

  setHealthyOnly(value: boolean): void {
    this.healthyOnly = value;
  }

  /**
   * 选择上游成员。
   *
   * 策略：优先级优先（不是负载均衡轮询）。
   * 优先选 priority 最高的健康成员（数值越小优先级越高），
   * 相同优先级下选健康的，只有高优先级的挂了才降级到低优先级。
   *
   * 这样同一个模型始终命中同一个上游 Key，缓存不碎片化。
   */
  selectRoute(members: LoadBalancerMember[]): RouteMatchWithLB | null {
    const eligible = members.filter((m) => m.healthStatus !== 'unhealthy');
    if (eligible.length === 0) return null;

    // 按优先级排序（越小越优先），相同优先级下健康优先于 degraded
    eligible.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      // 同优先级：healthy > degraded
      if (a.healthStatus !== b.healthStatus) {
        return a.healthStatus === 'healthy' ? -1 : 1;
      }
      return 0;
    });

    const chosen = eligible[0];
    return chosen?.route
      ? {
          route: chosen.route,
          memberId: chosen.id,
          weight: chosen.weight,
          healthStatus: chosen.healthStatus,
        }
      : null;
  }

  /**
   * 排除指定成员后重新选择（降级/重试用）
   */
  selectNextRoute(
    members: LoadBalancerMember[],
    excludeMemberId: string
  ): RouteMatchWithLB | null {
    const remaining = members.filter((m) => m.id !== excludeMemberId);
    return this.selectRoute(remaining);
  }

  async markSuccess(memberId: string, latencyMs: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    const member = queryFirst<any>(
      `SELECT fail_count, success_count, avg_latency_ms FROM api_key_routes WHERE id = ?`,
      [memberId]
    );

    if (!member) return;

    const newSuccessCount = (member.success_count || 0) + 1;
    const newFailCount = 0;

    let newAvgLatency = latencyMs;
    if (member.avg_latency_ms && member.success_count > 0) {
      newAvgLatency = Math.round(
        (member.avg_latency_ms * member.success_count + latencyMs) / newSuccessCount
      );
    }

    let newHealthStatus: HealthStatus = 'healthy';
    if (member.fail_count >= MAX_FAIL_COUNT) {
      const successRate = newSuccessCount / (newSuccessCount + member.fail_count);
      if (successRate >= HEALTH_RECOVERY_THRESHOLD) {
        newHealthStatus = 'healthy';
      } else {
        newHealthStatus = 'degraded';
      }
    }

    queryRun(
      `
      UPDATE api_key_routes
      SET health_status = ?,
          fail_count = ?,
          success_count = ?,
          last_check_at = ?,
          last_success_at = ?,
          avg_latency_ms = ?
      WHERE id = ?
      `,
      [newHealthStatus, newFailCount, newSuccessCount, now, now, newAvgLatency, memberId]
    );

    console.log(`[LoadBalancer] Marked success for member ${memberId}, latency: ${latencyMs}ms`);
  }

  async markFailure(memberId: string, errorMessage?: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    const member = queryFirst<any>(
      `SELECT fail_count, success_count FROM api_key_routes WHERE id = ?`,
      [memberId]
    );

    if (!member) return;

    const newFailCount = (member.fail_count || 0) + 1;

    let newHealthStatus: HealthStatus = 'healthy';
    if (newFailCount >= MAX_FAIL_COUNT) {
      newHealthStatus = 'unhealthy';
    } else if (newFailCount >= 1) {
      newHealthStatus = 'degraded';
    }

    queryRun(
      `
      UPDATE api_key_routes
      SET health_status = ?,
          fail_count = ?,
          last_check_at = ?,
          last_fail_at = ?
      WHERE id = ?
      `,
      [newHealthStatus, newFailCount, now, now, memberId]
    );

    console.log(
      `[LoadBalancer] Marked failure for member ${memberId}, fail_count: ${newFailCount}, status: ${newHealthStatus}${errorMessage ? `, error: ${errorMessage}` : ''}`
    );
  }

  async updateWeight(memberId: string, weight: number): Promise<boolean> {
    if (weight < 0 || weight > 1000) {
      console.error(`[LoadBalancer] Invalid weight: ${weight}`);
      return false;
    }

    const result = queryRun(
      `UPDATE api_key_routes SET weight = ? WHERE id = ?`,
      [weight, memberId]
    );

    return result.changes > 0;
  }

  async getMembersByKeyId(apiKeyId: string): Promise<LoadBalancerMember[]> {
    const rows = queryAll<any>(
      `
      SELECT
        kr.id,
        kr.api_key_id,
        kr.route_id,
        kr.priority,
        kr.weight,
        kr.health_status,
        kr.fail_count,
        kr.success_count,
        kr.last_check_at,
        kr.last_success_at,
        kr.last_fail_at,
        kr.avg_latency_ms
      FROM api_key_routes kr
      WHERE kr.api_key_id = ?
      ORDER BY kr.priority ASC
      `,
      [apiKeyId]
    );

    return rows.map((row) => ({
      id: row.id,
      apiKeyId: row.api_key_id,
      routeId: row.route_id,
      priority: row.priority,
      weight: row.weight ?? 100,
      healthStatus: (row.health_status as HealthStatus) ?? 'healthy',
      failCount: row.fail_count ?? 0,
      successCount: row.success_count ?? 0,
      lastCheckAt: row.last_check_at,
      lastSuccessAt: row.last_success_at,
      lastFailAt: row.last_fail_at,
      avgLatencyMs: row.avg_latency_ms,
    }));
  }

  async resetHealthStatus(memberId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    queryRun(
      `
      UPDATE api_key_routes
      SET health_status = 'healthy',
          fail_count = 0,
          last_check_at = ?
      WHERE id = ?
      `,
      [now, memberId]
    );

    console.log(`[LoadBalancer] Reset health status for member ${memberId}`);
  }

  getHealthStats(members: LoadBalancerMember[]): {
    healthy: number;
    degraded: number;
    unhealthy: number;
    total: number;
  } {
    return {
      healthy: members.filter((m) => m.healthStatus === 'healthy').length,
      degraded: members.filter((m) => m.healthStatus === 'degraded').length,
      unhealthy: members.filter((m) => m.healthStatus === 'unhealthy').length,
      total: members.length,
    };
  }
}

export const loadBalancerService = new LoadBalancerService();
