import { getDb } from '../setup'

export type PlayerRow = {
  id: string
  name: string
  nationality: string
  primary_position: string
  secondary_positions: string
  ovr: number
  attack: number
  defense: number
  physical: number
  pace: number
  technical: number
  goals: number
  assists: number
  appearances: number
  is_icon: number
  club_season_id: string
  club_name: string
  year_start: number
}

export async function getPlayersForClubSeason(clubSeasonId: string): Promise<PlayerRow[]> {
  const db = await getDb()
  return db.getAllAsync<PlayerRow>(
    `SELECT ps.*, p.name, p.nationality, p.primary_position, p.secondary_positions,
            c.name AS club_name, cs.year_start
     FROM player_seasons ps
     JOIN players p ON p.id = ps.player_id
     JOIN club_seasons cs ON cs.id = ps.club_season_id
     JOIN clubs c ON c.id = cs.club_id
     WHERE ps.club_season_id = ?
     ORDER BY ps.ovr DESC`,
    [clubSeasonId]
  )
}

export async function getPlayerById(playerId: string): Promise<PlayerRow | null> {
  const db = await getDb()
  return db.getFirstAsync<PlayerRow>(
    `SELECT ps.*, p.name, p.nationality, p.primary_position, p.secondary_positions,
            c.name AS club_name, cs.year_start
     FROM player_seasons ps
     JOIN players p ON p.id = ps.player_id
     JOIN club_seasons cs ON cs.id = ps.club_season_id
     JOIN clubs c ON c.id = cs.club_id
     WHERE p.id = ?
     ORDER BY ps.ovr DESC
     LIMIT 1`,
    [playerId]
  )
}