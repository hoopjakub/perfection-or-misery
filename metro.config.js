// expo-sqlite's web build ships a wa-sqlite WASM binary — Metro needs to know
// to treat .wasm as a bundleable asset (not try to parse it as JS), and the
// dev server needs the COOP/COEP headers wa-sqlite's SharedArrayBuffer usage
// requires (production hosting needs the same headers — see
// docs/Web & Desktop Deployment.md).
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.assetExts.push('wasm', 'woff2')

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
