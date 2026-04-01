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

  selectRoute(members: LoadBalancerMember[]): RouteMatchWithLB | null {
    const eligibleMembers = this.healthyOnly
      ? members.filter((m) => m.healthStatus !== 'unhealthy')
      : members;

    if (eligibleMembers.length === 0) {
      return null;
    }

    const totalWeight = eligibleMembers.reduce((sum, m) => {
      if (m.healthStatus === 'degraded') {
        return sum + m.weight * 0.5;
      }
      return sum + m.weight;
    }, 0);

    if (totalWeight <= 0) {
      return eligibleMembers[0]?.route
        ? {
            route: eligibleMembers[0].route,
            memberId: eligibleMembers[0].id,
            weight: eligibleMembers[0].weight,
            healthStatus: eligibleMembers[0].healthStatus,
          }
        : null;
    }

    let random = Math.random() * totalWeight;

    for (const member of eligibleMembers) {
      const effectiveWeight =
        member.healthStatus === 'degraded' ? member.weight * 0.5 : member.weight;
      random -= effectiveWeight;
      if (random <= 0 && member.route) {
        return {
          route: member.route,
          memberId: member.id,
          weight: member.weight,
          healthStatus: member.healthStatus,
        };
      }
    }

    const fallback = eligibleMembers[0];
    return fallback?.route
      ? {
          route: fallback.route,
          memberId: fallback.id,
          weight: fallback.weight,
          healthStatus: fallback.healthStatus,
        }
      : null;
  }

  selectNextRoute(
    members: LoadBalancerMember[],
    excludeMemberId: string
  ): RouteMatchWithLB | null {
    const remainingMembers = members.filter((m) => m.id !== excludeMemberId);
    return this.selectRoute(remainingMembers);
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
