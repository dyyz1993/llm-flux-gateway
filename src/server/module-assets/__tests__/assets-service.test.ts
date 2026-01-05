import { describe, it, expect, beforeEach, vi } from 'vitest';
import { assetsService } from '../services/assets.service';
import { queryRun, queryFirst, queryAll } from '@server/shared/database';

// Mock database functions
vi.mock('@server/shared/database', () => ({
  queryRun: vi.fn(),
  queryFirst: vi.fn(),
  queryAll: vi.fn(),
}));

describe('AssetsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAll', () => {
    it('should return all assets', async () => {
      const mockRows = [
        {
          id: '1',
          name: 'OpenAI Asset',
          vendorId: 'openai',
          vendorName: 'openai',
          vendorDisplayName: 'OpenAI',
          vendorBaseUrl: 'https://api.openai.com/v1',
          apiKey: 'sk-test-key',
          status: 'active',
          validFrom: null,
          validUntil: null,
          created_at: 1640000000,
          updated_at: 1640000000,
        },
      ];

      vi.mocked(queryAll).mockReturnValue(mockRows as any);

      const result = await assetsService.getAll();

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('OpenAI Asset');
      expect(result[0]?.vendorId).toBe('openai');
    });
  });

  describe('getById', () => {
    it('should return asset by id', async () => {
      const mockRow = {
        id: '1',
        name: 'OpenAI Asset',
        vendorId: 'openai',
        vendorBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key',
        status: 'active',
        created_at: 1640000000,
        updated_at: 1640000000,
      };

      vi.mocked(queryFirst).mockReturnValue(mockRow as any);
      vi.mocked(queryAll).mockReturnValue([]); // For getAssetModels

      const result = await assetsService.getById('1');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('OpenAI Asset');
    });

    it('should return null if asset not found', async () => {
      vi.mocked(queryFirst).mockReturnValue(undefined);

      const result = await assetsService.getById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new asset', async () => {
      vi.mocked(queryRun).mockReturnValue({ changes: 1 } as any);
      vi.mocked(queryFirst).mockReturnValue({
        id: '1',
        name: 'New Asset',
        vendorId: 'anthropic',
        apiKey: 'sk-ant-key',
        status: 'active',
        created_at: 1640000000,
        updated_at: 1640000000,
      } as any);

      const input = {
        name: 'New Asset',
        vendorId: 'anthropic',
        apiKey: 'sk-ant-key',
      };

      const result = await assetsService.create(input);

      expect(result.name).toBe('New Asset');
      expect(result.vendorId).toBe('anthropic');
      expect(result.status).toBe('active');
    });
  });

  describe('update', () => {
    it('should update asset fields', async () => {
      const existingAsset = {
        id: '1',
        name: 'Old Name',
        vendorId: 'openai',
        apiKey: 'sk-old-key',
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(queryFirst)
        .mockReturnValueOnce(existingAsset as any)
        .mockReturnValueOnce({ ...existingAsset, name: 'New Name' } as any);
      vi.mocked(queryAll).mockReturnValue([]); // For models

      vi.mocked(queryRun).mockReturnValue({ changes: 1 } as any);

      const result = await assetsService.update('1', { name: 'New Name' });

      expect(result).not.toBeNull();
      expect(result?.name).toBe('New Name');
    });

    it('should return null if asset not found', async () => {
      vi.mocked(queryFirst).mockReturnValue(undefined);

      const result = await assetsService.update('non-existent', { name: 'New Name' });

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update asset status', async () => {
      const existingAsset = {
        id: '1',
        name: 'Test Asset',
        vendorId: 'openai',
        apiKey: 'sk-test-key',
        status: 'active' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(queryFirst)
        .mockReturnValueOnce(existingAsset as any)
        .mockReturnValueOnce({ ...existingAsset, status: "suspended" as any } as any);
      vi.mocked(queryAll).mockReturnValue([]); // For models

      vi.mocked(queryRun).mockReturnValue({ changes: 1 } as any);

      const result = await assetsService.updateStatus('1', 'suspended');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('suspended');
    });
  });

  describe('delete', () => {
    it('should delete an asset', async () => {
      vi.mocked(queryRun).mockReturnValue({ changes: 1 } as any);

      const result = await assetsService.delete('1');

      expect(result).toBe(true);
    });

    it('should return false if asset not found', async () => {
      vi.mocked(queryRun).mockReturnValue({ changes: 0 } as any);

      const result = await assetsService.delete('non-existent');

      expect(result).toBe(false);
    });
  });


  describe('getActive', () => {
    it('should return only active assets', async () => {
      const mockRows = [
        {
          id: '1',
          name: 'Active Asset',
          vendor: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: 'sk-test-key',
          budget: 100,
          balance: 80,
          status: 'active',
          created_at: 1640000000,
          updated_at: 1640000000,
        },
      ];

      vi.mocked(queryAll).mockReturnValue(mockRows as any);

      const result = await assetsService.getActive();

      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('active');
    });
  });

});
