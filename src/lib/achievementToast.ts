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
import { create } from 'zustand'
import { settingsStorage } from '@/lib/mmkv'
import { fetchAchievementRuns } from '@/db/queries/leaderboard'
import { earnedList } from '@/lib/achievements'

export type AchievementToastItem = { key: string; title: string; line: string }

type ToastQueue = { queue: AchievementToastItem[]; shift: () => void }
export const useAchievementToasts = create<ToastQueue>(set => ({
  queue: [],
  shift: () => set(s => ({ queue: s.queue.slice(1) })),
}))

const keyFor = (userId: string) => `pom-announced-${userId}`

/** Works out what's new since the last announcement and queues it. Never throws. */
export async function announceNewAchievements(userId: string): Promise<void> {
  try {
    const earned = earnedList(await fetchAchievementRuns(userId))
    const raw = await settingsStorage.getItem(keyFor(userId))
    const seen = new Set<string>(raw ? JSON.parse(raw) : [])
    const fresh = raw ? earned.filter(e => !seen.has(e.key)) : []
    // Kept as a union: a fetch that comes back short must never make an old one new again.
    await settingsStorage.setItem(keyFor(userId), JSON.stringify([...new Set([...seen, ...earned.map(e => e.key)])]))
    if (fresh.length) useAchievementToasts.setState(s => ({ queue: [...s.queue, ...fresh] }))
  } catch (e) {
    console.warn('[achievements] announcing failed:', e)
  }
}
