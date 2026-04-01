import { routeMatcherService, type RouteMatchWithLBInfo } from './route-matcher.service';
import { loadBalancerService } from './load-balancer.service';
import { rewriteService } from './rewrite.service';
import { upstreamService } from './upstream.service';
import type { ApiFormat } from '../../module-protocol-transpiler';

export interface LBRequestContext {
  requestedModel: string;
  apiKeyId: string;
  internalRequest: any;
  targetFormat: ApiFormat;
  sourceFormat: ApiFormat;
}

export interface LBRouteSelection {
  match: RouteMatchWithLBInfo;
  upstreamRequest: {
    url: string;
    body: any;
  };
}

export interface LBExecutionResult {
  success: boolean;
  response?: any;
  error?: string;
  memberId?: string;
  latencyMs?: number;
}

const MAX_RETRY_ATTEMPTS = 3;

export class LoadBalancerExecutor {
  async selectRoute(ctx: LBRequestContext): Promise<LBRouteSelection | null> {
    const allMatches = await routeMatcherService.findAllMatches(
      ctx.requestedModel,
      ctx.apiKeyId
    );

    if (allMatches.length === 0) {
      return null;
    }

    const members = allMatches.map((m) => ({
      id: m.lbMemberId || '',
      apiKeyId: ctx.apiKeyId,
      routeId: m.route.id,
      priority: m.route.priority,
      weight: m.lbWeight || 100,
      healthStatus: m.lbHealthStatus || 'healthy',
      failCount: 0,
      successCount: 0,
      lastCheckAt: null,
      lastSuccessAt: null,
      lastFailAt: null,
      avgLatencyMs: null,
      route: m.route,
    }));

    const selected = loadBalancerService.selectRoute(members);
    if (!selected) {
      return null;
    }

    const selectedMatch = allMatches.find((m) => m.lbMemberId === selected.memberId);
    if (!selectedMatch) {
      return null;
    }

    const rewriteResult = rewriteService.applyRules(
      ctx.internalRequest,
      selectedMatch.route.overrides
    );

    const upstreamRequest = rewriteService.buildUpstreamRequest(
      rewriteResult.rewrittenRequest as Record<string, any>,
      selectedMatch.route
    );

    return {
      match: selectedMatch,
      upstreamRequest,
    };
  }

  async executeWithRetry(
    ctx: LBRequestContext,
    onProgress?: (attempt: number, routeName: string) => void
  ): Promise<LBExecutionResult> {
    const allMatches = await routeMatcherService.findAllMatches(
      ctx.requestedModel,
      ctx.apiKeyId
    );

    if (allMatches.length === 0) {
      return {
        success: false,
        error: `No matching route found for model: ${ctx.requestedModel}`,
      };
    }

    const members = allMatches.map((m) => ({
      id: m.lbMemberId || '',
      apiKeyId: ctx.apiKeyId,
      routeId: m.route.id,
      priority: m.route.priority,
      weight: m.lbWeight || 100,
      healthStatus: m.lbHealthStatus || 'healthy',
      failCount: 0,
      successCount: 0,
      lastCheckAt: null,
      lastSuccessAt: null,
      lastFailAt: null,
      avgLatencyMs: null,
      route: m.route,
    }));

    const triedMembers = new Set<string>();
    let lastError: string | undefined;

    for (let attempt = 0; attempt < Math.min(MAX_RETRY_ATTEMPTS, members.length); attempt++) {
      const availableMembers = members.filter((m) => !triedMembers.has(m.id));
      if (availableMembers.length === 0) {
        break;
      }

      const selected = loadBalancerService.selectRoute(availableMembers);
      if (!selected) {
        break;
      }

      triedMembers.add(selected.memberId);

      const selectedMatch = allMatches.find((m) => m.lbMemberId === selected.memberId);
      if (!selectedMatch) {
        continue;
      }

      onProgress?.(attempt + 1, selectedMatch.route.name);

      const rewriteResult = rewriteService.applyRules(
        ctx.internalRequest,
        selectedMatch.route.overrides
      );

      const upstreamRequest = rewriteService.buildUpstreamRequest(
        rewriteResult.rewrittenRequest as Record<string, any>,
        selectedMatch.route
      );

      const startTime = Date.now();

      try {
        const response = await upstreamService.request({
          url: upstreamRequest.url,
          apiKey: selectedMatch.route.upstreamApiKey,
          body: upstreamRequest.body,
        });

        const latencyMs = Date.now() - startTime;

        if (selected.memberId) {
          await loadBalancerService.markSuccess(selected.memberId, latencyMs);
        }

        return {
          success: true,
          response,
          memberId: selected.memberId,
          latencyMs,
        };
      } catch (error: any) {
        lastError = error.message || 'Request failed';

        if (selected.memberId) {
          await loadBalancerService.markFailure(selected.memberId, lastError);
        }

        console.warn(
          `[LoadBalancer] Attempt ${attempt + 1} failed for route ${selectedMatch.route.name}:`,
          lastError
        );
      }
    }

    return {
      success: false,
      error: lastError || 'All routes failed',
    };
  }

