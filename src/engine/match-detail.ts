// Deep match-stat generator — the Path-C "hybrid" layer from
// docs/"Next Up - Deep Match Stats & Ratings.md".
//
// The result engine stays result-first (simulateMatch decides who wins and the
// scoreline); this generator produces the full FotMob-style texture AROUND that
// already-decided result: possession, xG, shots, passes, duels, discipline,
// per-player stat lines, sub events and 0–10 match ratings.
//
// Contract:
//  · Fully deterministic: same (seed, pools, scoreline, scorers) → byte-identical
//    output. Matches persist only the seed + scorers; the sheet is regenerated
//    on open (src/hooks or the match-detail modal).
//  · The stored scorers are adopted VERBATIM as the goal events — the sheet can
//    never contradict what the live reveal / result screens showed. If no
//    scorers are stored (legacy match), they're attributed here from the seed.
//  · Stats explain the result but don't slavishly follow it: dominance tracks
//    team QUALITY more than the scoreline, so an upset loser frequently out-
//    possesses and out-xGs the winner ("dominated and lost 1-0").
//  · Hard invariants (enforced by construction, checked by
//    scripts/verify-match-detail.ts):
//      Σ player goals/assists  == team ATTACKING goals / attributed assists
//      player SOT ≥ goals, shots ≥ SOT; team shots == Σ player shots
//      keeper saves            == opponent SOT − opponent attacking goals
//      home+away possession    == 100
//      blocks(side)            == shotsBlocked(opponent)
//      foulsWon(side)          == fouls(opponent)
//  · §9 note — "attacking goals" is a side's scoreline MINUS the own goals an
//    opponent gifted it. An OG is not a shot, so it carries no SOT, no xG and
//    no save opportunity; it lands on the conceding player's line as `ownGoals`
//    and on the scoreboard for the other team, and nowhere else.

import type { RosterPlayer, MatchScorers, GoalEvent } from '@/types/stats'
import type {
  MatchStats, TeamStatLine, PlayerMatchLine, MatchEvent, AddedTime, LineupShape,
} from '@/types/match-stats'
import { attributeMatchScorers, SUB_MIN_MINUTE } from './stats'
import { lineupsForMatch, lineupOvr, matchTeamOvr, plannedSubs, type SelectedLineup } from './lineup'
import {
  mulberry32, deriveSeed, rngInt, rngPoisson, rngNoise, rngWeightedIndex,
  distributeInt, type Rng,
} from '@/lib/rng'
import { clamp } from '@/lib/math'

// Team strength is ALWAYS derived from the pools (deriveTeamOvr) — never passed
// in — so the match-detail modal and the headless stats aggregation
// (computeRunStats) generate byte-identical sheets for the same seed.
export type MatchDetailInput = {
  seed:      number
  homePool:  RosterPlayer[]     // full club roster (or your drafted squad)
  awayPool:  RosterPlayer[]
  homeGoals: number
  awayGoals: number
  scorers?:  MatchScorers       // stored at sim time — adopted verbatim
  extraTime?: boolean           // a 120' match
  // §10.5 — AI sides are cut to the formation XI that lined up. Passed to the
  // SAME `lineupsForMatch` the attribution layer uses, seeded from `seed`, so
  // both independently arrive at the identical eleven.
  playerClubId?: string
  benchSize?:    number
  homeRotation?: number
  awayRotation?: number
  // §10.5 phase 4 — who was injured/suspended for THIS match, and (your club
  // only) the stand-ins covering for them. Both travel with the match because
  // regenerating without them would field somebody who wasn't available.
  unavailableIds?: Set<string>
  standIns?:       RosterPlayer[]
  playerFormation?: import('@/types/game').Formation
}

const TEXTURE_SALT = 0x7EA7_0DD5   // texture stream stays independent of attribution

// ── Position taxonomy ───────────────────────────────────────────────────────
type PosGroup = 'GK' | 'DEF' | 'MID' | 'ATT'
const DEF_POS = new Set(['CB', 'LB', 'RB', 'LWB', 'RWB'])
const MID_POS = new Set(['CDM', 'CM', 'CAM', 'LM', 'RM'])
function posGroup(pos: string): PosGroup {
  if (pos === 'GK') return 'GK'
  if (DEF_POS.has(pos)) return 'DEF'
  if (MID_POS.has(pos)) return 'MID'
  return 'ATT'
}

// Relative per-stat weights by position (scaled by minutes when distributing).
const W_SHOT: Record<string, number> = {
  ST: 1.0, CF: 1.0, LW: 0.75, RW: 0.75, CAM: 0.6, LM: 0.45, RM: 0.45,
  CM: 0.35, CDM: 0.2, LWB: 0.15, RWB: 0.15, LB: 0.12, RB: 0.12, CB: 0.12, GK: 0,
}
const W_CREATE: Record<string, number> = {
  CAM: 1.0, LW: 0.85, RW: 0.85, CM: 0.75, LM: 0.75, RM: 0.75, ST: 0.55, CF: 0.55,
  CDM: 0.4, LWB: 0.5, RWB: 0.5, LB: 0.45, RB: 0.45, CB: 0.12, GK: 0.02,
}
const W_PASS: Record<string, number> = {
  CDM: 1.3, CM: 1.25, CB: 1.2, CAM: 1.0, LB: 1.0, RB: 1.0, LWB: 1.0, RWB: 1.0,
  LM: 0.85, RM: 0.85, LW: 0.75, RW: 0.75, ST: 0.55, CF: 0.55, GK: 0.55,
}
const W_DEFEND: Record<string, number> = {
  CB: 1.25, CDM: 1.1, LB: 0.95, RB: 0.95, LWB: 0.9, RWB: 0.9, CM: 0.6,
  LM: 0.35, RM: 0.35, CAM: 0.25, LW: 0.2, RW: 0.2, ST: 0.15, CF: 0.15, GK: 0.05,
}
const W_DRIBBLE: Record<string, number> = {
  LW: 1.0, RW: 1.0, CAM: 0.8, LM: 0.7, RM: 0.7, ST: 0.6, CF: 0.6, CM: 0.45,
  LWB: 0.4, RWB: 0.4, CDM: 0.25, LB: 0.3, RB: 0.3, CB: 0.1, GK: 0,
}
const W_CROSS: Record<string, number> = {
  LB: 1.0, RB: 1.0, LWB: 1.0, RWB: 1.0, LW: 0.9, RW: 0.9, LM: 0.85, RM: 0.85,
  CAM: 0.4, CM: 0.35, ST: 0.15, CF: 0.15, CDM: 0.15, CB: 0.05, GK: 0,
}
const W_AERIAL: Record<string, number> = {
  CB: 1.2, ST: 1.0, CF: 1.0, CDM: 0.7, GK: 0.15, LB: 0.4, RB: 0.4, LWB: 0.4,
  RWB: 0.4, CM: 0.45, CAM: 0.3, LM: 0.3, RM: 0.3, LW: 0.25, RW: 0.25,
}
const W_LONGBALL: Record<string, number> = {
  GK: 1.1, CB: 1.0, CDM: 0.9, CM: 0.6, LB: 0.5, RB: 0.5, LWB: 0.45, RWB: 0.45,
  CAM: 0.3, LM: 0.25, RM: 0.25, LW: 0.15, RW: 0.15, ST: 0.1, CF: 0.1,
}
const W_FOUL: Record<string, number> = {
  CDM: 1.1, CB: 1.0, CM: 0.8, LB: 0.7, RB: 0.7, LWB: 0.7, RWB: 0.7, ST: 0.65,
  CF: 0.65, CAM: 0.55, LM: 0.55, RM: 0.55, LW: 0.5, RW: 0.5, GK: 0.08,
}
const W_BOXTOUCH: Record<string, number> = {
  ST: 1.1, CF: 1.1, LW: 0.85, RW: 0.85, CAM: 0.65, LM: 0.4, RM: 0.4, CM: 0.3,
  CDM: 0.15, LWB: 0.2, RWB: 0.2, LB: 0.15, RB: 0.15, CB: 0.15, GK: 0,
}
const wOf = (t: Record<string, number>, pos: string, fallback = 0.3) => t[pos] ?? fallback

