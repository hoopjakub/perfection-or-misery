/**
 * Club crests and competition marks (P8-12).
 *
 * Transfermarkt's image CDN serves even when its pages don't, and both are
 * plain numbered files — so this is a cheap, page-light job:
 *
 *   club crest        tmssl.akamaized.net/images/wappen/<size>/<vereinId>.png
 *   competition mark  tmssl.akamaized.net/images/logo/header/<tmCode>.png   (lowercased)
 *
 * Getting a club's `vereinId` is the only part that reads a page: one
 * participants page per competition-season lists every club in it with its id
 * and name (20 clubs for one request). Those names are matched to the seeds the
 * same way the league scraper matches them, with `norm`.
 *
 * Everything the app needs is written at scrape time and shipped as files:
 *  - `tm_id` lands on each club in `scripts/seed/*.json`, so a later run (or a
 *    re-scrape) never has to look a club up again;
 *  - the crest itself is saved to `assets/crests/clubs/<vereinId>.png`, so one
 *    real club keeps ONE file however many competitions it appears in (the same
 *    club is `bayern_munich`, `bayern_munich_ucl` and `..._cucl` across seeds);
 *  - `src/lib/logoMap.ts` is regenerated with a static `require` per club id,
 *    because Metro only bundles assets it can see written out.
 *
 * House rules it follows (learned on The Dugout, docs SCRAPE.md): resumable —
 * an existing file is never downloaded twice; a timeout on every request, since
 * `fetch` has no timeout of its own; polite pacing; and ids are taken from what
 * the seeds record, never guessed.
 *
 * Run: npx tsx scripts/scrape-crests.ts
 *   LEAGUES=premier_league,la_liga   only those competitions
 *   FORCE=1                          re-download crests that already exist
 *   REMAP=1                          re-read the pages even when the seeds
 *                                    already carry every club's `tm_id`
 */
import fs from 'fs'
import path from 'path'
import { fetchDoc, BASE, UA, sleep } from './lib/transfermarkt'
import { UCL_LEAGUES } from './lib/ucl-leagues'

const SEED_DIR   = path.join(__dirname, 'seed')
const CREST_DIR  = path.join(__dirname, '..', 'assets', 'crests', 'clubs')
const COMP_DIR   = path.join(__dirname, '..', 'assets', 'crests', 'competitions')
const LOGO_MAP   = path.join(__dirname, '..', 'src', 'lib', 'logoMap.ts')
const IMG        = 'https://tmssl.akamaized.net/images'
const ONLY       = process.env.LEAGUES?.split(',').map(s => s.trim()).filter(Boolean) ?? null
const FORCE      = process.env.FORCE === '1'
// Crests are drawn at 16–24px, so `medium` (~7 kB) is already generous at 3×
// density: `head` is ~25 kB and would put 20 MB of badges in the app for no
// visible gain. `small` (~2.5 kB) if the bundle ever needs to shrink again.
const CREST_SIZE = process.env.CREST_SIZE ?? 'medium'

// The same normalisation the league scraper matches names with, so a club that
// reads as "1.FC Köln" on one page and "FC Cologne" in the seed still meets.
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, ' ').replace(/\b\d{2,4}\b/g, ' ')
   .replace(/\b(fc|cf|afc|ssc|ac|as|sc|rc|cd|ud|sd|sv|vfb|vfl|tsg|bsc|club|calcio|de|the|cp|sad|f|c)\b/g, ' ')
   .replace(/\s+/g, ' ').trim()

// ── Downloading ─────────────────────────────────────────────────────────────
async function download(url: string, to: string): Promise<'saved' | 'skipped' | 'missing'> {
  if (!FORCE && fs.existsSync(to)) return 'skipped'
  // `fetch` has no timeout: one hung request would stall the whole run.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
    if (res.status !== 200) return 'missing'
    const buf = Buffer.from(await res.arrayBuffer())
    // A 153-byte answer is Transfermarkt's "no image" placeholder, not a crest.
    if (buf.length < 500) return 'missing'
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.writeFileSync(to, buf)
    return 'saved'
  } catch { return 'missing' } finally { clearTimeout(timer) }
}

