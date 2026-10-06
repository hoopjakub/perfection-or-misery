import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { RoundLines } from '@/engine/run-stats'
import { cupClubsForManagerAward, type ClubRow } from '@/engine/awards'
import { isClassicEurope } from '@/data/europe'
import type { SimTeam } from '@/types/simulation'
import type { LeagueTeam } from '@/types/game'
import { predictTable } from '@/engine/predictions'
import type { CLSeasonResult } from '@/engine/cl-sim'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import { router } from 'expo-router'
import { openPlayer } from '@/lib/runNav'

// A run's stats and awards. Computed once and kept on the store by
// liveRunData() (src/lib/runData.ts); Awards Night and the verdict both read
// that cache. L-07 (Wave F): there used to be a second, read-once hand-off
// here (stashRunStats/takeRunStats) that the verdict fell back from to a
// recompute, so a second visit regenerated every match sheet.
export type RunStats = { stats: CompetitionStats; awards: SeasonAwards; rounds?: RoundLines }

/**
 * The manager award needs what each club was expected to do. In a league that
 * is the pundits' table, rebuilt from the seed stored on the run. A cup has
 * its own: `cupClubsForManagerAward` (F-19).
 */
export function clubsForManagerAward(
  teams: LeagueTeam[] | undefined, table: SimTeam[] | undefined, predictionSeed: number | null | undefined,
): ClubRow[] {
  if (!teams || !table || predictionSeed == null) return []
  const predicted = new Map(predictTable(teams, predictionSeed).table.map(r => [r.clubId, r.predicted]))
  return table.map((t, i) => ({ clubId: t.clubId, clubName: t.clubName, finalPosition: i + 1, predicted: predicted.get(t.clubId) }))
}

/**
 * The manager award's clubs for the run in the store, whatever its mode: the
 * league's table against the pundits', a cup's rounds against theirs (F-19),
 * none for the full path. A saved run keeps neither field nor seed for a cup,
 * so this is the live run's.
 */
export function managerClubsFor(st: {
  mode: string | null; predictionSeed: number | null
  placedLeague?: { teams: LeagueTeam[] } | null; simResult?: { table: SimTeam[] } | null
  clTeams?: { clubId: string; clubName: string; ovr: number; isPlayer: boolean }[] | null; clResult?: CLSeasonResult | null
  wcTeams?: { clubId: string; clubName: string; ovr: number; isPlayer: boolean }[] | null; wcResult?: WCSeasonResult | null
}): ClubRow[] {
  if (st.mode === 'world_cup') return st.wcResult ? cupClubsForManagerAward(st.wcTeams, st.predictionSeed, { wc: st.wcResult }) : []
  if (st.mode === 'champions_league_custom') return []
  if (isClassicEurope(st.mode)) return st.clResult ? cupClubsForManagerAward(st.clTeams, st.predictionSeed, { cl: st.clResult }) : []
  return clubsForManagerAward(st.placedLeague?.teams, st.simResult?.table, st.predictionSeed)
}

/**
 * P4-C, now Phase 5's player page: an award winner opens his own page on top
 * of wherever you are, and back returns there (P8-36). Opened from Awards
 * Night it hides his honours, so the rest of the night isn't given away.
 */
export function openPlayerSeason(playerId: string, runId?: string, ceremony?: boolean) {
  openPlayer(playerId, runId, ceremony)
}

// The awards as their own screen (P8-38): a finished run's page links here
// instead of carrying every award inline, which made it far too long.
let viewing: { night: import('@/engine/awards').AwardsNight; runId?: string } | null = null

export function openAwardsView(night: import('@/engine/awards').AwardsNight, runId?: string) {
  viewing = { night, runId }
  router.push('/game/run-awards' as never)
}

export function takeAwardsView() {
  return viewing
}
