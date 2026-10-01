/**
 * The public (legal) build's altered names, drafted for the maintainer to edit
 * (docs/release/01-NAMES-MARKS-AND-THE-LAW.md, L1: real names only in the
 * personal build, unless a lawyer clears them for the public one).
 *
 *   npx tsx scripts/draft-legal-names.ts
 *
 * Writes scripts/legal-names/clubs.csv and players.csv: id, real, altered,
 * review. EDIT THE `altered` COLUMN FREELY: a row that's already in the file
 * is never changed again, so your edits survive every re-run; only clubs and
 * players new to the database get a draft. `review` = yes marks a draft the
 * rules weren't sure of (look at those first). build-db applies the files
 * when it writes players_legal.db.
 *
 * The rules, in the tradition of unlicensed football games ("Man Red"):
 *  - a club keeps its place, which is nobody's mark, and loses the rest of its
 *    name (FC, United, Real, Borussia…), and gets a colour word from its own
 *    kit: Manchester United → Manchester Red, Manchester City → Manchester Sky,
 *    Borussia Dortmund → Dortmund Yellow. Two clubs that would collide take
 *    their second colour too. A name with no place left (Juventus) is drafted
 *    from its colours and country and marked for review.
 *  - a national side keeps its country's name.
 *  - a player becomes an initial and a surname with one vowel changed, read
 *    close but not the name: Robert Lewandowski → R. Lewandawski. A single
 *    name changes the same way.
 * Deterministic: the same database drafts the same names.
 */
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

const db = new Database(process.env.POM_DB ?? path.join(__dirname, '../assets/db/players_v5.db'), { readonly: true })
const OUT = path.join(__dirname, 'legal-names')
mkdirSync(OUT, { recursive: true })

// ── CSV ──────────────────────────────────────────────────────────────────────
type Row = { id: string; real: string; altered: string; review: string }
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let field = '', row: string[] = [], q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (c === '"') q = false; else field += c; continue }
    if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows.slice(1).filter(r => r[0]).map(([id, real, altered, review]) => ({ id, real: real ?? '', altered: altered ?? '', review: review ?? '' }))
}
const load = (file: string) => (existsSync(file) ? parseCsv(readFileSync(file, 'utf8')) : [])
const save = (file: string, rows: Row[]) =>
  writeFileSync(file, ['id,real,altered,review', ...rows.map(r => [r.id, r.real, r.altered, r.review].map(esc).join(','))].join('\n') + '\n')

// ── Clubs ────────────────────────────────────────────────────────────────────
// Words that make a name a club's rather than a place's. Lower case.
const GENERIC = new Set(`fc cf ac as sc sv vfb vfl tsg fk nk hnk gnk sk if bk ik ff aik afc cfc rcd ud cd sd ad ca us ss ssc
  real club athletic athletico atletico atlético sporting olympique olympiacos racing united utd city town rovers wanderers albion hotspur
  borussia eintracht dynamo dinamo lokomotiv spartak cska deportivo calcio inter internazionale sport sportif sportiva sportclub
  stade standard royal union unión association football futbol fútbol fussball fußball clube kulüp kulübü spor
  1. 1 04 05 09 1846 1860 1899 1900 1903 1904 1905 1907 1909 1910 1912 1913 1919 de del la le les los das der des di do
  rb tsv ssv fsv hsv bsc vv sbv psv az nec ado kv kaa krc rsc sv kfc rfc ofi paok aek fcsb cfr fcv hjk ifk gais kfum ffc
  hellas virtus juventus genoa torino villarreal
  arsenal ajax benfica celtic rangers galatasaray fenerbahçe fenerbahce beşiktaş besiktas feyenoord anderlecht olympiakos panathinaikos
  partizan crvena zvezda ferencváros ferencvaros slavia sparta legia wisła wisla`.split(/\s+/).filter(Boolean))
const COLOURS: [string, [number, number, number]][] = [
  ['Red', [220, 30, 40]], ['Claret', [130, 30, 60]], ['Sky', [110, 180, 230]], ['Blue', [30, 70, 200]], ['Navy', [20, 30, 80]],
  ['Green', [30, 140, 60]], ['Yellow', [250, 220, 30]], ['Gold', [200, 160, 50]], ['Orange', [240, 120, 30]], ['Purple', [110, 50, 160]],
  ['White', [245, 245, 245]], ['Black', [20, 20, 20]], ['Grey', [130, 130, 130]],
]
function colourWord(hex: string | null | undefined): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '')
  if (!m) return 'Blue'
  const c = [1, 2, 3].map(i => parseInt(m[i], 16))
  return COLOURS.reduce((best, [w, rgb]) => {
    const d = rgb.reduce((s, v, i) => s + (v - c[i]) ** 2, 0)
    return d < best.d ? { w, d } : best
  }, { w: 'Blue', d: Infinity }).w
}
function placeOf(name: string): string | null {
  // A hyphenated place reads as one word; otherwise the last word that isn't a club's.
  const words = name.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean)
  const kept = words.filter(w => !GENERIC.has(w.toLowerCase()) && !/^\d+$/.test(w) && w.length > 1)
  if (!kept.length) return null
  if (kept.length === 1) return kept[0]
  // "Paris Saint-Germain" → Paris; "Bayern Munich" → Munich (the last).
  return kept.find(w => w.includes('-')) ? kept[0] : kept[kept.length - 1]
}

