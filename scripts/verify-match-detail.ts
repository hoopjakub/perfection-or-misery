// Headless validator for the deep match-stat generator (src/engine/match-detail.ts).
// Run: npx tsx scripts/verify-match-detail.ts
//
// Checks, across thousands of simulated matches:
//  1. Determinism — same seed → byte-identical MatchStats.
//  2. Hard invariants — goals/shots/saves/possession/duels/fouls all reconcile.
//  3. Rating sanity — strikers out-rate defensive mids on average, MOTM
//     correlates with goal involvement, nobody on a thrashed side rates 8+,
//     ratings live in a sane band around ~6.5.
//  4. Upset texture — when a much better team loses, it frequently still wins
//     possession/xG ("dominated but lost").
//  5. §9 events — own goals are rare and follow the 90/10 defender split, land
//     on the benefiting team's scoreline while being charged to the scorer,
//     never count as one of his goals and never as a shot; every penalty names
//     a "won by" player who is a teammate of the taker but not the taker; every
//     error-led-to-goal is charged to a conceding-side player who was on the
//     pitch at the time.

import { simulateMatch } from '../src/engine/match.ts'
import { attributeMatchScorers } from '../src/engine/stats.ts'
import { generateMatchDetail } from '../src/engine/match-detail.ts'
import { matchTeamOvr, ROTATION_MAX_DROP, ROTATION_MIN_PENALTY } from '../src/engine/lineup.ts'
import { rotationFor } from '../src/engine/rotation.ts'
import { INJURY_PER_SIDE_PER_MATCH, HALF_TIME_MINUTE } from '../src/engine/match-detail.ts'
import {
  createAvailabilityLedger, STAND_IN_OVR_DROP, SUSPENSION_MATCHES,
} from '../src/engine/availability.ts'
import { coverAbsences, standInIdFor } from '../src/engine/lineup.ts'
import { simulateCLKnockoutsOnly, buildCLTeams } from '../src/engine/cl-sim.ts'
import {
  clKnockoutAvailabilityHook, CL_LEAGUE_MATCHDAYS,
} from '../src/engine/knockout-availability.ts'
import { selectLineup } from '../src/engine/lineup.ts'
import { mulberry32, randomSeed } from '../src/lib/rng.ts'
import type { RosterPlayer, MatchScorers } from '../src/types/stats.ts'
import type { SimTeam } from '../src/types/simulation.ts'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`) }
}

// ── Synthetic squads (engine is pure — no DB needed) ────────────────────────
const XI_POS = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']
const BENCH_POS = ['GK', 'CB', 'CM', 'RW', 'ST']

function makePool(clubId: string, baseOvr: number, withBench: boolean, rng: () => number): RosterPlayer[] {
  const mk = (pos: string, i: number, isBench: boolean): RosterPlayer => {
    const ovr = Math.round(baseOvr + (rng() - 0.5) * 10 - (isBench ? 4 : 0))
    const atkBias = pos === 'ST' || pos === 'LW' || pos === 'RW' ? 8 : pos === 'CAM' ? 5 : pos === 'CB' || pos === 'GK' ? -12 : -3
    return {
      playerId: `${clubId}-p${i}${isBench ? 'b' : ''}`,
      name: `${clubId} ${pos}${i}`,
      primaryPosition: pos,
      attack: Math.max(30, ovr + atkBias + Math.round((rng() - 0.5) * 6)),
      ovr, isBench: isBench || undefined,
      birthYear: 1995, yearStart: 2024, seasonLabel: '24/25',
      clubId, clubName: `Club ${clubId}`,
    }
  }
  const pool = XI_POS.map((pos, i) => mk(pos, i, false))
  if (withBench) pool.push(...BENCH_POS.map((pos, i) => mk(pos, 100 + i, true)))
  return pool
}

function simTeam(clubId: string, ovr: number): SimTeam {
  return {
    clubId, clubName: `Club ${clubId}`, ovr, isPlayer: false, form: 0,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }
}

// ── Main loop ───────────────────────────────────────────────────────────────
const N = 4000
const poolRng = mulberry32(42)

type Sample = {
  homeOvr: number; awayOvr: number; hg: number; ag: number; isUpset: boolean
  homeXg: number; awayXg: number; homePoss: number
  ratings: { pos: string; rating: number; goals: number; assists: number; motm: boolean; minutes: number; side: 'w' | 'l' | 'd' }[]
}
const samples: Sample[] = []
let redMatchCount = 0

// §9 aggregate tallies
const DEFENDER_POS = new Set(['CB', 'LB', 'RB', 'LWB', 'RWB'])
let totalGoals = 0, ownGoalCount = 0, ownGoalByDefender = 0
let penaltyCount = 0, penaltyWithWinner = 0, errorCount = 0

// §8 momentum tallies
let goalsWithMomentum = 0, goalsMomentumChecked = 0
let momentumAbsSum = 0, momentumSamples = 0, momentumExtremes = 0, momentumCrossings = 0

// §10 pre-step tallies (missed penalties + added time)
let missedPens = 0, savedPens = 0
const formationCounts = new Map<string, number>()
const startingPosCount = new Map<string, number>()
let addedFirstSum = 0, addedSecondSum = 0, addedMatches = 0

console.log(`Simulating ${N} matches with full stat generation…`)
const t0 = Date.now()

for (let i = 0; i < N; i++) {
  const homeOvr = 68 + Math.floor(poolRng() * 24)
  const awayOvr = 68 + Math.floor(poolRng() * 24)
  const withBench = poolRng() < 0.8
  const homePool = makePool(`H${i}`, homeOvr, withBench, poolRng)
  const awayPool = makePool(`A${i}`, awayOvr, withBench, poolRng)

  const result = simulateMatch(simTeam(`H${i}`, homeOvr), simTeam(`A${i}`, awayOvr))
  const seed = randomSeed()
  // §10.5 — attribution and the sheet must be handed the SAME lineup options,
  // exactly as the app does it, or a stored scorer could come back as someone
  // the selection left out. This pins that contract.
  const lineupOpts = { seed, benchSize: withBench ? 9 : 0 }
  const scorers: MatchScorers = attributeMatchScorers(
    homePool, awayPool, result.homeGoals, result.awayGoals,
    { rng: mulberry32(seed), lineups: lineupOpts },
  )

  const input = {
    seed, homePool, awayPool,
    homeGoals: result.homeGoals, awayGoals: result.awayGoals,
    scorers, benchSize: withBench ? 9 : 0,
  }
  const d = generateMatchDetail(input)
  if (!d) { check(false, `match ${i}: generator returned null`); continue }

  // 1) Determinism
  if (i % 25 === 0) {
    const d2 = generateMatchDetail(input)
    check(JSON.stringify(d) === JSON.stringify(d2), `match ${i}: NOT deterministic for same seed`)
    // Legacy path (no stored scorers): attribution re-derives from the seed —
    // must also be fully reproducible, and re-derive the SAME scorers.
    const legacy = { ...input, scorers: undefined }
    const l1 = generateMatchDetail(legacy)
    const l2 = generateMatchDetail(legacy)
    check(JSON.stringify(l1) === JSON.stringify(l2), `match ${i}: legacy path not deterministic`)
    const goalsOf = (dd: NonNullable<typeof d>) => dd.events.filter(e => e.type === 'goal').map(e => `${e.playerId}@${e.minute}`).join(',')
    if (l1 && d) check(goalsOf(l1) === goalsOf(d), `match ${i}: legacy attribution diverges from stored scorers`)
  }

  // 2) Invariants

  // Every lineup entry and timeline event must resolve to a real side (Big
  // Fixes §5.1: a sub's team must never come out unresolved — that bug was
  // downstream, in result-screen squad lookups dropping bench players, but
  // this pins the invariant at the source layer too).
  for (const p of d.players) check(typeof p.isHome === 'boolean', `match ${i}: player ${p.playerId} has no resolved team (isHome)`)
  for (const e of d.events)  check(typeof e.isHome === 'boolean', `match ${i}: event ${e.type}@${e.minute} has no resolved team (isHome)`)

  // §9: an own goal counts on the beneficiary's scoreline but is nobody on that
  // side's goal, shot or save — every invariant below is anchored on ATTACKING
  // goals (scoreline minus own goals gifted to you) instead of the raw score.
  const homeAtk = result.homeGoals - scorers.home.filter(g => g.ownGoal).length
  const awayAtk = result.awayGoals - scorers.away.filter(g => g.ownGoal).length

  const sideLines = (isHome: boolean) => d.players.filter(p => p.isHome === isHome)
  for (const [isHome, goals, atkGoals, opp, oppAtk] of [
    [true,  result.homeGoals, homeAtk, d.away, awayAtk],
    [false, result.awayGoals, awayAtk, d.home, homeAtk],
  ] as const) {
    const t = isHome ? d.home : d.away
    const lines = sideLines(isHome)
    const sum = (f: (l: typeof lines[number]) => number) => lines.reduce((s, l) => s + f(l), 0)

    check(sum(l => l.goals) === atkGoals, `match ${i}: Σ player goals ${sum(l => l.goals)} != attacking goals ${atkGoals}`)
    // The own goals THIS side put in must equal the own goals on the OPPONENT's scoreline.
    const ogAgainstUs = (isHome ? scorers.away : scorers.home).filter(g => g.ownGoal).length
    check(sum(l => l.ownGoals) === ogAgainstUs, `match ${i}: Σ own goals ${sum(l => l.ownGoals)} != ${ogAgainstUs} charged to this side`)
    check(sum(l => l.goals) + ogAgainstUs === atkGoals + ogAgainstUs, `match ${i}: goal bookkeeping drifted`)
    const attributedAssists = (isHome ? scorers.home : scorers.away).filter(g => g.assistId).length
    check(sum(l => l.assists) === attributedAssists, `match ${i}: Σ assists mismatch`)
    const attributedPenWon = (isHome ? scorers.home : scorers.away).filter(g => g.penWonId).length
    check(sum(l => l.penaltiesWon) === attributedPenWon, `match ${i}: Σ penalties won mismatch`)
    const attributedErrors = (isHome ? scorers.away : scorers.home).filter(g => g.errorById).length
    check(sum(l => l.errorsLeadingToGoal) === attributedErrors, `match ${i}: Σ errors mismatch`)
    check(sum(l => l.penaltyGoals) <= sum(l => l.goals), `match ${i}: penalty goals exceed goals`)
    check(t.shotsOnTarget >= atkGoals, `match ${i}: team SOT < attacking goals`)
    check(sum(l => l.shots) === t.shots, `match ${i}: Σ player shots != team shots`)
    check(sum(l => l.shotsOnTarget) === t.shotsOnTarget, `match ${i}: Σ player SOT != team SOT`)
    check(lines.every(l => l.shots >= l.shotsOnTarget && l.shotsOnTarget >= l.goals), `match ${i}: player shot ordering broken`)
    check(t.shots === t.shotsOnTarget + t.shotsOffTarget + t.shotsBlocked, `match ${i}: shot split mismatch`)
    check(t.shots === t.shotsInsideBox + t.shotsOutsideBox, `match ${i}: box split mismatch`)
    check(t.keeperSaves === opp.shotsOnTarget - oppAtk, `match ${i}: saves mismatch`)
    check(t.blocks === opp.shotsBlocked, `match ${i}: blocks != opp blocked shots`)
    check(sum(l => l.passes) === t.passes, `match ${i}: Σ passes != team`)
    check(lines.every(l => l.accuratePasses <= l.passes), `match ${i}: accurate > total passes`)
    check(sum(l => l.foulsCommitted) === t.fouls, `match ${i}: Σ fouls != team`)
    check(sum(l => l.foulsWon) === opp.fouls, `match ${i}: Σ fouls won != opp fouls`)
    check(sum(l => l.tacklesWon) === t.tacklesWon, `match ${i}: Σ tackles != team`)
    check(sum(l => l.touchesInOppBox) === t.touchesInOppBox, `match ${i}: Σ box touches != team`)
    check(t.bigChances >= t.bigChancesMissed, `match ${i}: big chances < missed`)
    check(t.xg > 0 || t.shots === 0, `match ${i}: zero xG with shots`)

    const gk = lines.find(l => l.gk)
    if (gk?.gk) {
      check(gk.gk.saves === t.keeperSaves, `match ${i}: GK line saves != team saves`)
      check(gk.gk.goalsConceded === (isHome ? result.awayGoals : result.homeGoals), `match ${i}: GK conceded mismatch`)
    }

    // Sub sanity: everyone who came on did so before doing anything; minutes coherent.
    for (const l of lines) {
      if (l.subOnMinute !== undefined) {
        // §10.5 phase 3 made half-time a real beat, so 45' is now a legitimate
        // "came on" minute — it means he was brought on at the interval. And
        // §10.5 phase 4 exempts a forced change entirely: if a man goes down on
        // 20 minutes his replacement comes on THEN, first half or not.
        const forcedOn = d.events.some(e => e.type === 'sub' && e.forced && e.playerId === l.playerId && e.isHome === isHome)
        check(forcedOn || l.subOnMinute >= HALF_TIME_MINUTE, `match ${i}: sub came on at ${l.subOnMinute}' — inside the first half`)
        check(l.minutes > 0 && l.minutes <= d.duration - l.subOnMinute, `match ${i}: sub minutes incoherent (${l.minutes} on at ${l.subOnMinute})`)
      }
      if (l.subOffMinute !== undefined) check(l.minutes <= l.subOffMinute, `match ${i}: sub-off minutes incoherent`)
      check(l.minutes > 0 || (l.goals === 0 && l.assists === 0 && l.shots === 0 && l.passes === 0
        && l.ownGoals === 0 && l.penaltiesWon === 0 && l.errorsLeadingToGoal === 0), `match ${i}: unused sub has stats`)
    }

    // Everyone a goal names must have been on the pitch at that minute, on the
    // right side. §9 crosses the halfway line: an own-goal scorer and an
    // error-maker belong to the CONCEDING team, so they're checked against the
    // opposite lineup — getting this backwards is the bug most likely to slip
    // an OG onto the wrong team's stat sheet.
    const oppLines = sideLines(!isHome)
    const onPitchAt = (pool: typeof lines, id: string, minute: number, what: string) => {
      const line = pool.find(l => l.playerId === id)
      check(!!line && line.minutes > 0, `match ${i}: ${what} ${id} not on pitch`)
      if (line?.subOnMinute !== undefined) check(line.subOnMinute <= minute, `match ${i}: ${what} involved at ${minute}' but came on at ${line.subOnMinute}'`)
    }
    for (const g of (isHome ? scorers.home : scorers.away)) {
      if (g.ownGoal) {
        onPitchAt(oppLines, g.scorerId, g.minute, 'own-goal scorer')
        check(!lines.some(l => l.playerId === g.scorerId), `match ${i}: own-goal scorer sits on the BENEFITING side's lineup`)
      } else {
        onPitchAt(lines, g.scorerId, g.minute, 'scorer')
        if (g.penWonId) {
          check(g.penWonId !== g.scorerId, `match ${i}: penalty "won by" is the taker himself`)
          onPitchAt(lines, g.penWonId, g.minute, 'penalty winner')
        }
      }
      if (g.errorById) onPitchAt(oppLines, g.errorById, g.minute, 'error-maker')
    }

    // Red cards: each red event pairs with a line flagged redCard, sent off in
    // the second half, whose match ended at (or before) the red minute.
    const redEvents = d.events.filter(e => e.type === 'red' && e.isHome === isHome)
    const redLines  = lines.filter(l => l.redCard)
    check(redEvents.length === redLines.length, `match ${i}: red events (${redEvents.length}) != red lines (${redLines.length}) for one side`)
    for (const ev of redEvents) {
      check(ev.minute >= 46, `match ${i}: red card at ${ev.minute}' (before half-time)`)
      const line = lines.find(l => l.playerId === ev.playerId)
      check(!!line && line.redCard, `match ${i}: red event has no matching redCard line`)
      if (line) check(line.minutes <= ev.minute, `match ${i}: sent-off player kept playing after the red (${line.minutes}' > ${ev.minute}')`)
    }
  }
  check(d.home.possession + d.away.possession === 100, `match ${i}: possession != 100`)

  // §10.5 — the selected elevens.
  for (const [shape, isHome] of [[d.homeShape, true], [d.awayShape, false]] as const) {
    check(!!shape, `match ${i}: no lineup shape generated`)
    if (!shape) continue
    check(shape.slots.length === 11, `match ${i}: XI has ${shape.slots.length} players`)
    const ids = new Set(shape.slots.map(x => x.playerId))
    check(ids.size === 11, `match ${i}: the same player fills two slots`)
    const gkSlot = shape.slots.find(x => x.label === 'GK')
    const lines = sideLines(isHome)
    if (gkSlot) {
      const gk = lines.find(l => l.playerId === gkSlot.playerId)
      check(gk?.position === 'GK', `match ${i}: a non-keeper is in goal`)
    }
    for (const sl of shape.slots) {
      const l = lines.find(x => x.playerId === sl.playerId)
      check(!!l && l.minutes > 0 && l.subOnMinute === undefined,
        `match ${i}: selected starter ${sl.playerId} did not start`)
    }
    formationCounts.set(shape.formation, (formationCounts.get(shape.formation) ?? 0) + 1)
    for (const sl of shape.slots) {
      const l = lines.find(x => x.playerId === sl.playerId)
      if (l) startingPosCount.set(l.position, (startingPosCount.get(l.position) ?? 0) + 1)
    }
  }
  if (d.events.some(e => e.type === 'red')) redMatchCount++

  // §8 momentum: shape, range, and the "a goal means momentum toward the
  // scorer" relationship the spec puts at ~85%.
  check(d.momentum.length === d.duration, `match ${i}: momentum length ${d.momentum.length} != duration ${d.duration}`)
  check(d.momentum.every(v => Number.isInteger(v) && v >= -100 && v <= 100), `match ${i}: momentum value out of −100…100`)
  for (let m = 0; m < d.momentum.length; m++) {
    momentumAbsSum += Math.abs(d.momentum[m]); momentumSamples++
    if (Math.abs(d.momentum[m]) >= 95) momentumExtremes++
    if (m > 0 && Math.sign(d.momentum[m]) !== Math.sign(d.momentum[m - 1])) momentumCrossings++
  }
  for (const e of d.events) {
    if (e.type !== 'goal') continue
    const v = d.momentum[Math.min(d.momentum.length, e.minute) - 1]
    goalsMomentumChecked++
    // `isHome` is the side the goal counts for, so an own goal is expected to
    // swing momentum to the team that BENEFITED — same reconciliation as §9.
    if (v !== 0 && (v > 0) === e.isHome) goalsWithMomentum++
  }

  // §10 pre-step: added time per half, and missed penalties.
  const at = d.addedTime
  addedFirstSum += at.firstHalf; addedSecondSum += at.secondHalf; addedMatches++
  check(at.firstHalf >= 0 && at.secondHalf >= 0, `match ${i}: negative added time`)
  check((at.firstET === undefined) === (d.duration <= 90), `match ${i}: extra-time added time doesn't match duration`)
  // A stoppage-time event must fall inside the added time the board showed.
  for (const e of d.events) {
    if (!e.plus) continue
    const allowed = e.minute === 45 ? at.firstHalf : e.minute === 90 ? at.secondHalf
      : e.minute === 105 ? (at.firstET ?? 0) : e.minute === 120 ? (at.secondET ?? 0) : Infinity
    check(e.plus <= allowed, `match ${i}: event at ${e.minute}+${e.plus} exceeds the ${allowed}' added to that half`)
  }
  for (const e of d.events) {
    if (e.type !== 'penMissed') continue
    missedPens++
    if (e.saved) savedPens++
    const takerLines = sideLines(e.isHome)
    const taker = takerLines.find(l => l.playerId === e.playerId)
    check(!!taker && taker.minutes > 0, `match ${i}: penalty taker not on pitch`)
    check(!!taker && taker.penaltiesMissed > 0, `match ${i}: missed penalty not recorded on the taker's line`)
    check(taker?.position !== 'GK', `match ${i}: goalkeeper took a penalty in open play`)
    if (e.saved) {
      const gk = sideLines(!e.isHome).find(l => l.playerId === e.keeperId)
      check(!!gk?.gk && gk.gk.penaltiesSaved > 0, `match ${i}: saved penalty not credited to the keeper`)
    }
  }
  // Σ per-player misses must equal the miss events on that side.
  for (const isHome of [true, false]) {
    const evs = d.events.filter(e => e.type === 'penMissed' && e.isHome === isHome).length
    const sum = sideLines(isHome).reduce((s, l) => s + l.penaltiesMissed, 0)
    check(sum === evs, `match ${i}: Σ penalties missed ${sum} != ${evs} miss events`)
  }

  // §9 event bookkeeping — each goal list is paired with the squad that conceded it.
  for (const [evs, concedingPool] of [[scorers.home, awayPool], [scorers.away, homePool]] as const) {
    for (const g of evs) {
      totalGoals++
      if (g.ownGoal) {
        ownGoalCount++
        const scorer = concedingPool.find(x => x.playerId === g.scorerId)
        check(!!scorer, `match ${i}: own-goal scorer is not in the conceding squad`)
        if (scorer && DEFENDER_POS.has(scorer.primaryPosition)) ownGoalByDefender++
        check(!g.penalty && !g.assistId && !g.penWonId, `match ${i}: own goal carries penalty/assist data`)
      }
      if (g.penalty) {
        penaltyCount++
        if (g.penWonId) penaltyWithWinner++
        check(!g.assistId, `match ${i}: penalty also carries an assist`)
      }
      if (g.errorById) {
        errorCount++
        check(concedingPool.some(x => x.playerId === g.errorById), `match ${i}: error charged outside the conceding squad`)
        check(!g.penalty, `match ${i}: penalty also carries an error`)
      }
    }
  }

  // Collect for aggregate sanity
  const outcome = result.homeGoals > result.awayGoals ? 'home' : result.awayGoals > result.homeGoals ? 'away' : 'draw'
  samples.push({
    homeOvr, awayOvr, hg: result.homeGoals, ag: result.awayGoals, isUpset: result.isUpset,
    homeXg: d.home.xg, awayXg: d.away.xg, homePoss: d.home.possession,
    ratings: d.players.filter(p => p.minutes > 0).map(p => ({
      pos: p.position, rating: p.rating, goals: p.goals, assists: p.assists,
      motm: !!p.motm, minutes: p.minutes,
      side: outcome === 'draw' ? 'd' as const : (p.isHome === (outcome === 'home') ? 'w' as const : 'l' as const),
    })),
  })
}