// ── Small helpers ───────────────────────────────────────────────────────────
const round1 = (x: number) => Math.round(x * 10) / 10
const round2 = (x: number) => Math.round(x * 100) / 100

/** Team strength from a pool: mean OVR of its best XI (1 GK + 10 outfield). */
export function deriveTeamOvr(pool: RosterPlayer[]): number {
  const gks = pool.filter(p => p.primaryPosition === 'GK').sort((a, b) => b.ovr - a.ovr)
  const out = pool.filter(p => p.primaryPosition !== 'GK').sort((a, b) => b.ovr - a.ovr)
  const xi = [...gks.slice(0, 1), ...out.slice(0, 10)]
  if (xi.length === 0) return 70
  return xi.reduce((s, p) => s + p.ovr, 0) / xi.length
}

// ── Substitutions: half-time, and the three-window rule (§10.5 phase 3) ─────
// Changes used to be scattered one per drawn minute across the whole second
// half, which is not how football works. A side gets THREE windows in normal
// time; changes made at the interval are free and don't use one up. So every
// side's tactical changes now land on at most three in-play minutes (plus the
// half-time beat), which is why doubles and triples appear the way they do on a
// real timeline. Extra time grants one further window, plus its own interval.
export const HALF_TIME_MINUTE = 45
const ET_HALF_TIME_MINUTE = 105

type SubWindows = {
  half:      number     // the interval — a distinct beat, not one of the three
  inPlay:    number[]   // exactly three, ascending
  extraTime: number[]   // [] on a 90' match
}

function subWindows(rng: Rng, duration: number, chasing: boolean): SubWindows {
  // Chasing the game pulls every window earlier — a side that needs a goal
  // isn't making its first change on 62 minutes.
  const bands: [number, number][] = chasing
    ? [[46, 55], [56, 65], [66, 78]]
    : [[52, 62], [63, 73], [74, 85]]
  const inPlay = bands.map(([lo, hi]) => rngInt(rng, lo, hi))
  const extraTime = duration > 90
    ? [ET_HALF_TIME_MINUTE, rngInt(rng, 96, Math.min(116, duration - 2))].sort((a, b) => a - b)
    : []
  return { half: HALF_TIME_MINUTE, inPlay, extraTime }
}

// ── Injuries (§10.5 phase 4) ────────────────────────────────────────────────
// Generated HERE, from the match seed, for the same reason cards and
// substitutions are: an injury happens at a minute, forces a change at that
// minute, and eats one of the side's substitutions — none of which the
// result-first engine upstream knows anything about. The availability ledger
// (engine/availability.ts) then reads these events back off the regenerated
// sheet, so "who is out for the next match" and "what the sheet shows" are the
// same fact rather than two systems that can drift.
//
// Rate is the maintainer's decision 3 — realistic: about one per team every
// six to eight matches.
export const INJURY_PER_SIDE_PER_MATCH = 0.145
// Mostly a couple of matchdays, occasionally a month, and rarely the season.
function drawInjurySpan(rng: Rng): number {
  const r = rng()
  if (r < 0.62) return rngInt(rng, 1, 3)
  if (r < 0.93) return rngInt(rng, 4, 10)
  return rngInt(rng, 18, 34)
}

type SubEvent = {
  on: RosterPlayer; off: RosterPlayer; minute: number
  halfTime?: boolean   // made at the interval — doesn't spend a window
  forced?:   boolean   // an injury forced it — unplanned, and it still costs a sub
}

export type SideInjury = {
  player:       RosterPlayer
  minute:       number
  matchdaysOut: number
  /** False when the bench was empty/exhausted — the side played on short. */
  replaced:     boolean
}

// One participating player, resolved before stats are distributed.
type Participant = {
  p: RosterPlayer
  minutes: number
  subOnMinute?: number
  subOffMinute?: number
  injuredAt?: number         // §10.5 phase 4 — went off injured at this minute
  matchdaysOut?: number
  goals: number              // §9: real goals only — own goals are counted apart
  penaltyGoals: number
  assists: number
  ownGoals: number
  penaltiesWon: number
  errors: number
  firstInvolvement: number   // ∞ when never on a scoresheet
  lastInvolvement: number    // -∞ when never on a scoresheet
}

// Everything one side's players did, pulled off the stored goal events.
// §9 makes this cross-side: an own goal and an error-leading-to-a-goal are
// recorded on the OPPONENT's goal, so resolving one side needs both lists.
type InvolvementKind = 'goal' | 'assist' | 'penWon' | 'ownGoal' | 'error'
type Involvement = { playerId: string; minute: number; kind: InvolvementKind; penalty?: boolean }

function sideInvolvements(goalsFor: GoalEvent[], goalsAgainst: GoalEvent[]): Involvement[] {
  const out: Involvement[] = []
  for (const g of goalsFor) {
    // An own goal on OUR scoreline was put in by one of THEIRS — there is
    // nothing to credit to anyone on this side for it.
    if (g.ownGoal) continue
    out.push({ playerId: g.scorerId, minute: g.minute, kind: 'goal', penalty: g.penalty })
    if (g.assistId) out.push({ playerId: g.assistId, minute: g.minute, kind: 'assist' })
    if (g.penWonId) out.push({ playerId: g.penWonId, minute: g.minute, kind: 'penWon' })
  }
  for (const g of goalsAgainst) {
    if (g.ownGoal)    out.push({ playerId: g.scorerId,  minute: g.minute, kind: 'ownGoal' })
    if (g.errorById)  out.push({ playerId: g.errorById, minute: g.minute, kind: 'error' })
  }
  return out
}

