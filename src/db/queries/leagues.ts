import { getDb } from '../setup'

export type LeagueRow = {
  id: string
  name: string
  country: string
  games_per_season: number
  tier: number
}

export async function getAllLeagues(): Promise<LeagueRow[]> {
  const db = await getDb()
  return db.getAllAsync<LeagueRow>(`SELECT * FROM leagues ORDER BY name`)
}

export async function getLeagueById(id: string): Promise<LeagueRow | null> {
  const db = await getDb()
  return db.getFirstAsync<LeagueRow>(`SELECT * FROM leagues WHERE id = ?`, [id])
}