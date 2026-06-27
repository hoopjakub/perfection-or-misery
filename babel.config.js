module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets (reanimated 4) MUST be the last plugin. Required so
    // worklet code pulled in transitively (gesture-handler / screens / reanimated)
    // is transformed — without it Hermes fails with "Compiling JS failed: invalid
    // expression" at runtime.
    plugins: ['react-native-worklets/plugin'],
  }
}
