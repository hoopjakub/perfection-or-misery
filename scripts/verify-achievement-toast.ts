// P9.75-23 · Achievements pop whatever the connection does:
//   npx tsx scripts/verify-achievement-toast.ts
//
// Drives src/lib/achievementJudge.ts with a fake server and a fake phone
// storage through the ways a session goes (the maintainer, 9 Oct: "losing it
// while still in the app loses it"). Each scenario: what the phone knew, what
// the network did when the winning run ended, and whether its achievement
// popped once. The old order (fetch first, judge after) is run beside it, to
// show which scenarios it failed.
import { judgeAchievements, type JudgeDeps, type Earned } from '../src/lib/achievementJudge'
import { earnedList, achievementRunFromRow } from '../src/lib/achievements'
import type { AchievementRun } from '../src/db/queries/leaderboard'

let failures = 0
const check = (ok: boolean, msg: string) => { if (!ok) { failures++; console.log(`❌ ${msg}`) } }

const U = 'user-1'
const row = (mode: string, difficulty: string, won: boolean) => ({ user_id: U, mode, tier: won ? 'champions' : 'mid', final_position: won ? 1 : 9, losses: 3, squad: [], difficulty, difficulty_meta: null })
const OLD = [row('league', 'easy', true)]                 // what this player already has on the server
const WIN = row('league', 'medium', true)                 // the run that ends now: a first Medium league title
const KEY = 'league:Medium'

type Net = 'ok' | 'fails' | 'hangs'
function world(net: Net, opts: { seen?: boolean; kept?: boolean; queued?: Record<string, unknown>[]; serverHasWin?: boolean } = {}) {
  const store = new Map<string, string>()
  const server = [...OLD, ...(opts.serverHasWin ? [WIN] : [])].map(achievementRunFromRow)
  if (opts.seen) store.set(`pom-announced-${U}`, JSON.stringify(earnedList(OLD.map(achievementRunFromRow)).map(e => e.key)))
  if (opts.kept) store.set(`pom-ach-runs-${U}`, JSON.stringify(OLD.map(achievementRunFromRow)))
  const shown: Earned[] = []
  const deps: JudgeDeps = {
    fetchRuns: () => net === 'ok' ? Promise.resolve(server) : net === 'fails' ? Promise.reject(new Error('Network request failed')) : new Promise<AchievementRun[]>(() => {}),
    get: async k => store.get(k) ?? null,
    set: async (k, v) => { store.set(k, v) },
    queued: async () => opts.queued ?? [],
    show: f => shown.push(...f),
    timeoutMs: 50,
  }
  return { deps, shown, store }
}

// The old order, as it shipped on 8 Oct: fetch first (no limit), keep the
// runs, then judge; nothing kept → give up.
async function oldJudge(deps: JudgeDeps, userId: string, justPlayed?: Record<string, unknown> | null) {
  let saved: AchievementRun[]
  const race = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error('still waiting')), 300))])
  try { saved = await race(deps.fetchRuns()); await deps.set(`pom-ach-runs-${userId}`, JSON.stringify(saved)) }
  catch (e) {
    if ((e as Error).message === 'still waiting') return   // a hung request: nothing, for as long as it hangs
    const kept = await deps.get(`pom-ach-runs-${userId}`); if (!kept) return; saved = JSON.parse(kept)
  }
  const local = [...(await deps.queued()), ...(justPlayed ? [justPlayed] : [])].map(achievementRunFromRow)
  const earned = earnedList([...saved, ...local])
  const raw = await deps.get(`pom-announced-${userId}`)
  const seen = new Set<string>(raw ? JSON.parse(raw) : [])
  const fresh = raw ? earned.filter(e => !seen.has(e.key)) : []
  await deps.set(`pom-announced-${userId}`, JSON.stringify([...new Set([...seen, ...earned.map(e => e.key)])]))
  if (fresh.length) deps.show(fresh)
}

type Scenario = { name: string; net: Net; seen?: boolean; kept?: boolean; queued?: boolean; serverHasWin?: boolean; expect: number }
const SCENARIOS: Scenario[] = [
  { name: 'online all along', net: 'ok', seen: true, kept: true, serverHasWin: true, expect: 1 },
  { name: 'online at the start, the connection gone at the end (requests fail)', net: 'fails', seen: true, kept: true, expect: 1 },
  { name: 'online at the start, the connection gone at the end (requests hang)', net: 'hangs', seen: true, kept: true, expect: 1 },
  { name: 'offline from the start, last session known', net: 'fails', seen: true, kept: true, queued: true, expect: 1 },
  { name: 'shown before, but the runs never kept (yesterday\'s build)', net: 'hangs', seen: true, kept: false, expect: 1 },
  { name: 'runs kept, nothing recorded as shown', net: 'fails', seen: false, kept: true, expect: 1 },
  { name: 'a brand-new phone, offline: nothing to compare with', net: 'fails', seen: false, kept: false, expect: 0 },
]

async function main() {
  const oldFails: string[] = []
  for (const sc of SCENARIOS) {
    for (const [label, judge] of [['new', judgeAchievements], ['old', oldJudge]] as const) {
      const queued = sc.queued ? [WIN] : []
      const w = world(sc.net, { seen: sc.seen, kept: sc.kept, queued, serverHasWin: sc.serverHasWin })
      await judge(w.deps, U, sc.queued ? null : WIN)
      await new Promise(r => setTimeout(r, 120))
      const popped = w.shown.filter(e => e.key === KEY).length
      if (label === 'new') check(popped === sc.expect, `${sc.name}: the Medium title popped ${popped} time(s), expected ${sc.expect}`)
      else if (popped !== sc.expect) oldFails.push(sc.name)
    }
  }
  // Afterwards, online: the queued run reaches the server; nothing pops twice.
  {
    const w = world('fails', { seen: true, kept: true })
    await judgeAchievements(w.deps, U, WIN)
    const first = w.shown.length
    w.deps.fetchRuns = () => Promise.resolve([...OLD, WIN].map(achievementRunFromRow))
    await judgeAchievements(w.deps, U, null)
    check(first === 1 && w.shown.length === 1, `back online, the same achievement popped again (${w.shown.length})`)
  }
  // A run that earns nothing new pops nothing, online or not.
  for (const net of ['ok', 'fails', 'hangs'] as Net[]) {
    const w = world(net, { seen: true, kept: true })
    await judgeAchievements(w.deps, U, row('league', 'easy', true))
    await new Promise(r => setTimeout(r, 80))
    check(w.shown.length === 0, `an Easy title already held popped (${net})`)
  }
  console.log(`${SCENARIOS.length} scenarios; the old order failed: ${oldFails.length ? oldFails.join(' · ') : 'none'}`)
  console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}
main()
