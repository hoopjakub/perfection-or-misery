/**
 * Champions League squad scraper (Transfermarkt → seed JSON).
 *
 *   npx tsx scripts/scrape-ucl.ts
 *
 * Pulls the 36 participants of the 2025-26 UEFA Champions League, then the
 * strongest 15 players of each squad (by market value), and writes them to
 * scripts/seed/champions_league.json in the exact shape build-db.ts expects.
 *
 * IDs get a `_ucl` suffix (like national teams get `_nt`) so a CL "Arsenal"
 * never collides with the Premier League "Arsenal" — the players/clubs tables
 * are INSERT-OR-IGNORE on a TEXT primary key, so colliding ids get silently
 * dropped.
 *
 * OVRs are DERIVED from market value (a log curve) with attributes split by a
 * positional archetype. They're a reasonable approximation, not canonical
 * ratings — spot-check the output before shipping.
 */
import { parse, HTMLElement } from 'node-html-parser'
import fs from 'fs'
import path from 'path'

const SEASON           = 2025
const PLAYERS_PER_TEAM = 15
const OUT_FILE         = path.join(__dirname, 'seed', 'champions_league.json')
const PARTICIPANTS_URL = `https://www.transfermarkt.com/uefa-champions-league/teilnehmer/pokalwettbewerb/CL/saison_id/${SEASON}`
const BASE             = 'https://www.transfermarkt.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function fetchDoc(url: string, attempt = 1): Promise<HTMLElement> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } })
  if (res.status !== 200) {
    if (attempt < 3) { await sleep(2500); return fetchDoc(url, attempt + 1) }
    throw new Error(`GET ${url} → ${res.status}`)
  }
  return parse(await res.text())
}

