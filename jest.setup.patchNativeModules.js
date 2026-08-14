'use strict';
console.log('[PATCH] Running NativeModules patch');

// jest-expo's preset/setup.js expects require('...NativeModules').default to be an object.
// react-native 0.76's jest mock returns a plain CJS object without .default.
// This patch adds .default so Object.defineProperty() calls in jest-expo don't throw.
const NativeModules = require('react-native/Libraries/BatchedBridge/NativeModules');
if (NativeModules && typeof NativeModules === 'object' && !('default' in NativeModules)) {
  NativeModules.default = NativeModules;
}
