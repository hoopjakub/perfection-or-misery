// One run's data, computed once and shared by every run page (Phase 5).
//
// Before this, each page that needed a run's numbers — the verdict, the stats
// screen, a player's game log — regenerated every match sheet of the run on
// arrival, which is the "loading time of doom" the maintainer kept hitting.
// Now the live run's data sits on the store (cleared with the run) the first
// time anything computes it, and a saved run's data is cached by id for the
// session. Pages call `useRunData(runId?)` and get it instantly after the
// first time.
import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import { computeLeagueRunStats, computeCLRunStats, computeWCRunStats, type RunMatch, type RoundLines, type PlayerMatchLog } from '@/engine/run-stats'
import { fetchRunById } from '@/db/queries/runs'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { DraftedPlayer, Formation } from '@/types/game'

export type RunData = {
  key: string                    // 'live' or the saved run's id
  mode: string | null
  stats: CompetitionStats
  awards: SeasonAwards
  matchLog: PlayerMatchLog | null   // per-match lines: live runs only
  rounds: RoundLines | null
  matches: RunMatch[] | null
  yearStart: number | null
  playerClubId: string | null
  drafted: DraftedPlayer[]
  formation: Formation | null
  /** The competition's final table (league), league phase (Champions League) or groups (World Cup). */
  table: TableRow[]
  /** League runs: every club's position after each matchday, for the position graph. */
  positions: Map<string, number[]> | null
  /** The run's press (league runs). */
  press: import('@/engine/press').Story[]
  /** The club your XI took the place of. */
  replacedClubName: string | null
  /** Anything a saved run can't show, said plainly on the page. */
  missing: string[]
}

export type TableRow = {
  clubId: string; clubName: string; position: number; group?: string
  played: number; won: number; drawn: number; lost: number; gf: number; ga: number; points: number
  isPlayer: boolean
}

type StatsLike = { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number }
const rowOf = (t: { clubId: string; clubName: string; isPlayer?: boolean; stats: StatsLike }, position: number, group?: string): TableRow => ({
  clubId: t.clubId, clubName: t.clubName, position, group,
  played: t.stats.played, won: t.stats.won, drawn: t.stats.drawn, lost: t.stats.lost,
  gf: t.stats.goalsFor, ga: t.stats.goalsAgainst, points: t.stats.points, isPlayer: !!t.isPlayer,
})

function liveTable(st: ReturnType<typeof useGameStore.getState>): TableRow[] {
  if (st.mode === 'world_cup' && st.wcResult) {
    return st.wcResult.groups.flatMap(g => [...g.teams]
      .sort((a, b) => b.stats.points - a.stats.points || (b.stats.goalsFor - b.stats.goalsAgainst) - (a.stats.goalsFor - a.stats.goalsAgainst) || b.stats.goalsFor - a.stats.goalsFor)
      .map((t, i) => rowOf(t, i + 1, g.id)))
  }
  if (st.mode?.startsWith('champions_league') && st.clResult) return st.clResult.leaguePhaseStandings.map((t, i) => rowOf(t, i + 1))
  return (st.simResult?.table ?? []).map((t, i) => rowOf(t, i + 1))
}

function livePositions(st: ReturnType<typeof useGameStore.getState>): Map<string, number[]> | null {
  const hist = st.simResult?.matchdayHistory
  if (!hist?.length || st.mode?.startsWith('champions_league') || st.mode === 'world_cup') return null
  const out = new Map<string, number[]>()
  for (const snap of hist) snap.standings.forEach((t, i) => out.set(t.clubId, [...(out.get(t.clubId) ?? []), i + 1]))
  return out
}

const saved = new Map<string, RunData>()

/** Compute (once) the live run's data from the store, keeping it there. */
export async function liveRunData(): Promise<RunData | null> {
  const st = useGameStore.getState()
  if (st.runData) return st.runData
  const drafted = [...st.draftedPlayers, ...st.benchPlayers]
  const { mode, clResult, wcResult, simResult, placedLeague, clYear, customUclQual, useSubstitutes } = st
  const res =
    mode === 'champions_league_custom' && clResult ? await computeCLRunStats(clResult, drafted, clYear ?? 2025, customUclQual?.ties, useSubstitutes)
    : mode === 'champions_league' && clResult ? await computeCLRunStats(clResult, drafted, clYear ?? undefined, undefined, useSubstitutes)
    : mode === 'world_cup' && wcResult ? await computeWCRunStats(wcResult, drafted, undefined, useSubstitutes)
    : simResult && placedLeague ? await computeLeagueRunStats(simResult, drafted, placedLeague, useSubstitutes)
    : null
  if (!res) return null
  const data: RunData = {
    key: 'live', mode,
    stats: res.stats, awards: res.awards, matchLog: res.matchLog, rounds: res.rounds, matches: res.matches,
    yearStart: mode === 'world_cup' ? 2026 : mode?.startsWith('champions_league') ? (clYear ?? 2025) : (placedLeague?.yearStart ?? null),
    playerClubId: simResult?.playerTeam.clubId ?? clResult?.playerTeam.clubId ?? wcResult?.playerTeam.clubId ?? null,
    drafted, formation: st.formation,
    table: liveTable(st), positions: livePositions(st), press: st.simResult?.press ?? [],
    replacedClubName: st.placedLeague?.replacedTeamName ?? null,
    missing: [],
  }
  useGameStore.setState({ runData: data })
  return data
}

/** A saved run, from the database, cached for the session. */
export async function savedRunData(runId: string): Promise<RunData | null> {
  const hit = saved.get(runId)
  if (hit) return hit
  const run = await fetchRunById(runId) as Record<string, any> | null
  if (!run?.stats || !run?.awards) return null
  const data: RunData = {
    key: runId, mode: run.mode ?? null,
    stats: run.stats as CompetitionStats, awards: run.awards as SeasonAwards,
    matchLog: null, rounds: null, matches: null,
    yearStart: run.year_start ?? null,
    playerClubId: null,
    drafted: (run.squad ?? []) as DraftedPlayer[],
    formation: (run.formation ?? null) as Formation | null,
    table: ((run.matchday_history?.[run.matchday_history.length - 1]?.standings ?? []) as any[]).map((t, i) => rowOf(t, i + 1)),
    positions: null, press: [],
    replacedClubName: run.replaced_team_name ?? null,
    missing: ['match-by-match detail', 'teams of the matchday', 'the press'],
  }
  saved.set(runId, data)
  return data
}

export function useRunData(runId?: string): { data: RunData | null; loading: boolean; failed: boolean; retry: () => void } {
  const cached = runId ? saved.get(runId) ?? null : useGameStore.getState().runData
  const [data, setData] = useState<RunData | null>(cached)
  const [loading, setLoading] = useState(!cached)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (data) return
    let alive = true
    setLoading(true); setFailed(false)
    ;(runId ? savedRunData(runId) : liveRunData())
      .then(d => { if (!alive) return; setData(d); setFailed(!d) })
      .catch(e => { console.warn('[run-data] failed:', e); if (alive) setFailed(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [runId, attempt])
  return { data, loading, failed, retry: () => setAttempt(a => a + 1) }
}