// ── Lineup + substitution resolution (one side) ─────────────────────────────
function resolveSide(
  pool: RosterPlayer[],
  involvements: Involvement[],
  duration: number,
  rng: Rng,
  // §10.5 — true when this side rested players AND is behind. A team that
  // rotated and then found itself losing doesn't sit on its hands: the good
  // ones come on, and they come on earlier.
  chasing = false,
): {
  onPitch: Participant[]
  unused: RosterPlayer[]
  subEvents: SubEvent[]
  injuries: SideInjury[]
} {
  // Deterministic base order regardless of DB row order.
  const sorted = [...pool].sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)
  let starters = sorted.filter(p => !p.isBench)
  const bench    = sorted.filter(p => p.isBench)
  if (starters.length > 11) {
    // Shouldn't happen (pools are built 1 GK + 10 outfield), but stay safe.
    starters = [...starters].sort((a, b) => b.ovr - a.ovr || (a.playerId < b.playerId ? -1 : 1)).slice(0, 11)
  }

  type Tally = {
    first: number; last: number
    goals: number; penaltyGoals: number; assists: number
    ownGoals: number; penaltiesWon: number; errors: number
  }
  const involvement = new Map<string, Tally>()
  for (const inv of involvements) {
    const cur = involvement.get(inv.playerId) ?? {
      first: Infinity, last: -Infinity,
      goals: 0, penaltyGoals: 0, assists: 0, ownGoals: 0, penaltiesWon: 0, errors: 0,
    }
    // Every involvement — including scoring an own goal or making the error
    // that led to one — pins the player to the pitch at that minute, so the
    // substitution logic below can't sub him on late or off early.
    cur.first = Math.min(cur.first, inv.minute); cur.last = Math.max(cur.last, inv.minute)
    if (inv.kind === 'goal')         { cur.goals++; if (inv.penalty) cur.penaltyGoals++ }
    else if (inv.kind === 'assist')  cur.assists++
    else if (inv.kind === 'ownGoal') cur.ownGoals++
    else if (inv.kind === 'penWon')  cur.penaltiesWon++
    else                             cur.errors++
    involvement.set(inv.playerId, cur)
  }

  const part = (p: RosterPlayer, minutes: number, subOn?: number, subOff?: number): Participant => {
    const inv = involvement.get(p.playerId)
    return {
      p, minutes, subOnMinute: subOn, subOffMinute: subOff,
      goals: inv?.goals ?? 0, penaltyGoals: inv?.penaltyGoals ?? 0, assists: inv?.assists ?? 0,
      ownGoals: inv?.ownGoals ?? 0, penaltiesWon: inv?.penaltiesWon ?? 0, errors: inv?.errors ?? 0,
      firstInvolvement: inv?.first ?? Infinity, lastInvolvement: inv?.last ?? -Infinity,
    }
  }

  // A named substitute whose first involvement is BEFORE the earliest possible
  // substitution cannot have been a substitute — he started. This happens when
  // the eleven selected here disagrees with the one the stored scorers were
  // attributed against (any mismatch in seed, rotation or bench size between
  // sim time and regeneration), and it used to surface as the nastiest bug on
  // the sheet: "came on 46', scored 20'". Promoting him into the XI — in place
  // of a starter who did nothing — makes "nobody is ever involved before they
  // were on the pitch" true by construction, whatever upstream disagreed.
  for (const b of [...bench]) {
    const inv = involvement.get(b.playerId)
    if (!inv || inv.first >= SUB_MIN_MINUTE) continue
    const swapIdx = starters.findIndex(s => !involvement.has(s.playerId) && s.primaryPosition !== 'GK')
    if (swapIdx === -1) continue
    const demoted = starters[swapIdx]
    starters[swapIdx] = b
    bench.splice(bench.indexOf(b), 1, demoted)
  }

  const onPitch: Participant[] = starters.map(s => part(s, duration))
  const subEvents: SubEvent[] = []
  const injuries: SideInjury[] = []
  const usedOff = new Set<string>()
  const firstInvOf = (p: RosterPlayer) => involvement.get(p.playerId)?.first ?? Infinity

  // ── Injury (§10.5 phase 4) ────────────────────────────────────────────────
  // Rolled BEFORE the tactical changes, because it's the one change a manager
  // didn't choose: the player comes off on the minute it happened, and the
  // substitution it costs is one the side no longer gets to spend on tactics.
  // Drawn unconditionally so the RNG stream doesn't depend on whether there's a
  // bench — a side with nobody left simply plays the rest a man short.
  const injuryRoll = rng()
  const injuryMinute = rngInt(rng, 6, Math.max(7, duration - 12))
  const injurySpan = drawInjurySpan(rng)
  if (injuryRoll < INJURY_PER_SIDE_PER_MATCH) {
    // He can't have done anything AFTER limping off, and the keeper is left out:
    // an outfield replacement for a keeper isn't a substitution, it's a crisis,
    // and it isn't worth modelling for the one time in a hundred it'd fire.
    const victims = onPitch.filter(x =>
      x.p.primaryPosition !== 'GK' && x.lastInvolvement <= injuryMinute)
    const victim = victims.length ? victims[Math.floor(rng() * victims.length)] : null
    if (victim) {
      victim.subOffMinute = injuryMinute
      victim.minutes = injuryMinute
      victim.injuredAt = injuryMinute
      victim.matchdaysOut = injurySpan
      usedOff.add(victim.p.playerId)
      // Anyone on the bench who isn't already needed on the scoresheet earlier
      // than this minute can come on. Same position group first, then quality.
      const cands = bench.filter(b => firstInvOf(b) >= injuryMinute)
      const sameGroup = posGroup(victim.p.primaryPosition)
      const repl = [...cands].sort((a, b) =>
        (posGroup(b.primaryPosition) === sameGroup ? 1 : 0) - (posGroup(a.primaryPosition) === sameGroup ? 1 : 0)
        || b.ovr - a.ovr
        || (a.playerId < b.playerId ? -1 : 1))[0]
      if (repl) {
        bench.splice(bench.indexOf(repl), 1)
        onPitch.push(part(repl, duration - injuryMinute, injuryMinute))
        subEvents.push({ on: repl, off: victim.p, minute: injuryMinute, forced: true })
      }
      injuries.push({
        player: victim.p, minute: injuryMinute, matchdaysOut: injurySpan, replaced: !!repl,
      })
    }
  }

  if (bench.length === 0) {
    const played = new Set(onPitch.map(x => x.p.playerId))
    return { onPitch, unused: bench.filter(b => !played.has(b.playerId)), subEvents, injuries }
  }

  // Bench players on the scoresheet MUST come on (before their first involvement).
  const mustPlay = bench.filter(b => involvement.has(b.playerId))
  const optional = bench.filter(b => !involvement.has(b.playerId))
  // §10.5 — sides use their full allowance. The old draw was `3 + rng*3`, an
  // even spread of 3/4/5 averaging four, which is a decade out of date: modern
  // teams make all five almost every week. Extra time grants a SIXTH, which is
  // also the real rule. A forced change for an injury comes out of the same
  // allowance, so an early injury really does cost the manager an option.
  const allowance = (rng() < 0.7 ? 5 : 4) + (duration > 90 ? 1 : 0) - subEvents.length
  const targetSubs = Math.min(bench.length, Math.max(mustPlay.length, allowance))

  // §10.5 — the three-window rule. Every tactical change lands on one of these
  // minutes (or at the interval), so a side's changes come in ones, twos and
  // threes at the same moment instead of trickling in on eleven separate
  // minutes. `latest` (must-play subs only) is the last minute a sub may still
  // come on: their first involvement.
  const win = subWindows(rng, duration, chasing)
  const chosen: { sub: RosterPlayer; minute: number; latest?: number; halfTime?: boolean }[] = []
  for (const b of mustPlay) {
    const firstInv = involvement.get(b.playerId)!.first
    // The LATEST window he can still make — a scorer comes on before he scores,
    // and preferably not four windows early. Nothing fits (he was involved
    // before the first window opened) → he came on at the interval, which is
    // exactly what a 47th-minute goal by a substitute means.
    const usable = [...win.inPlay, ...win.extraTime].filter(m => m <= Math.min(firstInv, duration - 1))
    const minute = usable.length ? usable[usable.length - 1] : win.half
    chosen.push({
      sub: b, minute,
      latest: clamp(firstInv, win.half, duration - 1),
      halfTime: minute === win.half,
    })
  }
  // Fill remaining slots with the strongest of the rest. Chasing the game
  // sharpens both halves of that: less shuffle, so the genuinely best rested
  // players come on, and the windows themselves move earlier (see subWindows).
  const jitter = chasing ? 2 : 6
  const restRanked = [...optional].sort((a, b) => (b.ovr + rng() * jitter) - (a.ovr + rng() * jitter))
  const fill = restRanked.slice(0, Math.max(0, targetSubs - chosen.length))
  // Half-time is a real beat, not a rounding of "about 46 minutes": a side makes
  // an interval change some of the time, and much more often when it's chasing
  // a game it already weakened itself for.
  const useHalfTime = fill.length > 0 && rng() < (chasing ? 0.55 : 0.3)
  fill.forEach((b, i) => {
    // §10.5 — on a 120' match the last change (or two) belongs IN extra time,
    // which is what the extra-time windows are for. The old draw was capped at
    // 86, so extra time never saw a substitution at all despite being a third
    // of the remaining match.
    const etCount = win.extraTime.length ? Math.min(2, fill.length) : 0
    const etIdx = i - (fill.length - etCount)
    if (etIdx >= 0 && win.extraTime.length) {
      chosen.push({ sub: b, minute: win.extraTime[Math.min(etIdx, win.extraTime.length - 1)] })
      return
    }
    if (i === 0 && useHalfTime) {
      chosen.push({ sub: b, minute: win.half, halfTime: true })
      return
    }
    // Later windows carry more changes than the first — managers wait.
    const wi = rngWeightedIndex(rng, [1, 2, 2.6])
    chosen.push({ sub: b, minute: win.inPlay[wi === -1 ? win.inPlay.length - 1 : wi] })
  })
  chosen.sort((a, b) => a.minute - b.minute)

  for (const { sub, minute, latest, halfTime } of chosen) {
    // Who goes off: an outfield starter, still on the pitch, whose scoresheet
    // involvement is already over by the sub minute (can't score at 80' having
    // gone off at 60'). Weaker players slightly likelier; same-group swap favoured.
    const eligible = (x: Participant, by: number) =>
      x.p.primaryPosition !== 'GK' &&
      !x.subOnMinute && !usedOff.has(x.p.playerId) && x.subOffMinute === undefined &&
      x.lastInvolvement <= by

    let onMinute = minute
    let candidates = onPitch.filter(x => eligible(x, onMinute))
    // §9 widened this: with own goals, penalties won and errors now on the
    // sheet, far more starters carry a late `lastInvolvement`, so the early
    // preferred minute regularly had nobody free to withdraw. A must-play sub
    // only needs to be on by the time they DID something, so fall back to that
    // minute rather than dropping a substitution that has to happen.
    // Try the LATER windows first, so a rescheduled change still lands on a real
    // window and the three-window shape survives; only if none of them frees
    // anybody up does it fall back to the exact minute he was involved.
    if (candidates.length === 0 && latest !== undefined && latest > onMinute) {
      for (const m of [...win.inPlay, ...win.extraTime, latest]) {
        if (m <= onMinute || m > latest) continue
        onMinute = m
        candidates = onPitch.filter(x => eligible(x, onMinute))
        if (candidates.length > 0) break
      }
    }
    if (candidates.length === 0) {
      // Optional subs can simply not happen. A must-play sub cannot: they are
      // on the scoresheet, so leaving them off would strand a scorer who never
      // played. Starting them is the least-wrong resolution and, with the
      // fallback above, is effectively unreachable.
      if (latest === undefined) continue
      onPitch.push(part(sub, duration))
      continue
    }
    const weights = candidates.map(x =>
      (110 - x.p.ovr) * (posGroup(x.p.primaryPosition) === posGroup(sub.primaryPosition) ? 3 : 1),
    )
    const idx = rngWeightedIndex(rng, weights)
    const off = candidates[idx === -1 ? 0 : idx]
    off.subOffMinute = onMinute
    off.minutes = onMinute
    usedOff.add(off.p.playerId)
    onPitch.push(part(sub, duration - onMinute, onMinute))
    subEvents.push({ on: sub, off: off.p, minute: onMinute, halfTime: halfTime && onMinute === win.half })
  }

  const playedIds = new Set(onPitch.map(x => x.p.playerId))
  return { onPitch, unused: bench.filter(b => !playedIds.has(b.playerId)), subEvents, injuries }
}

