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
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    metroMiddleware(req, res, next)
  }
  return originalEnhance ? originalEnhance(withHeaders, server) : withHeaders
}

module.exports = config
