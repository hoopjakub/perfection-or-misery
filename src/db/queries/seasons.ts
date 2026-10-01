import { getDb } from '../setup'
import type { LeagueSeasonWithTeams } from '@/types/game'
import type { RosterPlayer } from '@/types/stats'

export type ClubSeasonRow = {
  id: string
  club_id: string
  club_name: string
  short_name: string
  year_start: number
  year_end: number
  historical_ovr: number
  league_id: string
  league_name: string
  games_per_season: number
  primary_color: string
  league_format?: string
  // The finish that season. The Europa and Conference League seeds keep their
  // real league-phase pot here instead (scripts/build-europe-seeds.ts, P8-172).
  league_position?: number | null
  // UEFA association coefficient rank — only meaningful for `cucl_%` leagues
  // (stored in `leagues.tier`, see db/queries/custom-ucl.ts); null elsewhere.
  // Drives the weighted-picks top-10-league filter (Big Fixes §4).
  assoc_rank?: number | null
}

export type LeagueOption = {
  id: string
  name: string
}

export async function getAllClubSeasons(): Promise<ClubSeasonRow[]> {
  const db = await getDb()
  return db.getAllAsync<ClubSeasonRow>(
    `SELECT cs.*, c.name AS club_name, c.short_name, c.primary_color,
            l.id AS league_id, l.name AS league_name, l.games_per_season, l.format AS league_format
     FROM club_seasons cs
     JOIN clubs c ON c.id = cs.club_id
     JOIN leagues l ON l.id = c.league_id
     ORDER BY cs.historical_ovr DESC`
  )
}

// Scorer-attribution rosters for a set of clubs in one competition edition.
// All clubs in a given competition share one `yearStart` (a league-season year,
// or the CL/WC edition year), so we filter by it to get the right squads.
type RosterRow = {
  club_id: string; club_name: string; year_start: number
  player_id: string; player_name: string; primary_position: string
  birth_year: number | null; attack: number | null; ovr: number
}
export async function getRostersForClubs(
  clubIds: string[],
  yearStart: number,
): Promise<Map<string, RosterPlayer[]>> {
  const map = new Map<string, RosterPlayer[]>()
  if (clubIds.length === 0) return map
  const db = await getDb()
  const placeholders = clubIds.map(() => '?').join(',')
  const rows = await db.getAllAsync<RosterRow>(
    `SELECT cs.club_id, c.name AS club_name, cs.year_start,
            p.id AS player_id, p.name AS player_name, p.primary_position,
            p.birth_year, ps.attack, ps.ovr
     FROM player_seasons ps
     JOIN players p ON p.id = ps.player_id
     JOIN club_seasons cs ON cs.id = ps.club_season_id
     JOIN clubs c ON c.id = cs.club_id
     WHERE cs.club_id IN (${placeholders}) AND cs.year_start = ?`,
    [...clubIds, yearStart],
  )
  const label = `${String(yearStart).slice(-2)}/${String(yearStart + 1).slice(-2)}`
  for (const r of rows) {
    const rp: RosterPlayer = {
      playerId: r.player_id, name: r.player_name, primaryPosition: r.primary_position,
      attack: r.attack ?? r.ovr, ovr: r.ovr, birthYear: r.birth_year,
      yearStart: r.year_start, seasonLabel: label, clubId: r.club_id, clubName: r.club_name,
    }
    if (!map.has(r.club_id)) map.set(r.club_id, [])
    map.get(r.club_id)!.push(rp)
  }
  return map
}

export async function getAvailableLeagues(): Promise<LeagueOption[]> {
  const db = await getDb()
  // Champions League / World Cup are their own modes — never offer them as a
  // pickable domestic league in League mode.
  return db.getAllAsync<LeagueOption>(
    `SELECT DISTINCT l.id, l.name
     FROM leagues l
     JOIN clubs c ON c.league_id = l.id
     JOIN club_seasons cs ON cs.club_id = c.id
     WHERE l.id NOT LIKE 'ucl_%' AND l.id NOT LIKE 'wc_%' AND l.id NOT LIKE 'cucl_%'
     ORDER BY l.name ASC`
  )
}

