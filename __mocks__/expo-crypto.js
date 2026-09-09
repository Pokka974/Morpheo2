'use strict';

module.exports = {
  getRandomBytes: jest.fn(byteCount => new Uint8Array(byteCount)),
  getRandomBytesAsync: jest.fn(async byteCount => new Uint8Array(byteCount)),
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000000'),
};
