import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, AlertCircle, X } from 'lucide-react';
// import type { WildcardPattern } from '@client/utils/wildcardUtils';
import { parseWildcardPattern, getInputConstraint, formatWildcardPattern, matchesWildcardPattern } from '@client/utils/wildcardUtils';

export interface WildcardInputProps {
  /** The available options for exact match */
  options: string[];
  /** Current selected value */
  value: string;
  /** Wildcard pattern(s) to match against */
  patterns: string[];
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Disabled state */
  disabled?: boolean;
  /** Label for the input */
  label?: string;
  /** CSS class name */
  className?: string;
}

/**
 * WildcardInput Component
 *
 * Smart input that adapts to wildcard patterns:
 * 1. With *: Free text input (no dropdown)
 * 2. With gpt-*: Text input + dropdown filtered by prefix
 * 3. Without *: Combobox (text input with dropdown, can only select from options)
 */
export const WildcardInput: React.FC<WildcardInputProps> = ({
  options,
  value,
  patterns,
  onChange,
  disabled = false,
  label = 'Model',
  className = '',
}) => {
  const [inputError, setInputError] = useState<string | null>(null as any);
  const [showDropdown, setShowDropdown] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [searchText, setSearchText] = useState(''); // Separate state for filtering
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync inputValue with value prop
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Reset searchText when dropdown opens
  useEffect(() => {
    if (showDropdown) {
      setSearchText('');
    }
  }, [showDropdown]);

  // Parse patterns and determine input mode
  const inputMode = useMemo(() => {
    const parsedPatterns = patterns.map(parseWildcardPattern);

    // Check if we have wildcard-all (*)
    const hasWildcardAll = parsedPatterns.some(p => p.type === 'wildcard-all');

    // Check for exact patterns
    const exactPatterns = parsedPatterns.filter(p => p.type === 'exact');

    // SCENARIO 5: Mixed mode - has wildcard-all AND exact patterns
    // Show dropdown with exact options, but allow any input
    if (hasWildcardAll && exactPatterns.length > 0) {
      return {
        type: 'mixed' as const,
        allowCustomInput: true, // Allow any input because of *
        filteredOptions: exactPatterns.map(p => p.value), // Show exact patterns in dropdown
        constraint: {
          allowAny: true,
          placeholder: 'Select or type any model name...',
          examples: exactPatterns.map(p => p.value),
        },
      };
    }

    // SCENARIO 4: Free mode - only wildcard-all, no exact patterns
    if (hasWildcardAll) {
      return {
        type: 'free' as const,
        allowCustomInput: true,
        constraint: getInputConstraint({ type: 'wildcard-all', value: '*' }),
        filteredOptions: [],
      };
    }

    // Check if we have prefix wildcards
    const prefixPatterns = parsedPatterns.filter(p => p.type === 'wildcard-prefix');
    if (prefixPatterns.length > 0) {
      const constraint = getInputConstraint(prefixPatterns[0] as any);
      const prefix = constraint.requirePrefix || '';
      // Filter options by prefix
      const filteredOptions = options.filter(opt => opt.startsWith(prefix));
      return {
        type: 'prefix' as const,
        allowCustomInput: true,
        constraint,
        filteredOptions,
        prefix,
      };
    }

    // SCENARIO 2: Exact match only - filter options by exact patterns
    const filteredOptions = exactPatterns.length > 0
      ? options.filter(opt => exactPatterns.some(p => matchesWildcardPattern(opt, p)))
      : options;

    return {
      type: 'exact' as const,
      allowCustomInput: false, // Cannot input custom values in exact mode
      filteredOptions,
      constraint: getInputConstraint({ type: 'exact', value: filteredOptions[0] || '' }),
    };
  }, [patterns, options]);

  // Handle value change (when selecting from dropdown or typing)
  const handleChange = (newValue: string) => {
    setInputValue(newValue);
    setSearchText(''); // Reset search text after selection

    // In exact mode, always call onChange and let parent validate
    if (!inputMode.allowCustomInput) {
      if (newValue === '' || (inputMode.filteredOptions as string[]).includes(newValue)) {
        // Valid: empty or in options list
        setInputError(null);
      } else {
        // Invalid input in exact mode - show local error
        const optionsStr = inputMode.filteredOptions.length > 0
          ? inputMode.filteredOptions.slice(0, 3).join(', ') + (inputMode.filteredOptions.length > 3 ? '...' : '')
          : 'no models available';
        setInputError(`Must select from: ${optionsStr}`);
      }
      // Always call onChange to let parent know the value (even if invalid)
      onChange(newValue);
      setShowDropdown(false);
      return;
    }

    // In mixed or free mode (has *), no validation needed - allow any input
    if (inputMode.type === 'mixed' || inputMode.type === 'free') {
      setInputError(null);
      onChange(newValue);
      setShowDropdown(false);
      return;
    }

    // For prefix mode, validate against patterns
    const parsedPatterns = patterns.map(parseWildcardPattern);
    const matchesAny = parsedPatterns.some(p => matchesWildcardPattern(newValue, p));

    if (!matchesAny) {
      const patternDesc = patterns.map(p => formatWildcardPattern(parseWildcardPattern(p))).join(' or ');
      setInputError(`Value must match: ${patternDesc}`);
    } else {
      setInputError(null);
    }

    onChange(newValue);
    setShowDropdown(false);
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter dropdown options based on search text (must be before early returns)
  const dropdownOptions = useMemo(() => {
    if (!searchText) return inputMode.filteredOptions;

    // In prefix mode, filter by prefix
    if (inputMode.type === 'prefix' && inputMode.prefix) {
      return inputMode.filteredOptions.filter(opt =>
        opt.toLowerCase().startsWith(searchText.toLowerCase())
      );
    }

    // In exact mode, filter by substring
    return inputMode.filteredOptions.filter(opt =>
      opt.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [searchText, inputMode]);

  // In free mode (has *), just show text input without dropdown
  if (inputMode.type === 'free') {
    return (
      <div className={className}>
        <label htmlFor={`wildcard-input-${label.toLowerCase()}`} className="text-xs text-gray-500 font-semibold uppercase">{label}</label>
        <input
          id={`wildcard-input-${label.toLowerCase()}`}
          type="text"
          value={inputValue}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          placeholder={inputMode.constraint.placeholder}
          className={`w-full mt-1 bg-[#111] border text-white text-sm px-3 py-2 rounded-md focus:border-indigo-500 focus:outline-none font-mono disabled:opacity-50 disabled:cursor-not-allowed ${
            inputError ? 'border-red-500/50' : 'border-[#333]'
          }`}
        />
        {inputError && (
          <div className="mt-1 flex items-center gap-1 text-[10px] text-red-400">
            <AlertCircle className="w-3 h-3" />
            <span>{inputError}</span>
          </div>
        )}
        {!inputError && inputMode.constraint.examples && (
          <p className="text-[10px] text-gray-500 mt-1">
            Examples: {inputMode.constraint.examples.slice(0, 3).join(', ')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={className} ref={containerRef}>
      <label htmlFor={`wildcard-input-${label.toLowerCase()}`} className="text-xs text-gray-500 font-semibold uppercase">{label}</label>
      <div className="mt-1 relative">
        {/* Text input with dropdown */}
        <div className="relative">
          <input
            id={`wildcard-input-${label.toLowerCase()}`}
            type="text"
            value={inputValue}
            onChange={(e) => {
              const newValue = e.target.value;
              setInputValue(newValue);
              setSearchText(newValue); // Update search text for filtering
              setShowDropdown(true);

              // In exact mode, validate and show error for invalid input
              if (inputMode.type === 'exact') {
                if (newValue === '' || inputMode.filteredOptions.includes(newValue)) {
                  setInputError(null);
                  onChange(newValue);
                } else {
                  const optionsStr = inputMode.filteredOptions.length > 0
                    ? inputMode.filteredOptions.slice(0, 3).join(', ') + (inputMode.filteredOptions.length > 3 ? '...' : '')
                    : 'no models available';
                  setInputError(`Must select from: ${optionsStr}`);
                  onChange(newValue); // Still call onChange to trigger validation
                }
              } else {
                // In mixed/free/prefix mode, always update
                onChange(newValue);
              }
            }}
            onFocus={() => setShowDropdown(true)}
            disabled={disabled}
            placeholder={
              inputMode.type === 'mixed'
                ? 'Select or type any model name...'
                : inputMode.type === 'prefix'
                ? inputMode.constraint.placeholder
                : 'Select or type to search...'
            }
            className={`w-full bg-[#111] border text-white text-sm px-3 py-2 pr-20 rounded-md focus:border-indigo-500 focus:outline-none font-mono disabled:opacity-50 disabled:cursor-not-allowed ${
              inputError ? 'border-red-500/50' : 'border-[#333]'
            }`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {value && (
              <button
                onClick={() => {
                  setInputValue('');
                  setSearchText('');
                  onChange('');
                  setInputError(null);
                }}
                className="p-1 hover:bg-[#262626] rounded text-gray-500 hover:text-white transition-colors"
                disabled={disabled}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="p-1 hover:bg-[#262626] rounded text-gray-500 hover:text-white transition-colors"
              disabled={disabled}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Dropdown menu */}
        {showDropdown && dropdownOptions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-[#1a1a1a] border border-[#333] rounded-md shadow-lg max-h-60 overflow-auto">
            {dropdownOptions.map((opt) => (
              <button
                key={opt}
                onClick={() => handleChange(opt)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#262626] transition-colors ${
                  value === opt ? 'bg-indigo-600/20 text-indigo-400' : 'text-gray-300'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>

      {inputError && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-red-400">
          <AlertCircle className="w-3 h-3" />
          <span>{inputError}</span>
        </div>
      )}

      {!inputError && inputMode.type === 'prefix' && inputMode.constraint.requirePrefix && (
        <p className="text-[10px] text-gray-500 mt-1">
          Must start with: <code className="text-indigo-400">{inputMode.constraint.requirePrefix}</code>*
        </p>
      )}

      {!inputError && inputMode.type === 'mixed' && inputMode.constraint.examples && inputMode.constraint.examples.length > 0 && (
        <p className="text-[10px] text-gray-500 mt-1">
          Quick options: {inputMode.constraint.examples.join(', ')} (or type any model)
        </p>
      )}

      {!inputError && inputMode.type === 'prefix' && inputMode.constraint.examples && (
        <p className="text-[10px] text-gray-500 mt-1">
          Examples: {inputMode.constraint.examples.slice(0, 3).join(', ')}
        </p>
      )}

      {!inputError && inputMode.type === 'exact' && dropdownOptions.length === 0 && (
        <p className="text-[10px] text-amber-500 mt-1">
          No models available for this API key
        </p>
      )}
    </div>
  );
};

export default WildcardInput;
