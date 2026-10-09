// Phase 9, Diagnostics step 3 (docs/diagnostics/04-CHECKS.md §1): the
// self-test. Five steps, in order, each reported as it finishes:
//   1. benchmarks (bench:*), on synthetic teams;
//   2. the engine fingerprint against the golden file (does this engine
//      rebuild a seed the way Node does?);
//   3. the shared invariants over 200 synthetic matches;
//   4. the bundled database: versions, integrity, counts;
//   5. the backend: reachable, and how fast;
//   6. the limit test (P9.75, the maintainer, 9 Oct: "runs all the limits
//      without us doing anything"): a league, a classic European, a full-path
//      European and a World Cup run, played headless on the real database by
//      the tester's quick-sims, then their stats and the pundits' tournaments.
//      Each phase is judged against the budget it's the same work as. The
//      budgets that need a screen (frames, taps, saves) are listed as such.
//
// Rules from the plan, all kept here:
//  - It yields between steps and every 100 iterations, so the screen paints,
//    Cancel works, and the stall detector doesn't record the test itself.
//  - It runs inside selfTestScope, so only bench:* is recorded meanwhile (its
//    own 200 sheets would otherwise be the app's detail:generate numbers).
//  - It never touches a run: synthetic teams, never isPlayer, so the
//    difficulty tilt (player matches only) can't reach it, and nothing reads
//    or writes the game store.
//  - No network is fine: step 5 says offline, the rest still runs.
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { simulateMatch, getMatchTilt, setMatchTilt } from '@/engine/match'
import { quickSimLeague, quickSimCL, quickSimWC, quickSimCustomUcl, type Lap } from '@/engine/quick-sim'
import { computeLeagueRunStats, computeCLRunStats, computeWCRunStats } from '@/engine/run-stats'
import { punditField, punditRatings } from '@/engine/predictions'
import { worldCupPunditTournament, championsLeaguePunditTournament } from '@/engine/cup-calls'
import { RUNTIME, budgetSpec } from './budgets'
import { generateMatchDetail } from '@/engine/match-detail'
import { buildDeepMatchTimeline } from '@/engine/deep-match'
import { generateFixtures } from '@/engine/fixtures'
import { computeRunStats } from '@/engine/run-stats'
import type { RunMatch } from '@/engine/run-matches'
import { checkMatchDetail, checkTimeline } from '@/engine/invariants'
import { ENGINE_VERSION } from '@/engine/version'
import { getDb, DB_VERSION } from '@/db/setup'
import { getClubSeasonsForMode } from '@/db/queries/seasons'
import { supabase } from '@/lib/supabase'
import { isOnline } from '@/lib/online'
import { mulberry32 } from '@/lib/rng'
import { pexp, ppow, plog, ptanh } from '@/lib/pmath'
// Through clubFacts.ts, never clubFactsData directly: the legal build swaps the
// data only for that importer (metro.config.js), and importing the data here
// once put the facts' real club names in the public web bundle.
import { clubFactCount } from '@/lib/clubFacts'
import type { SimTeam } from '@/types/simulation'
import type { RosterPlayer } from '@/types/stats'
import { sample, selfTestScope, reading } from './perf'
import { log } from './log'
import { syntheticMatch, squad, fingerprintSeed, addSeed, compareFingerprint, FINGERPRINT_SEEDS, type Fingerprint } from './fingerprint'
import { GOLDEN } from './golden'

export type Verdict = 'OK' | 'WARN' | 'FAIL' | 'NO DATA'
export type StepKey = 'bench' | 'fingerprint' | 'invariants' | 'data' | 'backend' | 'limits'
export type StepResult = { step: StepKey; verdict: Verdict; line: string; rows?: { label: string; value: string; verdict?: Verdict }[]; at: number }

const breathe = () => new Promise<void>(r => setTimeout(r, 0))
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const team = (id: string, ovr: number): SimTeam => ({
  clubId: id, clubName: `Club ${id}`, ovr, isPlayer: false, form: 0,
  stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
})

class Cancelled extends Error {}

/** Time `n` runs of `fn` and record the average under `key`, yielding every 100. */
async function bench(key: string, n: number, fn: (i: number) => void, stop: () => boolean): Promise<void> {
  let total = 0
  for (let i = 0; i < n; i++) {
    const t0 = now(); fn(i); total += now() - t0
    if (i % 100 === 99) { await breathe(); if (stop()) throw new Cancelled() }
  }
  sample(key, total / n)
}