const genMs = Date.now() - t0
console.log(`Done in ${genMs}ms (${(genMs / N).toFixed(2)}ms/match incl. full detail)\n`)

// ── 3) Rating sanity ────────────────────────────────────────────────────────
const allRatings = samples.flatMap(s => s.ratings)
const byPos = (positions: string[]) => {
  const r = allRatings.filter(x => positions.includes(x.pos) && x.minutes >= 60)
  return r.reduce((s, x) => s + x.rating, 0) / r.length
}
const avgAll = allRatings.reduce((s, x) => s + x.rating, 0) / allRatings.length
const stAvg = byPos(['ST', 'CF'])
const cdmAvg = byPos(['CDM'])
const gkAvg = byPos(['GK'])

console.log(`Red cards: ${redMatchCount}/${N} matches had a sending-off (${(redMatchCount / N * 100).toFixed(1)}%)`)
check(redMatchCount > 0 && redMatchCount < N * 0.15, `red-card frequency ${(redMatchCount / N * 100).toFixed(1)}% looks wrong`)
console.log(`Ratings: overall avg ${avgAll.toFixed(2)} | ST ${stAvg.toFixed(2)} | CDM ${cdmAvg.toFixed(2)} | GK ${gkAvg.toFixed(2)}`)
check(avgAll > 6.0 && avgAll < 7.2, `overall avg rating ${avgAll.toFixed(2)} outside 6.0–7.2`)
check(stAvg > cdmAvg, `strikers (${stAvg.toFixed(2)}) do not out-rate CDMs (${cdmAvg.toFixed(2)})`)
check(gkAvg > 5.6 && gkAvg < 7.4, `GK avg ${gkAvg.toFixed(2)} out of band`)