const clubRows = load(path.join(OUT, 'clubs.csv'))
const clubKnown = new Map(clubRows.map(r => [r.id, r]))
const clubs = db.prepare('SELECT id, name, league_id, primary_color, secondary_color FROM clubs ORDER BY id').all() as
  { id: string; name: string; league_id: string; primary_color: string | null; secondary_color: string | null }[]
const country = new Map((db.prepare('SELECT id, country FROM leagues').all() as { id: string; country: string }[]).map(l => [l.id, l.country]))
// One altered name per real name (a club is in several competitions' tables).
const byReal = new Map<string, string>(clubRows.map(r => [r.real, r.altered]))
const reviewOf = new Map<string, string>(clubRows.map(r => [r.real, r.review]))
const taken = new Set(clubRows.map(r => r.altered))
let newClubs = 0
for (const c of clubs) {
  if (clubKnown.has(c.id)) continue
  let altered = byReal.get(c.name)
  let review = reviewOf.get(c.name) ?? ''
  if (!altered) {
    if (c.league_id === 'wc_2026') altered = c.name   // a national side: its country's name
    else {
      const place = placeOf(c.name)
      const main = colourWord(c.primary_color), second = colourWord(c.secondary_color)
      const lead = main === 'White' && second !== 'White' ? second : main
      if (!place || place.toLowerCase() === c.name.toLowerCase()) review = 'yes'
      altered = `${place && place.toLowerCase() !== c.name.toLowerCase() ? place : (country.get(c.league_id) ?? 'Club')} ${lead}`
      if (taken.has(altered)) altered = `${altered} & ${second === lead ? main : second}`
      if (taken.has(altered)) { altered = `${altered} ${c.id.slice(0, 3).toUpperCase()}`; review = 'yes' }
    }
    byReal.set(c.name, altered)
    reviewOf.set(c.name, review)
    taken.add(altered)
  }
  clubRows.push({ id: c.id, real: c.name, altered, review })
  newClubs++
}
save(path.join(OUT, 'clubs.csv'), clubRows)

// ── Players ──────────────────────────────────────────────────────────────────
const VOWEL_SWAP: Record<string, string> = { a: 'o', o: 'a', e: 'i', i: 'e', u: 'o', y: 'i', á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ä: 'a', ö: 'o', ü: 'u' }
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }
function alterWord(w: string, seed: number): string {
  // One vowel, never the first letter, chosen by the id: the word still reads, but isn't the name.
  const spots = [...w].map((ch, i) => (i > 0 && VOWEL_SWAP[ch.toLowerCase()] ? i : -1)).filter(i => i >= 0)
  if (!spots.length) return w.length > 3 ? w.slice(0, -1) + (w.endsWith('s') ? 'z' : 's') : w + 'o'
  const i = spots[seed % spots.length], ch = w[i], to = VOWEL_SWAP[ch.toLowerCase()]
  return w.slice(0, i) + (ch === ch.toUpperCase() ? to.toUpperCase() : to) + w.slice(i + 1)
}
function alterPlayer(id: string, name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (!parts.length) return name
  // Seeded by the NAME, not the id: one footballer is several ids (a club's,
  // a European field's, a national side's) and must read the same in all.
  const seed = hash(name)
  if (parts.length === 1) return alterWord(parts[0], seed)
  const surname = parts.slice(1).join(' ')
  return `${parts[0][0]}. ${surname.split(' ').map((w, i, all) => (i === all.length - 1 ? alterWord(w, seed) : w)).join(' ')}`
}
const playerRows = load(path.join(OUT, 'players.csv'))
const playerKnown = new Set(playerRows.map(r => r.id))
const players = db.prepare('SELECT id, name FROM players ORDER BY id').all() as { id: string; name: string }[]
let newPlayers = 0
for (const p of players) {
  if (playerKnown.has(p.id)) continue
  const altered = alterPlayer(p.id, p.name)
  playerRows.push({ id: p.id, real: p.name, altered, review: altered === p.name ? 'yes' : '' })
  newPlayers++
}
save(path.join(OUT, 'players.csv'), playerRows)

const reviewClubs = clubRows.filter(r => r.review === 'yes').length
console.log(`clubs: ${clubRows.length} (${newClubs} new, ${reviewClubs} to review) · players: ${playerRows.length} (${newPlayers} new)`)
console.log('e.g.', clubRows.filter(r => ['man_utd', 'man_city', 'borussia_dortmund', 'real_madrid', 'juventus', 'bayern_munich', 'paris_saint_germain'].some(k => r.id.startsWith(k))).slice(0, 8).map(r => `${r.real} → ${r.altered}${r.review ? ' (review)' : ''}`).join(' · '))
console.log('e.g.', playerRows.slice(0, 4).map(r => `${r.real} → ${r.altered}`).join(' · '))
