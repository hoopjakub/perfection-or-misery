module.exports = function (api) {
  api.cache(true)
  // babel-preset-expo automatically adds react-native-worklets/plugin (reanimated 4)
  // when the package is installed — do NOT add it again here or the worklet
  // transform double-applies and Hermes fails with "invalid expression".
  return {
    presets: ['babel-preset-expo'],
  }
}