// MOTM correlates with goal involvement
const motm = allRatings.filter(x => x.motm)
const motmInvolved = motm.filter(x => x.goals > 0 || x.assists > 0).length / motm.length
console.log(`MOTM with goal/assist: ${(motmInvolved * 100).toFixed(0)}%`)
check(motmInvolved > 0.5, `MOTM only involved in ${(motmInvolved * 100).toFixed(0)}% of matches (< 50%)`)

// Nobody rates 8+ on a side thrashed by 4+
let thrashedHigh = 0, thrashedCount = 0
for (const s of samples) {
  const margin = Math.abs(s.hg - s.ag)
  if (margin < 4) continue
  for (const r of s.ratings) if (r.side === 'l') {
    thrashedCount++
    if (r.rating >= 8) thrashedHigh++
  }
}
console.log(`Players rating 8+ on 4+-goal-losing sides: ${thrashedHigh}/${thrashedCount}`)
check(thrashedHigh / Math.max(1, thrashedCount) < 0.01, `too many 8+ ratings on thrashed sides`)

// Scorers rate clearly above non-scorers
const scorerAvg = allRatings.filter(x => x.goals > 0).reduce((s, x) => s + x.rating, 0) / Math.max(1, allRatings.filter(x => x.goals > 0).length)
console.log(`Scorer avg rating ${scorerAvg.toFixed(2)} vs overall ${avgAll.toFixed(2)}`)
check(scorerAvg > avgAll + 0.5, `scoring doesn't lift ratings enough`)

