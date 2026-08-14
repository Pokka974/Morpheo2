'use strict';

const mockStmt = {
  executeSync: jest.fn(() => []),
  executeAsync: jest.fn(async () => ({ rows: [] })),
  finalizeSync: jest.fn(),
};

const mockDb = {
  execSync: jest.fn(),
  prepareSync: jest.fn(() => mockStmt),
  runSync: jest.fn(),
  getAllSync: jest.fn(() => []),
  getFirstSync: jest.fn(() => null),
  getAllAsync: jest.fn(async () => []),
  getFirstAsync: jest.fn(async () => null),
  runAsync: jest.fn(async () => ({ lastInsertRowId: 1, changes: 1 })),
  closeSync: jest.fn(),
};

module.exports = {
  openDatabaseSync: jest.fn(() => mockDb),
  openDatabaseAsync: jest.fn(async () => mockDb),
  SQLiteDatabase: jest.fn(),
};
