// The bundled player database (personal build). metro.config.js resolves this
// module to ./dbAsset.legal in the legal build, so each flavour bundles exactly
// one database (P8.5-30).
const DB_ASSET: number = require('../../assets/db/players_v5.db')
export default DB_ASSET
