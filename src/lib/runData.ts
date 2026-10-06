// One run's data, computed once and shared by every run page (Phase 5).
//
// Before this, each page that needed a run's numbers — the verdict, the stats
// screen, a player's game log — regenerated every match sheet of the run on
// arrival, which is the "loading time of doom" the maintainer kept hitting.
// Now the live run's data sits on the store (cleared with the run) the first
// time anything computes it, and a saved run's data is cached by id for the
// session. Pages call `useRunData(runId?)` and get it instantly after the
// first time.
import { compareStandings } from '@/engine/standings'
import { log } from '@/diag/log'
import { t } from '@/i18n'
import { runQualTies } from '@/engine/europe-path'
import { isClassicEurope, isEuropeMode, compOfMode } from '@/data/europe'
import { useEffect, useState } from 'react'
import { adoptRunCrest } from '@/store/crestStore'
import { useGameStore } from '@/store/gameStore'
import { computeLeagueRunStats, computeCLRunStats, computeWCRunStats, type RunMatch, type RoundLines, type PlayerMatchLog } from '@/engine/run-stats'
import { fetchRunById } from '@/db/queries/runs'
import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { DraftedPlayer, Formation } from '@/types/game'
import { punditField, type PredictionTeam } from '@/engine/predictions'
import type { Absence } from '@/engine/availability'
import type { DomesticCup } from '@/engine/domestic-cup'
import type { CLSeasonResult } from '@/engine/cl-sim'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import type { QualifyingResult } from '@/engine/cl-qualifying'
import type { SimLeagueTable } from '@/engine/cl-league-sim'
import type { GotAway } from '@/lib/resultStory'
import { cupPress, clPressStages, wcPressStages } from '@/engine/cup-press'
import type { Story } from '@/engine/press'

const pick = (t: { clubId: string; clubName: string; ovr: number; isPlayer?: boolean }): PredictionTeam => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: !!t.isPlayer })

export type RunData = {
  key: string                    // 'live' or the saved run's id
  mode: string | null
  stats: CompetitionStats
  awards: SeasonAwards
  matchLog: PlayerMatchLog | null   // per-match lines (a saved run's are rebuilt, P8-96)
  rounds: RoundLines | null
  matches: RunMatch[] | null
  yearStart: number | null
  /** League runs: which league, so the table can mark its places (UCL, relegation…) (P8-61). */
  leagueId: string | null
  playerClubId: string | null
  drafted: DraftedPlayer[]
  formation: Formation | null
  /** The competition's final table (league), league phase (Champions League) or groups (World Cup). */
  table: TableRow[]
  /** League runs: every club's position after each matchday, for the position graph. */
  positions: Map<string, number[]> | null
  /** The run's press (league runs; saved with the run since P8-96). */
  press: import('@/engine/press').Story[]
  /** The club your XI took the place of. */
  replacedClubName: string | null
  /** P8-89: whose run it is (a saved run's user); null for the live run, which is yours. */
  ownerId?: string | null
  /** Anything a saved run can't show, said plainly on the page. */
  missing: string[]
  /** What moved off the result screen into the hub (Wave F, step 6). */
  more: RunMore
}

/** The run's parts the hub's Pundits, Cup, Europe and Squad tabs draw. */
export type RunMore = {
  /** The pundits' field and seed: a live run, or a saved cup run from 3 Oct 2026 on. */
  pundits: { field: PredictionTeam[]; seed: number; matchesPerClub?: number } | null
  /** A saved league run keeps the pundits' places and points instead (P8-96). */
  punditPlaces: Record<string, number> | null
  punditPoints: Record<string, number> | null
  absences: Absence[]
  /** A league run's cup (P8-173). */
  cup: DomesticCup | null
  /** A cup run's whole result, for the pundits' tournament to be scored against. */
  cl: CLSeasonResult | null
  wc: WCSeasonResult | null
  /** The full path: its qualifying and the 53 leagues it started from. */
  qual: QualifyingResult | null
  domesticTables: SimLeagueTable[] | null
  /** I-2: the best player passed on at each pick. */
  gotAway: GotAway[]
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
      .sort(compareStandings)
      .map((t, i) => rowOf(t, i + 1, g.id)))
  }
  if (isEuropeMode(st.mode) && st.clResult) return st.clResult.leaguePhaseStandings.map((t, i) => rowOf(t, i + 1))
  return (st.simResult?.table ?? []).map((t, i) => rowOf(t, i + 1))
}

function livePositions(st: ReturnType<typeof useGameStore.getState>): Map<string, number[]> | null {
  const hist = st.simResult?.matchdayHistory
  if (!hist?.length || isEuropeMode(st.mode) || st.mode === 'world_cup') return null
  const out = new Map<string, number[]>()
  for (const snap of hist) snap.standings.forEach((t, i) => out.set(t.clubId, [...(out.get(t.clubId) ?? []), i + 1]))
  return out
}

