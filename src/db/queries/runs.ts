import { fullPathTier } from '@/engine/europe-path'
import { noteSchemaRetry } from '@/diag/log'
import { timeAsync } from '@/diag/perf'
import { log } from '@/diag/log'
import { compOfMode, EUROPE } from '@/data/europe'
import { useCrestStore } from '@/store/crestStore'
import { supabase } from '@/lib/supabase'
import { useGameStore } from '@/store/gameStore'
import {
  scoreRun, invalidRun, type RunRow,
  WC_ROUND_TO_POSITION, CL_ROUND_TO_POSITION, CUSTOM_CL_ROUND_TO_POSITION,
} from '../../../supabase/functions/_shared/score'
import type { SeasonResult } from '@/types/simulation'
import type { DraftedPlayer, GameMode } from '@/types/game'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import type { CLSeasonResult } from '@/engine/cl-sim'
import { resolveDifficulty, type Difficulty, type CustomDifficulty } from '@/engine/difficulty'
import { shownRun } from '@/lib/shownNames'
import { settingsStorage } from '@/lib/mmkv'
import { useUserStore } from '@/store/userStore'
import { isOnline } from '@/lib/online'
import { setRunQueueDeps, queueRun, flushRunQueue, RUN_QUEUE_KEY, type QueuedRun } from '@/lib/runQueue'

// Build the difficulty columns saved on every run so the achievements/leaderboard/
// run-history screens can read back exactly how hard a run was. `difficulty` is
// the raw preset/custom label (or 'chaos'/'cursed' — those store their FIXED
// screw-level here too, resolved via `mode`, rather than saving null and losing
// the info); `difficulty_meta` carries the resolved knobs + the 0–11 hardness.
// Both are optional columns (auto-dropped by insertRun if the DB lacks them).
function difficultyColumns(
  difficulty: Difficulty | null, custom: CustomDifficulty | null | undefined, mode?: GameMode | null,
  weightedPicksOverride?: boolean | null,
) {
  const isFixedMode = mode === 'chaos' || mode === 'cursed'
  if (!difficulty && !isFixedMode) return { difficulty: null, difficulty_meta: null }
  const r = resolveDifficulty(difficulty, custom, mode, weightedPicksOverride)
  return {
    // Chaos/Cursed store their mode name as the "difficulty" label (their level
    // is fixed, not chosen) so the run-history UI has something to badge on.
    difficulty: isFixedMode ? mode : difficulty,
    difficulty_meta: {
      rerolls: r.rerolls, ratingsShown: r.ratingsShown, screwLevel: r.screwLevel, hardness: r.hardness,
      // CL (full) only — see Big Fixes §4. Omitted elsewhere (see DifficultyMeta).
      ...(mode === 'champions_league_custom' ? { weightedPicks: r.weightedPicksEffective } : {}),
    },
  }
}

// Insert a run, tolerating optional columns that may not exist in Supabase yet
// (highlights / matchday_history / wc_result / cl_result / future stats columns).
// On a PostgREST "column not found" error we drop that column and retry, so the
// core run always saves even before the optional columns are added to the table.
//
// Phase 6: every run is scored HERE, once, by the shared formula
// (supabase/functions/_shared/score.ts); the save functions no longer score.
// With EXPO_PUBLIC_SERVER_SCORING=1 the row goes to the `submit-run` edge
// function instead, which re-scores and validates it and inserts it as the
// caller. Flip the flag once that function is deployed, then apply
// supabase/policies.sql so the table no longer takes inserts from the app.
const SERVER_SCORING = process.env.EXPO_PUBLIC_SERVER_SCORING === '1'

// The saved run's id goes on the game store (cleared with the run), so the
// verdict it was saved from can share its link (/r/<id>) without threading an
// id through every save function. A run is saved once, as its result opens.
const remember = (data: unknown) => useGameStore.setState({ savedRunId: (data as { id?: string } | null)?.id ?? null })

// P8-88: the run's length, for the profile's total playing time. Capped, so a
// run left open overnight counts as a long evening rather than a whole day.
const MAX_RUN_SECONDS = 4 * 3600
function runDuration(): number | null {
  const started = useGameStore.getState().runStartedAt
  return started ? Math.min(MAX_RUN_SECONDS, Math.round((Date.now() - started) / 1000)) : null
}

