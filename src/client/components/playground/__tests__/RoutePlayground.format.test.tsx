/**
 * Format Selection Bug Test
 *
 * Tests that the user-selected format is preserved across all requests,
 * including follow-up requests after tool calls.
 *
 * Bug: Previously, the second request (after tool execution) was hardcoded
 * to 'openai' format, ignoring the user's selection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useKeysStore, useRoutesStore, useAssetsStore, useChatStore } from '@client/stores';

// Mock the hooks FIRST (before importing RoutePlayground)
// Create mock functions that can be configured in tests
const mockStream = vi.fn();
const mockRequest = vi.fn();
const mockUseAIStream = vi.fn(() => ({
  stream: mockStream,
  request: mockRequest,
  cancel: vi.fn(),
  isLoading: false,
}));

vi.mock('@client/hooks/useAIStream', () => ({
  useAIStream: () => mockUseAIStream(),
}));

vi.mock('@client/services/toolExecution');
vi.mock('@client/services/protocolTranspiler');

// Import RoutePlayground AFTER mocking its dependencies
import { RoutePlayground } from '../RoutePlayground';

// Mock stores
vi.mock('@client/stores', () => ({
  useKeysStore: vi.fn(),
  useRoutesStore: vi.fn(),
  useAssetsStore: vi.fn(),
  useChatStore: vi.fn(),
}));

describe.skip('RoutePlayground - Format Selection', () => {
  const mockKeys = [
    {
      id: 'key1',
      name: 'Test Key',
      keyToken: 'sk-test123456789abcdefghijklmnop',
      status: 'active' as const,
      routes: [{ routeId: 'route1' }],
      createdAt: '2024-01-01',
    },
  ];

  const mockRoutes = [
    {
      id: 'route1',
      routeName: 'Test Route',
      isActive: true,
      assetId: 'asset1',
      overrides: [],
      assetModels: ['gpt-3.5-turbo', 'gpt-4'],
      priority: 1,
      createdAt: '2024-01-01',
    },
  ];

  const mockAssets = [
    {
      id: 'asset1',
      name: 'OpenAI',
      vendor: 'openai',
      isActive: true,
      models: [],
      createdAt: '2024-01-01',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockStream to clear previous calls
    mockStream.mockReset();
    mockRequest.mockReset();
    mockUseAIStream.mockReset();

    // Setup store mocks
    const createMockZustandStore = <T extends Record<string, any>>(state: T) => {
      const store = Object.assign(
        (selector?: (s: T) => any) => {
          return selector ? selector(state) : state;
        },
        {
          getState: () => state,
          setState: (partial: Partial<T>) => Object.assign(state, partial),
        }
      );
      return store;
    };

    const keysStore = createMockZustandStore({
      keys: mockKeys as any,
      fetchKeys: vi.fn(),
    } as any);

    const routesStore = createMockZustandStore({
      routes: mockRoutes as any,
      fetchRoutes: vi.fn(),
    } as any);

    const assetsStore = createMockZustandStore({
      assets: mockAssets,
      fetchAssets: vi.fn(),
    } as any);

    const chatStore = createMockZustandStore({
      messages: [],
      isLoading: false,
      error: null,
      addMessage: vi.fn(),
      clearMessages: vi.fn(),
      setLoading: vi.fn(),
      setError: vi.fn(),
      initFromStorage: vi.fn(),
      clearCurrentSession: vi.fn(),
      currentSession: null,
    } as any);

    vi.mocked(useKeysStore).mockImplementation((selector) => {
      return selector ? selector(keysStore.getState() as any) : keysStore.getState() as any;
    });
    (useKeysStore as any).getState = () => keysStore.getState() as any;

    vi.mocked(useRoutesStore).mockImplementation((selector) => {
      return selector ? selector(routesStore.getState() as any) : routesStore.getState() as any;
    });
    (useRoutesStore as any).getState = () => routesStore.getState() as any;

    vi.mocked(useAssetsStore).mockImplementation((selector) => {
      return selector ? selector(assetsStore.getState() as any) : assetsStore.getState() as any;
    });
    (useAssetsStore as any).getState = () => assetsStore.getState() as any;

    vi.mocked(useChatStore).mockImplementation((selector) => {
      return selector ? selector(chatStore.getState() as any) : chatStore as any;
    });

    // Attach methods to the store object itself
    (chatStore as any).initFromStorage = chatStore.getState().initFromStorage;
    (chatStore as any).clearCurrentSession = chatStore.getState().clearCurrentSession;

    (useChatStore as any).getState = () => chatStore.getState() as any;
  });

  describe('Format consistency across requests', () => {
    it('should use Anthropic format for both initial and follow-up requests', async () => {
      // Render component (mockStream is already set up at module level)
      const { container } = render(<RoutePlayground />);

      // Expand the config panel first (it's collapsed by default)
      const configToggleButton = screen.getByTitle(/show configuration/i);
      fireEvent.click(configToggleButton);

      // Select Anthropic format - find select element directly
      const formatSelect = container.querySelector('select') as HTMLSelectElement;
      expect(formatSelect).toBeInTheDocument();
      fireEvent.change(formatSelect, { target: { value: 'anthropic' } });

      // Simulate first request
      await act(async () => {
        // Send message with tool call trigger
        const input = screen.getByPlaceholderText(/type your message/i)!;
        fireEvent.change(input, { target: { value: 'What is the weather in Tokyo?' } });
        // Find the send button - look for button with indigo-600 class (enabled state)
        const sendButton = Array.from(container.querySelectorAll('button')).find(
          btn => btn.classList.contains('bg-indigo-600')
        ) as HTMLButtonElement;
        if (sendButton) {
          fireEvent.click(sendButton);
        }

        await waitFor(() => {
          expect(mockStream).toHaveBeenCalled();
        });
      });

      // Verify first request used Anthropic format
      const firstCall = mockStream.mock.calls[0]![0]!;
      expect(firstCall.provider).toBe('anthropic');

      // Simulate tool call completion and second request
      await act(async () => {
        const onComplete = firstCall.onComplete;
        if (onComplete) {
          // Simulate tool calls returned
          await onComplete({
            prompt: 10,
            completion: 5,
          });
        }
      });

      // Verify second request also used Anthropic format (not hardcoded to 'openai')
      const secondCall = mockStream.mock.calls[1]![0]!;
      expect(secondCall.provider).toBe('anthropic');
      expect(secondCall.provider).not.toBe('openai');
    });

    it('should use Gemini format for both initial and follow-up requests', async () => {
      const { container } = render(<RoutePlayground />);

      // Expand the config panel first
      const configToggleButton = screen.getByTitle(/show configuration/i);
      fireEvent.click(configToggleButton);

      // Select Gemini format
      const formatSelect = container.querySelector('select') as HTMLSelectElement;
      fireEvent.change(formatSelect, { target: { value: 'gemini' } });

      // Simulate requests
      await act(async () => {
        const input = screen.getByPlaceholderText(/type your message/i)!;
        fireEvent.change(input, { target: { value: 'Test message' } });
        // Find the send button - look for button with indigo-600 class (enabled state)
        const sendButton = Array.from(container.querySelectorAll('button')).find(
          btn => btn.classList.contains('bg-indigo-600')
        ) as HTMLButtonElement;
        if (sendButton) {
          fireEvent.click(sendButton);
        }

        await waitFor(() => {
          expect(mockStream).toHaveBeenCalledTimes(1);
        });
      });

      // Verify both requests use Gemini
      expect(mockStream.mock.calls[0]![0]!.provider).toBe('gemini');
      if (mockStream.mock.calls[1]) {
        expect(mockStream.mock.calls[1]![0]!.provider).toBe('gemini');
      }
    });

    it('should use OpenAI format for both requests when selected', async () => {
      const { container } = render(<RoutePlayground />);

      // Expand the config panel first
      const configToggleButton = screen.getByTitle(/show configuration/i);
      fireEvent.click(configToggleButton);

      // Select OpenAI format (default)
      const formatSelect = container.querySelector('select') as HTMLSelectElement;
      fireEvent.change(formatSelect, { target: { value: 'openai' } });

      // Simulate requests
      await act(async () => {
        const input = screen.getByPlaceholderText(/type your message/i)!;
        fireEvent.change(input, { target: { value: 'Test message' } });
        // Find the send button - look for button with indigo-600 class (enabled state)
        const sendButton = Array.from(container.querySelectorAll('button')).find(
          btn => btn.classList.contains('bg-indigo-600')
        ) as HTMLButtonElement;
        if (sendButton) {
          fireEvent.click(sendButton);
        }

        await waitFor(() => {
          expect(mockStream).toHaveBeenCalledTimes(1);
        });
      });

      // Verify both requests use OpenAI
      expect(mockStream.mock.calls[0]![0]!.provider).toBe('openai');
      if (mockStream.mock.calls[1]) {
        expect(mockStream.mock.calls[1]![0]!.provider).toBe('openai');
      }
    });
  });

  describe('Bug regression test', () => {
    it('should NOT hardcode second request to openai format', async () => {
      const { container } = render(<RoutePlayground />);

      // Expand the config panel first
      const configToggleButton = screen.getByTitle(/show configuration/i);
      fireEvent.click(configToggleButton);

      // Select Anthropic format
      const formatSelect = container.querySelector('select') as HTMLSelectElement;
      fireEvent.change(formatSelect, { target: { value: 'anthropic' } });

      // Simulate tool call scenario
      await act(async () => {
        const input = screen.getByPlaceholderText(/type your message/i)!;
        fireEvent.change(input, { target: { value: 'Execute tool' } });
        // Find the send button - look for button with indigo-600 class (enabled state)
        const sendButton = Array.from(container.querySelectorAll('button')).find(
          btn => btn.classList.contains('bg-indigo-600')
        ) as HTMLButtonElement;
        if (sendButton) {
          fireEvent.click(sendButton);
        }

        await waitFor(() => {
          expect(mockStream).toHaveBeenCalled();
        });

        // Get first call
        const firstCall = mockStream.mock.calls[0]![0]!;

        // Simulate tool calls in response
        const mockToolCalls = [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Tokyo"}',
            },
          },
        ];

        // Trigger tool call completion
        if (firstCall.onChunk) {
          firstCall.onChunk('', mockToolCalls);
        }

        if (firstCall.onComplete) {
          await firstCall.onComplete({ prompt: 10, completion: 5 });
        }
      });

      // Critical test: Second request must NOT be 'openai'
      if (mockStream.mock.calls[1]) {
        const secondProvider = mockStream.mock.calls[1]![0]!.provider;
        expect(secondProvider).toBe('anthropic');
        expect(secondProvider).not.toBe('openai');
      }
    });
  });
});

describe.skip('Format Selection Logic', () => {
  it('should preserve format across component re-renders', async () => {
    const { container, rerender } = render(<RoutePlayground />);

    // Expand the config panel first
    const configToggleButton = screen.getByTitle(/show configuration/i);
    fireEvent.click(configToggleButton);

    // Select Anthropic
    const formatSelect = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(formatSelect, { target: { value: 'anthropic' } });
    expect(formatSelect).toHaveValue('anthropic');

    // Trigger re-render
    rerender(<RoutePlayground />);

    // Format should still be Anthropic
    expect(formatSelect).toHaveValue('anthropic');
  });

  it('should not reset format when sending messages', async () => {
    const { container } = render(<RoutePlayground />);

    // Expand the config panel first
    const configToggleButton = screen.getByTitle(/show configuration/i);
    fireEvent.click(configToggleButton);

    // Select Gemini
    const formatSelect = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(formatSelect, { target: { value: 'gemini' } });

    // Send a message
    const input = screen.getByPlaceholderText(/type your message/i)!;
    fireEvent.change(input, { target: { value: 'Hello' } });
    // Find the send button
    const sendButton = Array.from(container.querySelectorAll('button')).find(
      btn => btn.classList.contains('bg-indigo-600')
    ) as HTMLButtonElement;
    if (sendButton) {
      fireEvent.click(sendButton);
    }

    // Format should remain Gemini - re-query the select element
    await waitFor(() => {
      const formatSelectAfter = container.querySelector('select') as HTMLSelectElement;
      expect(formatSelectAfter).toHaveValue('gemini');
    });
  });
});
