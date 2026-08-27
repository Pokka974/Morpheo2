// The speech recognizer is a native module with no jest-expo stand-in: importing it
// unmocked makes requireNativeModule() throw at module load, which would take down the
// whole dream-log screen suite rather than just its dictation path.
//
// `useSpeechRecognitionEvent` is a no-op hook here. Tests that need to drive dictation
// should capture the handler themselves — jest.mock() this module in the test file and
// invoke the registered listener directly.
module.exports = {
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, status: 'granted' })),
    getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, status: 'granted' })),
  },
  useSpeechRecognitionEvent: jest.fn(),
};
