/**
 * Custom Champions League scraper (Transfermarkt → ONE combined seed).
 *
 *   npx tsx scripts/scrape-custom-ucl.ts                      # all leagues, season 2025 (2025/26)
 *   SEASON=2025 npx tsx scripts/scrape-custom-ucl.ts
 *   LEAGUES=premier_league,la_liga npx tsx scripts/scrape-custom-ucl.ts
 *   LEAGUES=czech_liga LIMIT=1 npx tsx scripts/scrape-custom-ucl.ts   # dry-run one league to verify its slug
 *
 * Unlike scrape-league.ts (one file per league, many seasons), this writes a
 * SINGLE `scripts/seed/CustomUcl.json` holding EVERY UCL-feeding league's most
 * recent season, with each club tagged by its domestic `league_id` and
 * `league_position` (final-table order). The app's UCL access-list builder
 * (src/engine/cl-access.ts) groups clubs by association rank + finish to derive
 * the real UCL entry list, then simulates qualifying → league phase → knockouts.
 *
 * Static holders (PSG = UCL winner, Aston Villa = UEL winner) are kept as-is;
 * both qualify domestically here, so they arrive via their league finish.
 *
 * Player/club ids are suffixed `_cucl` to stay distinct from the domestic and
 * finals-only UCL seeds.
 */
import fs from 'fs'
import path from 'path'
import {
  BASE, fetchDoc, sleep, slugify, shortName,
  parseParticipants, fetchClubSquad, finalizePlayers, teamStrength,
} from './lib/transfermarkt'
import { fetchCrestColors } from './lib/colors'
import { UCL_LEAGUES, type UclLeagueCfg } from './lib/ucl-leagues'

const SEASON   = process.env.SEASON ? parseInt(process.env.SEASON, 10) : 2025   // 2025 = 2025/26
const OUT_FILE = path.join(__dirname, 'seed', 'CustomUcl.json')
const LIMIT    = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0

type SeedClub = {
  id: string; name: string; short_name: string
  primary_color: string; secondary_color: string | null; logo: string | null
  league_id: string; assoc_rank: number
  league_position: number; year_start: number; year_end: number
  historical_ovr: number; players: any[]
}

// fetchDoc already retries transient HTTP errors a few times internally, but a
// burst of 502s (TM having a brief wobble, or us getting momentarily
// rate-limited mid-run) can still exhaust that. Give the whole participants
// fetch its own extra retry, with a long cool-off, before giving up on a league.
async function fetchParticipantsWithRetry(cfg: UclLeagueCfg, attempts = 3): Promise<{ slug: string; vereinId: string }[]> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try {
      const doc = await fetchDoc(`${BASE}/${cfg.tmSlug}/startseite/wettbewerb/${cfg.tmCode}/saison_id/${SEASON}`)
      return parseParticipants(doc)
    } catch (e: any) {
      lastErr = e
      if (i < attempts - 1) {
        console.warn(`  ! participants attempt ${i + 1}/${attempts} failed (${e.message}) — cooling off 15s…`)
        await sleep(15000)
      }
    }
  }
  throw lastErr
}

async function scrapeLeague(cfg: UclLeagueCfg, out: SeedClub[]): Promise<number> {
  const tag = cfg.verified ? '' : ' (slug unverified)'
  console.log(`\n=== #${cfg.assocRank} ${cfg.name} (${cfg.tmCode})${tag} · ${SEASON}/${(SEASON + 1) % 100} ===`)
  let clubsMeta: { slug: string; vereinId: string }[]
  try {
    clubsMeta = await fetchParticipantsWithRetry(cfg)
  } catch (e: any) {
    console.warn(`  ! participants failed after retries (${e.message}) — SKIPPING league. Check tmSlug/tmCode.`)
    return 0
  }
  if (clubsMeta.length === 0) { console.warn('  ! 0 clubs parsed — SKIPPING (likely wrong slug).'); return 0 }
  if (LIMIT > 0) clubsMeta = clubsMeta.slice(0, LIMIT)
  console.log(`  ${clubsMeta.length} clubs`)

  let added = 0
  for (let i = 0; i < clubsMeta.length; i++) {
    const { slug, vereinId } = clubsMeta[i]
    try {
      const { name, players: raw } = await fetchClubSquad(slug, vereinId, SEASON, cfg.tmCode, { cap: 30 })
      const players = finalizePlayers(raw, SEASON, 'cucl')
      const col = await fetchCrestColors(vereinId).catch(() => ({ primary: '#1E293B', secondary: '#94A3B8' }))
      out.push({
        id: `${slugify(name)}_cucl`, name, short_name: shortName(name),
        primary_color: col.primary, secondary_color: col.secondary, logo: null,
        league_id: cfg.seedId, assoc_rank: cfg.assocRank,
        league_position: i + 1,             // startseite lists final-table order
        year_start: SEASON, year_end: SEASON + 1,
        historical_ovr: teamStrength(players), players,
      })
      added++
      console.log(`    ${String(i + 1).padStart(2)}/${clubsMeta.length} ${name.padEnd(26)} ${String(players.length).padStart(2)}p · ovr ${out[out.length - 1].historical_ovr}`)
    } catch (e: any) {
      console.warn(`    ! ${slug}: ${e.message}`)
    }
    await sleep(1200)
  }
  return added
}

async function main() {
  const only = process.env.LEAGUES ? new Set(process.env.LEAGUES.split(',').map((s: string) => s.trim())) : null
  const targets = only ? UCL_LEAGUES.filter(l => only.has(l.seedId)) : UCL_LEAGUES
  if (targets.length === 0) { console.error('No matching leagues. Options: ' + UCL_LEAGUES.map(l => l.seedId).join(', ')); process.exit(1) }

  console.log(`Custom UCL scrape · season ${SEASON}/${(SEASON + 1) % 100} · ${targets.length} leagues`)
  const clubs: SeedClub[] = []
  const summary: { league: string; clubs: number; ok: boolean }[] = []
  for (const cfg of targets) {
    const before = clubs.length
    const n = await scrapeLeague(cfg, clubs)
    summary.push({ league: cfg.seedId, clubs: n, ok: n > 0 })
  }

  const out = {
    competition: { id: 'custom_ucl', name: 'Champions League — Custom Path', season: SEASON, edition: `${SEASON + 1}-${(SEASON + 2) % 100}` },
    holders: { ucl: 'Paris Saint-Germain', uel: 'Aston Villa' },   // static for now
    leagues: targets.map(l => ({ seedId: l.seedId, name: l.name, country: l.country, assocRank: l.assocRank, format: l.format, games: l.games })),
    clubs,
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2))

  const players = clubs.reduce((s, c) => s + c.players.length, 0)
  console.log(`\n✓ ${clubs.length} clubs · ${players} player-seasons → ${path.relative(process.cwd(), OUT_FILE)}`)
  console.log('  league coverage:')
  for (const s of summary) console.log(`    ${s.ok ? '✓' : '✗'} ${s.league.padEnd(18)} ${s.clubs} clubs`)
  const failed = summary.filter(s => !s.ok).map(s => s.league)
  if (failed.length) console.log(`  ⚠ verify tmSlug for: ${failed.join(', ')}`)
}

main().catch(e => { console.error(e); process.exit(1) })
