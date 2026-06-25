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
}

export type LeagueOption = {
  id: string
  name: string
}

export async function getAllClubSeasons(): Promise<ClubSeasonRow[]> {
  const db = await getDb()
  return db.getAllAsync<ClubSeasonRow>(
    `SELECT cs.*, c.name AS club_name, c.short_name, c.primary_color,
            l.id AS league_id, l.name AS league_name, l.games_per_season
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
     WHERE l.id NOT LIKE 'ucl_%' AND l.id NOT LIKE 'wc_%'
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
export async function getTopKickers(clubId: string, limit = 8): Promise<string[]> {
  const db = await getDb()
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT p.name
     FROM player_seasons ps
     JOIN players p ON p.id = ps.player_id
     JOIN club_seasons cs ON cs.id = ps.club_season_id
     WHERE cs.club_id = ?
     ORDER BY (COALESCE(ps.attack, 0) + COALESCE(ps.technical, 0)) DESC
     LIMIT ?`,
    [clubId, limit]
  )
  return rows.map(r => r.name)
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
  } else if (mode === 'world_cup') {
    whereClause = `WHERE l.id LIKE 'wc_%'`
  } else if (mode === 'league' && leagueId) {
    whereClause = `WHERE l.id = '${leagueId}' AND l.id NOT LIKE 'ucl_%' AND l.id NOT LIKE 'wc_%'`
  } else {
    whereClause = `WHERE l.id NOT LIKE 'ucl_%' AND l.id NOT LIKE 'wc_%'`
  }

  return db.getAllAsync<ClubSeasonRow>(
    `SELECT cs.*, c.id AS club_id, c.name AS club_name, c.short_name, c.primary_color,
            l.id AS league_id, l.name AS league_name, l.games_per_season
     FROM club_seasons cs
     JOIN clubs c ON c.id = cs.club_id
     JOIN leagues l ON l.id = c.league_id
     ${whereClause}
     ORDER BY cs.historical_ovr DESC`
  )
}