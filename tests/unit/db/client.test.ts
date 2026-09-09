const DB_ENCRYPTION_KEY = 'aa'.repeat(32);

type MockSqliteDb = {
  execSync: jest.Mock;
  getAllSync: jest.Mock;
  getFirstSync: jest.Mock;
  closeSync: jest.Mock;
};

function setup({ canaryError }: { canaryError?: 'not-a-database' | 'locked' }) {
  let canaryConsumed = false;
  const execSync = jest.fn((sql: string) => {
    if (canaryError && !canaryConsumed && sql.includes('sqlite_master')) {
      canaryConsumed = true;
      throw new Error(
        canaryError === 'not-a-database' ? 'file is not a database' : 'database is locked'
      );
    }
  });
  const db: MockSqliteDb = {
    execSync,
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
    closeSync: jest.fn(),
  };
  const openDatabaseSync = jest.fn(() => db);
  const deleteDatabaseSync = jest.fn();

  jest.doMock('expo-secure-store', () => ({
    getItem: jest.fn(() => DB_ENCRYPTION_KEY),
    setItem: jest.fn(),
  }));
  jest.doMock('expo-crypto', () => ({
    getRandomBytes: jest.fn(() => new Uint8Array(32)),
  }));
  jest.doMock('drizzle-orm/expo-sqlite', () => ({ drizzle: jest.fn(() => ({})) }));
  jest.doMock('expo-sqlite', () => ({
    openDatabaseSync,
    deleteDatabaseSync,
    SQLiteDatabase: jest.fn(),
  }));

  return { execSync, openDatabaseSync, deleteDatabaseSync };
}

describe('src/db/client.ts encrypted database bootstrap', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('keys a healthy encrypted database once and never wipes it', () => {
    const { execSync, openDatabaseSync, deleteDatabaseSync } = setup({});

    require('@db/client');

    expect(openDatabaseSync).toHaveBeenCalledTimes(1);
    expect(deleteDatabaseSync).not.toHaveBeenCalled();
    expect(execSync).toHaveBeenCalledWith(`PRAGMA key = "x'${DB_ENCRYPTION_KEY}'";`);
  });

  it('wipes a pre-encryption plaintext database and re-keys the fresh file', () => {
    const { execSync, openDatabaseSync, deleteDatabaseSync } = setup({
      canaryError: 'not-a-database',
    });

    require('@db/client');

    expect(deleteDatabaseSync).toHaveBeenCalledWith('morpheo.db');
    expect(openDatabaseSync).toHaveBeenCalledTimes(2);
    const keyingCalls = execSync.mock.calls.filter(([sql]) => sql.startsWith('PRAGMA key'));
    expect(keyingCalls).toHaveLength(2);
  });

  it('does not wipe the database for an unrelated error (e.g. a lock), and propagates it instead', () => {
    const { deleteDatabaseSync } = setup({ canaryError: 'locked' });

    expect(() => require('@db/client')).toThrow('database is locked');

    expect(deleteDatabaseSync).not.toHaveBeenCalled();
  });
});
