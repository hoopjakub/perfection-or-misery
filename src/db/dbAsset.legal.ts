// The LEGAL flavour's database (P8.5-30): the same data as players_v5.db with
// competitions and leagues under plain descriptive names (src/data/legal-names.js),
// written by scripts/build-db.ts beside the full one. metro.config.js points
// ./dbAsset here whenever EXPO_PUBLIC_BRAND_MODE isn't `real`.
const DB_ASSET: number = require('../../assets/db/players_legal.db')
export default DB_ASSET
