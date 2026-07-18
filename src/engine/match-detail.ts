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
//      Σ player goals/assists  == team goals / attributed assists
//      player SOT ≥ goals, shots ≥ SOT; team shots == Σ player shots
//      keeper saves            == opponent SOT − opponent goals
//      home+away possession    == 100
//      blocks(side)            == shotsBlocked(opponent)
//      foulsWon(side)          == fouls(opponent)

import type { RosterPlayer, MatchScorers, GoalEvent } from '@/types/stats'
import type {
  MatchStats, TeamStatLine, PlayerMatchLine, MatchEvent,
} from '@/types/match-stats'
import { attributeMatchScorers, SUB_MIN_MINUTE } from './stats'
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
  homePool:  RosterPlayer[]     // starters (isBench falsy) + bench (isBench true)
  awayPool:  RosterPlayer[]
  homeGoals: number
  awayGoals: number
  scorers?:  MatchScorers       // stored at sim time — adopted verbatim
  extraTime?: boolean           // a 120' match
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

// One participating player, resolved before stats are distributed.
type Participant = {
  p: RosterPlayer
  minutes: number
  subOnMinute?: number
  subOffMinute?: number
  goals: number
  assists: number
  firstInvolvement: number   // ∞ when never on a scoresheet
  lastInvolvement: number    // -∞ when never on a scoresheet
}

// ── Lineup + substitution resolution (one side) ─────────────────────────────
function resolveSide(
  pool: RosterPlayer[],
  goals: GoalEvent[],
  duration: number,
  rng: Rng,
): { onPitch: Participant[]; unused: RosterPlayer[]; subEvents: { on: RosterPlayer; off: RosterPlayer; minute: number }[] } {
  // Deterministic base order regardless of DB row order.
  const sorted = [...pool].sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)
  let starters = sorted.filter(p => !p.isBench)
  const bench    = sorted.filter(p => p.isBench)
  if (starters.length > 11) {
    // Shouldn't happen (pools are built 1 GK + 10 outfield), but stay safe.
    starters = [...starters].sort((a, b) => b.ovr - a.ovr || (a.playerId < b.playerId ? -1 : 1)).slice(0, 11)
  }

  const involvement = new Map<string, { first: number; last: number; goals: number; assists: number }>()
  const touch = (id: string, minute: number, kind: 'goal' | 'assist') => {
    const cur = involvement.get(id) ?? { first: Infinity, last: -Infinity, goals: 0, assists: 0 }
    cur.first = Math.min(cur.first, minute); cur.last = Math.max(cur.last, minute)
    if (kind === 'goal') cur.goals++; else cur.assists++
    involvement.set(id, cur)
  }
  for (const g of goals) {
    touch(g.scorerId, g.minute, 'goal')
    if (g.assistId) touch(g.assistId, g.minute, 'assist')
  }

  const part = (p: RosterPlayer, minutes: number, subOn?: number, subOff?: number): Participant => {
    const inv = involvement.get(p.playerId)
    return {
      p, minutes, subOnMinute: subOn, subOffMinute: subOff,
      goals: inv?.goals ?? 0, assists: inv?.assists ?? 0,
      firstInvolvement: inv?.first ?? Infinity, lastInvolvement: inv?.last ?? -Infinity,
    }
  }

  const onPitch: Participant[] = starters.map(s => part(s, duration))
  const subEvents: { on: RosterPlayer; off: RosterPlayer; minute: number }[] = []
  if (bench.length === 0) return { onPitch, unused: [], subEvents }

  // Bench players on the scoresheet MUST come on (before their first involvement).
  const mustPlay = bench.filter(b => involvement.has(b.playerId))
  const optional = bench.filter(b => !involvement.has(b.playerId))
  const targetSubs = Math.min(bench.length, Math.max(mustPlay.length, 3 + Math.floor(rng() * 3)))

  const chosen: { sub: RosterPlayer; minute: number }[] = []
  for (const b of mustPlay) {
    const firstInv = involvement.get(b.playerId)!.first
    // Second-half sub (45'+ rule) — on before their first goal/assist, never earlier.
    const minute = clamp(Math.min(firstInv, SUB_MIN_MINUTE + Math.floor(rng() * 20)), SUB_MIN_MINUTE, duration - 1)
    chosen.push({ sub: b, minute })
  }
  // Fill remaining slots with the strongest of the rest (light rng shuffle).
  const restRanked = [...optional].sort((a, b) => (b.ovr + rng() * 6) - (a.ovr + rng() * 6))
  for (const b of restRanked.slice(0, Math.max(0, targetSubs - chosen.length))) {
    chosen.push({ sub: b, minute: clamp(SUB_MIN_MINUTE + Math.floor(rng() * 40), SUB_MIN_MINUTE, duration - 5) })
  }
  chosen.sort((a, b) => a.minute - b.minute)

  const usedOff = new Set<string>()
  for (const { sub, minute } of chosen) {
    // Who goes off: an outfield starter, still on the pitch, whose scoresheet
    // involvement is already over by the sub minute (can't score at 80' having
    // gone off at 60'). Weaker players slightly likelier; same-group swap favoured.
    const candidates = onPitch.filter(x =>
      x.p.primaryPosition !== 'GK' &&
      !x.subOnMinute && !usedOff.has(x.p.playerId) && x.subOffMinute === undefined &&
      x.lastInvolvement <= minute,
    )
    if (candidates.length === 0) continue   // vanishingly rare; drop the sub
    const weights = candidates.map(x =>
      (110 - x.p.ovr) * (posGroup(x.p.primaryPosition) === posGroup(sub.primaryPosition) ? 3 : 1),
    )
    const idx = rngWeightedIndex(rng, weights)
    const off = candidates[idx === -1 ? 0 : idx]
    off.subOffMinute = minute
    off.minutes = minute
    usedOff.add(off.p.playerId)
    onPitch.push(part(sub, duration - minute, minute))
    subEvents.push({ on: sub, off: off.p, minute })
  }

  const playedIds = new Set(onPitch.map(x => x.p.playerId))
  return { onPitch, unused: bench.filter(b => !playedIds.has(b.playerId)), subEvents }
}

