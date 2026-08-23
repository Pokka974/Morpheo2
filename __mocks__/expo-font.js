// expo-font needs the ExpoFontLoader native module, which jest-expo does not provide.
// Report fonts as loaded so components render with their real style objects; the
// family name is just a string in tests, so nothing else depends on the real loader.
module.exports = {
  useFonts: () => [true, null],
  loadAsync: () => Promise.resolve(),
  isLoaded: () => true,
  isLoading: () => false,
};
