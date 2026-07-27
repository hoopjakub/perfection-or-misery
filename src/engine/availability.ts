// Injuries & suspensions — real availability (Big Fixes §10.5 phase 4, R8).
//
// Everything else in the stats pipeline is regenerated on demand from a match
// seed. Availability cannot be: who is out for matchday 12 depends on what
// happened on matchdays 5 through 11, so it is inherently SEQUENTIAL. This
// ledger is therefore built once, during the sim, in matchday order, and what
// it decides is STORED on each match (`absent` / `standIns`) so every later
// screen regenerates the side that actually played rather than re-rolling.
//
// Where the events come from: the sheet, not a second dice roll. Red cards and
// injuries are both generated inside `generateMatchDetail` from the match seed —
// the injury with its minute, its forced substitution and how long the player is
// out. The ledger reads those events back off the regenerated sheet, so "out for
// the next three matches" and what the timeline shows are one fact instead of
// two systems that can drift.
//
// Rates (maintainer decision 3, realistic): roughly one injury per team every
// six to eight matches — the per-match probability lives in match-detail.ts as
// INJURY_PER_SIDE_PER_MATCH — mostly 1–3 matchdays out, occasionally 4–10, with
// season-enders rare. A red card is one match, which is the real rule.

import type { RosterPlayer, MatchScorers } from '@/types/stats'
import type { MatchEvent } from '@/types/match-stats'
import { planAbsenceCover, standInIdFor } from './lineup'
import { generateMatchDetail } from './match-detail'

export type AbsenceReason = 'injury' | 'suspension'

export type Absence = {
  playerId:   string
  playerName: string
  clubId:     string
  clubName:   string
  position:   string
  reason:     AbsenceReason
  /** Inclusive matchday range the player is unavailable for. */
  fromMatchday: number
  toMatchday:   number
  /** The matchday it happened on, and (injuries) the minute. */
  incurredOn:   number
  minute?:      number
  /** Set when your bench couldn't cover it and a stand-in was generated. */
  standInName?: string
  standInOvr?:  number
  isPlayerClub: boolean
}

/** How much weaker a suspension/injury makes a replacement, when your bench is
 *  empty and a stand-in has to be invented (decision 1). */
export const STAND_IN_OVR_DROP = 5
/** A sending-off costs the next match. */
export const SUSPENSION_MATCHES = 1

export type AvailabilityLedger = {
  /** Ids unavailable for `clubId` on `matchday`. */
  unavailableFor(clubId: string, matchday: number): Set<string>
  /** Both sides at once — what a match stores and regenerates from. */
  absentForMatch(homeClubId: string, awayClubId: string, matchday: number): string[]
  /** Stand-ins your club needs for this matchday (empty for AI clubs). */
  standInsFor(clubId: string, matchday: number): RosterPlayer[]
  /**
   * What the absences cost YOUR team OVR this matchday (decision 1: "your team
   * OVR updates for those matches so the absence genuinely costs you").
   * Negative. Averaged over the eleven, because that is how team OVR is scaled.
   */
  ovrDeltaFor(clubId: string, matchday: number): number
  /** Read one finished match's sheet: reds → suspensions, injuries → absences. */
  recordMatch(m: { matchday: number; homeClubId: string; awayClubId: string; events: MatchEvent[] }): void
  /** The medical table (§10.5 R8), in the order things happened. */
  absences(): Absence[]
}

export type AvailabilityOpts = {
  poolByClub:   Map<string, RosterPlayer[]>
  playerClubId?: string
  /** Last matchday of the competition — nothing is "out" past the end of it. */
  totalMatchdays: number
}