// ── Team texture (one side) ─────────────────────────────────────────────────
type SideTexture = {
  team: TeamStatLine
  shotXgs: { xg: number; isGoal: boolean; big: boolean }[]
}

function buildSideTexture(
  rng: Rng,
  dom: number,            // this side's dominance, -1..1
  goalsFor: number,       // §9: ATTACKING goals — excludes own goals gifted to us
  goalsAgainst: number,   // full scoreline conceded (own goals included)
  possession: number,     // already decided, both sides sum to 100
  totalPasses: number,
  ovr: number,
): SideTexture {
  const domPos = Math.max(0, dom)

  // Shots — SOT is anchored on goals (every goal is on target), the rest scales
  // with dominance. A smash-and-grab winner (low dom) gets very few.
  const shotsOnTarget = goalsFor + rngPoisson(rng, 1.4 + 3.2 * domPos)
  let shotsOffTarget  = rngPoisson(rng, 2.6 + 4.2 * domPos)
  const shotsBlocked  = rngPoisson(rng, 1.6 + 2.6 * domPos)
  const shotsWoodwork = rng() < 0.10 + 0.10 * domPos ? 1 : 0
  shotsOffTarget = Math.max(shotsOffTarget, shotsWoodwork)
  const shots = shotsOnTarget + shotsOffTarget + shotsBlocked

  // Per-shot xG — goals carry higher xG on average, but the total is genuinely
  // emergent: a dominant loser piles up misses and out-xGs a 1-0 winner.
  const shotXgs: SideTexture['shotXgs'] = []
  for (let i = 0; i < goalsFor; i++) {
    const xg = round2(clamp(0.08 + Math.pow(rng(), 1.4) * 0.72, 0.03, 0.85))
    shotXgs.push({ xg, isGoal: true, big: xg >= 0.35 || rng() < 0.25 })
  }
  for (let i = 0; i < shotsOnTarget - goalsFor; i++) {
    const xg = round2(clamp(0.04 + Math.pow(rng(), 1.6) * 0.55, 0.02, 0.7))
    shotXgs.push({ xg, isGoal: false, big: xg >= 0.35 })
  }
  for (let i = 0; i < shotsOffTarget + shotsBlocked; i++) {
    const xg = round2(clamp(0.02 + Math.pow(rng(), 2.0) * 0.38, 0.01, 0.5))
    shotXgs.push({ xg, isGoal: false, big: xg >= 0.35 })
  }
  const xg = round2(shotXgs.reduce((s, x) => s + x.xg, 0))
  const setPieceShare = 0.15 + rng() * 0.25
  const xgSetPiece = round2(xg * setPieceShare)
  const xgOpenPlay = round2(xg - xgSetPiece)
  const bigChances = shotXgs.filter(x => x.big).length
  const bigChancesMissed = shotXgs.filter(x => x.big && !x.isGoal).length

  // Passing volume follows possession; accuracy follows quality + dominance.
  const passes = Math.round(totalPasses * possession / 100)
  const acc = clamp(0.72 + (ovr - 74) * 0.004 + dom * 0.035 + rngNoise(rng) * 0.025, 0.62, 0.93)
  const accuratePasses = Math.round(passes * acc)
  const ownHalfShare = clamp(0.46 - dom * 0.08 + rngNoise(rng) * 0.03, 0.3, 0.62)
  const ownHalfPasses = Math.round(passes * ownHalfShare)
  const oppHalfPasses = passes - ownHalfPasses
  const accurateLongBalls = rngInt(rng, 8, 18) + Math.round(6 * (1 - domPos))
  const accurateCrosses   = rngInt(rng, 2, 8) + Math.round(6 * domPos)
  const throwIns          = rngInt(rng, 12, 26)
  const corners           = rngPoisson(rng, 2.6 + 3.6 * domPos)

  // Defensive work scales with how much the OPPONENT has the ball.
  const oppDom = Math.max(0, -dom)
  const tacklesWon    = rngInt(rng, 7, 13) + Math.round(6 * oppDom)
  const interceptions = rngInt(rng, 5, 11) + Math.round(6 * oppDom)
  const clearances    = rngInt(rng, 6, 16) + Math.round(10 * oppDom) + goalsAgainst
  const groundDuelsWon = 0   // filled from the shared duel pool by the caller
  const aerialDuelsWon = 0
  const dribbles = rngInt(rng, 2, 7) + Math.round(5 * domPos)
  const possessionLost = Math.round(clamp(128 - possession - acc * 25 + rngNoise(rng) * 8, 55, 130))

  const fouls    = rngInt(rng, 7, 15)
  const offsides = rngPoisson(rng, 1.4 + 1.2 * domPos)

  const touchesInOppBox = Math.max(goalsFor + 1,
    Math.round(9 + 16 * domPos + goalsFor * 1.5 + rngNoise(rng) * 4))
  const finalThirdEntries = Math.max(touchesInOppBox,
    Math.round(28 + 26 * domPos + rngNoise(rng) * 7))

  const team: TeamStatLine = {
    possession, xg, xgOpenPlay, xgSetPiece,
    shots, shotsOnTarget, bigChances, bigChancesMissed,
    accuratePasses, passAccuracy: Math.round(acc * 100), corners, fouls,
    shotsOffTarget, shotsBlocked,
    shotsInsideBox: 0, shotsOutsideBox: 0, shotsWoodwork,
    passes, ownHalfPasses, oppHalfPasses, accurateLongBalls, accurateCrosses, throwIns,
    tacklesWon, interceptions, blocks: 0, clearances, keeperSaves: 0,
    groundDuelsWon, aerialDuelsWon, dribbles, possessionLost,
    yellowCards: 0, redCards: 0, offsides,
    touchesInOppBox, finalThirdEntries,
  }
  const inside = Math.round(shots * clamp(0.55 + rng() * 0.18, 0, 1))
  team.shotsInsideBox = inside
  team.shotsOutsideBox = shots - inside
  return { team, shotXgs }
}