// ── 4) Upset texture: better team loses but often dominates the sheet ───────
const upsets = samples.filter(s => s.isUpset && s.hg !== s.ag)
let loserDominatesXg = 0, loserDominatesPoss = 0
for (const s of upsets) {
  const homeLost = s.hg < s.ag
  const loserXg = homeLost ? s.homeXg : s.awayXg
  const winnerXg = homeLost ? s.awayXg : s.homeXg
  const loserPoss = homeLost ? s.homePoss : 100 - s.homePoss
  if (loserXg > winnerXg) loserDominatesXg++
  if (loserPoss > 50) loserDominatesPoss++
}
console.log(`\nUpsets: ${upsets.length}. Beaten favourite still won xG: ${(loserDominatesXg / Math.max(1, upsets.length) * 100).toFixed(0)}%, possession: ${(loserDominatesPoss / Math.max(1, upsets.length) * 100).toFixed(0)}%`)
// Threshold note: only ~200 of 4000 matches are upsets, and the true rate sits
// around 41%, so the original `> 0.40` bar was set at its own mean and failed on
// roughly half of all runs from sampling noise alone. 0.33 still catches the
// regression this guards against — if texture ever became result-driven, a
// beaten favourite would win xG far less often than a coin flip, not 4pp less.
check(loserDominatesXg / Math.max(1, upsets.length) > 0.33, `upset losers rarely dominate xG — texture too result-driven`)
check(loserDominatesPoss / Math.max(1, upsets.length) > 0.55, `upset losers rarely win possession`)

// Non-upset: better teams generally look better
const routine = samples.filter(s => !s.isUpset && Math.abs(s.homeOvr - s.awayOvr) > 8)
let betterLooksBetter = 0
for (const s of routine) {
  const homeBetter = s.homeOvr > s.awayOvr
  if ((homeBetter && s.homePoss > 50) || (!homeBetter && s.homePoss < 50)) betterLooksBetter++
}
console.log(`Clear-favourite matches where favourite won possession: ${(betterLooksBetter / Math.max(1, routine.length) * 100).toFixed(0)}%`)
check(betterLooksBetter / Math.max(1, routine.length) > 0.75, `favourites don't dominate possession often enough`)

// xG averages
const avgXg = samples.reduce((s, x) => s + x.homeXg + x.awayXg, 0) / (samples.length * 2)
console.log(`Average xG per team per match: ${avgXg.toFixed(2)}`)
check(avgXg > 0.7 && avgXg < 2.6, `avg xG ${avgXg.toFixed(2)} implausible`)

// ── 5) §9 events: own goals, penalties & mistakes ───────────────────────────
const ogRate  = ownGoalCount / Math.max(1, totalGoals)
const defShare = ownGoalByDefender / Math.max(1, ownGoalCount)
const penRate = penaltyCount / Math.max(1, totalGoals)
const errRate = errorCount / Math.max(1, totalGoals)
console.log(`\n§9 events across ${totalGoals} goals:`)
console.log(`  Own goals:  ${ownGoalCount} (${(ogRate * 100).toFixed(2)}% of goals) — ${(defShare * 100).toFixed(0)}% scored by defenders`)
console.log(`  Penalties:  ${penaltyCount} (${(penRate * 100).toFixed(1)}%) — ${penaltyWithWinner} with a named "won by" player`)
console.log(`  Errors:     ${errorCount} (${(errRate * 100).toFixed(1)}%) led directly to a goal`)
check(ogRate > 0.005 && ogRate < 0.06, `own-goal rate ${(ogRate * 100).toFixed(2)}% is outside the "rare" band (0.5–6% of goals)`)
check(defShare > 0.80 && defShare < 0.97, `own-goal defender share ${(defShare * 100).toFixed(0)}% doesn't match the 90/10 split`)
check(penaltyCount > 0 && penaltyWithWinner === penaltyCount, `${penaltyCount - penaltyWithWinner} penalties have no "won by" player`)
check(penRate > 0.03 && penRate < 0.16, `penalty rate ${(penRate * 100).toFixed(1)}% implausible`)
check(errorCount > 0, `no errors-leading-to-goal were generated at all`)

