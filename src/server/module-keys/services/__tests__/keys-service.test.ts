import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeysService } from '../keys.service';
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

describe('KeysService', () => {
  let service: KeysService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new KeysService();
  });

  const mockDbRow = {
    id: 'test-id',
    key_token: 'sk-flux-test123',
    name: 'Test Key',
    status: 'active',
    created_at: 1609459200,
    last_used_at: 1609545600,
    updated_at: 1609459200,
  };

  describe('getAll', () => {
    it('should return all API keys ordered by created_at DESC', async () => {
      mockQueryAll.mockReturnValue([mockDbRow]);

      const result = await service.getAll();

      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, key_token, name, status, created_at, last_used_at, updated_at')
      );
      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC')
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'test-id',
        keyToken: 'sk-flux-test123',
        name: 'Test Key',
        status: 'active',
      });
    });

    it('should return empty array when no keys exist', async () => {
      mockQueryAll.mockReturnValue([]);

      const result = await service.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('getById', () => {
    it('should return API key by ID', async () => {
      mockQueryFirst.mockReturnValue(mockDbRow);

      const result = await service.getById('test-id');

      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['test-id']
      );
      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('FROM api_keys'),
        ['test-id']
      );
      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ?'),
        ['test-id']
      );
      expect(result).toMatchObject({
        id: 'test-id',
        keyToken: 'sk-flux-test123',
        name: 'Test Key',
        status: 'active',
      });
    });

    it('should return null when key not found', async () => {
      mockQueryFirst.mockReturnValue(undefined);

      const result = await service.getById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('getByToken', () => {
    it('should return API key by token', async () => {
      mockQueryFirst.mockReturnValue(mockDbRow);

      const result = await service.getByToken('sk-flux-test123');

      expect(mockQueryFirst).toHaveBeenCalledWith(
        expect.stringContaining('WHERE key_token = ?'),
        ['sk-flux-test123']
      );
      expect(result).toMatchObject({
        id: 'test-id',
        keyToken: 'sk-flux-test123',
      });
    });

    it('should return null when token not found', async () => {
      mockQueryFirst.mockReturnValue(undefined);

      const result = await service.getByToken('invalid-token');

      expect(result).toBeNull();
    });
  });

  describe('getActive', () => {
    it('should return only active API keys', async () => {
      mockQueryAll.mockReturnValue([mockDbRow]);

      const result = await service.getActive();

      expect(mockQueryAll).toHaveBeenCalledWith(
        expect.stringContaining("WHERE status = 'active'")
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe('active');
    });
  });

  describe('create', () => {
    it('should create new API key with auto-generated token', async () => {
      mockQueryRun.mockReturnValue({ changes: 1 } as any);
      mockQueryFirst.mockReturnValue(mockDbRow);

      const result = await service.create({ name: 'New Key' });

      expect(mockQueryRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_keys'),
        expect.arrayContaining([
          expect.any(String), // id (UUID)
          expect.stringContaining('sk-flux-'), // keyToken
          'New Key',
          expect.any(Number), // created_at
          expect.any(Number), // updated_at
        ])
      );
      expect(result).toMatchObject({
        name: 'New Key',
        status: 'active',
        keyToken: expect.stringContaining('sk-flux-'),
      });
    });

    it('should create new API key with provided token', async () => {
      mockQueryRun.mockReturnValue({ changes: 1 } as any);
      mockQueryFirst.mockReturnValue(mockDbRow);

      const result = await service.create({
        name: 'Custom Key',
        keyToken: 'sk-custom-token',
      });

      expect(mockQueryRun).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO api_keys'),
        expect.arrayContaining([
          expect.any(String),
          'sk-custom-token',
          'Custom Key',
        ])
      );
      expect(result.keyToken).toBe('sk-custom-token');
    });
  });

  describe('update', () => {
    it('should update API key name', async () => {
      mockQueryFirst.mockReturnValueOnce(mockDbRow); // getById check
      mockQueryRun.mockReturnValue({ changes: 1 } as any);
      mockQueryFirst.mockReturnValueOnce({ ...mockDbRow, name: 'Updated Name' }); // getById after update

      const result = await service.update('test-id', { name: 'Updated Name' });

      expect(mockQueryRun).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE api_keys SET'),
        expect.arrayContaining(['Updated Name', expect.any(Number), 'test-id'])
      );
      expect(result?.name).toBe('Updated Name');
    });

    it('should update API key status', async () => {
      mockQueryFirst.mockReturnValueOnce(mockDbRow);
      mockQueryRun.mockReturnValue({ changes: 1 } as any);
      mockQueryFirst.mockReturnValueOnce({ ...mockDbRow, status: 'revoked' });

      const result = await service.update('test-id', { status: 'revoked' });

      expect(mockQueryRun).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE api_keys SET'),
        expect.arrayContaining(['revoked', expect.any(Number), 'test-id'])
      );
      expect(result?.status).toBe('revoked');
    });

    it('should return null when key not found', async () => {
      mockQueryFirst.mockReturnValue(undefined);

      const result = await service.update('non-existent-id', { name: 'New Name' });

      expect(result).toBeNull();
    });

    it('should return existing key when no updates provided', async () => {
      mockQueryFirst.mockReturnValue(mockDbRow);

      const result = await service.update('test-id', {});

      expect(mockQueryRun).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        id: 'test-id',
        name: 'Test Key',
      });
    });
  });

  describe('delete', () => {
    it('should delete API key', async () => {
      mockQueryRun.mockReturnValue({ changes: 1 } as any);

      const result = await service.delete('test-id');

      expect(mockQueryRun).toHaveBeenCalledWith(
        'DELETE FROM api_keys WHERE id = ?',
        ['test-id']
      );
      expect(result).toBe(true);
    });

    it('should return false when key not found', async () => {
      mockQueryRun.mockReturnValue({ changes: 0 } as any);

      const result = await service.delete('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('updateLastUsed', () => {
    it('should update last_used_at timestamp', async () => {
      mockQueryRun.mockReturnValue({ changes: 1 } as any);

      await service.updateLastUsed('test-id');

      expect(mockQueryRun).toHaveBeenCalledWith(
        'UPDATE api_keys SET last_used_at = ? WHERE id = ?',
        [expect.any(Number), 'test-id']
      );
    });
  });
});