// ── Per-player distribution (one side) ──────────────────────────────────────
function distributeSide(
  rng: Rng,
  onPitch: Participant[],
  unused: RosterPlayer[],
  team: TeamStatLine,
  oppTeam: TeamStatLine,
  isHome: boolean,
  duration: number,
  goalsConceded: number,   // full scoreline against (own goals by this side included)
): { lines: PlayerMatchLine[]; cardEvents: MatchEvent[] } {
  const n = onPitch.length
  const minFrac = onPitch.map(x => x.minutes / duration)
  const pos = onPitch.map(x => x.p.primaryPosition)
  const atkOf = (x: Participant) => x.p.attack || x.p.ovr || 60

  const w = (table: Record<string, number>, extra?: (x: Participant, i: number) => number) =>
    onPitch.map((x, i) => wOf(table, pos[i]) * minFrac[i] * (extra ? extra(x, i) : 1))

  const goalsArr   = onPitch.map(x => x.goals)
  const assistsArr = onPitch.map(x => x.assists)

  // Shots: every goal is a shot on target; the rest by position/attack weight.
  const shotW = w(W_SHOT, x => Math.pow(atkOf(x) / 60, 2))
  const sot   = distributeInt(team.shotsOnTarget, shotW, goalsArr)
  const shots = distributeInt(team.shots, shotW, sot)

  // Creation: an assist guarantees a key pass.
  const createW = w(W_CREATE, x => Math.pow(atkOf(x) / 60, 1.2))
  const teamKeyPasses = Math.max(assistsArr.reduce((a, b) => a + b, 0), Math.round(team.shots * 0.55))
  const keyPasses = distributeInt(teamKeyPasses, createW, assistsArr)
  const bigChancesCreated = distributeInt(Math.round(team.bigChances * 0.75), createW, undefined)
  // Big-chance misses land on players who shot without scoring.
  const bcmW = onPitch.map((_, i) => Math.max(0, shots[i] - goalsArr[i]) + 0.05)
  const bigChancesMissedArr = distributeInt(team.bigChancesMissed, bcmW, undefined)

  // Passing.
  const passW = w(W_PASS, x => Math.pow(x.p.ovr / 70, 1.5))
  const passes = distributeInt(team.passes, passW, undefined)
  const accuracyOf = (i: number) => {
    const g = posGroup(pos[i])
    const adj = g === 'DEF' ? 0.04 : g === 'ATT' ? -0.05 : g === 'GK' ? -0.02 : 0
    return clamp(team.passAccuracy / 100 + adj + (rng() - 0.5) * 0.06, 0.5, 0.98)
  }
  const accArr = onPitch.map((_, i) => Math.min(passes[i], Math.round(passes[i] * accuracyOf(i))))
  const crosses   = distributeInt(team.accurateCrosses, w(W_CROSS), undefined)
  const longBalls = distributeInt(team.accurateLongBalls, w(W_LONGBALL), undefined)

  // Duels & ball-carrying.
  const dribbles = distributeInt(team.dribbles, w(W_DRIBBLE, x => Math.pow(atkOf(x) / 60, 1.5)), undefined)
  // Roughly a 55–60% success rate, which is about where real dribbling sits.
  const dribbleTries = dribbles.map(d => d + rngPoisson(rng, d * 0.75 + 0.25))
  const groundDuels = distributeInt(team.groundDuelsWon, onPitch.map((_, i) => (posGroup(pos[i]) === 'GK' ? 0.05 : 1) * minFrac[i]), undefined)
  const aerialDuels = distributeInt(team.aerialDuelsWon, w(W_AERIAL), undefined)
  const possLost = distributeInt(team.possessionLost, onPitch.map((_, i) =>
    (wOf(W_SHOT, pos[i], 0.3) * 0.6 + 0.4) * (passes[i] + 8) * minFrac[i]), undefined)

  // Defending.
  const defW = w(W_DEFEND, x => Math.pow(x.p.ovr / 70, 1.2))
  const tackles = distributeInt(team.tacklesWon, defW, undefined)
  const intercepts = distributeInt(team.interceptions, defW, undefined)
  const clearArr = distributeInt(team.clearances, w(W_DEFEND, (_, i) => posGroup(pos[i]) === 'DEF' ? 1.6 : 1), undefined)
  const blocksArr = distributeInt(team.blocks, defW, undefined)

  // Discipline.
  const foulW = w(W_FOUL)
  const foulsArr = distributeInt(team.fouls, foulW, undefined)
  const foulsWonArr = distributeInt(oppTeam.fouls, w(W_DRIBBLE, () => 1).map((v, i) => v + minFrac[i] * 0.5), undefined)
  const offsidesArr = distributeInt(team.offsides, w(W_BOXTOUCH), undefined)
  const boxTouches = distributeInt(team.touchesInOppBox, w(W_BOXTOUCH, x => Math.pow(atkOf(x) / 60, 1.3)),
    goalsArr.map(g => Math.min(g, 9)))

  // Cards: booked players are the heavy foulers; a red ends their match early.
  const cardEvents: MatchEvent[] = []
  const yellowIdx = new Set<number>()
  const yellowCount = Math.min(n, rngPoisson(rng, 1.5))
  for (let k = 0; k < yellowCount; k++) {
    const wgt = onPitch.map((_, i) => yellowIdx.has(i) ? 0 : (foulsArr[i] + 0.3) * minFrac[i])
    const i = rngWeightedIndex(rng, wgt)
    if (i === -1) break
    yellowIdx.add(i)
    const lo = Math.max(8, Math.ceil((onPitch[i].subOnMinute ?? 0) + 2))
    const hi = Math.min(duration, Math.floor(onPitch[i].subOffMinute ?? duration))
    cardEvents.push({
      type: 'yellow', minute: hi > lo ? rngInt(rng, lo, hi) : lo, isHome,
      playerId: onPitch[i].p.playerId, playerName: onPitch[i].p.name,
    })
  }
  let redIdx = -1
  if (rng() < 0.035) {
    const wgt = onPitch.map((x, i) =>
      x.subOffMinute !== undefined || pos[i] === 'GK' ? 0 : (foulsArr[i] + 0.3) * minFrac[i])
    redIdx = rngWeightedIndex(rng, wgt)
    if (redIdx !== -1) {
      const x = onPitch[redIdx]
      const lo = Math.max(50, Math.ceil((x.subOnMinute ?? 0) + 3), Math.ceil(x.lastInvolvement) + 1)
      const minute = clamp(rngInt(rng, lo, Math.max(lo, duration - 2)), 1, duration)
      x.minutes = Math.min(x.minutes, minute - (x.subOnMinute ?? 0))
      cardEvents.push({ type: 'red', minute, isHome, playerId: x.p.playerId, playerName: x.p.name })
    }
  }
  team.yellowCards = yellowIdx.size
  team.redCards = redIdx === -1 ? 0 : 1

  // Assemble lines.
  const lines: PlayerMatchLine[] = onPitch.map((x, i) => {
    const isGK = pos[i] === 'GK'
    const touches = Math.max(1, Math.round(
      passes[i] * 1.3 + shots[i] + dribbles[i] * 2 + tackles[i] + clearArr[i] +
      groundDuels[i] + aerialDuels[i] + 6 * minFrac[i] + goalsArr[i] * 2,
    ))
    const line: PlayerMatchLine = {
      playerId: x.p.playerId, name: x.p.name, position: pos[i], isHome,
      isBench: !!x.p.isBench,
      rating: 0, minutes: x.minutes,
      subOnMinute: x.subOnMinute, subOffMinute: x.subOffMinute,
      goals: goalsArr[i], assists: assistsArr[i],
      penaltyGoals: x.penaltyGoals, ownGoals: x.ownGoals,
      penaltiesMissed: 0,   // patched in from the generated miss events
      penaltiesWon: x.penaltiesWon, errorsLeadingToGoal: x.errors,
      shots: shots[i], shotsOnTarget: sot[i],
      keyPasses: keyPasses[i], bigChancesCreated: bigChancesCreated[i],
      bigChancesMissed: bigChancesMissedArr[i],
      touches, touchesInOppBox: boxTouches[i], offsides: offsidesArr[i],
      passes: passes[i], accuratePasses: accArr[i],
      passAccuracy: passes[i] > 0 ? Math.round(accArr[i] / passes[i] * 100) : 0,
      crosses: crosses[i], longBalls: longBalls[i],
      dribbles: dribbles[i], dribblesAttempted: dribbleTries[i],
      groundDuelsWon: groundDuels[i], aerialDuelsWon: aerialDuels[i],
      possessionLost: possLost[i],
      tacklesWon: tackles[i], interceptions: intercepts[i],
      clearances: clearArr[i], blocks: blocksArr[i],
      foulsCommitted: foulsArr[i], foulsWon: foulsWonArr[i],
      yellowCard: yellowIdx.has(i), redCard: i === redIdx,
      injured: x.injuredAt !== undefined || undefined,
      matchdaysOut: x.matchdaysOut,
    }
    if (isGK) {
      const saves = team.keeperSaves
      // Save % is measured against shots he actually faced, so it uses the
      // opponent's ATTACKING goals — an own goal put past him by his own
      // defender was never a save he could have made. `goalsConceded` stays the
      // scoreboard number, because that is what he conceded.
      const beaten = oppTeam.shotsOnTarget - saves   // == opponent attacking goals
      line.gk = {
        saves, goalsConceded,
        savePct: saves + beaten > 0 ? Math.round(saves / (saves + beaten) * 100) : 100,
        punches: rngInt(rng, 0, 2), highClaims: rngInt(rng, 0, 3), sweeperActions: rngInt(rng, 0, 2),
        penaltiesSaved: 0,   // patched in from the generated miss events
      }
    }
    return line
  })

  // Unused subs — present with zeroed lines so the bench is visible.
  for (const b of unused) {
    lines.push({
      playerId: b.playerId, name: b.name, position: b.primaryPosition, isHome,
      isBench: true, rating: 0, minutes: 0,
      goals: 0, penaltyGoals: 0, penaltiesMissed: 0, ownGoals: 0, penaltiesWon: 0, errorsLeadingToGoal: 0,
      assists: 0, shots: 0, shotsOnTarget: 0, keyPasses: 0,
      bigChancesCreated: 0, bigChancesMissed: 0, touches: 0, touchesInOppBox: 0,
      offsides: 0, passes: 0, accuratePasses: 0, passAccuracy: 0, crosses: 0,
      longBalls: 0, dribbles: 0, dribblesAttempted: 0, groundDuelsWon: 0, aerialDuelsWon: 0,
      possessionLost: 0, tacklesWon: 0, interceptions: 0, clearances: 0,
      blocks: 0, foulsCommitted: 0, foulsWon: 0, yellowCard: false, redCard: false,
    })
  }
  return { lines, cardEvents }
}

