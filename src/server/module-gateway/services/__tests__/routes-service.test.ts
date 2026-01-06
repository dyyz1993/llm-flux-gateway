import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoutesService } from '../routes.service';
import * as database from '@server/shared/database';

// Mock database functions
vi.mock('@server/shared/database', () => ({
  queryAll: vi.fn(),
  queryFirst: vi.fn(),
  queryRun: vi.fn(),
}));

const mockQueryAll = vi.mocked(database.queryAll);
const mockQueryFirst = vi.mocked(database.queryFirst);
const mockQueryRun = vi.mocked(database.queryRun);

describe('RoutesService', () => {
  let service: RoutesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RoutesService();
  });

  const mockDbRow = {
    id: 'test-route-id',
    name: 'Test Route',
    assetId: 'asset-123',
    isActive: 1,  // Use aliased name (is_active AS isActive)
    overrides: JSON.stringify([{ match: 'gpt-*', model: 'gpt-4' }]),
    configType: 'yaml',  // Use aliased name (config_type AS configType)
    priority: 0,
    createdAt: 1609459200,  // Use aliased name (created_at AS createdAt)
    updatedAt: 1609459200,  // Use aliased name (updated_at AS updatedAt)
    // JOIN fields from asset (camelCase as returned by SQL with AS aliases)
    assetName: 'Test Asset',
    assetVendorDisplayName: 'OpenAI',
    assetBaseUrl: 'https://api.openai.com/v1',
    assetEndpoint: '/chat/completions',
    assetApiKey: 'sk-test123',
  };

  describe('getAll', () => {
    it('should return all routes ordered by priority DESC, created_at DESC', async () => {
      mockQueryAll.mockReturnValueOnce([mockDbRow]);
      mockQueryAll.mockReturnValueOnce([]); // For models query

      const result = await service.getAll();

      expect(mockQueryAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'test-route-id',
        name: 'Test Route',
        assetId: 'asset-123',
        isActive: true,
      });
    });

    it('should return empty array when no routes exist', async () => {
      mockQueryAll.mockReturnValue([]);

      const result = await service.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('should return route by ID', async () => {
      mockQueryFirst.mockReturnValue(mockDbRow);

      const result = await service.getById('test-route-id');

      expect(mockQueryFirst).toHaveBeenCalledWith(expect.any(String), ['test-route-id']);
      expect(result).toMatchObject({
        id: 'test-route-id',
        name: 'Test Route',
        isActive: true,
      });
    });

    it('should return null when route not found', async () => {
      mockQueryFirst.mockReturnValue(undefined);

      const result = await service.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getActive', () => {
    it('should return only active routes', async () => {
      mockQueryAll.mockReturnValue([mockDbRow]);

      const result = await service.getActive();

      expect(mockQueryAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]!.isActive).toBe(true);
    });

    it('should return empty array when no active routes', async () => {
      mockQueryAll.mockReturnValue([]);

      const result = await service.getActive();

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create a new route with default values', async () => {
      mockQueryRun.mockReturnValue({ changes: 1 } as any);

      const input = {
        name: 'New Route',
        assetId: 'test-asset',
      };

      // Mock getById to return the created route
      mockQueryFirst.mockReturnValue({
        ...mockDbRow,
        name: 'New Route',
        assetId: 'test-asset',
        isActive: 1,  // Use aliased name
        overrides: '[]',
        configType: 'yaml',  // Use aliased name
        priority: 0,
      });
      mockQueryAll.mockReturnValue([]); // For models query

      const result = await service.create(input);

      expect(mockQueryRun).toHaveBeenCalled();
      expect(result).toMatchObject({
        name: 'New Route',
        assetId: 'test-asset',
        isActive: true,
        overrides: [],
        configType: 'yaml',
        priority: 0,
      });
    });

    it('should create a new route with custom values', async () => {
      mockQueryRun.mockReturnValue({ changes: 1 } as any);

      const input = {
        name: 'Custom Route',
        overrides: [{ match: 'custom-*', model: 'custom-model' }],
        configType: 'json' as const,
        priority: 10,
        isActive: false,
        assetId: 'test-asset',
      };

      // Mock getById to return the created route
      mockQueryFirst.mockReturnValue({
        ...mockDbRow,
        name: 'Custom Route',
        isActive: 0,  // Use aliased name
        overrides: JSON.stringify([{ match: 'custom-*', model: 'custom-model' }]),
        configType: 'json',  // Use aliased name
        priority: 10,
        assetId: 'test-asset',
      });
      mockQueryAll.mockReturnValue([]); // For models query

      const result = await service.create(input);

      expect(result).toMatchObject({
        name: 'Custom Route',
        assetId: 'test-asset',
        isActive: false,
        overrides: [{ match: 'custom-*', model: 'custom-model' }],
        configType: 'json',
        priority: 10,
      });
    });
  });

  describe('update', () => {
    it('should update route fields', async () => {
      mockQueryFirst.mockReturnValue(mockDbRow);
      mockQueryRun.mockReturnValue({ changes: 1 } as any);

      const input = {
        name: 'Updated Route',
        priority: 5,
      };

      const result = await service.update('test-route-id', input);

      expect(mockQueryRun).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE routes SET'),
        expect.arrayContaining([
          'Updated Route',
          5,
          expect.any(Number), // updated_at
          'test-route-id',
        ])
      );
      expect(result).not.toBeNull();
    });

    it('should return null when route not found', async () => {
      mockQueryFirst.mockReturnValue(undefined);

      const result = await service.update('nonexistent', { name: 'Test' });

      expect(result).toBeNull();
    });

    it('should return existing route when no updates provided', async () => {
      mockQueryFirst.mockReturnValue(mockDbRow);

      const result = await service.update('test-route-id', {});

      expect(mockQueryRun).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 'test-route-id',
        name: 'Test Route',
      });
    });
  });

  describe('delete', () => {
    it('should delete a route', async () => {
      mockQueryRun.mockReturnValue({ changes: 1 } as any);

      const result = await service.delete('test-route-id');

      expect(mockQueryRun).toHaveBeenCalledWith(
        'DELETE FROM routes WHERE id = ?',
        ['test-route-id']
      );
      expect(result).toBe(true);
    });

    it('should return false when route not found', async () => {
      mockQueryRun.mockReturnValue({ changes: 0 } as any);

      const result = await service.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('toggleActive', () => {
    it('should toggle active status from true to false', async () => {
      mockQueryFirst.mockReturnValue(mockDbRow);
      mockQueryRun.mockReturnValue({ changes: 1 } as any);

      const result = await service.toggleActive('test-route-id');

      expect(mockQueryRun).toHaveBeenCalledWith(
        'UPDATE routes SET is_active = ?, updated_at = ? WHERE id = ?',
        [0, expect.any(Number), 'test-route-id']
      );
      expect(result).not.toBeNull();
    });

    it('should toggle active status from false to true', async () => {
      const inactiveRow = { ...mockDbRow, isActive: 0 };
      mockQueryFirst.mockReturnValue(inactiveRow);
      mockQueryRun.mockReturnValue({ changes: 1 } as any);

      const result = await service.toggleActive('test-route-id');

      expect(mockQueryRun).toHaveBeenCalledWith(
        'UPDATE routes SET is_active = ?, updated_at = ? WHERE id = ?',
        [1, expect.any(Number), 'test-route-id']
      );
      expect(result).not.toBeNull();
    });

    it('should return null when route not found', async () => {
      mockQueryFirst.mockReturnValue(undefined);

      const result = await service.toggleActive('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('parseOverrides', () => {
    it('should parse valid JSON overrides', async () => {
      const overrides = [{ match: 'gpt-*', model: 'gpt-4' }];
      const row = { ...mockDbRow, overrides: JSON.stringify(overrides) };
      mockQueryFirst.mockReturnValue(row);

      const result = await service.getById('test-route-id');

      expect(result?.overrides).toEqual(overrides);
    });

    it('should return empty array for invalid JSON', async () => {
      const row = { ...mockDbRow, overrides: 'invalid-json' };
      mockQueryFirst.mockReturnValue(row);

      const result = await service.getById('test-route-id');

      expect(result?.overrides).toEqual([]);
    });

    it('should return empty array for non-array JSON', async () => {
      const row = { ...mockDbRow, overrides: JSON.stringify({ not: 'an-array' }) };
      mockQueryFirst.mockReturnValue(row);

      const result = await service.getById('test-route-id');

      expect(result?.overrides).toEqual([]);
    });
  });
});
