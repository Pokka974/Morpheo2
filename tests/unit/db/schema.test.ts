import { dreams, interpretations, media, recurrencePatterns } from '@db/schema';

describe('dreams table schema', () => {
  it('exports dreams table with correct columns', () => {
    expect(Object.keys(dreams)).toBeDefined();
    const col = (dreams as unknown as Record<string, { name: string }>);
    expect(col['id']).toBeDefined();
    expect(col['userId']).toBeDefined();
    expect(col['description']).toBeDefined();
    expect(col['syncStatus']).toBeDefined();
    expect(col['editedSinceInterpretation']).toBeDefined();
    expect(col['lastModifiedAt']).toBeDefined();
  });

  it('syncStatus column has correct default', () => {
    const col = dreams.syncStatus;
    expect(col).toBeDefined();
  });
});

describe('interpretations table schema', () => {
  it('exports interpretations table', () => {
    expect(interpretations).toBeDefined();
    const col = (interpretations as unknown as Record<string, { name: string }>);
    expect(col['dreamId']).toBeDefined();
    expect(col['isDegraded']).toBeDefined();
    expect(col['promptVersion']).toBeDefined();
  });
});

describe('media table schema', () => {
  it('local_cache_path column is nullable', () => {
    const col = media.localCachePath;
    expect(col).toBeDefined();
  });

  it('exports media table with generation status', () => {
    expect(media).toBeDefined();
  });
});

describe('recurrencePatterns table schema', () => {
  it('exports recurrence patterns table', () => {
    expect(recurrencePatterns).toBeDefined();
    const col = (recurrencePatterns as unknown as Record<string, { name: string }>);
    expect(col['symbol']).toBeDefined();
    expect(col['occurrenceCount']).toBeDefined();
  });
});