/** A run that couldn't reach the server is saved on the phone instead (P8.5-24). */
export class RunQueuedError extends Error { constructor() { super('RUN_QUEUED') } }

// An id the app makes for each run (supabase/runs-queue.sql: unique, so a run
// sent twice is kept once). expo-crypto's where the build has it; otherwise a
// random v4 id, plenty for a key that only has to be unique per run.
function newClientId(): string {
  try { return require('expo-crypto').randomUUID() } catch { /* below */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// Whether a failed save is worth waiting for (no connection, or the server for
// a while) or will never go through (the row itself was refused).
function offlineError(e: unknown): boolean {
  const err = e as { name?: string; message?: string; code?: string; context?: { status?: number } }
  if (/FunctionsFetchError|FunctionsRelayError/.test(err?.name ?? '')) return true
  const status = err?.context?.status
  // Not signed in yet (the session restores a moment after start) or a token
  // being refreshed: wait, never drop the run for it.
  if (typeof status === 'number') return status >= 500 || status === 401 || status === 403 || status === 408 || status === 429
  if (err?.code === '42501' || err?.code === 'PGRST301' || err?.code === 'PGRST302') return true
  if (err?.code) return false
  return /network|failed to fetch|timed? ?out|aborted|offline/i.test(err?.message ?? String(e))
}

// Sends one row: to submit-run when the server scores, else straight into the
// table (dropping a column the table doesn't have yet, and taking a duplicate
// client_id as already saved). Returns the run's id. Throws on failure.
async function sendPayloadNow(payload: Record<string, unknown>): Promise<{ id?: string }> {
  if (SERVER_SCORING) {
    const { data, error } = await supabase.functions.invoke('submit-run', { body: payload })
    if (error) throw error
    return { id: (data as { id?: string } | null)?.id }
  }
  const body = { ...payload }
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data, error } = await supabase.from('runs').insert(body as any).select('id').single()
    if (!error) return { id: (data as { id?: string } | null)?.id }
    if (error.code === '23505' && typeof body.client_id === 'string') {
      const { data: had } = await (supabase as any).from('runs').select('id').eq('client_id', body.client_id).maybeSingle()
      if (had) return { id: had.id }
    }
    const missing = error.code === 'PGRST204'
      ? error.message?.match(/Could not find the '([^']+)' column/)?.[1]
      : undefined
    if (missing && missing in body) {
      log.warn('save', `saveRun: '${missing}' column missing in DB — dropping it and retrying`)
      noteSchemaRetry()   // the database is behind the app
      delete body[missing]
      continue
    }
    throw error
  }
  throw new Error('Too many missing columns')
}

// The phone's queue (src/lib/runQueue.ts): stored with the settings (MMKV),
// sent with sendPayload.
setRunQueueDeps({
  load: async () => { try { return JSON.parse((await settingsStorage.getItem(RUN_QUEUE_KEY)) ?? '[]') } catch { return [] } },
  save: items => settingsStorage.setItem(RUN_QUEUE_KEY, JSON.stringify(items)),
  send: async item => {
    // Only under the account that played it: signed out, or someone else
    // signed in on this phone, it waits for its own player.
    const me = useUserStore.getState()
    if (me.isGuest || !me.user?.id || item.payload.user_id !== me.user.id) return { result: 'offline' }
    try { const r = await sendPayload(item.payload); return { result: 'sent', id: r.id } }
    catch (e) { return offlineError(e) ? { result: 'offline' } : { result: 'refused', why: String((e as Error)?.message ?? e) } }
  },
})

// The run on the result screen right now, if it went into the queue: when the
// queue sends it, its id lands on the store, so its link appears (and the save
// line turns to "Saved to your runs").
let currentClientId: string | null = null
const onQueueSent = (item: QueuedRun, id?: string) => { if (item.clientId === currentClientId && id) remember({ id }) }

/** Send what's waiting on the phone (on start, back online, back in the foreground). */
export const flushSavedRuns = () => flushRunQueue(onQueueSent)

