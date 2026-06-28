/**
 * Domestic league squad scraper (Transfermarkt → seed JSON), multi-season.
 *
 *   npx tsx scripts/scrape-league.ts                 # all top-5, last 10 seasons
 *   npx tsx scripts/scrape-league.ts premier_league  # one league, last 10 seasons
 *   SEASONS=5 npx tsx scripts/scrape-league.ts        # last 5 seasons
 *   FROM=2018 TO=2021 npx tsx scripts/scrape-league.ts la_liga
 *   LIMIT=2 npx tsx scripts/scrape-league.ts serie_a  # first 2 clubs/season (testing)
 *
 * Writes ONE file per league (`scripts/seed/<league>.json`) where each club
 * carries a `seasons[]` entry per year it was in the division — so the DB gets
 * a real back-catalogue (promotion/relegation handled: a club only has seasons
 * for the years it actually featured). Clubs are keyed by their stable TM verein
 * id, so the same club merges across seasons even if its name drifts slightly.
 *
 * Each club-season is the FULL first-team squad (~26) with OVR from the improved
 * market-value + age + playing-time model, and real goals/assists/appearances.
 *
 * Curated club identity (id / colours / short name / logo) is preserved from the
 * existing seed (matched by normalised name); clubs not previously curated get
 * generated meta.
 */
import fs from 'fs'
import path from 'path'
import {
  BASE, fetchDoc, sleep, slugify, shortName, parseParticipants, fetchClubSquad, finalizePlayers, teamStrength,
} from './lib/transfermarkt'
import { fetchCrestColors } from './lib/colors'

type LeagueCfg = {
  seedId: string; tmCode: string; tmSlug: string
  name: string; country: string; games: number
}
const LEAGUES: LeagueCfg[] = [
  { seedId: 'premier_league', tmCode: 'GB1', tmSlug: 'premier-league', name: 'Premier League', country: 'England', games: 38 },
  { seedId: 'la_liga',        tmCode: 'ES1', tmSlug: 'laliga',         name: 'LaLiga',          country: 'Spain',   games: 38 },
  { seedId: 'bundesliga',     tmCode: 'L1',  tmSlug: 'bundesliga',     name: 'Bundesliga',      country: 'Germany', games: 34 },
  { seedId: 'serie_a',        tmCode: 'IT1', tmSlug: 'serie-a',        name: 'Serie A',         country: 'Italy',   games: 38 },
  { seedId: 'ligue_1',        tmCode: 'FR1', tmSlug: 'ligue-1',        name: 'Ligue 1',         country: 'France',  games: 34 },
  // Top-10 (verified TM codes; strong ~10-year data)
  //{ seedId: 'eredivisie',     tmCode: 'NL1', tmSlug: 'eredivisie',         name: 'Eredivisie',     country: 'Netherlands', games: 34 },
  //{ seedId: 'liga_portugal',  tmCode: 'PO1', tmSlug: 'liga-portugal',      name: 'Liga Portugal',  country: 'Portugal',    games: 34 },
  //{ seedId: 'super_lig',      tmCode: 'TR1', tmSlug: 'super-lig',          name: 'Süper Lig',      country: 'Turkey',      games: 34 },
  //{ seedId: 'pro_league',     tmCode: 'BE1', tmSlug: 'jupiler-pro-league', name: 'Pro League',     country: 'Belgium',     games: 30 },
  //{ seedId: 'scottish_prem',  tmCode: 'SC1', tmSlug: 'scottish-premiership', name: 'Scottish Premiership', country: 'Scotland', games: 38 },
]

const LATEST   = 2025
const SEED_DIR = path.join(__dirname, 'seed')

// Season list: FROM..TO if given, else the last SEASONS (default 10) up to LATEST.
function seasonList(): number[] {
  const from = process.env.FROM ? parseInt(process.env.FROM, 10) : null
  const to   = process.env.TO   ? parseInt(process.env.TO, 10)   : null
  if (from && to) return Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const count = process.env.SEASONS ? parseInt(process.env.SEASONS, 10) : 10
  return Array.from({ length: count }, (_, i) => LATEST - i)   // newest → oldest
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, ' ').replace(/\b\d{2,4}\b/g, ' ')
   .replace(/\b(fc|cf|afc|ssc|ac|as|sc|rc|cd|ud|sd|sv|vfb|vfl|tsg|bsc|club|calcio|de|the|cp|sad|f|c)\b/g, ' ')
   .replace(/\s+/g, ' ').trim()

