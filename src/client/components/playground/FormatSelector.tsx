import React from 'react';
import { Code2 } from 'lucide-react';

/**
 * Supported API formats
 */
export type ApiFormat = 'openai' | 'anthropic' | 'gemini';

/**
 * Format selector state
 */
export interface FormatSelectorValue {
  format: ApiFormat;
}

/**
 * Props for FormatSelector component
 */
export interface FormatSelectorProps {
  value: ApiFormat;
  onChange: (format: ApiFormat) => void;
  disabled?: boolean;
}

/**
 * Format display info
 */
const FORMAT_INFO: Record<ApiFormat, { label: string; description: string; color: string }> = {
  openai: {
    label: 'OpenAI',
    description: 'Standard messages format with role/content',
    color: 'text-emerald-400',
  },
  anthropic: {
    label: 'Anthropic',
    description: 'System prompt as separate field, content blocks',
    color: 'text-orange-400',
  },
  gemini: {
    label: 'Gemini',
    description: 'Contents/parts structure',
    color: 'text-blue-400',
  },
};

/**
 * FormatSelector Component
 *
 * A compact selector for choosing the API request format.
 * Displays the current format with a description and allows switching.
 */
export const FormatSelector: React.FC<FormatSelectorProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const currentInfo = FORMAT_INFO[value];

  return (
    <div className="flex items-center gap-3">
      {/* Label */}
      <label className="text-xs text-gray-500 font-semibold uppercase">
        Format
      </label>

      {/* Format Select */}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as ApiFormat)}
          disabled={disabled}
          className={`bg-[#111] border text-sm px-3 py-1.5 pr-8 rounded-md focus:border-indigo-500 focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-[#333] ${currentInfo.color}`}
        >
          {(Object.entries(FORMAT_INFO) as [ApiFormat, typeof FORMAT_INFO[ApiFormat]][]).map(
            ([format, info]) => (
              <option key={format} value={format}>
                {info.label}
              </option>
            )
          )}
        </select>
      </div>

      {/* Description */}
      <span className="text-xs text-gray-500">{currentInfo.description}</span>

      {/* Icon */}
      <Code2 className="w-4 h-4 text-gray-600" />
    </div>
  );
};
