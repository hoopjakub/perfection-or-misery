// The personal build installs beside the public one (the maintainer, 11 Oct
// 2026). Both used the package com.yolotime4564.perfectionormisery and the same
// signing key, so installing the public APK from the website replaced the
// personal build as if it were an update: real names left in its kept screens,
// the crests and the World Cup mark gone (the public build has none), and the
// public over-the-air updates arriving on it. The personal build (the real
// names, EXPO_PUBLIC_BRAND_MODE=real: the development, preview-personal and
// production-personal profiles in eas.json, and the local .env) now has a
// package and a name of its own. The public build is unchanged, so build 17's
// updates still reach it.
//
// The links to /r/<run> stay the public build's: the website's assetlinks.json
// names only its package, so the personal one opens them in the browser.
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_BRAND_MODE !== 'real') return config
  return {
    ...config,
    name: 'PoM Personal',
    android: {
      ...config.android,
      package: `${config.android.package}.personal`,
      intentFilters: [],
    },
  }
}
