// The native locale provider is unavailable under jest-expo. Report a fixed English
// locale so language resolution is deterministic in tests.
module.exports = {
  getLocales: () => [{ languageCode: 'en', languageTag: 'en-US', regionCode: 'US' }],
  getCalendars: () => [],
};
