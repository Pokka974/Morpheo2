const expoPreset = require('jest-expo/jest-preset.js');

module.exports = {
  preset: 'jest-expo',

  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|drizzle-orm|@shopify/flash-list)',
  ],
  // Gesture handler asserts its native TurboModule at import time, which no unit
  // test has. Its own setup file stubs the module and swaps the gesture components
  // for plain views, so the constellation's pinch/pan can be rendered in jsdom.
  // Appended, not replaced: jest-expo's preset sets `setupFiles` to React Native's
  // own setup plus its own, and a bare assignment here would silently drop both.
  setupFiles: [
    ...expoPreset.setupFiles,
    '<rootDir>/node_modules/react-native-gesture-handler/jestSetup.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.i18n.js'],

  moduleNameMapper: {
    // Custom NativeModules mock adds .default so jest-expo's setup.js doesn't throw
    // when calling Object.defineProperty on the mock result (RN 0.76 CJS compat fix)
    'react-native/Libraries/BatchedBridge/NativeModules':
      '<rootDir>/src/__mocks__/NativeModules.js',
    // Expo native modules — prevent requireNativeModule() from throwing in unit tests
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.js',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.js',
    // drizzle-orm/expo-sqlite uses the old expo-sqlite/next subpath (removed in v15)
    '^expo-sqlite/next$': '<rootDir>/__mocks__/expo-sqlite.js',
    '^expo-image$': '<rootDir>/__mocks__/expo-image.js',
    '^expo-linear-gradient$': '<rootDir>/__mocks__/expo-linear-gradient.js',
    '^expo-font$': '<rootDir>/__mocks__/expo-font.js',
    '^expo-localization$': '<rootDir>/__mocks__/expo-localization.js',
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@db/(.*)$': '<rootDir>/src/db/$1',
    '^@theme/(.*)$': '<rootDir>/src/theme/$1',
    '^@i18n/(.*)$': '<rootDir>/src/i18n/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__mocks__/**',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
    },
  },
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}', '<rootDir>/src/**/*.test.{ts,tsx}'],
};
