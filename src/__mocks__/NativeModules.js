'use strict';

// Minimal NativeModules mock compatible with jest-expo 53 + react-native 0.76.
// jest-expo's setup.js expects require('...NativeModules').default to be an object.
// react-native 0.76's CJS module.exports doesn't add .default, causing Object.defineProperty to throw.
const NativeModules = {
  AlertManager: { alertWithArgs: jest.fn() },
  AsyncLocalStorage: {
    multiGet: jest.fn((keys, cb) => process.nextTick(() => cb(null, []))),
    multiSet: jest.fn((entries, cb) => process.nextTick(() => cb(null))),
    multiRemove: jest.fn((keys, cb) => process.nextTick(() => cb(null))),
    multiMerge: jest.fn((entries, cb) => process.nextTick(() => cb(null))),
    clear: jest.fn(cb => process.nextTick(() => cb(null))),
    getAllKeys: jest.fn(cb => process.nextTick(() => cb(null, []))),
  },
  DeviceInfo: {
    getConstants() {
      return {
        Dimensions: {
          window: { fontScale: 2, height: 1334, scale: 2, width: 750 },
          screen: { fontScale: 2, height: 1334, scale: 2, width: 750 },
        },
      };
    },
  },
  DevSettings: { addMenuItem: jest.fn(), reload: jest.fn() },
  ImageLoader: {
    getSize: jest.fn(url => Promise.resolve([320, 240])),
    prefetchImage: jest.fn(),
    prefetchImageWithMetadata: jest.fn(),
    queryCache: jest.fn(),
  },
  ImageViewManager: {
    getSize: jest.fn((uri, success) => process.nextTick(() => success(320, 240))),
    prefetchImage: jest.fn(),
  },
  Linking: {
    openURL: jest.fn(() => Promise.resolve()),
    canOpenURL: jest.fn(() => Promise.resolve(true)),
    getInitialURL: jest.fn(() => Promise.resolve(null)),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  UIManager: {
    RCTView: {},
    RCTText: {},
    RCTScrollView: {},
    setLayoutAnimationEnabledExperimental: jest.fn(),
    measure: jest.fn(),
    measureLayout: jest.fn(),
    measureInWindow: jest.fn(),
    dispatchViewManagerCommand: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
  },
  PlatformConstants: {
    getConstants: () => ({
      isTesting: true,
      reactNativeVersion: { major: 0, minor: 76, patch: 5 },
    }),
  },
};

// Add .default pointing to itself so jest-expo's setup.js can do:
// const mockNativeModules = require('...NativeModules').default;
module.exports = NativeModules;
module.exports.default = NativeModules;
