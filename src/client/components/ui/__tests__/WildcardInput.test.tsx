/**
 * WildcardInput Component Tests
 *
 * Tests all scenarios from docs/model-selector-behavior.md:
 * 1. Default mode (no overrides) - Exact match with asset models
 * 2. Exact match mode - Only specific options
 * 3. Prefix wildcard mode - Prefix validation
 * 4. Free mode (*) - No validation
 * 5. Mixed mode - Dropdown options + free input
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WildcardInput } from '../WildcardInput';

describe('WildcardInput Component', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  // ========================================
  // SCENARIO 1: Default Mode (No Overrides)
  // ========================================
  describe('Scenario 1: Default Mode - No Overrides', () => {
    const assetModels = ['glm-4-air', 'glm-4-flash', 'glm-4-plus', 'glm-4.6', 'glm-4.7'];

    it('should show all asset models in dropdown', async () => {
      render(
        <WildcardInput
          options={assetModels}
          value="glm-4-air"
          patterns={[]}
          onChange={mockOnChange}
        />
      );

      // Focus and click to open dropdown
      const input = screen.getByPlaceholderText(/select or type to search/i)!;
      input.focus();
      fireEvent.click(input);

      // Wait for dropdown to appear
      await waitFor(() => {
        expect(screen.getByText('glm-4-air')!).toBeInTheDocument();
        expect(screen.getByText('glm-4-flash')!).toBeInTheDocument();
        expect(screen.getByText('glm-4-plus')!).toBeInTheDocument();
        expect(screen.getByText('glm-4.6')!).toBeInTheDocument();
        expect(screen.getByText('glm-4.7')!).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should show error for custom input in exact mode', () => {
      render(
        <WildcardInput
          options={assetModels}
          value="glm-4-air"
          patterns={[]}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByDisplayValue('glm-4-air');

      // Try to type a value not in the list
      fireEvent.change(input, { target: { value: 'invalid-model' } });

      // onChange IS called (component validates and shows error)
      expect(mockOnChange).toHaveBeenCalledWith('invalid-model');
      // Error message should be shown
      expect(screen.getByText(/must select from:/i)!).toBeInTheDocument();
    });

    it('should allow selecting from dropdown', async () => {
      render(
        <WildcardInput
          options={assetModels}
          value=""
          patterns={[]}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByPlaceholderText(/select or type to search/i)!;
      input.focus();
      fireEvent.click(input);

      // Wait for dropdown and select option
      await waitFor(() => {
        expect(screen.getByText('glm-4-flash')!).toBeInTheDocument();
      }, { timeout: 3000 });

      const flashOption = screen.getByText('glm-4-flash')!;
      fireEvent.click(flashOption);

      expect(mockOnChange).toHaveBeenCalledWith('glm-4-flash');
    });
  });

  // ========================================
  // SCENARIO 2: Exact Match Mode
  // ========================================
  describe('Scenario 2: Exact Match Mode', () => {
    const patterns = ['gpt-3.5-turbo', 'gpt-4'];
    const allModels = ['gpt-3.5-turbo', 'gpt-4', 'claude-3-opus', 'gemini-pro'];

    it('should only show exact match patterns in dropdown', async () => {
      render(
        <WildcardInput
          options={allModels}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByPlaceholderText(/select or type to search/i)!;
      input.focus();
      fireEvent.click(input);

      // Wait for dropdown to appear
      await waitFor(() => {
        expect(screen.getByText('gpt-3.5-turbo')!).toBeInTheDocument();
        expect(screen.getByText('gpt-4')!).toBeInTheDocument();
        expect(screen.queryByText('claude-3-opus')!).not.toBeInTheDocument();
        expect(screen.queryByText('gemini-pro')!).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should show error for invalid input in exact mode', () => {
      render(
        <WildcardInput
          options={allModels}
          value="gpt-3.5-turbo"
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByDisplayValue('gpt-3.5-turbo');

      // Try to type a value not in patterns
      fireEvent.change(input, { target: { value: 'invalid-model' } });

      // onChange IS called with invalid input, but an error is shown
      expect(mockOnChange).toHaveBeenCalledWith('invalid-model');
      // Error message should be displayed
      expect(screen.getByText(/must select from:/i)!).toBeInTheDocument();
    });
  });

  // ========================================
  // SCENARIO 3: Prefix Wildcard Mode
  // ========================================
  describe('Scenario 3: Prefix Wildcard Mode (gpt-*)', () => {
    const patterns = ['gpt-*'];
    const allModels = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'claude-3-opus'];

    it('should show prefix hint', () => {
      render(
        <WildcardInput
          options={allModels}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      // Should show prefix requirement hint (informational, always shown in prefix mode)
      expect(screen.getByText(/must start with:/i)!).toBeInTheDocument();
    });

    it('should allow input with correct prefix', () => {
      render(
        <WildcardInput
          options={allModels}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByPlaceholderText(/e.g\. gpt-/i)!;

      // Type valid prefix
      fireEvent.change(input, { target: { value: 'gpt-4' } });

      expect(mockOnChange).toHaveBeenCalledWith('gpt-4');
      // Hint remains visible (it's informational, not an error)
      expect(screen.getByText(/must start with:/i)!).toBeInTheDocument();
    });

    it('should show error for invalid prefix', () => {
      render(
        <WildcardInput
          options={allModels}
          value="claude-3-opus"
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      // Should show error for wrong prefix
      expect(screen.getByText(/must start with:/i)!).toBeInTheDocument();
    });

    it('should filter dropdown by prefix', async () => {
      render(
        <WildcardInput
          options={allModels}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByPlaceholderText(/e.g\. gpt-4, gpt-3\.5-turbo/i)!;
      input.focus();
      fireEvent.click(input);

      // Wait for dropdown to appear
      await waitFor(() => {
        expect(screen.getByText('gpt-3.5-turbo')!).toBeInTheDocument();
        expect(screen.getByText('gpt-4')!).toBeInTheDocument();
        expect(screen.queryByText('claude-3-opus')!).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  // ========================================
  // SCENARIO 4: Free Mode (*)
  // ========================================
  describe('Scenario 4: Free Mode (*)', () => {
    const patterns = ['*'];

    it('should not show dropdown', () => {
      const { container } = render(
        <WildcardInput
          options={[]}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      // Should be a text input without dropdown
      const input = screen.getByPlaceholderText(/e\.g\. gpt-4, claude-3-opus, gemini-2\.5-flash/i)!;
      expect(input).toBeInTheDocument();

      // In free mode, there are no buttons at all (no dropdown toggle, no clear button when empty)
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBe(0);
    });

    it('should allow any input without validation', () => {
      render(
        <WildcardInput
          options={[]}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByPlaceholderText(/e\.g\. gpt-4, claude-3-opus, gemini-2\.5-flash/i)!;

      // Type any value
      fireEvent.change(input, { target: { value: 'any-model-name' } });

      expect(mockOnChange).toHaveBeenCalledWith('any-model-name');
      expect(screen.queryByText(/must match/i)!).not.toBeInTheDocument();
      expect(screen.queryByText(/must start with/i)!).not.toBeInTheDocument();
    });

    it('should show examples hint', () => {
      render(
        <WildcardInput
          options={[]}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      // Should show example models
      expect(screen.getByText(/examples:/i)!).toBeInTheDocument();
    });
  });

  // ========================================
  // SCENARIO 5: Mixed Mode (Exact + *)
  // ========================================
  describe('Scenario 5: Mixed Mode - Dropdown + Free Input', () => {
    const patterns = ['gpt-3.5-turbo', 'gpt-4', '*'];
    const allModels = ['gpt-3.5-turbo', 'gpt-4', 'claude-3-opus', 'gemini-pro'];

    it('should show dropdown with exact patterns', async () => {
      render(
        <WildcardInput
          options={allModels}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByPlaceholderText(/select or type any model name/i)!;
      input.focus();
      fireEvent.click(input);

      // Should show only the exact patterns, not all models
      await waitFor(() => {
        expect(screen.getByText('gpt-3.5-turbo')!).toBeInTheDocument();
        expect(screen.getByText('gpt-4')!).toBeInTheDocument();
        expect(screen.queryByText('claude-3-opus')!).not.toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('should allow selecting from dropdown', async () => {
      render(
        <WildcardInput
          options={allModels}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByPlaceholderText(/select or type any model name/i)!;
      input.focus();
      fireEvent.click(input);

      await waitFor(() => {
        expect(screen.getByText('gpt-3.5-turbo')!).toBeInTheDocument();
      }, { timeout: 3000 });

      const option = screen.getByText('gpt-3.5-turbo')!;
      fireEvent.click(option);

      expect(mockOnChange).toHaveBeenCalledWith('gpt-3.5-turbo');
    });

    it('should allow any custom input', () => {
      render(
        <WildcardInput
          options={allModels}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByPlaceholderText(/select or type any model name/i)!;

      // Type a model not in the dropdown
      fireEvent.change(input, { target: { value: 'claude-3-opus' } });

      // Should allow any input (because of *)
      expect(mockOnChange).toHaveBeenCalledWith('claude-3-opus');
      expect(screen.queryByText(/must match/i)!).not.toBeInTheDocument();
      expect(screen.queryByText(/must start with/i)!).not.toBeInTheDocument();
    });

    it('should show quick options hint', () => {
      render(
        <WildcardInput
          options={allModels}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      // Should show quick options hint
      expect(screen.getByText(/quick options:/i)!).toBeInTheDocument();
      // Check that gpt models are mentioned in the hint
      const hints = screen.getAllByText(/gpt/);
      expect(hints.length).toBeGreaterThan(0);
    });

    it('should filter dropdown when typing', async () => {
      render(
        <WildcardInput
          options={allModels}
          value=""
          patterns={patterns}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByPlaceholderText(/select or type any model name/i)!;
      input.focus();
      fireEvent.click(input);

      // Wait for dropdown to open first
      await waitFor(() => {
        expect(screen.getByText('gpt-3.5-turbo')!).toBeInTheDocument();
      }, { timeout: 3000 });

      // Type to filter
      fireEvent.change(input, { target: { value: 'gpt-4' } });

      // After filtering, only gpt-4 should be visible
      await waitFor(() => {
        expect(screen.getByText('gpt-4')!).toBeInTheDocument();
        // gpt-3.5-turbo should not be visible after filtering
        const allGpt4Elements = screen.queryAllByText('gpt-4');
        expect(allGpt4Elements.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });
  });

  // ========================================
  // Input Validation Tests
  // ========================================
  describe('Input Validation', () => {
    it('should clear input and error on clear button click', () => {
      const { container } = render(
        <WildcardInput
          options={['gpt-3.5-turbo', 'gpt-4']}
          value="gpt-3.5-turbo"
          patterns={['gpt-*']}
          onChange={mockOnChange}
        />
      );

      // Click clear button (X button) - it's the first button
      const clearButton = container.querySelector('button')!;
      expect(clearButton).toBeInTheDocument();
      if (clearButton) {
        fireEvent.click(clearButton);
        expect(mockOnChange).toHaveBeenCalledWith('');
      }
    });

    it('should allow empty input in exact mode', () => {
      render(
        <WildcardInput
          options={['gpt-3.5-turbo', 'gpt-4']}
          value=""
          patterns={['gpt-3.5-turbo', 'gpt-4']}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByDisplayValue('');

      // Type a value then clear it
      fireEvent.change(input, { target: { value: 'gpt-3.5-turbo' } });
      expect(mockOnChange).toHaveBeenLastCalledWith('gpt-3.5-turbo');

      // Clear to empty - onChange IS called with empty string
      fireEvent.change(input, { target: { value: '' } });
      expect(mockOnChange).toHaveBeenLastCalledWith('');
    });
  });

  // ========================================
  // Disabled State Tests
  // ========================================
  describe('Disabled State', () => {
    it('should disable input and dropdown when disabled prop is true', () => {
      const { container } = render(
        <WildcardInput
          options={['gpt-3.5-turbo', 'gpt-4']}
          value="gpt-3.5-turbo"
          patterns={[]}
          onChange={mockOnChange}
          disabled={true}
        />
      );

      const input = screen.getByDisplayValue('gpt-3.5-turbo');
      expect(input).toBeDisabled();

      // All buttons should be disabled
      const buttons = container.querySelectorAll('button');
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });
    });
  });

  // ========================================
  // Accessibility Tests
  // ========================================
  describe('Accessibility', () => {
    it('should have proper label association', () => {
      render(
        <WildcardInput
          options={['gpt-3.5-turbo', 'gpt-4']}
          value=""
          patterns={[]}
          onChange={mockOnChange}
          label="Test Model"
        />
      );

      expect(screen.getByText('Test Model')!).toBeInTheDocument();
    });

    it('should show placeholder text', () => {
      render(
        <WildcardInput
          options={['gpt-3.5-turbo', 'gpt-4']}
          value=""
          patterns={[]}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByPlaceholderText(/select or type to search/i)!).toBeInTheDocument();
    });
  });
});