async function insertRun(row: Record<string, unknown>): Promise<void> {
  // duration_seconds is optional like the other late columns: dropped and
  // retried below if the database doesn't have it yet (supabase/profile.sql).
  // P8.5-24: client_id and played_at (supabase/runs-queue.sql) likewise.
  const clientId = newClientId()
  const playedAt = new Date().toISOString()
  const payload: Record<string, unknown> = { ...row, duration_seconds: runDuration(), score: scoreRun(row as RunRow), client_id: clientId, played_at: playedAt }
  // P8-132: the crest this run was played with, so it still shows after you
  // change yours. Added here, where every mode's save passes.
  const crest = useCrestStore.getState().active
  if (crest) payload.highlights = { ...((row.highlights as object) ?? {}), crest }
  // P8.5-41: the row as scored, so the result shows these points and how they
  // were made, the moment the save starts (the server runs the same formula).
  useGameStore.setState({ savedRunRow: row as RunRow })
  const invalid = invalidRun(row as RunRow)
  if (invalid) log.warn('save', `saveRun: this run would be refused by the server: ${invalid}`)
  currentClientId = clientId
  const queue = async () => { await queueRun({ clientId, playedAt, payload }); throw new RunQueuedError() }
  // Offline already: straight onto the phone, no attempt that's bound to fail.
  if (!isOnline()) return queue()
  try {
    remember(await sendPayload(payload))
  } catch (e) {
    if (offlineError(e)) return queue()
    throw e
  }
}

/** Wave F (3 Oct 2026): what a run keeps for the result's story and the
 *  hub's Pundits tab. The passed-on players (I-2) for every mode; the pundits'
 *  seed for the cups, whose field the saved result already carries. */
export type RunExtra = { gotAway?: import('@/lib/resultStory').GotAway[]; punditSeed?: number | null }
const extraHighlights = (e?: RunExtra) => ({
  ...(e?.gotAway?.length ? { gotAway: e.gotAway } : {}),
  ...(e?.punditSeed != null ? { punditSeed: e.punditSeed } : {}),
})

export async function saveRun(params: {
  /** P8-150: the pundits' place for you and the field's size, for the career's line against them. */
  punditsOnYou?: { predicted: number; field: number } | null
  extra?: RunExtra
  userId: string
  mode: GameMode
  formation: string
  teamOvr: number
  leagueId: string
  leagueName: string
  yearStart: number
  seasonResult: SeasonResult
  squad: DraftedPlayer[]
  matchdayHistory: unknown
  difficulty: Difficulty | null
  custom?: CustomDifficulty | null
  stats?: unknown
  awards?: unknown
  /** P8-96: the pundits' predicted place for every club (clubId → place). */
  pundits?: Record<string, number> | null
  /** P8-122: the points they tipped each club for, beside the places. */
  punditPoints?: Record<string, number> | null
}) {

  await insertRun({
    user_id: params.userId,
    mode: params.mode,
    formation: params.formation,
    team_ovr: params.teamOvr,
    league_id: params.leagueId,
    league_name: params.leagueName,
    year_start: params.yearStart,
    final_position: params.seasonResult.finalPosition,
    teams_in_league: params.seasonResult.teamsInLeague,
    tier: params.seasonResult.tier,
    wins: params.seasonResult.wins,
    draws: params.seasonResult.draws,
    losses: params.seasonResult.losses,
    goals_for: params.seasonResult.goalsFor,
    goals_against: params.seasonResult.goalsAgainst,
    squad: params.squad,
    ...difficultyColumns(params.difficulty, params.custom, params.mode),
    // Optional columns — auto-dropped by insertRun if not present in the DB yet.
    matchday_history: params.matchdayHistory,
    highlights: {
      biggestWin: params.seasonResult.biggestWin,
      worstLoss:  params.seasonResult.worstLoss,
      upsets:     params.seasonResult.upsets,
      // §10.5 phase 4 — the medical table rides along in `highlights` so it
      // survives a history load without needing its own column.
      absences:   params.seasonResult.absences ?? [],
      // P8-96: two things a saved run lost. The press was written live and
      // thrown away, so a run opened again had none (P8-135's saved case);
      // and the pundits' calls came from a seed the run didn't keep, so the
      // verdict opened from history had no pundits. Both ride here too.
      press:      params.seasonResult.press ?? [],
      pundits:    params.pundits ?? null,
      punditPoints: params.punditPoints ?? null,
      punditsOnYou: params.punditsOnYou ?? null,
      // P8-173: the league's cup, every round of it (a few dozen ties).
      cup:        params.seasonResult.cup ?? null,
      ...extraHighlights(params.extra),
    },
    stats:  params.stats,
    awards: params.awards,
  })
}

