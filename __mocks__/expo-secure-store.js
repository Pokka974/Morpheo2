'use strict';

const store = {};
module.exports = {
  getItem: jest.fn(async key => store[key] ?? null),
  setItem: jest.fn(async (key, value) => { store[key] = value; }),
  deleteItem: jest.fn(async key => { delete store[key]; }),
  isAvailableAsync: jest.fn(async () => true),
};