/**
 * A cup run's press (F-01), rebuilt from its result: the same stories the live
 * screens wrote, because the press is a pure function of the rounds played.
 * A saved cup run keeps its whole result, so older saves get a press too.
 */
function cupPressOf(mode: string | null | undefined, cl: CLSeasonResult | null | undefined, wc: WCSeasonResult | null | undefined, qual?: QualifyingResult | null): Story[] {
  try {
    if (mode === 'world_cup' && wc?.groups) return cupPress(wcPressStages(wc), wc.absences ?? [])
    if (isEuropeMode(mode) && cl?.leaguePhaseStandings) return cupPress(clPressStages(cl, { qual }), cl.absences ?? [])
  } catch (e) {
    log.warn('stats', 'runData: the cup press failed', e)
  }
  return []
}

const saved = new Map<string, RunData>()

// Phase 9 ("no screen transition waits on a full-run computation", computed
// once): two callers at the same moment (Awards Night handing over to the
// result) each started the whole stats pass, because the store only holds the
// answer once the first finishes. They share the one in flight now.
let livePending: Promise<RunData | null> | null = null

/** Compute (once) the live run's data from the store, keeping it there. */
export function liveRunData(): Promise<RunData | null> {
  const st = useGameStore.getState()
  if (st.runData) return Promise.resolve(st.runData)
  if (!livePending) livePending = computeLiveRunData().finally(() => { livePending = null })
  return livePending
}

async function computeLiveRunData(): Promise<RunData | null> {
  const st = useGameStore.getState()
  const drafted = [...st.draftedPlayers, ...st.benchPlayers]
  const { mode, clResult, wcResult, simResult, placedLeague, clYear, customUclQual, useSubstitutes } = st
  const res =
    mode === 'champions_league_custom' && clResult ? await computeCLRunStats(clResult, drafted, clYear ?? 2025, runQualTies(customUclQual, clResult.playerTeam.clubId), useSubstitutes)
    : isClassicEurope(mode) && clResult ? await computeCLRunStats(clResult, drafted, clYear ?? undefined, undefined, useSubstitutes)
    : mode === 'world_cup' && wcResult ? await computeWCRunStats(wcResult, drafted, undefined, useSubstitutes)
    : simResult && placedLeague ? await computeLeagueRunStats(simResult, drafted, placedLeague, useSubstitutes)
    : null
  if (!res) return null
  const data: RunData = {
    key: 'live', mode,
    stats: res.stats, awards: res.awards, matchLog: res.matchLog, rounds: res.rounds, matches: res.matches,
    yearStart: mode === 'world_cup' ? 2026 : isEuropeMode(mode) ? (clYear ?? 2025) : (placedLeague?.yearStart ?? null),
    leagueId: mode === 'world_cup' || isEuropeMode(mode) ? null : (placedLeague?.leagueId ?? null),
    playerClubId: simResult?.playerTeam.clubId ?? clResult?.playerTeam.clubId ?? wcResult?.playerTeam.clubId ?? null,
    drafted, formation: st.formation,
    table: liveTable(st), positions: livePositions(st),
    press: st.simResult?.press ?? cupPressOf(mode, clResult, wcResult, mode === 'champions_league_custom' ? customUclQual : null),
    replacedClubName: st.placedLeague?.replacedTeamName ?? null,
    missing: [],
    more: (() => {
      // The pundits call the classic cups and the leagues; the full path's
      // pundits only call its domestic league, which the run doesn't keep.
      const field = mode === 'champions_league_custom' ? null : punditField(mode, { clTeams: st.clTeams, wcTeams: st.wcTeams, placedLeague: st.placedLeague })
      return {
        pundits: field && st.predictionSeed != null ? { field: field.teams, matchesPerClub: field.matchesPerClub, seed: st.predictionSeed } : null,
        punditPlaces: null, punditPoints: null,
        absences: simResult?.absences ?? clResult?.absences ?? wcResult?.absences ?? [],
        cup: simResult?.cup ?? null,
        cl: clResult ?? null, wc: wcResult ?? null,
        qual: mode === 'champions_league_custom' ? customUclQual ?? null : null,
        domesticTables: mode === 'champions_league_custom' ? st.customUclLeagues ?? null : null,
        gotAway: st.gotAway,
      }
    })(),
  }
  // Only if it's still the same run: a new run started meanwhile would
  // otherwise be handed the last run's stats.
  const now = useGameStore.getState()
  if ((now.clResult ?? now.wcResult ?? now.simResult) !== (clResult ?? wcResult ?? simResult)) return null
  useGameStore.setState({ runData: data })
  return data
}

