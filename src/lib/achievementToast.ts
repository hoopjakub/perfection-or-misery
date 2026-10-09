// P8.5-36: a new achievement pops up, Minecraft's way ("Advancement Made!").
//
// After a run is saved (useRunSave), everything you've earned is worked out
// again from your saved runs, by the same rules as the Achievements screen
// (src/lib/achievements.ts), and compared with what this phone has already
// announced. Anything new joins a queue the toast (AchievementToast, in the
// root layout) shows one at a time.
//
// The first time on a phone there's nothing to compare with, so everything
// earned so far is recorded without a sound: a long-time player would
// otherwise get every trophy they ever won, one after another.
//
// P9.75-23: offline too. The server's runs are kept on the phone after each
// fetch; with no connection the kept list stands in, and the runs waiting in
// the offline queue and the run just finished are counted with it. An
// achievement pops the moment its run ends, not after the run has gone up and
// the app has been reloaded.
import { create } from 'zustand'
import { log } from '@/diag/log'
import { settingsStorage } from '@/lib/mmkv'
import { fetchAchievementRuns } from '@/db/queries/leaderboard'
import { earnedList, achievementRunFromRow } from '@/lib/achievements'
import { queuedPayloads } from '@/lib/runQueue'
import type { AchievementRun } from '@/db/queries/leaderboard'

export type AchievementToastItem = { key: string; title: string; line: string }

type ToastQueue = { queue: AchievementToastItem[]; shift: () => void }
export const useAchievementToasts = create<ToastQueue>(set => ({
  queue: [],
  shift: () => set(s => ({ queue: s.queue.slice(1) })),
}))

const keyFor = (userId: string) => `pom-announced-${userId}`
const runsKeyFor = (userId: string) => `pom-ach-runs-${userId}`

/** Works out what's new since the last announcement and queues it. Never throws. */
export async function announceNewAchievements(userId: string, justPlayed?: Record<string, unknown> | null): Promise<void> {
  try {
    let saved: AchievementRun[]
    try {
      saved = await fetchAchievementRuns(userId)
      await settingsStorage.setItem(runsKeyFor(userId), JSON.stringify(saved))
    } catch (e) {
      const kept = await settingsStorage.getItem(runsKeyFor(userId))
      if (!kept) throw e
      log.info('ui', 'achievements: offline, judged from the runs kept on the phone')
      saved = JSON.parse(kept)
    }
    const waiting = (await queuedPayloads()).filter(p => p.user_id === userId)
    const local = [...waiting, ...(justPlayed ? [justPlayed] : [])].map(achievementRunFromRow)
    // A run both just saved and fetched counts twice; earned is a set of keys, so that's harmless.
    const earned = earnedList([...saved, ...local])
    const raw = await settingsStorage.getItem(keyFor(userId))
    const seen = new Set<string>(raw ? JSON.parse(raw) : [])
    const fresh = raw ? earned.filter(e => !seen.has(e.key)) : []
    // Kept as a union: a fetch that comes back short must never make an old one new again.
    await settingsStorage.setItem(keyFor(userId), JSON.stringify([...new Set([...seen, ...earned.map(e => e.key)])]))
    if (fresh.length) useAchievementToasts.setState(s => ({ queue: [...s.queue, ...fresh] }))
  } catch (e) {
    log.warn('ui', 'achievements: announcing failed', e)
  }
}
