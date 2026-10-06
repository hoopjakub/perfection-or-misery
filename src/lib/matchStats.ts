import { router } from 'expo-router'
import type { MatchDetailRequest } from '@/engine/stages'

// Big Fixes §10 promoted match stats from a modal to a real screen. The screen
// needs a whole request object — clubs, scoreline, stored scorers, the deep-stat
// seed, the drafted squad, the season context — which is far too much to push
// through route params (and half of it isn't serialisable anyway).
//
// So it's handed over in module scope: set the request, push the route, and the
// screen picks it up once on mount and keeps its own copy. That makes it a
// one-shot handoff — a later push can never mutate a screen already on the
// stack, so two stats screens stacked on top of each other each keep their own
// match.
let pending: MatchDetailRequest | null = null

/**
 * Open the full match-stats screen for one finished match. Build the request
 * with `matchRequest`, `tieRequest` or `cupTieRequest` (src/engine/stages.ts).
 * It used to take the mode's accent as well; the sheet has drawn on cotton
 * since P4-H and never read it (centralisation N-19), so it's gone.
 */
export function openMatchStats(request: MatchDetailRequest | null) {
  if (!request) return
  pending = request
  router.push('/game/match-stats')
}

/** Read the request the pending navigation carried. Screen use only. */
export function takeMatchStatsRequest(): MatchDetailRequest | null {
  return pending
}
