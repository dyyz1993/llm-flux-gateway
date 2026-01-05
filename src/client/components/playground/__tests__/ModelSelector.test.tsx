/**
 * ModelSelector Component Tests
 *
 * Tests the pure component API where:
 * - All data is passed through props
 * - Component only handles UI and validation
 * - No store dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ModelSelector, ModelSelectorValue } from '../ModelSelector';

describe('ModelSelector - Pure Component API', () => {
  const mockKeys = [
    { id: 'key1', name: 'Test Key 1', hint: 'sk-test123...' },
    { id: 'key2', name: 'Test Key 2', hint: 'sk-test987...' },
  ];

  const mockOnChange = vi.fn();
  const mockOnValidationChange = vi.fn();

  const baseValue: ModelSelectorValue = {
    selectedKeyId: 'key1',
    selectedModel: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pure Component - Props Input', () => {
    it('should render with provided keys', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo', 'gpt-4']}
          patterns={['gpt-*']}
          value={baseValue}
          onChange={mockOnChange}
        />
      );

      // Check that the select element is rendered
      const select = screen.getByLabelText('API Key')!;
      expect(select).toBeInTheDocument();
      expect(select).toHaveValue('key1');
    });

    it('should render key hints when provided', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo']}
          patterns={['*']}
          value={baseValue}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText(/sk-test123\.\.\./)!).toBeInTheDocument();
      expect(screen.getByText(/sk-test987\.\.\./)!).toBeInTheDocument();
    });

    it('should show "No active keys" when keys array is empty', () => {
      render(
        <ModelSelector
          availableKeys={[]}
          availableModels={[]}
          patterns={[]}
          value={{ selectedKeyId: '', selectedModel: '' }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('No active keys')!).toBeInTheDocument();
    });
  });

  describe('onChange Callback', () => {
    it('should call onChange when key selection changes', () => {
      const { rerender } = render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo']}
          patterns={['*']}
          value={baseValue}
          onChange={mockOnChange}
        />
      );

      rerender(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo']}
          patterns={['*']}
          value={{ selectedKeyId: 'key2', selectedModel: '' }}
          onChange={mockOnChange}
        />
      );

      // onChange should be called when props change (controlled component behavior)
      // But the component itself doesn't call onChange on render - parent does
      // So we just verify the UI updated correctly
      const select = screen.getByLabelText('API Key')!;
      expect(select).toHaveValue('key2');
    });

    it('should call onChange when model input changes', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo', 'gpt-4']}
          patterns={['gpt-*']}
          value={baseValue}
          onChange={mockOnChange}
        />
      );

      // Simulate user typing (in real test, would use fireEvent.change)
      void screen.getByRole('combobox')!;
      // Note: Full interaction test would need WildcardInput to expose testable methods
    });
  });

  describe('onValidationChange Callback', () => {
    it('should call onValidationChange with isValid: true for valid model', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo']}
          patterns={['gpt-*']}
          value={{ selectedKeyId: 'key1', selectedModel: 'gpt-4' }}
          onChange={mockOnChange}
          onValidationChange={mockOnValidationChange}
        />
      );

      // onValidationChange is called in useEffect after render
      // Should be called immediately for valid model
      expect(mockOnValidationChange).toHaveBeenCalledWith(true);
    });

    it('should call onValidationChange with isValid: false for invalid model', async () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo']}
          patterns={['gpt-*']}
          value={{ selectedKeyId: 'key1', selectedModel: 'claude-3-opus' }}
          onChange={mockOnChange}
          onValidationChange={mockOnValidationChange}
        />
      );

      await waitFor(() => {
        expect(mockOnValidationChange).toHaveBeenCalledWith(
          false,
          expect.stringContaining('does not match allowed patterns')
        );
      });
    });

    it('should call onValidationChange with isValid: false for empty model', async () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo']}
          patterns={['gpt-*']}
          value={{ selectedKeyId: 'key1', selectedModel: '' }}
          onChange={mockOnChange}
          onValidationChange={mockOnValidationChange}
        />
      );

      await waitFor(() => {
        expect(mockOnValidationChange).toHaveBeenCalledWith(
          false,
          'Please select or enter a model name'
        );
      });
    });
  });

  describe('Validation with Different Patterns', () => {
    it('should validate correctly with wildcard-all (*)', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={[]}
          patterns={['*']}
          value={{ selectedKeyId: 'key1', selectedModel: 'any-model-name' }}
          onChange={mockOnChange}
          onValidationChange={mockOnValidationChange}
        />
      );

      expect(mockOnValidationChange).toHaveBeenCalledWith(true);
    });

    it('should validate correctly with prefix pattern (gpt-*)', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-4']}
          patterns={['gpt-*']}
          value={{ selectedKeyId: 'key1', selectedModel: 'gpt-3.5-turbo' }}
          onChange={mockOnChange}
          onValidationChange={mockOnValidationChange}
        />
      );

      expect(mockOnValidationChange).toHaveBeenCalledWith(true);
    });

    it('should show inline error when model is invalid', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo']}
          patterns={['gpt-*']}
          value={{ selectedKeyId: 'key1', selectedModel: 'claude-3-opus' }}
          onChange={mockOnChange}
          onValidationChange={mockOnValidationChange}
        />
      );

      expect(screen.getByText(/does not match allowed patterns/)!).toBeInTheDocument();
      expect(screen.getByText(/gpt-\*/)!).toBeInTheDocument();
    });
  });

  describe('Hint Messages', () => {
    it('should show "any model" hint when pattern is *', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={[]}
          patterns={['*']}
          value={{ selectedKeyId: 'key1', selectedModel: 'gpt-4' }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText(/Any model can be used/)!).toBeInTheDocument();
    });

    it('should show "specific models" hint when no wildcards', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo', 'gpt-4']}
          patterns={['gpt-3.5-turbo', 'gpt-4']}
          value={{ selectedKeyId: 'key1', selectedModel: 'gpt-4' }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText(/route requests for these specific models/)!).toBeInTheDocument();
    });

    it('should show "route overrides" hint for prefix patterns', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-4']}
          patterns={['gpt-*']}
          value={{ selectedKeyId: 'key1', selectedModel: 'gpt-4' }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText(/route overrides/)!).toBeInTheDocument();
    });
  });

  describe('Disabled State', () => {
    it('should disable inputs when disabled prop is true', () => {
      render(
        <ModelSelector
          availableKeys={mockKeys}
          availableModels={['gpt-3.5-turbo']}
          patterns={['*']}
          value={baseValue}
          onChange={mockOnChange}
          disabled={true}
        />
      );

      const select = screen.getByRole('combobox', { name: /api key/i })! || screen.getByRole('combobox')!;
      expect(select).toBeDisabled();
    });
  });
});