/** A saved run, from the database, cached for the session. */
export async function savedRunData(runId: string): Promise<RunData | null> {
  const hit = saved.get(runId)
  if (hit) return hit
  const run = await fetchRunById(runId) as Record<string, any> | null
  adoptRunCrest(run?.highlights)   // P8-132: the crest it was played with
  if (!run?.stats || !run?.awards) return null
  // P8-96: a saved run already holds every match it played — a league its
  // matchday history (fixtures, scores, scorers, seeds), a cup its whole
  // result — but this page used to read only the totals, so a run opened again
  // had no match-by-match detail, no teams of the matchday and no bracket.
  // Rebuilt here the way the live run is: the same stats pass over the same
  // stored matches and seeds. The saved totals and awards stay the record
  // (an older run was scored by the engine of its day).
  const mode: string | null = run.mode ?? null
  const hist: any[] = run.matchday_history ?? []
  const last: any[] = hist[hist.length - 1]?.standings ?? []
  const wc = run.wc_result ?? null
  const cl = run.cl_result ?? null
  const qualTies = cl?._customUclQual ? runQualTies(cl._customUclQual, cl.playerTeam?.clubId) : undefined
  const drafted = (run.squad ?? []) as DraftedPlayer[]
  const useSubs = drafted.some(p => p.isBench)
  const like: any = {
    mode, wcResult: wc, clResult: cl,
    simResult: hist.length ? { table: last, matchdayHistory: hist, teamsInLeague: run.teams_in_league ?? last.length } : null,
  }
  let regen: Awaited<ReturnType<typeof computeLeagueRunStats>> = null
  try {
    regen = mode === 'world_cup' && wc ? await computeWCRunStats(wc, drafted, undefined, useSubs)
      : isEuropeMode(mode) && cl ? await computeCLRunStats(cl, drafted, run.year_start ?? 2025, qualTies, useSubs)
      : like.simResult && run.year_start ? await computeLeagueRunStats(like.simResult, drafted, { yearStart: run.year_start, leagueId: run.league_id } as any, useSubs)
      : null
  } catch (e) {
    log.warn('stats', 'runData: rebuilding the saved run failed', e)
  }
  const press = (run.highlights?.press ?? cupPressOf(mode, cl, wc, cl?._customUclQual ?? null)) as Story[]
  const data: RunData = {
    key: runId, mode,
    stats: run.stats as CompetitionStats, awards: run.awards as SeasonAwards,
    matchLog: regen?.matchLog ?? null, rounds: regen?.rounds ?? null, matches: regen?.matches ?? null,
    yearStart: run.year_start ?? null,
    leagueId: run.league_id ?? null,
    playerClubId: wc?.playerTeam?.clubId ?? cl?.playerTeam?.clubId ?? last.find((t: any) => t.isPlayer)?.clubId ?? null,
    drafted,
    formation: (run.formation ?? null) as Formation | null,
    table: like.simResult || wc || cl ? liveTable(like) : [],
    positions: livePositions(like),
    press,
    replacedClubName: run.replaced_team_name ?? null,
    ownerId: run.user_id ?? null,
    // Said plainly, and only what's really missing: a run too old to rebuild,
    // or a league run saved before the press was kept.
    missing: [
      ...(regen ? [] : [t('hub.missMatch'), t('hub.missTeams')]),
      ...(mode && !isEuropeMode(mode) && mode !== 'world_cup' && !press.length ? [t('hub.missPress')] : []),
    ],
    more: (() => {
      const h = run.highlights ?? {}
      // A saved cup run keeps the pundits' seed from 3 Oct 2026; its field is
      // the competition's own clubs, which the saved result carries.
      const seed: number | null = h.punditSeed ?? null
      const field: PredictionTeam[] | null =
        wc ? (wc.groups ?? []).flatMap((g: any) => g.teams).map(pick)
        : cl && mode !== 'champions_league_custom' ? (cl.leaguePhaseStandings ?? []).map(pick)
        : null
      return {
        pundits: seed != null && field?.length ? { field, seed, matchesPerClub: wc ? 3 : compOfMode(mode)?.matchdays } : null,
        punditPlaces: h.pundits ?? null, punditPoints: h.punditPoints ?? null,
        absences: h.absences ?? cl?.absences ?? wc?.absences ?? [],
        cup: h.cup ?? null,
        cl: cl ?? null, wc: wc ?? null,
        qual: cl?._customUclQual ?? run.custom_ucl_qual ?? null,
        domesticTables: cl?._customUclTables ?? run.custom_ucl_tables ?? null,
        gotAway: h.gotAway ?? [],
      }
    })(),
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
      .catch(e => { log.warn('stats', 'run-data: failed', e); if (alive) setFailed(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [runId, attempt])
  return { data, loading, failed, retry: () => setAttempt(a => a + 1) }
}
