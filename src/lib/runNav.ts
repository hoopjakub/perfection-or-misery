// Links between a run's pages (Phase 5): every player, club, story and match
// in a run is a route, reached with one of these. No modals.
import { router } from 'expo-router'
import { openMatchStats } from '@/lib/matchStats'
import { prim } from '@/theme'
import type { RunData } from '@/lib/runData'
import type { RunMatch } from '@/engine/run-stats'
import type { MatchDetailRequest } from '@/components/MatchStatsParts'

const withRun = (params: Record<string, string>, runId?: string) => (runId ? { ...params, runId } : params)

/** A player's page. `ceremony` hides his honours, so Awards Night can't be spoiled. */
export function openPlayer(playerId: string, runId?: string, ceremony?: boolean) {
  router.push({ pathname: '/game/player', params: withRun(ceremony ? { id: playerId, ceremony: '1' } : { id: playerId }, runId) } as never)
}

export function openClub(clubId: string, runId?: string) {
  router.push({ pathname: '/game/club', params: withRun({ id: clubId }, runId) } as never)
}

/** A press story. A saved run's stories come from that run (P8-96), so its id
 *  goes along; the live run's don't need one. */
export function openStory(storyId: string, runId?: string) {
  router.push({ pathname: '/game/story', params: withRun({ id: storyId }, runId) } as never)
}

/** The run hub, on one of its tabs. */
export function openRunHub(tab?: string, runId?: string) {
  router.push({ pathname: '/game/run', params: withRun(tab ? { tab } : {}, runId) } as never)
}

/** A match of the run, on the match sheet, with the whole run as its context. */
const LEG = / · Leg ([12])$/

export function openRunMatch(data: RunData, m: RunMatch) {
  const yearStart = data.yearStart
  if (yearStart == null) return
  const req = (x: RunMatch): MatchDetailRequest => ({
    homeClubId: x.homeClubId, homeName: x.homeClubName,
    awayClubId: x.awayClubId, awayName: x.awayClubName,
    homeGoals: x.homeGoals, awayGoals: x.awayGoals, extraTime: x.extraTime,
    pensNote: x.pensNote, shootout: x.shootout,
    scorers: x.scorers, seed: x.seed,
    homeRotation: x.homeRotation, awayRotation: x.awayRotation,
    absent: x.absent, standIns: x.standIns,
    yearStart,
    competitionLabel: x.label,
    playerClubId: data.playerClubId ?? undefined,
    drafted: data.drafted,
    playerFormation: data.formation ?? undefined,
    linkPages: true,
  })
  // P8-101: a leg of a two-legged tie brings the other leg along, so the sheet
  // can switch between them. The other leg is the same round with the two
  // clubs the other way round.
  const leg = m.label?.match(LEG)
  const round = m.label?.replace(LEG, '')
  const other = leg ? data.matches?.find(x => x !== m && x.label?.match(LEG) && x.label.replace(LEG, '') === round
    && x.homeClubId === m.awayClubId && x.awayClubId === m.homeClubId) : undefined
  const legs = leg && other ? (leg[1] === '1' ? [req(m), req(other)] : [req(other), req(m)]) : undefined
  openMatchStats({ ...req(m), legs }, prim.cotton)
}