// ── 6) §8 Match Momentum ────────────────────────────────────────────────────
const goalMomentumRate = goalsWithMomentum / Math.max(1, goalsMomentumChecked)
const avgAbsMomentum = momentumAbsSum / Math.max(1, momentumSamples)
const extremeRate = momentumExtremes / Math.max(1, momentumSamples)
const crossingRate = momentumCrossings / Math.max(1, momentumSamples)
console.log(`\n§8 momentum over ${momentumSamples} minutes:`)
console.log(`  Goals with momentum toward the scoring team: ${(goalMomentumRate * 100).toFixed(1)}%`)
console.log(`  Mean |momentum| ${avgAbsMomentum.toFixed(1)} · at-the-extreme (≥95) ${(extremeRate * 100).toFixed(2)}% · centreline crossings ${(crossingRate * 100).toFixed(0)}% of minutes`)
check(goalMomentumRate > 0.78 && goalMomentumRate < 0.93, `goal→momentum agreement ${(goalMomentumRate * 100).toFixed(1)}% is off the ~85% target`)
// A real derived range, not a static 0/100: it must live mostly in the middle,
// touch the extremes only rarely, and swing across the centreline often.
check(avgAbsMomentum > 20 && avgAbsMomentum < 70, `mean |momentum| ${avgAbsMomentum.toFixed(1)} implies a flat or pegged curve`)
check(extremeRate < 0.03, `momentum sits at the extreme ${(extremeRate * 100).toFixed(1)}% of minutes — 100 should be rare`)
check(crossingRate > 0.08, `momentum crosses the centreline only ${(crossingRate * 100).toFixed(0)}% of minutes — curve is too one-sided`)

// ── 7) §10 pre-step: missed penalties + added time ──────────────────────────
const totalPens = penaltyCount + missedPens
const missShare = missedPens / Math.max(1, totalPens)
console.log(`\n§10 pre-step:`)
console.log(`  Penalties: ${totalPens} awarded — ${penaltyCount} scored, ${missedPens} missed (${(missShare * 100).toFixed(1)}% missed, ${savedPens} of them saved)`)
console.log(`  Added time: 1st half +${(addedFirstSum / Math.max(1, addedMatches)).toFixed(1)}' · 2nd half +${(addedSecondSum / Math.max(1, addedMatches)).toFixed(1)}' on average`)
check(missShare > 0.26 && missShare < 0.40, `penalty miss share ${(missShare * 100).toFixed(1)}% is off the ~33% target`)
check(savedPens > 0 && savedPens < missedPens, `saved-vs-off-target split looks wrong (${savedPens}/${missedPens})`)

// ── 8) §10.5 lineups ────────────────────────────────────────────────────────
const shapes = [...formationCounts.entries()].sort((a, b) => b[1] - a[1])
console.log(`\n§10.5 lineups across ${N * 2} elevens:`)
console.log(`  Formations: ${shapes.map(([f, n]) => `${f} ${(n / (N * 2) * 100).toFixed(0)}%`).join(' · ')}`)
check(shapes.length >= 4, `only ${shapes.length} formations ever appear — clubs aren't varying their shape`)
check(shapes[0][1] / (N * 2) < 0.45, `${shapes[0][0]} is used ${(shapes[0][1] / (N * 2) * 100).toFixed(0)}% of the time — too uniform`)

// The bug this whole system exists to kill: a squad packed with centre-backs
// used to field them ALL, because the XI was "1 GK + top 10 by OVR". A
// formation-aware XI has to play the striker and leave the surplus defenders out.
{
  const lopsided: RosterPlayer[] = []
  const mk = (pos: string, ovr: number, i: number): RosterPlayer => ({
    playerId: `LOP-${i}`, name: `Lop ${pos}${i}`, primaryPosition: pos,
    attack: ovr, ovr, birthYear: 1995, yearStart: 2024, seasonLabel: '24/25',
    clubId: 'LOP', clubName: 'Lopsided FC',
  })
  let idx = 0
  lopsided.push(mk('GK', 70, idx++))
  for (let k = 0; k < 8; k++) lopsided.push(mk('CB', 84 - k, idx++))   // eight GOOD centre-backs
  for (let k = 0; k < 3; k++) lopsided.push(mk('CM', 74 - k, idx++))
  lopsided.push(mk('LB', 72, idx++)); lopsided.push(mk('RB', 72, idx++))
  lopsided.push(mk('LW', 71, idx++)); lopsided.push(mk('RW', 71, idx++))
  lopsided.push(mk('ST', 70, idx++))                                    // one modest striker
  let cbHeavy = 0, strikerPlayed = 0, keeperOk = 0
  const TRIALS = 300
  for (let k = 0; k < TRIALS; k++) {
    const xi = selectLineup(lopsided, { seed: randomSeed() })
    check(xi.starters.length === 11, 'lopsided roster produced an XI that is not 11')
    if (xi.starters.filter(p => p.primaryPosition === 'GK').length === 1) keeperOk++
    if (xi.starters.filter(p => p.primaryPosition === 'CB').length > 4) cbHeavy++
    if (xi.starters.some(p => p.primaryPosition === 'ST')) strikerPlayed++
  }
  console.log(`  Lopsided squad (8 CBs, 1 ST): striker started ${(strikerPlayed / TRIALS * 100).toFixed(0)}% · >4 CBs started ${(cbHeavy / TRIALS * 100).toFixed(0)}% · exactly one keeper ${(keeperOk / TRIALS * 100).toFixed(0)}%`)
  check(keeperOk === TRIALS, 'an XI was picked without exactly one goalkeeper')
  check(strikerPlayed / TRIALS > 0.9, 'the only striker keeps being left out of the XI')
  check(cbHeavy / TRIALS < 0.15, 'squads are still fielding a wall of centre-backs')
}

// Rotation has to actually weaken the side, and only when asked for.
{
  const pool = makePool('ROT', 80, true, mulberry32(99))
  let restedTotal = 0, fullStrengthRested = 0
  for (let k = 0; k < 200; k++) {
    const seed = randomSeed()
    fullStrengthRested += selectLineup(pool, { seed }).rotated
    restedTotal += selectLineup(pool, { seed, rotation: 1 }).rotated
  }
  console.log(`  Rotation: ${(restedTotal / 200).toFixed(1)} players rested at full rotation, ${fullStrengthRested} at none`)
  check(fullStrengthRested === 0, 'players are being rested when no rotation was requested')
  check(restedTotal / 200 > 2, 'full rotation barely changes the side')
}

// ── §10.5 substitutions: allowance used, and extra time actually gets some ──
{
  let subs90 = 0, matches90 = 0
  let etMatches = 0, etWithEtSub = 0, subsInEt = 0
  const rng3 = mulberry32(4242)
  for (let i = 0; i < 500; i++) {
    const ovr = 72 + Math.floor(rng3() * 14)
    const hp = makePool(`SH${i}`, ovr, true, rng3)
    const ap = makePool(`SA${i}`, ovr, true, rng3)
    const res = simulateMatch(simTeam(`SH${i}`, ovr), simTeam(`SA${i}`, ovr))
    const sd = randomSeed()
    const extraTime = i % 2 === 0
    const dd = generateMatchDetail({
      seed: sd, homePool: hp, awayPool: ap,
      homeGoals: res.homeGoals, awayGoals: res.awayGoals, benchSize: 9, extraTime,
    })
    if (!dd) continue
    const homeSubs = dd.events.filter(e => e.type === 'sub' && e.isHome)
    if (extraTime) {
      etMatches++
      const inEt = homeSubs.filter(e => e.minute > 90)
      subsInEt += inEt.length
      if (inEt.length > 0) etWithEtSub++
    } else {
      matches90++
      subs90 += homeSubs.length
      // Nothing may be changed after the whistle.
      for (const e of homeSubs) check(e.minute <= 90, `sub at ${e.minute}' in a 90' match`)
    }
  }
  const avg = subs90 / Math.max(1, matches90)
  const etShare = etWithEtSub / Math.max(1, etMatches)
  console.log(`
§10.5 substitutions: ${avg.toFixed(1)} per side in a 90' match · ${(etShare * 100).toFixed(0)}% of 120' matches had a change IN extra time (${(subsInEt / Math.max(1, etMatches)).toFixed(1)} each)`)
  check(avg > 4.2, `sides only average ${avg.toFixed(1)} substitutes — the full allowance isn't being used`)
  check(etShare > 0.8, `only ${(etShare * 100).toFixed(0)}% of extra-time matches saw a substitution in extra time`)
}

