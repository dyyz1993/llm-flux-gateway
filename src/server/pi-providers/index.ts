/**
 * pi-ai Provider 注册表
 *
 * 将网关的路由配置映射为 pi-ai 的 Provider/Model，使网关控制器
 * 可以通过 `models.stream(model, context)` 统一调用任意上游。
 *
 * 每个路由 = 一个 pi-ai Provider = 一个或多个 Model
 */
import {
  createModels,
  createProvider,
  type MutableModels,
  type Model,
  type Api,
} from '@earendil-works/pi-ai';

// api 实现采用懒加载，只在第一次使用时加载
import type { ProviderStreams } from '@earendil-works/pi-ai';

// ============================================================
// Types
// ============================================================

export interface PiRouteConfig {
  id: string;
  name: string;
  baseUrl: string;
  /** pi-ai API 类型: 'openai-completions' | 'anthropic-messages' | 'google-generative-ai' | ... */
  apiType: Api;
  upstreamModel: string;
  apiKey: string;
  /** 客户端返回格式: 'openai' | 'anthropic' | 'gemini' */
  responseFormat: string;
}

// ============================================================
// pi-ai Models 集合（全局单例）
// ============================================================

let modelsInstance: MutableModels | null = null;

function getModels(): MutableModels {
  if (!modelsInstance) {
    modelsInstance = createModels();
  }
  return modelsInstance;
}

// ============================================================
// 已注册的 API 实现缓存（懒加载）
// ============================================================

const apiCache = new Map<string, ProviderStreams>();

async function getApiImpl(apiType: string): Promise<ProviderStreams> {
  if (!apiCache.has(apiType)) {
    switch (apiType) {
      case 'openai-completions': {
        const mod = await import('@earendil-works/pi-ai/api/openai-completions.lazy');
        apiCache.set(apiType, mod.openAICompletionsApi());
        break;
      }
      case 'openai-responses': {
        const mod = await import('@earendil-works/pi-ai/api/openai-responses.lazy');
        apiCache.set(apiType, mod.openAIResponsesApi());
        break;
      }
      case 'anthropic-messages': {
        const mod = await import('@earendil-works/pi-ai/api/anthropic-messages.lazy');
        apiCache.set(apiType, mod.anthropicMessagesApi());
        break;
      }
      case 'google-generative-ai': {
        const mod = await import('@earendil-works/pi-ai/api/google-generative-ai.lazy');
        apiCache.set(apiType, mod.googleGenerativeAIApi());
        break;
      }
      default:
        // 默认用 openai-completions（兼容大多数厂商）
        const fallbackMod = await import('@earendil-works/pi-ai/api/openai-completions.lazy');
        apiCache.set(apiType, fallbackMod.openAICompletionsApi());
    }
  }
  return apiCache.get(apiType)!;
}

// ============================================================
// 推断 API 类型
// ============================================================

export function inferApiType(baseUrl: string, endpoint: string): Api {
  const url = (baseUrl + endpoint).toLowerCase();
  if (url.includes('anthropic') || url.includes('claude')) return 'anthropic-messages' as Api;
  if (url.includes('google') || url.includes('gemini')) return 'google-generative-ai' as Api;
  return 'openai-completions' as Api;
}

export function inferResponseFormat(apiType: string): string {
  switch (apiType) {
    case 'anthropic-messages': return 'anthropic';
    case 'google-generative-ai': return 'gemini';
    default: return 'openai';
  }
}

// ============================================================
// 注册一个路由为 pi-ai Provider
// ============================================================

export async function registerPiRoute(config: PiRouteConfig): Promise<Model<Api>> {
  const models = getModels();
  const apiImpl = await getApiImpl(config.apiType);

  // 构建 pi-ai Model
  // 构建 pi-ai Model，带上 compat 配置
  // 不同 API 类型有不同默认行为，需要设置 compat 避免上游拒绝
  const baseCompat = config.apiType === 'openai-completions'
    ? {
        supportsStore: false,
        supportsDeveloperRole: false,
        maxTokensField: 'max_tokens' as const,
        supportsReasoningEffort: false,
      }
    : undefined;

  const piModel: Model<Api> = {
    id: config.upstreamModel,
    name: config.upstreamModel,
    api: config.apiType as Api,
    provider: config.id,
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
    ...(baseCompat ? { compat: baseCompat } : {}),
  } as Model<Api>;

  // 创建 pi-ai Provider
  // API Key 通过 stream/complete 的 options.apiKey 传入，
  // 所以 provider 的 auth resolver 只需要返回"已配置"状态
  const provider = createProvider({
    id: config.id,
    name: config.name,
    baseUrl: config.baseUrl,
    auth: {
      apiKey: {
        name: config.name,
        resolve: async () => ({ auth: {} }),
      },
    },
    models: [piModel],
    api: apiImpl,
  });

  models.setProvider(provider);
  return piModel;
}

// ============================================================
// 获取已注册的 Model
// ============================================================

export function getPiModel(providerId: string, modelId: string): Model<Api> | undefined {
  return getModels().getModel(providerId, modelId);
}

export function getModelsInstance(): MutableModels {
  return getModels();
}

// ============================================================
// 路由格式映射
// ============================================================

/**
 * 将网关注册表格式映射到 pi-ai API 类型
 */
const formatToApi: Record<string, string> = {
  'openai': 'openai-completions',
  'openai-responses': 'openai-responses',
  'anthropic': 'anthropic-messages',
  'gemini': 'google-generative-ai',
  // GLM 使用 OpenAI 兼容的 /chat/completions 端点
  'glm': 'openai-completions',
};

export function mapRequestFormatToApi(format: string): string {
  return formatToApi[format] ?? 'openai-completions';
}