export async function getClubSeasonsForLeague(leagueId: string): Promise<ClubSeasonRow[]> {
  const db = await getDb()
  return db.getAllAsync<ClubSeasonRow>(
    `SELECT cs.*, c.name AS club_name, c.short_name, c.primary_color,
            l.id AS league_id, l.name AS league_name, l.games_per_season
     FROM club_seasons cs
     JOIN clubs c ON c.id = cs.club_id
     JOIN leagues l ON l.id = c.league_id
     WHERE l.id = ?
     ORDER BY cs.year_start DESC`,
    [leagueId]
  )
}

export async function getLeagueSeasonWithTeams(
  leagueId: string,
  yearStart: number
): Promise<LeagueSeasonWithTeams | null> {
  const db = await getDb()
  const teams = await db.getAllAsync<{ club_id: string; club_name: string; historical_ovr: number }>(
    `SELECT c.id AS club_id, c.name AS club_name, cs.historical_ovr
     FROM club_seasons cs
     JOIN clubs c ON c.id = cs.club_id
     WHERE c.league_id = ? AND cs.year_start = ?`,
    [leagueId, yearStart]
  )
  if (teams.length === 0) return null

  const league = await getDb().then(d => d.getFirstAsync<{ name: string; games_per_season: number }>(
    `SELECT name, games_per_season FROM leagues WHERE id = ?`, [leagueId]
  ))

  return {
    leagueId,
    leagueName: league?.name ?? leagueId,
    yearStart,
    gamesPerSeason: league?.games_per_season ?? 38,
    teams,
  }
}

export async function getAllClubsData(): Promise<Record<string, { color: string; acronym: string; logoKey: string }>> {
  const db = await getDb()
  const clubs = await db.getAllAsync<{ id: string; name: string; short_name: string; primary_color: string; logo: string | null }>(
    `SELECT id, name, short_name, primary_color, logo FROM clubs`
  )

  const clubDataMap: Record<string, { color: string; acronym: string; logoKey: string }> = {}
  clubs.forEach(club => {
    clubDataMap[club.name] = {
      color: club.primary_color,
      acronym: club.short_name,
      logoKey: club.logo ?? club.id,
    }
  })

  return clubDataMap
}
// Returns player names ordered by (attack + technical) DESC for a given club — used for pen kick order
// Penalty takers for a club: the best outfield kickers first, with the keeper
// appended LAST — so a shootout rotates through all 11 starters (goalkeeper
// included) before anyone steps up for a second kick.
//
// Clubs that carry MULTIPLE club_seasons rows (every UCL edition a club
// appears in, e.g. both the 2024 and 2025 seed years for Real Madrid) would
// otherwise return the SAME player twice — once per season row a long-serving
// star appears in — which broke the "everyone kicks once before anyone
// repeats" rule (the same name reappearing at kick 3 or 5). GROUP BY p.id
// dedupes to one row per player, keeping their best score across every season
// the club_id matches, before ranking and limiting.
export async function getTopKickers(clubId: string, limit = 11): Promise<string[]> {
  const db = await getDb()
  const outfield = await db.getAllAsync<{ name: string }>(
    `SELECT p.name
     FROM players p
     JOIN (
       SELECT ps.player_id AS id, MAX(COALESCE(ps.attack, 0) + COALESCE(ps.technical, 0)) AS score
       FROM player_seasons ps
       JOIN club_seasons cs ON cs.id = ps.club_season_id
       JOIN players p2 ON p2.id = ps.player_id
       WHERE cs.club_id = ? AND p2.primary_position != 'GK'
       GROUP BY ps.player_id
     ) best ON best.id = p.id
     ORDER BY best.score DESC
     LIMIT ?`,
    [clubId, Math.max(1, limit - 1)]
  )
  const gk = await db.getFirstAsync<{ name: string }>(
    `SELECT p.name
     FROM players p
     JOIN (
       SELECT ps.player_id AS id, MAX(ps.ovr) AS score
       FROM player_seasons ps
       JOIN club_seasons cs ON cs.id = ps.club_season_id
       JOIN players p2 ON p2.id = ps.player_id
       WHERE cs.club_id = ? AND p2.primary_position = 'GK'
       GROUP BY ps.player_id
     ) best ON best.id = p.id
     ORDER BY best.score DESC LIMIT 1`,
    [clubId]
  )
  const names = outfield.map(r => r.name)
  if (gk?.name) names.push(gk.name)   // keeper takes the 11th kick
  return names
}