// ── §10.5 "scored before he came on" ────────────────────────────────────────
// The sheet regenerates the eleven from the same options the sim attributed
// with. If those EVER disagree — a screen forgetting to pass the rotation, a
// different bench size — a stored scorer can land on the bench, and the sub
// logic (which can only place a substitution from 46' on) would hand him a
// "came on 46', scored 20'". The generator now promotes any such player into
// the XI, so the invariant holds whatever upstream got wrong. Reproduce the
// worst case: attribute at full strength, regenerate with heavy rotation.
{
  let violations = 0, checked = 0
  const rng2 = mulberry32(99)
  for (let i = 0; i < 600; i++) {
    const ovr = 70 + Math.floor(rng2() * 18)
    const hp = makePool(`MH${i}`, ovr, true, rng2)
    const ap = makePool(`MA${i}`, ovr, true, rng2)
    const res = simulateMatch(simTeam(`MH${i}`, ovr), simTeam(`MA${i}`, ovr))
    const sd = randomSeed()
    // Attributed with NO rotation …
    const sc = attributeMatchScorers(hp, ap, res.homeGoals, res.awayGoals,
      { rng: mulberry32(sd), lineups: { seed: sd, benchSize: 9 } })
    // … regenerated with heavy rotation on both sides (the mismatch).
    const dd = generateMatchDetail({
      seed: sd, homePool: hp, awayPool: ap,
      homeGoals: res.homeGoals, awayGoals: res.awayGoals, scorers: sc,
      benchSize: 9, homeRotation: 1, awayRotation: 1,
    })
    if (!dd) continue
    for (const e of dd.events) {
      if (e.type !== 'goal' || e.ownGoal) continue
      const line = dd.players.find(p => p.playerId === e.playerId && p.isHome === e.isHome)
      if (!line) continue
      checked++
      if (line.subOnMinute !== undefined && line.subOnMinute > e.minute) violations++
    }
  }
  console.log(`§10.5 sub timing: ${checked} goals cross-checked under a deliberate lineup mismatch, ${violations} scored before coming on`)
  check(violations === 0, `${violations} goals were scored before the scorer came on`)
}

// ── §10.5 selection stability: the best man keeps his place ─────────────────
// The first cut used ±3.5 OVR of jitter, which meant an 84 and an 85 swapped
// about half the time — sides looked like they were picking at random week to
// week, and it drowned out rotation entirely. This pins that down.
{
  const mk = (id: string, pos: string, ovr: number): RosterPlayer => ({
    playerId: id, name: id, primaryPosition: pos, attack: ovr, ovr,
    birthYear: 1995, yearStart: 2024, seasonLabel: '24/25', clubId: 'S', clubName: 'S',
  })
  const squad = [
    ...['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW'].map((p, i) => mk(`a${i}`, p, 80)),
    mk('star', 'ST', 85), mk('backup', 'ST', 80),
    ...['CB', 'CM', 'GK', 'RW'].map((p, i) => mk(`b${i}`, p, 78)),
  ]
  let starStarts = 0
  const RUNS = 400
  for (let k = 0; k < RUNS; k++) {
    const l = selectLineup(squad, { seed: k * 7919 + 3, formation: '4-3-3', benchSize: 5 })
    if (l.starters.some(p => p.playerId === 'star')) starStarts++
  }
  const share = starStarts / RUNS
  console.log(`\n§10.5 selection: clearly-better striker (85 vs 80) started ${(share * 100).toFixed(0)}% of the time`)
  check(share > 0.95, `a five-point-better striker only started ${(share * 100).toFixed(0)}% — selection is too noisy`)
}

// ── §10.5 rotation: the OVR a rested side actually plays at ─────────────────
{
  const base = 84
  let minSeen = Infinity, maxSeen = -Infinity
  for (let xi = base - 25; xi <= base; xi++) {
    for (let subs = 0; subs <= 5; subs++) {
      const v = matchTeamOvr(base, xi, { rotated: true, subs })
      minSeen = Math.min(minSeen, v); maxSeen = Math.max(maxSeen, v)
    }
  }
  console.log(`§10.5 rotation OVR (base ${base}): range ${minSeen}–${maxSeen}`)
  // However bad the reserves, a rested side is never worse than base − 6 …
  check(minSeen >= base - ROTATION_MAX_DROP, `rotated OVR ${minSeen} fell below the base−${ROTATION_MAX_DROP} floor`)
  // … and however many good players come back on, it never fully recovers.
  check(maxSeen <= base - ROTATION_MIN_PENALTY, `rotated OVR ${maxSeen} recovered past base−${ROTATION_MIN_PENALTY}`)
  check(matchTeamOvr(base, base, { rotated: false, subs: 0 }) === base, 'unrotated side without subs != base')
  check(matchTeamOvr(base, base, { rotated: false, subs: 5 }) > base, 'substitutes gave no freshness bonus')
  check(matchTeamOvr(base, base, { rotated: false, subs: 5 }) <= base + 1, 'freshness bonus exceeds its cap')

  // Stakes: a live table never rotates; a settled one does.
  const tight = Array.from({ length: 20 }, (_, i) => ({ clubId: `t${i}`, points: 40 - i }))
  check(rotationFor({ standings: tight, clubId: 't5', totalMatchdays: 38, playedMatchdays: 30,
    qualifyCutoff: 5, dropCutoff: 3, titleMatters: true }) === 0, 'rotated with the table still live')
  const settled = Array.from({ length: 20 }, (_, i) => ({ clubId: `t${i}`, points: 100 - i * 5 }))
  check(rotationFor({ standings: settled, clubId: 't9', totalMatchdays: 38, playedMatchdays: 37,
    qualifyCutoff: 5, dropCutoff: 3, titleMatters: true }) > 0, 'did not rotate in a dead rubber')
  check(rotationFor({ standings: settled, clubId: 't0', totalMatchdays: 38, playedMatchdays: 10,
    qualifyCutoff: 5, dropCutoff: 3, titleMatters: true }) === 0, 'rotated mid-season with everything to play for')
}


