// ONE way to play a round-robin fixture (P8-27).
//
// The Champions League league phase and the World Cup group stage each had two
// copies of "play this match": the live loop, and a skip loop that simulated
// straight from the clubs' base ratings. The skip left out rotation, the
// lineup-based effective rating (so an injury or a suspension never cost a side
// anything), and form, and it decided the result before the seed existed. A
// skipped phase was quietly a different competition from a watched one.
//
// Both paths now call this, so they can't drift apart again. It is pure (no DB,
// no React), which is also what lets verify-play-fixture check it headless.

import type { SimTeam, MatchResult } from '@/types/simulation'
import type { RosterPlayer, MatchScorers } from '@/types/stats'
import { simulateMatch } from './match'
import { rotationFor, type StakesInput } from './rotation'
import { availabilityFor, recordMatchOutcome, type AvailabilityLedger } from './availability'
import { effectiveMatchOvrs } from './lineup'
import { attributeMatchScorers } from './stats'
import { mulberry32 } from '@/lib/rng'

// Stat attribution for one fixture, from the same lineup options the sheet
// regenerates with. Moved here from run-stats (which re-exports it) so this
// module stays free of the database.
// `seed` (deep-stats): attribution becomes reproducible from it — store the same
// seed on the match so the match-detail screen regenerates a consistent sheet.
export function attributeFixtureScorers(
  poolByClub: Map<string, RosterPlayer[]>,
  homeClubId: string, awayClubId: string,
  homeGoals: number, awayGoals: number, extraTime = false, etOnly = false,
  seed?: number,
  lineupCtx?: {
    playerClubId?: string; benchSize?: number; homeRotation?: number; awayRotation?: number
    // §10.5 phase 4 — who was unavailable for this match, and your stand-ins.
    unavailableIds?: Set<string>; standIns?: RosterPlayer[]
  },
): MatchScorers {
  return attributeMatchScorers(
    poolByClub.get(homeClubId) ?? [], poolByClub.get(awayClubId) ?? [],
    homeGoals, awayGoals, {
      extraTime, etOnly,
      rng: seed !== undefined ? mulberry32(seed) : undefined,
      // §10.5 — only the eleven that lined up can score. Same seed the
      // stat-sheet generator uses, so the two never disagree.
      lineups: seed !== undefined ? { seed, ...lineupCtx } : undefined,
    },
  )
}

export type PlayFixtureCtx = {
  matchday:   number
  seed:       number                        // drawn BEFORE the result, so the lineup it picks decides the rating
  poolByClub: Map<string, RosterPlayer[]>
  ledger:     AvailabilityLedger | null
  lineupCtx:  { playerClubId?: string; benchSize?: number }
  /** The table as it stands, for whether each side can rest people. */
  stakes:     Omit<StakesInput, 'clubId'>
  /** The World Cup's "test final" dev tool fixes your results; everything else plays for real. */
  simulate?:  (home: SimTeam, away: SimTeam) => MatchResult
}

export type PlayedFixture = {
  result:       MatchResult
  seed:         number
  scorers:      MatchScorers
  homeRotation: number
  awayRotation: number
  absent?:      string[]
  standIns?:    RosterPlayer[]
}

/**
 * Play one fixture and apply it: the table and form of `home` and `away` are
 * updated in place (callers pass their working copies), the ledger learns the
 * match's injuries and cards, and the returned record is what gets stored.
 */
export function playFixture(home: SimTeam, away: SimTeam, ctx: PlayFixtureCtx): PlayedFixture {
  const { matchday, seed, poolByClub, ledger } = ctx
  // §10.5 — rotation before the result: a side that's mathematically done
  // rests people. Yours never does; you pick your own eleven.
  const homeRotation = home.isPlayer ? 0 : rotationFor({ ...ctx.stakes, clubId: home.clubId })
  const awayRotation = away.isPlayer ? 0 : rotationFor({ ...ctx.stakes, clubId: away.clubId })
  // §10.5 phase 4 — absences for this matchday, priced into the OVR that
  // decides the scoreline and stored on the match.
  const av = availabilityFor(ledger, matchday, home.clubId, away.clubId)
  const lineups = {
    ...ctx.lineupCtx, homeRotation, awayRotation,
    unavailableIds: av.unavailableIds, standIns: av.standIns,
  }
  const eff = effectiveMatchOvrs(poolByClub.get(home.clubId) ?? [], poolByClub.get(away.clubId) ?? [], {
    seed, ...lineups,
    homeBaseOvr: home.ovr + av.homeOvrDelta, awayBaseOvr: away.ovr + av.awayOvrDelta,
  })
  const result = (ctx.simulate ?? simulateMatch)({ ...home, ovr: eff.homeOvr }, { ...away, ovr: eff.awayOvr })

  home.stats.played++; away.stats.played++
  home.stats.goalsFor += result.homeGoals; home.stats.goalsAgainst += result.awayGoals
  away.stats.goalsFor += result.awayGoals; away.stats.goalsAgainst += result.homeGoals
  if (result.outcome === 'home') { home.stats.won++; home.stats.points += 3; away.stats.lost++ }
  else if (result.outcome === 'away') { away.stats.won++; away.stats.points += 3; home.stats.lost++ }
  else { home.stats.drawn++; home.stats.points++; away.stats.drawn++; away.stats.points++ }
  const form = (t: SimTeam, out: 'win' | 'draw' | 'loss') => {
    t.form = Math.max(-1, Math.min(1, t.form * 0.85 + (out === 'win' ? 0.15 : out === 'draw' ? 0 : -0.15)))
  }
  form(home, result.outcome === 'home' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')
  form(away, result.outcome === 'away' ? 'win' : result.outcome === 'draw' ? 'draw' : 'loss')

  const scorers = attributeFixtureScorers(poolByClub, home.clubId, away.clubId, result.homeGoals, result.awayGoals, false, false, seed, lineups)
  if (ledger) recordMatchOutcome(ledger, poolByClub, {
    matchday, homeClubId: home.clubId, awayClubId: away.clubId,
    seed, homeGoals: result.homeGoals, awayGoals: result.awayGoals, scorers, lineups,
  })
  return { result, seed, scorers, homeRotation, awayRotation, absent: av.absent, standIns: av.standIns }
}
