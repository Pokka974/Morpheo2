import { ExpoStorageService } from '@services/storage/ExpoStorageService';

// Variables must be prefixed with `mock` (case-insensitive) to be allowed in jest.mock() factory
const mockFiles: Record<string, { exists: boolean; size?: number; modificationTime?: number; isDirectory?: boolean }> = {};
let mockDirExists = false;
const mockCreatedDirs: string[] = [];
const mockDeletedPaths: string[] = [];
const mockDownloadedFiles: Array<{ url: string; path: string }> = [];
let mockDirContents: string[] = [];

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file://cache/',
  getInfoAsync: jest.fn(async (path: string, opts?: { size?: boolean }) => {
    if (path.endsWith('morpheo/media/')) {
      return { exists: mockDirExists, isDirectory: true };
    }
    const entry = mockFiles[path];
    if (!entry) return { exists: false };
    return { ...entry };
  }),
  makeDirectoryAsync: jest.fn(async (path: string) => {
    mockDirExists = true;
    mockCreatedDirs.push(path);
  }),
  downloadAsync: jest.fn(async (url: string, path: string) => {
    mockDownloadedFiles.push({ url, path });
    mockFiles[path] = { exists: true, size: 1024, modificationTime: Date.now() };
    return { uri: path, status: 200 };
  }),
  readDirectoryAsync: jest.fn(async () => mockDirContents),
  deleteAsync: jest.fn(async (path: string) => {
    mockDeletedPaths.push(path);
    delete mockFiles[path];
  }),
}));

describe('ExpoStorageService', () => {
  let service: ExpoStorageService;

  beforeEach(() => {
    service = new ExpoStorageService();
    mockDirExists = true;
    mockDirContents = [];
    Object.keys(mockFiles).forEach(k => delete mockFiles[k]);
    mockDownloadedFiles.length = 0;
    mockDeletedPaths.length = 0;
    mockCreatedDirs.length = 0;
  });

  describe('cacheMedia', () => {
    it('creates the cache directory when it does not exist yet', async () => {
      mockDirExists = false;
      await service.cacheMedia('media-001', 'https://example.com/img.jpg');
      expect(mockCreatedDirs.length).toBeGreaterThan(0);
      expect(mockDirExists).toBe(true);
    });

    it('downloads file when not cached', async () => {
      const path = await service.cacheMedia('media-001', 'https://example.com/img.jpg');
      expect(mockDownloadedFiles).toHaveLength(1);
      expect(mockDownloadedFiles[0]?.url).toBe('https://example.com/img.jpg');
      expect(path).toContain('media-001');
    });

    it('returns existing path without re-downloading when already cached', async () => {
      const filePath = 'file://cache/morpheo/media/media-001';
      mockFiles[filePath] = { exists: true, size: 1024, modificationTime: Date.now() };
      await service.cacheMedia('media-001', 'https://example.com/img.jpg');
      expect(mockDownloadedFiles).toHaveLength(0);
    });

    it('sanitizes special characters in mediaId', async () => {
      const path = await service.cacheMedia('media/with/slashes', 'https://example.com/img.jpg');
      expect(path).not.toContain('/with/slashes');
      expect(path).toContain('media_with_slashes');
    });
  });

  describe('isCached', () => {
    it('returns false when file does not exist', async () => {
      const result = await service.isCached('nonexistent');
      expect(result).toBe(false);
    });

    it('returns true when file exists', async () => {
      mockFiles['file://cache/morpheo/media/media-001'] = { exists: true };
      const result = await service.isCached('media-001');
      expect(result).toBe(true);
    });
  });

  describe('getLocalUri', () => {
    it('returns null when not cached', async () => {
      const uri = await service.getLocalUri('nonexistent');
      expect(uri).toBeNull();
    });

    it('returns path when cached', async () => {
      mockFiles['file://cache/morpheo/media/media-001'] = { exists: true };
      const uri = await service.getLocalUri('media-001');
      expect(uri).toContain('media-001');
    });
  });

  describe('evictToLimit', () => {
    it('evicts oldest files until under limit', async () => {
      mockDirContents = ['old-file', 'new-file'];
      mockFiles['file://cache/morpheo/media/old-file'] = { exists: true, size: 60 * 1024 * 1024, modificationTime: 1000 };
      mockFiles['file://cache/morpheo/media/new-file'] = { exists: true, size: 60 * 1024 * 1024, modificationTime: 2000 };

      await service.evictToLimit(80 * 1024 * 1024);
      expect(mockDeletedPaths.length).toBeGreaterThan(0);
      expect(mockDeletedPaths[0]).toContain('old-file');
    });

    it('does nothing when already under limit', async () => {
      mockDirContents = ['small-file'];
      mockFiles['file://cache/morpheo/media/small-file'] = { exists: true, size: 1024, modificationTime: 1000 };

      await service.evictToLimit(200 * 1024 * 1024);
      expect(mockDeletedPaths).toHaveLength(0);
    });

    it('skips directory entries and vanished entries when computing eviction candidates', async () => {
      mockDirContents = ['a-subdir', 'gone-file', 'real-file'];
      mockFiles['file://cache/morpheo/media/a-subdir'] = { exists: true, isDirectory: true, size: 999999, modificationTime: 500 };
      // 'gone-file' has no entry in mockFiles, so getInfoAsync resolves { exists: false }.
      mockFiles['file://cache/morpheo/media/real-file'] = { exists: true, size: 1024, modificationTime: 1000 };

      await service.evictToLimit(0);

      expect(mockDeletedPaths).toEqual(['file://cache/morpheo/media/real-file']);
    });
  });

  describe('clearCache', () => {
    it('deletes all files in cache directory', async () => {
      mockDirContents = ['file-a', 'file-b', 'file-c'];

      await service.clearCache();
      expect(mockDeletedPaths).toHaveLength(3);
    });
  });

  describe('getCacheSize', () => {
    it('returns sum of file sizes', async () => {
      mockDirContents = ['file-a', 'file-b'];
      mockFiles['file://cache/morpheo/media/file-a'] = { exists: true, size: 500, modificationTime: 1000 };
      mockFiles['file://cache/morpheo/media/file-b'] = { exists: true, size: 300, modificationTime: 1000 };

      const size = await service.getCacheSize();
      expect(size).toBe(800);
    });

    it('returns 0 for empty cache', async () => {
      mockDirContents = [];
      const size = await service.getCacheSize();
      expect(size).toBe(0);
    });

    it('excludes directory entries and vanished entries from the total', async () => {
      mockDirContents = ['a-subdir', 'gone-file', 'real-file'];
      mockFiles['file://cache/morpheo/media/a-subdir'] = { exists: true, isDirectory: true, size: 999999 };
      mockFiles['file://cache/morpheo/media/real-file'] = { exists: true, size: 500 };

      const size = await service.getCacheSize();
      expect(size).toBe(500);
    });
  });
});