// ── Ratings ─────────────────────────────────────────────────────────────────
const GOAL_RATING_W: Record<PosGroup, number> = { GK: 2.0, DEF: 1.35, MID: 1.1, ATT: 0.95 }

function rateSide(
  rng: Rng,
  lines: PlayerMatchLine[],
  goalsFor: number,
  goalsAgainst: number,
  duration: number,
) {
  const margin = goalsFor - goalsAgainst
  const resultBump = margin > 0
    ? Math.min(0.5, 0.22 + 0.06 * margin)
    : margin < 0 ? Math.max(-0.55, -0.22 + 0.06 * margin) : 0

  // A red card doesn't just wreck the sent-off player — the ten men left behind
  // spend the rest of the match chasing the game a man down, so the whole side
  // takes a small rating hit. This is how a sending-off "affects the game" in a
  // result-first engine (the scoreline is already fixed): it visibly drags the
  // team's average down and shows up on every remaining player's line.
  const teamHadRed = lines.some(l => l.redCard)
  const teammateRedPenalty = teamHadRed ? 0.3 : 0

  for (const l of lines) {
    if (l.minutes <= 0) { l.rating = 0; continue }
    const g = posGroup(l.position)
    const minFrac = l.minutes / duration
    let r = 6.05 + (l.gk ? 0 : 0)   // flat baseline; quality shows through the stats
    if (teamHadRed && !l.redCard) r -= teammateRedPenalty

    r += l.goals * GOAL_RATING_W[g]
    r += l.assists * 0.65
    r += l.keyPasses * 0.1
    r += l.bigChancesCreated * 0.2
    r += (l.shotsOnTarget - l.goals) * 0.05
    r += l.dribbles * 0.06
    r += l.foulsWon * 0.02
    r += (l.groundDuelsWon + l.aerialDuelsWon) * 0.015

    const defWeight = g === 'DEF' ? 0.06 : g === 'MID' ? 0.035 : 0.015
    r += (l.tacklesWon + l.interceptions) * defWeight
    r += l.clearances * (g === 'DEF' ? 0.02 : 0.008)
    r += l.blocks * 0.07

    // §9 — a spot-kick is a goal, but not the same goal as one carved out of
    // open play, so the taker banks a discounted share of the usual bonus.
    r -= l.penaltyGoals * GOAL_RATING_W[g] * 0.35
    r += l.penaltiesWon * 0.25
    // Missing from the spot is a bigger dent than any other missed chance —
    // it's the one shot a forward is expected to score.
    r -= l.penaltiesMissed * 0.9
    // Gifting a goal away is the single worst thing on this sheet — an own goal
    // wipes out most of a good performance, and an error that led to a goal is
    // a shade behind it.
    r -= l.ownGoals * 1.2
    r -= l.errorsLeadingToGoal * 0.8

    r -= l.bigChancesMissed * 0.35
    r -= l.foulsCommitted * 0.04
    r -= l.possessionLost * 0.012
    r -= l.offsides * 0.05
    if (l.yellowCard) r -= 0.3
    if (l.redCard) r -= 1.6

    if (l.gk) {
      r += l.gk.saves * 0.2
      // Keeping out a penalty is worth far more than a routine save.
      r += l.gk.penaltiesSaved * 0.85
      r -= l.gk.goalsConceded * 0.25
      if (goalsAgainst === 0) r += 0.55
      r += l.gk.sweeperActions * 0.04
    } else if (goalsAgainst === 0 && l.minutes >= 60) {
      r += g === 'DEF' ? 0.4 : g === 'MID' ? 0.15 : 0
    } else if (g === 'DEF' || l.position === 'CDM') {
      r -= goalsAgainst * minFrac * (g === 'DEF' ? 0.18 : 0.1)
    }

    r += resultBump * minFrac
    r += (rng() - 0.5) * 0.3
    l.rating = round1(clamp(r, 3, 10))
  }
}

// ── Missed penalties (§10 pre-step) ─────────────────────────────────────────
// §9 only ever turns a GOAL into a penalty, so until now every spot-kick in the
// game was scored. Misses are pure texture — they never touch the scoreline, so
// like cards and substitutions they're generated here from the seed rather than
// stored on the match.
//
// Rate: the maintainer set ~33% of all penalties missed. (Real top-flight
// conversion is nearer 75–80%, i.e. ~20–25% missed — MISS_SHARE is the single
// knob if that's ever worth tightening.) Converted penalties per match come out
// of §9 at ~0.25, so to make misses a third of all spot-kicks we need ~0.123 of
// them per match: 0.25 × (0.33 / 0.67).
const MISS_SHARE = 0.33
const MISSED_PENS_PER_MATCH = 0.123
// A missed penalty is either kept out or put wide — saves are the more common
// and by far the more interesting half.
const PEN_SAVE_SHARE = 0.58

function buildMissedPenalties(
  rng: Rng,
  homeOnPitch: Participant[], awayOnPitch: Participant[],
  duration: number,
): MatchEvent[] {
  const out: MatchEvent[] = []
  const count = rngPoisson(rng, MISSED_PENS_PER_MATCH)
  for (let k = 0; k < count; k++) {
    const isHome = rng() < 0.5
    const takers = (isHome ? homeOnPitch : awayOnPitch).filter(x => x.p.primaryPosition !== 'GK')
    const keepers = (isHome ? awayOnPitch : homeOnPitch).filter(x => x.p.primaryPosition === 'GK')
    if (takers.length === 0) continue
    // Same "designated taker" bias §9 uses for converted penalties, so the man
    // who misses is the man who'd have been on the spot anyway.
    const weights = takers.map(x => Math.pow(wOf(W_SHOT, x.p.primaryPosition) * (x.p.attack || x.p.ovr || 60) / 60, 2))
    const ti = rngWeightedIndex(rng, weights)
    const taker = takers[ti === -1 ? 0 : ti]
    // Only while he's actually on the pitch.
    const lo = Math.max(2, Math.ceil(taker.subOnMinute ?? 0) + 1)
    const hi = Math.min(duration, Math.floor(taker.subOffMinute ?? duration))
    if (hi <= lo) continue
    const saved = rng() < PEN_SAVE_SHARE
    const keeper = keepers[0]
    out.push({
      type: 'penMissed', minute: rngInt(rng, lo, hi), isHome,
      playerId: taker.p.playerId, playerName: taker.p.name,
      saved,
      keeperId: saved ? keeper?.p.playerId : undefined,
      keeperName: saved ? keeper?.p.name : undefined,
    })
  }
  return out
}

