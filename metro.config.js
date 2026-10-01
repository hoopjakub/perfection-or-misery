// expo-sqlite's web build ships a wa-sqlite WASM binary — Metro needs to know
// to treat .wasm as a bundleable asset (not try to parse it as JS), and the
// dev server needs the COOP/COEP headers wa-sqlite's SharedArrayBuffer usage
// requires (production hosting needs the same headers — see
// docs/Web & Desktop Deployment.md).
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.assetExts.push('wasm', 'woff2')

// P8.5-30: the two build flavours. Anything but EXPO_PUBLIC_BRAND_MODE=real is
// the LEGAL build, and in it two imports resolve to their legal twins, so what
// the legal build mustn't carry is never `require`d and never bundled:
//   brand.ts → ./logoMap   becomes logoMap.legal.ts (no crests, no competition logos)
//   setup.ts → ./dbAsset   becomes dbAsset.legal.ts (players_legal.db: generic names)
// The names in the app's own strings are the Babel side (babel.config.js). The
// env is read when Metro starts, so switching flavour locally needs
// `npx expo start --clear` (EAS builds start fresh anyway).
const LEGAL = process.env.EXPO_PUBLIC_BRAND_MODE !== 'real'
const src = (...p) => path.join(__dirname, 'src', ...p)
const LEGAL_SWAPS = [
  { from: src('lib', 'brand.ts'), module: './logoMap', to: src('lib', 'logoMap.legal.ts') },
  { from: src('db', 'setup.ts'), module: './dbAsset', to: src('db', 'dbAsset.legal.ts') },
]
const upstreamResolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (LEGAL) {
    // Paths compared normalised: Windows hands Metro either slash and either case.
    const origin = path.resolve(context.originModulePath).toLowerCase()
    const swap = LEGAL_SWAPS.find(s => s.module === moduleName && s.from.toLowerCase() === origin)
    if (swap) return { type: 'sourceFile', filePath: swap.to }
  }
  return upstreamResolve ? upstreamResolve(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform)
}

const originalEnhance = config.server.enhanceMiddleware
config.server.enhanceMiddleware = (metroMiddleware, server) => {
  const withHeaders = (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    // credentialless, not require-corp: require-corp blocks every cross-origin
    // image that doesn't send a Cross-Origin-Resource-Policy header, and
    // Supabase Storage doesn't, so profile pictures (P8-88) drew as empty boxes
    // on the local web. credentialless loads them without cookies and keeps the
    // page cross-origin isolated (Chrome, Edge, Firefox).
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
    metroMiddleware(req, res, next)
  }
  return originalEnhance ? originalEnhance(withHeaders, server) : withHeaders
}

module.exports = config
