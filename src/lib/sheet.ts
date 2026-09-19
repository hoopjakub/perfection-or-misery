import type { ReactNode } from 'react'
import { router } from 'expo-router'

// A page for content that only exists in memory (Phase 5 removed every content
// modal). A league table from a live Champions League draw or a World Cup group
// mid-tournament isn't a run yet, so there's nothing a URL could name. So, like
// the match sheet (`src/lib/matchStats.ts`), it's handed over in module scope:
// set it, push the route, and the screen keeps its own copy on mount, so two
// stacked sheets each keep theirs.
// ponytail: a web reload loses the hand-off and the page says so; give each
// sheet a real URL once its data is persisted.
export type Sheet = { title: string; sub?: string; render: () => ReactNode }

let pending: Sheet | null = null

export function openSheet(sheet: Sheet) {
  pending = sheet
  router.push('/game/sheet')
}

export function takeSheet(): Sheet | null {
  return pending
}
