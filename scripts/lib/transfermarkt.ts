/**
 * Shared Transfermarkt scraping library.
 *
 * Used by scrape-league.ts (top-5 domestic leagues), scrape-ucl.ts (Champions
 * League) and scrape-wc.ts (national teams). Pulls each club's FULL first-team
 * squad (the kader page, ~26 players) plus season performance data
 * (appearances / minutes / goals / assists), and derives an OVR from an
 * age-and-playing-time-adjusted market-value model.
 *
 * OVRs are still a derived approximation, not canonical ratings — but the
 * age + minutes corrections fix market value's two big biases: it overrates
 * untested prospects (potential premium) and underrates ageing stars
 * (short-career discount). Spot-check before shipping.
 */
import { parse, HTMLElement } from 'node-html-parser'

export const BASE = 'https://www.transfermarkt.com'
export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function fetchDoc(url: string, attempt = 1): Promise<HTMLElement> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } })
  if (res.status !== 200) {
    if (attempt < 4) { await sleep(2500 * attempt); return fetchDoc(url, attempt + 1) }
    throw new Error(`GET ${url} → ${res.status}`)
  }
  return parse(await res.text())
}

// ── Transfermarkt position label → in-game position code ──────────────────────
export const POSITION_MAP: Record<string, string> = {
  'Goalkeeper':          'GK',
  'Sweeper':             'CB',
  'Centre-Back':         'CB',
  'Left-Back':           'LB',
  'Right-Back':          'RB',
  'Defensive Midfield':  'CDM',
  'Central Midfield':    'CM',
  'Attacking Midfield':  'CAM',
  'Left Midfield':       'LM',
  'Right Midfield':      'RM',
  'Left Winger':         'LW',
  'Right Winger':        'RW',
  'Second Striker':      'ST',
  'Centre-Forward':      'ST',
}

