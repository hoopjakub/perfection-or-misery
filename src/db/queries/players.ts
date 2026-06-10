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

export async function getPrimeOvrForPlayer(playerId: string): Promise<number> {
  const db = await getDb()
  const result = await db.getFirstAsync<{ prime_ovr: number }>(
    `SELECT MAX(ovr) as prime_ovr
     FROM player_seasons
     WHERE player_id = ?`,
    [playerId]
  )
  return result?.prime_ovr ?? 0
}

export async function getPlayersWithPrimeOvr(clubSeasonId: string): Promise<(PlayerRow & { prime_ovr: number })[]> {
  const db = await getDb()
  return db.getAllAsync<PlayerRow & { prime_ovr: number }>(
    `SELECT ps.*, p.name, p.nationality, p.primary_position, p.secondary_positions,
            c.name AS club_name, cs.year_start,
            MAX(ps2.ovr) as prime_ovr
     FROM player_seasons ps
     JOIN players p ON p.id = ps.player_id
     JOIN club_seasons cs ON cs.id = ps.club_season_id
     JOIN clubs c ON c.id = cs.club_id
     LEFT JOIN player_seasons ps2 ON ps2.player_id = p.id
     WHERE ps.club_season_id = ?
     GROUP BY ps.id
     ORDER BY ps.ovr DESC`,
    [clubSeasonId]
  )
}