// ── §10.5 phase 3: half-time, and the three-window rule ─────────────────────
// Substitutions used to be scattered one per drawn minute across the second
// half, which is not how football works: a side gets THREE windows in normal
// time, and a change at the interval doesn't spend one. So every side's
// tactical minutes must collapse onto at most three in-play values plus 45'.
{
  let sides = 0, breaches = 0, maxDistinct = 0, halfTimeSides = 0
  let etSides = 0, etBreaches = 0
  const rng3 = mulberry32(4711)
  for (let i = 0; i < 900; i++) {
    const extraTime = i % 4 === 0
    const ovr = 70 + Math.floor(rng3() * 18)
    const hp = makePool(`WH${i}`, ovr, true, rng3)
    const ap = makePool(`WA${i}`, ovr, true, rng3)
    const res = simulateMatch(simTeam(`WH${i}`, ovr), simTeam(`WA${i}`, ovr))
    const sd = randomSeed()
    const d = generateMatchDetail({
      seed: sd, homePool: hp, awayPool: ap,
      homeGoals: res.homeGoals, awayGoals: res.awayGoals, extraTime, benchSize: 9,
    })
    if (!d) continue
    for (const isHome of [true, false]) {
      // Forced (injury) changes are exempt by definition — that's the rule in
      // real football too, and the whole point of flagging them separately.
      const subs = d.events.filter(e => e.type === 'sub' && e.isHome === isHome && !e.forced)
      if (subs.length === 0) continue
      const inPlay = new Set(subs.filter(e => e.minute !== HALF_TIME_MINUTE).map(e => e.minute))
      if (subs.some(e => e.minute === HALF_TIME_MINUTE)) halfTimeSides++
      // Normal time gets three windows; extra time adds its own interval plus
      // one further window, so a 120' match can legitimately show five.
      const allowed = extraTime ? 5 : 3
      if (extraTime) { etSides++; if (inPlay.size > allowed) etBreaches++ }
      else { sides++; maxDistinct = Math.max(maxDistinct, inPlay.size); if (inPlay.size > allowed) breaches++ }
      // A change flagged as a half-time one must actually be AT half-time.
      for (const e of subs) if (e.halfTime) check(e.minute === HALF_TIME_MINUTE, `half-time sub stamped ${e.minute}'`)
    }
  }
  const htShare = halfTimeSides / Math.max(1, sides + etSides)
  console.log(`
§10.5 windows: ${sides} normal-time sides, at most ${maxDistinct} distinct in-play sub minutes each · ${(htShare * 100).toFixed(0)}% of sides made an interval change`)
  check(breaches === 0, `${breaches} sides made changes in more than three in-play windows`)
  check(etBreaches === 0, `${etBreaches} extra-time sides exceeded their window allowance`)
  check(htShare > 0.15 && htShare < 0.75, `half-time changes at ${(htShare * 100).toFixed(0)}% — not a distinct beat, either vanishing or constant`)
}

// ── §10.5 phase 4: injuries ─────────────────────────────────────────────────
// An injury has to behave like one: it happens at a minute, the player comes
// off THERE (not at the next tactical window), the change is forced, and a side
// with nothing left on the bench plays on short. And nobody can do anything on
// the scoresheet after limping off.
{
  let sideMatches = 0, injuries = 0, forcedOk = 0, playedShort = 0
  let lateInvolvement = 0, badOffMinute = 0, badSpan = 0
  const rng4 = mulberry32(20260726)
  for (let i = 0; i < 3000; i++) {
    const withBench = i % 10 !== 0     // one in ten sides has nobody to bring on
    const ovr = 70 + Math.floor(rng4() * 18)
    const hp = makePool(`IH${i}`, ovr, withBench, rng4)
    const ap = makePool(`IA${i}`, ovr, withBench, rng4)
    const res = simulateMatch(simTeam(`IH${i}`, ovr), simTeam(`IA${i}`, ovr))
    const sd = randomSeed()
    const d = generateMatchDetail({
      seed: sd, homePool: hp, awayPool: ap,
      homeGoals: res.homeGoals, awayGoals: res.awayGoals, benchSize: withBench ? 9 : 0,
    })
    if (!d) continue
    sideMatches += 2
    for (const e of d.events) {
      if (e.type !== 'injury') continue
      injuries++
      if (!e.matchdaysOut || e.matchdaysOut < 1 || e.matchdaysOut > 34) badSpan++
      const line = d.players.find(l => l.playerId === e.playerId && l.isHome === e.isHome)
      if (!line || !line.injured || line.subOffMinute !== e.minute) badOffMinute++
      // The change it forced sits at the same minute and says it was forced.
      const forced = d.events.find(x =>
        x.type === 'sub' && x.forced && x.isHome === e.isHome && x.minute === e.minute && x.offPlayerId === e.playerId)
      if (e.replaced) { if (forced) forcedOk++ }
      else { playedShort++; if (forced) badOffMinute++ }
      // Nothing on the scoresheet after he went off.
      const after = d.events.some(x =>
        (x.type === 'goal' || x.type === 'penMissed') && x.minute > e.minute &&
        (x.playerId === e.playerId || x.assistId === e.playerId || x.penWonId === e.playerId))
      if (after) lateInvolvement++
    }
  }
  const rate = injuries / Math.max(1, sideMatches)
  const everyN = 1 / Math.max(1e-9, rate)
  console.log(`§10.5 injuries: ${injuries} in ${sideMatches} side-matches — one per team every ${everyN.toFixed(1)} matches (${playedShort} played on short)`)
  // Decision 3 was "realistic: about one per team every 6-8 matches".
  check(everyN > 5.5 && everyN < 9, `injury rate is one every ${everyN.toFixed(1)} matches, not the 6-8 asked for`)
  check(Math.abs(rate - INJURY_PER_SIDE_PER_MATCH) < 0.03, `injury rate ${rate.toFixed(3)} drifted from the declared ${INJURY_PER_SIDE_PER_MATCH}`)
  check(badSpan === 0, `${badSpan} injuries had a nonsense length`)
  check(badOffMinute === 0, `${badOffMinute} injuries didn't take the player off on the minute it happened`)
  check(lateInvolvement === 0, `${lateInvolvement} injured players were still on the scoresheet after going off`)
  check(forcedOk > 0, 'no injury ever produced a forced substitution')
  check(playedShort > 0, 'a side with no bench never had to play on short')
}

