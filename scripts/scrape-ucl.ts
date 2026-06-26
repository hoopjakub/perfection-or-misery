/**
 * Champions League squad scraper (Transfermarkt → seed JSON).
 *
 *   npx tsx scripts/scrape-ucl.ts
 *   LIMIT=2 npx tsx scripts/scrape-ucl.ts   # first 2 clubs (testing)
 *
 * Pulls the participants of the 2025-26 UEFA Champions League, then each club's
 * FULL first-team squad (~26) plus season performance (appearances / minutes /
 * goals / assists), with OVR from the improved market-value model
 * (see lib/transfermarkt.ts). IDs get a `_ucl` suffix so a CL "Arsenal" never
 * collides with the domestic "Arsenal".
 *
 * Existing club identity (colours / short name / logo) is preserved when the
 * seed already has the club; only the player list is refreshed.
 */
import fs from 'fs'
import path from 'path'
import {
  BASE, fetchDoc, sleep, slugify, shortName, parseParticipants, fetchClubSquad, finalizePlayers,
} from './lib/transfermarkt'

const SEASON   = 2025
const SEED_ID  = 'ucl_2025'
const OUT_FILE = path.join(__dirname, 'seed', 'champions_league.json')
const PARTICIPANTS_URL = `${BASE}/uefa-champions-league/teilnehmer/pokalwettbewerb/CL/saison_id/${SEASON}`

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

async function main() {
  const existing = loadExisting()
  console.log('Fetching participants…')
  const partDoc = await fetchDoc(PARTICIPANTS_URL)
  let clubsMeta = parseParticipants(partDoc)
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0
  if (limit > 0) clubsMeta = clubsMeta.slice(0, limit)
  console.log(`Found ${clubsMeta.length} clubs.\n`)

  const clubs: any[] = []
  for (let i = 0; i < clubsMeta.length; i++) {
    const { slug, vereinId } = clubsMeta[i]
    try {
      const { name, players: raw } = await fetchClubSquad(slug, vereinId, SEASON, 'CL', { cap: 30 })
      const cur = existing.get(norm(name))
      const clubId = `${slugify(name)}_ucl`
      const players = finalizePlayers(raw, SEASON, 'ucl')
      const histOvr = Math.round(players.reduce((s, p) => s + p.ovr, 0) / players.length)
      clubs.push({
        id: clubId,
        league_id: SEED_ID,
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
      console.log(`  ${name.padEnd(28)} ${players.length} players · ovr ${histOvr}`)
    } catch (e: any) {
      console.warn(`  ! ${slug}: ${e.message}`)
    }
    await sleep(1200)
  }

  const out = {
    league: { id: SEED_ID, name: 'UEFA Champions League', country: 'Europe', games_per_season: 8, tier: 1 },
    clubs,
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2))
  const total = clubs.reduce((s, c) => s + c.seasons[0].players.length, 0)
  console.log(`\n✓ wrote ${clubs.length} clubs / ${total} players → ${path.relative(process.cwd(), OUT_FILE)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
