/**
 * 输入适配器注册表
 */
import { openaiToPiContext } from './openai.adapter';
import { anthropicToPiContext } from './anthropic.adapter';
import { geminiToPiContext } from './gemini.adapter';

export type SourceFormat = 'openai' | 'anthropic' | 'gemini';

export interface InputAdapter {
  toPiContext(body: Record<string, any>): {
    context: import('@earendil-works/pi-ai').Context;
    options: Record<string, any>;
  };
}

const registry: Partial<Record<SourceFormat, InputAdapter>> = {
  openai: { toPiContext: openaiToPiContext },
  anthropic: { toPiContext: anthropicToPiContext },
  gemini: { toPiContext: geminiToPiContext },
};

export function getInputAdapter(format: SourceFormat): InputAdapter {
  const adapter = registry[format];
  if (!adapter) {
    throw new Error(`No input adapter registered for format: ${format}`);
  }
  return adapter;
}

export function registerInputAdapter(format: SourceFormat, adapter: InputAdapter): void {
  registry[format] = adapter;
}
