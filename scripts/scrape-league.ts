/**
 * Domestic league squad scraper (Transfermarkt → seed JSON).
 *
 *   npx tsx scripts/scrape-league.ts                 # all top-5 leagues
 *   npx tsx scripts/scrape-league.ts premier_league  # one league
 *   LIMIT=2 npx tsx scripts/scrape-league.ts la_liga # first 2 clubs (testing)
 *
 * For each club it pulls the FULL first-team squad (~26) plus season performance
 * (appearances / minutes / goals / assists), and derives OVR via the improved
 * market-value model (see lib/transfermarkt.ts).
 *
 * CURATED DATA IS PRESERVED: when a seed file already exists, each club's id,
 * colours, short name and logo are kept (matched by normalised name); only the
 * player list is refreshed. Newly promoted clubs get generated meta.
 */
import fs from 'fs'
import path from 'path'
import {
  BASE, fetchDoc, sleep, slugify, shortName, parseParticipants, fetchClubSquad, finalizePlayers,
} from './lib/transfermarkt'

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
]

const SEASON  = 2025
const SEED_DIR = path.join(__dirname, 'seed')

// Normalise a club name for matching TM ↔ existing seed. Punctuation → spaces
// first (so "F.C." splits), then drop founding-year numbers and common
// prefixes/suffixes (incl. the leftover single f/c from "F.C.").
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, ' ')
   .replace(/\b\d{2,4}\b/g, ' ')
   .replace(/\b(fc|cf|afc|ssc|ac|as|sc|rc|cd|ud|sd|sv|vfb|vfl|tsg|bsc|club|calcio|de|the|cp|sad|f|c)\b/g, ' ')
   .replace(/\s+/g, ' ').trim()

type ExistingClub = { id: string; short_name: string; primary_color: string; secondary_color: string | null; logo: string | null }

function loadExisting(seedId: string): Map<string, ExistingClub> {
  const file = path.join(SEED_DIR, `${seedId}.json`)
  const out = new Map<string, ExistingClub>()
  if (!fs.existsSync(file)) return out
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    for (const c of data.clubs ?? []) {
      out.set(norm(c.name), {
        id: c.id, short_name: c.short_name,
        primary_color: c.primary_color, secondary_color: c.secondary_color ?? null, logo: c.logo ?? null,
      })
    }
  } catch { /* corrupt/old seed — regenerate from scratch */ }
  return out
}

async function scrapeLeague(cfg: LeagueCfg) {
  console.log(`\n=== ${cfg.name} (${cfg.tmCode}) ===`)
  const existing = loadExisting(cfg.seedId)
  const partDoc = await fetchDoc(`${BASE}/${cfg.tmSlug}/startseite/wettbewerb/${cfg.tmCode}/saison_id/${SEASON}`)
  let clubsMeta = parseParticipants(partDoc)
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0
  if (limit > 0) clubsMeta = clubsMeta.slice(0, limit)
  console.log(`Found ${clubsMeta.length} clubs.`)

  const clubs: any[] = []
  for (let i = 0; i < clubsMeta.length; i++) {
    const { slug, vereinId } = clubsMeta[i]
    try {
      const { name, players: raw } = await fetchClubSquad(slug, vereinId, SEASON, cfg.tmCode, { cap: 30 })
      const cur = existing.get(norm(name))                 // preserve curated identity
      const clubId = cur?.id ?? slugify(name)
      const players = finalizePlayers(raw, SEASON, '')      // clean, suffix-less ids
      const histOvr = Math.round(players.reduce((s, p) => s + p.ovr, 0) / players.length)
      clubs.push({
        id: clubId,
        league_id: cfg.seedId,
        name,
        short_name: cur?.short_name ?? shortName(name),
        primary_color: cur?.primary_color ?? '#1E293B',
        secondary_color: cur?.secondary_color ?? '#94A3B8',
        logo: cur?.logo ?? null,
        seasons: [{
          id: `${clubId}_${SEASON}`, club_id: clubId,
          year_start: SEASON, year_end: SEASON + 1,
          historical_ovr: histOvr, league_position: i + 1,
          players,
        }],
      })
      console.log(`  ${name.padEnd(26)} ${players.length} players · ovr ${histOvr}${cur ? '' : '  (NEW club — generic colours)'}`)
    } catch (e: any) {
      console.warn(`  ! ${slug}: ${e.message}`)
    }
    await sleep(1200)
  }

  const out = {
    league: { id: cfg.seedId, name: cfg.name, country: cfg.country, games_per_season: cfg.games, tier: 1 },
    clubs,
  }
  const file = path.join(SEED_DIR, `${cfg.seedId}.json`)
  fs.writeFileSync(file, JSON.stringify(out, null, 2))
  const total = clubs.reduce((s, c) => s + c.seasons[0].players.length, 0)
  console.log(`✓ wrote ${clubs.length} clubs / ${total} players → ${path.relative(process.cwd(), file)}`)
}

async function main() {
  const which = process.argv[2]
  const targets = which ? LEAGUES.filter(l => l.seedId === which) : LEAGUES
  if (targets.length === 0) {
    console.error(`Unknown league "${which}". Options: ${LEAGUES.map(l => l.seedId).join(', ')}`)
    process.exit(1)
  }
  for (const cfg of targets) await scrapeLeague(cfg)
}

main().catch(e => { console.error(e); process.exit(1) })