async function benchmarks(stop: () => boolean): Promise<StepResult> {
  const a = team('BA', 80), b = team('BB', 76)
  await bench('bench:match', 2000, () => { simulateMatch(a, b) }, stop)
  const m = syntheticMatch(1)
  await bench('bench:detail', 200, () => { generateMatchDetail(m) }, stop)
  const d = generateMatchDetail(m)!
  // One sheet's worth of the portable maths, as counted in Node (P9.75 probe).
  await bench('bench:pmath', 50, () => {
    for (let k = 0; k < 650; k++) pexp(-k / 100)
    for (let k = 0; k < 275; k++) ppow(1 + k / 300, 0.7)
    for (let k = 0; k < 228; k++) plog(1 + k)
    for (let k = 0; k < 97; k++) ptanh(k / 50)
  }, stop)
  await bench('bench:timeline', 20, () => { buildDeepMatchTimeline(d, 1) }, stop)

  // A 20-club season, played and then counted, the way a league run is.
  const rng = mulberry32(2026)
  const teams = Array.from({ length: 20 }, (_, i) => team(`C${i}`, 68 + Math.floor(rng() * 22)))
  const matches: RunMatch[] = []
  let t0 = now()
  for (const f of generateFixtures(teams)) {
    const r = simulateMatch(f.home, f.away)
    matches.push({ homeClubId: f.home.clubId, awayClubId: f.away.clubId, homeClubName: f.home.clubName, awayClubName: f.away.clubName,
      homeGoals: r.homeGoals, awayGoals: r.awayGoals, seed: matches.length + 1, label: `Matchday ${f.matchday}` })
  }
  sample('bench:leagueSeason', now() - t0)
  await breathe()
  if (stop()) throw new Cancelled()
  const rosters = new Map<string, RosterPlayer[]>(teams.map(t => [t.clubId, squad(t.clubId, t.ovr, rng)]))
  t0 = now()
  computeRunStats({ matches, rosters, playerPool: rosters.get('C0')!, playerClubId: 'C0',
    finalPositionByClub: new Map(teams.map((t, i) => [t.clubId, i + 1])), teamsInComp: 20 })
  sample('bench:stats', now() - t0)
  await breathe()

  try { t0 = now(); await getClubSeasonsForMode('league'); sample('bench:query', now() - t0) }
  catch (e) { log.warn('db', 'self-test: the benchmark query failed', e) }

  const keys = ['bench:match', 'bench:detail', 'bench:pmath', 'bench:timeline', 'bench:leagueSeason', 'bench:stats', 'bench:query']
  const rows = keys.map(k => { const r = reading(k); return { label: k, value: r.count ? `${r.last.toFixed(k === 'bench:match' ? 3 : 1)} ms` : 'no data', verdict: (r.count ? r.status : 'NO DATA') as Verdict } })
  const worst = rows.some(r => r.verdict === 'FAIL') ? 'FAIL' : rows.some(r => r.verdict === 'WARN') ? 'WARN' : 'OK'
  return { step: 'bench', verdict: worst, line: rows.map(r => `${r.label.slice(6)} ${r.value}`).join(' · '), rows, at: Date.now() }
}

async function fingerprint(stop: () => boolean): Promise<StepResult> {
  const fp: Fingerprint = { engine: ENGINE_VERSION, raw: [], shown: [], sheets: [] }
  for (let seed = 1; seed <= FINGERPRINT_SEEDS; seed++) {
    addSeed(fp, seed, fingerprintSeed(seed))
    if (seed % 5 === 0) { await breathe(); if (stop()) throw new Cancelled() }
  }
  const c = compareFingerprint(fp, GOLDEN)
  const verdict: Verdict = c.status === 'MATCH' ? 'OK' : c.status === 'RAW DIFFERS' ? 'WARN' : c.status === 'STALE' ? 'NO DATA' : 'FAIL'
  return { step: 'fingerprint', verdict, line: `${c.status}${c.detail ? ` · ${c.detail}` : ''} (engine ${ENGINE_VERSION})`, at: Date.now() }
}