// ── Added time (§10 R4) ─────────────────────────────────────────────────────
// Shown per half rather than as one lump. Each half's figure must cover the
// biggest stoppage-time event in it — a 90+4 goal can't sit outside the four
// minutes the board showed.
function buildAddedTime(rng: Rng, duration: number, events: MatchEvent[]): AddedTime {
  const maxPlusAt = (minute: number) => events.reduce(
    (mx, e) => (e.minute === minute && e.plus ? Math.max(mx, e.plus) : mx), 0)
  const at: AddedTime = {
    // First halves are short and predictable; second halves absorb the
    // substitutions, cards and time-wasting, so they run longer and wider.
    firstHalf:  Math.max(rngInt(rng, 1, 3), maxPlusAt(45)),
    secondHalf: Math.max(rngInt(rng, 3, 7), maxPlusAt(90)),
  }
  if (duration > 90) {
    at.firstET  = Math.max(rngInt(rng, 0, 2), maxPlusAt(105))
    at.secondET = Math.max(rngInt(rng, 1, 3), maxPlusAt(120))
  }
  return at
}

// ── Momentum (§8) ───────────────────────────────────────────────────────────
// Derived LAST — after the goals and the whole stat texture exist — so the
// spec's `goals → stats → momentum` order holds and the curve can never
// contradict the sheet it sits on. Signed per minute: + = home on top,
// − = away, |v| 0…100 = intensity.
const MOM_GOAL_AMP   = 1.7    // a goal is the loudest thing on the curve
const MOM_GOAL_SIGMA = 2.6    // minutes of build-up/aftermath around it
const MOM_RED_SHIFT  = 0.6    // going down to ten tilts the rest of the match
// ~15% of goals arrive AGAINST the run of play — the smash-and-grab where the
// other side was on top. This is what keeps "a goal means momentum toward the
// scorer" at a believable ~85% instead of a suspiciously perfect 100%.
const MOM_AGAINST_RUN_OF_PLAY = 0.15

function buildMomentum(rng: Rng, duration: number, homeDom: number, events: MatchEvent[]): number[] {
  // 1) Texture — smoothed noise, so the curve crosses the centreline the way a
  //    real match does instead of parking on one side.
  const raw: number[] = []
  for (let i = 0; i < duration + 2; i++) raw.push(rngNoise(rng))
  const wave = Array.from({ length: duration }, (_, m) =>
    (raw[m] * 0.25 + raw[m + 1] * 0.5 + raw[m + 2] * 0.25) * 1.35)

  // 2) Base lean — the better side simply spends more of the match on top.
  const base = homeDom * 0.42

  // 3) Event pulses. `isHome` on an event is the side it COUNTS FOR, so an own
  //    goal already swings momentum to the team that benefited (§9).
  const pulses = new Array<number>(duration).fill(0)
  for (const e of events) {
    if (e.type !== 'goal' && e.type !== 'red' && e.type !== 'penMissed') continue
    const at = Math.min(duration, e.minute + (e.plus ?? 0) / 10)
    const side = e.isHome ? 1 : -1
    if (e.type === 'penMissed') {
      // Winning a penalty means you were on top; missing it doesn't undo the
      // pressure that earned it, so this is a real but much smaller surge than
      // a goal — it just doesn't get the scoreline to show for it.
      for (let m = 0; m < duration; m++) {
        const d = (m + 1) - at + 1
        pulses[m] += side * 0.7 * Math.exp(-(d * d) / (2 * MOM_GOAL_SIGMA * MOM_GOAL_SIGMA))
      }
      continue
    }
    if (e.type === 'goal') {
      const amp = rng() < MOM_AGAINST_RUN_OF_PLAY ? -MOM_GOAL_AMP * 0.6 : MOM_GOAL_AMP
      for (let m = 0; m < duration; m++) {
        // Peaks one minute BEFORE the goal — the pressure that produced it —
        // and is still near its peak on the minute itself.
        const d = (m + 1) - at + 1
        pulses[m] += side * amp * Math.exp(-(d * d) / (2 * MOM_GOAL_SIGMA * MOM_GOAL_SIGMA))
      }
    } else {
      for (let m = 0; m < duration; m++) {
        const after = (m + 1) - at
        if (after < 0) continue
        // Ramped in over a couple of minutes rather than snapping, then held.
        pulses[m] += -side * MOM_RED_SHIFT * Math.min(1, after / 3 + 0.35)
      }
    }
  }

  // tanh keeps the range honest (nothing can run past ±100) while saturating
  // gently. The 0.78 squeeze is deliberate: without it the curve pegs at the
  // extreme around every goal, and ±100 is supposed to mean a side is REALLY
  // on top — a handful of minutes a match, not a quarter of them.
  return Array.from({ length: duration }, (_, m) =>
    Math.round(Math.tanh((base + wave[m] + pulses[m]) * 0.78) * 100))
}

