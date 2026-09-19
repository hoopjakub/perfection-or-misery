import type { CompetitionStats, SeasonAwards } from '@/types/stats'
import type { RoundLines } from '@/engine/run-stats'
import type { ClubRow } from '@/engine/awards'
import type { SimTeam } from '@/types/simulation'
import type { LeagueTeam } from '@/types/game'
import { predictTable } from '@/engine/predictions'
import { router } from 'expo-router'
import { openPlayer } from '@/lib/runNav'

// Awards Night sits between the final whistle and the verdict, so it is the
// screen that pays for computing the run's stats. The verdict then reads them
// from here instead of regenerating every match sheet a second time. Module
// scope, the same pattern as src/lib/confirm.ts and src/lib/deepMatch.ts,
// because a route's params can't carry objects.

export type RunStats = { stats: CompetitionStats; awards: SeasonAwards; rounds?: RoundLines }

let stashed: RunStats | null = null

export function stashRunStats(value: RunStats | null) {
  stashed = value
}

/** Read once: a second visit to the verdict recomputes rather than reusing stale numbers. */
export function takeRunStats(): RunStats | null {
  const v = stashed
  stashed = null
  return v
}

/**
 * The manager award needs what each club was expected to do. In a league that
 * is the pundits' table, rebuilt from the seed stored on the run; the cups
 * predict rounds rather than places, so they have no manager award.
 */
export function clubsForManagerAward(
  teams: LeagueTeam[] | undefined, table: SimTeam[] | undefined, predictionSeed: number | null | undefined,
): ClubRow[] {
  if (!teams || !table || predictionSeed == null) return []
  const predicted = new Map(predictTable(teams, predictionSeed).table.map(r => [r.clubId, r.predicted]))
  return table.map((t, i) => ({ clubId: t.clubId, clubName: t.clubName, finalPosition: i + 1, predicted: predicted.get(t.clubId) }))
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
