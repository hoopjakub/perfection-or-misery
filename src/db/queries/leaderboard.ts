import { supabase } from '@/lib/supabase'
import { bestTierOf } from '@/data/tiers'
import { seasonsSoFar, seasonWindow, badgeTier, isFinished, type Season, type BadgeTier } from '@/data/seasons'

// Shared shape for the resolved difficulty columns — one run's worth of "how
// hard was this" data, read back by the badge everywhere a run is listed
// (leaderboard, run history, achievements). Optional columns (added after the
// difficulty feature shipped), so every fetch below degrades gracefully if the
// DB doesn't have them yet rather than failing the whole query.
import { SCORE_LADDER } from '@/lib/ladder'
export { placeOn, SCORE_LADDER } from '@/lib/ladder'
export type DifficultyMeta = {
  rerolls: number; ratingsShown: boolean; screwLevel: number; hardness: number
  // CL (full) only (Big Fixes §4) — omitted for every other mode's runs, not
  // just `false`, so the badge only ever mentions it where it was a real knob.
  weightedPicks?: boolean
}
import type { FeatRun } from '@/lib/feats'
import { shownRun, shownRuns } from '@/lib/shownNames'
export type DifficultyFields = { difficulty: string | null; difficulty_meta: DifficultyMeta | null }

export type LeaderboardEntry = DifficultyFields & {
  id: string
  score: number
  tier: string
  mode: string
  league_id: string
  league_name: string
  final_position: number
  teams_in_league: number
  wins: number
  draws: number
  losses: number
  created_at: string
  user_id: string
  profiles: { username: string | null; avatar_path?: string | null; badge_team_id?: string | null; badge_team_name?: string | null; club_tag?: string | null }
}

export type LeaderboardFilter = {
  mode?: string
  /** P8-85: any of these modes ("all tournaments"). */
  modes?: string[]
  leagueId?: string
  period?: 'day' | 'week' | 'month' | 'all'
  /** P8-85: runs from this instant on (the weekly board: src/lib/week.ts). */
  since?: string
  /** P8-152: runs before this instant (a season's board: src/data/seasons.ts). */
  until?: string
  /** P8-85: 'easy' | 'medium' | 'hard' | 'custom' — the run's own difficulty column. */
  difficulty?: string
  /** P8-85: custom runs at least this hard (the 0–11 hardness), e.g. 6 for 6.0–11. */
  minHardness?: number
  /** P8-99: only these players' runs (you and your friends). */
  userIds?: string[]
  limit?: number
  offset?: number
}

export type UserStats = {
  bestScore: number | null
  bestTier: string | null
  totalRuns: number
}

const LEADERBOARD_COLS = `
  id, score, tier, mode, league_id, league_name,
  final_position, teams_in_league, wins, draws, losses,
  created_at, user_id,
  profiles!inner(username)
`

// P8-85: the hardness sits inside the difficulty_meta JSON, which a PostgREST
// filter can't compare as a number on every column type, so a hardness range
// reads a wider slice of custom runs and filters it here.
// ponytail: client-side filter over the best HARDNESS_WINDOW custom runs; move
// it into the query (a generated column or a view) if custom runs outgrow it.
const HARDNESS_WINDOW = 1000
const hardEnough = (r: { difficulty_meta?: DifficultyMeta | null }, min?: number) =>
  min == null || (r.difficulty_meta?.hardness ?? -1) >= min
const LEADERBOARD_COLS_WITH_DIFFICULTY = `${LEADERBOARD_COLS}, difficulty, difficulty_meta`
// P8-88: the picture and the favourite team's badge beside each name, once
// supabase/profile.sql has added them; without them the board still loads.
const LEADERBOARD_COLS_WITH_PROFILE = LEADERBOARD_COLS_WITH_DIFFICULTY.replace('profiles!inner(username)', 'profiles!inner(username, avatar_path, badge_team_id, badge_team_name)')
// P8-181: and the club's tag beside the name, once supabase/clubs.sql has added it.
const LEADERBOARD_COLS_WITH_CLUB = LEADERBOARD_COLS_WITH_PROFILE.replace('badge_team_name)', 'badge_team_name, club_tag)')

