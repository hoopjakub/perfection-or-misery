/**
 * The LEGAL flavour carries no official mark (P8.5-30, docs/release/01 §5.2).
 *
 *   npx tsx scripts/verify-legal-build.ts
 *
 *   • assets/db/players_legal.db: no league or club name with a registered
 *     competition name or the organisations' names in it;
 *   • logoMap.legal.ts maps nothing (no crest, no competition logo);
 *   • every swap metro.config.js makes points at a file that exists;
 *   • the Babel plugin renames a sample of the app's kind of code, and leaves
 *     comments and near-misses alone.
 * The bundle itself is checked by exporting it: `EXPO_PUBLIC_BRAND_MODE=original
 * npx expo export -p web` must contain no file under assets/crests (0 on
 * 1 Oct 2026, against 780 in the personal export).
 */
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { transformSync } from '@babel/core'
import { COMPETITION_MAP, LOGO_MAP } from '../src/lib/logoMap.legal'

const ROOT = path.join(__dirname, '..')
let failures = 0
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`❌ ${msg}`) } }
const MARKS = /UEFA|FIFA|Champions League|Europa League|Conference League|\bPremier League\b|\bLaLiga\b|\bLa Liga\b|\bSerie A\b|\bBundesliga\b|\bLigue 1\b/

// 1. The legal database.
const dbPath = path.join(ROOT, 'assets/db/players_legal.db')
check(fs.existsSync(dbPath), 'assets/db/players_legal.db is missing (npm run build-db writes it)')
if (fs.existsSync(dbPath)) {
  const db = new Database(dbPath, { readonly: true })
  for (const t of ['leagues', 'clubs']) {
    const bad = (db.prepare(`SELECT name FROM ${t}`).all() as { name: string }[]).filter(r => MARKS.test(r.name))
    check(bad.length === 0, `${t} in the legal DB still named with a mark: ${bad.slice(0, 5).map(b => b.name).join(', ')}`)
  }
  // Wave D: the altered names. No club in the legal DB carries its real name
  // (a national side is its country, which is no one's mark), no player with
  // a name carries his real one, and the holders the full path needs are there
  // by id (it finds them by id, since their names changed).
  const full = new Database(path.join(ROOT, 'assets/db/players_v5.db'), { readonly: true })
  const realClub = new Map((full.prepare('SELECT id, name, league_id FROM clubs').all() as { id: string; name: string; league_id: string }[]).map(c => [c.id, c]))
  const realPlayer = new Map((full.prepare('SELECT id, name FROM players').all() as { id: string; name: string }[]).map(p => [p.id, p.name]))
  full.close()
  const sameClubs = (db.prepare('SELECT id, name FROM clubs').all() as { id: string; name: string }[])
    .filter(c => realClub.get(c.id)?.name === c.name && realClub.get(c.id)?.league_id !== 'wc_2026')
  check(sameClubs.length === 0, `${sameClubs.length} clubs keep their real name in the legal DB: ${sameClubs.slice(0, 5).map(c => c.name).join(', ')}`)
  const samePlayers = (db.prepare('SELECT id, name FROM players').all() as { id: string; name: string }[])
    .filter(p => p.name && realPlayer.get(p.id) === p.name)
  check(samePlayers.length === 0, `${samePlayers.length} players keep their real name in the legal DB: ${samePlayers.slice(0, 5).map(p => p.name).join(', ')}`)
  const { EURO_HOLDER_IDS } = require('../src/data/uefa-coefficients')
  for (const id of Object.values(EURO_HOLDER_IDS) as string[]) check(!!db.prepare('SELECT 1 FROM clubs WHERE id = ?').get(id), `the holder ${id} is missing from the legal DB`)
  db.close()
}
// Club facts are free text about real clubs: the public build shows none.
check(/BRAND_MODE === 'real' \? \(?factsData[^:]*: \{\}/.test(fs.readFileSync(path.join(ROOT, 'src/lib/clubFacts.ts'), 'utf8')), 'the legal build shows club facts')

// 2. No crest, no competition logo.
check(Object.keys(LOGO_MAP).length === 0 && Object.keys(COMPETITION_MAP).length === 0, 'logoMap.legal.ts maps something')

// 3. The swaps.
const metro = fs.readFileSync(path.join(ROOT, 'metro.config.js'), 'utf8')
for (const f of ['src/lib/logoMap.legal.ts', 'src/db/dbAsset.legal.ts', 'src/lib/brand.ts', 'src/db/setup.ts']) {
  check(fs.existsSync(path.join(ROOT, f)), `${f} (a metro.config.js swap) doesn't exist`)
}
check(/'\.\/logoMap'/.test(metro) && /'\.\/dbAsset'/.test(metro), 'metro.config.js no longer swaps ./logoMap and ./dbAsset')

// 4. The Babel plugin on a sample, as if it were a file under src/.
const sample = `
  // The UEFA Champions League is the comment's business, not the plugin's.
  const a = 'UEFA Champions League'
  const b = \`Into the \${'Europa League'} and the Conference League\`
  const c = <Text>FIFA World Cup winners</Text>
  const d = 'Serie B and the Leagues Cup stay'
  const e = 'six Champions Leagues'
`
const out = transformSync(sample, {
  filename: path.join(ROOT, 'src', 'sample.tsx'), babelrc: false, configFile: false,
  presets: [['@babel/preset-typescript', { isTSX: true, allExtensions: true }]],
  plugins: ['@babel/plugin-syntax-jsx', path.join(ROOT, 'scripts', 'babel-legal-names.js')],
})?.code ?? ''
check(out.includes("'European Cup'") || out.includes('"European Cup"'), 'plugin left "UEFA Champions League" in a string')
check(out.includes('Europa Cup') && out.includes('Conference Cup'), 'plugin missed a template literal')
check(out.includes('World Cup winners') && !out.includes('FIFA World Cup winners'), 'plugin missed JSX text')
check(out.includes('Serie B and the Leagues Cup stay'), 'plugin renamed a near-miss')
check(out.includes('six European Cups'), 'plugin missed a plural')
check(out.includes('UEFA Champions League is the comment'), 'plugin touched a comment')

// 5. The plugin must leave its own table alone, or the run-time renames (club
// facts, stored run names) go dead in exactly the build that needs them.
const table = fs.readFileSync(path.join(ROOT, 'src', 'data', 'legal-names.js'), 'utf8')
const tableOut = transformSync(table, {
  filename: path.join(ROOT, 'src', 'data', 'legal-names.js'), babelrc: false, configFile: false,
  plugins: [path.join(ROOT, 'scripts', 'babel-legal-names.js')],
})?.code ?? ''
check(tableOut.includes("'UEFA Champions League'") || tableOut.includes('"UEFA Champions League"'), 'plugin rewrote the rename table itself')

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
