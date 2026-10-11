// A guest's finished runs, kept on the phone until an account adopts them
// (Phase 10.5, docs/release/09-GUESTS.md option C). The list itself, its key
// and its count live here, light, so Home can show how many are waiting
// without loading the run-saving module; keeping and adopting are in
// src/db/queries/runs.ts, where every save passes.
import { create } from 'zustand'
import { settingsStorage } from '@/lib/mmkv'
import type { QueuedRun } from '@/lib/runQueue'
// The rule itself is in runQueue.ts, pure, where verify-run-queue checks it.
export { withGuestRun } from '@/lib/runQueue'

export const GUEST_RUNS_KEY = 'pom-guest-runs'

export const useGuestRuns = create<{ count: number }>(() => ({ count: 0 }))

export async function loadGuestRuns(): Promise<QueuedRun[]> {
  try { return JSON.parse((await settingsStorage.getItem(GUEST_RUNS_KEY)) ?? '[]') } catch { return [] }
}
export async function saveGuestRuns(list: QueuedRun[]): Promise<void> {
  await settingsStorage.setItem(GUEST_RUNS_KEY, JSON.stringify(list))
  useGuestRuns.setState({ count: list.length })
}

loadGuestRuns().then(l => useGuestRuns.setState({ count: l.length })).catch(() => {})