export async function fetchLeaderboard(
  filter: LeaderboardFilter = {}
): Promise<LeaderboardEntry[]> {
  function buildQuery(cols: string) {
    // P8-99: any window of the board, not only the top: `offset` is where it
    // starts (0 = first place).
    const from = filter.offset ?? 0
    let query = supabase.from('runs').select(cols)
      .order('score', { ascending: false })
    query = filter.minHardness != null ? query.limit(HARDNESS_WINDOW) : query.range(from, from + (filter.limit ?? 50) - 1)
    if (filter.userIds) query = query.in('user_id', filter.userIds)
    if (filter.mode)     query = query.eq('mode', filter.mode)
    if (filter.modes?.length) query = query.in('mode', filter.modes)
    // An optional column the generated types don't list (see DifficultyFields).
    if (filter.difficulty) query = (query as any).eq('difficulty', filter.difficulty)
    if (filter.since)    query = query.gte('created_at', filter.since)
    if (filter.until)    query = query.lt('created_at', filter.until)
    if (filter.leagueId) query = query.eq('league_id', filter.leagueId)
    if (filter.period && filter.period !== 'all') {
      const cutoff = new Date()
      if      (filter.period === 'day')   cutoff.setDate(cutoff.getDate() - 1)
      else if (filter.period === 'week')  cutoff.setDate(cutoff.getDate() - 7)
      else if (filter.period === 'month') cutoff.setMonth(cutoff.getMonth() - 1)
      query = query.gte('created_at', cutoff.toISOString())
    }
    return query
  }

  // Try WITH the newer columns; if they don't exist yet in this DB, retry
  // without them (same degrade-gracefully pattern as fetchAchievementRuns).
  for (const cols of [LEADERBOARD_COLS_WITH_CLUB, LEADERBOARD_COLS_WITH_PROFILE, LEADERBOARD_COLS_WITH_DIFFICULTY, LEADERBOARD_COLS]) {
    const { data, error } = await buildQuery(cols)
    if (!error) return shownRuns((data as unknown as LeaderboardEntry[]) ?? [])
      .map(r => ({ ...r, difficulty: r.difficulty ?? null, difficulty_meta: r.difficulty_meta ?? null }))
      .filter(r => hardEnough(r, filter.minHardness))
      .slice(filter.minHardness != null ? (filter.offset ?? 0) : 0, (filter.minHardness != null ? (filter.offset ?? 0) : 0) + (filter.limit ?? 50))
    if (error.code !== '42703' && !/column .* does not exist/i.test(error.message)) throw error
  }
  return []
}

/** P8-85: where your best run stands on a board, even outside the top fifty:
 *  your best run under the same filters, and how many runs score more. With a
 *  hardness range the count comes from the same filtered window (see above). */
export async function fetchMyPlace(userId: string, filter: LeaderboardFilter): Promise<{ place: number; score: number } | null> {
  if (filter.minHardness != null) {
    const board = await fetchLeaderboard({ ...filter, offset: 0, limit: HARDNESS_WINDOW })
    const i = board.findIndex(r => r.user_id === userId)
    if (i >= 0) return { place: i + 1, score: board[i].score }
    return null
  }
  const scoped = (q: any) => {
    if (filter.mode) q = q.eq('mode', filter.mode)
    if (filter.modes?.length) q = q.in('mode', filter.modes)
    if (filter.difficulty) q = q.eq('difficulty', filter.difficulty)
    if (filter.since) q = q.gte('created_at', filter.since)
    if (filter.until) q = q.lt('created_at', filter.until)
    if (filter.userIds) q = q.in('user_id', filter.userIds)
    return q
  }
  const { data: best, error } = await scoped(supabase.from('runs').select('score').eq('user_id', userId))
    .order('score', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!best) return null
  const { count, error: countError } = await scoped(supabase.from('runs').select('id', { count: 'exact', head: true }))
    .gt('score', (best as { score: number }).score)
  if (countError) throw countError
  return { place: (count ?? 0) + 1, score: (best as { score: number }).score }
}

export async function fetchPersonalBest(userId: string) {
  const { data, error } = await supabase
    .from('runs')
    .select('id, score, tier, mode, league_name, final_position, created_at')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data ? shownRun(data) : data
}

export type RunHistoryEntry = DifficultyFields & {
  id: string
  score: number
  tier: string
  mode: string
  league_name: string
  year_start: number | null
  final_position: number
  created_at: string
  wins: number
  draws: number
  losses: number
}

const RUN_HISTORY_COLS = 'id, score, tier, mode, league_name, year_start, final_position, created_at, wins, draws, losses'
const RUN_HISTORY_COLS_WITH_DIFFICULTY = `${RUN_HISTORY_COLS}, difficulty, difficulty_meta`

export async function fetchRunHistory(userId: string, limit = 20): Promise<RunHistoryEntry[]> {
  for (const cols of [RUN_HISTORY_COLS_WITH_DIFFICULTY, RUN_HISTORY_COLS]) {
    const { data, error } = await supabase
      .from('runs').select(cols)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (!error) return shownRuns((data as unknown as RunHistoryEntry[]) ?? []).map(r => ({
      ...r, difficulty: r.difficulty ?? null, difficulty_meta: r.difficulty_meta ?? null,
    }))
    if (error.code !== '42703' && !/column .* does not exist/i.test(error.message)) throw error
  }
  return []
}

