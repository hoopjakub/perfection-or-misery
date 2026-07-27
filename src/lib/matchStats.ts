import { router } from 'expo-router'
import type { MatchDetailRequest } from '@/components/MatchStatsParts'

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
 * Open the full match-stats screen for one finished match. `accent` is passed
 * separately because most call sites already have their mode's accent to hand
 * and build the request elsewhere (koLegDetailRequest and friends).
 */
export function openMatchStats(request: MatchDetailRequest, accent?: string) {
  pending = accent ? { ...request, accent } : request
  router.push('/game/match-stats')
}

/** Read the request the pending navigation carried. Screen use only. */
export function takeMatchStatsRequest(): MatchDetailRequest | null {
  return pending
}
