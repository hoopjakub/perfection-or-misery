/**
 * World Cup national-team squad scraper (Transfermarkt → seed JSON).
 *
 *   npx tsx scripts/scrape-wc.ts
 *   LIMIT=3 npx tsx scripts/scrape-wc.ts   # first 3 nations (testing)
 *
 * Refreshes scripts/seed/world_cup.json with each nation's best ~26 by market
 * value (NT call-up lists run to ~50), OVR from the market-value + age model
 * (no playing-time term — NT minutes are split across qualifiers / Nations
 * League / friendlies). Player ids get the `_nt` suffix.
 *
 * The set of 48 nations and their curated ids / colours come from the EXISTING
 * world_cup.json (preserved). Verein ids are resolved from the FIFA world
 * ranking. A nation that can't be matched keeps its existing squad untouched
 * (so nothing is lost) and is reported.
 */
import fs from 'fs'
import path from 'path'
import { fetchNationIndex, fetchNationSquad, finalizePlayers, sleep, DEMONYM } from './lib/transfermarkt'

const SEASON   = 2026
const OUT_FILE = path.join(__dirname, 'seed', 'world_cup.json')

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

// WC-seed name (normalised) → FIFA-ranking name, for the handful that differ.
const ALIAS: Record<string, string> = {
  'united states': 'usa',
  'cabo verde': 'cape verde',
  'dr congo': 'democratic republic of the congo',
  'cote d ivoire': 'ivory coast',
  'korea republic': 'south korea',
  // harmless extras in case the nation set changes between editions
  'czech republic': 'czechia', 'iran': 'ir iran', 'china': 'china pr',
}

async function main() {
  const data = JSON.parse(fs.readFileSync(OUT_FILE, 'utf-8'))
  const nations: any[] = data.clubs ?? []
  console.log(`Loaded ${nations.length} nations from existing seed.`)

  console.log('Building nation → verein-id index from the FIFA ranking…')
  const index = await fetchNationIndex(10)
  const byNorm = new Map<string, { slug: string; vereinId: string }>()
  for (const v of index.values()) byNorm.set(norm(v.name), v)
  console.log(`Indexed ${byNorm.size} national teams.\n`)

  const match = (name: string) => {
    const n = norm(name)
    if (byNorm.has(n)) return byNorm.get(n)
    if (ALIAS[n] && byNorm.has(norm(ALIAS[n]))) return byNorm.get(norm(ALIAS[n]))
    // token-subset fallback (one name's words all appear in the other)
    const toks = n.split(' ')
    for (const [k, v] of byNorm) {
      const kt = k.split(' ')
      if (toks.every(t => kt.includes(t)) || kt.every(t => toks.includes(t))) return v
    }
    return undefined
  }

  let targets = nations
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0
  if (limit > 0) targets = nations.slice(0, limit)

  const misses: string[] = []
  for (const nation of targets) {
    const hit = match(nation.name)
    if (!hit) { misses.push(nation.name); console.warn(`  ? ${nation.name.padEnd(20)} — no ranking match, keeping existing squad`); continue }
    try {
      const demonym = nation.seasons?.[0]?.players?.[0]?.nationality || DEMONYM[nation.name] || nation.name
      const { players: raw } = await fetchNationSquad(hit.slug, hit.vereinId, SEASON, demonym, { cap: 26 })
      const players = finalizePlayers(raw, SEASON, 'nt')
      const histOvr = Math.round(players.reduce((s, p) => s + p.ovr, 0) / players.length)
      nation.seasons[0].players = players
      nation.seasons[0].historical_ovr = histOvr
      console.log(`  ${nation.name.padEnd(20)} ${players.length} players · ovr ${histOvr}`)
    } catch (e: any) {
      console.warn(`  ! ${nation.name}: ${e.message} — keeping existing squad`)
    }
    await sleep(1200)
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2))
  const total = nations.reduce((s, c) => s + (c.seasons[0].players?.length ?? 0), 0)
  console.log(`\n✓ wrote ${nations.length} nations / ${total} players → ${path.relative(process.cwd(), OUT_FILE)}`)
  if (misses.length) console.log(`⚠ unmatched (${misses.length}): ${misses.join(', ')}`)
}

main().catch(e => { console.error(e); process.exit(1) })