// ── Entry point ─────────────────────────────────────────────────────────────
export function generateMatchDetail(input: MatchDetailInput): MatchStats | null {
  const { seed, homeGoals, awayGoals } = input
  if (input.homePool.length === 0 || input.awayPool.length === 0) return null

  // §10.5 — pick the elevens FIRST, from the same seed the attribution layer
  // uses, so everything below (who's on the pitch, who can be subbed, who gets
  // rated) is about the players who actually played.
  const lineupOpts = {
    seed, playerClubId: input.playerClubId, playerFormation: input.playerFormation,
    benchSize: input.benchSize,
    homeRotation: input.homeRotation, awayRotation: input.awayRotation,
    unavailableIds: input.unavailableIds, standIns: input.standIns,
  }
  const { homePool, awayPool, homeLineup, awayLineup } =
    lineupsForMatch(input.homePool, input.awayPool, lineupOpts)
  if (homePool.filter(p => !p.isBench).length === 0 || awayPool.filter(p => !p.isBench).length === 0) return null

  const duration = input.extraTime ? 120 : 90
  // Attribution stream = mulberry32(seed) — identical to what sim-time seeded
  // attribution used, so a legacy fallback here re-derives the same scorers.
  // Pools are already the selected elevens, so no re-selection here.
  const scorers = input.scorers ?? attributeMatchScorers(
    homePool, awayPool, homeGoals, awayGoals,
    { extraTime: input.extraTime, rng: mulberry32(seed) },
  )
  const rng = mulberry32(deriveSeed(seed, TEXTURE_SALT))

  // §9 — an own goal counts on the beneficiary's scoreline but came off an
  // opponent's boot, so it is NOT one of that side's attacking goals. Every
  // shot/xG/save number below is anchored on these, never on the raw scoreline.
  const homeAttackingGoals = homeGoals - scorers.home.filter(g => g.ownGoal).length
  const awayAttackingGoals = awayGoals - scorers.away.filter(g => g.ownGoal).length

  const homeOvr = deriveTeamOvr(homePool)
  const awayOvr = deriveTeamOvr(awayPool)

  // Dominance: mostly quality, mildly the result — so a big-OVR loser routinely
  // "wins everything but the match". Home side gets the usual nudge.
  const qualityLean = Math.tanh((homeOvr + 2.5 - awayOvr) / 11)
  const resultLean  = Math.tanh((homeGoals - awayGoals) / 2.5)
  const homeDom = clamp(0.62 * qualityLean + 0.28 * resultLean + rngNoise(rng) * 0.28, -0.85, 0.85)

  const possession = Math.round(clamp(50 + homeDom * 17 + rngNoise(rng) * 3.5, 30, 70))
  const totalPasses = rngInt(rng, 780, 1060)

  const homeT = buildSideTexture(rng, homeDom, homeAttackingGoals, awayGoals, possession, totalPasses, homeOvr)
  const awayT = buildSideTexture(rng, -homeDom, awayAttackingGoals, homeGoals, 100 - possession, totalPasses, awayOvr)

  // Cross-side invariants.
  homeT.team.blocks = awayT.team.shotsBlocked
  awayT.team.blocks = homeT.team.shotsBlocked
  homeT.team.keeperSaves = awayT.team.shotsOnTarget - awayAttackingGoals
  awayT.team.keeperSaves = homeT.team.shotsOnTarget - homeAttackingGoals

  // Shared duel pools: what one side wins, the other lost.
  const groundTotal = rngInt(rng, 78, 108)
  const aerialTotal = rngInt(rng, 26, 44)
  const homeGroundShare = clamp(0.5 + homeDom * 0.07 + rngNoise(rng) * 0.03, 0.32, 0.68)
  homeT.team.groundDuelsWon = Math.round(groundTotal * homeGroundShare)
  awayT.team.groundDuelsWon = groundTotal - homeT.team.groundDuelsWon
  const homeAerialShare = clamp(0.5 + homeDom * 0.05 + rngNoise(rng) * 0.05, 0.3, 0.7)
  homeT.team.aerialDuelsWon = Math.round(aerialTotal * homeAerialShare)
  awayT.team.aerialDuelsWon = aerialTotal - homeT.team.aerialDuelsWon

  // Lineups, subs, per-player lines. Each side is resolved from BOTH goal lists
  // because §9 events cross over: our own-goal scorer and our error-maker are
  // recorded on the opponent's goals, and both must still be on the pitch.
  // A rotated side that ended up losing chases the game (see `resolveSide`).
  const homeChasing = !!homeLineup?.rotated && homeGoals < awayGoals
  const awayChasing = !!awayLineup?.rotated && awayGoals < homeGoals
  const homeSide = resolveSide(homePool, sideInvolvements(scorers.home, scorers.away), duration, rng, homeChasing)
  const awaySide = resolveSide(awayPool, sideInvolvements(scorers.away, scorers.home), duration, rng, awayChasing)
  const homeD = distributeSide(rng, homeSide.onPitch, homeSide.unused, homeT.team, awayT.team, true, duration, awayGoals)
  const awayD = distributeSide(rng, awaySide.onPitch, awaySide.unused, awayT.team, homeT.team, false, duration, homeGoals)

  // Missed penalties: pure texture (they never touch the scoreline), so they're
  // generated here and folded onto the lines BEFORE rating, which is the whole
  // point — the taker has to carry the miss in his mark for the match.
  const missedPens = buildMissedPenalties(rng, homeSide.onPitch, awaySide.onPitch, duration)
  for (const ev of missedPens) {
    const takerLines  = ev.isHome ? homeD.lines : awayD.lines
    const keeperLines = ev.isHome ? awayD.lines : homeD.lines
    const taker = takerLines.find(l => l.playerId === ev.playerId)
    if (taker) taker.penaltiesMissed++
    if (ev.saved && ev.keeperId) {
      const gk = keeperLines.find(l => l.playerId === ev.keeperId)
      if (gk?.gk) gk.gk.penaltiesSaved++
    }
  }

  rateSide(rng, homeD.lines, homeGoals, awayGoals, duration)
  rateSide(rng, awayD.lines, awayGoals, homeGoals, duration)

  // MOTM: the single highest rating on the pitch (min. 20 minutes played).
  const all = [...homeD.lines, ...awayD.lines]
  let best: PlayerMatchLine | null = null
  for (const l of all) if (l.minutes >= 20 && (!best || l.rating > best.rating)) best = l
  if (best) best.motm = true

  const teamRating = (lines: PlayerMatchLine[]) => {
    const played = lines.filter(l => l.minutes > 0)
    const wSum = played.reduce((s, l) => s + l.minutes, 0)
    return wSum > 0 ? round1(played.reduce((s, l) => s + l.rating * l.minutes, 0) / wSum) : 0
  }

  // Events: goals (verbatim from the attributed scorers) + cards + subs.
  const events: MatchEvent[] = []
  const goalEvents = (side: GoalEvent[], isHome: boolean) => {
    // `isHome` is the side the goal COUNTS FOR — for an own goal that's the
    // beneficiary, while playerName names the opponent who put it in.
    for (const gv of side) events.push({
      type: 'goal', minute: gv.minute, plus: gv.plus, isHome,
      playerId: gv.scorerId, playerName: gv.scorerName,
      assistId: gv.assistId, assistName: gv.assistName,
      ownGoal: gv.ownGoal, penalty: gv.penalty,
      penWonId: gv.penWonId, penWonName: gv.penWonName,
      errorById: gv.errorById, errorByName: gv.errorByName,
    })
  }
  goalEvents(scorers.home, true)
  goalEvents(scorers.away, false)
  const subEvents = (side: SubEvent[], isHome: boolean) => {
    for (const s of side) events.push({
      type: 'sub', minute: s.minute, isHome,
      playerId: s.on.playerId, playerName: s.on.name,
      offPlayerId: s.off.playerId, offPlayerName: s.off.name,
      halfTime: s.halfTime, forced: s.forced,
    })
  }
  // §10.5 phase 4 — the injury is its own beat, distinct from the change it
  // forces: one row says who got hurt and for how long, the (forced) sub row
  // next to it says who came on. A side with an empty bench gets only the first.
  const injuryEvents = (side: SideInjury[], isHome: boolean) => {
    for (const inj of side) events.push({
      type: 'injury', minute: inj.minute, isHome,
      playerId: inj.player.playerId, playerName: inj.player.name,
      matchdaysOut: inj.matchdaysOut, replaced: inj.replaced,
    })
  }
  // Pushed BEFORE the substitutions so that, on the shared minute, the injury
  // row reads first and the change that answers it reads second (the event sort
  // below is stable).
  injuryEvents(homeSide.injuries, true)
  injuryEvents(awaySide.injuries, false)
  subEvents(homeSide.subEvents, true)
  subEvents(awaySide.subEvents, false)
  events.push(...homeD.cardEvents, ...awayD.cardEvents, ...missedPens)
  events.sort((a, b) => (a.minute + (a.plus ?? 0) / 100) - (b.minute + (b.plus ?? 0) / 100))

  return {
    home: homeT.team, away: awayT.team,
    players: all, events,
    homeRating: teamRating(homeD.lines), awayRating: teamRating(awayD.lines),
    duration,
    // Both read the finished event list, so they're generated last.
    addedTime: buildAddedTime(rng, duration, events),
    momentum: buildMomentum(rng, duration, homeDom, events),
    homeShape: toShape(homeLineup),
    awayShape: toShape(awayLineup),
    // What each side was actually worth on the day, once resting players and
    // the substitutes coming back on are priced in. This is the number the
    // result engine used to decide the scoreline.
    homeMatchOvr: sideMatchOvr(homePool, homeLineup, input.benchSize, seed),
    awayMatchOvr: sideMatchOvr(awayPool, awayLineup, input.benchSize, seed),
  }
}

function sideMatchOvr(
  pool: RosterPlayer[], lineup: SelectedLineup | null, benchSize: number | undefined, seed: number,
): number {
  const base = deriveTeamOvr(pool)
  const subs = plannedSubs(seed, benchSize ?? 9)
  if (!lineup) return round1(matchTeamOvr(base, base, { rotated: false, subs }))
  return round1(matchTeamOvr(base, lineupOvr(lineup), { rotated: lineup.rotated > 0, subs }))
}

// Only the shape travels on the sheet — every number about a player is looked
// up in `players` by id, so the pitch view and the ratings list can't drift.
function toShape(l: SelectedLineup | null): LineupShape | undefined {
  if (!l) return undefined
  return {
    formation: l.formation,
    slots: l.slots.map(s => ({ label: s.label, playerId: s.player.playerId })),
    rotated: l.rotated,
  }
}
