// Knockout-bracket availability (Big Fixes §10.5 phase 4).
//
// Its own module rather than part of run-stats.ts for one concrete reason: this
// is engine logic the headless verifier has to be able to import, and run-stats
// pulls in the SQLite query layer (and through it react-native), which no `tsx`
// script can load. Everything here is pure — pools in, decisions out.
//
// See `KnockoutSimHook` in ./availability for the contract and the one documented
// compromise (a two-legged tie's legs are decided in a single call, so a leg-1
// red card changes leg 2's SELECTION but can't move its scoreline).

import type { RosterPlayer, MatchScorers } from '@/types/stats'
import type { Formation } from '@/types/game'
import type { CLKnockoutMatch } from './cl-sim'
import type { WCKnockoutMatch } from './world-cup-sim'
import { attributeMatchScorers, etSeed } from './stats'
import { mulberry32, randomSeed } from '@/lib/rng'
import {
  matchAvailability, recordMatchOutcome,
  type AvailabilityLedger, type KnockoutSimHook, type MatchAvailability,
} from './availability'

/** The half of `LineupCtx` (run-stats.ts) the bracket needs — who the player is
 *  and how big a bench the run allows. Kept structural so run-stats' own
 *  `LineupCtx` assigns straight into it without this module importing it. */
export type KnockoutLineupCtx = { playerClubId?: string; benchSize?: number }

// One match's attribution, from pools rather than two explicit squads. Same job
// as run-stats' `attributeFixtureScorers`, re-stated here so this module stays
// importable without the DB layer.
function attributeFromPools(
  poolByClub: Map<string, RosterPlayer[]>,
  homeClubId: string, awayClubId: string,
  homeGoals: number, awayGoals: number,
  seed: number, extraTime: boolean, etOnly: boolean,
  lineups: Record<string, unknown>,
): MatchScorers {
  return attributeMatchScorers(
    poolByClub.get(homeClubId) ?? [], poolByClub.get(awayClubId) ?? [],
    homeGoals, awayGoals,
    { extraTime, etOnly, rng: mulberry32(seed), lineups: { seed, ...lineups } },
  )
}

// ── Knockout availability (§10.5 phase 4) ───────────────────────────────────
// A league phase is simulated matchday by matchday, so its sim loop can just ask
// the ledger between rounds. A bracket is played out in one call, so instead the
// knockout simulators take a hook (engine/availability.ts) that this builds:
// price the tie with its absences, then attribute it and harvest its cards and
// injuries the moment it's decided, before the next tie kicks off. That's the
// whole reason a red card in the round of 16 costs a quarter-final.
//
// Matchdays keep counting through the bracket, because that's the unit the
// ledger measures absences in. A two-legged tie is TWO matchdays, so a red card
// in leg 1 really does mean missing leg 2.

/** UCL league phase. */
export const CL_LEAGUE_MATCHDAYS = 8
/** …plus playoff/R16/QF/SF at two legs each, plus the one-off final. */
export const CL_TOTAL_MATCHDAYS = CL_LEAGUE_MATCHDAYS + 4 * 2 + 1
/** World Cup groups. */
export const WC_GROUP_MATCHDAYS = 3
/** …plus R32, R16, QF, SF, the third-place playoff and the final. */
export const WC_TOTAL_MATCHDAYS = WC_GROUP_MATCHDAYS + 6

export type KnockoutHookCtx = {
  ledger:     AvailabilityLedger
  poolByClub: Map<string, RosterPlayer[]>
  lineupCtx:  KnockoutLineupCtx
  /** YOUR formation, so the regenerated sheet lays your eleven out the same way. */
  playerFormation?: Formation
  /** Matchdays already played before the bracket starts (league phase / groups). */
  firstMatchday: number
}

/**
 * Walks the rounds in order, assigning each one its matchdays.
 *
 * `ovrFor` fires before a tie is decided and `onTie` right after, so both need to
 * agree on which matchday the tie is — and the first `ovrFor` of a round arrives
 * before that round has otherwise been seen. Hence tracking it off the round
 * name rather than counting ties: every tie in a round shares its matchdays,
 * which is also what makes the medical table read sensibly (all eight play-off
 * ties are matchdays 9–10, not 9–10, 11–12, 13–14…).
 */
function roundClock(firstMatchday: number, legsOf: (round: string) => number) {
  let seen: string | null = null
  let start = firstMatchday + 1
  let legs = 0
  return (round: string) => {
    if (seen !== round) {
      if (seen !== null) start += legs
      seen = round; legs = legsOf(round)
    }
    return start
  }
}