type ExistingClub = { id: string; short_name: string; primary_color: string; secondary_color: string | null; logo: string | null }
function loadExisting(seedId: string): Map<string, ExistingClub> {
  const file = path.join(SEED_DIR, `${seedId}.json`)
  const out = new Map<string, ExistingClub>()
  if (!fs.existsSync(file)) return out
  try {
    for (const c of JSON.parse(fs.readFileSync(file, 'utf-8')).clubs ?? [])
      out.set(norm(c.name), { id: c.id, short_name: c.short_name, primary_color: c.primary_color, secondary_color: c.secondary_color ?? null, logo: c.logo ?? null })
  } catch { /* corrupt/old seed — regenerate */ }
  return out
}

type ClubAccum = {
  id: string; name: string; short_name: string
  primary_color: string; secondary_color: string | null; logo: string | null
  seasons: any[]
}

async function scrapeLeague(cfg: LeagueCfg, seasons: number[]) {
  console.log(`\n=== ${cfg.name} (${cfg.tmCode}) · seasons ${seasons[seasons.length - 1]}–${seasons[0]} ===`)
  const existing = loadExisting(cfg.seedId)
  const byVerein = new Map<string, ClubAccum>()   // stable across seasons
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0

  for (const season of seasons) {
    let clubsMeta: { slug: string; vereinId: string }[]
    try {
      const partDoc = await fetchDoc(`${BASE}/${cfg.tmSlug}/startseite/wettbewerb/${cfg.tmCode}/saison_id/${season}`)
      clubsMeta = parseParticipants(partDoc)
    } catch (e: any) { console.warn(`  ! ${season}: participants failed (${e.message}) — skipping season`); continue }
    if (limit > 0) clubsMeta = clubsMeta.slice(0, limit)
    console.log(`  ${season}/${(season + 1) % 100}: ${clubsMeta.length} clubs`)

    for (let i = 0; i < clubsMeta.length; i++) {
      const { slug, vereinId } = clubsMeta[i]
      try {
        const { name, players: raw } = await fetchClubSquad(slug, vereinId, season, cfg.tmCode, { cap: 30 })
        let acc = byVerein.get(vereinId)
        if (!acc) {
          const cur = existing.get(norm(name))   // newest season seen first → matches the curated 2025 seed
          const clubId = cur?.id ?? slugify(name)
          // Curated colours win; otherwise derive brand colours from the crest.
          const col = cur ? { primary: cur.primary_color, secondary: cur.secondary_color ?? '#94A3B8' }
                          : await fetchCrestColors(vereinId)
          acc = {
            id: clubId, name,
            short_name: cur?.short_name ?? shortName(name),
            primary_color: col.primary,
            secondary_color: col.secondary,
            logo: cur?.logo ?? null,
            seasons: [],
          }
          byVerein.set(vereinId, acc)
        }
        const players = finalizePlayers(raw, season, '')
        const histOvr = teamStrength(players)
        acc.seasons.push({
          id: `${acc.id}_${season}`, club_id: acc.id,
          year_start: season, year_end: season + 1,
          historical_ovr: histOvr, league_position: i + 1,   // startseite lists final-table order
          players,
        })
        console.log(`    ${String(i + 1).padStart(2)}/${clubsMeta.length} ${name.padEnd(28)} ${String(players.length).padStart(2)}p · ovr ${histOvr}`)
      } catch (e: any) {
        console.warn(`    ! ${slug} ${season}: ${e.message}`)
      }
      await sleep(1200)
    }
  }

  const clubs = [...byVerein.values()].map(a => ({
    id: a.id, league_id: cfg.seedId, name: a.name,
    short_name: a.short_name, primary_color: a.primary_color, secondary_color: a.secondary_color, logo: a.logo,
    seasons: a.seasons.sort((x, y) => x.year_start - y.year_start),
  }))

  const out = {
    league: { id: cfg.seedId, name: cfg.name, country: cfg.country, games_per_season: cfg.games, tier: 1 },
    clubs,
  }
  const file = path.join(SEED_DIR, `${cfg.seedId}.json`)
  fs.writeFileSync(file, JSON.stringify(out, null, 2))
  const clubSeasons = clubs.reduce((s, c) => s + c.seasons.length, 0)
  const players = clubs.reduce((s, c) => s + c.seasons.reduce((t: number, se: any) => t + se.players.length, 0), 0)
  console.log(`✓ ${clubs.length} clubs · ${clubSeasons} club-seasons · ${players} player-seasons → ${path.relative(process.cwd(), file)}`)
}

async function main() {
  const which = process.argv[2]
  const targets = which ? LEAGUES.filter(l => l.seedId === which) : LEAGUES
  if (targets.length === 0) {
    console.error(`Unknown league "${which}". Options: ${LEAGUES.map(l => l.seedId).join(', ')}`)
    process.exit(1)
  }
  const seasons = seasonList()
  for (const cfg of targets) await scrapeLeague(cfg, seasons)
}

main().catch(e => { console.error(e); process.exit(1) })
