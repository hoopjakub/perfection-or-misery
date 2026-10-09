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
import { judgeAchievements } from '@/lib/achievementJudge'
import { queuedPayloads } from '@/lib/runQueue'

export type AchievementToastItem = { key: string; title: string; line: string }

type ToastQueue = { queue: AchievementToastItem[]; shift: () => void }
export const useAchievementToasts = create<ToastQueue>(set => ({
  queue: [],
  shift: () => set(s => ({ queue: s.queue.slice(1) })),
}))

/** Works out what's new since the last announcement and queues it. Never throws.
 *  The judging is src/lib/achievementJudge.ts (P9.75-23): on the phone first,
 *  the server second, with a time limit. */
export async function announceNewAchievements(userId: string, justPlayed?: Record<string, unknown> | null): Promise<void> {
  try {
    await judgeAchievements({
      fetchRuns: () => fetchAchievementRuns(userId),
      get: k => settingsStorage.getItem(k),
      set: (k, v) => settingsStorage.setItem(k, v),
      queued: queuedPayloads,
      show: fresh => useAchievementToasts.setState(s => ({ queue: [...s.queue, ...fresh] })),
      log: m => log.info('ui', m),
    }, userId, justPlayed)
  } catch (e) {
    log.warn('ui', 'achievements: announcing failed', e)
  }
}