/** 200 synthetic matches from a clock seed (printed, so a failure replays: verify-diag-golden --replay). */
async function invariants(stop: () => boolean): Promise<StepResult> {
  const start = Date.now() % 1_000_000_000
  for (let i = 0; i < 200; i++) {
    const seed = start + i
    const m = syntheticMatch(seed)
    const d = generateMatchDetail(m)
    const v = d ? [...checkMatchDetail(d, m), ...checkTimeline(buildDeepMatchTimeline(d, seed), d, m)] : ['the sheet failed to generate']
    if (v.length) return { step: 'invariants', verdict: 'FAIL', line: `${i}/200 · seed ${seed}: ${v[0]}`, at: Date.now() }
    if (i % 10 === 9) { await breathe(); if (stop()) throw new Cancelled() }
  }
  return { step: 'invariants', verdict: 'OK', line: `200/200 (from seed ${start})`, at: Date.now() }
}

async function data(): Promise<StepResult> {
  const rows: NonNullable<StepResult['rows']> = [{ label: 'bundled', value: String(DB_VERSION) }]
  let verdict: Verdict = 'OK'
  const fail = (v: Verdict) => { if (v === 'FAIL' || (v === 'WARN' && verdict === 'OK')) verdict = v }
  try {
    let installed: number = DB_VERSION   // the web always loads the bundled file
    if (Platform.OS !== 'web') {
      const p = `${FileSystem.documentDirectory}SQLite/pom.db.version`
      installed = parseInt((await FileSystem.readAsStringAsync(p)).trim(), 10) || 0
    }
    const iv: Verdict = installed < DB_VERSION ? 'FAIL' : 'OK'
    rows.push({ label: 'installed', value: String(installed), verdict: iv }); fail(iv)
    const db = await getDb()
    const meta = await db.getFirstAsync<{ value: string }>(`SELECT value FROM _meta WHERE key = 'db_version'`)
    const mv: Verdict = Number(meta?.value) === installed ? 'OK' : 'FAIL'
    rows.push({ label: '_meta', value: meta?.value ?? 'missing', verdict: mv }); fail(mv)
    const qc = await db.getFirstAsync<{ quick_check: string }>('PRAGMA quick_check')
    const qv: Verdict = qc?.quick_check === 'ok' ? 'OK' : 'FAIL'
    rows.push({ label: 'integrity', value: qc?.quick_check ?? 'no answer', verdict: qv }); fail(qv)
    for (const table of ['leagues', 'clubs', 'club_seasons', 'players', 'player_seasons']) {
      try {
        const n = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)   // fixed table names, nothing from outside
        rows.push({ label: table, value: (n?.n ?? 0).toLocaleString('en') })
      } catch { rows.push({ label: table, value: 'no table' }) }
    }
  } catch (e) {
    rows.push({ label: 'error', value: String((e as Error)?.message ?? e), verdict: 'FAIL' }); fail('FAIL')
  }
  // An empty facts file once broke a Hermes build; the legal build's is empty on purpose.
  const facts = clubFactCount()
  rows.push({ label: 'club facts', value: String(facts) })
  return { step: 'data', verdict, line: rows.filter(r => r.label !== 'error' || verdict === 'FAIL').map(r => `${r.label} ${r.value}`).slice(0, 5).join(' · '), rows, at: Date.now() }
}

async function backend(): Promise<StepResult> {
  if (!isOnline()) return { step: 'backend', verdict: 'NO DATA', line: 'offline', at: Date.now() }
  const t0 = now()
  try {
    // The lightest read there is: one id from a public table, no rows needed.
    const { error, status } = await supabase.from('profiles').select('id', { head: true }).limit(1)
    const ms = now() - t0
    sample('bench:net', ms)
    if (!error) return { step: 'backend', verdict: reading('bench:net').status as Verdict, line: `reachable · ${Math.round(ms)} ms`, at: Date.now() }
    const kind = status === 401 || status === 403 ? 'auth error' : status >= 500 ? 'server error' : `error ${status}`
    return { step: 'backend', verdict: 'FAIL', line: kind, at: Date.now() }
  } catch {
    return { step: 'backend', verdict: 'NO DATA', line: 'offline', at: Date.now() }
  }
}

/** A number against its budget, the way reading() judges one sample. A key
 *  with no budget is a typo in a lap (verify-budgets checks them too). */
function judge(key: string, ms: number): Verdict {
  const spec = budgetSpec(key)
  return !spec ? 'FAIL' : ms > spec.hardFail ? 'FAIL' : ms > spec.target ? 'WARN' : 'OK'
}