export async function fetchUserStats(userId: string): Promise<UserStats> {
  // Get total runs
  const { count: totalRuns, error: countError } = await supabase
    .from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countError) throw countError

  // Get best score
  const { data: bestRun, error: scoreError } = await supabase
    .from('runs')
    .select('score, tier')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)
    .single()

  if (scoreError && scoreError.code !== 'PGRST116') throw scoreError

  // Best tier across ALL modes (league finishes, UCL exits, WC finishes incl.
  // 3rd-place) via the unified tier ranking — not just league tiers.
  let bestTier: string | null = null
  if (bestRun) {
    const { data: allTiers } = await supabase
      .from('runs')
      .select('tier')
      .eq('user_id', userId)
    if (allTiers) bestTier = bestTierOf(allTiers.map((r: any) => r.tier))
  }

  return {
    bestScore: bestRun?.score ?? null,
    bestTier,
    totalRuns: totalRuns ?? 0
  }
}

// One run's fields needed to compute achievements. difficulty/difficulty_meta
// are optional columns (added later) — the fetch degrades gracefully if the DB
// doesn't have them yet, so old runs still count toward "conquered a mode".
export type AchievementRun = DifficultyFields & {
  mode: string
  tier: string | null
  final_position: number | null
  /** P8-126: what the feats read (the squad, the defeats). */
  losses?: number | null
  squad?: FeatRun['squad']
  highlights?: FeatRun['highlights']
}

export async function fetchAchievementRuns(userId: string): Promise<AchievementRun[]> {
  const base = 'mode, tier, final_position, losses, squad'
  // Try WITH the difficulty columns; if they don't exist yet, retry without.
  // P8-173: only the cup's winner, read out of the highlights by path (the
  // whole highlights carries the press and the medical table, too much for a list).
  for (const cols of [`${base}, difficulty, difficulty_meta, cup_winner:highlights->cup->winner`, `${base}, difficulty, difficulty_meta`, base]) {
    const { data, error } = await supabase
      .from('runs').select(cols).eq('user_id', userId)
    if (!error) return (data as unknown as AchievementRun[]).map(r => ({
      mode: r.mode, tier: r.tier ?? null, final_position: r.final_position ?? null,
      losses: (r as any).losses ?? null, squad: (r as any).squad ?? null,
      difficulty: (r as any).difficulty ?? null, difficulty_meta: (r as any).difficulty_meta ?? null,
      highlights: (r as any).cup_winner ? { cup: { winner: (r as any).cup_winner } } : null,
    }))
    // 42703 = undefined_column; anything else is a real error.
    if (error.code !== '42703' && !/column .* does not exist/i.test(error.message)) throw error
  }
  return []
}

// A run counts as "won" (trophy / league title) for achievements when the player
// finished first: league modes → final_position 1; knockout modes → tier 'winner'.
// The win rule lives with the feats (src/lib/feats.ts, pure, so a script can check it).
export { isRunWon } from '@/lib/feats'

// The league formula moved to supabase/functions/_shared/score.ts in Phase 6,
// so the server scores runs with exactly the code the app shows.
export { leagueScore as calculateScore } from '../../../supabase/functions/_shared/score'

/** P8-99: a board's scores, best first, to place many runs at once (two
 *  queries for a whole Runs list instead of one per run). */
// ponytail: the top SCORE_LADDER scores only; a run below them reads as
// "outside the top N". Swap for a database rank function if the board grows.
export async function fetchScoreLadder(since?: string): Promise<number[]> {
  let q = supabase.from('runs').select('score').order('score', { ascending: false }).limit(SCORE_LADDER)
  if (since) q = q.gte('created_at', since)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(r => r.score as number)
}

/** P8-152: a player's season badges: each season they played in, the place
 *  of their best run on that season's board and the tier it earned, newest
 *  first. The live season is included, marked, as where they stand so far. */
export type SeasonBadge = { season: Season; place: number; score: number; tier: BadgeTier | null; live: boolean }

export async function fetchSeasonBadges(userId: string): Promise<SeasonBadge[]> {
  const now = Date.now()
  const seasons = seasonsSoFar(now)
  const places = await Promise.all(seasons.map(s => fetchMyPlace(userId, seasonWindow(s)).catch(() => null)))
  return seasons.flatMap((season, i) => {
    const p = places[i]
    return p ? [{ season, place: p.place, score: p.score, tier: badgeTier(p.place), live: !isFinished(season, now) }] : []
  })
}
