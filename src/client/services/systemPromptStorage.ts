import type { SystemPreset, SystemPromptStorage as SystemPromptStorageType } from '@shared/types';

const STORAGE_KEY = 'llm-flux-gateway:system-prompt';

/**
 * Built-in system prompt presets
 */
export const BUILTIN_PRESETS: SystemPreset[] = [
  {
    id: 'general',
    name: '通用助手',
    category: 'general',
    description: '友好、专业的通用 AI 助手',
    content: '你是一个友好、专业的 AI 助手。请用清晰、简洁的语言回答问题。如果不确定，请诚实说明。',
  },
  {
    id: 'coding',
    name: '编程专家',
    category: 'coding',
    description: '专业的编程和技术问题助手',
    content: '你是一个资深的软件工程师和编程专家。请提供准确、实用的代码示例和技术建议。代码应遵循最佳实践，包含必要的注释。当出现错误时，请帮助诊断和解决问题。',
  },
  {
    id: 'creative',
    name: '创意写作',
    category: 'creative',
    description: '富有创造力的写作助手',
    content: '你是一个富有创造力的写作助手。请用生动、有趣的语言进行创作。鼓励创新思维，提供独特的观点和想法。',
  },
  {
    id: 'analysis',
    name: '数据分析',
    category: 'analysis',
    description: '专业的数据分析和洞察助手',
    content: '你是一个专业的数据分析师。请提供深入的数据洞察、趋势分析和可行的建议。使用清晰的数据可视化建议，并解释分析方法的局限性。',
  },
  {
    id: 'tools-expert',
    name: 'Tools 专家',
    category: 'general',
    description: '优先使用可用工具来完成任务',
    content: '你是一个善于使用工具的 AI 助手。在回答问题前，先评估是否可以使用可用的工具来获取更准确的信息。优先使用工具查询实时数据、进行计算或执行其他操作，然后基于工具返回的结果给出答案。',
  },
  {
    id: 'concise',
    name: '简洁回答',
    category: 'general',
    description: '简短精炼的回答风格',
    content: '请用最简洁的语言回答问题。直接给出核心答案，避免冗长的解释。使用要点列表时保持精简。',
  },
];

/**
 * System prompt localStorage service
 */
export class SystemPromptStorage {
  static DEFAULT_STORAGE: SystemPromptStorageType = {
    enabled: false,
    customPrompt: '',
    selectedPresetId: null,
    customPresets: [],
  };

  /**
   * Get system prompt settings from localStorage
   */
  static get(): SystemPromptStorageType {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? { ...this.DEFAULT_STORAGE, ...JSON.parse(data) } : { ...this.DEFAULT_STORAGE };
    } catch {
      return { ...this.DEFAULT_STORAGE };
    }
  }

  /**
   * Save system prompt settings to localStorage
   */
  static save(settings: SystemPromptStorageType): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save system prompt settings:', e);
    }
  }

  /**
   * Get the effective system prompt content
   */
  static getEffectivePrompt(): string | null {
    const settings = this.get();
    if (!settings.enabled) return null;

    // Use preset if selected
    if (settings.selectedPresetId) {
      const allPresets = [...BUILTIN_PRESETS, ...settings.customPresets];
      const preset = allPresets.find(p => p.id === settings.selectedPresetId);
      if (preset) return preset.content;
    }

    // Use custom prompt if provided
    if (settings.customPrompt) return settings.customPrompt;

    return null;
  }

  /**
   * Update settings
   */
  static updateSettings(updates: Partial<SystemPromptStorage>): void {
    const current = this.get();
    const updated = { ...current, ...updates };
    this.save(updated);
  }

  /**
   * Add a custom preset
   */
  static addCustomPreset(preset: Omit<SystemPreset, 'id'>): SystemPreset {
    const settings = this.get();
    const newPreset: SystemPreset = {
      ...preset,
      id: `custom-${Date.now()}`,
    };
    settings.customPresets.push(newPreset);
    this.save(settings);
    return newPreset;
  }

  /**
   * Delete a custom preset
   */
  static deleteCustomPreset(presetId: string): void {
    const settings = this.get();
    settings.customPresets = settings.customPresets.filter(p => p.id !== presetId);
    if (settings.selectedPresetId === presetId) {
      settings.selectedPresetId = null;
    }
    this.save(settings);
  }

  /**
   * Update a custom preset
   */
  static updateCustomPreset(presetId: string, updates: Partial<Omit<SystemPreset, 'id'>>): void {
    const settings = this.get();
    const index = settings.customPresets.findIndex(p => p.id === presetId);
    if (index !== -1) {
      settings.customPresets[index] = { ...settings.customPresets[index], ...updates } as SystemPreset;
      this.save(settings);
    }
  }
}
