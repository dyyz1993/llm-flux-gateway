import { Vendor } from '@shared/types';
import { ApiFormat } from '@server/module-protocol-transpiler';

/**
 * Find vendor by model ID from vendors list
 */
export function findVendorByModel(modelId: string, vendors: Vendor[]): Vendor | undefined {
  if (!modelId || !vendors.length) return undefined;

  for (const vendor of vendors) {
    if (vendor.models?.some(m => m.modelId === modelId)) {
      return vendor;
    }
  }
  return undefined;
}

/**
 * Get protocol format display information
 */
export function getProtocolInfo(format: ApiFormat | undefined) {
  const infoMap: Record<string, { displayName: string; color: string; bgColor: string; textColor: string; borderColor: string }> = {
    openai: { displayName: 'OpenAI', color: '#10a37f', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-400', borderColor: 'border-emerald-500/20' },
    anthropic: { displayName: 'Anthropic', color: '#d97757', bgColor: 'bg-orange-500/10', textColor: 'text-orange-400', borderColor: 'border-orange-500/20' },
    gemini: { displayName: 'Gemini', color: '#4285f4', bgColor: 'bg-blue-500/10', textColor: 'text-blue-400', borderColor: 'border-blue-500/20' },
  };

  return infoMap[format || 'openai'] || infoMap.openai;
}

/**
 * Helper to split messages into Context (Input) and Response (Output)
 * Logic: The last message is the response if it's from Assistant.
 */
export function getMessageSplit(log: { messages: unknown[] }) {
  const msgs = [...log.messages];
  if (msgs.length === 0) {
    return { input: [], output: null };
  }
  const last = msgs[msgs.length - 1];
  if (last && typeof last === 'object' && 'role' in last && last.role === 'assistant') {
    return { input: msgs.slice(0, -1), output: last };
  }
  return { input: msgs, output: null };
}
