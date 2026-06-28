/**
 * Champions League squad scraper (Transfermarkt → seed JSON), multi-season.
 *
 *   npx tsx scripts/scrape-ucl.ts            # 2024 + 2025 editions
 *   SEASONS=2024,2025 npx tsx scripts/scrape-ucl.ts
 *   LIMIT=2 npx tsx scripts/scrape-ucl.ts    # first 2 clubs/season (testing)
 *
 * Pulls each edition's participants, then every club's FULL first-team squad
 * (~26) + season performance, with OVR from the improved market-value model.
 * Clubs are keyed by stable TM verein id and MERGED across editions (a club in
 * both 2024 & 2025 gets two `seasons[]`), so the draft pool can drop you into a
 * randomly-chosen edition. IDs get a `_ucl` suffix. Curated colours/short names
 * preserved from the existing seed.
 */
import fs from 'fs'
import path from 'path'
import {
  BASE, fetchDoc, sleep, slugify, shortName, parseParticipants, fetchClubSquad, finalizePlayers, teamStrength,
} from './lib/transfermarkt'

const SEED_ID  = 'ucl_2025'   // kept stable (getClubSeasonsForMode matches 'ucl_%'); seasons live on club_seasons
const OUT_FILE = path.join(__dirname, 'seed', 'champions_league.json')

const seasons = (process.env.SEASONS ? process.env.SEASONS.split(',').map(s => parseInt(s, 10)) : [2025, 2024])
  .sort((a, b) => b - a)   // newest first (matches curated seed for colours)

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, ' ').replace(/\b\d{2,4}\b/g, ' ')
   .replace(/\b(fc|cf|afc|ssc|ac|as|sc|rc|cd|ud|sd|sv|vfb|vfl|tsg|bsc|club|calcio|de|the|cp|sad|f|c)\b/g, ' ')
   .replace(/\s+/g, ' ').trim()

type ExistingClub = { short_name: string; primary_color: string; secondary_color: string | null; logo: string | null }
function loadExisting(): Map<string, ExistingClub> {
  const out = new Map<string, ExistingClub>()
  if (!fs.existsSync(OUT_FILE)) return out
  try {
    for (const c of JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8')).clubs ?? [])
      out.set(norm(c.name), { short_name: c.short_name, primary_color: c.primary_color, secondary_color: c.secondary_color ?? null, logo: c.logo ?? null })
  } catch { /* regenerate */ }
  return out
}

type ClubAccum = { id: string; name: string; short_name: string; primary_color: string; secondary_color: string | null; logo: string | null; seasons: any[] }

async function main() {
  const existing = loadExisting()
  const byVerein = new Map<string, ClubAccum>()
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0
  console.log(`UEFA Champions League · editions ${seasons.join(', ')}`)

  for (const season of seasons) {
    let clubsMeta: { slug: string; vereinId: string }[]
    try {
      const partDoc = await fetchDoc(`${BASE}/uefa-champions-league/teilnehmer/pokalwettbewerb/CL/saison_id/${season}`)
      clubsMeta = parseParticipants(partDoc)
    } catch (e: any) { console.warn(`  ! ${season}: participants failed (${e.message})`); continue }
    if (limit > 0) clubsMeta = clubsMeta.slice(0, limit)
    console.log(`\n  ${season}/${(season + 1) % 100}: ${clubsMeta.length} clubs`)

    for (let i = 0; i < clubsMeta.length; i++) {
      const { slug, vereinId } = clubsMeta[i]
      try {
        const { name, players: raw } = await fetchClubSquad(slug, vereinId, season, 'CL', { cap: 30 })
        let acc = byVerein.get(vereinId)
        if (!acc) {
          const cur = existing.get(norm(name))
          const clubId = `${slugify(name)}_ucl`
          acc = {
            id: clubId, name,
            short_name: cur?.short_name ?? shortName(name),
            primary_color: cur?.primary_color ?? '#1E293B',
            secondary_color: cur?.secondary_color ?? '#94A3B8',
            logo: cur?.logo ?? null,
            seasons: [],
          }
          byVerein.set(vereinId, acc)
        }
        const players = finalizePlayers(raw, season, 'ucl')
        const histOvr = teamStrength(players)
        acc.seasons.push({ id: `${acc.id}_${season}`, club_id: acc.id, year_start: season, year_end: season + 1, historical_ovr: histOvr, league_position: i + 1, players })
        console.log(`    ${String(i + 1).padStart(2)}/${clubsMeta.length} ${name.padEnd(28)} ${players.length}p · ovr ${histOvr}`)
      } catch (e: any) {
        console.warn(`    ! ${slug} ${season}: ${e.message}`)
      }
      await sleep(1200)
    }
  }

  const clubs = [...byVerein.values()].map(a => ({
    id: a.id, league_id: SEED_ID, name: a.name,
    short_name: a.short_name, primary_color: a.primary_color, secondary_color: a.secondary_color, logo: a.logo,
    seasons: a.seasons.sort((x, y) => x.year_start - y.year_start),
  }))

  const out = { league: { id: SEED_ID, name: 'UEFA Champions League', country: 'Europe', games_per_season: 8, tier: 1 }, clubs }
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2))
  const clubSeasons = clubs.reduce((s, c) => s + c.seasons.length, 0)
  const players = clubs.reduce((s, c) => s + c.seasons.reduce((t: number, se: any) => t + se.players.length, 0), 0)
  console.log(`\n✓ ${clubs.length} clubs · ${clubSeasons} club-seasons · ${players} player-seasons → ${path.relative(process.cwd(), OUT_FILE)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
