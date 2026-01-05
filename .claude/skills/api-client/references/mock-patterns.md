# API Client Mock Patterns

## Overview

This reference describes how to create mock implementations for API client methods using the mockStore pattern.

## Mock Store Location

```
src/client/services/mockStore.ts
```

## Mock Pattern

### Basic Mock Structure

```typescript
// mockStore.ts
import { vi } from 'vitest';

// Mock implementation
export const mockApi = {
  myNewMethod: vi.fn().mockResolvedValue({
    success: true,
    data: {
      /* expected data */
    },
  }),
};

// Usage in tests
vi.mock('@client/services/apiClient', () => ({
  apiClient: mockApi,
  getMockStore: () => mockApi,
}));
```

## Common Mock Scenarios

### Success Response

```typescript
export const mockApi = {
  fetchData: vi.fn().mockResolvedValue({
    success: true,
    data: { id: '1', name: 'Test' },
  }),
};
```

### Error Response

```typescript
export const mockApi = {
  fetchData: vi.fn().mockRejectedValue({
    success: false,
    error: 'Network error',
  }),
};
```

### Async Loading State

```typescript
export const mockApi = {
  fetchData: vi
    .fn()
    .mockResolvedValueOnce({ loading: true })
    .mockResolvedValueOnce({
      success: true,
      data: { id: '1', name: 'Test' },
    }),
};
```

### Conditional Responses

```typescript
export const mockApi = {
  fetchData: vi.fn().mockImplementation((param) => {
    if (param === 'error') {
      return Promise.reject({ success: false });
    }
    return Promise.resolve({ success: true, data: {} });
  }),
};
```

## Testing Patterns

### Using Mocks in Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { apiClient, getMockStore } from '@client/services/apiClient';

describe('MyComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch data successfully', async () => {
    const mock = getMockStore();
    mock.fetchData.mockResolvedValueOnce({
      success: true,
      data: { id: '1' },
    });

    const result = await apiClient.fetchData('test');

    expect(result.success).toBe(true);
    expect(result.data.id).toBe('1');
  });
});
```

## Mock Cleanup

```typescript
afterEach(() => {
  vi.clearAllMocks();
});
```

## See Also

- [backend-routes.md](backend-routes.md) - Backend route patterns
- [../../rules/client-service-rules.md](../../rules/client-service-rules.md) - Service layer rules
