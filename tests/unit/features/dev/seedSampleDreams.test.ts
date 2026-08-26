const mockSaveDream = jest.fn().mockResolvedValue({ id: 'mock-id' });
jest.mock('@features/dream-log/dreamRepository', () => ({
  saveDream: (...args: unknown[]) => mockSaveDream(...args),
}));

const mockSyncPendingDreams = jest.fn().mockResolvedValue(undefined);
jest.mock('@features/dream-log/syncService', () => ({
  syncPendingDreams: () => mockSyncPendingDreams(),
}));

const mockRecordRecurrence = jest.fn().mockResolvedValue(undefined);
jest.mock('@features/recurrence/recurrenceRepository', () => ({
  recordRecurrence: (...args: unknown[]) => mockRecordRecurrence(...args),
}));

import { seedSampleDreams } from '@features/dev/seedSampleDreams';
import { sqlite } from '@db/client';

describe('seedSampleDreams', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveDream.mockResolvedValue({ id: 'mock-id' });
    mockSyncPendingDreams.mockResolvedValue(undefined);
    mockRecordRecurrence.mockResolvedValue(undefined);
  });

  it('saves one local dream per seed entry, all owned by the given userId', async () => {
    const result = await seedSampleDreams('user-1');

    expect(mockSaveDream).toHaveBeenCalledTimes(result.count);
    for (const call of mockSaveDream.mock.calls) {
      expect((call[0] as { userId: string }).userId).toBe('user-1');
    }
  });

  it('inserts one interpretation row per dream via raw SQL', async () => {
    const result = await seedSampleDreams('user-1');

    const insertCalls = (sqlite.runAsync as jest.Mock).mock.calls.filter(([sql]) =>
      (sql as string).includes('INSERT OR REPLACE INTO interpretations')
    );
    expect(insertCalls.length).toBe(result.count);
  });

  it('records keyword, emotion and theme recurrence for every seed dream', async () => {
    const result = await seedSampleDreams('user-1');

    const keywordCalls = mockRecordRecurrence.mock.calls.filter(c => c[2] === 'keyword');
    const emotionCalls = mockRecordRecurrence.mock.calls.filter(c => c[2] === 'emotion');
    const themeCalls = mockRecordRecurrence.mock.calls.filter(c => c[2] === 'theme');
    expect(keywordCalls.length).toBe(result.count);
    expect(emotionCalls.length).toBe(result.count);
    expect(themeCalls.length).toBe(result.count);
  });

  it('triggers a best-effort sync once after seeding all dreams', async () => {
    await seedSampleDreams('user-1');

    expect(mockSyncPendingDreams).toHaveBeenCalledTimes(1);
  });

  it('resolves even if the background sync fails', async () => {
    mockSyncPendingDreams.mockRejectedValueOnce(new Error('offline'));

    await expect(seedSampleDreams('user-1')).resolves.toEqual(
      expect.objectContaining({ count: expect.any(Number) })
    );
  });
});