// mode-aware pool - CL/WC get their own competition pools,
// regular modes exclude CL/WC to avoid Vinicius Jr popping up in league mode
export async function getClubSeasonsForMode(
  mode: string,
  leagueId?: string | null
): Promise<ClubSeasonRow[]> {
  const db = await getDb()

  let whereClause: string
  if (mode === 'champions_league') {
    whereClause = `WHERE l.id LIKE 'ucl_%'`
  } else if (mode === 'europa_league') {
    whereClause = `WHERE l.id LIKE 'uel_%'`      // P8-172
  } else if (mode === 'conference_league') {
    whereClause = `WHERE l.id LIKE 'uecl_%'`
  } else if (mode === 'world_cup') {
    whereClause = `WHERE l.id LIKE 'wc_%'`
  } else if (mode === 'champions_league_custom') {
    whereClause = `WHERE l.id LIKE 'cucl_%'`
  } else if (mode === 'league' && leagueId) {
    whereClause = `WHERE l.id = '${leagueId}' AND l.id NOT LIKE 'ucl_%' AND l.id NOT LIKE 'wc_%' AND l.id NOT LIKE 'cucl_%' AND l.id NOT LIKE 'uel_%' AND l.id NOT LIKE 'uecl_%'`
  } else {
    whereClause = `WHERE l.id NOT LIKE 'ucl_%' AND l.id NOT LIKE 'wc_%' AND l.id NOT LIKE 'cucl_%' AND l.id NOT LIKE 'uel_%' AND l.id NOT LIKE 'uecl_%'`
  }

  return db.getAllAsync<ClubSeasonRow>(
    `SELECT cs.*, c.id AS club_id, c.name AS club_name, c.short_name, c.primary_color,
            l.id AS league_id, l.name AS league_name, l.games_per_season, l.tier AS assoc_rank
     FROM club_seasons cs
     JOIN clubs c ON c.id = cs.club_id
     JOIN leagues l ON l.id = c.league_id
     ${whereClause}
     ORDER BY cs.historical_ovr DESC`
  )
}
/** Each club's own colours, by id (P8-49's team colours on the match sheet). */
export async function getClubColours(ids: string[]): Promise<Map<string, { primary: string; secondary: string | null }>> {
  const out = new Map<string, { primary: string; secondary: string | null }>()
  const wanted = [...new Set(ids.filter(Boolean))]
  if (wanted.length === 0) return out
  const db = await getDb()
  // The scrapers write a slate placeholder (#1E293B / #94A3B8) when a crest's
  // colours couldn't be read — 58 clubs, mostly the Champions League copies of
  // a club (`real_madrid_ucl`) whose domestic row has the real colours. Those
  // borrow from the same club by name, so Real Madrid is Real Madrid in every mode.
  const PLACEHOLDER = '#1E293B'
  const rows = await db.getAllAsync<{ id: string; name: string; primary_color: string; secondary_color: string | null }>(
    `SELECT id, name, primary_color, secondary_color FROM clubs WHERE id IN (${wanted.map(() => '?').join(',')})`, wanted,
  )
  const missing = rows.filter(r => r.primary_color.toUpperCase() === PLACEHOLDER).map(r => r.name)
  const byName = new Map<string, { primary: string; secondary: string | null }>()
  if (missing.length) {
    const found = await db.getAllAsync<{ name: string; primary_color: string; secondary_color: string | null }>(
      `SELECT name, primary_color, secondary_color FROM clubs WHERE upper(primary_color) != ? AND name IN (${missing.map(() => '?').join(',')})`,
      [PLACEHOLDER, ...missing],
    )
    for (const f of found) byName.set(f.name, { primary: f.primary_color, secondary: f.secondary_color })
  }
  for (const r of rows) {
    const real = r.primary_color.toUpperCase() === PLACEHOLDER ? byName.get(r.name) : undefined
    out.set(r.id, real ?? { primary: r.primary_color, secondary: r.secondary_color })
  }
  return out
}