export function clKnockoutAvailabilityHook(o: KnockoutHookCtx): KnockoutSimHook<CLKnockoutMatch> {
  // Every UCL knockout round is two-legged bar the final.
  const mdFor = roundClock(o.firstMatchday, round => round === 'final' ? 1 : 2)

  // One physical match: store what was decided on it, attribute it, and read its
  // sheet back into the ledger. Identical shape to the league-phase loops.
  const leg = (
    matchday: number, homeClubId: string, awayClubId: string,
    homeGoals: number, awayGoals: number, seed: number, extraTime: boolean,
    store: (av: MatchAvailability) => void,
  ) => {
    const av = matchAvailability(o.ledger, matchday, homeClubId, awayClubId)
    store(av)
    const lineups = {
      ...o.lineupCtx, unavailableIds: av.unavailableIds, standIns: av.standIns,
      playerFormation: o.playerFormation,
    }
    const scorers = attributeFromPools(
      o.poolByClub, homeClubId, awayClubId, homeGoals, awayGoals, seed, extraTime, false, lineups,
    )
    recordMatchOutcome(o.ledger, o.poolByClub, {
      matchday, homeClubId, awayClubId, seed, homeGoals, awayGoals, scorers, extraTime, lineups,
    })
    return scorers
  }

  return {
    ovrFor(clubId, baseOvr, round) {
      return baseOvr + o.ledger.ovrDeltaFor(clubId, mdFor(round))
    },

    onTie(m, round) {
      const md = mdFor(round)
      if (m.leg1Seed === undefined) m.leg1Seed = randomSeed()
      if (!m.leg1) {
        // A single match (the final). teamA is nominally at home.
        m.leg1Scorers = leg(md, m.teamA.clubId, m.teamB.clubId, m.aGoals, m.bGoals,
          m.leg1Seed, m.extraTime, av => { m.leg1Absent = av.absent; m.leg1StandIns = av.standIns })
        return
      }
      if (m.leg2Seed === undefined) m.leg2Seed = randomSeed()
      // Leg 1: teamA at home, 90' only.
      m.leg1Scorers = leg(md, m.teamA.clubId, m.teamB.clubId, m.leg1.aGoals, m.leg1.bGoals,
        m.leg1Seed, false, av => { m.leg1Absent = av.absent; m.leg1StandIns = av.standIns })
      // Leg 2: teamB at home, the NEXT matchday — which is what makes a leg-1
      // sending-off cost you leg 2.
      const md2 = md + 1
      const et = m.leg2ExtraTime
      const av2 = matchAvailability(o.ledger, md2, m.teamB.clubId, m.teamA.clubId)
      m.leg2Absent = av2.absent
      m.leg2StandIns = av2.standIns
      const lineups2 = {
        ...o.lineupCtx, unavailableIds: av2.unavailableIds, standIns: av2.standIns,
        playerFormation: o.playerFormation,
      }
      // Regulation and extra time are attributed separately (never pass
      // extraTime to the 90' half, or a 90' goal gets stamped 112') …
      m.leg2Scorers = attributeFromPools(
        o.poolByClub, m.teamB.clubId, m.teamA.clubId, m.leg2!.bGoals, m.leg2!.aGoals,
        m.leg2Seed, false, false, lineups2,
      )
      if (et && (et.aGoals > 0 || et.bGoals > 0)) {
        m.leg2ExtraTimeScorers = attributeFromPools(
          o.poolByClub, m.teamB.clubId, m.teamA.clubId, et.bGoals, et.aGoals,
          etSeed(m.leg2Seed), false, true, lineups2,
        )
      }
      // … but the ledger reads the FOLDED leg (regulation + ET as one physical
      // match), because that's the sheet the match screen and computeCLRunStats
      // regenerate — so the injuries it acts on are the ones you can go and see.
      recordMatchOutcome(o.ledger, o.poolByClub, {
        matchday: md2, homeClubId: m.teamB.clubId, awayClubId: m.teamA.clubId,
        seed: m.leg2Seed, homeGoals: m.leg2!.bGoals + (et?.bGoals ?? 0),
        awayGoals: m.leg2!.aGoals + (et?.aGoals ?? 0),
        scorers: mergeLegScorers(m.leg2Scorers, m.leg2ExtraTimeScorers),
        extraTime: !!et, lineups: lineups2,
      })
    },
  }
}

export function wcKnockoutAvailabilityHook(o: KnockoutHookCtx): KnockoutSimHook<WCKnockoutMatch> {
  // Every World Cup knockout tie is a single match, so a round is one matchday.
  const mdFor = roundClock(o.firstMatchday, () => 1)
  return {
    ovrFor(clubId, baseOvr, round) {
      return baseOvr + o.ledger.ovrDeltaFor(clubId, mdFor(round))
    },
    onTie(m, round) {
      const md = mdFor(round)
      if (m.seed === undefined) m.seed = randomSeed()
      const av = matchAvailability(o.ledger, md, m.teamA.clubId, m.teamB.clubId)
      m.absent = av.absent
      m.standIns = av.standIns
      const lineups = {
        ...o.lineupCtx, unavailableIds: av.unavailableIds, standIns: av.standIns,
        playerFormation: o.playerFormation,
      }
      m.scorers = attributeFromPools(
        o.poolByClub, m.teamA.clubId, m.teamB.clubId,
        m.result.homeGoals, m.result.awayGoals, m.seed, m.result.extraTime, false, lineups,
      )
      recordMatchOutcome(o.ledger, o.poolByClub, {
        matchday: md, homeClubId: m.teamA.clubId, awayClubId: m.teamB.clubId,
        seed: m.seed, homeGoals: m.result.homeGoals, awayGoals: m.result.awayGoals,
        scorers: m.scorers, extraTime: m.result.extraTime, lineups,
      })
    },
  }
}

// Regulation + extra time as one physical match, for the ledger's benefit.
// (run-stats has its own copy for the stats totals; this module can't import it.)
function mergeLegScorers(a?: MatchScorers, b?: MatchScorers): MatchScorers | undefined {
  if (!a && !b) return undefined
  return { home: [...(a?.home ?? []), ...(b?.home ?? [])], away: [...(a?.away ?? []), ...(b?.away ?? [])] }
}
