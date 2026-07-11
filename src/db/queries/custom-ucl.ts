import { getDb } from '../setup'
import {
  buildCLAccessList, ensureHolders,
  type AssociationEntry, type AssociationClub, type CLAccessList,
} from '@/engine/cl-access'
import { simulateLeagueTableDetailed, type SimLeagueTable, type LeagueFormat } from '@/engine/cl-league-sim'

/**
 * DB wiring for the custom Champions League path. Reads the `cucl_*` leagues
 * (ingested from CustomUcl.json — one domestic league per row, `assoc_rank`
 * stored in `leagues.tier`, final-table order in `club_seasons.league_position`)
 * and turns them into the association-ranked entrant lists the access-list
 * builder consumes.
 */

// Static holders (kept fixed for now — no Europa League sim yet). Matched to the
// scraped club names so they resolve to real squads in the field.
export const CUSTOM_UCL_HOLDERS = {
  ucl: 'Paris Saint-Germain',
  uel: 'Aston Villa',
} as const

type Row = {
  club_id: string
  club_name: string
  historical_ovr: number
  league_position: number | null
  assoc_rank: number
  league_name: string
  league_country: string
  league_format: string
}

/** All custom-UCL clubs grouped into association entries (champion first). */
export async function getCustomUclAssociations(): Promise<AssociationEntry[]> {
  const db = await getDb()
  const rows = await db.getAllAsync<Row>(
    `SELECT c.id AS club_id, c.name AS club_name, cs.historical_ovr,
            cs.league_position, l.tier AS assoc_rank, l.name AS league_name,
            l.country AS league_country, l.format AS league_format
     FROM club_seasons cs
     JOIN clubs c ON c.id = cs.club_id
     JOIN leagues l ON l.id = c.league_id
     WHERE l.id LIKE 'cucl_%'
     ORDER BY l.tier ASC, cs.league_position ASC`,
  )

  const byRank = new Map<number, AssociationEntry>()
  for (const r of rows) {
    let entry = byRank.get(r.assoc_rank)
    if (!entry) {
      entry = { rank: r.assoc_rank, name: r.league_name, country: r.league_country, format: (r.league_format as LeagueFormat) ?? 'double_round_robin', clubs: [] }
      byRank.set(r.assoc_rank, entry)
    }
    entry.clubs.push({ clubId: r.club_id, clubName: r.club_name, ovr: r.historical_ovr })
  }
  return [...byRank.values()].sort((a, b) => a.rank - b.rank)
}

/** Resolve the static holders to their scraped club objects (by name). */
export async function getCustomUclHolders(): Promise<AssociationClub[]> {
  return resolveHolders()
}

async function resolveHolders(): Promise<AssociationClub[]> {
  const db = await getDb()
  const out: AssociationClub[] = []
  for (const name of [CUSTOM_UCL_HOLDERS.ucl, CUSTOM_UCL_HOLDERS.uel]) {
    const row = await db.getFirstAsync<{ id: string; name: string; ovr: number }>(
      `SELECT c.id, c.name, cs.historical_ovr AS ovr
       FROM clubs c JOIN club_seasons cs ON cs.club_id = c.id
       WHERE c.league_id LIKE 'cucl_%' AND c.name = ? LIMIT 1`,
      [name],
    )
    if (row) out.push({ clubId: row.id, clubName: row.name, ovr: row.ovr })
  }
  return out
}

/** Full access list for the custom UCL: real domestic finishes + static holders. */
export async function buildCustomUclAccessList(): Promise<CLAccessList> {
  const associations = await getCustomUclAssociations()
  const access = buildCLAccessList(associations)
  const holders = await resolveHolders()
  return ensureHolders(access, holders)
}

/**
 * Build a fresh custom-UCL season: SIMULATE every domestic league from its squads
 * (not last season's scraped positions), derive the access list from those
 * standings, and return the simulated tables for the league viewer. Different
 * every run.
 */
export async function buildCustomUclSeason(): Promise<{ access: CLAccessList; tables: SimLeagueTable[] }> {
  const scraped = await getCustomUclAssociations()
  const tables: SimLeagueTable[] = []
  const simulated: AssociationEntry[] = scraped.map(a => {
    const { standings, regularStandings } = simulateLeagueTableDetailed(a.clubs, a.format)
    tables.push({ rank: a.rank, name: a.name, country: a.country, format: a.format, standings, regularStandings })
    return { rank: a.rank, name: a.name, country: a.country, format: a.format, clubs: standings.map(s => ({ clubId: s.clubId, clubName: s.clubName, ovr: s.ovr })) }
  })
  const access = buildCLAccessList(simulated)
  const holders = await resolveHolders()
  tables.sort((a, b) => a.rank - b.rank)
  return { access: ensureHolders(access, holders), tables }
}
