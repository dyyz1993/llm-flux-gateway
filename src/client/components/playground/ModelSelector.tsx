import React, { useMemo, useEffect } from 'react';
import { Terminal, AlertCircle } from 'lucide-react';
import { WildcardInput } from '@client/components/ui/WildcardInput';
import { parseWildcardPattern, matchesWildcardPattern } from '@client/utils/wildcardUtils';

/**
 * Model selection state
 */
export interface ModelSelectorValue {
  selectedKeyId: string;
  selectedModel: string;
}

/**
 * Props for the ModelSelector component
 *
 * This is a pure presentational component that receives all data through props.
 * The parent component is responsible for:
 * - Fetching data from stores
 * - Computing available models and patterns for the selected key
 * - Handling business logic (auto-selection, etc.)
 */
export interface ModelSelectorProps {
  // ========== Data Inputs (from parent) ==========

  /** Available API keys for selection */
  availableKeys: Array<{
    id: string;
    name: string;
    /** Display hint (optional) */
    hint?: string;
  }>;

  /** Available models for the currently selected key (for dropdown) */
  availableModels: string[];

  /** Validation patterns for the currently selected key */
  patterns: string[];

  // ========== Value & Callbacks ==========

  /** Current selection value */
  value: ModelSelectorValue;

  /** Callback when selection changes */
  onChange: (value: ModelSelectorValue) => void;

  /** Callback when validation state changes */
  onValidationChange?: (isValid: boolean, error?: string) => void;

  // ========== Other Props ==========

  /** Disable the selector */
  disabled?: boolean;

  /** CSS class name */
  className?: string;
}

/**
 * ModelSelector Component
 *
 * A pure, reusable component that combines API Key selection with Model input.
 *
 * Responsibilities:
 * - Render UI for key selection and model input
 * - Validate model against provided patterns
 * - Call onChange/onValidationChange callbacks
 *
 * NOT responsible for:
 * - Fetching data (parent provides data via props)
 * - Computing available models (parent computes based on selected key)
 * - Auto-selection logic (parent handles business logic)
 *
 * Usage:
 * ```tsx
 * <ModelSelector
 *   availableKeys={keys}
 *   availableModels={computeModels(selectedKey)}
 *   patterns={computePatterns(selectedKey)}
 *   value={{ selectedKeyId, selectedModel }}
 *   onChange={handleChange}
 *   onValidationChange={handleValidationChange}
 * />
 * ```
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  availableKeys,
  availableModels = [], // Default to empty array
  patterns = [], // Default to empty array
  value,
  onChange,
  onValidationChange,
  disabled = false,
  className = '',
}) => {
  // ========== Validation ==========

  const validateModel = (model: string): { isValid: boolean; error?: string } => {
    const trimmedModel = model.trim();

    // Empty model is invalid
    if (!trimmedModel) {
      return { isValid: false, error: 'Please select or enter a model name' };
    }

    // Check for wildcard-all (*) - allows any input
    if (patterns.includes('*')) {
      return { isValid: true };
    }

    // Validate against patterns
    const parsedPatterns = patterns.map(parseWildcardPattern);
    const matchesAny = parsedPatterns.some(p => matchesWildcardPattern(trimmedModel, p));

    if (!matchesAny) {
      const patternDesc = patterns.length > 0 ? patterns.join(', ') : 'any model';
      return {
        isValid: false,
        error: `Model "${trimmedModel}" does not match allowed patterns: ${patternDesc}`,
      };
    }

    return { isValid: true };
  };

  // Update validation state when model or patterns change
  useEffect(() => {
    if (onValidationChange) {
      const { isValid, error } = validateModel(value.selectedModel);
      // Only pass error parameter when it exists
      if (error) {
        onValidationChange(isValid, error);
      } else {
        onValidationChange(isValid);
      }
    }
  }, [value.selectedModel, patterns, onValidationChange]);

  // ========== Event Handlers ==========

  const handleKeyChange = (keyId: string) => {
    onChange({
      selectedKeyId: keyId,
      selectedModel: '',  // Reset model when key changes (parent will handle auto-selection if needed)
    });
  };

  const handleModelChange = (model: string) => {
    onChange({
      ...value,
      selectedModel: model,
    });
  };

  // ========== Hint Text ==========

  const hintText = useMemo(() => {
    if (patterns.length === 0) return null;

    // Wildcard-all (*) - any model allowed
    if (patterns.includes('*')) {
      return 'Any model can be used. The gateway will route requests based on your key configuration.';
    }

    // Prefix wildcards (gpt-*, etc)
    if (patterns.some(p => p.includes('*') && p !== '*')) {
      return 'The gateway will match this to configured route overrides and rewrite as needed.';
    }

    // Exact mode (no wildcards)
    return 'The gateway will route requests for these specific models.';
  }, [patterns]);

  // ========== Computed Values ==========

  const validation = useMemo(() => validateModel(value.selectedModel), [value.selectedModel, patterns]);
  const activeKeys = availableKeys; // Parent should filter active keys

  // ========== Render ==========

  return (
    <div className={`model-selector ${className}`}>
      {/* API Key Selection */}
      <div className="mb-4">
        <label htmlFor="api-key-select" className="text-xs text-gray-500 font-semibold uppercase">
          API Key
        </label>
        <div className="mt-1 relative">
          <select
            id="api-key-select"
            value={value.selectedKeyId}
            onChange={(e) => handleKeyChange(e.target.value)}
            disabled={disabled}
            className="w-full bg-[#111] border text-white text-sm px-3 py-2 pr-10 rounded-md focus:border-indigo-500 focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-[#333]"
          >
            {activeKeys.length === 0 && (
              <option value="">No active keys</option>
            )}
            {activeKeys.map(k => (
              <option key={k.id} value={k.id}>
                {k.name}
                {k.hint ? ` (${k.hint})` : ''}
              </option>
            ))}
          </select>
          <Terminal className="absolute right-3 top-2.5 w-4 h-4 text-gray-500 pointer-events-none" />
        </div>
        {activeKeys.length === 0 && (
          <p className="text-[10px] text-amber-500 mt-1">
            ⚠ No active API keys. Go to Access Keys to create one.
          </p>
        )}
      </div>

      {/* Model Selection */}
      <div>
        <WildcardInput
          options={availableModels}
          value={value.selectedModel}
          patterns={patterns}
          onChange={handleModelChange}
          disabled={disabled}
          label="Model"
        />
        {hintText && !validation.error && (
          <p className="text-[10px] text-gray-500 mt-2">
            {hintText}
          </p>
        )}
        {validation.error && (
          <div className="mt-2 flex items-start gap-2 text-[10px] text-red-400">
            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span>{validation.error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