// ── The one page this reads: who played in a competition that season ────────
async function participants(slug: string, code: string, season: number): Promise<Map<string, string>> {
  const out = new Map<string, string>()   // vereinId → club name
  try {
    const doc = await fetchDoc(`${BASE}/${slug}/startseite/wettbewerb/${code}/saison_id/${season}`)
    // Scoped to the clubs table, as the league scraper does: the rest of the
    // page links other competitions' clubs too.
    const scope = doc.querySelector('table.items') ?? doc
    for (const a of scope.querySelectorAll('a')) {
      const m = (a.getAttribute('href') || '').match(/^[/]([^/]+)[/](?:startseite|kader|spielplan)[/]verein[/](\d+)/)
      if (!m) continue
      const name = (a.getAttribute('title') || a.text || '').trim()
      if (name && !out.has(m[2])) out.set(m[2], name)
    }
  } catch (e: any) {
    console.warn(`  ! ${code} ${season}: ${e.message}`)
  }
  return out
}

type Seed = { file: string; data: any }
function loadSeeds(): Seed[] {
  return fs.readdirSync(SEED_DIR).filter(f => f.endsWith('.json')).map(f => ({
    file: path.join(SEED_DIR, f),
    data: JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), 'utf-8')),
  }))
}

/** Every season a seed knows about, newest first — the clubs of each. */
function seasonsOf(data: any): number[] {
  const years = new Set<number>()
  for (const c of data.clubs ?? []) {
    if (typeof c.year_start === 'number') years.add(c.year_start)
    for (const s of c.seasons ?? []) if (typeof s.year_start === 'number') years.add(s.year_start)
  }
  return [...years].sort((a, b) => b - a)
}

async function main() {
  const seeds = loadSeeds()
  const wanted = new Map<string, string[]>()   // norm(name) → the seed ids that want it
  for (const { data } of seeds) for (const c of data.clubs ?? []) {
    if (!c.name) continue
    const k = norm(c.name)
    wanted.set(k, [...(wanted.get(k) ?? []), c.id])
  }
  console.log(`${seeds.length} seeds · ${wanted.size} distinct clubs to find`)

  // ── 1. Names → Transfermarkt ids, from participants pages ─────────────────
  // The five scraped leagues are read across every season their seed holds (a
  // club relegated in 2017 is in no recent list); the rest of Europe is read at
  // the latest season, which is what the custom path's field is built from.
  const leagueSeeds = new Map(seeds.map(s => [path.basename(s.file, '.json'), s.data]))
  const jobs: { slug: string; code: string; season: number }[] = []
  for (const l of UCL_LEAGUES) {
    if (ONLY && !ONLY.includes(l.seedId)) continue
    const seasons = leagueSeeds.has(l.seedId) ? seasonsOf(leagueSeeds.get(l.seedId)) : [2025]
    for (const season of seasons) jobs.push({ slug: l.tmSlug, code: l.tmCode, season })
  }
  // The Champions League's own editions: its field comes from all over Europe.
  if (!ONLY || ONLY.includes('champions_league')) {
    for (const season of seasonsOf(leagueSeeds.get('champions_league') ?? {}))
      jobs.push({ slug: 'uefa-champions-league', code: 'CL', season })
  }

  // Once the seeds carry `tm_id`, the pages have nothing left to teach: a
  // re-run (a different crest size, a missing file) goes straight to the images.
  const clubs = seeds.flatMap(s => s.data.clubs ?? [])
  const mapped = clubs.filter((c: any) => c.tm_id).length
  const skipPages = process.env.REMAP !== '1' && clubs.length > 0 && mapped / clubs.length > 0.9
  if (skipPages) {
    console.log(`  ${mapped}/${clubs.length} clubs already carry tm_id — skipping the pages (REMAP=1 to re-read them)`)
    jobs.length = 0
  }

  const byName = new Map<string, string>()   // norm(name) → vereinId
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]
    const found = await participants(j.slug, j.code, j.season)
    let fresh = 0
    for (const [id, name] of found) { const k = norm(name); if (!byName.has(k)) { byName.set(k, id); fresh++ } }
    console.log(`  [${i + 1}/${jobs.length}] ${j.code} ${j.season}: ${found.size} clubs, ${fresh} new`)
    await sleep(900)   // politely
  }

  // ── 2. The crests themselves ──────────────────────────────────────────────
  let saved = 0, skipped = 0, missing = 0
  const tmIdOf = new Map<string, string>()   // our club id → vereinId
  for (const seed of seeds) {
    let touched = false
    for (const c of seed.data.clubs ?? []) {
      const id = c.tm_id ?? byName.get(norm(c.name ?? ''))
      if (!id) continue
      if (c.tm_id !== id) { c.tm_id = id; touched = true }
      tmIdOf.set(c.id, id)
    }
    if (touched) fs.writeFileSync(seed.file, JSON.stringify(seed.data, null, 2))
  }
  const ids = [...new Set(tmIdOf.values())]
  console.log(`\n${ids.length} distinct crests for ${tmIdOf.size} club entries`)
  for (let i = 0; i < ids.length; i++) {
    const r = await download(`${IMG}/wappen/${CREST_SIZE}/${ids[i]}.png`, path.join(CREST_DIR, `${ids[i]}.png`))
    if (r === 'saved') { saved++; await sleep(250) }
    else if (r === 'skipped') skipped++
    else missing++
    if ((i + 1) % 50 === 0) console.log(`  [${i + 1}/${ids.length}] saved ${saved}, had ${skipped}, missing ${missing}`)
  }

  // ── 3. Competition marks ──────────────────────────────────────────────────
  // The id is the competition's own code, lowercased — never guessed: a probe of
  // guessed cup ids returned the WRONG competition six times in twenty-five.
  const comps: { id: string; code: string }[] = [
    ...UCL_LEAGUES.filter(l => leagueSeeds.has(l.seedId)).map(l => ({ id: l.seedId, code: l.tmCode })),
    { id: 'champions_league', code: 'CL' },
  ]
  let compSaved = 0, compMissing: string[] = []
  for (const c of comps) {
    const r = await download(`${IMG}/logo/header/${c.code.toLowerCase()}.png`, path.join(COMP_DIR, `${c.id}.png`))
    if (r === 'saved') { compSaved++; await sleep(250) } else if (r === 'missing') compMissing.push(c.id)
  }
  // The 2026 World Cup has no Transfermarkt page yet (WM26 404s), so it wears
  // our own drawn mark until one exists. Drop a file in by hand to use it.
  console.log(`competition marks: ${compSaved} saved${compMissing.length ? `, missing: ${compMissing.join(', ')}` : ''}`)

  // ── 4. The registry Metro can see ─────────────────────────────────────────
  writeLogoMap(tmIdOf, comps.map(c => c.id))
  console.log(`\ncrests: ${saved} saved, ${skipped} already had, ${missing} missing`)
}

