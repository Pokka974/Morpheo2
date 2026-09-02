// expo-splash-screen calls requireNativeModule('ExpoSplashScreen') at import time,
// which jest-expo does not register. The functions are recorded as jest mocks so a
// test can assert that the native splash is dismissed exactly once, when its drawn
// replacement has been laid out.
module.exports = {
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
  hide: jest.fn(),
  setOptions: jest.fn(),
};
