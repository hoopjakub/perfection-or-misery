import { router } from 'expo-router'
import type { MatchDetailRequest } from '@/components/MatchStatsParts'

// Big Fixes §7 — the Deep Match is reached from inside a live simulation, so it
// needs the same module-scope handoff the stats screen uses (see
// src/lib/matchStats.ts): the request is far too big for route params, and the
// callback below isn't serialisable at all.
//
// `onFinished` is the important half. The simulation screen stays mounted
// underneath, holding the whole knockout phase's state — so rather than having
// the Deep Match try to reproduce "and then the run ends", it just tells the
// screen that owns the run that the final has been watched, and backs out.

export type DeepMatchRequest = {
  /** The final itself, in the same shape the stats screen regenerates from. */
  detail: MatchDetailRequest
  competitionLabel: string      // 'UEFA Champions League' / 'FIFA World Cup'
  roundLabel: string            // 'UCL Final' / 'FIFA World Cup Final'
  accent: string
  /** Did the player's side win it? Decides which ceremony plays. */
  playerWon: boolean
  /** The player's club in this match, so the ceremony can name the winner. */
  playerClubName?: string
  /**
   * Commit the finished run — store the season result, mark the final watched.
   * **Navigation is not this callback's job.** It used to pop back to the
   * knockout screen and let that screen push the results, which meant you got a
   * flash of the bracket you'd just finished with on the way. The Deep Match now
   * goes straight from the ceremony to `resultRoute`.
   */
  onFinished: () => void
  /** Where the run ends up: '/game/cl-result', '/game/wc-result', … */
  resultRoute: string
}

let pending: DeepMatchRequest | null = null

export function openDeepMatch(request: DeepMatchRequest) {
  pending = request
  router.push('/game/deep-match')
}

/** Read the request the pending navigation carried. Screen use only. */
export function takeDeepMatchRequest(): DeepMatchRequest | null {
  return pending
}
