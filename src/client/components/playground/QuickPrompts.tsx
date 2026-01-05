import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';
import type { QuickPrompt } from '@shared/types';

interface QuickPromptsProps {
  onSelectPrompt: (prompt: string) => void;
  disabled?: boolean;
}

/**
 * Predefined quick prompts for testing tools
 */
const QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'weather',
    label: '🌤️ Weather Test',
    prompt: 'What is the current weather in San Francisco? Use the weather tool.',
    description: 'Test weather API tool',
    category: 'tools',
  },
  {
    id: 'calculator',
    label: '🔢 Calculator Test',
    prompt: 'Calculate 234 * 567 + 891 using the calculator tool.',
    description: 'Test calculator tool',
    category: 'tools',
  },
  {
    id: 'search',
    label: '🔍 Search Test',
    prompt: 'Search for information about the latest developments in quantum computing.',
    description: 'Test search tool',
    category: 'tools',
  },
  {
    id: 'multi-tool',
    label: '🛠️ Multi-Tool Test',
    prompt: 'Check the weather in New York, then calculate 15% of 2500, and finally search for Python programming tips.',
    description: 'Test multiple tools in one request',
    category: 'tools',
  },
  {
    id: 'creative',
    label: '✨ Creative Writing',
    prompt: 'Write a short haiku about artificial intelligence.',
    description: 'Test creative capabilities',
    category: 'general',
  },
  {
    id: 'code',
    label: '💻 Code Generation',
    prompt: 'Write a TypeScript function to validate email addresses using regex.',
    description: 'Test code generation',
    category: 'general',
  },
  {
    id: 'explain',
    label: '📚 Explanation',
    prompt: 'Explain the difference between OAuth 1.0 and OAuth 2.0 in simple terms.',
    description: 'Test explanation capabilities',
    category: 'general',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All Prompts' },
  { id: 'tools', label: '🛠️ Tool Tests' },
  { id: 'general', label: '💬 General' },
];

/**
 * Quick prompts panel for one-click prompt testing
 */
export const QuickPrompts: React.FC<QuickPromptsProps> = ({ onSelectPrompt, disabled }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredPrompts = selectedCategory === 'all'
    ? QUICK_PROMPTS
    : QUICK_PROMPTS.filter(p => p.category === selectedCategory);

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-lg font-bold transition-all ${
          disabled
            ? 'bg-[#1a1a1a] text-gray-600 cursor-not-allowed'
            : 'bg-[#1a1a1a] hover:bg-[#222] text-gray-400 border border-[#262626]'
        }`}
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-500" />
          <span className="text-sm">Quick Prompts</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronUp className="w-4 h-4" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 p-4 bg-[#111] border border-[#262626] rounded-lg">
          {/* Category Filter */}
          <div className="flex gap-2 mb-4 pb-3 border-b border-[#262626]">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#1a1a1a] text-gray-500 hover:text-gray-400'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Prompts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredPrompts.map(prompt => (
              <button
                key={prompt.id}
                onClick={() => {
                  onSelectPrompt(prompt.prompt);
                  setIsExpanded(false);
                }}
                disabled={disabled}
                className="text-left p-3 bg-[#0a0a0a] border border-[#333] hover:border-indigo-600 hover:bg-[#151515] rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="text-sm font-medium text-white group-hover:text-indigo-400 transition-colors">
                  {prompt.label}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {prompt.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