  async *executeStreamWithRetry(
    ctx: LBRequestContext,
    onProgress?: (attempt: number, routeName: string) => void
  ): AsyncGenerator<any, void, unknown> {
    const allMatches = await routeMatcherService.findAllMatches(
      ctx.requestedModel,
      ctx.apiKeyId
    );

    if (allMatches.length === 0) {
      throw new Error(`No matching route found for model: ${ctx.requestedModel}`);
    }

    const members = allMatches.map((m) => ({
      id: m.lbMemberId || '',
      apiKeyId: ctx.apiKeyId,
      routeId: m.route.id,
      priority: m.route.priority,
      weight: m.lbWeight || 100,
      healthStatus: m.lbHealthStatus || 'healthy',
      failCount: 0,
      successCount: 0,
      lastCheckAt: null,
      lastSuccessAt: null,
      lastFailAt: null,
      avgLatencyMs: null,
      route: m.route,
    }));

    const triedMembers = new Set<string>();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < Math.min(MAX_RETRY_ATTEMPTS, members.length); attempt++) {
      const availableMembers = members.filter((m) => !triedMembers.has(m.id));
      if (availableMembers.length === 0) {
        break;
      }

      const selected = loadBalancerService.selectRoute(availableMembers);
      if (!selected) {
        break;
      }

      triedMembers.add(selected.memberId);

      const selectedMatch = allMatches.find((m) => m.lbMemberId === selected.memberId);
      if (!selectedMatch) {
        continue;
      }

      onProgress?.(attempt + 1, selectedMatch.route.name);

      const rewriteResult = rewriteService.applyRules(
        ctx.internalRequest,
        selectedMatch.route.overrides
      );

      const upstreamRequest = rewriteService.buildUpstreamRequest(
        rewriteResult.rewrittenRequest as Record<string, any>,
        selectedMatch.route
      );

      const startTime = Date.now();
      let hasYielded = false;

      try {
        const stream = upstreamService.streamRequest({
          url: upstreamRequest.url,
          apiKey: selectedMatch.route.upstreamApiKey,
          body: upstreamRequest.body,
        });

        for await (const chunk of stream) {
          hasYielded = true;
          yield {
            chunk,
            memberId: selected.memberId,
            routeName: selectedMatch.route.name,
          };
        }

        if (hasYielded && selected.memberId) {
          const latencyMs = Date.now() - startTime;
          await loadBalancerService.markSuccess(selected.memberId, latencyMs);
        }

        return;
      } catch (error: any) {
        lastError = error;

        if (selected.memberId) {
          await loadBalancerService.markFailure(selected.memberId, error.message);
        }

        console.warn(
          `[LoadBalancer] Stream attempt ${attempt + 1} failed for route ${selectedMatch.route.name}:`,
          error.message
        );

        if (!hasYielded) {
          continue;
        } else {
          throw error;
        }
      }
    }

    throw lastError || new Error('All routes failed for streaming request');
  }
}

export const loadBalancerExecutor = new LoadBalancerExecutor();