async function limits(stop: () => boolean): Promise<StepResult> {
  // The worst of each budget's laps (the knockouts run three times).
  const worst = new Map<string, number>()
  const lap: Lap = (k, ms) => worst.set(k, Math.max(worst.get(k) ?? 0, ms))
  const failed: string[] = []
  const step = async <T>(what: string, fn: () => Promise<T>): Promise<T | null> => {
    await breathe()
    if (stop()) throw new Cancelled()
    try { return await fn() } catch (e) { failed.push(what); log.warn('app', `limit test: ${what} failed`, e); return null }
  }
  const timed = async <T>(key: string, fn: () => Promise<T> | T): Promise<T> => {
    const t0 = now(); const v = await fn(); lap(key, now() - t0); return v
  }
  // The quick-sims play neutral; a run in progress keeps its own tilt.
  const tilt = getMatchTilt()
  try {
    const lg = await step('league', () => quickSimLeague(lap))
    if (lg) await step('league stats', () => timed('stats:league', () => computeLeagueRunStats(lg.simResult, lg.draftedPlayers, lg.placedLeague)))
    const cl = await step('Champions League', () => quickSimCL(lap))
    if (cl) await step('Champions League stats', () => timed('stats:ucl', () => computeCLRunStats(cl.clResult, cl.draftedPlayers)))
    await step('full path', () => quickSimCustomUcl(lap))
    const wc = await step('World Cup', () => quickSimWC(lap))
    if (wc) await step('World Cup stats', () => timed('stats:wc', () => computeWCRunStats(wc.wcResult, wc.draftedPlayers)))
    // One pundit's whole tournament, each kind, on the field just played.
    const seed = 975
    const wf = wc ? punditField('world_cup', { wcTeams: wc.wcTeams }) : null
    if (wf) await step('the pundits (World Cup)', () => timed('pundits:build', () => worldCupPunditTournament(wf.teams, punditRatings(wf.teams, seed), seed)))
    const cf = cl ? punditField('champions_league', { clTeams: cl.clTeams }) : null
    if (cf) await step('the pundits (Champions League)', () => timed('pundits:build', () => championsLeaguePunditTournament(cf.teams, punditRatings(cf.teams, seed), seed)))
  } finally { setMatchTilt(tilt) }

  const platform = Platform.OS === 'web' ? 'web' : 'android'
  const keys = RUNTIME.filter(k => { const p = budgetSpec(k)?.platforms; return !p || p.includes(platform) })
  const rows: NonNullable<StepResult['rows']> = keys.filter(k => worst.has(k)).map(k => {
    const ms = worst.get(k)!
    return { label: k, value: `${ms.toFixed(0)} ms / ${budgetSpec(k)!.target}`, verdict: judge(k, ms) }
  })
  for (const f of failed) rows.push({ label: f, value: 'failed', verdict: 'FAIL' })
  const untested = keys.filter(k => !worst.has(k))
  const verdict: Verdict = rows.some(r => r.verdict === 'FAIL') ? 'FAIL' : rows.some(r => r.verdict === 'WARN') ? 'WARN' : rows.length ? 'OK' : 'NO DATA'
  const over = rows.filter(r => r.verdict !== 'OK')
  // The line goes into the shared report (kept under 4,000 characters), so it
  // names only what's over; the rows, on the screen, have every number.
  const line = `${rows.length - failed.length} of ${keys.length} budgets run` + (over.length ? ` · over: ${over.map(r => `${r.label} ${r.value}`).join(', ')}` : ' · all within')
  rows.push({ label: 'needs a screen', value: untested.join(', ') })
  return { step: 'limits', verdict, line, rows, at: Date.now() }
}

/**
 * Run the self-test. `onStep` hears each result as it lands; `stop` is polled
 * between steps and inside loops (Cancel). Resolves with what finished.
 */
export async function runSelfTest(onStep?: (r: StepResult) => void, stop: () => boolean = () => false): Promise<StepResult[]> {
  const done: StepResult[] = []
  log.info('app', 'self-test started')
  await selfTestScope(async () => {
    try {
      for (const step of [() => benchmarks(stop), () => fingerprint(stop), () => invariants(stop), data, backend, () => limits(stop)]) {
        const r = await step()
        done.push(r); onStep?.(r)
        log.info('app', `self-test ${r.step}: ${r.verdict} · ${r.line}`)
        await breathe()
        if (stop()) throw new Cancelled()
      }
    } catch (e) {
      if (e instanceof Cancelled) log.info('app', 'self-test cancelled')
      else log.error('app', 'self-test failed', e)
    }
  })
  return done
}
