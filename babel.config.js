module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@features': './src/features',
            '@services': './src/services',
            '@shared': './src/shared',
            '@db': './src/db',
            '@theme': './src/theme',
            '@i18n': './src/i18n',
          },
        },
      ],
    ],
  };
};
