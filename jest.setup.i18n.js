// Components render translated copy, so i18next has to be initialised before the
// first render. Pinned to English so assertions stay language-independent regardless
// of the machine's locale.
require('./src/i18n').initI18n('en');

// Screens read safe-area insets directly. Tests render them without a
// SafeAreaProvider, so use the library's own mock (zero insets, real components).
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);