// ── §10.5 phase 4: availability ─────────────────────────────────────────────
// The ledger is the one sequential thing in the pipeline, so the checks are
// about the contract it exposes: an unavailable player appears NOWHERE in the
// match he's out of, spans are sane, a red card costs exactly the next match,
// and your side's uncoverable absence produces the OVR−5 stand-in for exactly
// the matches missed.
{
  const rngA = mulberry32(31337)
  // Your club: exactly eleven, no bench — so an absence CANNOT be covered and
  // the stand-in rule (decision 1) is the only way the shirt gets filled.
  const yours = makePool('P', 84, false, rngA)
  const theirs = makePool('Q', 80, true, rngA)
  const poolByClub = new Map([['P', yours], ['Q', theirs]])
  const TOTAL = 10
  const led = createAvailabilityLedger({ poolByClub, playerClubId: 'P', totalMatchdays: TOTAL })

  const victim = yours.find(p => p.playerId === 'P-p5')!
  led.recordMatch({
    matchday: 3, homeClubId: 'P', awayClubId: 'Q',
    events: [{ type: 'injury', minute: 20, isHome: true, playerId: victim.playerId, playerName: victim.name, matchdaysOut: 3, replaced: false }],
  })
  const redMan = theirs.find(p => p.playerId === 'Q-p7')!
  led.recordMatch({
    matchday: 3, homeClubId: 'P', awayClubId: 'Q',
    events: [{ type: 'red', minute: 70, isHome: false, playerId: redMan.playerId, playerName: redMan.name }],
  })

  // Out for the three matchdays AFTER the one it happened on — never the match
  // he was injured in, which he did play most of.
  check(led.unavailableFor('P', 3).size === 0, 'injured in matchday 3 and also missing matchday 3')
  for (const md of [4, 5, 6]) check(led.unavailableFor('P', md).has(victim.playerId), `not out for matchday ${md}`)
  check(!led.unavailableFor('P', 7).has(victim.playerId), 'still out a matchday too long')
  // A red card is exactly one match.
  check(led.unavailableFor('Q', 4).has(redMan.playerId), 'a red card did not suspend anybody')
  check(led.unavailableFor('Q', 4 + SUSPENSION_MATCHES).size === 0, 'a suspension ran past the next match')
  for (const a of led.absences()) check(a.toMatchday <= TOTAL, `absence runs past the end of the competition (MD ${a.toMatchday})`)

  // The stand-in: same position, OVR−5, and present for exactly 4–6.
  for (const md of [4, 5, 6]) {
    const stand = led.standInsFor('P', md)
    check(stand.length === 1, `matchday ${md} generated ${stand.length} stand-ins, expected 1`)
    check(stand[0]?.playerId === standInIdFor(victim.playerId), 'stand-in is not tied to the man he covers')
    check(stand[0]?.ovr === victim.ovr - STAND_IN_OVR_DROP, `stand-in rated ${stand[0]?.ovr}, expected ${victim.ovr - STAND_IN_OVR_DROP}`)
    check(stand[0]?.primaryPosition === victim.primaryPosition, 'stand-in plays the wrong position')
  }
  check(led.standInsFor('P', 7).length === 0, 'stand-in stuck around after the injury healed')
  // And it costs you: your OVR is worse for exactly those matchdays.
  check(led.ovrDeltaFor('P', 5) < 0, 'an uncovered absence cost your team nothing')
  check(led.ovrDeltaFor('P', 7) === 0, 'your OVR stayed reduced after the player was fit again')

  // Your eleven is still eleven, with the stand-in in it and the absent man out.
  const covered = coverAbsences(yours, led.unavailableFor('P', 5), led.standInsFor('P', 5))
  check(covered.filter(p => !p.isBench).length === 11, `covered XI has ${covered.filter(p => !p.isBench).length} men`)
  check(!covered.some(p => p.playerId === victim.playerId), 'an unavailable player is still in your XI')
  check(covered.some(p => p.playerId === standInIdFor(victim.playerId)), 'the stand-in never made the XI')

  // A bench, on the other hand, covers it — no stand-in should be invented.
  const withBench = makePool('R', 84, true, rngA)
  const covered2 = coverAbsences(withBench, new Set([withBench[5].playerId]), [])
  check(covered2.filter(p => !p.isBench).length === 11, 'a bench failed to cover an absence')

  // The sheet itself: nobody unavailable appears anywhere in the match.
  let ghosts = 0
  for (let i = 0; i < 300; i++) {
    const out = led.unavailableFor('P', 5)
    const d = generateMatchDetail({
      seed: randomSeed(), homePool: yours, awayPool: theirs,
      homeGoals: 2, awayGoals: 1, playerClubId: 'P', benchSize: 0,
      playerFormation: '4-3-3', unavailableIds: out, standIns: led.standInsFor('P', 5),
    })
    if (!d) continue
    if (d.players.some(l => out.has(l.playerId))) ghosts++
    if (d.events.some(e => out.has(e.playerId) || (e.assistId && out.has(e.assistId)))) ghosts++
  }
  console.log(`§10.5 availability: 300 sheets regenerated under an absence, ${ghosts} featured someone who was out`)
  check(ghosts === 0, `${ghosts} sheets fielded or credited an unavailable player`)
}


// ── §10.5 phase 4: availability through a knockout bracket ──────────────────
// A league phase is simulated matchday by matchday, so a sequential ledger fits
// naturally. A bracket isn't — `simulateCLKnockoutsOnly` plays the whole thing
// out in one call — so it takes a hook that prices each tie with its absences
// and hands the tie straight back to be attributed and harvested. These checks
// are about that ordering actually holding: an absence incurred in one round has
// to be in force by the next, and the ledger must never field somebody it has
// itself ruled out.
{
  const rngK = mulberry32(8080)
  // 36 clubs with real rosters, straight into the bracket (the league phase
  // standings are just the seeding order here).
  const pools = new Map<string, RosterPlayer[]>()
  const standings = []
  for (let i = 0; i < 36; i++) {
    const id = `K${i}`
    const ovr = 74 + Math.floor(rngK() * 14)
    pools.set(id, makePool(id, ovr, true, rngK))
    standings.push({ clubId: id, clubName: `Club ${id}`, ovr, isPlayer: i === 0 })
  }
  const ledger = createAvailabilityLedger({
    poolByClub: pools, playerClubId: 'K0', totalMatchdays: 17,
  })
  const teams = buildCLTeams(standings)
  const hook = clKnockoutAvailabilityHook({
    ledger, poolByClub: pools, lineupCtx: { playerClubId: 'K0', benchSize: 9 },
    playerFormation: '4-3-3', firstMatchday: CL_LEAGUE_MATCHDAYS,
  })
  const ko = simulateCLKnockoutsOnly(teams, hook)

  const allTies = [...ko.playoffRound, ...ko.r16, ...ko.qf, ...ko.sf, ...(ko.final ? [ko.final] : [])]
  // Every tie came back attributed, with its availability recorded on it — the
  // hook is the only thing that could have done that.
  let unattributed = 0, missingAvailability = 0, ghosts = 0
  for (const m of allTies) {
    if (m.leg1Seed === undefined) unattributed++
    if (m.leg1Absent === undefined) missingAvailability++
    if (m.leg1 && m.leg2Absent === undefined) missingAvailability++
    // Nobody the ledger had ruled out can be on the scoresheet for that leg.
    const legs: [string[] | undefined, MatchScorers | undefined][] = [
      [m.leg1Absent, m.leg1Scorers],
      [m.leg2Absent, m.leg2Scorers],
      [m.leg2Absent, m.leg2ExtraTimeScorers],
    ]
    for (const [absent, sc] of legs) {
      if (!absent?.length || !sc) continue
      const out = new Set(absent)
      for (const g of [...sc.home, ...sc.away]) {
        if (out.has(g.scorerId) || (g.assistId && out.has(g.assistId))) ghosts++
      }
    }
  }
  check(unattributed === 0, `${unattributed} knockout ties came out of the bracket without a seed`)
  check(missingAvailability === 0, `${missingAvailability} knockout legs came back with no availability recorded`)
  check(ghosts === 0, `${ghosts} knockout goals were credited to a player who was suspended or injured`)

  // Absences really were incurred IN the bracket, not just carried in — the
  // whole point of feeding the ledger tie by tie.
  const inBracket = ledger.absences().filter(a => a.incurredOn > CL_LEAGUE_MATCHDAYS)
  console.log(`
§10.5 knockout availability: ${allTies.length} ties simulated with the hook, ${ledger.absences().length} absences recorded (${inBracket.length} incurred inside the bracket)`)
  check(inBracket.length > 0, 'a whole bracket produced no injuries or suspensions at all')
  // A two-legged tie is two matchdays, so a leg-1 absence must be able to land
  // on leg 2 — check the matchday arithmetic gave every round its own slot.
  const mds = new Set(ledger.absences().map(a => a.incurredOn))
  check([...mds].every(md => md >= 1 && md <= 17), `an absence was recorded on an impossible matchday (${[...mds].join(',')})`)

  // And the one that matters most: an absence recorded in an early round is
  // still in force in a later one. Reproduce it directly — a red card on the
  // first play-off leg (matchday 9) must rule the player out of matchday 10,
  // which is leg 2 of the same tie.
  {
    const led2 = createAvailabilityLedger({ poolByClub: pools, playerClubId: 'K0', totalMatchdays: 17 })
    const man = pools.get('K1')![4]
    led2.recordMatch({
      matchday: CL_LEAGUE_MATCHDAYS + 1, homeClubId: 'K1', awayClubId: 'K2',
      events: [{ type: 'red', minute: 66, isHome: true, playerId: man.playerId, playerName: man.name }],
    })
    check(led2.unavailableFor('K1', CL_LEAGUE_MATCHDAYS + 2).has(man.playerId),
      'a red card in leg 1 did not keep the player out of leg 2')
  }
}

console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