export function createAvailabilityLedger(o: AvailabilityOpts): AvailabilityLedger {
  const list: Absence[] = []
  // playerId → the club and card details, so an event only has to name the id.
  const index = new Map<string, RosterPlayer>()
  for (const pool of o.poolByClub.values()) for (const p of pool) index.set(p.playerId, p)

  const activeFor = (clubId: string, matchday: number) =>
    list.filter(a => a.clubId === clubId && matchday >= a.fromMatchday && matchday <= a.toMatchday)

  const add = (
    p: RosterPlayer, reason: AbsenceReason, matchday: number, span: number, minute?: number,
  ) => {
    const from = matchday + 1
    const to = Math.min(o.totalMatchdays, matchday + span)
    // An injury on the final matchday costs nothing — there's nothing left to
    // miss — so it isn't a medical-table row either.
    if (from > to) return
    list.push({
      playerId: p.playerId, playerName: p.name, clubId: p.clubId, clubName: p.clubName,
      position: p.primaryPosition, reason,
      fromMatchday: from, toMatchday: to, incurredOn: matchday, minute,
      isPlayerClub: !!o.playerClubId && p.clubId === o.playerClubId,
    })
  }

  // Your side's cover for a matchday, computed once and reused by both
  // `standInsFor` and `ovrDeltaFor` so the OVR hit always matches who actually
  // played.
  const coverFor = (clubId: string, matchday: number) => {
    const pool = o.poolByClub.get(clubId) ?? []
    const out = new Set(activeFor(clubId, matchday).map(a => a.playerId))
    return { pool, out, ...planAbsenceCover(pool, out) }
  }

  const standInOf = (absent: RosterPlayer): RosterPlayer => ({
    ...absent,
    playerId: standInIdFor(absent.playerId),
    // Named for what he is. A run-out for the reserve nobody drafted.
    name: `${absent.name.split(' ').slice(-1)[0]} (stand-in)`,
    ovr: Math.max(30, absent.ovr - STAND_IN_OVR_DROP),
    attack: Math.max(25, (absent.attack || absent.ovr) - STAND_IN_OVR_DROP),
    isBench: undefined,
  })

  return {
    unavailableFor(clubId, matchday) {
      return new Set(activeFor(clubId, matchday).map(a => a.playerId))
    },

    absentForMatch(homeClubId, awayClubId, matchday) {
      return [
        ...activeFor(homeClubId, matchday).map(a => a.playerId),
        ...activeFor(awayClubId, matchday).map(a => a.playerId),
      ]
    },

    standInsFor(clubId, matchday) {
      if (!o.playerClubId || clubId !== o.playerClubId) return []
      const { uncovered } = coverFor(clubId, matchday)
      const stand = uncovered.map(standInOf)
      // Record the stand-in on the medical row, so the table can say who filled
      // in and how much worse he was.
      for (let i = 0; i < uncovered.length; i++) {
        const row = list.find(a =>
          a.playerId === uncovered[i].playerId && matchday >= a.fromMatchday && matchday <= a.toMatchday)
        if (row && !row.standInName) { row.standInName = stand[i].name; row.standInOvr = stand[i].ovr }
      }
      return stand
    },

    ovrDeltaFor(clubId, matchday) {
      if (!o.playerClubId || clubId !== o.playerClubId) return 0
      const { pool, out, promotedIds, uncovered } = coverFor(clubId, matchday)
      if (out.size === 0) return 0
      const missing = pool.filter(p => out.has(p.playerId) && !p.isBench)
      if (missing.length === 0) return 0
      const promoted = pool.filter(p => promotedIds.has(p.playerId))
      // Pair each absence with what replaced it, best replacement to biggest
      // absence, so the arithmetic matches a manager's actual choices.
      const gone = [...missing].sort((a, b) => b.ovr - a.ovr)
      const cover = [
        ...promoted.map(p => p.ovr),
        ...uncovered.map(p => Math.max(30, p.ovr - STAND_IN_OVR_DROP)),
      ].sort((a, b) => b - a)
      let drop = 0
      gone.forEach((g, i) => { drop += Math.max(0, g.ovr - (cover[i] ?? g.ovr - STAND_IN_OVR_DROP)) })
      return -drop / 11
    },

    recordMatch({ matchday, events }) {
      for (const e of events) {
        const p = index.get(e.playerId)
        if (!p) continue
        if (e.type === 'red') add(p, 'suspension', matchday, SUSPENSION_MATCHES)
        else if (e.type === 'injury') add(p, 'injury', matchday, e.matchdaysOut ?? 1, e.minute)
      }
    },

    absences: () => list,
  }
}

