module.exports = function (api) {
  // Cached per brand mode: the legal build (anything but EXPO_PUBLIC_BRAND_MODE
  // =real) adds the name plugin, so the two flavours must never share a cache.
  // Switching flavour locally still wants `npx expo start --clear`.
  const LEGAL = process.env.EXPO_PUBLIC_BRAND_MODE !== 'real'
  api.cache.using(() => (LEGAL ? 'legal' : 'personal'))
  // babel-preset-expo automatically adds react-native-worklets/plugin (reanimated 4)
  // when the package is installed — do NOT add it again here or the worklet
  // transform double-applies and Hermes fails with "invalid expression".
  return {
    presets: ['babel-preset-expo'],
    // P8.5-30: plain descriptive competition and league names in the legal
    // build (scripts/babel-legal-names.js, the table in src/data/legal-names.js).
    plugins: LEGAL ? ['./scripts/babel-legal-names.js'] : [],
  }
}