// ── Team texture (one side) ─────────────────────────────────────────────────
type SideTexture = {
  team: TeamStatLine
  shotXgs: { xg: number; isGoal: boolean; big: boolean }[]
}

function buildSideTexture(
  rng: Rng,
  dom: number,            // this side's dominance, -1..1
  goalsFor: number,
  goalsAgainst: number,
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
      shots: shots[i], shotsOnTarget: sot[i],
      keyPasses: keyPasses[i], bigChancesCreated: bigChancesCreated[i],
      bigChancesMissed: bigChancesMissedArr[i],
      touches, touchesInOppBox: boxTouches[i], offsides: offsidesArr[i],
      passes: passes[i], accuratePasses: accArr[i],
      passAccuracy: passes[i] > 0 ? Math.round(accArr[i] / passes[i] * 100) : 0,
      crosses: crosses[i], longBalls: longBalls[i],
      dribbles: dribbles[i], groundDuelsWon: groundDuels[i], aerialDuelsWon: aerialDuels[i],
      possessionLost: possLost[i],
      tacklesWon: tackles[i], interceptions: intercepts[i],
      clearances: clearArr[i], blocks: blocksArr[i],
      foulsCommitted: foulsArr[i], foulsWon: foulsWonArr[i],
      yellowCard: yellowIdx.has(i), redCard: i === redIdx,
    }
    if (isGK) {
      const saves = team.keeperSaves
      const conceded = oppTeam.shotsOnTarget - saves   // == opponent goals
      line.gk = {
        saves, goalsConceded: conceded,
        savePct: saves + conceded > 0 ? Math.round(saves / (saves + conceded) * 100) : 100,
        punches: rngInt(rng, 0, 2), highClaims: rngInt(rng, 0, 3), sweeperActions: rngInt(rng, 0, 2),
      }
    }
    return line
  })

  // Unused subs — present with zeroed lines so the bench is visible.
  for (const b of unused) {
    lines.push({
      playerId: b.playerId, name: b.name, position: b.primaryPosition, isHome,
      isBench: true, rating: 0, minutes: 0,
      goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, keyPasses: 0,
      bigChancesCreated: 0, bigChancesMissed: 0, touches: 0, touchesInOppBox: 0,
      offsides: 0, passes: 0, accuratePasses: 0, passAccuracy: 0, crosses: 0,
      longBalls: 0, dribbles: 0, groundDuelsWon: 0, aerialDuelsWon: 0,
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

    r -= l.bigChancesMissed * 0.35
    r -= l.foulsCommitted * 0.04
    r -= l.possessionLost * 0.012
    r -= l.offsides * 0.05
    if (l.yellowCard) r -= 0.3
    if (l.redCard) r -= 1.6

    if (l.gk) {
      r += l.gk.saves * 0.2
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

// ── Entry point ─────────────────────────────────────────────────────────────
export function generateMatchDetail(input: MatchDetailInput): MatchStats | null {
  const { seed, homePool, awayPool, homeGoals, awayGoals } = input
  if (homePool.filter(p => !p.isBench).length === 0 || awayPool.filter(p => !p.isBench).length === 0) return null

  const duration = input.extraTime ? 120 : 90
  // Attribution stream = mulberry32(seed) — identical to what sim-time seeded
  // attribution used, so a legacy fallback here re-derives the same scorers.
  const scorers = input.scorers ?? attributeMatchScorers(
    homePool, awayPool, homeGoals, awayGoals,
    { extraTime: input.extraTime, rng: mulberry32(seed) },
  )
  const rng = mulberry32(deriveSeed(seed, TEXTURE_SALT))

  const homeOvr = deriveTeamOvr(homePool)
  const awayOvr = deriveTeamOvr(awayPool)

  // Dominance: mostly quality, mildly the result — so a big-OVR loser routinely
  // "wins everything but the match". Home side gets the usual nudge.
  const qualityLean = Math.tanh((homeOvr + 2.5 - awayOvr) / 11)
  const resultLean  = Math.tanh((homeGoals - awayGoals) / 2.5)
  const homeDom = clamp(0.62 * qualityLean + 0.28 * resultLean + rngNoise(rng) * 0.28, -0.85, 0.85)

  const possession = Math.round(clamp(50 + homeDom * 17 + rngNoise(rng) * 3.5, 30, 70))
  const totalPasses = rngInt(rng, 780, 1060)

  const homeT = buildSideTexture(rng, homeDom, homeGoals, awayGoals, possession, totalPasses, homeOvr)
  const awayT = buildSideTexture(rng, -homeDom, awayGoals, homeGoals, 100 - possession, totalPasses, awayOvr)

  // Cross-side invariants.
  homeT.team.blocks = awayT.team.shotsBlocked
  awayT.team.blocks = homeT.team.shotsBlocked
  homeT.team.keeperSaves = awayT.team.shotsOnTarget - awayGoals
  awayT.team.keeperSaves = homeT.team.shotsOnTarget - homeGoals

  // Shared duel pools: what one side wins, the other lost.
  const groundTotal = rngInt(rng, 78, 108)
  const aerialTotal = rngInt(rng, 26, 44)
  const homeGroundShare = clamp(0.5 + homeDom * 0.07 + rngNoise(rng) * 0.03, 0.32, 0.68)
  homeT.team.groundDuelsWon = Math.round(groundTotal * homeGroundShare)
  awayT.team.groundDuelsWon = groundTotal - homeT.team.groundDuelsWon
  const homeAerialShare = clamp(0.5 + homeDom * 0.05 + rngNoise(rng) * 0.05, 0.3, 0.7)
  homeT.team.aerialDuelsWon = Math.round(aerialTotal * homeAerialShare)
  awayT.team.aerialDuelsWon = aerialTotal - homeT.team.aerialDuelsWon

  // Lineups, subs, per-player lines.
  const homeSide = resolveSide(homePool, scorers.home, duration, rng)
  const awaySide = resolveSide(awayPool, scorers.away, duration, rng)
  const homeD = distributeSide(rng, homeSide.onPitch, homeSide.unused, homeT.team, awayT.team, true, duration)
  const awayD = distributeSide(rng, awaySide.onPitch, awaySide.unused, awayT.team, homeT.team, false, duration)

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
    for (const gv of side) events.push({
      type: 'goal', minute: gv.minute, plus: gv.plus, isHome,
      playerId: gv.scorerId, playerName: gv.scorerName,
      assistId: gv.assistId, assistName: gv.assistName,
    })
  }
  goalEvents(scorers.home, true)
  goalEvents(scorers.away, false)
  const subEvents = (side: { on: RosterPlayer; off: RosterPlayer; minute: number }[], isHome: boolean) => {
    for (const s of side) events.push({
      type: 'sub', minute: s.minute, isHome,
      playerId: s.on.playerId, playerName: s.on.name,
      offPlayerId: s.off.playerId, offPlayerName: s.off.name,
    })
  }
  subEvents(homeSide.subEvents, true)
  subEvents(awaySide.subEvents, false)
  events.push(...homeD.cardEvents, ...awayD.cardEvents)
  events.sort((a, b) => (a.minute + (a.plus ?? 0) / 100) - (b.minute + (b.plus ?? 0) / 100))

  return {
    home: homeT.team, away: awayT.team,
    players: all, events,
    homeRating: teamRating(homeD.lines), awayRating: teamRating(awayD.lines),
    duration,
  }
}
