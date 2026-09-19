// Links between a run's pages (Phase 5): every player, club, story and match
// in a run is a route, reached with one of these. No modals.
import { router } from 'expo-router'
import { openMatchStats } from '@/lib/matchStats'
import { prim } from '@/theme'
import type { RunData } from '@/lib/runData'
import type { RunMatch } from '@/engine/run-stats'

const withRun = (params: Record<string, string>, runId?: string) => (runId ? { ...params, runId } : params)

/** A player's page. `ceremony` hides his honours, so Awards Night can't be spoiled. */
export function openPlayer(playerId: string, runId?: string, ceremony?: boolean) {
  router.push({ pathname: '/game/player', params: withRun(ceremony ? { id: playerId, ceremony: '1' } : { id: playerId }, runId) } as never)
}

export function openClub(clubId: string, runId?: string) {
  router.push({ pathname: '/game/club', params: withRun({ id: clubId }, runId) } as never)
}

export function openStory(storyId: string) {
  router.push({ pathname: '/game/story', params: { id: storyId } } as never)
}

/** The run hub, on one of its tabs. */
export function openRunHub(tab?: string, runId?: string) {
  router.push({ pathname: '/game/run', params: withRun(tab ? { tab } : {}, runId) } as never)
}

/** A match of the run, on the match sheet, with the whole run as its context. */
export function openRunMatch(data: RunData, m: RunMatch) {
  if (data.yearStart == null) return
  openMatchStats({
    homeClubId: m.homeClubId, homeName: m.homeClubName,
    awayClubId: m.awayClubId, awayName: m.awayClubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals, extraTime: m.extraTime,
    scorers: m.scorers, seed: m.seed,
    homeRotation: m.homeRotation, awayRotation: m.awayRotation,
    absent: m.absent, standIns: m.standIns,
    yearStart: data.yearStart,
    competitionLabel: m.label,
    playerClubId: data.playerClubId ?? undefined,
    drafted: data.drafted,
    playerFormation: data.formation ?? undefined,
    linkPages: true,
  }, prim.cotton)
}
