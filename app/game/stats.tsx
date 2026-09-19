import { Redirect, useLocalSearchParams } from 'expo-router'

// The old stats screen and its three modals (a player's games, a club's squad,
// the rulebook) are gone: Phase 5 put the boards on the run hub's STATS tab and
// every player and club on its own page. This route stays so old links and
// bookmarks land somewhere sensible.
export default function StatsRedirect() {
  const { runId, player } = useLocalSearchParams<{ runId?: string; player?: string }>()
  if (player) return <Redirect href={{ pathname: '/game/player', params: runId ? { id: player, runId } : { id: player } } as never} />
  return <Redirect href={{ pathname: '/game/run', params: runId ? { runId, tab: 'stats' } : { tab: 'stats' } } as never} />
}
