// P9.75-23, second pass (the phone, 9 Oct: "losing [the connection] while
// still in the app loses it") · What's new since the last announcement, worked
// out on the phone first and checked against the server second.
//
// The first version fetched the saved runs, then judged. With the connection
// gone mid-session the fetch didn't fail, it hung (Android waits a long time
// on a dead network), so the toast never came; and with nothing kept on the
// phone it gave up. Now:
//  1. at once, from what the phone knows: the runs kept from the last fetch,
//     the runs waiting in the offline queue and the run just finished;
//  2. then the server, with a time limit: what it adds (a run saved on another
//     device) pops too, nothing pops twice.
// The first look on a phone stays silent (nothing to compare with), unless the
// run just finished earns something the kept runs didn't.
//
// No React, no RN: scripts/verify-achievement-toast.ts drives it with a fake
// network and storage through every way the connection can go.
import { earnedList, achievementRunFromRow } from './achievements'
import type { AchievementRun } from '@/db/queries/leaderboard'

export type Earned = { key: string; title: string; line: string }
export type JudgeDeps = {
  fetchRuns: () => Promise<AchievementRun[]>
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  /** The runs waiting in the offline queue, as they'll be sent. */
  queued: () => Promise<Record<string, unknown>[]>
  show: (fresh: Earned[]) => void
  log?: (msg: string) => void
  timeoutMs?: number
}

export const FETCH_LIMIT_MS = 8000
const seenKey = (u: string) => `pom-announced-${u}`
const runsKey = (u: string) => `pom-ach-runs-${u}`

function withLimit<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${Math.round(ms / 1000)} s`)), ms)
    p.then(v => { clearTimeout(timer); resolve(v) }, e => { clearTimeout(timer); reject(e) })
  })
}

export async function judgeAchievements(deps: JudgeDeps, userId: string, justPlayed?: Record<string, unknown> | null): Promise<void> {
  const parse = <T>(raw: string | null): T | null => { try { return raw ? JSON.parse(raw) as T : null } catch { return null } }
  let seen = parse<string[]>(await deps.get(seenKey(userId)))
  const kept = parse<AchievementRun[]>(await deps.get(runsKey(userId)))
  const waiting = (await deps.queued()).filter(p => p.user_id === userId)
  const local = [...waiting, ...(justPlayed ? [justPlayed] : [])].map(achievementRunFromRow)

  const remember = async (keys: string[]) => {
    seen = [...new Set([...(seen ?? []), ...keys])]
    await deps.set(seenKey(userId), JSON.stringify(seen))
  }
  const announce = async (earned: Earned[]) => {
    const had = new Set(seen ?? [])
    const fresh = earned.filter(e => !had.has(e.key))
    await remember(earned.map(e => e.key))
    if (fresh.length) deps.show(fresh)
  }

  // 1 · At once, from the phone.
  if (seen) await announce(earnedList([...(kept ?? []), ...local]))
  else if (kept) {
    // No record of what was shown, but the runs were kept: they're the
    // baseline, and only what the new runs add is news.
    await remember(earnedList(kept).map(e => e.key))
    await announce(earnedList([...kept, ...local]))
  }

  // 2 · The server, with a limit.
  try {
    const fetched = await withLimit(deps.fetchRuns(), deps.timeoutMs ?? FETCH_LIMIT_MS)
    await deps.set(runsKey(userId), JSON.stringify(fetched))
    const earned = earnedList([...fetched, ...local])
    if (seen) await announce(earned)
    else await remember(earned.map(e => e.key))   // the first look on this phone: silent
  } catch (e) {
    deps.log?.(`achievements: the server didn't answer (${String((e as Error)?.message ?? e)}); judged on the phone`)
  }
}