// ── Knockout brackets ───────────────────────────────────────────────────────
/**
 * How a knockout simulation talks to the ledger (§10.5 phase 4).
 *
 * A league phase is simulated matchday by matchday, so the sim loop can just ask
 * the ledger between rounds. A bracket isn't: `simulateCLKnockoutsOnly` and
 * `simulateWCKnockoutsOnly` play the whole thing out in one call. Rather than
 * invert those (they're pure result-first engine code and the bracket logic is
 * the last thing worth destabilising), they take this hook and call it per tie,
 * in bracket order:
 *
 *  · `ovrFor` before the tie is decided — the OVR that side plays at with its
 *    absences priced in, so availability moves the scoreline, not just the
 *    team sheet.
 *  · `onTie` immediately after — the caller attributes the tie, regenerates its
 *    sheet, and feeds the red cards and injuries back into the ledger BEFORE the
 *    next tie is simulated. That's what makes a suspension picked up in the
 *    round of 16 actually cost a quarter-final.
 *
 * One documented compromise: a two-legged tie's legs are decided in a single
 * `simulateTwoLegs` call, so a red card in leg 1 changes who is SELECTED in leg 2
 * (and shows on the medical table) but can't move leg 2's OVR — the scoreline was
 * already settled by then.
 */
export type KnockoutSimHook<M> = {
  /** `round` comes along because the ledger counts knockout rounds as
   *  matchdays — it's what tells the hook which matchday this tie is. */
  ovrFor(clubId: string, baseOvr: number, round: string): number
  onTie(match: M, round: string): void
}

// ── The two calls a sim loop makes ──────────────────────────────────────────

/** Everything one match needs to know about availability, in one object: what
 *  to store on the fixture, what to pass to the lineup layer, and what the
 *  absences cost your team OVR on the day. */
export type MatchAvailability = {
  absent:         string[]
  standIns:       RosterPlayer[]
  unavailableIds?: Set<string>
  homeOvrDelta:   number   // ≤ 0, and only ever non-zero for your club
  awayOvrDelta:   number
}

/** Nothing is out — what a sim uses before the rosters have finished loading. */
export const NO_AVAILABILITY: MatchAvailability = {
  absent: [], standIns: [], homeOvrDelta: 0, awayOvrDelta: 0,
}

/** `matchAvailability`, tolerant of a ledger that doesn't exist yet. */
export function availabilityFor(
  ledger: AvailabilityLedger | null | undefined,
  matchday: number, homeClubId: string, awayClubId: string,
): MatchAvailability {
  return ledger ? matchAvailability(ledger, matchday, homeClubId, awayClubId) : NO_AVAILABILITY
}

export function matchAvailability(
  ledger: AvailabilityLedger, matchday: number, homeClubId: string, awayClubId: string,
): MatchAvailability {
  const absent = ledger.absentForMatch(homeClubId, awayClubId, matchday)
  const standIns = [
    ...ledger.standInsFor(homeClubId, matchday),
    ...ledger.standInsFor(awayClubId, matchday),
  ]
  return {
    absent, standIns,
    unavailableIds: absent.length ? new Set(absent) : undefined,
    homeOvrDelta: ledger.ovrDeltaFor(homeClubId, matchday),
    awayOvrDelta: ledger.ovrDeltaFor(awayClubId, matchday),
  }
}

/**
 * Read a finished match's sheet into the ledger.
 *
 * The sheet is regenerated here, at sim time, with exactly the options every
 * later screen will use — which is the whole point: the red cards and injuries
 * the ledger acts on are the ones the timeline will show, not a second roll that
 * happens to look similar. Cheap enough to do per fixture (it's pure
 * arithmetic), and it has to happen in matchday order anyway.
 */
export function recordMatchOutcome(
  ledger: AvailabilityLedger,
  poolByClub: Map<string, RosterPlayer[]>,
  m: {
    matchday: number; homeClubId: string; awayClubId: string
    seed: number; homeGoals: number; awayGoals: number
    scorers?: MatchScorers; extraTime?: boolean
    lineups?: {
      playerClubId?: string; benchSize?: number
      homeRotation?: number; awayRotation?: number
      unavailableIds?: Set<string>; standIns?: RosterPlayer[]
      playerFormation?: import('@/types/game').Formation
    }
  },
): void {
  const detail = generateMatchDetail({
    seed: m.seed,
    homePool: poolByClub.get(m.homeClubId) ?? [],
    awayPool: poolByClub.get(m.awayClubId) ?? [],
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    scorers: m.scorers, extraTime: m.extraTime,
    ...m.lineups,
  })
  if (!detail) return
  ledger.recordMatch({
    matchday: m.matchday, homeClubId: m.homeClubId, awayClubId: m.awayClubId, events: detail.events,
  })
}