// Country (Transfermarkt English name) → demonym, matching the existing seed style.
export const DEMONYM: Record<string, string> = {
  'Spain': 'Spanish', 'France': 'French', 'Germany': 'German', 'Italy': 'Italian',
  'England': 'English', 'Portugal': 'Portuguese', 'Netherlands': 'Dutch',
  'Belgium': 'Belgian', 'Brazil': 'Brazilian', 'Argentina': 'Argentine',
  'Croatia': 'Croatian', 'Switzerland': 'Swiss', 'Denmark': 'Danish',
  'Sweden': 'Swedish', 'Norway': 'Norwegian', 'Austria': 'Austrian',
  'Poland': 'Polish', 'Serbia': 'Serbian', 'Turkey': 'Turkish',
  'Türkiye': 'Turkish', 'Ukraine': 'Ukrainian', 'Greece': 'Greek',
  'Scotland': 'Scottish', 'Wales': 'Welsh', 'Ireland': 'Irish',
  'United States': 'American', 'Mexico': 'Mexican', 'Canada': 'Canadian',
  'Uruguay': 'Uruguayan', 'Colombia': 'Colombian', 'Chile': 'Chilean',
  'Morocco': 'Moroccan', 'Senegal': 'Senegalese', 'Nigeria': 'Nigerian',
  'Ghana': 'Ghanaian', 'Egypt': 'Egyptian', 'Ivory Coast': 'Ivorian',
  "Cote d'Ivoire": 'Ivorian', 'Cameroon': 'Cameroonian', 'Algeria': 'Algerian',
  'Japan': 'Japanese', 'Korea, South': 'South Korean', 'Australia': 'Australian',
  'Czech Republic': 'Czech', 'Slovakia': 'Slovak', 'Slovenia': 'Slovenian',
  'Hungary': 'Hungarian', 'Romania': 'Romanian', 'Russia': 'Russian',
  'Georgia': 'Georgian', 'Albania': 'Albanian', 'Finland': 'Finnish',
  'Ecuador': 'Ecuadorian', 'Peru': 'Peruvian', 'Paraguay': 'Paraguayan',
  'Venezuela': 'Venezuelan', 'Bolivia': 'Bolivian', 'Iran': 'Iranian',
  'Israel': 'Israeli', 'Armenia': 'Armenian', 'Tunisia': 'Tunisian',
  'Mali': 'Malian', 'Guinea': 'Guinean', 'Gabon': 'Gabonese',
  'DR Congo': 'Congolese', 'Congo': 'Congolese', 'Angola': 'Angolan',
  'Zambia': 'Zambian', 'Cape Verde': 'Cape Verdean', 'Jamaica': 'Jamaican',
  'Costa Rica': 'Costa Rican', 'Uzbekistan': 'Uzbek', 'Saudi Arabia': 'Saudi',
  'Qatar': 'Qatari', 'New Zealand': 'New Zealander', 'South Africa': 'South African',
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

// 3-letter short code from the most distinctive word in the club/nation name.
export function shortName(name: string): string {
  const stop = new Set(['fc', 'cf', 'ac', 'as', 'sc', 'ssc', 'rc', 'sl', 'sk', 'if', 'bk', 'club', 'de', 'the'])
  const words = name.split(/\s+/).map(w => w.replace(/[^A-Za-z]/g, '')).filter(Boolean)
  const main = words.filter(w => !stop.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0] ?? words[0] ?? name
  return main.slice(0, 3).toUpperCase()
}

// "€1.50m" / "€500k" / "€90.00m" → millions of euros (0 when absent).
export function parseValue(raw: string): number {
  const m = raw.replace(/\s/g, '').match(/€([\d.]+)(m|k|bn)?/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = (m[2] || '').toLowerCase()
  if (unit === 'bn') return n * 1000
  if (unit === 'k')  return n / 1000
  return n
}

// "2.226'" / "1.234" / "-" → integer (thousands dot stripped).
function parseInt2(raw: string | undefined): number {
  if (!raw) return 0
  const m = raw.replace(/[.\s']/g, '').match(/\d+/)
  return m ? parseInt(m[0], 10) : 0
}

const clamp = (n: number, lo = 40, hi = 99) => Math.round(Math.min(hi, Math.max(lo, n)))

// ── Improved OVR model ────────────────────────────────────────────────────────
// base from market value (log curve), then two corrections:
//   • AGE: remove the "potential premium" young stars carry in MV, and add back
//     the "short-career discount" on 30+ players, so OVR reflects current
//     ability rather than resale value.
//   • PLAYING TIME: nudge by minutes share within the squad (full-time starter
//     up, fringe player down) — competition-agnostic (normalised to the squad's
//     most-used player, so it works for leagues, the CL and national teams).
export type OvrInputs = {
  marketValue: number     // € millions
  age: number | null
  minutes: number         // season minutes (0 if unknown)
  maxSquadMinutes: number // most minutes by any squadmate (0 if unknown)
}
export function deriveOvr({ marketValue, age, minutes, maxSquadMinutes }: OvrInputs): number {
  const base = marketValue > 0 ? 73 + 8 * Math.log10(marketValue) : 64

  let ageAdj = 0
  if (age != null && age > 0) {
    if (age <= 23)      ageAdj = -(24 - age) * 0.9   // 18yo → −5.4 (strip potential premium)
    else if (age >= 30) ageAdj = (age - 29) * 1.1    // 34yo → +5.5 (recover ageing-star discount)
  }

  let playAdj = 0
  if (minutes > 0 && maxSquadMinutes > 0) {
    const share = Math.min(1, minutes / maxSquadMinutes)
    playAdj = (share - 0.5) * 4                       // starter +2 … benchwarmer −2
  }

  return clamp(base + ageAdj + playAdj, 58, 93)
}

// Attribute spread per position, offsets from OVR.
type Attr = { attack: number; defense: number; physical: number; pace: number; technical: number }
export function attributes(pos: string, o: number): Attr {
  const A: Record<string, Attr> = {
    GK:  { attack: -45, defense:  0,  physical: -8,  pace: -28, technical: -14 },
    CB:  { attack: -28, defense:  4,  physical:  3,  pace: -10, technical: -12 },
    LB:  { attack: -8,  defense:  0,  physical: -6,  pace:  5,  technical: -6 },
    RB:  { attack: -8,  defense:  0,  physical: -6,  pace:  5,  technical: -6 },
    CDM: { attack: -12, defense:  3,  physical:  1,  pace: -9,  technical: -3 },
    CM:  { attack: -4,  defense: -5,  physical: -5,  pace: -5,  technical:  3 },
    CAM: { attack:  3,  defense: -20, physical: -11, pace: -1,  technical:  5 },
    LM:  { attack: -2,  defense: -15, physical: -9,  pace:  5,  technical:  1 },
    RM:  { attack: -2,  defense: -15, physical: -9,  pace:  5,  technical:  1 },
    LW:  { attack:  0,  defense: -46, physical: -14, pace:  8,  technical: -4 },
    RW:  { attack:  0,  defense: -46, physical: -14, pace:  8,  technical: -4 },
    ST:  { attack:  4,  defense: -40, physical: -2,  pace:  1,  technical: -6 },
  }
  const d = A[pos] ?? A.CM
  const paceFloor = pos === 'GK' ? 28 : 40
  return {
    attack:    clamp(o + d.attack),
    defense:   clamp(o + d.defense),
    physical:  clamp(o + d.physical),
    pace:      clamp(o + d.pace, paceFloor),
    technical: clamp(o + d.technical),
  }
}

// ── Parsing ───────────────────────────────────────────────────────────────────
export type RawPlayer = {
  slug: string                // profile slug, used to join kader ↔ performance
  name: string
  nationality: string
  birth_year: number | null
  primary_position: string
  marketValue: number         // € millions
  apps: number
  minutes: number
  goals: number
  assists: number
}

// A row from the kader (squad) page: name, position, DOB, nationality, value.
export function parseKaderRow(row: HTMLElement): Omit<RawPlayer, 'apps' | 'minutes' | 'goals' | 'assists'> | null {
  const link = row.querySelector('td.posrela .hauptlink a')
  if (!link) return null
  const name = link.text.trim()
  const href = link.getAttribute('href') || ''
  const slug = (href.match(/^\/([^/]+)\/profil/) || [])[1] || slugify(name)

  const posCell = row.querySelectorAll('td.posrela .inline-table tr')[1]?.querySelector('td')
  const pos = POSITION_MAP[posCell?.text.trim() || '']
  if (!pos) return null

  const tds = row.childNodes.filter((n: any) => n.rawTagName === 'td') as HTMLElement[]
  const dob = tds[2]?.text.trim() || ''
  const birthYr = (dob.match(/\/(\d{4})/) || dob.match(/(\d{4})/) || [])[1]
  const natTitle = tds[3]?.querySelector('img.flaggenrahmen')?.getAttribute('title') || ''
  const valueRaw = row.querySelector('td.rechts.hauptlink a')?.text
               || row.querySelector('td.rechts')?.text || ''

  return {
    slug,
    name,
    nationality: DEMONYM[natTitle] || natTitle || 'Unknown',
    birth_year: birthYr ? parseInt(birthYr, 10) : null,
    primary_position: pos,
    marketValue: parseValue(valueRaw),
  }
}

// Performance page → { slug → { apps, minutes, goals, assists } }.
// Column layout (validated): td[5]=Appearances, td[6]=Goals, td[7]=Assists,
// trailing td.rechts = Minutes ("2.226'").
export type Perf = { apps: number; minutes: number; goals: number; assists: number }
export function parsePerf(doc: HTMLElement): Map<string, Perf> {
  const out = new Map<string, Perf>()
  const rows = doc.querySelectorAll('table.items > tbody > tr.odd, table.items > tbody > tr.even')
  for (const row of rows) {
    const link = row.querySelector('td.posrela .hauptlink a') || row.querySelector('.hauptlink a')
    const slug = ((link?.getAttribute('href') || '').match(/^\/([^/]+)\/profil/) || [])[1]
    if (!slug) continue
    const tds = row.childNodes.filter((n: any) => n.rawTagName === 'td') as HTMLElement[]
    const minsCell = row.querySelector('td.rechts')
    out.set(slug, {
      apps:    parseInt2(tds[5]?.text),
      goals:   parseInt2(tds[6]?.text),
      assists: parseInt2(tds[7]?.text),
      minutes: parseInt2(minsCell?.text),
    })
  }
  return out
}

// ── Final seed shape ──────────────────────────────────────────────────────────
export type SeedPlayer = {
  id: string; name: string; nationality: string; birth_year: number | null
  primary_position: string; secondary_positions: string[]
  ovr: number; attack: number; defense: number; physical: number; pace: number; technical: number
  goals: number; assists: number; appearances: number; is_icon: number
}

// Turn merged raw players into final seed players: OVR (needs the squad's max
// minutes for the playing-time term) + attributes + stable ids.
export function finalizePlayers(raw: RawPlayer[], season: number, idSuffix: string): SeedPlayer[] {
  const maxMinutes = raw.reduce((m, p) => Math.max(m, p.minutes), 0)
  return raw.map(p => {
    const age = p.birth_year ? season - p.birth_year : null
    const ovr = deriveOvr({ marketValue: p.marketValue, age, minutes: p.minutes, maxSquadMinutes: maxMinutes })
    const attr = attributes(p.primary_position, ovr)
    const slugId = p.slug.replace(/-/g, '_')
    return {
      id: idSuffix ? `${slugId}_${idSuffix}` : slugId,
      name: p.name,
      nationality: p.nationality,
      birth_year: p.birth_year,
      primary_position: p.primary_position,
      secondary_positions: [],
      ovr, ...attr,
      goals: p.primary_position === 'GK' ? 0 : p.goals,
      assists: p.assists,
      appearances: p.apps,
      is_icon: 0,
    }
  })
}

// ── Club squad fetch (kader + performance, merged) ────────────────────────────
export async function fetchClubSquad(
  slug: string, vereinId: string, season: number, compCode: string,
  opts: { cap?: number } = {},
): Promise<{ name: string; players: RawPlayer[] }> {
  const cap = opts.cap ?? 30
  const kaderDoc = await fetchDoc(`${BASE}/${slug}/kader/verein/${vereinId}/saison_id/${season}/plus/1`)
  const name = (kaderDoc.querySelector('h1.data-header__headline-wrapper')?.text
             || kaderDoc.querySelector('h1')?.text || slug).replace(/\s+/g, ' ').trim()

  const kRows = kaderDoc.querySelectorAll('table.items > tbody > tr.odd, table.items > tbody > tr.even')
  const base = kRows.map(parseKaderRow).filter((p): p is NonNullable<typeof p> => p !== null)
  if (base.length === 0) throw new Error(`no players parsed for ${name}`)

  // performance page (best-effort — degrades to MV+age if it fails)
  let perf = new Map<string, Perf>()
  try {
    await sleep(900)
    const perfDoc = await fetchDoc(`${BASE}/${slug}/leistungsdaten/verein/${vereinId}/reldata/${compCode}%26${season}/plus/1`)
    perf = parsePerf(perfDoc)
  } catch { /* keep going with market value + age only */ }

  let players: RawPlayer[] = base.map(p => {
    const pf = perf.get(p.slug)
    return { ...p, apps: pf?.apps ?? 0, minutes: pf?.minutes ?? 0, goals: pf?.goals ?? 0, assists: pf?.assists ?? 0 }
  })

  // Full first-team squad: keep the kader (already the senior squad), but cap to
  // avoid the odd 30+ entry, ranking by market value. Always keep ≥1 keeper.
  players.sort((a, b) => b.marketValue - a.marketValue)
  let top = players.slice(0, cap)
  if (!top.some(p => p.primary_position === 'GK')) {
    const gk = players.find(p => p.primary_position === 'GK')
    if (gk) top[top.length - 1] = gk
  }
  return { name, players: top }
}

// ── National teams ────────────────────────────────────────────────────────────
// NT kader pages have a different row layout to clubs: fixed 5 cells
// (#, player[name+pos], age, flag, market value) and no DOB — only current age.
// Birth year is derived from age; nationality is the nation itself; performance
// data is skipped (NT minutes are split across qualifiers/Nations League/friendlies).
export function parseNationKaderRow(row: HTMLElement, currentYear: number, demonym: string): RawPlayer | null {
  const tds = row.childNodes.filter((n: any) => n.rawTagName === 'td') as HTMLElement[]
  const cell = tds[1]
  if (!cell) return null
  const link = cell.querySelector('.hauptlink a') || cell.querySelector('a')
  const name = link?.text.trim()
  if (!name) return null
  const slug = ((link?.getAttribute('href') || '').match(/^\/([^/]+)\/profil/) || [])[1] || slugify(name)
  const pos = POSITION_MAP[cell.querySelectorAll('.inline-table tr')[1]?.querySelector('td')?.text.trim() || '']
  if (!pos) return null
  const age = parseInt((tds[2]?.text.trim() || '').replace(/\D/g, ''), 10)
  const valueRaw = row.querySelector('td.rechts.hauptlink a')?.text || row.querySelector('td.rechts')?.text || ''
  return {
    slug, name,
    nationality: demonym,
    birth_year: age ? currentYear - age : null,
    primary_position: pos,
    marketValue: parseValue(valueRaw),
    apps: 0, minutes: 0, goals: 0, assists: 0,
  }
}

export async function fetchNationSquad(
  slug: string, vereinId: string, season: number, demonym: string,
  opts: { cap?: number } = {},
): Promise<{ name: string; players: RawPlayer[] }> {
  const cap = opts.cap ?? 26
  const doc = await fetchDoc(`${BASE}/${slug}/kader/verein/${vereinId}/saison_id/${season}`)
  const name = (doc.querySelector('h1.data-header__headline-wrapper')?.text
             || doc.querySelector('h1')?.text || slug).replace(/\s+/g, ' ').trim()
  const rows = doc.querySelectorAll('table.items > tbody > tr.odd, table.items > tbody > tr.even')
  const all = rows.map(r => parseNationKaderRow(r, season, demonym)).filter((p): p is RawPlayer => p !== null)
  if (all.length === 0) throw new Error(`no players parsed for ${name}`)
  // Best ~26 by market value (NT call-up lists run to ~50); always keep a keeper.
  all.sort((a, b) => b.marketValue - a.marketValue)
  const top = all.slice(0, cap)
  if (!top.some(p => p.primary_position === 'GK')) {
    const gk = all.find(p => p.primary_position === 'GK')
    if (gk) top[top.length - 1] = gk
  }
  return { name, players: top }
}

// Build a nation-name → { slug, vereinId } map from the FIFA world ranking
// (paginated, ~25 per page). Enough pages to cover all WC participants.
export async function fetchNationIndex(pages = 10): Promise<Map<string, { slug: string; vereinId: string; name: string }>> {
  const out = new Map<string, { slug: string; vereinId: string; name: string }>()
  for (let p = 1; p <= pages; p++) {
    const doc = await fetchDoc(`${BASE}/statistik/weltrangliste?page=${p}`)
    const rows = doc.querySelectorAll('table.items > tbody > tr.odd, table.items > tbody > tr.even')
    if (rows.length === 0) break
    for (const row of rows) {
      const a = row.querySelector('a[href*="/verein/"]')
      const href = a?.getAttribute('href') || ''
      const m = href.match(/^\/([^/]+)\/[^/]+\/verein\/(\d+)/)
      const name = a?.text.trim() || a?.querySelector('img')?.getAttribute('alt')?.trim()
      if (m && name) out.set(name.toLowerCase(), { slug: m[1], vereinId: m[2], name })
    }
    await sleep(800)
  }
  return out
}

// Parse a competition/participants page → unique { slug, vereinId } clubs.
export function parseParticipants(doc: HTMLElement): { slug: string; vereinId: string }[] {
  const seen = new Map<string, { slug: string; vereinId: string }>()
  for (const a of doc.querySelectorAll('a')) {
    const m = (a.getAttribute('href') || '').match(/^\/([^/]+)\/(?:startseite|kader|spielplan)\/verein\/(\d+)/)
    if (m && !seen.has(m[2])) seen.set(m[2], { slug: m[1], vereinId: m[2] })
  }
  return [...seen.values()]
}