function writeLogoMap(tmIdOf: Map<string, string>, compIds: string[]) {
  const have = (p: string) => fs.existsSync(p)
  const clubs = [...tmIdOf.entries()]
    .filter(([, tm]) => have(path.join(CREST_DIR, `${tm}.png`)))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, tm]) => `  '${id}': require('../../assets/crests/clubs/${tm}.png'),`)
  const comps = compIds
    .filter(id => have(path.join(COMP_DIR, `${id}.png`)))
    .sort()
    .map(id => `  '${id}': require('../../assets/crests/competitions/${id}.png'),`)
  fs.writeFileSync(LOGO_MAP, `// GENERATED by scripts/scrape-crests.ts — do not edit by hand (P8-12).
//
// Metro only bundles an asset it can see \`require\`d with a literal path, so the
// crests are written out here rather than looked up at runtime. One file per
// real club, keyed by every club id that shares it (the same club appears under
// different ids in the league, Champions League and custom-path seeds).
//
// Nothing outside \`crestFor\` (src/lib/brand.ts) should read these maps.

export const LOGO_MAP: Record<string, number> = {
${clubs.join('\n')}
}

export const COMPETITION_MAP: Record<string, number> = {
${comps.join('\n')}
}

export function getLogo(key: string | null | undefined): number | null {
  if (!key) return null
  return LOGO_MAP[key] ?? null
}

export function getCompetitionLogo(key: string | null | undefined): number | null {
  if (!key) return null
  return COMPETITION_MAP[key] ?? null
}
`)
  console.log(`logoMap.ts: ${clubs.length} clubs, ${comps.length} competitions`)
}

main()