// ── Transfermarkt position label → in-game position code ──────────────────────
const POSITION_MAP: Record<string, string> = {
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

// Country (Transfermarkt English name) → demonym, matching existing seed style.
const DEMONYM: Record<string, string> = {
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
  'Costa Rica': 'Costa Rican', 'Nigeria ': 'Nigerian', 'Uzbekistan': 'Uzbek',
}

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

// 3-letter short code from the most distinctive word in the club name.
function shortName(name: string): string {
  const stop = new Set(['fc', 'cf', 'ac', 'sc', 'as', 'ssc', 'rc', 'sl', 'sk', 'if', 'bk', 'club', 'de', 'the'])
  const words = name.split(/\s+/).map(w => w.replace(/[^A-Za-z]/g, '')).filter(Boolean)
  const main = words.filter(w => !stop.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0] ?? words[0] ?? name
  return main.slice(0, 3).toUpperCase()
}

// "€1.50m" / "€500k" / "€90.00m" → millions of euros (0 when absent).
function parseValue(raw: string): number {
  const m = raw.replace(/\s/g, '').match(/€([\d.]+)(m|k|bn)?/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = (m[2] || '').toLowerCase()
  if (unit === 'bn') return n * 1000
  if (unit === 'k')  return n / 1000
  return n // already millions, or a bare euro figure (rare)
}

// Market value (millions €) → OVR on a log curve. ~€1m→73, €10m→81, €100m→89.
function ovrFromValue(mEur: number): number {
  if (mEur <= 0) return 64
  const ovr = 73 + 8 * Math.log10(mEur)
  return Math.round(Math.min(92, Math.max(60, ovr)))
}

const clamp = (n: number, lo = 40, hi = 99) => Math.round(Math.min(hi, Math.max(lo, n)))

// Attribute spread per position, offsets from OVR. Tuned so a top winger lands
// near the existing seed example (Vinicius LW 88 → atk88 def~40 phy74 pac96 tec84).
type Attr = { attack: number; defense: number; physical: number; pace: number; technical: number }
function attributes(pos: string, o: number): Attr {
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

type Player = {
  id: string; name: string; nationality: string; birth_year: number | null
  primary_position: string; secondary_positions: string[]
  ovr: number; attack: number; defense: number; physical: number; pace: number; technical: number
  goals: number; assists: number; appearances: number; is_icon: number
  _value: number  // scratch, stripped before write
}

function parsePlayerRow(row: HTMLElement): Player | null {
  const link = row.querySelector('td.posrela .hauptlink a')
  if (!link) return null
  const name = link.text.trim()
  const href = link.getAttribute('href') || ''
  const slug = (href.match(/^\/([^/]+)\/profil/) || [])[1] || slugify(name)

  // detailed position is the 2nd inner-table row of the posrela cell
  const posCell = row.querySelectorAll('td.posrela .inline-table tr')[1]?.querySelector('td')
  const posLabel = posCell?.text.trim() || ''
  const pos = POSITION_MAP[posLabel]
  if (!pos) return null // skip unmapped/odd roles

  const tds = row.childNodes.filter((n: any) => n.rawTagName === 'td') as HTMLElement[]
  const dobCell  = tds[2]?.text.trim() || ''
  const birthYr  = (dobCell.match(/\/(\d{4})/) || [])[1]
  const natTitle = tds[3]?.querySelector('img.flaggenrahmen')?.getAttribute('title') || ''
  const valueRaw = row.querySelector('td.rechts.hauptlink a')?.text
                 || row.querySelector('td.rechts')?.text || ''

  const value = parseValue(valueRaw)
  const ovr = ovrFromValue(value)
  const attr = attributes(pos, ovr)

  return {
    id: `${slug.replace(/-/g, '_')}_ucl`,
    name,
    nationality: DEMONYM[natTitle] || natTitle || 'Unknown',
    birth_year: birthYr ? parseInt(birthYr, 10) : null,
    primary_position: pos,
    secondary_positions: [],
    ovr, ...attr,
    goals: 0, assists: 0, appearances: 0, is_icon: 0,
    _value: value,
  }
}

async function scrapeClub(slug: string, vereinId: string, position: number) {
  const url = `${BASE}/${slug}/kader/verein/${vereinId}/saison_id/${SEASON}/plus/1`
  const doc = await fetchDoc(url)
  const name = (doc.querySelector('h1.data-header__headline-wrapper')?.text
             || doc.querySelector('h1')?.text || slug).replace(/\s+/g, ' ').trim()

  const rows = doc.querySelectorAll('table.items > tbody > tr.odd, table.items > tbody > tr.even')
  const players = rows.map(parsePlayerRow).filter((p): p is Player => p !== null)

  // strongest 15 by market value …
  players.sort((a, b) => b._value - a._value)
  const top = players.slice(0, PLAYERS_PER_TEAM)
  if (top.length === 0) throw new Error(`no players parsed for ${name}`)

  // … but every squad needs a keeper. GKs rarely make the top-15 by value, so
  // if none did, drop the weakest outfielder for the club's best goalkeeper.
  if (!top.some(p => p.primary_position === 'GK')) {
    const bestGK = players.find(p => p.primary_position === 'GK')
    if (bestGK) top[top.length - 1] = bestGK
  }

  const histOvr = Math.round(top.reduce((s, p) => s + p.ovr, 0) / top.length)
  const clubId  = `${slugify(name)}_ucl`

  console.log(`  ${name.padEnd(28)} ${top.length} players · ovr ${histOvr}`)

  return {
    id: clubId,
    league_id: 'ucl_2025',
    name,
    short_name: shortName(name),
    primary_color: '#1E293B',
    secondary_color: '#94A3B8',
    seasons: [{
      id: `${clubId}_${SEASON}`,
      club_id: clubId,
      year_start: SEASON,
      year_end: SEASON + 1,
      historical_ovr: histOvr,
      league_position: position,
      players: top.map(({ _value, ...p }) => p),
    }],
  }
}

async function main() {
  console.log('Fetching participants…')
  const partDoc = await fetchDoc(PARTICIPANTS_URL)
  const seen = new Map<string, { slug: string; vereinId: string }>()
  for (const a of partDoc.querySelectorAll('a')) {
    const m = (a.getAttribute('href') || '').match(/^\/([^/]+)\/startseite\/verein\/(\d+)/)
    if (m && !seen.has(m[2])) seen.set(m[2], { slug: m[1], vereinId: m[2] })
  }
  let clubsMeta = [...seen.values()]
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0
  if (limit > 0) clubsMeta = clubsMeta.slice(0, limit)
  console.log(`Found ${seen.size} clubs${limit ? ` (testing first ${clubsMeta.length})` : ''}.\n`)

  const clubs: any[] = []
  for (let i = 0; i < clubsMeta.length; i++) {
    const { slug, vereinId } = clubsMeta[i]
    try {
      clubs.push(await scrapeClub(slug, vereinId, i + 1))
    } catch (e: any) {
      console.warn(`  ! ${slug}: ${e.message}`)
    }
    await sleep(1200) // be polite
  }

  const out = {
    league: {
      id: 'ucl_2025',
      name: 'UEFA Champions League',
      country: 'Europe',
      games_per_season: 8,
      tier: 1,
    },
    clubs,
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2))
  const totalPlayers = clubs.reduce((s, c) => s + c.seasons[0].players.length, 0)
  console.log(`\n✓ wrote ${clubs.length} clubs / ${totalPlayers} players → ${path.relative(process.cwd(), OUT_FILE)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