// Knockout competitions (WC / UCL) don't have a league position. Score them on a
// ROUND-REACHED ladder (so progress is rewarded and scores sit alongside league
// scores), and report a real FINISH position (1–4 podium, then by round).

// World Cup — finish position (with the 3rd-place playoff the top 4 are exact).

export async function saveWCRun(params: {
  /** P8-150: the pundits' place for you and the field's size, for the career's line against them. */
  punditsOnYou?: { predicted: number; field: number } | null
  extra?: RunExtra
  userId: string
  formation: string
  teamOvr: number
  result: WCSeasonResult
  squad: DraftedPlayer[]
  difficulty: Difficulty | null
  custom?: CustomDifficulty | null
  stats?: unknown
  awards?: unknown
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = WC_ROUND_TO_POSITION[result.playerFinalRound] ?? 48
  const teamsInLeague = 48

  await insertRun({
    user_id: params.userId,
    mode: 'world_cup',
    formation: params.formation,
    team_ovr: params.teamOvr,
    league_id: 'wc_2026',
    league_name: 'FIFA World Cup',
    year_start: 2026,
    final_position: finalPosition,
    teams_in_league: teamsInLeague,
    // store the WC round reached as the "tier" descriptor
    tier: result.playerFinalRound,
    wins: pt.stats.won,
    draws: pt.stats.drawn,
    losses: pt.stats.lost,
    goals_for: pt.stats.goalsFor,
    goals_against: pt.stats.goalsAgainst,
    squad: params.squad,
    ...difficultyColumns(params.difficulty, params.custom),
    // Full tournament so the WC result page can be rebuilt from history.
    // Optional columns — auto-dropped by insertRun if not present in the DB yet.
    wc_result: result,
    stats:  params.stats,
    awards: params.awards,
    // P8-150: the pundits' place for you, for the career's line against them.
    highlights: { ...(params.punditsOnYou ? { punditsOnYou: params.punditsOnYou } : {}), ...extraHighlights(params.extra) },
  })
}

// Champions League — finish position + round-reached score ladder.

export async function saveCLRun(params: {
  /** P8-150: the pundits' place for you and the field's size, for the career's line against them. */
  punditsOnYou?: { predicted: number; field: number } | null
  extra?: RunExtra
  userId: string
  formation: string
  teamOvr: number
  result: CLSeasonResult
  /** P8-172: which classic competition; the Champions League when not said. */
  mode?: GameMode
  squad: DraftedPlayer[]
  difficulty: Difficulty | null
  custom?: CustomDifficulty | null
  stats?: unknown
  awards?: unknown
}) {
  const { result } = params
  const pt = result.playerTeam
  const finalPosition = CL_ROUND_TO_POSITION[result.playerFinalRound] ?? 36
  const teamsInLeague = 36
  const comp = compOfMode(params.mode) ?? EUROPE.ucl

  await insertRun({
    user_id: params.userId,
    mode: comp.mode,
    formation: params.formation,
    team_ovr: params.teamOvr,
    league_id: `${comp.leaguePrefix}2025`,
    league_name: comp.fullName,
    year_start: 2025,
    final_position: finalPosition,
    teams_in_league: teamsInLeague,
    // store the CL round reached as the "tier" descriptor
    tier: result.playerFinalRound,
    wins: pt.stats.won,
    draws: pt.stats.drawn,
    losses: pt.stats.lost,
    goals_for: pt.stats.goalsFor,
    goals_against: pt.stats.goalsAgainst,
    squad: params.squad,
    ...difficultyColumns(params.difficulty, params.custom),
    // Full tournament so the CL result page can be rebuilt from history.
    // Optional columns — auto-dropped by insertRun if not present in the DB yet.
    cl_result: result,
    stats:  params.stats,
    awards: params.awards,
    highlights: { ...(params.punditsOnYou ? { punditsOnYou: params.punditsOnYou } : {}), ...extraHighlights(params.extra) },
  })
}

// Custom Champions League path — qualifying exits score lower than the same
// round reached via the classic (finals-only) mode, since the journey started
// much earlier; still on the same ladder so runs compare sensibly.

export async function saveCustomUclRun(params: {
  /** P8-150: the pundits' place for you and the field's size, for the career's line against them. */
  punditsOnYou?: { predicted: number; field: number } | null
  extra?: RunExtra
  userId: string
  formation: string
  teamOvr: number
  result: CLSeasonResult
  squad: DraftedPlayer[]
  difficulty: Difficulty | null
  custom?: CustomDifficulty | null
  weightedPicksOverride?: boolean | null   // Big Fixes §4 — CL (full) only
  /** P8.5-21: the competition this run hunted ('any' or absent: wherever it led). */
  target?: 'any' | 'ucl' | 'uel' | 'uecl' | null
  /** P8.5-21: for "The Double, Europe": did you win your league, and its cup. */
  domestic?: { champion: boolean; cupWon: boolean } | null
  stats?: unknown
  awards?: unknown
  qual?: unknown          // QualifyingResult — stored so history can rebuild the ladder
  leagueTables?: unknown  // SimLeagueTable[] — stored so history can rebuild the league viewer
}) {
  const { result } = params
  const pt = result.playerTeam
  // P8-52: a season that went on in the Europa or Conference League is tiered there.
  const tier = fullPathTier(result)
  const finalPosition = CUSTOM_CL_ROUND_TO_POSITION[tier] ?? 90
  const teamsInLeague = 36

  await insertRun({
    user_id: params.userId,
    mode: 'champions_league_custom',
    formation: params.formation,
    team_ovr: params.teamOvr,
    league_id: 'cucl_2025',
    league_name: 'Champions League (Custom Path)',
    year_start: 2025,
    final_position: finalPosition,
    teams_in_league: teamsInLeague,
    tier,
    wins: pt.stats.won,
    draws: pt.stats.drawn,
    losses: pt.stats.lost,
    goals_for: pt.stats.goalsFor,
    goals_against: pt.stats.goalsAgainst,
    squad: params.squad,
    ...withTarget(difficultyColumns(params.difficulty, params.custom, 'champions_league_custom', params.weightedPicksOverride), params.target),
    // Full tournament + qualifying ladder + domestic tables so the result page
    // can be rebuilt IDENTICALLY from history. The qualifying ladder and the 53
    // simulated league tables are nested INSIDE cl_result (a jsonb column that
    // exists) rather than separate columns — so nothing is dropped even without
    // a Supabase migration. The result page reads them back from here.
    cl_result: { ...result, _customUclQual: withoutCupBrackets(params.qual), _customUclTables: params.leagueTables },
    stats:  params.stats,
    awards: params.awards,
    highlights: {
      ...(params.punditsOnYou ? { punditsOnYou: params.punditsOnYou } : {}),
      ...(params.domestic ? { fullPath: { domesticChampion: params.domestic.champion, cupWon: params.domestic.cupWon } } : {}),
      ...extraHighlights(params.extra),
    },
  })
}

export async function fetchRunById(runId: string) {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('id', runId)
    .single()

  if (error) throw error
  return shownRun(data)
}

// P8.5-21: a hunting run carries its target in difficulty_meta, a jsonb column
// that exists, so the score (score.ts: TARGET_MULTIPLIER), the server's check
// and the board's filter all read it without a migration.
function withTarget<T extends { difficulty_meta: object | null }>(cols: T, target?: string | null): T {
  if (!target || target === 'any') return cols
  return { ...cols, difficulty_meta: { ...(cols.difficulty_meta ?? {}), target } }
}

// P8.5-20: the full path keeps every association's cup whole, to show each as
// its bracket during the run. The saved run keeps the winners only: the result
// page never shows the brackets, and 53 cups would add a few hundred KB to
// every saved full-path run.
// ponytail: drop this once the result page shows the cups; then measure the row.
function withoutCupBrackets<T>(qual: T): T {
  const q = qual as { europe?: { cups?: { cup?: unknown }[] } } | null
  if (!q?.europe?.cups) return qual
  return { ...q, europe: { ...q.europe, cups: q.europe.cups.map(({ cup: _cup, ...rest }) => rest) } } as T
}

// Phase 9: timed for the Diagnostics screen (save:run, docs/diagnostics/03-BUDGETS.md).
const sendPayload = (...a: Parameters<typeof sendPayloadNow>) => timeAsync('save:run', () => sendPayloadNow(...a))
