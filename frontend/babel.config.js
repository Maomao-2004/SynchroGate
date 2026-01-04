module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          alias: {
            assets: './assets',
            components: './src/components',
            screens: './src/screens',
            utils: './src/utils',
            contexts: './src/contexts',
            api: './src/api',
          },
        },
      ],
      'react-native-reanimated/plugin', // keep this last!
    ],
  };
};
