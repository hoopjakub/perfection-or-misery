import { getDb } from '../setup'
import type { LeagueSeasonWithTeams } from '@/types/game'

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

export async function getAvailableLeagues(): Promise<LeagueOption[]> {
  const db = await getDb()
  return db.getAllAsync<LeagueOption>(
    `SELECT DISTINCT l.id, l.name
     FROM leagues l
     JOIN clubs c ON c.league_id = l.id
     JOIN club_seasons cs ON cs.club_id = c.id
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

export async function getAllClubsData(): Promise<Record<string, { color: string; acronym: string }>> {
  const db = await getDb()
  const clubs = await db.getAllAsync<{ name: string; short_name: string; primary_color: string }>(
    `SELECT name, short_name, primary_color FROM clubs`
  )
  
  const clubDataMap: Record<string, { color: string; acronym: string }> = {}
  clubs.forEach(club => {
    clubDataMap[club.name] = {
      color: club.primary_color,
      acronym: club.short_name
    }
  })
  
  return clubDataMap
}