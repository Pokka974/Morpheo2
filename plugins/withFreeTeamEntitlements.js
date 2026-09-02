const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Strips the entitlements a free (non-paid) Apple Developer team cannot sign.
 *
 * `expo-notifications` adds `aps-environment` and `expo-apple-authentication`
 * adds `com.apple.developer.applesignin`. Both capabilities require a paid
 * Apple Developer Program membership; with a free team, Xcode refuses to build
 * at all ("Provisioning Profile ... does not support the Push Notifications
 * capability", exit code 65).
 *
 * Setting `EXPO_FREE_TEAM=1` (see `.env.local`, which is machine-local and
 * gitignored) drops those keys so a debug build can be signed and side-loaded
 * onto a tethered device. EAS and any other build never set the flag, so they
 * keep the full entitlements and both features ship intact.
 *
 * Must be listed FIRST in `app.json` -> `expo.plugins`. `withEntitlementsPlist`
 * mods compose in reverse: the last-registered one runs first, so registering
 * this plugin first is what makes its mod run last — after the plugins that add
 * the keys. Listed last, it sees an empty dict and silently does nothing.
 */
const FREE_TEAM_UNSUPPORTED = ['aps-environment', 'com.apple.developer.applesignin'];

const withFreeTeamEntitlements = (config) => {
  if (process.env.EXPO_FREE_TEAM !== '1') {
    return config;
  }

  return withEntitlementsPlist(config, (cfg) => {
    for (const key of FREE_TEAM_UNSUPPORTED) {
      if (key in cfg.modResults) {
        delete cfg.modResults[key];
        console.warn(
          `withFreeTeamEntitlements: removed "${key}" — EXPO_FREE_TEAM=1. ` +
            'This build cannot use push notifications or Sign In with Apple.'
        );
      }
    }
    return cfg;
  });
};

module.exports = withFreeTeamEntitlements;
